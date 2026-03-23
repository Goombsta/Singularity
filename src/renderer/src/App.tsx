import { useState, useEffect, useCallback } from 'react'
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

export default function App(): JSX.Element {
  const [view, setView] = useState<SidebarView>('live')
  const { load: loadPlaylists, setFilterType, groups, activeGroup, setActiveGroup } = usePlaylistStore()
  const { load: loadSettings, settings } = useSettingsStore()
  const { load: loadEpg } = useEpgStore()
  const { isMultiview, toggleMultiview, setFullscreen, isFullscreen, channel, pause, resume, isPlaying } = usePlayerStore()
  const isAndroid = window.api?.platform === 'android'
  const [pipVisible, setPipVisible] = useState(true)

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
      // Fire OS remote media keys
      const code = e.keyCode
      if (code === 179) { // Play/Pause
        e.preventDefault()
        isPlaying ? pause() : resume()
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
                  className="flex flex-col flex-1 overflow-hidden h-full"
                >
                  {/* Player at top (~40% height) */}
                  <div style={{ flex: '0 0 40%', overflow: 'hidden' }}>
                    <Player />
                  </div>
                  {/* Channel list / category list fills remaining space */}
                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      borderTop: '1px solid var(--border-hard)',
                      display: 'flex',
                      flexDirection: 'column',
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
