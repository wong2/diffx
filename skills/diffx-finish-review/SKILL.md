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

The response is a JSON array of comment objects:

```json
[
  {
    "id": "uuid",
    "filePath": "src/utils/parser.ts",
    "side": "additions",
    "lineNumber": 42,
    "lineContent": "const x = tokenize(input)",
    "body": "Rename x to parsedToken for clarity",
    "status": "open",
    "createdAt": 1234567890
  }
]
```

### 2. Process each comment

For each comment with `"status": "open"`:

1. Read the file at `filePath`
2. Find the relevant code using `lineContent` as context
3. Apply the change described in `body`
4. After successfully applying the change, mark the comment as resolved:

```bash
curl -s -X PUT http://localhost:<port>/api/comments/<id> \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved"}'
```

The `side` field tells you whether the comment is on an added line (`additions`) or a deleted line (`deletions`).

### 3. Handle edge cases

- If a comment is ambiguous, ask for clarification rather than guessing.
- If multiple comments interact (e.g., a rename that affects several places), handle them together.
- If there are no open comments, tell the user there's nothing to process.

### 4. Summary

After applying all changes, give a brief summary of what you did and how many comments were resolved.
