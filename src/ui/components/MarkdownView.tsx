import { useEffect, useRef, useState, useCallback, type ReactNode, type JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

function highlightText(text: string, commentId: string, markRefs: Map<string, HTMLElement>): ReactNode {
  return (
    <mark
      data-anchor-id={commentId}
      ref={(el) => {
        if (el) markRefs.set(commentId, el)
        else markRefs.delete(commentId)
      }}
    >
      {text}
    </mark>
  )
}

function injectHighlights(
  children: ReactNode,
  comments: ReviewComment[],
  paragraphIndex: number,
  markRefs: Map<string, HTMLElement>,
): ReactNode {
  const relevantComments = comments.filter(
    (c) => c.renderedAnchor?.paragraphIndex === paragraphIndex,
  )
  if (relevantComments.length === 0) return children

  const text = flattenText(children)
  if (!text) return children

  // Build sorted list of ranges to highlight
  const ranges = relevantComments
    .filter((c) => c.renderedAnchor!.selectedText && text.includes(c.renderedAnchor!.selectedText))
    .map((c) => ({
      id: c.id,
      start: text.indexOf(c.renderedAnchor!.selectedText),
      end: text.indexOf(c.renderedAnchor!.selectedText) + c.renderedAnchor!.selectedText.length,
    }))
    .sort((a, b) => a.start - b.start)

  if (ranges.length === 0) return children

  const parts: ReactNode[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(highlightText(text.slice(range.start, range.end), range.id, markRefs))
    cursor = range.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return <>{parts}</>
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    return flattenText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

export function MarkdownView({ filePath }: MarkdownViewProps) {
  const { comments: allComments, addRenderedComment, removeComment } = useComments()
  const comments = allComments.filter((c) => c.filePath === filePath && c.anchorType === 'rendered')
  const [content, setContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markRefs = useRef<Map<string, HTMLElement>>(new Map())
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

    // Find paragraph index from closest data-paragraph-index ancestor
    let el: Node | null = range.startContainer
    while (el && el !== container) {
      if (el instanceof HTMLElement && el.dataset.paragraphIndex !== undefined) {
        return {
          selectedText,
          context,
          paragraphIndex: parseInt(el.dataset.paragraphIndex, 10),
          startOffset: range.startOffset,
          endOffset: range.endOffset,
        }
      }
      el = el.parentNode
    }

    return { selectedText, context, paragraphIndex: 0, startOffset, endOffset }
  }, [])

  const handleTooltipClick = useCallback(() => {
    const anchor = captureAnchor()
    if (!anchor) return
    const pos = tooltipPos
    setTooltipPos(null)
    window.getSelection()?.removeAllRanges()
    if (pos) setPendingAnchor({ anchor, position: pos })
  }, [captureAnchor, tooltipPos])

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

  const makeBlockRenderer = (Tag: keyof JSX.IntrinsicElements) =>
    ({ children }: { children?: ReactNode }) => {
      const idx = paragraphIndexRef.current++
      return (
        <Tag data-paragraph-index={idx}>
          {injectHighlights(children ?? null, comments, idx, markRefs.current)}
        </Tag>
      )
    }

  return (
    <div className="rendered-markdown-view" style={{ display: 'flex', gap: 0 }}>
      <SelectionTooltip position={tooltipPos} onClick={handleTooltipClick} />
      <div className="markdown-body" ref={containerRef} style={{ flex: 1, minWidth: 0, padding: '24px' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children }) {
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
          }}
        />
        {pendingAnchor && (
          <div style={{ marginTop: '16px' }}>
            <CommentForm
              onSubmit={(body) => {
                addRenderedComment(filePath, pendingAnchor.anchor, body)
                setPendingAnchor(null)
              }}
              onCancel={() => setPendingAnchor(null)}
            />
          </div>
        )}
      </div>
      <RenderedCommentMargin
        comments={comments}
        onDelete={removeComment}
        markRefs={markRefs.current}
      />
    </div>
  )
}

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
