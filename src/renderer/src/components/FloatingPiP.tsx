import { useState } from 'react'
import { motion } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import MiniPlayer from './MiniPlayer'

interface Props {
  onGoLive: () => void
}

export default function FloatingPiP({ onGoLive }: Props): JSX.Element {
  const { channel, url } = usePlayerStore()
  const [muted, setMuted] = useState(true)

  if (!channel || !url) return <></>

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed bottom-4 right-4 z-40 rounded-xl overflow-hidden"
      style={{
        width: 288,
        height: 162,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <MiniPlayer url={url} className="absolute inset-0 w-full h-full" />

      {/* Bottom overlay */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-2 py-1.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
      >
        {/* Channel logo + name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
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
            className="text-white text-xs font-medium truncate"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
          >
            {channel.name}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mute toggle */}
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
          >
            {muted ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3.5h1.5L5 1.5v7L2.5 6.5H1V3.5z"/>
                <line x1="7" y1="3" x2="9" y2="7"/>
                <line x1="9" y1="3" x2="7" y2="7"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3.5h1.5L5 1.5v7L2.5 6.5H1V3.5z"/>
                <path d="M7 3.5c.8.5 1.2 1 1.2 1.5S7.8 6 7 6.5"/>
              </svg>
            )}
          </button>

          {/* Go Live */}
          <button
            onClick={onGoLive}
            className="flex items-center gap-1 px-2 h-6 rounded text-xs font-medium"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <polygon points="1,0 7,4 1,8"/>
            </svg>
            Live
          </button>
        </div>
      </div>
    </motion.div>
  )
}
