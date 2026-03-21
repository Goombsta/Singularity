import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SidebarView } from '../types'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'

// Settings moved below Multiview
const NAV_ITEMS: { id: SidebarView; label: string; shortcut?: string; icon: JSX.Element }[] = [
  {
    id: 'live',
    label: 'Live TV',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="2.5" width="13" height="9" rx="1.5"/>
        <path d="M4.5 12.5v1.5M10.5 12.5v1.5M2.5 14h10"/>
      </svg>
    ),
  },
  {
    id: 'vod',
    label: 'Movies',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1.5" width="13" height="12" rx="1.5"/>
        <path d="M1 5.5h13M4.5 1.5v4M10.5 1.5v4"/>
      </svg>
    ),
  },
  {
    id: 'series',
    label: 'Series',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 3.5h11M2 7.5h7.5M2 11.5h9.5"/>
      </svg>
    ),
  },
  {
    id: 'epg',
    label: 'Guide',
    shortcut: 'E',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1.5" width="13" height="12" rx="1.5"/>
        <path d="M4.5 1.5v3M10.5 1.5v3M1 6.5h13"/>
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Playlist Editor',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 3.5h7M2 7.5h5.5M2 11.5h7"/>
        <path d="M10.5 8.5l1.5 1.5 2.5-2.5"/>
      </svg>
    ),
  },
]

interface Props {
  view: SidebarView
  onViewChange: (v: SidebarView) => void
}

export default function Sidebar({ view, onViewChange }: Props): JSX.Element {
  const {
    playlists,
    activePlaylistId,
    groups,
    activeGroup,
    setActiveGroup,
    setActivePlaylist,
  } = usePlaylistStore()

  const {
    channel: currentChannel,
    isMultiview,
    toggleMultiview,
    recentChannels,
    play,
  } = usePlayerStore()

  const [groupSearch, setGroupSearch] = useState('')

  const handleNavClick = (newView: SidebarView) => {
    // Exit multiview when user navigates to any other view
    if (isMultiview) toggleMultiview()
    onViewChange(newView)
  }

  const showPlayerSplit = view === 'live' || view === 'vod' || view === 'series'

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 220,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-hard)',
        flexShrink: 0,
      }}
    >
      {/* Playlist selector (only when multiple) */}
      {playlists.length > 1 && (
        <div className="px-3 pt-3 pb-1">
          <select
            className="input text-xs"
            value={activePlaylistId || ''}
            onChange={(e) => {
              setActivePlaylist(e.target.value)
              usePlayerStore.getState().stop()
            }}
            style={{ cursor: 'pointer' }}
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main nav */}
      <nav className="px-2 pt-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            className={`nav-item w-full text-left ${view === item.id && !isMultiview ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
            whileTap={{ scale: 0.97 }}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs opacity-40">{item.shortcut}</span>
            )}
          </motion.button>
        ))}

        {/* Multiview toggle */}
        <motion.button
          className={`nav-item w-full text-left ${isMultiview ? 'active' : ''}`}
          onClick={() => {
            if (!isMultiview) toggleMultiview()
            else toggleMultiview()
          }}
          whileTap={{ scale: 0.97 }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="5.5" height="5.5" rx="1.2"/>
            <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2"/>
            <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2"/>
            <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2"/>
          </svg>
          <span className="flex-1">Multiview</span>
          <span className="text-xs opacity-40">⌃M</span>
        </motion.button>

        {/* Settings — below Multiview */}
        <motion.button
          className={`nav-item w-full text-left ${view === 'settings' && !isMultiview ? 'active' : ''}`}
          onClick={() => handleNavClick('settings')}
          whileTap={{ scale: 0.97 }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7.5" cy="7.5" r="2"/>
            <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.2 3.2l1.1 1.1M10.7 10.7l1.1 1.1M3.2 11.8l1.1-1.1M10.7 4.3l1.1-1.1"/>
          </svg>
          <span>Settings</span>
        </motion.button>
      </nav>

      <div className="sep mx-3 my-2" />

      {/* Group list (live/vod/series) */}
      {showPlayerSplit && !isMultiview && groups.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0 pb-2">
          {/* Group search */}
          <div className="px-2 pt-1 pb-1 flex-shrink-0">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="var(--text-secondary)" strokeWidth="1.5"
              >
                <circle cx="4" cy="4" r="3"/>
                <path d="M7 7l2 2"/>
              </svg>
              <input
                className="input text-xs"
                style={{ paddingLeft: 26, paddingTop: 5, paddingBottom: 5 }}
                placeholder="Search groups..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>
          </div>

          <p
            className="px-3 py-0.5 text-xs font-semibold uppercase flex-shrink-0"
            style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}
          >
            Groups
          </p>
          <div className="flex-1 overflow-y-auto px-2">
            <AnimatePresence>
              {groups
                .filter((g) =>
                  !groupSearch || g.toLowerCase().includes(groupSearch.toLowerCase())
                )
                .map((g) => (
                  <motion.button
                    key={g}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`nav-item w-full text-left ${activeGroup === g ? 'active' : ''}`}
                    style={{ paddingLeft: 10, fontSize: 12 }}
                    onClick={() => setActiveGroup(activeGroup === g ? null : g)}
                    whileTap={{ scale: 0.97 }}
                  >
                    {g === 'Favorites' ? (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill={activeGroup === g ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
                        <path d="M5.5 1l1.2 2.5 2.8.4-2 2 .5 2.8L5.5 7.4l-2.5 1.3.5-2.8-2-2 2.8-.4L5.5 1z"/>
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M1 2.5h9M1 5.5h6.5M1 8.5h7.5"/>
                      </svg>
                    )}
                    <span className="truncate flex-1 text-left">{g}</span>
                  </motion.button>
                ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Spacer when no group list */}
      {(!showPlayerSplit || isMultiview) && <div className="flex-1" />}

      {/* Recent channels history */}
      {recentChannels.length > 0 && (
        <div className="px-2 pb-2 flex-shrink-0">
          <div className="sep mb-2" />
          <p
            className="px-2 py-1 text-xs font-semibold uppercase"
            style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}
          >
            Recent
          </p>
          {recentChannels.map((ch) => (
            <motion.button
              key={ch.id}
              className="nav-item w-full text-left"
              style={{ paddingLeft: 10, fontSize: 12, gap: 8 }}
              onClick={() => play(ch)}
              whileTap={{ scale: 0.97 }}
            >
              {ch.logo ? (
                <img
                  src={ch.logo}
                  alt=""
                  className="w-5 h-5 object-contain rounded flex-shrink-0"
                />
              ) : (
                <div
                  className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--border-hard)', fontSize: 8, fontWeight: 700, color: 'var(--text-secondary)' }}
                >
                  {ch.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="truncate flex-1 text-left">{ch.name}</span>
              {currentChannel?.id === ch.id && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--success)' }}
                />
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* Now playing footer */}
      {currentChannel && recentChannels.length === 0 && (
        <div
          className="mx-2 mb-2 p-2 rounded-lg flex-shrink-0"
          style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {currentChannel.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Now Playing</p>
        </div>
      )}
    </div>
  )
}
