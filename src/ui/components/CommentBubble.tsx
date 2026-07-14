import { useState, useEffect } from 'react'
import { UserCircle, CheckCircle2, Bot, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ReviewComment } from '../../types'
import { useComments } from '../hooks/useComments'
import { timeAgo } from '../utils'

interface CommentBubbleProps {
  comment: ReviewComment
  onDelete: (id: string) => void
}

export function CommentBubble({ comment, onDelete }: CommentBubbleProps) {
  const { editComment, resolveComment, unresolveComment } = useComments()
  const [, setTick] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const isResolved = comment.status === 'resolved'

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const saveEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== comment.body) editComment(comment.id, trimmed)
    setIsEditing(false)
  }

  // Resolved comments collapse to a single greyed summary line with an Unresolve action.
  if (isResolved) {
    return (
      <div className="comment-bubble comment-resolved" id={`comment-${comment.id}`}>
        <div className="comment-resolved-summary">
          <CheckCircle2 size={14} className="comment-resolved-icon" />
          <span className="comment-resolved-label">Resolved</span>
          <span className="comment-resolved-text markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{comment.body}</ReactMarkdown>
          </span>
          <button className="comment-bubble-action" onClick={() => unresolveComment(comment.id)}>
            Unresolve
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="comment-bubble" id={`comment-${comment.id}`}>
      {comment.endLineNumber && comment.endLineNumber !== comment.lineNumber && (
        <div className="comment-line-range">
          Lines {comment.lineNumber}–{comment.endLineNumber}
        </div>
      )}
      <div className="comment-bubble-header">
        <UserCircle size={18} className="comment-bubble-avatar" />
        <span className="comment-bubble-time">{timeAgo(comment.createdAt)}</span>
        {!isEditing && (
          <div className="comment-bubble-actions">
            <button className="comment-bubble-action" onClick={() => { setDraft(comment.body); setIsEditing(true) }} title="Edit comment">
              <Pencil size={14} />
            </button>
            <button className="comment-bubble-action" onClick={() => resolveComment(comment.id)} title="Resolve conversation">
              <CheckCircle2 size={14} />
            </button>
            <button className="comment-bubble-action comment-bubble-delete" onClick={() => onDelete(comment.id)} title="Delete comment">
              &times;
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <div className="comment-edit">
          <textarea
            className="comment-edit-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            rows={3}
            autoFocus
          />
          <div className="comment-form-actions">
            <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={!draft.trim()}>Save</button>
          </div>
        </div>
      ) : (
        <div className="comment-bubble-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{comment.body}</ReactMarkdown>
        </div>
      )}
      {comment.replies?.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="comment-reply">
              <div className="comment-reply-header">
                <Bot size={16} className="comment-reply-avatar" />
                <span className="comment-bubble-time">{timeAgo(reply.createdAt)}</span>
              </div>
              <div className="comment-reply-body markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{reply.body}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
