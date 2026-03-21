import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function TitleBar(): JSX.Element {
  const [isMax, setIsMax] = useState(false)
  // On macOS, native traffic lights (close/min/max) are shown by the OS — hide our custom buttons
  const isMac = window.api.platform === 'darwin'

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMax)
  }, [])

  const handleMaximize = async () => {
    await window.api.window.maximize()
    setIsMax(await window.api.window.isMaximized())
  }

  return (
    <div
      className="flex items-center justify-between h-10 px-4 select-none flex-shrink-0"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-hard)',
        // @ts-ignore - Electron drag region
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Logo + Title */}
      <div className="flex items-center gap-2">
        {/* Black hole logo mark */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {/* Accretion disk */}
            <ellipse cx="9" cy="9" rx="8.5" ry="3.2" fill="rgba(180,210,255,0.18)"/>
            <ellipse cx="9" cy="9" rx="6.5" ry="2.2" fill="rgba(200,225,255,0.28)"/>
            <ellipse cx="9" cy="9" rx="4.5" ry="1.4" fill="rgba(220,235,255,0.40)"/>
            {/* Event horizon */}
            <circle cx="9" cy="9" r="3.2" fill="#06080f"/>
            {/* Inner bright ring */}
            <ellipse cx="9" cy="9" rx="3.6" ry="1.1" stroke="rgba(210,230,255,0.7)" strokeWidth="0.6" fill="none"/>
          </svg>
        </div>
        <span
          className="text-sm font-bold"
          style={{ fontFamily: 'Syne', letterSpacing: '-0.02em', color: 'var(--accent)' }}
        >
          Singularity
        </span>
      </div>

      {/* Window controls — hidden on macOS (native traffic lights used instead) */}
      {!isMac && (
        <div
          className="flex items-center gap-1"
          // @ts-ignore - Electron no-drag region
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Minimize */}
          <motion.button
            className="btn w-7 h-7 rounded-md"
            style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            whileHover={{ background: 'rgba(0,0,0,0.06)' }}
            whileTap={{ scale: 0.9 }}
            onClick={() => window.api.window.minimize()}
          >
            <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
              <rect width="10" height="2" rx="1"/>
            </svg>
          </motion.button>

          {/* Maximize */}
          <motion.button
            className="btn w-7 h-7 rounded-md"
            style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            whileHover={{ background: 'rgba(0,0,0,0.06)' }}
            whileTap={{ scale: 0.9 }}
            onClick={handleMaximize}
          >
            {isMax ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="1" width="6" height="6" rx="1"/>
                <path d="M1 3v5a1 1 0 001 1h5"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="8" height="8" rx="1"/>
              </svg>
            )}
          </motion.button>

          {/* Close */}
          <motion.button
            className="btn w-7 h-7 rounded-md"
            style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            whileHover={{ background: 'rgba(224,82,82,0.12)', color: 'var(--danger)' }}
            whileTap={{ scale: 0.9 }}
            onClick={() => window.api.window.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="9" y2="9"/>
              <line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </motion.button>
        </div>
      )}
    </div>
  )
}
