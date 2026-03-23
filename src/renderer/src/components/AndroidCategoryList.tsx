import { motion } from 'framer-motion'
import { usePlaylistStore } from '../stores/playlistStore'

export default function AndroidCategoryList(): JSX.Element {
  const { groups, setActiveGroup } = usePlaylistStore()

  return (
    <div className="flex flex-col flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
      <p
        className="px-4 pb-2 text-xs font-semibold"
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'Syne',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Categories
      </p>
      {groups.map((g, i) => (
        <motion.button
          key={g}
          tabIndex={0}
          whileTap={{ scale: 0.97 }}
          onClick={() => setActiveGroup(g)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveGroup(g) }
            if (e.key === 'ArrowDown') {
              const next = e.currentTarget.parentElement?.children[i + 2] as HTMLElement | undefined
              next?.focus()
            }
            if (e.key === 'ArrowUp') {
              const prev = e.currentTarget.parentElement?.children[i] as HTMLElement | undefined
              prev?.focus()
            }
          }}
          className="flex items-center gap-3 px-4 py-3 text-left w-full"
          style={{ borderBottom: '1px solid var(--border-hard)', outline: 'none' }}
        >
          {g === 'Favorites' ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--accent)" stroke="none">
              <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.1l-3.7 2.2.7-4.1-3-2.9 4.2-.7z" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="1.5"
            >
              <line x1="2" y1="4" x2="12" y2="4" />
              <line x1="2" y1="7" x2="9" y2="7" />
              <line x1="2" y1="10" x2="12" y2="10" />
            </svg>
          )}
          <span className="flex-1 text-sm truncate" style={{ color: 'var(--fg)' }}>
            {g}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
          >
            <path d="M3 2l4 3-4 3" />
          </svg>
        </motion.button>
      ))}
    </div>
  )
}
