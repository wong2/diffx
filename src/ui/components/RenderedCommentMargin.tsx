import { useLayoutEffect, useRef, useState } from 'react'
import type { ReviewComment } from '../../types'
import { CommentBubble } from './CommentBubble'

interface RenderedCommentMarginProps {
  comments: ReviewComment[]
  onDelete: (id: string) => void
  markRefs: Map<string, HTMLElement>
}

const MIN_GAP = 8
const MARGIN_WIDTH = 240

interface BubblePos {
  id: string
  top: number
  markTop: number
}

export function RenderedCommentMargin({ comments, onDelete, markRefs }: RenderedCommentMarginProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<BubblePos[]>([])

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()

    const raw: BubblePos[] = comments.map((c) => {
      const markEl = c.renderedAnchor ? markRefs.get(c.id) : undefined
      const markTop = markEl
        ? markEl.getBoundingClientRect().top - containerRect.top
        : 0
      return { id: c.id, top: markTop, markTop }
    })

    // Stack bubbles with minimum gap
    const approxBubbleHeight = 80
    const stacked = raw.slice()
    for (let i = 1; i < stacked.length; i++) {
      const prev = stacked[i - 1]
      const minTop = prev.top + approxBubbleHeight + MIN_GAP
      if (stacked[i].top < minTop) {
        stacked[i] = { ...stacked[i], top: minTop }
      }
    }

    setPositions(stacked)
  }, [comments, markRefs])

  const height = containerRef.current?.scrollHeight ?? 0

  return (
    <div className="comment-margin" ref={containerRef} style={{ width: MARGIN_WIDTH, position: 'relative', flexShrink: 0 }}>
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height, pointerEvents: 'none', overflow: 'visible' }}
      >
        {positions.map((pos) => (
          <line
            key={pos.id}
            x1={0}
            y1={pos.markTop + 8}
            x2={0}
            y2={pos.top + 16}
            stroke="var(--comment-border)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}
      </svg>
      {comments.map((comment, i) => {
        const pos = positions[i]
        const top = pos?.top ?? 0
        return (
          <div key={comment.id} style={{ position: 'absolute', top, left: 8, right: 0 }}>
            <CommentBubble comment={comment} onDelete={onDelete} />
          </div>
        )
      })}
    </div>
  )
}
