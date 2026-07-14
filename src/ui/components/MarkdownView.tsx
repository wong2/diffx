import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode, type JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// Stable module-level identity so react-markdown never re-parses on re-render.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks]
import type { ReviewComment, RenderedAnchor } from '../../types'
import { useComments } from '../hooks/useComments'
import { MermaidBlock } from './MermaidBlock'
import { SelectionTooltip } from './SelectionTooltip'
import { RenderedCommentMargin } from './RenderedCommentMargin'
import { CommentForm } from './CommentForm'

interface MarkdownViewProps {
  filePath: string
}

interface PendingAnchor {
  anchor: RenderedAnchor
  position: { x: number; y: number }
}

const HIGHLIGHT_NAME = 'comment'
const HIGHLIGHT_ACTIVE_NAME = 'comment-active'

/** True when the browser supports the CSS Custom Highlight API (Safari 17.2+/Chrome 105+). */
function supportsHighlightApi(): boolean {
  return typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && !!CSS.highlights
}

export function MarkdownView({ filePath }: MarkdownViewProps) {
  const { comments: allComments, addRenderedComment, removeComment } = useComments()
  const comments = allComments.filter((c) => c.filePath === filePath && c.anchorType === 'rendered')
  const [content, setContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Range per comment id, recomputed whenever comments/content change. Drives both
  // the painted highlights and the margin-card vertical positions.
  const rangesRef = useRef<Map<string, Range>>(new Map())
  const paragraphIndexRef = useRef(0)

  useEffect(() => {
    setContent(null)
    setLoadError(null)
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.text()
      })
      .then(setContent)
      .catch((err) => setLoadError(err.message))
  }, [filePath])

  // Paint comment highlights as a decoration layer (zero DOM mutation) via the
  // CSS Custom Highlight API. Recompute when comments, content, or the active
  // comment change. The active range is promoted into the 'comment-active' group.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !content) return
    if (!supportsHighlightApi()) return

    const ranges = buildCommentRanges(container, comments)
    rangesRef.current = ranges

    const nonActive: Range[] = []
    let activeRange: Range | null = null
    for (const [id, range] of ranges) {
      if (id === activeCommentId) activeRange = range
      else nonActive.push(range)
    }

    if (nonActive.length > 0) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...nonActive))
    } else {
      CSS.highlights.delete(HIGHLIGHT_NAME)
    }
    if (activeRange) {
      CSS.highlights.set(HIGHLIGHT_ACTIVE_NAME, new Highlight(activeRange))
    } else {
      CSS.highlights.delete(HIGHLIGHT_ACTIVE_NAME)
    }

    return () => {
      CSS.highlights.delete(HIGHLIGHT_NAME)
      CSS.highlights.delete(HIGHLIGHT_ACTIVE_NAME)
    }
  }, [comments, content, activeCommentId])

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setTooltipPos(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      setTooltipPos(null)
      return
    }
    const rect = range.getBoundingClientRect()
    setTooltipPos({ x: rect.right + 8, y: rect.top - 4 })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [handleSelectionChange])

  const captureAnchor = useCallback((): RenderedAnchor | null => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    if (!containerRef.current?.contains(range.commonAncestorContainer)) return null

    const selectedText = sel.toString()
    if (!selectedText) return null

    const container = containerRef.current
    const fullText = container.textContent ?? ''
    const startOffset = getTextOffset(container, range.startContainer, range.startOffset)
    const endOffset = startOffset + selectedText.length
    const contextStart = Math.max(0, startOffset - 50)
    const contextEnd = Math.min(fullText.length, endOffset + 50)
    const context = fullText.slice(contextStart, contextEnd)
    // Raw-file line the selection maps to, so the diff view can show it too.
    const sourceLine = content ? sourceLineOf(content, selectedText) : undefined

    // Find paragraph index from closest data-paragraph-index ancestor
    let el: Node | null = range.startContainer
    while (el && el !== container) {
      if (el instanceof HTMLElement && el.dataset.paragraphIndex !== undefined) {
        return {
          selectedText,
          context,
          sourceLine,
          paragraphIndex: parseInt(el.dataset.paragraphIndex, 10),
          startOffset: range.startOffset,
          endOffset: range.endOffset,
        }
      }
      el = el.parentNode
    }

    return { selectedText, context, sourceLine, paragraphIndex: 0, startOffset, endOffset }
  }, [content])

  const handleTooltipClick = useCallback(() => {
    const anchor = captureAnchor()
    if (!anchor) return
    const pos = tooltipPos
    setTooltipPos(null)
    window.getSelection()?.removeAllRanges()
    if (pos) setPendingAnchor({ anchor, position: pos })
  }, [captureAnchor, tooltipPos])

  // Hit-test a click against the painted (node-less) highlight ranges. If the
  // click lands inside a comment's range, activate it; otherwise clear.
  const handleBodyClick = useCallback((e: React.MouseEvent) => {
    const point = caretPointFromClick(e.clientX, e.clientY)
    if (!point) {
      setActiveCommentId(null)
      return
    }
    for (const [id, range] of rangesRef.current) {
      if (isPointInRange(range, point.node, point.offset)) {
        setActiveCommentId(id)
        return
      }
    }
    setActiveCommentId(null)
  }, [])

  // Clicking a margin card activates its highlight and scrolls it into view.
  const handleCardActivate = useCallback((id: string) => {
    setActiveCommentId(id)
    const range = rangesRef.current.get(id)
    if (range) {
      const rect = range.getBoundingClientRect()
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: 'smooth' })
      }
    }
  }, [])

  // Stable component map: identities never change across renders, so react-markdown
  // keeps the same element types and never remounts embedded blocks (e.g. MermaidBlock)
  // when comments/highlight state change. Renderers only touch the stable ref/import.
  const markdownComponents = useMemo(() => {
    const makeBlockRenderer = (Tag: keyof JSX.IntrinsicElements) =>
      ({ children }: { children?: ReactNode }) => {
        const idx = paragraphIndexRef.current++
        return <Tag data-paragraph-index={idx}>{children}</Tag>
      }
    return {
      code({ className, children }: { className?: string; children?: ReactNode }) {
        const lang = /language-(\w+)/.exec(className ?? '')?.[1]
        if (lang === 'mermaid') {
          return <MermaidBlock code={String(children).replace(/\n$/, '')} />
        }
        return <code className={className}>{children}</code>
      },
      p: makeBlockRenderer('p'),
      h1: makeBlockRenderer('h1'),
      h2: makeBlockRenderer('h2'),
      h3: makeBlockRenderer('h3'),
      h4: makeBlockRenderer('h4'),
      h5: makeBlockRenderer('h5'),
      h6: makeBlockRenderer('h6'),
    }
  }, [])

  if (loadError) {
    return (
      <div className="rendered-markdown-view">
        <div className="error" style={{ padding: '24px' }}>
          Could not load file: {loadError}
        </div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="rendered-markdown-view">
        <div className="loading" style={{ padding: '24px' }}>Loading…</div>
      </div>
    )
  }

  paragraphIndexRef.current = 0

  return (
    <div className="rendered-markdown-view" style={{ display: 'flex', gap: 0 }}>
      <SelectionTooltip position={tooltipPos} onClick={handleTooltipClick} />
      {pendingAnchor && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(pendingAnchor.position.x, window.innerWidth - 360),
            top: pendingAnchor.position.y + 8,
            width: 340,
            zIndex: 1000,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            borderRadius: 8,
          }}
        >
          <CommentForm
            onSubmit={(body) => {
              addRenderedComment(filePath, pendingAnchor.anchor, body)
              setPendingAnchor(null)
            }}
            onCancel={() => setPendingAnchor(null)}
          />
        </div>
      )}
      <div
        className="markdown-body"
        ref={containerRef}
        style={{ flex: 1, minWidth: 0, padding: '24px' }}
        onClick={handleBodyClick}
      >
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
      <RenderedCommentMargin
        comments={comments}
        activeCommentId={activeCommentId}
        onActivate={handleCardActivate}
        onDelete={removeComment}
        ranges={rangesRef.current}
        containerRef={containerRef}
        content={content}
      />
    </div>
  )
}

