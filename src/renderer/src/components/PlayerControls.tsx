import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatDuration } from '../utils/formatters'
import CastDevicePicker from './CastDevicePicker'
import { resolveChannelUrl } from '../utils/stalkerApi'
import type { CastDevice } from '../../../shared/castTypes'
import type { RefObject } from 'react'
import type { AudioTrack, SubtitleTrack } from '../stores/playerStore'

interface Props {
  visible: boolean
  videoRef: RefObject<HTMLVideoElement>
  onToggleEpgOverlay?: () => void
}

export default function PlayerControls({ visible, videoRef, onToggleEpgOverlay }: Props): JSX.Element {
  const {
    channel,
    isPlaying,
    isMuted,
    volume,
    isFullscreen,
    isMultiview,
    streamInfo,
    currentTime,
    duration,
    isLive,
    pause,
    resume,
    stop,
    toggleMute,
    setVolume,
    setFullscreen,
    setCurrentTime,
    castDevices,
    isCasting,
    castingDevice,
    castError,
    startCast,
    stopCast,
    audioTracks,
    subtitleTracks,
    activeAudioTrack,
    activeSubtitleTrack,
    setActiveAudioTrack,
    setActiveSubtitleTrack,
  } = usePlayerStore()

  const { settings } = useSettingsStore()
  const isAndroid = window.api?.platform === 'android'
  const isTV = isAndroid && !!(window as unknown as { __IS_TV__?: boolean }).__IS_TV__
  const volumeRef = useRef<HTMLInputElement>(null)
  const controlsRowRef = useRef<HTMLDivElement>(null)

  // D-pad navigation between control buttons.
  // When a range input (volume/seek slider) is focused, ArrowLeft/Right adjusts the
  // slider value natively — we must NOT intercept them for focus movement.
  const handleControlsKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!controlsRowRef.current) return
    const activeEl = document.activeElement as HTMLElement
    const isRangeInput = activeEl instanceof HTMLInputElement && activeEl.type === 'range'

    const btns = Array.from(
      controlsRowRef.current.querySelectorAll<HTMLElement>('button, input[type="range"]')
    )
    const idx = btns.indexOf(activeEl)

    if (e.key === 'ArrowRight' && !isRangeInput && idx >= 0 && idx < btns.length - 1) {
      e.preventDefault()
      btns[idx + 1].focus()
    } else if (e.key === 'ArrowLeft' && !isRangeInput && idx > 0) {
      e.preventDefault()
      btns[idx - 1].focus()
    } else if (e.key === 'ArrowUp' && isTV) {
      // On TV: move focus up to the player area
      e.preventDefault()
      document.querySelector<HTMLElement>('[data-tv-player]')?.focus()
    }
  }, [isTV])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }

  const handleExternalPlayer = async () => {
    if (!channel) return
    try {
      // Stalker channels need a fresh create_link URL — never pass the raw localhost cmd to VLC
      const streamUrl = channel.stalkerCmd
        ? await resolveChannelUrl(channel)
        : channel.url
      if (!streamUrl) return

      if (isAndroid) {
        // Android: show the system Intent chooser (VLC, MX Player, etc.)
        // No pre-configured player needed — the OS handles app selection.
        // channel.name is forwarded as the 'title' extra so VLC shows the channel name.
        // Do NOT await — fire-and-forget mirrors the cast path that is known to work.
        window.api.player.openExternal('', streamUrl, channel.name)
        return
      }

      // Desktop: use the configured default player
      if (!settings.defaultExternalPlayer) return
      const player = settings.externalPlayers.find((p) => p.name === settings.defaultExternalPlayer)
      if (!player) return
      window.api.player.openExternal(player.path, streamUrl)
    } catch (e) {
      console.warn('[ExternalPlayer] handleExternalPlayer error:', e)
    }
  }

  const [showStreamInfo, setShowStreamInfo] = useStreamInfoToggle()
  const [showCastPicker, setShowCastPicker] = useState(false)
  const [showAudioPicker, setShowAudioPicker] = useState(false)
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false)

  const handleCastClick = () => {
    if (!showCastPicker) {
      // Trigger a fresh device scan when opening the picker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window.api as any).cast?.refreshDiscovery?.()
    }
    setShowCastPicker(!showCastPicker)
  }

  // On Android, always prepend an "Open in External App" fallback so the user can
  // open in VLC/MX Player even if no cast devices are discovered yet.
  const ANDROID_EXTERNAL_DEVICE: CastDevice = {
    id: 'android-external',
    name: 'Open in External App',
    type: 'chromecast',
    host: '',
    port: 0,
  }
  const displayCastDevices: CastDevice[] = isAndroid
    ? [ANDROID_EXTERNAL_DEVICE, ...castDevices]
    : castDevices

  const handleCastSelect = async (deviceId: string) => {
    if (deviceId === 'android-external') {
      // Bypass the cast chain — open directly via ExternalPlayerPlugin (shows system app chooser).
      const streamUrl = channel?.stalkerCmd
        ? await resolveChannelUrl(channel)
        : channel?.url
      if (streamUrl) {
        window.api.player.openExternal('', streamUrl, channel?.name)
      }
      setShowCastPicker(false)
      return
    }
    startCast(deviceId)
    setShowCastPicker(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-0 flex flex-col"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
            padding: '32px 16px 12px',
          }}
        >
          {/* Stream info overlay */}
          <AnimatePresence>
            {showStreamInfo && (streamInfo.resolution || streamInfo.codec || streamInfo.bitrate) && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-4 right-4 glass rounded-xl p-3"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}
              >
                {(streamInfo.resolution || streamInfo.fps) && (
                  <p>Quality: {[streamInfo.resolution, streamInfo.fps].filter(Boolean).join(' · ')}</p>
                )}
                {streamInfo.codec && <p>Codec: {streamInfo.codec}</p>}
                {streamInfo.bitrate && <p>Bitrate: {streamInfo.bitrate}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Channel name + LIVE badge */}
          {channel && (
            <div className="flex items-center gap-2 mb-3 px-2">
              <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: 'Syne' }}>
                {channel.name}
              </p>
              {isLive && <span className="badge badge-live text-xs">LIVE</span>}
            </div>
          )}

          {/* Seek bar (VOD only) */}
          {!isLive && duration > 0 && (
            <div className="px-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">{formatDuration(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1"
                  style={seekBarStyle}
                />
                <span className="text-xs text-white/60">{formatDuration(duration)}</span>
              </div>
            </div>
          )}

          {/* Controls row */}
          {/* Cast device picker */}
          <AnimatePresence>
            {showCastPicker && (
              <CastDevicePicker
                devices={displayCastDevices}
                isScanning={castDevices.length === 0}
                isCasting={isCasting}
                castingDevice={castingDevice}
                castError={castError}
                onSelect={handleCastSelect}
                onStop={() => { stopCast(); setShowCastPicker(false) }}
                onClose={() => setShowCastPicker(false)}
              />
            )}
          </AnimatePresence>

          <div
            ref={controlsRowRef}
            data-tv-controls
            className="flex items-center gap-2 px-2"
            onKeyDown={handleControlsKeyDown}
          >
            {/* Play/Pause */}
            <ControlBtn onClick={isPlaying ? pause : resume} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
                  <rect x="2" y="2" width="4" height="10" rx="1"/>
                  <rect x="8" y="2" width="4" height="10" rx="1"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
                  <path d="M3 2l9 5-9 5V2z"/>
                </svg>
              )}
            </ControlBtn>

            {/* Stop */}
            <ControlBtn onClick={stop} title="Stop">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
                <rect x="1" y="1" width="10" height="10" rx="2"/>
              </svg>
            </ControlBtn>

            {/* Volume */}
            <ControlBtn onClick={toggleMute} title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
              {isMuted || volume === 0 ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M1 5h3l4-3v10l-4-3H1V5z"/>
                  <line x1="10" y1="4" x2="13" y2="10"/>
                  <line x1="13" y1="4" x2="10" y2="10"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M1 5h3l4-3v10l-4-3H1V5z"/>
                  <path d="M10 5a3 3 0 010 4"/>
                </svg>
              )}
            </ControlBtn>

            <input
              ref={volumeRef}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ ...seekBarStyle, width: 80 }}
              onKeyDown={(e) => {
                if (!isTV) return
                // On TV: ArrowUp/Down navigate focus rather than adjusting volume.
                // ArrowLeft/Right are left to native range behavior (adjust volume).
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  document.querySelector<HTMLElement>('[data-tv-player]')?.focus()
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (!controlsRowRef.current) return
                  const btns = Array.from(
                    controlsRowRef.current.querySelectorAll<HTMLElement>('button, input[type="range"]')
                  )
                  const idx = btns.indexOf(e.currentTarget)
                  if (idx >= 0 && idx < btns.length - 1) btns[idx + 1].focus()
                }
              }}
            />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Audio track picker */}
            {audioTracks.length > 1 && (
              <div style={{ position: 'relative' }}>
                <ControlBtn
                  onClick={() => { setShowAudioPicker((v) => !v); setShowSubtitlePicker(false) }}
                  title="Audio track"
                  style={showAudioPicker ? { background: 'rgba(91,127,166,0.4)' } : undefined}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M1 4h6M1 6.5h4M1 9h5"/>
                    <circle cx="10" cy="7" r="2.5"/>
                    <path d="M10 4.5V2" strokeLinecap="round"/>
                  </svg>
                </ControlBtn>
                <AnimatePresence>
                  {showAudioPicker && (
                    <TrackPicker
                      label="Audio"
                      tracks={audioTracks}
                      activeId={activeAudioTrack}
                      onSelect={(id) => { setActiveAudioTrack(id); setShowAudioPicker(false) }}
                      onClose={() => setShowAudioPicker(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Subtitle / CC picker */}
            {subtitleTracks.length > 0 && (
              <div style={{ position: 'relative' }}>
                <ControlBtn
                  onClick={() => { setShowSubtitlePicker((v) => !v); setShowAudioPicker(false) }}
                  title="Subtitles / CC"
                  style={activeSubtitleTrack >= 0 ? { background: 'rgba(91,127,166,0.4)' } : undefined}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="1" y="3" width="11" height="7" rx="1.5"/>
                    <line x1="3" y1="6.5" x2="6" y2="6.5"/>
                    <line x1="3" y1="8.5" x2="8" y2="8.5"/>
                    <line x1="7.5" y1="6.5" x2="10" y2="6.5"/>
                  </svg>
                </ControlBtn>
                <AnimatePresence>
                  {showSubtitlePicker && (
                    <TrackPicker
                      label="Subtitles"
                      tracks={subtitleTracks}
                      activeId={activeSubtitleTrack}
                      offOption="Off"
                      onSelect={(id) => { setActiveSubtitleTrack(id); setShowSubtitlePicker(false) }}
                      onClose={() => setShowSubtitlePicker(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* TV Guide overlay toggle (live channels only) */}
            {isLive && onToggleEpgOverlay && (
              <ControlBtn onClick={onToggleEpgOverlay} title="TV Guide (i)">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.5">
                  <rect x="1" y="2" width="11" height="9" rx="1.5"/>
                  <line x1="1" y1="5.5" x2="12" y2="5.5"/>
                  <line x1="4" y1="2" x2="4" y2="5.5"/>
                  <line x1="4" y1="8" x2="9" y2="8"/>
                  <line x1="4" y1="10" x2="7" y2="10"/>
                </svg>
              </ControlBtn>
            )}

            {/* Stream info toggle */}
            <ControlBtn onClick={() => setShowStreamInfo(!showStreamInfo)} title="Stream info">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5">
                <circle cx="6" cy="6" r="5"/>
                <line x1="6" y1="5" x2="6" y2="9"/>
                <circle cx="6" cy="3.5" r="0.5" fill="white"/>
              </svg>
            </ControlBtn>

            {/* Cast button */}
            {!isMultiview && (
              <ControlBtn
                onClick={handleCastClick}
                title="Cast to device"
                style={isCasting ? { background: 'rgba(91,127,166,0.4)' } : undefined}
              >
                {isCasting ? (
                  // Active: filled cast icon
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="white">
                    <rect x="4" y="6" width="8" height="6" rx="1"/>
                    <path d="M1 11a4 4 0 014-4" stroke="white" strokeWidth="1.5" fill="none"/>
                    <path d="M1 8.5a1.5 1.5 0 011.5-1.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                    <circle cx="1" cy="11" r="1" fill="white"/>
                  </svg>
                ) : (
                  // Idle: outline cast icon
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="1.5">
                    <rect x="4" y="6" width="8" height="6" rx="1"/>
                    <path d="M1 11a4 4 0 014-4"/>
                    <path d="M1 8.5a1.5 1.5 0 011.5-1.5" strokeLinecap="round"/>
                    <circle cx="1" cy="11" r="1" fill="white" stroke="none"/>
                  </svg>
                )}
              </ControlBtn>
            )}

            {/* External player — always visible on Android (Intent chooser handles app selection),
                or on desktop when at least one player is configured */}
            {(isAndroid || settings.externalPlayers.length > 0) && (
              <ControlBtn onClick={handleExternalPlayer} title="Open in external player">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h8a1 1 0 001-1V7"/>
                  <path d="M8 1h3v3"/>
                  <line x1="5" y1="7" x2="11" y2="1"/>
                </svg>
              </ControlBtn>
            )}

            {/* Fullscreen */}
            <ControlBtn onClick={() => setFullscreen(!isFullscreen)} title="Fullscreen (F)">
              {isFullscreen ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M1 5V1h4M11 7v4H7M7 1h4v4M1 7v4h4"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"/>
                </svg>
              )}
            </ControlBtn>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ControlBtn({
  onClick,
  children,
  title,
  style,
}: {
  onClick: () => void
  children: React.ReactNode
  title?: string
  style?: React.CSSProperties
}): JSX.Element {
  return (
    <motion.button
      className="btn control-btn w-8 h-8 rounded-lg"
      tabIndex={0}
      style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', ...style }}
      whileHover={{ background: 'rgba(255,255,255,0.25)' }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      title={title}
    >
      {children}
    </motion.button>
  )
}

const seekBarStyle: React.CSSProperties = {
  WebkitAppearance: 'none',
  appearance: 'none',
  height: 4,
  borderRadius: 2,
  background: 'rgba(255,255,255,0.3)',
  outline: 'none',
  cursor: 'pointer',
}

function useStreamInfoToggle(): [boolean, (v: boolean) => void] {
  // 'i' key is now used for the EPG overlay in Player.tsx — stream info is button-only
  return useState(false)
}

// ─── Track Picker ────────────────────────────────────────────────────────────

function TrackPicker({
  label,
  tracks,
  activeId,
  offOption,
  onSelect,
  onClose,
}: {
  label: string
  tracks: AudioTrack[] | SubtitleTrack[]
  activeId: number
  offOption?: string
  onSelect: (id: number) => void
  onClose: () => void
}): JSX.Element {
  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-track-picker]')) onClose()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  return (
    <motion.div
      data-track-picker
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-10 left-0 glass rounded-xl overflow-hidden"
      style={{ minWidth: 160, zIndex: 50, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
    >
      <div
        className="px-3 py-2 text-xs font-semibold uppercase"
        style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        {label}
      </div>

      {/* Off option for subtitles */}
      {offOption && (
        <button
          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
          style={{
            color: activeId < 0 ? 'var(--accent)' : 'var(--text-primary)',
            background: activeId < 0 ? 'rgba(91,127,166,0.15)' : 'transparent',
          }}
          onClick={() => onSelect(-1)}
        >
          {activeId < 0 && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--accent)">
              <path d="M1 5l3 3 5-6"/>
            </svg>
          )}
          {offOption}
        </button>
      )}

      {/* Track options */}
      {tracks.map((t) => (
        <button
          key={t.id}
          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
          style={{
            color: activeId === t.id ? 'var(--accent)' : 'var(--text-primary)',
            background: activeId === t.id ? 'rgba(91,127,166,0.15)' : 'transparent',
          }}
          onClick={() => onSelect(t.id)}
        >
          {activeId === t.id && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--accent)" style={{ flexShrink: 0 }}>
              <path d="M1 5l3 3 5-6"/>
            </svg>
          )}
          <span className="truncate">{t.name}{t.lang && t.lang !== t.name ? ` (${t.lang})` : ''}</span>
        </button>
      ))}
    </motion.div>
  )
}
