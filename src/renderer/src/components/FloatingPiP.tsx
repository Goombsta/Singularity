import { useState, useRef, useCallback } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import MiniPlayer from './MiniPlayer'

interface Props {
  onGoLive: () => void
  onClose: () => void
}

const MIN_W = 240
const MIN_H = 135
const DEFAULT_W = 288
const DEFAULT_H = 162

export default function FloatingPiP({ onGoLive, onClose }: Props): JSX.Element {
  const { channel, url } = usePlayerStore()
  const [volume, setVolume] = useState(0) // start muted; slider unmutes
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })

  // Position: starts bottom-right, draggable anywhere
  const x = useMotionValue(typeof window !== 'undefined' ? window.innerWidth - DEFAULT_W - 16 : 500)
  const y = useMotionValue(typeof window !== 'undefined' ? window.innerHeight - DEFAULT_H - 16 : 400)

  // Resize state
  const isResizing = useRef(false)
  const resizeStart = useRef({ clientX: 0, clientY: 0, w: DEFAULT_W, h: DEFAULT_H, startY: 0 })

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    isResizing.current = true
    resizeStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      w: size.w,
      h: size.h,
      startY: y.get(),
    }

    function onMove(ev: PointerEvent) {
      if (!isResizing.current) return
      const dx = ev.clientX - resizeStart.current.clientX
      const dy = ev.clientY - resizeStart.current.clientY

      // Top-right corner: right = wider, up = taller (bottom edge stays fixed)
      const newW = Math.max(MIN_W, resizeStart.current.w + dx)
      const rawH = resizeStart.current.h - dy
      const newH = Math.max(MIN_H, rawH)
      // Adjust y to keep bottom fixed: newY = startY + dy, clamped to preserve min height
      const newY = rawH < MIN_H
        ? resizeStart.current.startY + resizeStart.current.h - MIN_H
        : resizeStart.current.startY + dy

      setSize({ w: newW, h: newH })
      y.set(newY)
    }

    function onUp() {
      isResizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [size.w, size.h, y])

  if (!channel || !url) return <></>

  const muted = volume === 0

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        x,
        y,
        width: size.w,
        height: size.h,
        zIndex: 40,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'grab',
      }}
      whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
    >
      <MiniPlayer
        url={url}
        muted={muted}
        volume={volume}
        className="absolute inset-0 w-full h-full"
      />

      {/* Top-left: X close button */}
      <div
        className="absolute top-0 left-0 p-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 20,
            height: 20,
            background: 'rgba(0,0,0,0.6)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
          title="Close"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7"/>
            <line x1="7" y1="1" x2="1" y2="7"/>
          </svg>
        </button>
      </div>

      {/* Top-right: resize handle */}
      <div
        className="absolute top-0 right-0 p-1.5"
        onPointerDown={handleResizePointerDown}
        style={{ cursor: 'nesw-resize' }}
        title="Resize"
      >
        <div
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.5,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
            <line x1="9" y1="1" x2="1" y2="9"/>
            <line x1="9" y1="5" x2="5" y2="9"/>
            <line x1="5" y1="1" x2="9" y2="1"/>
          </svg>
        </div>
      </div>

      {/* Bottom overlay — stopPropagation so buttons/sliders don't start a drag */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-2 py-1.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Channel name row */}
        <div className="flex items-center gap-1.5">
          {channel.logo && (
            <img
              src={channel.logo}
              alt=""
              className="w-4 h-4 rounded-full flex-shrink-0 object-contain"
              style={{ background: 'rgba(255,255,255,0.1)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <span
            className="text-white text-xs font-medium truncate flex-1 min-w-0"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
          >
            {channel.name}
          </span>

          {/* Go Live */}
          <button
            onClick={onGoLive}
            className="flex items-center gap-1 px-2 h-5 rounded text-xs font-medium flex-shrink-0"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor">
              <polygon points="1,0 7,4 1,8"/>
            </svg>
            Live
          </button>
        </div>

        {/* Volume row */}
        <div className="flex items-center gap-1.5">
          {/* Mute toggle */}
          <button
            onClick={() => setVolume((v) => v === 0 ? 0.7 : 0)}
            className="flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.8)' }}
          >
            {muted ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2L6 2v8L3 8H1V4z"/>
                <line x1="9" y1="4" x2="11" y2="8"/>
                <line x1="11" y1="4" x2="9" y2="8"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2L6 2v8L3 8H1V4z"/>
                <path d="M8.5 4.5a3 3 0 010 3"/>
              </svg>
            )}
          </button>

          {/* Volume slider — stopPropagation prevents drag from firing */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              WebkitAppearance: 'none',
              appearance: 'none',
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(to right, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.25) ${volume * 100}%)`,
              outline: 'none',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}
