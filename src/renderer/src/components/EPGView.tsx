import { useState, useRef, useEffect, useCallback } from 'react'
import tvLogoFallback from '../assets/tvlogo.png'
import { motion, AnimatePresence } from 'framer-motion'
import { useEpgStore } from '../stores/epgStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { getProgramsInRange, getCurrentProgram } from '../utils/xmltvParser'
import { formatTime, getProgramProgress } from '../utils/formatters'
import type { Channel, EpgProgram } from '../types'
import MiniPlayer from './MiniPlayer'

function ChannelLogoImg({ src, className }: { src?: string; className?: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <img
      src={!src || failed ? tvLogoFallback : src}
      alt=""
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

const HOUR_WIDTH = 280 // px per hour
const ROW_HEIGHT = 60 // px per channel row
const TIME_HEADER_HEIGHT = 36
const CHANNEL_COL_WIDTH = 180
const CATEGORY_COL_WIDTH = 160
const EPG_PAST_DAYS = 3   // days before today available (catch-up)
const EPG_FUTURE_DAYS = 3 // days ahead available

function generateTimeSlots(start: Date, hours = 24): Date[] {
  const slots: Date[] = []
  const rounded = new Date(start)
  rounded.setMinutes(0, 0, 0)
  for (let i = 0; i <= hours; i++) {
    slots.push(new Date(rounded.getTime() + i * 3600_000))
  }
  return slots
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDayLabel(date: Date): string {
  const today = startOfDay(new Date())
  const d = startOfDay(date)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatShortDay(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── EPG Preview Panel ────────────────────────────────────────────────────────

interface EPGPreviewPanelProps {
  playingChannel?: { name: string; logo?: string; group?: string; tvgId?: string } | null
  playingUrl?: string | null
  currentProg?: EpgProgram | undefined
  durationMin?: number | null
}

function EPGPreviewPanel({ playingChannel, playingUrl, currentProg, durationMin }: EPGPreviewPanelProps): JSX.Element {
  const [volume, setVolume] = useState(0) // start muted
  const muted = volume === 0

  const handleVolumeBtnClick = useCallback(() => {
    setVolume((v) => v === 0 ? 0.7 : 0)
  }, [])

  return (
    <div
      className="flex-shrink-0 flex gap-4 px-4 py-3"
      style={{ borderBottom: '1px solid var(--border-hard)', background: 'var(--bg-surface)' }}
    >
      {/* Mini video + volume control */}
      <div className="flex-shrink-0 flex flex-col gap-2">
        {playingUrl ? (
          <MiniPlayer
            url={playingUrl}
            muted={muted}
            volume={volume}
            className="rounded-xl"
            style={{ width: 480, height: 270 }}
            fullscreenOnDoubleClick
          />
        ) : (
          /* Blank black placeholder */
          <div
            className="rounded-xl flex items-center justify-center"
            style={{ width: 480, height: 270, background: '#000', border: '1px solid var(--border-hard)' }}
          >
            <div className="flex flex-col items-center gap-2 opacity-30">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-xs text-white">Select a channel to preview</span>
            </div>
          </div>
        )}

        {/* Volume control — only shown when playing */}
        {playingUrl && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={handleVolumeBtnClick}
              style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 5h3l4-3v10l-4-3H1V5z"/>
                  <line x1="10" y1="4" x2="13" y2="10"/>
                  <line x1="13" y1="4" x2="10" y2="10"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 5h3l4-3v10l-4-3H1V5z"/>
                  <path d="M10 5a3 3 0 010 4"/>
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{
                flex: 1,
                WebkitAppearance: 'none',
                appearance: 'none',
                height: 3,
                borderRadius: 2,
                background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--border-hard) ${volume * 100}%)`,
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>
        )}
      </div>

      {/* Program info */}
      <div className="flex flex-col justify-center flex-1 min-w-0 gap-1.5 relative">
        {playingChannel ? (
          <>
            {/* Group badge */}
            {playingChannel.group && (
              <span
                className="absolute top-0 right-0 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border-hard)' }}
              >
                {playingChannel.group}
              </span>
            )}

            {/* Channel name + logo */}
            <div className="flex items-center gap-2">
              <ChannelLogoImg src={playingChannel.logo} className="w-6 h-6 object-contain rounded flex-shrink-0" />
              <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {playingChannel.name}
              </span>
            </div>

            {/* Program title */}
            <p
              className="text-lg font-bold truncate"
              style={{ fontFamily: 'Syne', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}
            >
              {currentProg?.title ?? 'No program available'}
            </p>

            {/* Time range */}
            {currentProg && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {formatTime(currentProg.start)} — {formatTime(currentProg.end)}
                {durationMin && ` · ${durationMin} min`}
              </p>
            )}

            {/* Description */}
            {currentProg?.description && (
              <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                {currentProg.description}
              </p>
            )}

            {!currentProg && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                No program info available
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p
              className="text-lg font-bold"
              style={{ fontFamily: 'Syne', letterSpacing: '-0.02em', color: 'var(--text-secondary)' }}
            >
              No channel playing
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Click a channel or program to start previewing
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EPGView({ onGoLive }: { onGoLive?: () => void }): JSX.Element {
  const isAndroid = window.api?.platform === 'android'
  const { channels: epgMap, loading } = useEpgStore()
  const { filteredChannels } = usePlaylistStore()
  const { play, channel: playingChannel, url: playingUrl } = usePlayerStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const channelColRef = useRef<HTMLDivElement>(null)

  // ── Android preview state ──────────────────────────────────────────────────
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [previewMuted, setPreviewMuted] = useState(true)
  const lastTapRef = useRef<{ id: string; time: number } | null>(null)

  const handleChannelClick = useCallback((ch: Channel) => {
    const now = Date.now()
    const last = lastTapRef.current
    const isDoubleTap = last && last.id === ch.id && now - last.time < 350

    play(ch)
    setShowMobilePreview(true)

    if (isDoubleTap) {
      onGoLive?.()
      lastTapRef.current = null
    } else {
      lastTapRef.current = { id: ch.id, time: now }
    }
  }, [play, onGoLive])

  const now = new Date()
  const today = startOfDay(now)

  // ── Day navigation ─────────────────────────────────────────────────────────
  const [selectedDay, setSelectedDay] = useState<Date>(today)
  const isToday = selectedDay.getTime() === today.getTime()

  const canGoPrev = selectedDay.getTime() > today.getTime() - EPG_PAST_DAYS * 86_400_000
  const canGoNext = selectedDay.getTime() < today.getTime() + EPG_FUTURE_DAYS * 86_400_000

  const goToPrevDay = () => {
    if (!canGoPrev) return
    setSelectedDay((d) => new Date(d.getTime() - 86_400_000))
  }
  const goToNextDay = () => {
    if (!canGoNext) return
    setSelectedDay((d) => new Date(d.getTime() + 86_400_000))
  }
  const goToToday = () => setSelectedDay(today)

  // Build day picker tabs (past 3 days + today + next 3 days)
  const dayTabs: Date[] = []
  for (let i = -EPG_PAST_DAYS; i <= EPG_FUTURE_DAYS; i++) {
    dayTabs.push(new Date(today.getTime() + i * 86_400_000))
  }

  // ── Time range for selected day (midnight → midnight) ─────────────────────
  const startTime = selectedDay          // 00:00 of selectedDay
  const endTime = new Date(selectedDay.getTime() + 24 * 3600_000)  // 00:00 next day
  const timeSlots = generateTimeSlots(startTime, 24)

  const [tooltip, setTooltip] = useState<{ program: EpgProgram; x: number; y: number } | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string>('')

  // Scroll to current time when viewing today; scroll to start of day otherwise
  useEffect(() => {
    if (!scrollRef.current) return
    if (isToday) {
      const nowOffset = ((now.getTime() - startTime.getTime()) / 3600_000) * HOUR_WIDTH
      scrollRef.current.scrollLeft = Math.max(0, nowOffset - 200)
    } else {
      scrollRef.current.scrollLeft = 0
    }
  }, [selectedDay])

  const getLeft = (date: Date) =>
    ((date.getTime() - startTime.getTime()) / 3600_000) * HOUR_WIDTH

  const getWidth = (start: Date, end: Date) =>
    Math.max(((end.getTime() - start.getTime()) / 3600_000) * HOUR_WIDTH, 2)

  const nowLeft = isToday ? getLeft(now) : -1
  const totalWidth = HOUR_WIDTH * 24

  // Collect unique groups from EPG-matched channels
  const epgGroups = [...new Set(
    filteredChannels.filter((ch) => ch.tvgId && epgMap.has(ch.tvgId)).map((ch) => ch.group)
  )].sort()

  // Map tvgId to channel — filtered by selected group
  const channelsWithEpg = filteredChannels
    .filter((ch) => ch.tvgId && epgMap.has(ch.tvgId))
    .filter((ch) => !selectedGroup || ch.group === selectedGroup)
    .slice(0, 150)

  // Compute current program info for the preview panel
  const epgCh = playingChannel?.tvgId ? epgMap.get(playingChannel.tvgId) : undefined
  const currentProg = epgCh ? getCurrentProgram(epgCh.programs) : undefined
  const durationMin = currentProg
    ? Math.round((currentProg.end.getTime() - currentProg.start.getTime()) / 60000)
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Header + Day Navigation */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--border-hard)' }}>
        {/* Title row */}
        <div className="flex items-center justify-between px-4 py-3 gap-4">
          <h2 className="text-lg font-bold text-metallic flex-shrink-0" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
            EPG Guide
          </h2>
          <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {loading ? 'Loading EPG...' : `${channelsWithEpg.length} channels · ${formatDayLabel(selectedDay)}`}
          </p>
        </div>

        {/* Day picker tabs */}
        {!isAndroid && (
          <div
            className="flex items-center gap-1 px-4 pb-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {/* Prev arrow */}
            <button
              onClick={goToPrevDay}
              disabled={!canGoPrev}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-hard)',
                color: canGoPrev ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: canGoPrev ? 'pointer' : 'not-allowed',
                opacity: canGoPrev ? 1 : 0.4,
              }}
              title="Previous day"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 5l3 3"/>
              </svg>
            </button>

            {/* Day tabs */}
            {dayTabs.map((day) => {
              const isSelected = day.getTime() === selectedDay.getTime()
              const isTodayTab = day.getTime() === today.getTime()
              return (
                <button
                  key={day.getTime()}
                  onClick={() => setSelectedDay(day)}
                  className="flex-shrink-0 px-3 h-7 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                    color: isSelected ? '#fff' : isTodayTab ? 'var(--accent)' : 'var(--text-primary)',
                    border: isSelected
                      ? '1px solid var(--accent)'
                      : isTodayTab
                      ? '1px solid var(--accent)'
                      : '1px solid var(--border-hard)',
                    fontWeight: isTodayTab ? 600 : 400,
                  }}
                >
                  {formatShortDay(day)}
                </button>
              )
            })}

            {/* Next arrow */}
            <button
              onClick={goToNextDay}
              disabled={!canGoNext}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-hard)',
                color: canGoNext ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: canGoNext ? 'pointer' : 'not-allowed',
                opacity: canGoNext ? 1 : 0.4,
              }}
              title="Next day"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 2l3 3-3 3"/>
              </svg>
            </button>

            {/* Jump to Today shortcut — only shown when not on today */}
            {!isToday && (
              <button
                onClick={goToToday}
                className="flex-shrink-0 px-3 h-7 rounded-lg text-xs font-semibold ml-1"
                style={{
                  background: 'rgba(91,127,166,0.15)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
              >
                Today
              </button>
            )}
          </div>
        )}

        {/* Android: compact prev/today/next row */}
        {isAndroid && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <button
              onClick={goToPrevDay}
              disabled={!canGoPrev}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', opacity: canGoPrev ? 1 : 0.4 }}
            >
              ‹ Prev
            </button>
            <span className="flex-1 text-center text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {formatDayLabel(selectedDay)}
            </span>
            {!isToday && (
              <button onClick={goToToday} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>
                Today
              </button>
            )}
            <button
              onClick={goToNextDay}
              disabled={!canGoNext}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', opacity: canGoNext ? 1 : 0.4 }}
            >
              Next ›
            </button>
          </div>
        )}

        {/* Android: category filter chips */}
        {isAndroid && epgGroups.length > 0 && (
          <div
            className="flex gap-1.5 px-3 pb-2 overflow-x-auto flex-shrink-0"
            style={{ scrollbarWidth: 'none' }}
          >
            <button
              className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-medium"
              style={{
                background: !selectedGroup ? 'var(--accent)' : 'var(--bg-surface)',
                color: !selectedGroup ? '#fff' : 'var(--text-secondary)',
                border: !selectedGroup ? '1px solid var(--accent)' : '1px solid var(--border-hard)',
              }}
              onClick={() => setSelectedGroup('')}
            >
              All
            </button>
            {epgGroups.map((g) => (
              <button
                key={g}
                className="flex-shrink-0 text-xs px-3 py-1 rounded-full"
                style={{
                  background: selectedGroup === g ? 'var(--accent)' : 'var(--bg-surface)',
                  color: selectedGroup === g ? '#fff' : 'var(--text-secondary)',
                  border: selectedGroup === g ? '1px solid var(--accent)' : '1px solid var(--border-hard)',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setSelectedGroup(g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile preview panel — Android only */}
      <AnimatePresence>
        {isAndroid && showMobilePreview && playingUrl && playingChannel && (
          <motion.div
            key="mobile-preview"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-shrink-0 flex items-start gap-3 px-3 py-2"
            style={{ borderBottom: '1px solid var(--border-hard)', background: 'var(--bg-surface)' }}
          >
            {/* 160×90 MiniPlayer — double-tap wrapper triggers go-live */}
            <div
              className="flex-shrink-0 relative rounded-xl overflow-hidden bg-black"
              style={{ width: 160, height: 90 }}
              onDoubleClick={() => onGoLive?.()}
            >
              <MiniPlayer
                url={playingUrl}
                muted={previewMuted}
                volume={previewMuted ? 0 : 0.7}
                style={{ width: '100%', height: '100%' }}
              />
            </div>

            {/* Info + controls */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {playingChannel.name}
              </p>
              {currentProg && (
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {currentProg.title}
                </p>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  className="btn text-xs px-2 py-1 rounded-lg"
                  style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-hard)' }}
                  onClick={() => setPreviewMuted((m) => !m)}
                >
                  {previewMuted ? '🔇' : '🔊'}
                </button>
                <motion.button
                  className="btn-primary btn text-xs px-3 py-1 rounded-lg"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onGoLive?.()}
                >
                  ▶ Full Screen
                </motion.button>
              </div>
            </div>

            {/* Dismiss */}
            <button
              style={{ color: 'var(--text-secondary)', padding: 4, flexShrink: 0 }}
              onClick={() => setShowMobilePreview(false)}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview panel — desktop only (480px wide, overflows portrait phones) */}
      {!isAndroid && (
        <EPGPreviewPanel
          playingChannel={playingChannel}
          playingUrl={playingUrl}
          currentProg={currentProg}
          durationMin={durationMin}
        />
      )}

      {epgMap.size === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="rounded-2xl flex items-center justify-center" style={{ width: 64, height: 64, boxShadow: 'var(--shadow-raised)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <p className="font-semibold" style={{ fontFamily: 'Syne', color: 'var(--text-primary)' }}>No EPG Data</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Add an XMLTV URL in Settings → Playlists</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Category column — hidden on Android (160px too wide for portrait phones) */}
          {!isAndroid && epgGroups.length > 0 && (
            <div
              className="flex-shrink-0 flex flex-col overflow-hidden"
              style={{ width: CATEGORY_COL_WIDTH, borderRight: '1px solid var(--border-hard)', background: 'var(--bg-surface)' }}
            >
              <div
                className="flex-shrink-0 flex items-center px-3"
                style={{ height: TIME_HEADER_HEIGHT, borderBottom: '1px solid var(--border-hard)' }}
              >
                <span className="text-xs font-semibold uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
                  Category
                </span>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {/* All */}
                <button
                  className="w-full text-left px-3 py-2 text-xs font-medium truncate"
                  style={{
                    color: !selectedGroup ? 'var(--accent)' : 'var(--text-primary)',
                    background: !selectedGroup ? 'var(--bg-active, rgba(91,127,166,0.12))' : 'transparent',
                    borderRadius: 6,
                  }}
                  onClick={() => setSelectedGroup('')}
                >
                  All Categories
                </button>
                {epgGroups.map((g) => (
                  <button
                    key={g}
                    className="w-full text-left px-3 py-2 text-xs truncate"
                    style={{
                      color: selectedGroup === g ? 'var(--accent)' : 'var(--text-primary)',
                      background: selectedGroup === g ? 'var(--bg-active, rgba(91,127,166,0.12))' : 'transparent',
                      borderRadius: 6,
                    }}
                    onClick={() => setSelectedGroup(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Channel column (fixed) */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: CHANNEL_COL_WIDTH, borderRight: '1px solid var(--border-hard)' }}
          >
            <div style={{ height: TIME_HEADER_HEIGHT, borderBottom: '1px solid var(--border-hard)' }} />
            <div ref={channelColRef} className="overflow-hidden" style={{ height: `calc(100% - ${TIME_HEADER_HEIGHT}px)` }}>
              {channelsWithEpg.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-2 px-3 cursor-pointer"
                  style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--border-hard)' }}
                  title={`Preview ${ch.name}`}
                  onClick={() => handleChannelClick(ch)}
                >
                  <ChannelLogoImg src={ch.logo} className="w-7 h-7 object-contain rounded" />
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {ch.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable grid */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto"
            style={{ position: 'relative' }}
            onScroll={(e) => {
              if (channelColRef.current) {
                channelColRef.current.scrollTop = (e.currentTarget).scrollTop
              }
            }}
          >
            {/* Time header */}
            <div
              className="sticky top-0 flex"
              style={{
                width: totalWidth,
                height: TIME_HEADER_HEIGHT,
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-hard)',
                zIndex: 10,
              }}
            >
              {timeSlots.map((slot, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 flex items-center px-2"
                  style={{ width: HOUR_WIDTH, borderLeft: i > 0 ? '1px solid var(--border-hard)' : 'none' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {formatTime(slot)}
                  </span>
                </div>
              ))}
            </div>

            {/* Program rows */}
            <div style={{ width: totalWidth, position: 'relative' }}>
              {channelsWithEpg.map((ch) => {
                const epgCh = epgMap.get(ch.tvgId!)!
                const programs = getProgramsInRange(epgCh.programs, startTime, endTime)
                const currentProg = getCurrentProgram(epgCh.programs)

                return (
                  <div
                    key={ch.id}
                    style={{
                      height: ROW_HEIGHT,
                      borderBottom: '1px solid var(--border-hard)',
                      position: 'relative',
                    }}
                  >
                    {programs.map((prog) => {
                      const left = getLeft(prog.start)
                      const width = getWidth(prog.start, prog.end)
                      const isCurrent = prog === currentProg
                      const isPast = prog.end < now

                      return (
                        <motion.div
                          key={prog.id}
                          className="absolute top-1 rounded-lg px-2 flex flex-col justify-center overflow-hidden cursor-pointer"
                          style={{
                            left: left + 2,
                            width: width - 4,
                            height: ROW_HEIGHT - 8,
                            background: isCurrent
                              ? 'var(--epg-card-current)'
                              : isPast
                              ? 'var(--epg-card-past)'
                              : 'var(--epg-card-future)',
                            border: isCurrent
                              ? '1px solid var(--epg-card-current-border)'
                              : '1px solid var(--epg-card-border)',
                            opacity: isPast ? 0.5 : 1,
                          }}
                          whileHover={{ scale: 1.01, zIndex: 5 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleChannelClick(ch)}
                          onMouseEnter={(e) => setTooltip({ program: prog, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {prog.title}
                          </p>
                          {width > 120 && (
                            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                              {formatTime(prog.start)} – {formatTime(prog.end)}
                            </p>
                          )}
                          {isCurrent && width > 60 && (
                            <div
                              className="absolute bottom-0 left-0 h-0.5 rounded-full"
                              style={{
                                width: `${getProgramProgress(prog.start, prog.end) * 100}%`,
                                background: 'var(--accent)',
                              }}
                            />
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Now line — only shown when viewing today */}
            {isToday && nowLeft >= 0 && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: nowLeft, width: 2, background: 'var(--danger)', zIndex: 20 }}
              >
                <div
                  className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full"
                  style={{ background: 'var(--danger)' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed glass rounded-xl p-3 pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 12, window.innerWidth - 280),
            top: tooltip.y - 8,
            maxWidth: 260,
            zIndex: 1000,
          }}
        >
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {tooltip.program.title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(tooltip.program.start)} – {formatTime(tooltip.program.end)}
          </p>
          {tooltip.program.description && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
              {tooltip.program.description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
