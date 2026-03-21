import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useEpgStore } from '../stores/epgStore'

export default function StatusBar(): JSX.Element {
  const { channel, streamInfo, isPlaying, isLoading, error } = usePlayerStore()
  const { filteredChannels } = usePlaylistStore()
  const { lastUpdated } = useEpgStore()

  return (
    <div
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{
        height: 28,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-hard)',
        fontSize: 11,
      }}
    >
      {/* Left: stream info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: error ? 'var(--danger)' : isLoading ? '#f5a623' : isPlaying ? 'var(--success)' : 'var(--text-secondary)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>
            {error ? 'Error' : isLoading ? 'Buffering' : isPlaying ? 'Playing' : 'Idle'}
          </span>
        </div>

        {channel && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {channel.name}
          </span>
        )}

        {streamInfo.resolution && (
          <span style={{ color: 'var(--text-secondary)' }}>{streamInfo.resolution}</span>
        )}
        {streamInfo.codec && (
          <span style={{ color: 'var(--text-secondary)' }}>{streamInfo.codec}</span>
        )}
        {streamInfo.bitrate && (
          <span style={{ color: 'var(--text-secondary)' }}>{streamInfo.bitrate}</span>
        )}
      </div>

      {/* Right: meta */}
      <div className="flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
        {filteredChannels.length > 0 && (
          <span>{filteredChannels.length.toLocaleString()} channels</span>
        )}
        {lastUpdated && (
          <span>EPG: {new Date(lastUpdated).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  )
}
