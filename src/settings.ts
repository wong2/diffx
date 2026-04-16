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
  browser?: string
}

const DEFAULTS: Settings = {
  staged: true,
  untracked: true,
  diffStyle: 'split',
  defaultTabSize: 4,
}

export function loadSettings(): Settings {
  try {
    const data = readFileSync(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const current = loadSettings()
  const merged = { ...current, ...settings }
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2))
  return merged
}
