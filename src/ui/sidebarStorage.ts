const STORAGE_KEY = 'diffx-sidebar-preferences'

export const SIDEBAR_MIN_SIZE = 200
export const SIDEBAR_COLLAPSED_SIZE = 40

interface Preferences {
  size: number
  collapsed: boolean
}

const DEFAULTS: Preferences = {
  size: 300,
  collapsed: false,
}

function read(): Preferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.size === 'number' && typeof parsed?.collapsed === 'boolean') {
      return parsed as Preferences
    }
  } catch {}
  return null
}

export class SidebarStorage {
  static minSize = SIDEBAR_MIN_SIZE
  static collapsedSize = SIDEBAR_COLLAPSED_SIZE

  readonly size: number
  readonly collapsed: boolean

  private constructor(prefs: Preferences) {
    this.size = prefs.size
    this.collapsed = prefs.collapsed
  }

  static load(): SidebarStorage {
    return new SidebarStorage(read() ?? DEFAULTS)
  }

  visibleSize(maxWidth?: number): number {
    if (this.collapsed) {
      return SIDEBAR_COLLAPSED_SIZE
    }
    if (maxWidth === undefined) {
      return this.size
    }
    const clamped = Math.min(this.size, maxWidth)
    return Math.max(SIDEBAR_MIN_SIZE, clamped)
  }

  save(): this {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        size: this.size,
        collapsed: this.collapsed,
      }))
    } catch {}
    return this
  }

  withSize(size: number): SidebarStorage {
    return new SidebarStorage({ size, collapsed: false })
  }

  withCollapsed(collapsed: boolean): SidebarStorage {
    return new SidebarStorage({ size: this.size, collapsed })
  }
}
