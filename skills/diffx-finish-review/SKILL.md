---
name: diffx-finish-review
description: "Finish a code review session by fetching comments from the running diffx server, applying requested changes, and marking comments as resolved. Use when the user invokes /diffx-finish-review."
user_invocable: true
---

# Finish diffx Review

Fetch all review comments from the running diffx server, apply the requested changes, and mark each comment as resolved.

## What to do

### 1. Fetch comments from the API

The diffx server is running locally. Check the earlier conversation context for the port diffx reported on startup. Fetch all comments:

```bash
curl -s http://localhost:<port>/api/comments
```

Replace `<port>` with the port number diffx reported on startup (visible in the server log output).

Comments come in two types. A **line comment** is anchored to a specific diff line; a **rendered comment** is anchored to selected text in a rendered markdown file.

```json
[
  {
    "id": "uuid",
    "filePath": "src/utils/parser.ts",
    "anchorType": "line",
    "side": "additions",
    "lineNumber": 42,
    "endLineNumber": 45,
    "lineContent": "const x = tokenize(input)",
    "lineContents": ["const x = tokenize(input)", "  .filter(Boolean)", "  .map(trim)", ""],
    "body": "Rename x to parsedToken for clarity",
    "status": "open",
    "createdAt": 1234567890,
    "replies": []
  },
  {
    "id": "uuid2",
    "filePath": "docs/README.md",
    "anchorType": "rendered",
    "renderedAnchor": {
      "selectedText": "quick start guide",
      "context": "...see the quick start guide for details...",
      "paragraphIndex": 3,
      "startOffset": 8,
      "endOffset": 23
    },
    "body": "This link is broken, update it to point to docs/getting-started.md",
    "status": "open",
    "createdAt": 1234567891,
    "replies": []
  }
]
```

### 2. Process each comment

For each comment with `"status": "open"`, first determine the intent — is it a **change request** or a **question**?

#### Change requests (e.g., "Rename x to parsedToken", "Extract this into a helper")

1. Read the file at `filePath`
2. Locate the relevant text:
   - **Line comment** (`anchorType === "line"` or missing): use `lineContent` to find the line. For multi-line comments (`endLineNumber` differs from `lineNumber`), `lineContent` is always the first line of the range — use `lineContents` for the full context of all lines covered.
   - **Rendered comment** (`anchorType === "rendered"`): use `renderedAnchor.selectedText` to find the passage; use `renderedAnchor.context` for disambiguation if the text appears multiple times
3. Apply the change described in `body`
4. Reply to the comment explaining what you did, then mark it as resolved:

```bash
# Reply to the comment
curl -s -X POST http://localhost:<port>/api/comments/<id>/replies \
  -H "Content-Type: application/json" \
  -d '{"body": "Done. Renamed x to parsedToken."}'

# Mark as resolved
curl -s -X PUT http://localhost:<port>/api/comments/<id> \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}'
```

#### Questions (e.g., "Why not use a Map here?", "Is this thread-safe?")

Just reply with an answer. Do **not** modify code or resolve the comment — leave it open for the user to read and follow up if needed.

```bash
curl -s -X POST http://localhost:<port>/api/comments/<id>/replies \
  -H "Content-Type: application/json" \
  -d '{"body": "A Map would work too, but we use a plain object here because..."}'
```

For line comments, `side` tells you whether the comment is on an added line (`additions`) or a deleted line (`deletions`). Rendered comments have no `side`.

### 3. Handle edge cases

- If a comment is ambiguous, reply to ask for clarification rather than guessing.
- If a rendered comment's `selectedText` appears multiple times in the file, use `renderedAnchor.context` to find the right occurrence.
- If multiple comments interact (e.g., a rename that affects several places), handle them together.
- If there are no open comments, tell the user there's nothing to process.

### 4. Summary

After processing all comments, give a brief summary of what you did: how many changes were applied, how many questions were answered.