/** 1-based line in the raw markdown where the selection's first line appears,
 * or undefined when it can't be located (e.g. formatting split the text). */
function sourceLineOf(content: string, selectedText: string): number | undefined {
  const needle = selectedText.split('\n')[0].trim()
  if (!needle) return undefined
  const idx = content.indexOf(needle)
  if (idx < 0) return undefined
  return content.slice(0, idx).split('\n').length
}

/** Absolute character offset of (target, offset) within root's text content. */
function getTextOffset(root: Node, target: Node, offset: number): number {
  let pos = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node === target) return pos + offset
    pos += (node.textContent ?? '').length
  }
  return pos + offset
}

/** Maps an absolute character offset within root to a (text node, local offset) pair. */
function nodeAtOffset(root: Node, offset: number): { node: Text; offset: number } | null {
  let pos = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const len = node.textContent?.length ?? 0
    if (offset <= pos + len) return { node, offset: offset - pos }
    pos += len
  }
  return null
}

/** Collapses whitespace runs to single spaces, keeping a map from each
 * normalized index back to its source-string index. */
function collapseWhitespace(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let inWs = false
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (!inWs) {
        norm += ' '
        map.push(i)
        inWs = true
      }
    } else {
      norm += text[i]
      map.push(i)
      inWs = false
    }
  }
  return { norm, map }
}

