import { useRef, useState, useCallback, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import { motion } from 'framer-motion'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useEpgStore } from '../stores/epgStore'
import { getCurrentProgram } from '../utils/xmltvParser'
import { getProgramProgress } from '../utils/formatters'
import type { Channel } from '../types'
import AddPlaylistModal from './AddPlaylistModal'

interface RowProps {
  index: number
  style: React.CSSProperties
  data: {
    channels: Channel[]
    activeId: string | null
    onPlay: (ch: Channel) => void
    onFavorite: (id: string) => void
    epgMap: Map<string, import('../types').EpgChannel>
  }
}

function ChannelRow({ index, style, data }: RowProps): JSX.Element {
  const ch = data.channels[index]
  const isActive = ch.id === data.activeId
  const epgCh = ch.tvgId ? data.epgMap.get(ch.tvgId) : undefined
  const current = epgCh ? getCurrentProgram(epgCh.programs) : null
  const progress = current ? getProgramProgress(current.start, current.end) : 0

  return (
    <div style={style}>
      <motion.div
        className={`channel-row ${isActive ? 'active' : ''}`}
        style={{ margin: '1px 8px' }}
        onClick={() => data.onPlay(ch)}
        whileTap={{ scale: 0.98 }}
      >
        {/* Logo */}
        <div
          className="flex-shrink-0 rounded-md overflow-hidden"
          style={{
            width: 32,
            height: 32,
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-raised-sm)',
          }}
        >
          {ch.logo ? (
            <img src={ch.logo} alt="" className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                {ch.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {ch.name}
            </p>
            {isActive && <span className="badge badge-live">LIVE</span>}
          </div>
          {current && (
            <div>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {current.title}
              </p>
              <div
                className="mt-0.5 rounded-full overflow-hidden"
                style={{ height: 2, background: 'var(--border-hard)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Favorite */}
        <button
          className="btn flex-shrink-0 w-6 h-6 rounded-md"
          style={{
            background: 'transparent',
            color: ch.isFavorite ? '#f5a623' : 'var(--text-secondary)',
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onFavorite(ch.id)
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill={ch.isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 1l1.39 2.82L10.5 4.27l-2.25 2.19.53 3.09L6 8l-2.78 1.55.53-3.09L1.5 4.27l3.11-.45L6 1z" />
          </svg>
        </button>
      </motion.div>
    </div>
  )
}

export default function ChannelList(): JSX.Element {
  const { filteredChannels, searchQuery, setSearchQuery, toggleFavorite } = usePlaylistStore()
  const { channel: currentChannel, play } = usePlayerStore()
  const { channels: epgMap } = useEpgStore()
  const [showAdd, setShowAdd] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  const [listHeight, setListHeight] = useState(400)

  // Dynamically measure the list container height
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && h > 0) setListHeight(h)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const handlePlay = useCallback((ch: Channel) => { play(ch) }, [play])
  const handleFavorite = useCallback((id: string) => { toggleFavorite(id) }, [toggleFavorite])

  const itemData = {
    channels: filteredChannels,
    activeId: currentChannel?.id || null,
    onPlay: handlePlay,
    onFavorite: handleFavorite,
    epgMap,
  }

  if (filteredChannels.length === 0 && !searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ boxShadow: 'var(--shadow-raised)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ fontFamily: 'Syne', color: 'var(--text-primary)' }}>
            No channels
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Add an M3U playlist or Xtream account
          </p>
        </div>
        <motion.button
          className="btn-primary btn text-sm"
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowAdd(true)}
        >
          Add Playlist
        </motion.button>
        {showAdd && <AddPlaylistModal onClose={() => setShowAdd(false)} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar — extra left padding so icon never overlaps text */}
      <div className="px-3 py-2 flex-shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
          >
            <circle cx="5" cy="5" r="4" />
            <path d="M8.5 8.5l2.5 2.5" />
          </svg>
          <input
            className="input"
            style={{ paddingLeft: 32 }}   /* ← pushed right of icon */
            placeholder={`Search ${filteredChannels.length} channels...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <motion.button
          className="btn-neu btn w-8 h-8"
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAdd(true)}
          title="Add playlist"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </motion.button>
      </div>

      {/* Channel count */}
      <div className="px-4 pb-1 flex-shrink-0">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {filteredChannels.length.toLocaleString()} channels
        </p>
      </div>

      {/* Virtualized list — auto height */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <List
          ref={listRef}
          height={listHeight}
          itemCount={filteredChannels.length}
          itemSize={54}
          width="100%"
          itemData={itemData}
        >
          {ChannelRow}
        </List>
      </div>

      {showAdd && <AddPlaylistModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
