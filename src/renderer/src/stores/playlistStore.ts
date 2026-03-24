import { create } from 'zustand'
import { parseM3U, exportM3U, groupChannels } from '../utils/m3uParser'
import {
  xtreamGetLiveStreams,
  xtreamGetVodStreams,
  xtreamGetSeries,
  xtreamAuthenticate,
} from '../utils/xtreamApi'
import { stalkerAuthenticate, stalkerGetLive, stalkerGetVod } from '../utils/stalkerApi'
import type { Channel, Playlist, StalkerCredentials } from '../types'

type FilterType = 'all' | 'live' | 'vod' | 'series'

interface PlaylistStore {
  playlists: Playlist[]
  activePlaylistId: string | null
  activeGroup: string | null
  searchQuery: string
  filterType: FilterType
  loaded: boolean

  // Derived
  activeChannels: Channel[]
  filteredChannels: Channel[]
  groups: string[]

  load: () => Promise<void>
  addM3UFromUrl: (name: string, url: string, refreshInterval?: number) => Promise<void>
  addM3UFromFile: () => Promise<void>
  addXtream: (name: string, server: string, username: string, password: string) => Promise<void>
  addStalker: (name: string, portal: string, mac: string) => Promise<void>
  removePlaylist: (id: string) => Promise<void>
  refreshPlaylist: (id: string) => Promise<void>
  setActivePlaylist: (id: string | null) => void
  setActiveGroup: (group: string | null) => void
  setSearchQuery: (q: string) => void
  setFilterType: (t: FilterType) => void

  // Editing
  renameChannel: (channelId: string, name: string) => void
  moveChannel: (channelId: string, newGroup: string) => void
  deleteChannel: (channelId: string) => void
  reorderChannels: (channelId: string, direction: 'up' | 'down' | 'top') => void
  updateChannelLogo: (channelId: string, logo: string) => void
  exportPlaylist: (playlistId: string) => Promise<void>
  toggleFavorite: (channelId: string) => void
  renameGroup: (oldName: string, newName: string) => void
  reorderGroup: (groupName: string, direction: 'up' | 'down' | 'top') => void

  _save: () => Promise<void>
  _recompute: () => void
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  activeGroup: null,
  searchQuery: '',
  filterType: 'live',
  loaded: false,
  activeChannels: [],
  filteredChannels: [],
  groups: [],