/** Locates a comment's selectedText in the container, returning [start, end]
 * source offsets. Falls back to whitespace-insensitive matching because a
 * selection spanning multiple blocks carries newlines that textContent lacks. */
function locateSelectedText(fullText: string, selectedText: string): [number, number] | null {
  const exact = fullText.indexOf(selectedText)
  if (exact >= 0) return [exact, exact + selectedText.length]

  const { norm, map } = collapseWhitespace(fullText)
  const needle = selectedText.replace(/\s+/g, ' ').trim()
  if (!needle) return null
  const ni = norm.indexOf(needle)
  if (ni < 0) return null
  const start = map[ni]
  const end = map[Math.min(ni + needle.length - 1, map.length - 1)] + 1
  return [start, end]
}

/** Builds a DOM Range spanning a comment's selectedText, located by character offset. */
function rangeForComment(container: HTMLElement, comment: ReviewComment): Range | null {
  const selectedText = comment.renderedAnchor?.selectedText
  if (!selectedText) return null
  const located = locateSelectedText(container.textContent ?? '', selectedText)
  if (!located) return null
  const startPoint = nodeAtOffset(container, located[0])
  const endPoint = nodeAtOffset(container, located[1])
  if (!startPoint || !endPoint) return null
  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

/** Computes a Range for every comment that resolves against the rendered text. */
function buildCommentRanges(container: HTMLElement, comments: ReviewComment[]): Map<string, Range> {
  const ranges = new Map<string, Range>()
  for (const comment of comments) {
    const range = rangeForComment(container, comment)
    if (range) ranges.set(comment.id, range)
  }
  return ranges
}

/** Resolves a viewport click point to a (text node, offset) caret position. */
function caretPointFromClick(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y)
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  return null
}

/** True when the caret (node, offset) falls within range's boundary points. comparePoint returns 0 only when the point is inside the range. */
function isPointInRange(range: Range, node: Node, offset: number): boolean {
  try {
    return range.comparePoint(node, offset) === 0
  } catch {
    return false
  }
}
