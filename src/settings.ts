import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_DIR = join(homedir(), '.config', 'diffx')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')

export interface Settings {
  staged: boolean
  untracked: boolean
  diffStyle: 'split' | 'unified'
  defaultTabSize: number
  softWrap: boolean
  browser?: string
}

const DEFAULTS: Settings = {
  staged: true,
  untracked: true,
  diffStyle: 'split',
  defaultTabSize: 4,
  softWrap: false,
}

const BROWSERS = new Set(['chrome', 'firefox', 'edge', 'brave'])

// Settings arrive as an untrusted request body and are written to disk, where
// `browser` names the app launched on the next run — so keep only known keys.
function sanitize(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {}
  const raw = input as Record<string, unknown>
  const settings: Partial<Settings> = {}
  if (typeof raw.staged === 'boolean') settings.staged = raw.staged
  if (typeof raw.untracked === 'boolean') settings.untracked = raw.untracked
  if (typeof raw.softWrap === 'boolean') settings.softWrap = raw.softWrap
  if (raw.diffStyle === 'split' || raw.diffStyle === 'unified') settings.diffStyle = raw.diffStyle
  if (
    typeof raw.defaultTabSize === 'number' &&
    Number.isInteger(raw.defaultTabSize) &&
    raw.defaultTabSize >= 1 &&
    raw.defaultTabSize <= 16
  ) {
    settings.defaultTabSize = raw.defaultTabSize
  }
  if (typeof raw.browser === 'string' && (raw.browser === '' || BROWSERS.has(raw.browser))) {
    settings.browser = raw.browser
  }
  return settings
}

export function loadSettings(): Settings {
  try {
    const data = readFileSync(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULTS, ...sanitize(JSON.parse(data)) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: unknown): Settings {
  const current = loadSettings()
  const merged = { ...current, ...sanitize(settings) }
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
  return merged
}
