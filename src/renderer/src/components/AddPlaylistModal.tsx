import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlaylistStore } from '../stores/playlistStore'

type Mode = 'url' | 'file' | 'xtream'

interface Props {
  onClose: () => void
}

export default function AddPlaylistModal({ onClose }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('url')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // URL form
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [refresh, setRefresh] = useState(24)

  // Xtream form
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const { addM3UFromUrl, addM3UFromFile, addXtream } = usePlaylistStore()

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      if (mode === 'url') {
        if (!url) throw new Error('URL is required')
        await addM3UFromUrl(name || 'My Playlist', url, refresh)
      } else if (mode === 'file') {
        await addM3UFromFile()
      } else {
        if (!server || !username || !password) throw new Error('All fields required')
        await addXtream(name || 'Xtream', server, username, password)
      }
      onClose()
    } catch (e) {
      setError(String(e).replace('Error: ', ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="neu-raised p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-xl font-bold text-metallic mb-1"
          style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}
        >
          Add Playlist
        </h2>
        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
          Add an M3U playlist or Xtream Codes account
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-inset)' }}>
          {(['url', 'file', 'xtream'] as Mode[]).map((m) => (
            <motion.button
              key={m}
              className="flex-1 text-xs py-1.5 rounded-lg font-medium"
              style={{
                background: mode === m ? 'rgba(255,255,255,0.8)' : 'transparent',
                color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
                boxShadow: mode === m ? 'var(--shadow-raised-sm)' : 'none',
              }}
              onClick={() => setMode(m)}
              whileTap={{ scale: 0.97 }}
            >
              {m === 'url' ? 'M3U URL' : m === 'file' ? 'Local File' : 'Xtream Codes'}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {mode === 'url' && (
              <>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Playlist Name</label>
                  <input
                    className="input"
                    placeholder="My IPTV"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>M3U URL *</label>
                  <input
                    className="input"
                    placeholder="http://example.com/playlist.m3u8"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Auto-refresh every {refresh}h
                  </label>
                  <input
                    type="range" min={0} max={48} step={6}
                    value={refresh}
                    onChange={(e) => setRefresh(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    <span>Off</span><span>48h</span>
                  </div>
                </div>
              </>
            )}

            {mode === 'file' && (
              <div className="text-center py-4">
                <div
                  className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                  style={{ boxShadow: 'var(--shadow-raised)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
                    <path d="M4 4h8l4 4v10H4V4z"/>
                    <path d="M12 4v4h4"/>
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Click "Add" to browse for an .m3u or .m3u8 file
                </p>
              </div>
            )}

            {mode === 'xtream' && (
              <>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Account Name</label>
                  <input className="input" placeholder="My Xtream" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Server URL *</label>
                  <input className="input" placeholder="http://provider.com:8080" value={server} onChange={(e) => setServer(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Username *</label>
                  <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Password *</label>
                  <input className="input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs mt-3 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(224,82,82,0.08)', color: 'var(--danger)' }}
          >
            {error}
          </motion.p>
        )}

        <div className="flex gap-2 mt-5">
          <motion.button
            className="btn-primary btn flex-1 text-sm"
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                Loading...
              </span>
            ) : (
              'Add Playlist'
            )}
          </motion.button>
          <motion.button
            className="btn-neu btn text-sm px-4"
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
          >
            Cancel
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
