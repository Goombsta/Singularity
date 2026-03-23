export interface Channel {
  id: string
  name: string
  url: string
  group: string
  logo?: string
  tvgId?: string
  tvgName?: string
  number?: number
  isFavorite?: boolean
  streamType?: 'live' | 'vod' | 'series'
  // Stalker portal channels — resolved at play time to avoid token expiry
  stalkerCmd?: string     // raw portal cmd (e.g. "http://localhost/ch/539_")
  stalkerPortal?: string  // portal base URL for re-authentication
  stalkerMac?: string     // MAC address for re-authentication
}

export interface ChannelGroup {
  name: string
  channels: Channel[]
}

export interface Playlist {
  id: string
  name: string
  type: 'm3u' | 'xtream' | 'stalker'
  url?: string
  filePath?: string
  xtream?: XtreamCredentials
  stalker?: StalkerCredentials
  channels: Channel[]
  groups: string[]
  lastUpdated: number
  refreshInterval?: number // hours
}

export interface XtreamCredentials {
  server: string
  username: string
  password: string
}

export interface StalkerCredentials {
  portal: string // e.g. "http://provider.com/c"
  mac: string    // e.g. "00:1A:79:XX:XX:XX"
}

export interface EpgProgram {
  id: string
  channelId: string
  title: string
  description?: string
  start: Date
  end: Date
  category?: string
  icon?: string
}

export interface EpgChannel {
  id: string
  displayName: string
  icon?: string
  programs: EpgProgram[]
}

export interface StreamInfo {
  codec?: string
  resolution?: string
  bitrate?: string
  fps?: string
  audioCodec?: string
}

export interface PlayerState {
  url: string | null
  channel: Channel | null
  isPlaying: boolean
  isPaused: boolean
  isMuted: boolean
  volume: number
  isFullscreen: boolean
  isLoading: boolean
  error: string | null
  streamInfo: StreamInfo
  currentTime: number
  duration: number
  isLive: boolean
}

export interface MultiviewPanel {
  id: string
  channel: Channel | null
  isPrimary: boolean
  isMuted: boolean
  volume: number
}

export type SidebarView = 'live' | 'vod' | 'series' | 'epg' | 'editor' | 'settings'

export interface Settings {
  // General
  startMinimized: boolean
  minimizeToTray: boolean
  darkMode: boolean
  // Playback
  hardwareAcceleration: boolean
  bufferSize: number // seconds
  // External Players
  externalPlayers: { name: string; path: string }[]
  defaultExternalPlayer?: string
  // Interface
  sidebarCollapsed: boolean
  animationsEnabled: boolean
  // EPG
  epgUrls: string[]
  epgRefreshInterval: number // hours
}

export interface ExternalPlayer {
  name: string
  path: string
}
