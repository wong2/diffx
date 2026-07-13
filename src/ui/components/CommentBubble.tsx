import { useState, useEffect } from 'react'
import { UserCircle, CheckCircle2, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ReviewComment } from '../../types'
import { timeAgo } from '../utils'

interface CommentBubbleProps {
  comment: ReviewComment
  onDelete: (id: string) => void
}

export function CommentBubble({ comment, onDelete }: CommentBubbleProps) {
  const [, setTick] = useState(0)
  const isResolved = comment.status === 'resolved'

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={`comment-bubble ${isResolved ? 'comment-resolved' : ''}`} id={`comment-${comment.id}`}>
      {comment.endLineNumber && comment.endLineNumber !== comment.lineNumber && (
        <div className="comment-line-range">
          Lines {comment.lineNumber}–{comment.endLineNumber}
        </div>
      )}
      <div className="comment-bubble-header">
        <UserCircle size={18} className="comment-bubble-avatar" />
        <span className="comment-bubble-time">{timeAgo(comment.createdAt)}</span>
        {isResolved && (
          <span className="comment-bubble-resolved">
            <CheckCircle2 size={14} />
            Resolved
          </span>
        )}
        {!isResolved && (
          <button
            className="comment-bubble-delete"
            onClick={() => onDelete(comment.id)}
            title="Delete comment"
          >
            &times;
          </button>
        )}
      </div>
      <div className="comment-bubble-body markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{comment.body}</ReactMarkdown>
      </div>
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
