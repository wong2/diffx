# Changelog

## 0.11.0

### Minor Changes

- 0a4f752: add `--host` flag to bind the server to a custom address (e.g. `0.0.0.0` for LAN access)

## 0.10.0

### Minor Changes

- b76c8b6: Add comment status tracker in sidebar with open/replied/resolved status indicators and click-to-navigate via anchor links
- 6c3d7db: Distinguish untracked files from added files with a separate FileQuestion icon

## 0.9.0

### Minor Changes

- 39340d9: add comment replies support

## 0.8.3

### Patch Changes

- 7e42d1b: Fix button hover state where background color collides with foreground text color

## 0.8.2

### Patch Changes

- 129a23b: All internal `git diff` invocations now pass `--no-ext-diff --no-color`, so the frontend always receives a standard unified diff regardless of the user's global git configuration.

## 0.8.1

### Patch Changes

- 2a97d9b: Harden local server exposure by binding DiffX to loopback only and reduce command execution risk by replacing shell-based Git invocation with `execFileSync`.

## 0.8.0

### Minor Changes

- 5849f1b: Fix path traversal vulnerability and use random port by default

## 0.7.0 (2026-04-04)

- Persist "Viewed" file state in server memory across page refreshes

## 0.6.0 (2026-04-04)

- Support per-file tab size from `.editorconfig`
- Add settings dropdown to toolbar with default tab size option

## 0.5.0 (2026-04-04)

- Add binary file detection and image preview support
- Split review skill into start/finish workflow with comment status tracking
- Add `prepublishOnly` script

## 0.4.3 (2026-04-04)

- Add GitHub links to package.json and fix screenshot URL for npm
- Reduce font size of staged/untracked checkboxes in toolbar

## 0.4.2 (2026-04-04)

- Fix bin path to match tsdown ESM output (.mjs)

## 0.4.1 (2026-04-04)

- Add diffx-review skill for AI-assisted code review workflow

## 0.4.0 (2026-04-04)

- Add `--help` and `--version`/`-v` flags to CLI

## 0.3.0 (2026-04-04)

- Move comments from client-only state to server-side storage with API
- Add screenshot to README

## 0.2.1 (2026-04-04)

- Replace deprecated `external` with `deps.neverBundle` in tsdown config

## 0.2.0 (2026-04-04)

- Use XML format for copied comments with inline code context

## 0.1.0 (2026-04-04)

- Initial release
