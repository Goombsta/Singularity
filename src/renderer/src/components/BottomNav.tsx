import { useRef } from 'react'
import { motion } from 'framer-motion'
import type { SidebarView } from '../types'
import { usePlayerStore } from '../stores/playerStore'

const NAV_ITEMS: { id: SidebarView; label: string; icon: JSX.Element }[] = [
  {
    id: 'live',
    label: 'Live',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="2.5" width="13" height="9" rx="1.5"/>
        <path d="M4.5 12.5v1.5M10.5 12.5v1.5M2.5 14h10"/>
      </svg>
    ),
  },
  {
    id: 'vod',
    label: 'Movies',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1.5" width="13" height="12" rx="1.5"/>
        <path d="M1 5.5h13M4.5 1.5v4M10.5 1.5v4"/>
      </svg>
    ),
  },
  {
    id: 'series',
    label: 'Series',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 3.5h11M2 7.5h7.5M2 11.5h9.5"/>
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Playlists',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 3.5h7M2 7.5h5.5M2 11.5h7"/>
        <path d="M10.5 8.5l1.5 1.5 2.5-2.5"/>
      </svg>
    ),
  },
  {
    id: 'epg',
    label: 'EPG Guide',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1.5" width="13" height="12" rx="1.5"/>
        <path d="M4.5 1.5v3M10.5 1.5v3M1 6.5h13"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7.5" cy="7.5" r="2"/>
        <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.2 3.2l1.1 1.1M10.7 10.7l1.1 1.1M3.2 11.8l1.1-1.1M10.7 4.3l1.1-1.1"/>
      </svg>
    ),
  },
]

interface Props {
  view: SidebarView
  onViewChange: (v: SidebarView) => void
}

export default function BottomNav({ view, onViewChange }: Props): JSX.Element {
  const { isMultiview, toggleMultiview } = usePlayerStore()
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleNavClick = (newView: SidebarView | 'multiview') => {
    if (newView === 'multiview') {
      toggleMultiview()
      return
    }
    // Exit multiview when switching to any other view
    if (isMultiview) toggleMultiview()
    onViewChange(newView)
  }

  const multiviewItem = {
    id: 'multiview' as const,
    label: 'Multiview',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="7" height="7" rx="1"/>
        <rect x="10" y="1" width="7" height="7" rx="1"/>
        <rect x="1" y="10" width="7" height="7" rx="1"/>
        <rect x="10" y="10" width="7" height="7" rx="1"/>
      </svg>
    ),
  }

  // Insert Multiview before Settings (last item)
  const allItems = [
    ...NAV_ITEMS.slice(0, -1),
    multiviewItem,
    NAV_ITEMS[NAV_ITEMS.length - 1],
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-hard)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {allItems.map((item, idx) => {
        const isActive = item.id === 'multiview'
          ? isMultiview
          : (view === item.id && !isMultiview)
        return (
          <motion.button
            key={item.id}
            ref={(el) => { btnRefs.current[idx] = el }}
            tabIndex={0}
            onClick={() => handleNavClick(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                const next = btnRefs.current[idx + 1]
                next?.focus()
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                const prev = btnRefs.current[idx - 1]
                prev?.focus()
              }
            }}
            whileTap={{ scale: 0.92 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 2px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'color 150ms',
              minHeight: 52,
              position: 'relative',
            }}
          >
            {item.icon}
            <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, letterSpacing: 0.2 }}>
              {item.label}
            </span>
            {isActive && (
              <motion.div
                layoutId="bottom-nav-indicator"
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  background: 'var(--accent)',
                }}
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
