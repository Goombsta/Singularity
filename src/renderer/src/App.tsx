import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import Multiview from './components/Multiview'
import EPGView from './components/EPGView'
import PlaylistEditor from './components/PlaylistEditor'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import FloatingPiP from './components/FloatingPiP'
import AndroidCategoryList from './components/AndroidCategoryList'
import { usePlaylistStore } from './stores/playlistStore'
import { useSettingsStore } from './stores/settingsStore'
import { useEpgStore } from './stores/epgStore'
import { usePlayerStore } from './stores/playerStore'
import { useKeyboard } from './hooks/useKeyboard'
import type { SidebarView } from './types'

/** Tracks whether the device is currently in landscape orientation. */
function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight)
  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return landscape
}

export default function App(): JSX.Element {
  const [view, setView] = useState<SidebarView>('live')
  const { load: loadPlaylists, setFilterType, groups, activeGroup, setActiveGroup } = usePlaylistStore()
  const { load: loadSettings, settings } = useSettingsStore()
  const { load: loadEpg } = useEpgStore()
  const { isMultiview, toggleMultiview, setFullscreen, isFullscreen, channel, pause, resume, isPlaying } = usePlayerStore()
  const isAndroid = window.api?.platform === 'android'
  // TV flag injected by MainActivity.java via UiModeManager (Android TV / Fire TV)
  const isTV = isAndroid && !!(window as unknown as { __IS_TV__?: boolean }).__IS_TV__
  const isLandscape = useIsLandscape()
  const [pipVisible, setPipVisible] = useState(true)
  // Double-press back to exit (TV/Android)
  const [exitToast, setExitToast] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Android hardware back button — ref pattern keeps handler fresh without re-registering listener
  const backHandlerRef = useRef<() => void>(() => {})
  backHandlerRef.current = () => {
    // Exit native browser fullscreen first (e.g. triggered outside our store)
    if (document.fullscreenElement) { document.exitFullscreen(); return }
    if (isFullscreen) { setFullscreen(false); return }
    if (isMultiview) { toggleMultiview(); return }
    if (view !== 'live') { handleViewChange('live'); return }
    if (activeGroup !== null) { setActiveGroup(null); return }
    // Double-press back to exit — first press shows toast, second press minimizes
    if (!exitToast) {
      setExitToast(true)
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
      exitTimerRef.current = setTimeout(() => setExitToast(false), 2000)
      return
    }
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    window.api.window.minimize()
  }
  useEffect(() => {
    if (!isAndroid) return
    const handler = () => backHandlerRef.current()
    window.addEventListener('androidback', handler)
    return () => window.removeEventListener('androidback', handler)
  }, [isAndroid])

  // Bootstrap
  useEffect(() => {
    async function init() {
      await loadSettings()
      await loadPlaylists()
      // Start casting device discovery (Electron + Android/Capacitor)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const castApi = (window.api as any).cast
      if (castApi) {
        // Register listener BEFORE starting discovery to avoid race condition
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        castApi.onDevicesUpdated((devices: any) => {
          usePlayerStore.getState().setCastDevices(devices)
        })
        castApi.startDiscovery()
        // Fetch devices already found before this listener was registered
        castApi.getDevices().then((devices: any) => {
          if (devices?.length) usePlayerStore.getState().setCastDevices(devices)
        })
      }
    }
    init()
    // Add android-mode class for touch-target CSS overrides
    if (window.api.platform === 'android' || window.api.platform === 'ios') {
      document.body.classList.add('android-mode')
    }
    // Add tv-mode class for 10-foot UI: safe zones, large fonts, D-pad focus rings
    if ((window as unknown as { __IS_TV__?: boolean }).__IS_TV__) {
      document.body.classList.add('tv-mode')
    }
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const castApi = (window.api as any).cast
      if (castApi) castApi.offDevicesUpdated()
    }
  }, [])

  // Apply dark mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!settings.darkMode)
  }, [settings.darkMode])

  // Auto-load EPG after settings
  useEffect(() => {
    if (settings.epgUrls.length > 0) {
      loadEpg(settings.epgUrls)
    }
  }, [settings.epgUrls])

  // Handle view change: set filterType and exit fullscreen/multiview if needed
  const handleViewChange = useCallback(
    (newView: SidebarView) => {
      setView(newView)
      // Map view → filter type
      if (newView === 'live') setFilterType('live')
      else if (newView === 'vod') setFilterType('vod')
      else if (newView === 'series') setFilterType('series')
      else setFilterType('all')
      // Reset category selection when switching views (Android)
      if (isAndroid) setActiveGroup(null)
    },
    [setFilterType, setActiveGroup]
  )

  // Re-show PiP whenever a new channel starts playing
  useEffect(() => { setPipVisible(true) }, [channel?.id])

  // ESC: exit fullscreen, exit multiview
  // Fire OS media keys: Play/Pause (179)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setFullscreen(false)
        } else if (isMultiview) {
          toggleMultiview()
        }
        return
      }
      // Fire OS / Android TV remote media keys
      const code = e.keyCode
      if (code === 179) { // Play/Pause (Fire OS)
        e.preventDefault()
        isPlaying ? pause() : resume()
      } else if (code === 85) { // Play (KEYCODE_MEDIA_PLAY)
        e.preventDefault()
        resume()
      } else if (code === 86) { // Pause (KEYCODE_MEDIA_PAUSE)
        e.preventDefault()
        pause()
      } else if (code === 89) { // Rewind (KEYCODE_MEDIA_REWIND)
        e.preventDefault()
        const vid = document.querySelector<HTMLVideoElement>('video')
        if (vid) vid.currentTime = Math.max(0, vid.currentTime - 10)
      } else if (code === 90) { // Fast-forward (KEYCODE_MEDIA_FAST_FORWARD)
        e.preventDefault()
        const vid = document.querySelector<HTMLVideoElement>('video')
        if (vid && vid.duration) vid.currentTime = Math.min(vid.duration, vid.currentTime + 10)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFullscreen, isMultiview, setFullscreen, toggleMultiview, isPlaying, pause, resume])

  // Keyboard shortcuts
  useKeyboard({
    onToggleEpg: () => handleViewChange('epg'),
    setSidebarView: handleViewChange,
  })

  const showPlayerSplit = view === 'live' || view === 'vod' || view === 'series'

  // ── TV sidebar collapsed state ────────────────────────────────────────────
  // ROLLBACK: set sidebarCollapsed default to false and remove setSidebarCollapsed(true)
  // calls in nav item onClick handlers to restore always-expanded sidebar.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // TV: auto-focus first content element when view changes.
  // Prefer [data-tv-initial-focus] (set by individual views like PlaylistEditor)
  // so focus lands in the right place, not on action buttons like "Export .m3u".
  useEffect(() => {
    if (!isTV) return
    requestAnimationFrame(() => {
      const preferred = document.querySelector<HTMLElement>('[data-tv-content] [data-tv-initial-focus]')
      const fallback = document.querySelector<HTMLElement>(
        '[data-tv-content] button:not([disabled]), [data-tv-content] [tabindex="0"], [data-tv-content] input'
      )
      ;(preferred ?? fallback)?.focus()
    })
  }, [view, isTV])

  // TV: auto-focus first channel item when a category is selected
  useEffect(() => {
    if (!isTV || activeGroup === null) return
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-tv-content] [tabindex="0"]')
      el?.focus()
    })
  }, [activeGroup, isTV])

  // ── Android TV / Fire TV / Google TV layout ──────────────────────────────
  // TV is always landscape with a left sidebar nav and safe-zone padding.
  // BottomNav is hidden; navigation is handled via a D-pad-accessible left rail.
  if (isTV) {
    // ROLLBACK UI SCALE: change fontSize back to '1rem', sidebar width to 220,
    // channel panel width to 320, paddingTop/Bottom to 60 in content area.
    const tvNavItems = [
      { id: 'live' as SidebarView, label: 'Live TV', icon: '📺' },
      { id: 'vod' as SidebarView, label: 'Movies', icon: '🎬' },
      { id: 'series' as SidebarView, label: 'Series', icon: '📋' },
      { id: 'epg' as SidebarView, label: 'EPG Guide', icon: '📅' },
    ]

    const sidebarWidth = sidebarCollapsed ? 56 : 180 // ROLLBACK: change 180 → 220

    const focusFirstContent = () => {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-tv-content] button:not([disabled]), [data-tv-content] [tabindex="0"], [data-tv-content] input'
        )
        el?.focus()
      })
    }

    return (
      <div className="flex h-full" style={{ background: 'var(--bg-base)', flexDirection: 'row', zoom: 0.72 }}>

        {/* ── TV Left Sidebar Nav ─────────────────────────────────────────── */}
        <div
          data-tv-sidebar
          style={{
            width: sidebarWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-hard)',
            paddingTop: 40,
            paddingBottom: 40,
            gap: 4,
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}
          // Re-expand sidebar when any nav item receives focus (e.g. via ArrowLeft from content)
          onFocus={() => setSidebarCollapsed(false)}
        >
          {/* App logo / name — hidden when collapsed */}
          {!sidebarCollapsed && (
            <div
              style={{
                padding: '0 16px 20px',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Singularity
            </div>
          )}

          {tvNavItems.map((item, idx) => {
            const isActive = view === item.id && !isMultiview
            return (
              <button
                key={item.id}
                tabIndex={0}
                className="nav-item"
                style={{
                  marginLeft: 8,
                  marginRight: 8,
                  background: isActive ? 'rgba(107, 159, 212, 0.14)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  gap: sidebarCollapsed ? 0 : 10,
                  fontSize: '0.95rem',
                  fontWeight: isActive ? 600 : 400,
                  boxShadow: isActive ? 'var(--shadow-inset)' : 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
                onClick={() => {
                  if (isMultiview) toggleMultiview()
                  handleViewChange(item.id)
                  setSidebarCollapsed(true)
                  focusFirstContent()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (isMultiview) toggleMultiview()
                    handleViewChange(item.id)
                    setSidebarCollapsed(true)
                    focusFirstContent()
                    return
                  }
                  const allBtns = Array.from(e.currentTarget.parentElement?.querySelectorAll('button') || []) as HTMLElement[]
                  const i = allBtns.indexOf(e.currentTarget)
                  if (e.key === 'ArrowDown') { e.preventDefault(); allBtns[i + 1]?.focus() }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); allBtns[i - 1]?.focus() }
                  else if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarCollapsed(true); focusFirstContent() }
                }}
              >
                <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}

          {/* Multiview toggle */}
          <button
            tabIndex={0}
            className="nav-item"
            style={{
              marginLeft: 8,
              marginRight: 8,
              marginTop: 6,
              background: isMultiview ? 'rgba(107, 159, 212, 0.14)' : 'transparent',
              color: isMultiview ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: sidebarCollapsed ? 0 : 10,
              fontSize: '0.95rem',
              fontWeight: isMultiview ? 600 : 400,
              boxShadow: isMultiview ? 'var(--shadow-inset)' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            onClick={() => { toggleMultiview(); setSidebarCollapsed(true) }}
            onKeyDown={(e) => {
              const btns = Array.from(e.currentTarget.parentElement?.querySelectorAll('button') || []) as HTMLElement[]
              const idx = btns.indexOf(e.currentTarget)
              if (e.key === 'ArrowDown') { e.preventDefault(); btns[idx + 1]?.focus() }
              else if (e.key === 'ArrowUp') { e.preventDefault(); btns[idx - 1]?.focus() }
              else if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarCollapsed(true); focusFirstContent() }
            }}
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>⊞</span>
            {!sidebarCollapsed && <span>Multiview</span>}
          </button>

          {/* Settings — always last, below Multiview */}
          <button
            tabIndex={0}
            className="nav-item"
            style={{
              marginLeft: 8,
              marginRight: 8,
              background: view === 'settings' && !isMultiview ? 'rgba(107, 159, 212, 0.14)' : 'transparent',
              color: view === 'settings' && !isMultiview ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: sidebarCollapsed ? 0 : 10,
              fontSize: '0.95rem',
              fontWeight: view === 'settings' && !isMultiview ? 600 : 400,
              boxShadow: view === 'settings' && !isMultiview ? 'var(--shadow-inset)' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            onClick={() => { if (isMultiview) toggleMultiview(); handleViewChange('settings'); setSidebarCollapsed(true); focusFirstContent() }}
            onKeyDown={(e) => {
              const btns = Array.from(e.currentTarget.parentElement?.querySelectorAll('button') || []) as HTMLElement[]
              const idx = btns.indexOf(e.currentTarget)
              if (e.key === 'ArrowDown') { e.preventDefault(); btns[idx + 1]?.focus() }
              else if (e.key === 'ArrowUp') { e.preventDefault(); btns[idx - 1]?.focus() }
              else if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarCollapsed(true); focusFirstContent() }
              else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isMultiview) toggleMultiview(); handleViewChange('settings'); setSidebarCollapsed(true); focusFirstContent() }
            }}
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>⚙️</span>
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        </div>

        {/* ── Press back to exit toast ────────────────────────────────────── */}
        <AnimatePresence>
          {exitToast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              style={{
                position: 'fixed',
                bottom: 48,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(10,12,24,0.92)',
                color: 'rgba(255,255,255,0.9)',
                padding: '10px 28px',
                borderRadius: 10,
                fontSize: '0.95rem',
                fontWeight: 500,
                zIndex: 9999,
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                whiteSpace: 'nowrap',
              }}
            >
              Press Back again to exit
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TV Main Content Area ─────────────────────────────────────────── */}
        <div
          data-tv-content
          className="flex flex-col flex-1 overflow-hidden"
          style={{ paddingTop: 40, paddingBottom: 40 }} // ROLLBACK: change 40 → 60
        >
          {isMultiview ? (
            <Multiview />
          ) : (
            <AnimatePresence mode="wait">
              {showPlayerSplit ? (
                <motion.div
                  key="tv-player-split"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="flex flex-1 overflow-hidden"
                  style={{ height: '100%' }}
                >
                  {/* Channel/category list — left panel, 270px (ROLLBACK: change 270 → 320) */}
                  <div
                    style={{
                      width: 270,
                      flexShrink: 0,
                      overflow: 'hidden',
                      borderRight: '1px solid var(--border-hard)',
                      display: 'flex',
                      flexDirection: 'column',
                      background: 'var(--bg-base)',
                    }}
                  >
                    {activeGroup === null && groups.length > 0 ? (
                      <AndroidCategoryList />
                    ) : (
                      <>
                        {activeGroup !== null && (
                          <button
                            tabIndex={0}
                            onClick={() => setActiveGroup(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '12px 14px',
                              fontSize: '0.95rem',
                              color: 'var(--accent)',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid var(--border-hard)',
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'left',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft') { e.preventDefault(); setSidebarCollapsed(false); document.querySelector<HTMLElement>('.nav-item')?.focus() }
                              if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector<HTMLElement>('[data-tv-content] [tabindex="0"]:not(button[tabindex="0"]:first-child)')?.focus() }
                            }}
                          >
                            ← {activeGroup}
                          </button>
                        )}
                        <div data-tv-channel-list style={{ flex: 1, overflow: 'hidden' }}>
                          <ChannelList />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Player — fills remaining space */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Player />
                  </div>
                </motion.div>
              ) : view === 'epg' ? (
                <motion.div key="epg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <EPGView />
                </motion.div>
              ) : view === 'editor' ? (
                <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <PlaylistEditor />
                </motion.div>
              ) : view === 'settings' ? (
                <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <Settings />
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}
        </div>
      </div>
    )
  }

  // ── Android portrait layout ──────────────────────────────────────────────
  if (isAndroid) {
    return (
      <div
        className="flex flex-col h-full"
        style={{
          background: 'var(--bg-base)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Main content — full width, no sidebar */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {isMultiview ? (
            <Multiview />
          ) : (
            <AnimatePresence mode="wait">
              {showPlayerSplit ? (
                <motion.div
                  key="android-player-split"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-1 overflow-hidden"
                  style={{ flexDirection: isLandscape ? 'row' : 'column', height: '100%' }}
                >
                  {/*
                   * Player — always first in DOM (stable React key), but visually
                   * right in landscape (order:2) and top in portrait (order:1).
                   * Keeping DOM order stable prevents Player from remounting on rotate.
                   */}
                  <div style={{
                    order: isLandscape ? 2 : 1,
                    flex: isLandscape ? '1 1 0' : '0 0 40%',
                    overflow: 'hidden',
                  }}>
                    <Player />
                  </div>

                  {/* Channel / category panel — visually left in landscape, bottom in portrait */}
                  <div
                    style={{
                      order: isLandscape ? 1 : 2,
                      flex: isLandscape ? '0 0 320px' : '1 1 0',
                      maxWidth: isLandscape ? 320 : undefined,
                      overflow: 'hidden',
                      borderTop: isLandscape ? 'none' : '1px solid var(--border-hard)',
                      borderRight: isLandscape ? '1px solid var(--border-hard)' : 'none',
                      display: 'flex',
                      flexDirection: 'column' as const,
                      background: 'var(--bg-base)',
                    }}
                  >
                    {activeGroup === null && groups.length > 0 ? (
                      <AndroidCategoryList />
                    ) : (
                      <>
                        {activeGroup !== null && (
                          <button
                            onClick={() => setActiveGroup(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: 'var(--accent)',
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid var(--border-hard)',
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'left' as const,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M8 2L4 6l4 4" />
                            </svg>
                            {activeGroup}
                          </button>
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <ChannelList />
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : view === 'epg' ? (
                <motion.div
                  key="epg"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <EPGView />
                </motion.div>
              ) : view === 'editor' ? (
                <motion.div
                  key="editor"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <PlaylistEditor />
                </motion.div>
              ) : view === 'settings' ? (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <Settings />
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}
        </div>

        <StatusBar />

        {/* FloatingPiP — shown when a channel is playing but not in player view */}
        <AnimatePresence>
          {channel && pipVisible && !showPlayerSplit && !isMultiview && view !== 'epg' && (
            <FloatingPiP
              onClose={() => setPipVisible(false)}
              onGoLive={() => handleViewChange('live')}
            />
          )}
        </AnimatePresence>

        <BottomNav view={view} onViewChange={handleViewChange} />
      </div>
    )
  }

  // ── Desktop layout (Electron / web) ──────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar view={view} onViewChange={handleViewChange} />

        {/* Main content area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {isMultiview ? (
            <Multiview />
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Channel list panel (live/vod/series) */}
              {/* Fixed 340px width — no width animation to avoid ResizeObserver / flex layout race on first mount */}
              <AnimatePresence initial={false}>
                {showPlayerSplit && (
                  <motion.div
                    key="channel-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex-shrink-0 overflow-hidden"
                    style={{
                      width: 340,
                      borderRight: '1px solid var(--border-hard)',
                      background: 'var(--bg-base)',
                    }}
                  >
                    <ChannelList />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main panel */}
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {showPlayerSplit ? (
                    <motion.div
                      key="player"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <Player />
                    </motion.div>
                  ) : view === 'epg' ? (
                    <motion.div
                      key="epg"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <EPGView />
                    </motion.div>
                  ) : view === 'editor' ? (
                    <motion.div
                      key="editor"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <PlaylistEditor />
                    </motion.div>
                  ) : view === 'settings' ? (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <Settings />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating PiP — shown when a channel is playing but player view is not visible */}
      <AnimatePresence>
        {channel && pipVisible && !showPlayerSplit && !isMultiview && view !== 'epg' && (
          <FloatingPiP
            onGoLive={() => handleViewChange('live')}
            onClose={() => setPipVisible(false)}
          />
        )}
      </AnimatePresence>

      <StatusBar />
    </div>
  )
}
