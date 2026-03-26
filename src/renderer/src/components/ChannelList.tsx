import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FixedSizeList as List } from 'react-window'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { useEpgStore } from '../stores/epgStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getCurrentProgram } from '../utils/xmltvParser'
import { getProgramProgress } from '../utils/formatters'
import { resolveChannelUrl } from '../utils/stalkerApi'
import type { Channel } from '../types'
import AddPlaylistModal from './AddPlaylistModal'
import tvLogoFallback from '../assets/tvlogo.png'

function ChannelLogo({ src }: { src?: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const showFallback = !src || failed
  return showFallback ? (
    <img src={tvLogoFallback} alt="" className="w-full h-full object-contain" />
  ) : (
    <img
      src={src}
      alt=""
      className="w-full h-full object-contain"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

interface RowProps {
  index: number
  style: React.CSSProperties
  data: {
    channels: Channel[]
    activeId: string | null
    onPlay: (ch: Channel) => void
    onFavorite: (id: string) => void
    onFullscreen: () => void
    epgMap: Map<string, import('../types').EpgChannel>
    focusedIndex: number
    onFocusIndex: (i: number) => void
  }
}

function ChannelRow({ index, style, data }: RowProps): JSX.Element {
  const ch = data.channels[index]
  const isActive = ch.id === data.activeId
  const isFocused = data.focusedIndex === index
  const epgCh = ch.tvgId ? data.epgMap.get(ch.tvgId) : undefined
  const current = epgCh ? getCurrentProgram(epgCh.programs) : null
  const progress = current ? getProgramProgress(current.start, current.end) : 0
  const rowRef = useRef<HTMLDivElement>(null)
  const isAndroid = window.api?.platform === 'android'

  // ── Long-press context menu ───────────────────────────────────────────────
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { settings } = useSettingsStore()

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only start long-press timer when menu is closed
    if (menuPos) return
    const x = e.clientX, y = e.clientY
    longPressTimer.current = setTimeout(() => setMenuPos({ x, y }), 600)
  }
  const handlePointerUp = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  const handleOpenExternal = async () => {
    setMenuPos(null)
    try {
      const streamUrl = ch.stalkerCmd ? await resolveChannelUrl(ch) : ch.url
      // On Android the path can be empty — the system app picker handles it
      const player = settings.externalPlayers.find((p) => p.name === settings.defaultExternalPlayer)
      await window.api.player.openExternal(player?.path || '', streamUrl)
    } catch { /* ignore */ }
  }

  // Auto-focus first menu button when menu opens
  useEffect(() => {
    if (!menuPos) return
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('button')?.focus()
    })
  }, [menuPos])

  // Close menu on Android back button or Escape key
  useEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
    }
    window.addEventListener('androidback', close)
    window.addEventListener('keydown', onKey, true) // capture so we beat other handlers
    return () => {
      window.removeEventListener('androidback', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menuPos])

  // ── Double-click detection: single click = play, double click = play + fullscreen ──
  // Uses a 280ms timer so the second click cancels the first before play fires.
  // On TV (D-pad), Enter key always does single-play; double-click only applies to touch/mouse.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleClick = () => {
    if (clickTimerRef.current) {
      // Double-click: cancel the pending single-click, play + go fullscreen
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      data.onPlay(ch)
      data.onFullscreen()
    } else {
      // First click: wait to see if a second click arrives
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        data.onPlay(ch)
      }, 280)
    }
  }

  // When this row becomes the focused index, auto-focus the DOM element
  useEffect(() => {
    if (isFocused) rowRef.current?.focus()
  }, [isFocused])

  return (
    <div style={style}>
      {/* Long-press context menu — portalled to document.body so it escapes react-window
          clipping and the zoom:0.72 container. Focus is managed explicitly for TV D-pad. */}
      {menuPos && createPortal(
        <AnimatePresence>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenuPos(null)}
          />
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed',
              top: Math.min(menuPos.y, window.innerHeight - 160),
              left: Math.min(menuPos.x, window.innerWidth - 220),
              zIndex: 9999,
              background: 'var(--bg-surface)',
              borderRadius: 12,
              border: '1px solid var(--border-hard)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              minWidth: 210,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') { setMenuPos(null); return }
              const btns = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button') || [])
              const idx = btns.indexOf(document.activeElement as HTMLElement)
              if (e.key === 'ArrowDown') { e.preventDefault(); btns[Math.min(idx + 1, btns.length - 1)]?.focus() }
              if (e.key === 'ArrowUp') { e.preventDefault(); btns[Math.max(idx - 1, 0)]?.focus() }
              // Explicitly fire the focused button on Enter/Space — ensures reliable
              // activation on Android TV where native button-click-on-Enter can be unreliable.
              if ((e.key === 'Enter' || e.key === ' ') && idx >= 0) {
                e.preventDefault()
                btns[idx].click()
              }
            }}
          >
            <div style={{ padding: '6px 0' }}>
              {/* Add / Remove Favorites */}
              <button
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '12px 16px', background: 'transparent',
                  border: 'none', color: 'var(--text-primary)', fontSize: 13,
                  cursor: 'pointer', textAlign: 'left',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                onClick={(e) => { e.stopPropagation(); data.onFavorite(ch.id); setMenuPos(null) }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill={ch.isFavorite ? '#f5a623' : 'none'} stroke={ch.isFavorite ? '#f5a623' : 'currentColor'} strokeWidth="1.5">
                  <path d="M7 1l1.6 3.2 3.4.5-2.5 2.4.6 3.4L7 9l-3.1 1.5.6-3.4L2 4.7l3.4-.5L7 1z"/>
                </svg>
                {ch.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              {/* Open in External Player */}
              <button
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '12px 16px', background: 'transparent',
                  border: 'none', color: 'var(--text-primary)', fontSize: 13,
                  cursor: 'pointer', textAlign: 'left',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                onClick={(e) => { e.stopPropagation(); handleOpenExternal() }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8"/>
                  <path d="M9 1h4v4"/><line x1="6" y1="8" x2="13" y2="1"/>
                </svg>
                Open in External Player
              </button>
              <div style={{ height: 1, background: 'var(--border-hard)', margin: '4px 0' }} />
              {/* Cancel */}
              <button
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '12px 16px', background: 'transparent',
                  border: 'none', color: 'var(--text-secondary)', fontSize: 13,
                  cursor: 'pointer', textAlign: 'left',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                onClick={(e) => { e.stopPropagation(); setMenuPos(null) }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      <motion.div
        ref={rowRef}
        tabIndex={0}
        className={`channel-row ${isActive ? 'active' : ''}`}
        style={{ margin: '1px 8px' }}
        onClick={handleClick}
        whileTap={{ scale: 0.98 }}
        onFocus={() => data.onFocusIndex(index)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => { e.preventDefault(); setMenuPos({ x: e.clientX, y: e.clientY }) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            // If this channel is already playing, a second Enter enters fullscreen.
            // If not, start playing it.
            if (isActive) data.onFullscreen()
            else data.onPlay(ch)
          }
          if (e.key === 'ContextMenu') { e.preventDefault(); const r = rowRef.current?.getBoundingClientRect(); if (r) setMenuPos({ x: r.left + r.width / 2, y: r.bottom }) }
          if (e.key === 'ArrowDown') { e.preventDefault(); data.onFocusIndex(Math.min(index + 1, data.channels.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); data.onFocusIndex(Math.max(index - 1, 0)) }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            const nav = document.querySelector<HTMLElement>('[data-tv-sidebar] .nav-item')
            nav?.focus()
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            document.querySelector<HTMLElement>('[data-tv-player]')?.focus()
          }
        }}
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
          <ChannelLogo src={ch.logo} />
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
  const { channel: currentChannel, play, setFullscreen } = usePlayerStore()
  const { channels: epgMap } = useEpgStore()
  const [showAdd, setShowAdd] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  const [listHeight, setListHeight] = useState(400)
  // D-pad navigation: track which index has focus (-1 = none)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const isTV = window.api?.platform === 'android' && !!(window as unknown as { __IS_TV__?: boolean }).__IS_TV__

  // TV: auto-focus first channel row as soon as channels are available
  useEffect(() => {
    if (!isTV || filteredChannels.length === 0) return
    setFocusedIndex(0)
  }, [isTV, filteredChannels.length])

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

  // When focused index changes, scroll the virtualized list to that item
  const handleFocusIndex = useCallback((i: number) => {
    setFocusedIndex(i)
    listRef.current?.scrollToItem(i, 'smart')
  }, [])

  const handlePlay = useCallback((ch: Channel) => { play(ch) }, [play])
  const handleFavorite = useCallback((id: string) => { toggleFavorite(id) }, [toggleFavorite])
  const handleFullscreen = useCallback(() => setFullscreen(true), [setFullscreen])

  const itemData = {
    channels: filteredChannels,
    activeId: currentChannel?.id || null,
    onPlay: handlePlay,
    onFavorite: handleFavorite,
    onFullscreen: handleFullscreen,
    epgMap,
    focusedIndex,
    onFocusIndex: handleFocusIndex,
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
          tabIndex={isTV ? -1 : 0}
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
      {/* ROLLBACK row height: change itemSize back to 54 */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <List
          ref={listRef}
          height={listHeight}
          itemCount={filteredChannels.length}
          itemSize={isTV ? 42 : 54}
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
