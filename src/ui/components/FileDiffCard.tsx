import { useState, useEffect, useRef, memo } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import type { DiffLineAnnotation, FileDiffMetadata, AnnotationSide } from '@pierre/diffs'
import type { GetHoveredLineResult, SelectedLineRange } from '@pierre/diffs'
import type { ReviewComment } from '../../types'
import { CommentForm } from './CommentForm'
import { CommentBubble } from './CommentBubble'
import { MarkdownView } from './MarkdownView'

interface PendingComment {
  side: AnnotationSide
  lineNumber: number
  endLineNumber: number
}

/** Finds the diff library's <diffs-container> shadow root within a card. */
function diffShadowRoot(card: HTMLElement | null): ShadowRoot | null {
  const host = card?.querySelector('diffs-container') as HTMLElement | null
  return host?.shadowRoot ?? null
}

/** The line number whose row contains viewport-Y, in the given side's gutter
 * column. Used to track a "+"-button drag, since the library suppresses its
 * onLineEnter callback while a mouse button is held. */
function lineNumberAtY(root: ShadowRoot, clientY: number, side: AnnotationSide): number | null {
  const columns = [...root.querySelectorAll('code')]
  const column = columns.find((c) => c.hasAttribute(`data-${side}`)) ?? columns[0]
  if (!column) return null
  let best: Element | null = null
  for (const cell of column.querySelectorAll('[data-column-number]')) {
    const rect = cell.getBoundingClientRect()
    if (rect.height === 0) continue
    if (clientY >= rect.top && clientY <= rect.bottom) {
      best = cell
      break
    }
    if (clientY > rect.bottom) best = cell // cursor past the last visible row
  }
  const n = best ? parseInt(best.getAttribute('data-column-number') ?? '', 10) : NaN
  return Number.isNaN(n) ? null : n
}

/** Orders a raw selection so start <= end and resolves it to a single side. */
function normalizeRange(range: SelectedLineRange): PendingComment {
  const side = (range.side ?? range.endSide ?? 'additions') as AnnotationSide
  const lineNumber = Math.min(range.start, range.end)
  const endLineNumber = Math.max(range.start, range.end)
  return { side, lineNumber, endLineNumber }
}

interface FileDiffCardProps {
  id?: string
  fileDiff: FileDiffMetadata
  filePath: string
  theme: 'light' | 'dark'
  annotations: DiffLineAnnotation<ReviewComment>[]
  diffStyle: 'split' | 'unified'
  tabSize: number
  softWrap: boolean
  viewed: boolean
  onViewedChange: (filePath: string, viewed: boolean) => void
  onAddComment: (filePath: string, side: AnnotationSide, lineNumber: number, lineContent: string, body: string, endLineNumber?: number, lineContents?: string[]) => void
  onDeleteComment: (id: string) => void
}

