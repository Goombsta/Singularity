import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChannelList from './components/ChannelList'
import Player from './components/Player'
import Multiview from './components/Multiview'
import EPGView from './components/EPGView'
import PlaylistEditor from './components/PlaylistEditor'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import { usePlaylistStore } from './stores/playlistStore'
import { useSettingsStore } from './stores/settingsStore'
import { useEpgStore } from './stores/epgStore'
import { usePlayerStore } from './stores/playerStore'
import { useKeyboard } from './hooks/useKeyboard'
import type { SidebarView } from './types'

export default function App(): JSX.Element {
  const [view, setView] = useState<SidebarView>('live')
  const { load: loadPlaylists, setFilterType } = usePlaylistStore()
  const { load: loadSettings, settings } = useSettingsStore()
  const { load: loadEpg } = useEpgStore()
  const { isMultiview, toggleMultiview, setFullscreen, isFullscreen } = usePlayerStore()

  // Bootstrap
  useEffect(() => {
    async function init() {
      await loadSettings()
      await loadPlaylists()
    }
    init()
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
    },
    [setFilterType]
  )

  // ESC: exit fullscreen, exit multiview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setFullscreen(false)
        } else if (isMultiview) {
          toggleMultiview()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFullscreen, isMultiview, setFullscreen, toggleMultiview])

  // Keyboard shortcuts
  useKeyboard({
    onToggleEpg: () => handleViewChange('epg'),
    setSidebarView: handleViewChange,
  })

  const showPlayerSplit = view === 'live' || view === 'vod' || view === 'series'

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
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
                      <EPGView onChannelPlay={() => handleViewChange('live')} />
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

      <StatusBar />
    </div>
  )
}
