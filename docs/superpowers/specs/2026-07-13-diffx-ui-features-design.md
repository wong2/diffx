# diffx UI Features Design

Date: 2026-07-13

## Overview

Four features added to the diffx UI:

1. Rendered markdown view — per-file toggle on `.md` files showing rendered HTML instead of raw diff
2. Mermaid diagram rendering — `mermaid` fenced code blocks render as diagrams inside the rendered view
3. Markdown comment bodies — comment bodies rendered as full markdown everywhere (bold, code, lists)
4. Google Docs-style comments in rendered view — select text, leave a comment anchored to that selection, displayed in a right margin

## Dependencies

New runtime dependencies:

- `react-markdown` + `remark-gfm` — markdown rendering
- `mermaid` — diagram rendering, lazy-loaded on first encounter (avoids ~2MB in initial bundle)

## Data Model

`src/types.ts` gains a `RenderedAnchor` type and extends `ReviewComment`:

```ts
export interface RenderedAnchor {
  selectedText: string   // the exact selected text; used as the highlight anchor
  context: string        // ~50 chars before/after selection for agent locatability
  paragraphIndex: number // which block element (for disambiguation)
  startOffset: number    // char offset within that block
  endOffset: number
}

export interface ReviewComment {
  id: string
  filePath: string
  anchorType: 'line' | 'rendered'
  // line anchor (present when anchorType === 'line')
  side?: 'deletions' | 'additions'
  lineNumber?: number
  lineContent?: string
  // rendered anchor (present when anchorType === 'rendered')
  renderedAnchor?: RenderedAnchor
  body: string
  status: 'open' | 'resolved'
  createdAt: number
  replies: CommentReply[]
}
```

Comments without `anchorType` are treated as `'line'` by the server — no migration needed.

## Server Changes

### New endpoint: `GET /api/file`

Query param: `path` (relative to repo root). Reads the file from the working tree and returns its content as `text/plain`. Used by `MarkdownView` to get the full file for rendering (the diff only carries hunk lines for partial diffs).

### Comment API changes

`POST /api/comments` body accepts the new optional fields (`anchorType`, `renderedAnchor`). The existing `side`/`lineNumber`/`lineContent` fields remain required for line comments, optional otherwise.

## New Components

### `MarkdownView`

Fetches file content via `/api/file?path=...`, renders with `react-markdown` + `remark-gfm`.

Layout: two-column flex container. Left column holds the rendered markdown; right column (240px fixed) is the comment margin.

Custom react-markdown renderers:
- `code` — when `language === 'mermaid'`, renders `<MermaidBlock>`. Otherwise renders a standard `<code>` block.
- `p`, `h1`–`h6`, `li` — wraps content in a container with `data-paragraph-index` and scans children for `selectedText` matches from existing rendered comments, wrapping matches in `<mark data-anchor-id="commentId">`.

Selection comment flow:
1. `selectionchange` listener (scoped to the markdown column container ref)
2. On non-empty selection inside the container: positions `SelectionTooltip` using `getRangeAt(0).getBoundingClientRect()`
3. `SelectionTooltip` click: captures `{ selectedText, context, paragraphIndex, startOffset, endOffset }` from the live range, opens an inline `CommentForm`
4. Submit: calls `onAddRenderedComment(filePath, anchor, body)`

If file content fails to load, shows an inline error with a "View diff" fallback link.

### `MermaidBlock`

Lazy-imports `mermaid` on first render. Calls `mermaid.render()` with a unique id and sets the SVG via `dangerouslySetInnerHTML`. On error, shows a styled error box with the mermaid error message. Respects `prefers-color-scheme` by passing the appropriate mermaid theme (`default` vs `dark`).

### `SelectionTooltip`

Small floating `+` button. Absolutely positioned relative to the viewport using the selection bounding rect. Dismissed on `mousedown` outside or when selection collapses.

### `RenderedCommentMargin`

Right-side column. After each paint (via `useLayoutEffect`), aligns each comment bubble vertically with its corresponding `<mark>` element using `getBoundingClientRect()`. An SVG layer draws a connecting line from each bubble to its mark. When multiple comments would overlap, they stack with a minimum 8px gap — the connecting lines adjust accordingly.

## Modified Components

### `FileDiffCard`

For `.md` files, adds a "Diff / Rendered" pill toggle in the file header (between the filename and the Viewed checkbox). Toggle state is component-local (resets on reload — no need to persist). When "Rendered" is active, mounts `MarkdownView` instead of `<FileDiff>`. Passes `annotations` filtered to `anchorType === 'rendered'` comments down to `MarkdownView`.

### `CommentBubble`

Replaces:
```tsx
<div className="comment-bubble-body">{comment.body}</div>
```
with:
```tsx
<div className="comment-bubble-body markdown-body">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
</div>
```

Same change applied to reply bodies. Adds `.markdown-body` CSS scoping for standard prose styles (font size, list indentation, code blocks).

### `useComments`

Adds:
```ts
addRenderedComment(filePath: string, anchor: RenderedAnchor, body: string): void
```

Updates `formatAllComments` to handle rendered comments:
```xml
<comment anchor="selected text here">
  <context>...surrounding text...</context>
  comment body
</comment>
```

Line comments keep `<comment line="N"><code>...</code>...</comment>` unchanged.

## Edge Cases

- **`selectedText` appears multiple times:** all occurrences are highlighted; the one matching `paragraphIndex + startOffset` is treated as primary for margin alignment.
- **Partial diff, file unreadable:** `MarkdownView` shows an error and disables the Rendered toggle until the file loads.
- **Mermaid parse error:** `MermaidBlock` shows a red-bordered error box with the mermaid error; does not crash the surrounding render.
- **Many overlapping margin comments:** comments stack top-to-bottom in creation order, minimum 8px apart; connecting SVG lines stretch/angle as needed.

## Testing

- `MarkdownView`: renders markdown correctly, mermaid blocks mount `MermaidBlock`, text selection triggers `SelectionTooltip`, submitting creates a comment with correct `renderedAnchor`
- `MermaidBlock`: renders diagram on valid input, shows error box on invalid input
- `CommentBubble`: renders markdown in body and replies
- `formatAllComments`: correct XML output for both line and rendered comments
- Server `/api/file`: returns file content, 404 on missing file, rejects path traversal
