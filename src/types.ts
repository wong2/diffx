export interface CommentReply {
  id: string
  body: string
  createdAt: number
}

export interface RenderedAnchor {
  selectedText: string
  context: string
  paragraphIndex: number
  startOffset: number
  endOffset: number
}

export interface ReviewComment {
  id: string
  filePath: string
  anchorType: 'line' | 'rendered'
  side?: 'deletions' | 'additions'
  lineNumber?: number
  endLineNumber?: number
  lineContent?: string
  lineContents?: string[]
  renderedAnchor?: RenderedAnchor
  body: string
  status: 'open' | 'resolved'
  createdAt: number
  replies: CommentReply[]
}