  load: async () => {
    try {
      const saved = (await window.api.store.get('playlists')) as Playlist[] | null
      if (saved && Array.isArray(saved)) {
        set({ playlists: saved, loaded: true })
        if (saved.length > 0) {
          set({ activePlaylistId: saved[0].id })
        }
        get()._recompute()
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  _save: async () => {
    await window.api.store.set('playlists', get().playlists)
  },

  _recompute: () => {
    const { playlists, activePlaylistId, activeGroup, searchQuery, filterType } = get()
    const playlist = playlists.find((p) => p.id === activePlaylistId)
    let allChannels = playlist?.channels || []

    // Filter by stream type (but 'all' shows everything — used in Playlist Editor)
    let typeFiltered = allChannels
    if (filterType === 'live') {
      typeFiltered = allChannels.filter(
        (c) => !c.streamType || c.streamType === 'live'
      )
    } else if (filterType === 'vod') {
      typeFiltered = allChannels.filter((c) => c.streamType === 'vod')
    } else if (filterType === 'series') {
      typeFiltered = allChannels.filter((c) => c.streamType === 'series')
    }

    const groupMap = groupChannels(typeFiltered)
    const rawGroups = Array.from(groupMap.keys())
    const order = playlist?.groupOrder
    const ordered = order
      ? [...order.filter((g) => rawGroups.includes(g)), ...rawGroups.filter((g) => !order.includes(g))]
      : rawGroups
    const groups = ['Favorites', ...ordered]

    let active = typeFiltered
    if (activeGroup === 'Favorites') {
      active = typeFiltered.filter((c) => c.isFavorite)
    } else if (activeGroup) {
      active = groupMap.get(activeGroup) || []
    }

    const filtered = searchQuery
      ? active.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : active

    set({ activeChannels: active, filteredChannels: filtered, groups })
  },

  addM3UFromUrl: async (name, url, refreshInterval = 24) => {
    // Use IPC net.fetch to bypass CORS / renderer network restrictions for IPTV URLs
    const result = await window.api.net.fetch(url) as { data?: string; status: number; error?: string }
    if (result.error) throw new Error(result.error)
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Server returned HTTP ${result.status}`)
    }
    const text = atob(result.data!)
    const channels = parseM3U(text)
    const id = `m3u-${Date.now()}`
    const playlist: Playlist = {
      id,
      name,
      type: 'm3u',
      url,
      channels,
      groups: [...new Set(channels.map((c) => c.group))],
      lastUpdated: Date.now(),
      refreshInterval,
    }
    const playlists = [...get().playlists, playlist]
    set({ playlists, activePlaylistId: id })
    get()._recompute()
    await get()._save()
  },

  addM3UFromFile: async () => {
    const result = await window.api.dialog.openFile()
    if (result.canceled || !result.filePaths[0]) return
    const filePath = result.filePaths[0]
    const text = await window.api.fs.readFile(filePath)
    const channels = parseM3U(text)
    const name = filePath.split(/[\\/]/).pop() || 'Playlist'
    const id = `m3u-${Date.now()}`
    const playlist: Playlist = {
      id,
      name,
      type: 'm3u',
      filePath,
      channels,
      groups: [...new Set(channels.map((c) => c.group))],
      lastUpdated: Date.now(),
    }
    const playlists = [...get().playlists, playlist]
    set({ playlists, activePlaylistId: id })
    get()._recompute()
    await get()._save()
  },

  addXtream: async (name, server, username, password) => {
    const creds = { server, username, password }
    const ok = await xtreamAuthenticate(creds)
    if (!ok) throw new Error('Authentication failed — check server URL, username and password')

    // Fetch all three types in parallel
    const [live, vod, series] = await Promise.all([
      xtreamGetLiveStreams(creds),
      xtreamGetVodStreams(creds),
      xtreamGetSeries(creds),
    ])

    const channels = [...live, ...vod, ...series]
    const id = `xtream-${Date.now()}`
    const playlist: Playlist = {
      id,
      name,
      type: 'xtream',
      xtream: creds,
      channels,
      groups: [...new Set(channels.map((c) => c.group))],
      lastUpdated: Date.now(),
      refreshInterval: 24,
    }
    const playlists = [...get().playlists, playlist]
    set({ playlists, activePlaylistId: id })
    get()._recompute()
    await get()._save()
  },

  addStalker: async (name, portal, mac) => {
    const creds: StalkerCredentials = { portal: portal.replace(/\/+$/, ''), mac }
    await stalkerAuthenticate(creds)

    const [live, vod] = await Promise.all([
      stalkerGetLive(creds),
      stalkerGetVod(creds),
    ])

    const channels = [...live, ...vod]
    const id = `stalker-${Date.now()}`
    const playlist: Playlist = {
      id,
      name,
      type: 'stalker',
      stalker: creds,
      channels,
      groups: [...new Set(channels.map((c) => c.group))],
      lastUpdated: Date.now(),
      refreshInterval: 24,
    }
    const playlists = [...get().playlists, playlist]
    set({ playlists, activePlaylistId: id })
    get()._recompute()
    await get()._save()
  },

  removePlaylist: async (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id)
    const activeId = playlists[0]?.id || null
    set({ playlists, activePlaylistId: activeId })
    get()._recompute()
    await get()._save()
  },

  refreshPlaylist: async (id) => {
    const playlist = get().playlists.find((p) => p.id === id)
    if (!playlist) return

    let channels: Channel[] = []
    if (playlist.type === 'm3u' && playlist.url) {
      // Use IPC net.fetch to bypass CORS / renderer network restrictions for IPTV URLs
      const result = await window.api.net.fetch(playlist.url) as { data?: string; status: number; error?: string }
      if (result.error) throw new Error(result.error)
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Server returned HTTP ${result.status}`)
      }
      const text = atob(result.data!)
      channels = parseM3U(text)
    } else if (playlist.type === 'xtream' && playlist.xtream) {
      const [live, vod, series] = await Promise.all([
        xtreamGetLiveStreams(playlist.xtream),
        xtreamGetVodStreams(playlist.xtream),
        xtreamGetSeries(playlist.xtream),
      ])
      channels = [...live, ...vod, ...series]
    } else if (playlist.type === 'stalker' && playlist.stalker) {
      const [live, vod] = await Promise.all([
        stalkerGetLive(playlist.stalker),
        stalkerGetVod(playlist.stalker),
      ])
      channels = [...live, ...vod]
    }

    const updated = {
      ...playlist,
      channels,
      groups: [...new Set(channels.map((c) => c.group))],
      lastUpdated: Date.now(),
    }
    const playlists = get().playlists.map((p) => (p.id === id ? updated : p))
    set({ playlists })
    get()._recompute()
    await get()._save()
  },

