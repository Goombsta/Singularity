import { useRef, useEffect, useCallback, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { motion } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import type { MultiviewLayout } from '../stores/playerStore'
import type { MultiviewPanel, Channel } from '../types'

interface MiniPlayerProps {
  panel: MultiviewPanel
  allChannels: Channel[]
}

/** How long (ms) a panel must be stalled before we reconnect. */
const STALL_TIMEOUT_MS = 10_000

function MiniPlayer({ panel, allChannels }: MiniPlayerProps): JSX.Element {
  // Must be inside component so window.api is already set by main.tsx
  const isAndroid = window.api?.platform === 'android'

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs so event listeners always see the latest values without re-registration
  const channelRef = useRef(panel.channel)
  const nextChannelRef = useRef<() => void>(() => {})

  const [reconnecting, setReconnecting] = useState(false)

  const { setPrimaryPanel, togglePanelMute, setMultiviewChannel, setPanelVolume } = usePlayerStore()

  // Category → channel two-step selector
  const categories = [...new Set(allChannels.map((c) => c.group))].sort()
  const [selCategory, setSelCategory] = useState<string>('')
  const [channelSearch, setChannelSearch] = useState('')
  const channelsInCat = selCategory ? allChannels.filter((c) => c.group === selCategory) : []
  const filteredInCat = channelSearch
    ? channelsInCat.filter((c) => c.name.toLowerCase().includes(channelSearch.toLowerCase()))
    : channelsInCat

  const loadChannel = useCallback(
    (ch: Channel) => {
      setMultiviewChannel(panel.id, ch)
      // Cancel any pending reconnect when loading a new (or same) channel
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const video = videoRef.current
      if (!video) return

      // Destroy existing players
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy()
        mpegtsRef.current = null
      }
      video.src = ''

      const url = ch.url
      const isHls = url.includes('.m3u8') || (url.includes('/live/') && !url.endsWith('.ts'))
      const isMpegTs = url.endsWith('.ts')

      // Always mute before play — required for Android autoplay policy.
      // The mute/volume useEffects will restore the panel's preferences after load.
      video.muted = true
      video.volume = panel.volume

      if (Hls.isSupported() && isHls) {
        const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 30 })
        hlsRef.current = hls
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
        })
      } else if (isMpegTs) {
        const player = mpegts.createPlayer(
          { type: 'mpegts', url, isLive: true },
          {
            enableWorker: false,
            liveBufferLatencyChasing: false,
            autoCleanupSourceBuffer: true,
            autoCleanupMinBackwardDuration: 3,
            autoCleanupMaxBackwardDuration: 6,
            fixAudioTimestampGap: false,
          }
        )
        mpegtsRef.current = player
        player.attachMediaElement(video)
        player.load()
        video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true })
      } else {
        video.src = url
        video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true })
      }
    },
    [panel.id, panel.volume, setMultiviewChannel]
  )

  // Keep refs in sync with latest values so event handlers never go stale
  useEffect(() => { channelRef.current = panel.channel }, [panel.channel])

  const prevChannel = useCallback(() => {
    const pool = selCategory ? channelsInCat : allChannels
    const idx = pool.findIndex((c) => c.id === panel.channel?.id)
    const prev = idx > 0 ? idx - 1 : pool.length - 1
    if (pool[prev]) loadChannel(pool[prev])
  }, [selCategory, channelsInCat, allChannels, panel.channel, loadChannel])

  const nextChannel = useCallback(() => {
    const pool = selCategory ? channelsInCat : allChannels
    const idx = pool.findIndex((c) => c.id === panel.channel?.id)
    const next = idx < pool.length - 1 ? idx + 1 : 0
    if (pool[next]) loadChannel(pool[next])
  }, [selCategory, channelsInCat, allChannels, panel.channel, loadChannel])

  useEffect(() => { nextChannelRef.current = nextChannel }, [nextChannel])

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = panel.isMuted
  }, [panel.isMuted])

  // Sync volume level
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = panel.volume
  }, [panel.volume])

  // ── Auto-reconnect on stall / daisy-chain on stream end ──────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const clearTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      clearTimer()
      if (!channelRef.current) return
      reconnectTimerRef.current = setTimeout(() => {
        const ch = channelRef.current
        if (ch) {
          setReconnecting(true)
          loadChannel(ch)
        }
      }, STALL_TIMEOUT_MS)
    }

    const onWaiting = () => scheduleReconnect()
    const onStalled = () => scheduleReconnect()
    const onPlaying = () => { clearTimer(); setReconnecting(false) }
    // Daisy-chain: stream ended → advance to next channel automatically
    const onEnded = () => nextChannelRef.current()
    const onError = () => scheduleReconnect()

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      clearTimer()
    }
  }, [loadChannel])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) hlsRef.current.destroy()
      if (mpegtsRef.current) mpegtsRef.current.destroy()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [])

  // Pre-select category when panel already has a channel
  useEffect(() => {
    if (panel.channel && !selCategory) {
      setSelCategory(panel.channel.group)
    }
  }, [panel.channel])

  return (
    <motion.div
      className="relative rounded-xl overflow-hidden group w-full h-full"
      style={{
        background: '#06080f',
        border: panel.isPrimary ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: panel.isPrimary ? '0 0 24px rgba(91,127,166,0.35)' : 'none',
      }}
      whileHover={{ scale: 1.005 }}
      onClick={() => setPrimaryPanel(panel.id)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted={panel.isMuted}
        playsInline
      />

      {/* Empty panel prompt */}
      {!panel.channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
            <rect x="2" y="4" width="24" height="18" rx="3"/>
            <path d="M10 14l6-4v8l-6-4z" fill="rgba(255,255,255,0.3)" stroke="none"/>
          </svg>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Select a category, then a channel</p>
        </div>
      )}

      {/* Reconnecting overlay */}
      {reconnecting && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full pointer-events-none"
          style={{ background: 'rgba(4,5,12,0.85)', border: '1px solid rgba(255,255,255,0.12)', zIndex: 20 }}>
          <div className="animate-spin rounded-full"
            style={{ width: 8, height: 8, border: '1.5px solid transparent', borderTopColor: 'var(--accent)' }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>Reconnecting…</span>
        </div>
      )}

      {/* Controls overlay — always visible on Android (no hover on touch), hover-only on desktop */}
      <div
        className={`absolute bottom-0 inset-x-0 transition-opacity ${isAndroid ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{
          background: 'linear-gradient(to top, rgba(4,5,12,0.97) 0%, transparent 100%)',
          padding: isAndroid ? '20px 6px 6px' : '28px 8px 8px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Channel name + prev/next */}
        <div className="flex items-center gap-1 mb-1">
          <motion.button
            className="btn w-6 h-6 rounded-md flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); prevChannel() }}
            title="Previous channel"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="5,1 2,4 5,7"/>
            </svg>
          </motion.button>

          <p className="flex-1 text-xs text-white truncate text-center font-medium">
            {panel.channel?.name || 'No channel'}
          </p>

          <motion.button
            className="btn w-6 h-6 rounded-md flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); nextChannel() }}
            title="Next channel"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="3,1 6,4 3,7"/>
            </svg>
          </motion.button>
        </div>

        {/* Category dropdown */}
        <select
          className="w-full text-xs rounded-md px-2 mb-1"
          style={{
            background: 'rgba(14,16,28,0.97)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.18)',
            outline: 'none',
            cursor: 'pointer',
            height: 26,
          }}
          value={selCategory}
          onChange={(e) => { setSelCategory(e.target.value); setChannelSearch('') }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="" style={{ background: '#0e1020', color: '#ccc' }}>— Select category —</option>
          {categories.map((cat) => (
            <option key={cat} value={cat} style={{ background: '#0e1020', color: '#eee' }}>
              {cat}
            </option>
          ))}
        </select>

        {/* Channel search — shown after category selected */}
        {selCategory && (
          <input
            type="text"
            placeholder="Search channels..."
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs rounded-md px-2 mb-1"
            style={{
              background: 'rgba(14,16,28,0.97)',
              color: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(255,255,255,0.18)',
              outline: 'none',
              height: 26,
            }}
          />
        )}

        {/* Channel dropdown + volume + mute */}
        <div className="flex items-center gap-1">
          <select
            className="flex-1 text-xs rounded-md px-2"
            style={{
              background: 'rgba(14,16,28,0.97)',
              color: selCategory ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.18)',
              outline: 'none',
              cursor: selCategory ? 'pointer' : 'default',
              height: 26,
            }}
            value={panel.channel?.id || ''}
            disabled={!selCategory}
            onChange={(e) => {
              const ch = filteredInCat.find((c) => c.id === e.target.value)
              if (ch) loadChannel(ch)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="" style={{ background: '#0e1020', color: '#ccc' }}>
              {selCategory ? '— Select channel —' : '← Pick a category first'}
            </option>
            {filteredInCat.map((ch) => (
              <option key={ch.id} value={ch.id} style={{ background: '#0e1020', color: '#eee' }}>
                {ch.name}
              </option>
            ))}
          </select>

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={panel.isMuted ? 0 : panel.volume}
            onChange={(e) => {
              e.stopPropagation()
              setPanelVolume(panel.id, parseFloat(e.target.value))
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title={`Volume: ${Math.round((panel.isMuted ? 0 : panel.volume) * 100)}%`}
            style={{
              width: 60,
              flexShrink: 0,
              WebkitAppearance: 'none',
              appearance: 'none',
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(to right, rgba(255,255,255,0.85) ${(panel.isMuted ? 0 : panel.volume) * 100}%, rgba(255,255,255,0.25) ${(panel.isMuted ? 0 : panel.volume) * 100}%)`,
              outline: 'none',
              cursor: 'pointer',
            }}
          />

          {/* Mute toggle */}
          <motion.button
            className="btn w-7 h-7 rounded-md flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); togglePanelMute(panel.id) }}
            title={panel.isMuted ? 'Unmute' : 'Mute'}
          >
            {panel.isMuted ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round">
                <path d="M1 3.5h2l2.5-2v7L3 6.5H1V3.5z"/>
                <line x1="7" y1="3" x2="9.5" y2="7.5"/>
                <line x1="9.5" y1="3" x2="7" y2="7.5"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round">
                <path d="M1 3.5h2l2.5-2v7L3 6.5H1V3.5z"/>
                <path d="M7 3.5a2.5 2.5 0 010 3"/>
              </svg>
            )}
          </motion.button>
        </div>
      </div>

      {/* Primary badge */}
      {panel.isPrimary && (
        <div className="absolute top-2 left-2">
          <span className="badge badge-live" style={{ fontSize: 9 }}>PRIMARY</span>
        </div>
      )}
    </motion.div>
  )
}

