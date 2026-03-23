import { create } from 'zustand'
import type { Channel, PlayerState, StreamInfo, MultiviewPanel } from '../types'
import type { CastDevice } from '../../../shared/castTypes'

export type MultiviewLayout = '2h' | '2v' | '3' | '4'

const HISTORY_MAX = 5

interface PlayerStore extends PlayerState {
  multiviewPanels: MultiviewPanel[]
  isMultiview: boolean
  recentChannels: Channel[]

  play: (channel: Channel) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setVolume: (vol: number) => void
  toggleMute: () => void
  setFullscreen: (v: boolean) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setStreamInfo: (info: StreamInfo) => void
  setCurrentTime: (t: number) => void
  setDuration: (t: number) => void
  setIsLive: (v: boolean) => void

  // Multiview
  multiviewLayout: MultiviewLayout
  toggleMultiview: () => void
  setMultiviewLayout: (layout: MultiviewLayout) => void
  setMultiviewChannel: (panelId: string, channel: Channel | null) => void
  setPrimaryPanel: (panelId: string) => void
  togglePanelMute: (panelId: string) => void
  setPanelVolume: (panelId: string, volume: number) => void

  // Casting
  castDevices: CastDevice[]
  isCasting: boolean
  castingDevice: CastDevice | null
  castError: string | null
  setCastDevices: (devices: CastDevice[]) => void
  startCast: (deviceId: string) => Promise<void>
  stopCast: () => Promise<void>
}

const defaultPanels: MultiviewPanel[] = [
  { id: 'p1', channel: null, isPrimary: true,  isMuted: true, volume: 1 },
  { id: 'p2', channel: null, isPrimary: false, isMuted: true, volume: 1 },
  { id: 'p3', channel: null, isPrimary: false, isMuted: true, volume: 1 },
  { id: 'p4', channel: null, isPrimary: false, isMuted: true, volume: 1 },
]

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  url: null,
  channel: null,
  isPlaying: false,
  isPaused: false,
  isMuted: false,
  volume: 1,
  isFullscreen: false,
  isLoading: false,
  error: null,
  streamInfo: {},
  currentTime: 0,
  duration: 0,
  isLive: true,
  multiviewPanels: defaultPanels,
  isMultiview: false,
  multiviewLayout: '4' as MultiviewLayout,
  recentChannels: [],
  castDevices: [],
  isCasting: false,
  castingDevice: null,
  castError: null,

  play: (channel) => {
    // Add to recent history (deduplicated, most recent first, max 5)
    const recent = get().recentChannels.filter((c) => c.id !== channel.id)
    const newRecent = [channel, ...recent].slice(0, HISTORY_MAX)

    set({
      channel,
      url: channel.url,
      isPlaying: true,
      isPaused: false,
      isLoading: true,
      error: null,
      streamInfo: {},
      currentTime: 0,
      recentChannels: newRecent,
    })
  },

  pause: () => set({ isPaused: true, isPlaying: false }),
  resume: () => set({ isPaused: false, isPlaying: true }),
  stop: () =>
    set({
      url: null,
      channel: null,
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      error: null,
    }),

  setVolume: (vol) => set({ volume: vol, isMuted: vol === 0 }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setFullscreen: (v) => set({ isFullscreen: v }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e, isLoading: false }),
  setStreamInfo: (info) => set({ streamInfo: info }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (t) => set({ duration: t }),
  setIsLive: (v) => set({ isLive: v }),

  toggleMultiview: () => set((s) => ({ isMultiview: !s.isMultiview })),
  setMultiviewLayout: (layout) => set({ multiviewLayout: layout }),

  setMultiviewChannel: (panelId, channel) =>
    set((s) => ({
      multiviewPanels: s.multiviewPanels.map((p) =>
        p.id === panelId ? { ...p, channel } : p
      ),
    })),

  setPrimaryPanel: (panelId) =>
    set((s) => ({
      multiviewPanels: s.multiviewPanels.map((p) => ({
        ...p,
        isPrimary: p.id === panelId,
        isMuted: p.id !== panelId,
      })),
    })),

  togglePanelMute: (panelId) =>
    set((s) => ({
      multiviewPanels: s.multiviewPanels.map((p) =>
        p.id === panelId ? { ...p, isMuted: !p.isMuted } : p
      ),
    })),

  setPanelVolume: (panelId, volume) =>
    set((s) => ({
      multiviewPanels: s.multiviewPanels.map((p) =>
        p.id === panelId ? { ...p, volume, isMuted: volume === 0 } : p
      ),
    })),

  setCastDevices: (devices) => set({ castDevices: devices }),

  startCast: async (deviceId) => {
    const { url, channel } = get()
    const streamUrl = url || channel?.url
    if (!streamUrl) return
    const channelName = channel?.name || 'IPTV Channel'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (window.api as any).cast.start(deviceId, streamUrl, channelName)
    if (result.success) {
      const device = get().castDevices.find((d) => d.id === deviceId) ?? null
      set({ isCasting: true, castingDevice: device, castError: null })
    } else {
      set({ castError: result.error || 'Cast failed' })
    }
  },

  stopCast: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (window.api as any).cast.stop()
    set({ isCasting: false, castingDevice: null, castError: null })
  },
}))
