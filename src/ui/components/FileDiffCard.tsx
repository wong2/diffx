import { useState, memo } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import type { DiffLineAnnotation, FileDiffMetadata, AnnotationSide } from '@pierre/diffs'
import type { ReviewComment } from '../../types'
import { CommentForm } from './CommentForm'
import { CommentBubble } from './CommentBubble'
import { MarkdownView } from './MarkdownView'

interface PendingComment {
  side: AnnotationSide
  lineNumber: number
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
  onAddComment: (filePath: string, side: AnnotationSide, lineNumber: number, lineContent: string, body: string) => void
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
  const isMd = filePath.endsWith('.md')
  const [viewMode, setViewMode] = useState<'diff' | 'rendered'>('diff')

  const getLineContent = (side: AnnotationSide, lineNumber: number): string => {
    const lines = side === 'additions' ? fileDiff.additionLines : fileDiff.deletionLines
    // Full (non-partial) diffs carry the entire file, so any line — including
    // expanded context outside hunks — can be addressed directly.
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

  const allAnnotations: DiffLineAnnotation<ReviewComment | { _pending: true }>[] = [
    ...annotations,
    ...(pending
      ? [
          {
            side: pending.side,
            lineNumber: pending.lineNumber,
            metadata: { _pending: true as const },
          },
        ]
      : []),
  ]

  return (
    <div className={`file-diff-card ${viewed ? 'file-diff-viewed' : ''}`} id={id}>
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
                      const lineContent = getLineContent(pending!.side, pending!.lineNumber)
                      onAddComment(filePath, pending!.side, pending!.lineNumber, lineContent, body)
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
            renderGutterUtility={(getHoveredLine) => (
              <button
                className="gutter-add-btn"
                onClick={() => {
                  const line = getHoveredLine()
                  if (line) {
                    setPending({ side: line.side, lineNumber: line.lineNumber })
                  }
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
