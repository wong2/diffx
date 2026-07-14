import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ReviewComment } from '../../types'
import { CommentBubble } from './CommentBubble'

interface RenderedCommentMarginProps {
  comments: ReviewComment[]
  activeCommentId: string | null
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  ranges: Map<string, Range>
  containerRef: RefObject<HTMLDivElement | null>
  content: string | null
}

const MIN_GAP = 8
const MARGIN_WIDTH = 260
const APPROX_CARD_HEIGHT = 84

interface CardPos {
  id: string
  desiredTop: number
  top: number
}

/**
 * Positions comment cards next to their highlight ranges (Google-Docs style),
 * resolving overlaps by nudging non-active cards downward while pinning the
 * active card to its desired top.
 */
export function RenderedCommentMargin({
  comments,
  activeCommentId,
  onActivate,
  onDelete,
  ranges,
  containerRef,
  content,
}: RenderedCommentMarginProps) {
  const marginRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<CardPos[]>([])
  // Latest committed positions, so the ResizeObserver can skip redundant state
  // updates and never enter a measure -> setState -> layout -> measure loop.
  const positionsRef = useRef<CardPos[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    const margin = marginRef.current
    if (!container || !margin) return

    /** Measures each card's desired top from its range, then resolves collisions. */
    const measure = () => {
      const marginTop = margin.getBoundingClientRect().top

      const desired: CardPos[] = comments.map((c) => {
        const range = ranges.get(c.id)
        const rangeTop = range ? range.getBoundingClientRect().top - marginTop : 0
        return { id: c.id, desiredTop: Math.max(0, rangeTop), top: Math.max(0, rangeTop) }
      })

      const next = resolveCollisions(desired, activeCommentId)
      if (samePositions(next, positionsRef.current)) return
      positionsRef.current = next
      setPositions(next)
    }

    let queued = 0
    // Debounce observer callbacks to a frame so a resize triggered by our own
    // layout can't re-enter synchronously.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(queued)
      queued = requestAnimationFrame(measure)
    })
    measure()
    observer.observe(container)
    return () => {
      cancelAnimationFrame(queued)
      observer.disconnect()
    }
  }, [comments, ranges, content, activeCommentId, containerRef])

  return (
    <div
      className="comment-margin"
      ref={marginRef}
      style={{ width: comments.length > 0 ? MARGIN_WIDTH : 0, position: 'relative', flexShrink: 0 }}
    >
      {comments.map((comment, i) => {
        const pos = positions[i]
        const top = pos?.top ?? 0
        const isActive = comment.id === activeCommentId
        return (
          <div
            key={comment.id}
            className={`comment-card${isActive ? ' is-active' : ''}`}
            style={{ position: 'absolute', top, left: 8, right: 8 }}
            onClick={() => onActivate(comment.id)}
          >
            <CommentBubble comment={comment} onDelete={onDelete} />
          </div>
        )
      })}
    </div>
  )
}

/** True when two position lists have the same ids and tops (within 0.5px). */
function samePositions(a: CardPos[], b: CardPos[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.id === b[i].id && Math.abs(p.top - b[i].top) < 2)
}

/**
 * Sorts cards by document order and pushes overlapping non-active cards down by
 * MIN_GAP. The active card keeps its desired top so it aligns with its highlight.
 */
function resolveCollisions(cards: CardPos[], activeCommentId: string | null): CardPos[] {
  const sorted = cards
    .map((c, i) => ({ ...c, order: i }))
    .sort((a, b) => a.desiredTop - b.desiredTop || a.order - b.order)

  let prevBottom = -Infinity
  for (const card of sorted) {
    if (card.id === activeCommentId) {
      card.top = card.desiredTop
    } else {
      card.top = Math.max(card.desiredTop, prevBottom + MIN_GAP)
    }
    prevBottom = card.top + APPROX_CARD_HEIGHT
  }

  // Restore original (document) order for stable rendering against `comments`.
  return sorted.sort((a, b) => a.order - b.order).map(({ order: _order, ...rest }) => rest)
}
