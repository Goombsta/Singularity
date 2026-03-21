import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useEpgStore } from '../stores/epgStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { getProgramsInRange, getCurrentProgram } from '../utils/xmltvParser'
import { formatTime, getProgramProgress } from '../utils/formatters'
import type { EpgProgram } from '../types'

const HOUR_WIDTH = 280 // px per hour
const ROW_HEIGHT = 60 // px per channel row
const TIME_HEADER_HEIGHT = 36
const CHANNEL_COL_WIDTH = 180

function generateTimeSlots(start: Date, hours = 12): Date[] {
  const slots: Date[] = []
  const rounded = new Date(start)
  rounded.setMinutes(0, 0, 0)
  for (let i = 0; i <= hours; i++) {
    slots.push(new Date(rounded.getTime() + i * 3600_000))
  }
  return slots
}

export default function EPGView(): JSX.Element {
  const { channels: epgMap, loading } = useEpgStore()
  const { filteredChannels } = usePlaylistStore()
  const { play } = usePlayerStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const channelColRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const startTime = new Date(now.getTime() - 2 * 3600_000) // 2 hours ago
  const endTime = new Date(startTime.getTime() + 12 * 3600_000)
  const timeSlots = generateTimeSlots(startTime, 12)
  const [tooltip, setTooltip] = useState<{ program: EpgProgram; x: number; y: number } | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string>('')

  // Scroll to now
  useEffect(() => {
    if (scrollRef.current) {
      const nowOffset = ((now.getTime() - startTime.getTime()) / 3600_000) * HOUR_WIDTH
      scrollRef.current.scrollLeft = nowOffset - 200
    }
  }, [])

  const getLeft = (date: Date) =>
    ((date.getTime() - startTime.getTime()) / 3600_000) * HOUR_WIDTH

  const getWidth = (start: Date, end: Date) =>
    Math.max(((end.getTime() - start.getTime()) / 3600_000) * HOUR_WIDTH, 2)

  const nowLeft = getLeft(now)
  const totalWidth = HOUR_WIDTH * 12

  // Collect unique groups from EPG-matched channels
  const epgGroups = [...new Set(
    filteredChannels.filter((ch) => ch.tvgId && epgMap.has(ch.tvgId)).map((ch) => ch.group)
  )].sort()

  // Map tvgId to channel — filtered by selected group
  const channelsWithEpg = filteredChannels
    .filter((ch) => ch.tvgId && epgMap.has(ch.tvgId))
    .filter((ch) => !selectedGroup || ch.group === selectedGroup)
    .slice(0, 150)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 gap-4" style={{ borderBottom: '1px solid var(--border-hard)' }}>
        <h2 className="text-lg font-bold text-metallic flex-shrink-0" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
          Program Guide
        </h2>
        <div className="flex items-center gap-3 flex-1 justify-end">
          {/* Category filter */}
          {epgGroups.length > 0 && (
            <select
              className="input text-xs"
              style={{ maxWidth: 220, cursor: 'pointer' }}
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">All Categories</option>
              {epgGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
          <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {loading ? 'Loading EPG...' : `${channelsWithEpg.length} channels`}
          </p>
        </div>
      </div>

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
                  className="flex items-center gap-2 px-3"
                  style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--border-hard)' }}
                >
                  {ch.logo && (
                    <img src={ch.logo} alt="" className="w-7 h-7 object-contain rounded" />
                  )}
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
                          onClick={() => play(ch)}
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

            {/* Now line */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: nowLeft, width: 2, background: 'var(--danger)', zIndex: 20 }}
            >
              <div
                className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full"
                style={{ background: 'var(--danger)' }}
              />
            </div>
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