  setActivePlaylist: (id) => {
    set({ activePlaylistId: id, activeGroup: null })
    get()._recompute()
  },

  setActiveGroup: (group) => {
    set({ activeGroup: group })
    get()._recompute()
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q })
    get()._recompute()
  },

  setFilterType: (t) => {
    set({ filterType: t, activeGroup: null })
    get()._recompute()
  },

  renameChannel: (channelId, name) => {
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.id === channelId ? { ...c, name } : c)),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  moveChannel: (channelId, newGroup) => {
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.id === channelId ? { ...c, group: newGroup } : c)),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  deleteChannel: (channelId) => {
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.filter((c) => c.id !== channelId),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  reorderChannels: (channelId, direction) => {
    const { playlists, activePlaylistId } = get()
    const plIdx = playlists.findIndex((p) => p.id === activePlaylistId)
    if (plIdx < 0) return

    const playlist = playlists[plIdx]
    const ch = playlist.channels.find((c) => c.id === channelId)
    if (!ch) return

    // Work within the channel's group
    const groupChs = playlist.channels.filter((c) => c.group === ch.group)
    const others = playlist.channels.filter((c) => c.group !== ch.group)
    const idx = groupChs.findIndex((c) => c.id === channelId)
    if (idx < 0) return

    let newGroupChs = [...groupChs]

    if (direction === 'top') {
      newGroupChs.splice(idx, 1)
      newGroupChs.unshift(ch)
    } else if (direction === 'up' && idx > 0) {
      ;[newGroupChs[idx - 1], newGroupChs[idx]] = [newGroupChs[idx], newGroupChs[idx - 1]]
    } else if (direction === 'down' && idx < groupChs.length - 1) {
      ;[newGroupChs[idx], newGroupChs[idx + 1]] = [newGroupChs[idx + 1], newGroupChs[idx]]
    }

    // Rebuild: keep non-group channels in their original relative positions
    // by merging back preserving original order for other groups
    const updated = { ...playlist, channels: [...others, ...newGroupChs] }
    const newPlaylists = playlists.map((p, i) => (i === plIdx ? updated : p))
    set({ playlists: newPlaylists })
    get()._recompute()
    get()._save()
  },

  updateChannelLogo: (channelId, logo) => {
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.id === channelId ? { ...c, logo } : c)),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  exportPlaylist: async (playlistId) => {
    const playlist = get().playlists.find((p) => p.id === playlistId)
    if (!playlist) return
    const content = exportM3U(playlist.channels)
    const result = await window.api.dialog.saveFile(`${playlist.name}.m3u`)
    if (!result.canceled && result.filePath) {
      await window.api.fs.writeFile(result.filePath, content)
    }
  },

  toggleFavorite: (channelId) => {
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.map((c) =>
        c.id === channelId ? { ...c, isFavorite: !c.isFavorite } : c
      ),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  renameGroup: (oldName, newName) => {
    const trimmed = newName.trim()
    if (!trimmed || oldName === 'Favorites') return
    const playlists = get().playlists.map((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.group === oldName ? { ...c, group: trimmed } : c)),
      groupOrder: p.groupOrder?.map((g) => (g === oldName ? trimmed : g)),
    }))
    set({ playlists })
    get()._recompute()
    get()._save()
  },

  reorderGroup: (groupName, direction) => {
    const { playlists, activePlaylistId } = get()
    const plIdx = playlists.findIndex((p) => p.id === activePlaylistId)
    if (plIdx < 0) return
    const playlist = playlists[plIdx]
    const rawGroups = Array.from(
      new Set(playlist.channels.map((c) => c.group).filter((g) => g !== 'Favorites'))
    )
    const current = playlist.groupOrder
      ? [
          ...playlist.groupOrder.filter((g) => rawGroups.includes(g)),
          ...rawGroups.filter((g) => !playlist.groupOrder!.includes(g)),
        ]
      : rawGroups
    const idx = current.indexOf(groupName)
    if (idx < 0) return
    const next = [...current]
    if (direction === 'top') {
      next.splice(idx, 1)
      next.unshift(groupName)
    } else if (direction === 'up' && idx > 0) {
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    } else if (direction === 'down' && idx < next.length - 1) {
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    }
    const updated = { ...playlist, groupOrder: next }
    set({ playlists: playlists.map((p, i) => (i === plIdx ? updated : p)) })
    get()._recompute()
    get()._save()
  },
}))
