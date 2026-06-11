import { execFileSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { readFileSync, lstatSync, readlinkSync } from 'node:fs'
import { isSafePath } from './path.js'
import { parseSync as parseEditorConfig, type ProcessedFileConfig } from 'editorconfig'

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif',
])

export function isImageFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

function isBinaryFile(absolutePath: string): boolean {
  try {
    const buffer = readFileSync(absolutePath)
    const bytesToCheck = Math.min(buffer.length, 8192)
    for (let i = 0; i < bytesToCheck; i++) {
      if (buffer[i] === 0) return true
    }
    return false
  } catch {
    return true
  }
}

export function getFileContent(filePath: string, version: 'old' | 'new'): Buffer | null {
  const root = getRepoRoot()
  if (!isSafePath(filePath, root)) {
    return null
  }
  const resolved = resolve(root, filePath)
  if (version === 'new') {
    try {
      return readFileSync(resolved)
    } catch {
      return null
    }
  }
  // old version: try staged first, then HEAD
  try {
    return execFileSync('git', ['show', `HEAD:${filePath}`], { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 })
  } catch {
    return null
  }
}

const BLOB_OID_REGEX = /^[0-9a-f]{4,64}$/

export function getBlobContent(oid: string): string | null {
  if (!BLOB_OID_REGEX.test(oid) || /^0+$/.test(oid)) {
    return null
  }
  try {
    return execFileSync('git', ['cat-file', 'blob', oid], { encoding: 'utf-8', stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 })
  } catch {
    return null
  }
}

export function getWorktreeFileContent(filePath: string): string | null {
  const root = getRepoRoot()
  if (!isSafePath(filePath, root)) {
    return null
  }
  const resolved = resolve(root, filePath)
  try {
    // Match git's notion of the worktree blob: for a symlink that is the
    // target string, never the contents of the file it points at (which
    // could be outside the repository).
    const stats = lstatSync(resolved)
    if (stats.isSymbolicLink()) {
      return readlinkSync(resolved, 'utf-8')
    }
    if (!stats.isFile()) {
      return null
    }
    return readFileSync(resolved, 'utf-8')
  } catch {
    return null
  }
}

export function isGitRepo(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function getRepoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf-8',
  }).trim()
}

export function getRepoName(): string {
  return basename(getRepoRoot())
}

export function getBranchName(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe', encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

// Force standard unified diff regardless of user's git config
// (e.g. diff.external = difftastic, color.ui = always).
const DIFF_FLAGS = ['--no-ext-diff', '--no-color'] as const

export function getCustomGitDiff(args: string[]): string {
  return execFileSync('git', ['diff', ...DIFF_FLAGS, ...args], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
}

export function getGitDiff(options: { staged?: boolean; untracked?: boolean } = {}): string {
  const parts: string[] = []

  // unstaged changes (always included as the base)
  const unstaged = execFileSync('git', ['diff', ...DIFF_FLAGS], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
  if (unstaged) parts.push(unstaged)

  // staged changes
  if (options.staged) {
    const staged = execFileSync('git', ['diff', ...DIFF_FLAGS, '--staged'], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
    if (staged) parts.push(staged)
  }

  // untracked files
  if (options.untracked) {
    const untrackedPatch = getUntrackedFilesDiff()
    if (untrackedPatch) parts.push(untrackedPatch)
  }

  return parts.join('\n')
}

export function getTabSizeForFiles(filePaths: string[]): Record<string, number> {
  const root = getRepoRoot()
  const cache = new Map<string, ProcessedFileConfig>()
  const result: Record<string, number> = {}
  for (const filePath of filePaths) {
    try {
      const absPath = join(root, filePath)
      const config = parseEditorConfig(absPath, { cache })
      const size = config.tab_width ?? (config.indent_size === 'tab' ? undefined : config.indent_size)
      if (typeof size === 'number') {
        result[filePath] = size
      }
    } catch {
      // skip files that fail to resolve
    }
  }
  return result
}

export function getUntrackedFilePaths(): string[] {
  const output = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim()
  return output ? output.split('\n') : []
}

function getUntrackedFilesDiff(): string {
  const root = getRepoRoot()
  const output = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim()

  if (!output) return ''

  const files = output.split('\n')
  const patches: string[] = []

  for (const file of files) {
    const absolutePath = join(root, file)
    if (isBinaryFile(absolutePath)) {
      const patch = [
        `diff --git a/${file} b/${file}`,
        'new file mode 100644',
        'index 0000000..0000001',
        `Binary files /dev/null and b/${file} differ`,
      ].join('\n')
      patches.push(patch)
    } else {
      try {
        const content = readFileSync(absolutePath, 'utf-8')
        const lines = content.split('\n')
        const diffLines = lines.map((l: string) => `+${l}`)
        const patch = [
          `diff --git a/${file} b/${file}`,
          'new file mode 100644',
          'index 0000000..0000001',
          '--- /dev/null',
          `+++ b/${file}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...diffLines,
        ].join('\n')
        patches.push(patch)
      } catch {
        // skip unreadable files
      }
    }
  }

  return patches.length > 0 ? '\n' + patches.join('\n') : ''
}