export const FileDiffCard = memo(function FileDiffCard({
  id,
  fileDiff,
  filePath,
  theme,
  annotations,
  diffStyle,
  tabSize,
  softWrap,
  viewed,
  onViewedChange,
  onAddComment,
  onDeleteComment,
}: FileDiffCardProps) {
  const [pending, setPending] = useState<PendingComment | null>(null)
  // One-shot flag: request the library clear its native selection after the
  // composer closes, without re-clearing on unrelated re-renders (which would
  // otherwise interrupt an in-progress drag when comments refetch).
  const [clearSelection, setClearSelection] = useState(false)
  // Active drag started by pressing and holding the gutter "+" button. Tracks
  // the hovered end line so the highlight follows the cursor across lines.
  const [dragRange, setDragRange] = useState<{ start: number; end: number; side: AnnotationSide } | null>(null)
  // Card-relative position of the gutter "+" button when the drag started.
  // Used to render a ghost button that stays pinned to the start line.
  const [dragStartBtnPos, setDragStartBtnPos] = useState<{ top: number; left: number } | null>(null)
  const isMd = filePath.endsWith('.md')
  const [viewMode, setViewMode] = useState<'diff' | 'rendered'>('diff')
  // Line currently under the cursor, updated by the library's onLineEnter. This
  // stays accurate during a button-held drag (getHoveredLine does not).
  const hoveredLineRef = useRef<{ lineNumber: number; side: AnnotationSide } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (clearSelection) setClearSelection(false)
  }, [clearSelection])

  // Press-and-hold the gutter "+" to drag across lines. Listeners are attached
  // synchronously here (not in an effect) so a fast click never races the
  // pointerup, and the composer opens only on release with the covered range.
  const startPlusDrag = (startLine: number, side: AnnotationSide, btnEl: HTMLElement) => {
    let endLine = startLine
    // The button lives in the library's shadow DOM, so onPointerDown passes it
    // to us directly rather than us querying for it. Anchor the ghost at the
    // button center (it renders with transform: translate(-50%, -50%)).
    const card = cardRef.current
    if (card) {
      const cardRect = card.getBoundingClientRect()
      const btnRect = btnEl.getBoundingClientRect()
      setDragStartBtnPos({
        top: btnRect.top + btnRect.height / 2 - cardRect.top,
        left: btnRect.left + btnRect.width / 2 - cardRect.left,
      })
    }
    setDragRange({ start: startLine, end: startLine, side })
    const onMove = (e: PointerEvent) => {
      const root = diffShadowRoot(cardRef.current)
      const ln = root ? lineNumberAtY(root, e.clientY, side) : null
      if (ln != null && ln !== endLine) {
        endLine = ln
        setDragRange({ start: startLine, end: ln, side }) // live range highlight
      }
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setDragRange(null)
      setDragStartBtnPos(null)
      setPending(normalizeRange({ start: startLine, end: endLine, side, endSide: side }))
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const closeComposer = () => {
    setPending(null)
    setClearSelection(true)
  }

  // The library only applies `selectedLines` when it is not `undefined`. Drag
  // selection is left fully native (undefined) so it stays smooth; we only pass
  // the range to keep it highlighted while composing, or null once to clear.
  const pendingRange: SelectedLineRange | null = pending
    ? { start: pending.lineNumber, end: pending.endLineNumber, side: pending.side, endSide: pending.side }
    : null
  const dragSelectedLines: SelectedLineRange | null = dragRange
    ? { start: dragRange.start, end: dragRange.end, side: dragRange.side, endSide: dragRange.side }
    : null
  const selectedLines: SelectedLineRange | null | undefined = pending
    ? pendingRange
    : dragRange
    ? dragSelectedLines
    : clearSelection
    ? null
    : undefined

  const getLineContent = (side: AnnotationSide, lineNumber: number): string => {
    const lines = side === 'additions' ? fileDiff.additionLines : fileDiff.deletionLines
    if (!fileDiff.isPartial) {
      return lines[lineNumber - 1] ?? ''
    }
    const startKey = side === 'additions' ? 'additionStart' : 'deletionStart'
    const countKey = side === 'additions' ? 'additionCount' : 'deletionCount'
    const indexKey = side === 'additions' ? 'additionLineIndex' : 'deletionLineIndex'
    for (const hunk of fileDiff.hunks) {
      const start = hunk[startKey]
      const count = hunk[countKey]
      if (lineNumber >= start && lineNumber < start + count) {
        const index = hunk[indexKey] + (lineNumber - start)
        return lines[index] ?? ''
      }
    }
    return ''
  }

  const getLineContents = (side: AnnotationSide, startLine: number, endLine: number): string[] => {
    const result: string[] = []
    for (let ln = startLine; ln <= endLine; ln++) {
      result.push(getLineContent(side, ln))
    }
    return result
  }

  const allAnnotations: DiffLineAnnotation<ReviewComment | { _pending: true }>[] = [
    ...annotations,
    ...(pending
      ? [
          {
            side: pending.side,
            lineNumber: pending.endLineNumber,
            metadata: { _pending: true as const },
          },
        ]
      : []),
  ]

  return (
    <div ref={cardRef} className={`file-diff-card ${viewed ? 'file-diff-viewed' : ''}`} id={id}>
      {dragStartBtnPos && (
        <button
          className="gutter-add-btn gutter-add-btn-ghost"
          style={{
            position: 'absolute',
            top: dragStartBtnPos.top,
            left: dragStartBtnPos.left,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
          tabIndex={-1}
        >
          +
        </button>
      )}
      {viewed ? (
        <div className="file-diff-viewed-header">
          <span className="file-diff-viewed-name">{filePath}</span>
          <label className="viewed-label viewed-checked" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={viewed}
              onChange={(e) => onViewedChange(filePath, e.target.checked)}
            />
            Viewed
          </label>
        </div>
      ) : (
        <>
          {isMd && viewMode === 'rendered' ? (
            <>
              <div className="rendered-mode-header" onClick={(e) => e.stopPropagation()}>
                <div className="toolbar-toggle">
                  <button
                    className="btn btn-sm"
                    onClick={() => setViewMode('diff')}
                  >
                    Diff
                  </button>
                  <button
                    className="btn btn-sm btn-active"
                    onClick={() => setViewMode('rendered')}
                  >
                    Rendered
                  </button>
                </div>
                <label className="viewed-label">
                  <input
                    type="checkbox"
                    checked={viewed}
                    onChange={(e) => onViewedChange(filePath, e.target.checked)}
                  />
                  Viewed
                </label>
              </div>
              <MarkdownView filePath={filePath} />
            </>
          ) : (
          <FileDiff<ReviewComment | { _pending: true }>
            fileDiff={fileDiff}
            options={{
              diffStyle,
              stickyHeader: true,
              expansionLineCount: 20,
              enableGutterUtility: true,
              // Selection is enabled only to paint the range highlight. We do
              // NOT wire onLineSelected — it opened the composer on press and
              // fought the "+"-drag. Commenting is driven entirely by the gutter
              // "+" (press, drag, release) below.
              enableLineSelection: true,
              onLineEnter: (props) => {
                hoveredLineRef.current = { lineNumber: props.lineNumber, side: props.annotationSide }
              },
              theme: { dark: 'github-dark', light: 'github-light' },
              themeType: theme,
              overflow: softWrap ? 'wrap' : 'scroll',
              unsafeCSS: `:host { --diffs-tab-size: ${tabSize}; --diffs-selection-override: rgba(56, 139, 253, 0.55); }`,
            }}
            selectedLines={selectedLines}
            lineAnnotations={allAnnotations}
            renderHeaderMetadata={() => (
              <>
                {isMd && (
                  <div className="toolbar-toggle" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`btn btn-sm${viewMode === 'diff' ? ' btn-active' : ''}`}
                      onClick={() => setViewMode('diff')}
                    >
                      Diff
                    </button>
                    <button
                      className={`btn btn-sm${viewMode === 'rendered' ? ' btn-active' : ''}`}
                      onClick={() => setViewMode('rendered')}
                    >
                      Rendered
                    </button>
                  </div>
                )}
                <label className="viewed-label" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={viewed}
                    onChange={(e) => onViewedChange(filePath, e.target.checked)}
                  />
                  Viewed
                </label>
              </>
            )}
            renderAnnotation={(annotation) => {
              if ('_pending' in annotation.metadata) {
                const p = pending!
                const prefix = p.side === 'additions' ? 'R' : 'L'
                const header =
                  p.lineNumber === p.endLineNumber
                    ? `Add a comment on line ${prefix}${p.lineNumber}`
                    : `Add a comment on lines ${prefix}${p.lineNumber} to ${prefix}${p.endLineNumber}`
                return (
                  <CommentForm
                    header={header}
                    onSubmit={(body) => {
                      const contents = getLineContents(p.side, p.lineNumber, p.endLineNumber)
                      const isRange = p.endLineNumber !== p.lineNumber
                      onAddComment(filePath, p.side, p.lineNumber, contents[0], body, isRange ? p.endLineNumber : undefined, isRange ? contents : undefined)
                      closeComposer()
                    }}
                    onCancel={closeComposer}
                  />
                )
              }
              return (
                <CommentBubble
                  comment={annotation.metadata as ReviewComment}
                  onDelete={onDeleteComment}
                />
              )
            }}
            renderGutterUtility={(getHoveredLine) => (
              <button
                className="gutter-add-btn"
                onPointerDown={(e) => {
                  const line = hoveredLineRef.current ?? getHoveredLine()
                  if (!line) return
                  // Stop the press from reaching the library's native line
                  // selection (which would open the composer immediately).
                  e.preventDefault()
                  e.stopPropagation()
                  startPlusDrag(line.lineNumber, line.side, e.currentTarget)
                }}
              >
                +
              </button>
            )}
          />
          )}
        </>
      )}
    </div>
  )
})
