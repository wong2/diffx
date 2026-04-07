---
"diffx-cli": patch
---

All internal `git diff` invocations now pass `--no-ext-diff --no-color`, so the frontend always receives a standard unified diff regardless of the user's global git configuration.
