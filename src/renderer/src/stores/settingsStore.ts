import { create } from 'zustand'
import type { Settings } from '../types'

const defaults: Settings = {
  startMinimized: false,
  minimizeToTray: true,
  darkMode: true,
  hardwareAcceleration: true,
  bufferSize: 30,
  externalPlayers: [],
  defaultExternalPlayer: undefined,
  sidebarCollapsed: false,
  animationsEnabled: true,
  epgUrls: [],
  epgRefreshInterval: 24,
}

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (partial: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaults,
  loaded: false,

  load: async () => {
    try {
      const saved = (await window.api.store.get('settings')) as Partial<Settings> | null
      set({ settings: { ...defaults, ...(saved || {}) }, loaded: true })
    } catch {
      set({ loaded: true })
    }
    // Detect external players
    try {
      const detected = await window.api.player.detectExternal()
      const current = get().settings
      if (detected.length > 0 && current.externalPlayers.length === 0) {
        const updated = { ...current, externalPlayers: detected }
        await window.api.store.set('settings', updated)
        set({ settings: updated })
      }
    } catch {
      // ignore
    }
  },

  update: async (partial) => {
    const updated = { ...get().settings, ...partial }
    set({ settings: updated })
    await window.api.store.set('settings', updated)
  },
}))
