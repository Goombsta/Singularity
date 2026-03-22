import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '../stores/settingsStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useEpgStore } from '../stores/epgStore'
import AddPlaylistModal from './AddPlaylistModal'
declare const __APP_VERSION__: string
const version = __APP_VERSION__

type Tab = 'general' | 'playlists' | 'playback' | 'external' | 'cache' | 'about'

export default function Settings(): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const { settings, update } = useSettingsStore()
  const { playlists, removePlaylist, refreshPlaylist } = usePlaylistStore()
  const { load: loadEpg, clear: clearEpg, lastUpdated } = useEpgStore()
  const [showAddPlaylist, setShowAddPlaylist] = useState(false)

  const [newEpgUrl, setNewEpgUrl] = useState('')
  const [customPlayerPath, setCustomPlayerPath] = useState('')
  const [customPlayerName, setCustomPlayerName] = useState('')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'playback', label: 'Playback' },
    { id: 'external', label: 'External Players' },
    { id: 'cache', label: 'Cache' },
    { id: 'about', label: 'About' },
  ]

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div
        className="flex flex-col gap-0.5 p-3 flex-shrink-0"
        style={{ width: 160, borderRight: '1px solid var(--border-hard)' }}
      >
        <p
          className="px-2 py-1 text-xs font-semibold uppercase mb-1"
          style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}
        >
          Settings
        </p>
        {tabs.map((t) => (
          <motion.button
            key={t.id}
            className={`nav-item text-xs w-full text-left ${tab === t.id ? 'active' : ''}`}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'general' && (
          <div className="space-y-3 max-w-md">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              General
            </h2>

            <Toggle
              label="Dark mode"
              value={settings.darkMode}
              onChange={(v) => update({ darkMode: v })}
            />
            <Toggle
              label="Start minimized"
              value={settings.startMinimized}
              onChange={(v) => update({ startMinimized: v })}
            />
            <Toggle
              label="Minimize to tray on close"
              value={settings.minimizeToTray}
              onChange={(v) => update({ minimizeToTray: v })}
            />
            <Toggle
              label="Enable animations"
              value={settings.animationsEnabled}
              onChange={(v) => update({ animationsEnabled: v })}
            />
          </div>
        )}

        {tab === 'playlists' && (
          <div className="space-y-6 max-w-lg">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              Playlists & EPG
            </h2>

            {/* Playlist list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  My Playlists
                </p>
                <motion.button
                  className="btn-primary btn text-xs px-3 py-1.5"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowAddPlaylist(true)}
                >
                  + Add Playlist
                </motion.button>
              </div>
              {playlists.length === 0 ? (
                <div
                  className="rounded-xl p-6 text-center"
                  style={{ border: '2px dashed var(--border-hard)' }}
                >
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    No playlists added yet
                  </p>
                  <motion.button
                    className="btn-primary btn text-sm"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowAddPlaylist(true)}
                  >
                    Add Your First Playlist
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-2">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="neu-raised p-3 flex flex-col gap-2"
                      style={{ borderRadius: 10 }}
                    >
                      {/* Info row */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {pl.name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {pl.channels.length.toLocaleString()} channels · {pl.type.toUpperCase()}
                          {pl.lastUpdated ? ` · Updated ${new Date(pl.lastUpdated).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      {/* Button row */}
                      <div className="flex gap-2">
                        <motion.button
                          className="btn-neu btn text-xs px-3 py-1.5 flex-1"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => refreshPlaylist(pl.id)}
                        >
                          Refresh
                        </motion.button>
                        <motion.button
                          className="btn text-xs px-3 py-1.5 rounded-lg flex-1"
                          style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => removePlaylist(pl.id)}
                        >
                          Remove
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {showAddPlaylist && <AddPlaylistModal onClose={() => setShowAddPlaylist(false)} />}

            <div className="sep" />

            {/* EPG URLs */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                EPG Sources (XMLTV)
              </p>
              {settings.epgUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <p className="flex-1 text-xs truncate neu-inset px-3 py-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
                    {url}
                  </p>
                  <motion.button
                    className="btn text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => update({ epgUrls: settings.epgUrls.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </motion.button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="https://epg.example.com/xmltv.xml"
                  value={newEpgUrl}
                  onChange={(e) => setNewEpgUrl(e.target.value)}
                />
                <motion.button
                  className="btn-primary btn text-sm px-3"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (newEpgUrl) {
                      update({ epgUrls: [...settings.epgUrls, newEpgUrl] })
                      setNewEpgUrl('')
                    }
                  }}
                >
                  Add
                </motion.button>
              </div>
              {settings.epgUrls.length > 0 && (
                <motion.button
                  className="btn-neu btn text-sm mt-2 w-full"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => loadEpg(settings.epgUrls)}
                >
                  Load EPG Now
                </motion.button>
              )}
            </div>
          </div>
        )}

        {tab === 'playback' && (
          <div className="space-y-3 max-w-md">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              Playback
            </h2>
            <Toggle
              label="Hardware acceleration (DXVA2/D3D11VA)"
              value={settings.hardwareAcceleration}
              onChange={(v) => update({ hardwareAcceleration: v })}
            />
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Buffer size: {settings.bufferSize}s
              </p>
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={settings.bufferSize}
                onChange={(e) => update({ bufferSize: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
        )}

        {tab === 'external' && (
          <div className="space-y-6 max-w-lg">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              External Players
            </h2>

            {settings.externalPlayers.length > 0 ? (
              <div className="space-y-2">
                {settings.externalPlayers.map((p, i) => (
                  <div key={i} className="neu-raised p-3 flex items-center gap-3" style={{ borderRadius: 10 }}>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{p.path}</p>
                    </div>
                    <input
                      type="radio"
                      name="defaultPlayer"
                      checked={settings.defaultExternalPlayer === p.name}
                      onChange={() => update({ defaultExternalPlayer: p.name })}
                    />
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Default</label>
                    <motion.button
                      className="btn text-xs px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => update({ externalPlayers: settings.externalPlayers.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </motion.button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No external players detected. Add one manually below.
              </p>
            )}

            <div className="flex gap-2">
              <input
                className="input text-sm"
                placeholder="Player name (e.g. VLC)"
                value={customPlayerName}
                onChange={(e) => setCustomPlayerName(e.target.value)}
                style={{ width: 140 }}
              />
              <input
                className="input flex-1 text-sm"
                placeholder="Path to executable..."
                value={customPlayerPath}
                onChange={(e) => setCustomPlayerPath(e.target.value)}
              />
              <motion.button
                className="btn-primary btn text-sm px-3"
                whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  if (customPlayerPath && customPlayerName) {
                    await update({
                      externalPlayers: [
                        ...settings.externalPlayers,
                        { name: customPlayerName, path: customPlayerPath },
                      ],
                    })
                    setCustomPlayerPath('')
                    setCustomPlayerName('')
                  }
                }}
              >
                Add
              </motion.button>
            </div>

            <motion.button
              className="btn-neu btn text-sm"
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                const detected = await window.api.player.detectExternal()
                if (detected.length > 0) {
                  const merged = [...settings.externalPlayers]
                  detected.forEach((d) => {
                    if (!merged.find((p) => p.path === d.path)) merged.push(d)
                  })
                  update({ externalPlayers: merged })
                }
              }}
            >
              Auto-detect Players
            </motion.button>
          </div>
        )}

        {tab === 'cache' && (
          <div className="space-y-6 max-w-md">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              Cache
            </h2>
            <div className="neu-raised p-4" style={{ borderRadius: 12 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>EPG Cache</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleString()}` : 'Not loaded'}
              </p>
              <div className="flex gap-2 mt-3">
                {settings.epgUrls.length > 0 && (
                  <motion.button
                    className="btn-primary btn text-xs px-3 py-1.5"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => loadEpg(settings.epgUrls)}
                  >
                    Reload EPG
                  </motion.button>
                )}
                <motion.button
                  className="btn text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={clearEpg}
                >
                  Clear EPG Cache
                </motion.button>
              </div>
            </div>

            <div className="neu-raised p-4" style={{ borderRadius: 12 }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>App Data</p>
              <motion.button
                className="btn text-xs px-3 py-1.5 rounded-lg mt-3"
                style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => window.api.store.clear()}
              >
                Reset All Settings
              </motion.button>
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="space-y-6 max-w-md">
            <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
              About
            </h2>
            <div className="neu-raised p-6 flex flex-col items-center text-center gap-3" style={{ borderRadius: 12 }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ boxShadow: 'var(--shadow-raised)' }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="5"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="5" y2="12"/>
                  <line x1="19" y1="12" x2="22" y2="12"/>
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold" style={{ fontFamily: 'Syne', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Singularity
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  IPTV Player
                </p>
              </div>
              <div
                className="px-4 py-1.5 rounded-full text-sm font-medium"
                style={{ background: 'var(--bg-base)', color: 'var(--accent)', border: '1px solid var(--border-hard)' }}
              >
                v{version}
              </div>
            </div>

            <div className="neu-raised p-4 space-y-3" style={{ borderRadius: 12 }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Version</span>
                <span className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>v{version}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Platform</span>
                <span className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
                  {window.api?.platform ?? 'web'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <motion.button
        className="relative flex-shrink-0 toggle-btn"
        style={{
          width: 36,
          height: 18,
          borderRadius: 9,
          background: value ? 'var(--accent)' : 'var(--bg-surface)',
          boxShadow: value ? '0 1px 6px rgba(91,127,166,0.35)' : 'var(--shadow-inset)',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 200ms',
        }}
        onClick={() => onChange(!value)}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            top: 2,
            width: 14,
            height: 14,
            background: value ? 'white' : '#a8aaad',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
          animate={{ x: value ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      </motion.button>
    </div>
  )
}
