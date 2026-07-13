import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DiffLineAnnotation } from '@pierre/diffs'
import type { ReviewComment, RenderedAnchor } from '../../types'

const COMMENTS_KEY = ['comments']

async function fetchComments(): Promise<ReviewComment[]> {
  const res = await fetch('/api/comments')
  return res.json()
}

export function useComments() {
  const queryClient = useQueryClient()
  const { data: comments = [] } = useQuery({ queryKey: COMMENTS_KEY, queryFn: fetchComments, refetchInterval: 3000 })

  const addMutation = useMutation({
    mutationFn: async (params: { filePath: string; anchorType: 'line' | 'rendered'; side?: 'deletions' | 'additions'; lineNumber?: number; endLineNumber?: number; lineContent?: string; lineContents?: string[]; renderedAnchor?: RenderedAnchor; body: string }) => {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      return res.json() as Promise<ReviewComment>
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<ReviewComment[]>(COMMENTS_KEY, (prev = []) => [...prev, comment])
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/comments/${id}`, { method: 'DELETE' })
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<ReviewComment[]>(COMMENTS_KEY, (prev = []) => prev.filter((c) => c.id !== id))
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, body, status }: { id: string; body?: string; status?: ReviewComment['status'] }) => {
      const res = await fetch(`/api/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, status }),
      })
      return res.json() as Promise<ReviewComment>
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ReviewComment[]>(COMMENTS_KEY, (prev = []) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      )
    },
  })

  const addComment = useCallback(
    (filePath: string, side: 'deletions' | 'additions', lineNumber: number, lineContent: string, body: string, endLineNumber?: number, lineContents?: string[]) => {
      addMutation.mutate({ filePath, anchorType: 'line', side, lineNumber, endLineNumber, lineContent, lineContents, body })
    },
    [addMutation],
  )

  const addRenderedComment = useCallback(
    (filePath: string, anchor: RenderedAnchor, body: string) => {
      addMutation.mutate({ filePath, anchorType: 'rendered', renderedAnchor: anchor, body })
    },
    [addMutation],
  )

  const removeComment = useCallback(
    (id: string) => {
      removeMutation.mutate(id)
    },
    [removeMutation],
  )

  const editComment = useCallback(
    (id: string, body: string) => {
      editMutation.mutate({ id, body })
    },
    [editMutation],
  )

  const resolveComment = useCallback(
    (id: string) => {
      editMutation.mutate({ id, status: 'resolved' })
    },
    [editMutation],
  )

  const formatAllComments = useCallback((): string => {
    if (comments.length === 0) return ''

    function escapeXmlAttr(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    const grouped = new Map<string, ReviewComment[]>()
    for (const comment of comments) {
      const list = grouped.get(comment.filePath) ?? []
      list.push(comment)
      grouped.set(comment.filePath, list)
    }

    const lines: string[] = ['<code-review-comments>']
    for (const [filePath, fileComments] of grouped) {
      lines.push(`<file path="${filePath}">`)
      for (const comment of fileComments) {
        if (comment.anchorType === 'rendered' && comment.renderedAnchor) {
          lines.push(`<comment anchor="${escapeXmlAttr(comment.renderedAnchor.selectedText)}" context="${escapeXmlAttr(comment.renderedAnchor.context)}">`)
          lines.push(comment.body)
          lines.push('</comment>')
        } else {
          const isRange = comment.endLineNumber && comment.endLineNumber !== comment.lineNumber
          const lineAttr = isRange ? `lines="${comment.lineNumber}-${comment.endLineNumber}"` : `line="${comment.lineNumber!}"`
          lines.push(`<comment ${lineAttr}>`)
          const prefix = comment.side === 'additions' ? '+' : '-'
          if (isRange && comment.lineContents) {
            lines.push(`<code>${comment.lineContents.map(l => `${prefix} ${l}`).join('\n')}</code>`)
          } else {
            lines.push(`<code>${prefix} ${comment.lineContent}</code>`)
          }
          lines.push(comment.body)
          lines.push('</comment>')
        }
      }
      lines.push('</file>')
    }
    lines.push('</code-review-comments>')

    return lines.join('\n')
  }, [comments])

  const getAnnotationsForFile = useCallback(
    (filePath: string): DiffLineAnnotation<ReviewComment>[] => {
      return comments
        .filter((c) => c.filePath === filePath && c.anchorType !== 'rendered')
        .map((c) => ({
          side: c.side!,
          lineNumber: c.endLineNumber ?? c.lineNumber!,
          metadata: c,
        }))
    },
    [comments],
  )

  const copyAllComments = useCallback(async () => {
    const text = formatAllComments()
    await navigator.clipboard.writeText(text)
  }, [formatAllComments])

  return {
    comments,
    addComment,
    addRenderedComment,
    removeComment,
    editComment,
    resolveComment,
    getAnnotationsForFile,
    formatAllComments,
    copyAllComments,
  }
}
