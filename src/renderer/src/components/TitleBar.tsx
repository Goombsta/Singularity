import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import appIcon from '../assets/app-icon.png'

export default function TitleBar(): JSX.Element {
  const [isMax, setIsMax] = useState(false)
  const isMac = window.api.platform === 'darwin'
  // Android has native system bars — hide the entire custom titlebar
  if (window.api.platform === 'android' || window.api.platform === 'ios') return null

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
        {/* App icon */}
        <img src={appIcon} alt="" className="w-5 h-5 flex-shrink-0" style={{ borderRadius: '50%' }} />
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
