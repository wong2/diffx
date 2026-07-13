import { useState, useEffect, useRef, memo } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import type { DiffLineAnnotation, FileDiffMetadata, AnnotationSide } from '@pierre/diffs'
import type { GetHoveredLineResult } from '@pierre/diffs'
import type { ReviewComment } from '../../types'
import { CommentForm } from './CommentForm'
import { CommentBubble } from './CommentBubble'
import { MarkdownView } from './MarkdownView'

interface PendingComment {
  side: AnnotationSide
  lineNumber: number
  endLineNumber: number
}

interface DragState {
  startLine: number
  startSide: AnnotationSide
  currentLine: number
  mouseX: number
  mouseY: number
}

interface FileDiffCardProps {
  id?: string
  fileDiff: FileDiffMetadata
  filePath: string
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
  const [dragState, setDragState] = useState<DragState | null>(null)
  const isMd = filePath.endsWith('.md')
  const [viewMode, setViewMode] = useState<'diff' | 'rendered'>('diff')
  const getHoveredLineRef = useRef<(() => GetHoveredLineResult<'diff'> | undefined) | null>(null)

  useEffect(() => {
    if (!dragState) return
    const onMove = (e: MouseEvent) => {
      const hov = getHoveredLineRef.current?.()
      setDragState((prev) => {
        if (!prev) return null
        return {
          ...prev,
          currentLine: hov ? Math.max(hov.lineNumber, prev.startLine) : prev.currentLine,
          mouseX: e.clientX,
          mouseY: e.clientY,
        }
      })
    }
    const onUp = () => {
      setPending({ side: dragState.startSide, lineNumber: dragState.startLine, endLineNumber: dragState.currentLine })
      setDragState(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragState?.startLine, dragState?.startSide])

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
    <div className={`file-diff-card ${viewed ? 'file-diff-viewed' : ''}`} id={id}>
      {dragState && (
        <div
          className="drag-range-pill"
          style={{ position: 'fixed', left: dragState.mouseX + 16, top: dragState.mouseY - 14, pointerEvents: 'none', zIndex: 9999 }}
        >
          {dragState.startLine === dragState.currentLine
            ? `Line ${dragState.startLine}`
            : `Lines ${dragState.startLine}–${dragState.currentLine}`}
        </div>
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
              theme: { dark: 'github-dark', light: 'github-light' },
              themeType: 'system',
              overflow: softWrap ? 'wrap' : 'scroll',
              unsafeCSS: `:host { --diffs-tab-size: ${tabSize}; }`,
            }}
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
                return (
                  <CommentForm
                    onSubmit={(body) => {
                      const startLine = pending!.lineNumber
                      const endLine = pending!.endLineNumber
                      const contents = getLineContents(pending!.side, startLine, endLine)
                      onAddComment(filePath, pending!.side, startLine, contents[0], body, endLine !== startLine ? endLine : undefined, endLine !== startLine ? contents : undefined)
                      setPending(null)
                    }}
                    onCancel={() => setPending(null)}
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
            renderGutterUtility={(getHoveredLine) => {
              getHoveredLineRef.current = getHoveredLine
              return (
                <button
                  className="gutter-add-btn"
                  onMouseDown={(e) => {
                    const line = getHoveredLine()
                    if (!line) return
                    e.preventDefault()
                    setDragState({
                      startLine: line.lineNumber,
                      startSide: line.side,
                      currentLine: line.lineNumber,
                      mouseX: e.clientX,
                      mouseY: e.clientY,
                    })
                  }}
                >
                  +
                </button>
              )
            }}
          />
          )}
        </>
      )}
    </div>
  )
})