// ── Layout config ──────────────────────────────────────────────────────────

const LAYOUTS: { id: MultiviewLayout; label: string; icon: JSX.Element }[] = [
  {
    id: '2v',
    label: '2V',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="1" width="12" height="6" rx="1"/>
        <rect x="2" y="9" width="12" height="6" rx="1"/>
      </svg>
    ),
  },
  {
    id: '2h',
    label: '2H',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1" y="3" width="6" height="10" rx="1"/>
        <rect x="9" y="3" width="6" height="10" rx="1"/>
      </svg>
    ),
  },
  {
    id: '3',
    label: '3',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1" y="1" width="7" height="14" rx="1"/>
        <rect x="9" y="1" width="6" height="6" rx="1"/>
        <rect x="9" y="9" width="6" height="6" rx="1"/>
      </svg>
    ),
  },
  {
    id: '4',
    label: '4',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1" y="1" width="6" height="6" rx="1"/>
        <rect x="9" y="1" width="6" height="6" rx="1"/>
        <rect x="1" y="9" width="6" height="6" rx="1"/>
        <rect x="9" y="9" width="6" height="6" rx="1"/>
      </svg>
    ),
  },
]

function getGridStyle(layout: MultiviewLayout): React.CSSProperties {
  switch (layout) {
    case '2h': return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
    case '2v': return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' }
    case '3':  return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '2fr 1fr' }
    case '4':  return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
  }
}

