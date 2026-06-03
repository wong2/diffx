---
"diffx-cli": patch
---

Fix the web UI failing to load on Windows. The static-file guard compared resolved paths against a hardcoded `/`, which never matches Windows' backslash paths, so every asset was rejected with a 403. Compare against the platform separator (`path.sep`) instead.
