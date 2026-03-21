import { useRef, useEffect, useCallback, useState } from 'react'
import Hls from 'hls.js'
import { motion } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import type { MultiviewLayout } from '../stores/playerStore'
import type { MultiviewPanel, Channel } from '../types'

interface MiniPlayerProps {
  panel: MultiviewPanel
  allChannels: Channel[]
}

function MiniPlayer({ panel, allChannels }: MiniPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { setPrimaryPanel, togglePanelMute, setMultiviewChannel } = usePlayerStore()

  // Category → channel two-step selector
  const categories = [...new Set(allChannels.map((c) => c.group))].sort()
  const [selCategory, setSelCategory] = useState<string>('')
  const channelsInCat = selCategory
    ? allChannels.filter((c) => c.group === selCategory)
    : []

  const loadChannel = useCallback(
    (ch: Channel) => {
      setMultiviewChannel(panel.id, ch)
      const video = videoRef.current
      if (!video) return

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      if (Hls.isSupported() && (ch.url.includes('.m3u8') || ch.url.includes('/live/'))) {
        const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 30 })
        hlsRef.current = hls
        hls.loadSource(ch.url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      } else {
        video.src = ch.url
        video.play().catch(() => {})
      }

      video.muted = panel.isMuted
    },
    [panel.id, panel.isMuted, setMultiviewChannel]
  )

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = panel.isMuted
  }, [panel.isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) hlsRef.current.destroy()
    }
  }, [])

  const prevChannel = () => {
    const pool = selCategory ? channelsInCat : allChannels
    const idx = pool.findIndex((c) => c.id === panel.channel?.id)
    const prev = idx > 0 ? idx - 1 : pool.length - 1
    if (pool[prev]) loadChannel(pool[prev])
  }

  const nextChannel = () => {
    const pool = selCategory ? channelsInCat : allChannels
    const idx = pool.findIndex((c) => c.id === panel.channel?.id)
    const next = idx < pool.length - 1 ? idx + 1 : 0
    if (pool[next]) loadChannel(pool[next])
  }

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

      {/* Controls overlay — visible on hover */}
      <div
        className="absolute bottom-0 inset-x-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: 'linear-gradient(to top, rgba(4,5,12,0.97) 0%, transparent 100%)',
          padding: '28px 8px 8px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Channel name + prev/next */}
        <div className="flex items-center gap-1 mb-1.5">
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
            {panel.channel?.name || 'No channel selected'}
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

        {/* Row 1: Category dropdown */}
        <select
          className="w-full text-xs rounded-md px-2 py-1 mb-1"
          style={{
            background: 'rgba(14,16,28,0.97)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.18)',
            outline: 'none',
            cursor: 'pointer',
          }}
          value={selCategory}
          onChange={(e) => setSelCategory(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="" style={{ background: '#0e1020', color: '#ccc' }}>— Select category —</option>
          {categories.map((cat) => (
            <option key={cat} value={cat} style={{ background: '#0e1020', color: '#eee' }}>
              {cat}
            </option>
          ))}
        </select>

        {/* Row 2: Channel dropdown + mute */}
        <div className="flex items-center gap-1">
          <select
            className="flex-1 text-xs rounded-md px-2 py-1"
            style={{
              background: 'rgba(14,16,28,0.97)',
              color: selCategory ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.18)',
              outline: 'none',
              cursor: selCategory ? 'pointer' : 'default',
            }}
            value={panel.channel?.id || ''}
            disabled={!selCategory}
            onChange={(e) => {
              const ch = channelsInCat.find((c) => c.id === e.target.value)
              if (ch) loadChannel(ch)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="" style={{ background: '#0e1020', color: '#ccc' }}>
              {selCategory ? '— Select channel —' : '← Pick a category first'}
            </option>
            {channelsInCat.map((ch) => (
              <option key={ch.id} value={ch.id} style={{ background: '#0e1020', color: '#eee' }}>
                {ch.name}
              </option>
            ))}
          </select>

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
    id: '2h',
    label: '2 Horizontal',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1" y="3" width="6" height="10" rx="1"/>
        <rect x="9" y="3" width="6" height="10" rx="1"/>
      </svg>
    ),
  },
  {
    id: '2v',
    label: '2 Vertical',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="1" width="12" height="6" rx="1"/>
        <rect x="2" y="9" width="12" height="6" rx="1"/>
      </svg>
    ),
  },
  {
    id: '3',
    label: '3 Panels',
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
    label: '4 Panels',
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
  // In 3-panel layout, first panel spans both columns across the top
  if (layout === '3' && panelIndex === 0) return { gridColumn: '1 / 3' }
  return {}
}

function getVisiblePanelCount(layout: MultiviewLayout): number {
  if (layout === '2h' || layout === '2v') return 2
  if (layout === '3') return 3
  return 4
}

export default function Multiview(): JSX.Element {
  const { multiviewPanels, multiviewLayout, toggleMultiview, setMultiviewLayout } = usePlayerStore()
  const { filteredChannels } = usePlaylistStore()

  const visibleCount = getVisiblePanelCount(multiviewLayout)
  const visiblePanels = multiviewPanels.slice(0, visibleCount)

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 gap-4">
        <div>
          <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
            Multiview
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Hover a panel · Pick category → channel · ← → to browse
          </p>
        </div>

        {/* Layout selector */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {LAYOUTS.map((l) => (
            <motion.button
              key={l.id}
              className="btn flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: multiviewLayout === l.id ? 'rgba(91,127,166,0.2)' : 'var(--bg-surface)',
                color: multiviewLayout === l.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: multiviewLayout === l.id ? '1px solid rgba(91,127,166,0.4)' : '1px solid var(--border-hard)',
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMultiviewLayout(l.id)}
              title={l.label}
            >
              {l.icon}
              <span style={{ fontSize: 10 }}>{l.label}</span>
            </motion.button>
          ))}
        </div>

        <motion.button
          className="btn-neu btn text-xs px-3 py-1.5 flex-shrink-0"
          whileTap={{ scale: 0.97 }}
          onClick={toggleMultiview}
        >
          Exit
        </motion.button>
      </div>

      {/* Grid — min-h-0 prevents flex children from overflowing the container */}
      <div className="flex-1 grid gap-3 min-h-0" style={getGridStyle(multiviewLayout)}>
        {visiblePanels.map((panel, i) => (
          <div key={panel.id} className="min-h-0 h-full" style={getPanelStyle(multiviewLayout, i)}>
            <MiniPlayer panel={panel} allChannels={filteredChannels} />
          </div>
        ))}
      </div>
    </div>
  )
}
