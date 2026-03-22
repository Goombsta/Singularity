import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatDuration } from '../utils/formatters'
import CastDevicePicker from './CastDevicePicker'
import { resolveChannelUrl } from '../utils/stalkerApi'
import type { RefObject } from 'react'

interface Props {
  visible: boolean
  videoRef: RefObject<HTMLVideoElement>
}

export default function PlayerControls({ visible, videoRef }: Props): JSX.Element {
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
  } = usePlayerStore()

  const { settings } = useSettingsStore()
  const volumeRef = useRef<HTMLInputElement>(null)

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (videoRef.current) videoRef.current.currentTime = t
    setCurrentTime(t)
  }

  const handleExternalPlayer = async () => {
    if (!channel || !settings.defaultExternalPlayer) return
    const player = settings.externalPlayers.find((p) => p.name === settings.defaultExternalPlayer)
    if (!player) return
    // Stalker channels need a fresh create_link URL — never pass the raw localhost cmd to VLC
    const streamUrl = channel.stalkerCmd
      ? await resolveChannelUrl(channel)
      : channel.url
    await window.api.player.openExternal(player.path, streamUrl)
  }

  const [showStreamInfo, setShowStreamInfo] = useStreamInfoToggle()
  const [showCastPicker, setShowCastPicker] = useState(false)

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
                {streamInfo.resolution && <p>Resolution: {streamInfo.resolution}</p>}
                {streamInfo.codec && <p>Codec: {streamInfo.codec}</p>}
                {streamInfo.bitrate && <p>Bitrate: {streamInfo.bitrate}</p>}
                {streamInfo.fps && <p>FPS: {streamInfo.fps}</p>}
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
                devices={castDevices}
                isCasting={isCasting}
                castingDevice={castingDevice}
                castError={castError}
                onSelect={(id) => { startCast(id); setShowCastPicker(false) }}
                onStop={() => { stopCast(); setShowCastPicker(false) }}
                onClose={() => setShowCastPicker(false)}
              />
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 px-2">
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
            />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Stream info toggle */}
            <ControlBtn onClick={() => setShowStreamInfo(!showStreamInfo)} title="Stream info (I)">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5">
                <circle cx="6" cy="6" r="5"/>
                <line x1="6" y1="5" x2="6" y2="9"/>
                <circle cx="6" cy="3.5" r="0.5" fill="white"/>
              </svg>
            </ControlBtn>

            {/* Cast button */}
            {!isMultiview && (
              <ControlBtn
                onClick={() => setShowCastPicker(!showCastPicker)}
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

            {/* External player */}
            {settings.externalPlayers.length > 0 && (
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
      className="btn w-8 h-8 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', ...style }}
      whileHover={{ background: 'rgba(255,255,255,0.25)' }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
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
  const [show, setShow] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') setShow((v) => !v)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return [show, setShow]
}
