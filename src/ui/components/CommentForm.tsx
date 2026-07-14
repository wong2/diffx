import { useState, useRef, useEffect } from 'react'

interface CommentFormProps {
  onSubmit: (body: string) => void
  onCancel: () => void
  header?: string
}

export function CommentForm({ onSubmit, onCancel, header }: CommentFormProps) {
  const [body, setBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  /** Grows the textarea to fit its content, GitHub-style, up to the CSS max-height. */
  const autoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleSubmit = () => {
    const trimmed = body.trim()
    if (trimmed) {
      onSubmit(trimmed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="comment-form">
      {header && <div className="comment-form-header">{header}</div>}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => { setBody(e.target.value); autoGrow() }}
        onKeyDown={handleKeyDown}
        placeholder="Leave a review comment..."
        rows={3}
      />
      <div className="comment-form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!body.trim()}>
          Comment
        </button>
      </div>
    </div>
  )
}