function getPanelStyle(layout: MultiviewLayout, panelIndex: number): React.CSSProperties {
  if (layout === '3' && panelIndex === 0) return { gridColumn: '1 / 3' }
  return {}
}

function getVisiblePanelCount(layout: MultiviewLayout): number {
  if (layout === '2h' || layout === '2v') return 2
  if (layout === '3') return 3
  return 4
}

export default function Multiview(): JSX.Element {
  // Must be inside component so window.api is already set by main.tsx
  const isAndroid = window.api?.platform === 'android'

  const { multiviewPanels, multiviewLayout, toggleMultiview, setMultiviewLayout } = usePlayerStore()
  const { playlists, activePlaylistId, setSearchQuery } = usePlaylistStore()

  // On Android portrait, default to 2v (stacked) — much better than side-by-side
  useEffect(() => {
    if (isAndroid && (multiviewLayout === '4' || multiviewLayout === '2h')) {
      setMultiviewLayout('2v')
    }
  }, [])

  // Use the raw unfiltered live channels so Live TV search/group selection doesn't limit Multiview
  const filteredChannels = (() => {
    const playlist = playlists.find((p) => p.id === activePlaylistId)
    const all = playlist?.channels || []
    return all.filter((c) => !c.streamType || c.streamType === 'live')
  })()

  const visibleCount = getVisiblePanelCount(multiviewLayout)
  const visiblePanels = multiviewPanels.slice(0, visibleCount)

  const handleExit = () => {
    setSearchQuery('')
    toggleMultiview()
  }

  return (
    <div className="flex flex-col h-full gap-2" style={{ padding: isAndroid ? '8px' : '16px', paddingBottom: isAndroid ? 4 : 12 }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 gap-2">
        {!isAndroid && (
          <div className="flex-shrink-0">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              Multiview
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Hover a panel · Pick category → channel · ← → to browse
            </p>
          </div>
        )}

        {/* Layout selector */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {LAYOUTS.map((l) => (
            <motion.button
              key={l.id}
              className="btn flex flex-col items-center gap-0.5 rounded-lg"
              style={{
                background: multiviewLayout === l.id ? 'rgba(91,127,166,0.2)' : 'var(--bg-surface)',
                color: multiviewLayout === l.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: multiviewLayout === l.id ? '1px solid rgba(91,127,166,0.4)' : '1px solid var(--border-hard)',
                padding: isAndroid ? '5px 10px' : '6px 12px',
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMultiviewLayout(l.id)}
              title={l.label}
            >
              {l.icon}
              <span style={{ fontSize: 9 }}>{l.label}</span>
            </motion.button>
          ))}
        </div>

        <motion.button
          className="btn-neu btn text-xs px-3 py-1.5 flex-shrink-0"
          whileTap={{ scale: 0.97 }}
          onClick={handleExit}
        >
          Exit
        </motion.button>
      </div>

      {/* Grid */}
      <div className="flex-1 grid min-h-0" style={{ ...getGridStyle(multiviewLayout), gap: isAndroid ? 6 : 12 }}>
        {visiblePanels.map((panel, i) => (
          <div key={panel.id} className="min-h-0 h-full" style={getPanelStyle(multiviewLayout, i)}>
            <MiniPlayer panel={panel} allChannels={filteredChannels} />
          </div>
        ))}
      </div>
    </div>
  )
}
