import { useState } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import MiniPlayer from './MiniPlayer'

interface Props {
  onGoLive: () => void
}

export default function FloatingPiP({ onGoLive }: Props): JSX.Element {
  const { channel, url } = usePlayerStore()
  const [volume, setVolume] = useState(0) // start muted; slider unmutes

  // Position: starts bottom-right, draggable anywhere
  const x = useMotionValue(typeof window !== 'undefined' ? window.innerWidth - 304 : 500)
  const y = useMotionValue(typeof window !== 'undefined' ? window.innerHeight - 178 : 400)

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
        width: 288,
        height: 162,
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

      {/* Bottom overlay — pointer-down stops propagation so buttons don't start a drag */}
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

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
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

      {/* Drag indicator at top */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-center"
        style={{ height: 16, pointerEvents: 'none' }}
      >
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
