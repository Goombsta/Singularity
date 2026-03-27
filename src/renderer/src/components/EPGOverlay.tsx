import { useState, useEffect, useRef, useCallback } from 'react'
import tvLogoFallback from '../assets/tvlogo.png'
import { AnimatePresence, motion } from 'framer-motion'
import { useEpgStore } from '../stores/epgStore'
import type { Channel, EpgProgram } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function ChannelLogoImg({ src }: { src?: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <img
      src={!src || failed ? tvLogoFallback : src}
      alt=""
      className="rounded flex-shrink-0"
      style={{ width: 28, height: 28, objectFit: 'contain' }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function progressPercent(program: EpgProgram): number {
  const now = Date.now()
  const start = program.start.getTime()
  const end = program.end.getTime()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

function durationMinutes(program: EpgProgram): number {
  return Math.round((program.end.getTime() - program.start.getTime()) / 60000)
}

// ─── Program Row ────────────────────────────────────────────────────────────

function ProgramRow({
  program,
  isCurrent,
  isTV,
}: {
  program: EpgProgram
  isCurrent: boolean
  isTV: boolean
}) {
  const pct = isCurrent ? progressPercent(program) : 0
  const dur = durationMinutes(program)

  return (
    <div
      className={`flex flex-col gap-1 rounded-lg px-3 py-2 transition-colors ${
        isCurrent ? 'bg-white/10' : 'bg-transparent'
      }`}
      style={{ minWidth: 0 }}
    >
      {/* Time + Title row */}
      <div className="flex items-baseline gap-3 min-w-0">
        <span
          className="text-xs font-medium flex-shrink-0"
          style={{ color: isCurrent ? 'var(--accent)' : 'rgba(255,255,255,0.55)', minWidth: 40 }}
        >
          {formatTime(program.start)}
        </span>
        <span
          className="font-medium truncate text-sm"
          style={{ color: isCurrent ? '#fff' : 'rgba(255,255,255,0.75)' }}
        >
          {program.title}
        </span>
        {isCurrent && (
          <span
            className="text-xs flex-shrink-0 ml-auto"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            {dur}m
          </span>
        )}
      </div>

      {/* Progress bar — only for current program */}
      {isCurrent && (
        <div
          className="rounded-full overflow-hidden"
          style={{ height: 3, background: 'rgba(255,255,255,0.15)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct}%`, background: 'var(--accent)' }}
          />
        </div>
      )}

      {/* Description — only for current program, hidden on TV to save space */}
      {isCurrent && program.description && !isTV && (
        <p
          className="text-xs mt-0.5 line-clamp-2"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {program.description}
        </p>
      )}
    </div>
  )
}

// ─── EPGOverlay ──────────────────────────────────────────────────────────────

interface EPGOverlayProps {
  show: boolean
  onDismiss: () => void
  channel: Channel | null
  isTV: boolean
}

export default function EPGOverlay({ show, onDismiss, channel, isTV }: EPGOverlayProps) {
  const epgChannels = useEpgStore((s) => s.channels)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Find programs for the current channel ──────────────────────────────────
  const tvgId = channel?.tvgId ?? channel?.name ?? ''
  const epgChannel = tvgId ? epgChannels.get(tvgId) : undefined

  const now = new Date()
  const upcomingPrograms: { program: EpgProgram; isCurrent: boolean }[] = []

  if (epgChannel) {
    const sorted = [...epgChannel.programs].sort((a, b) => a.start.getTime() - b.start.getTime())
    for (const program of sorted) {
      if (program.end <= now) continue // past
      const isCurrent = program.start <= now && program.end > now
      upcomingPrograms.push({ program, isCurrent })
      if (upcomingPrograms.length >= 4) break // current + next 3
    }
  }

  // ── Auto-dismiss timer ─────────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    const delay = isTV ? 8000 : 5000
    dismissTimerRef.current = setTimeout(onDismiss, delay)
  }, [onDismiss, isTV])

  useEffect(() => {
    if (show) {
      resetTimer()
      // Focus overlay on TV so D-pad can navigate or Back key dismisses
      if (isTV) {
        setTimeout(() => overlayRef.current?.focus(), 50)
      }
    } else {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current) }
  }, [show, resetTimer, isTV])

  // ── Keyboard: Escape / Back / Info dismisses ───────────────────────────────
  useEffect(() => {
    if (!show) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [show, onDismiss])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          ref={overlayRef}
          tabIndex={isTV ? 0 : -1}
          className="absolute bottom-0 left-0 right-0 z-30 outline-none"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onMouseMove={resetTimer}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'GoBack') { e.preventDefault(); onDismiss() }
          }}
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 85%, transparent 100%)',
            paddingBottom: isTV ? 24 : 16,
            paddingTop: 32,
            // TV focus ring handled by outer container
          }}
        >
          <div className="px-4 flex flex-col gap-1" style={{ maxWidth: 680 }}>
            {/* Channel name header */}
            <div className="flex items-center gap-2 mb-2 px-3">
              <ChannelLogoImg src={channel?.logo} />
              <span
                className="font-bold text-base"
                style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'Syne', letterSpacing: '-0.02em' }}
              >
                {channel?.name ?? 'No Channel'}
              </span>
              {/* Live badge */}
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded ml-1"
                style={{ background: 'var(--accent)', color: '#fff', letterSpacing: '0.05em' }}
              >
                LIVE
              </span>
            </div>

            {/* No EPG data */}
            {upcomingPrograms.length === 0 && (
              <div className="px-3 py-2">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  No program information available
                </p>
              </div>
            )}

            {/* Program list: current + upcoming */}
            {upcomingPrograms.map(({ program, isCurrent }) => (
              <ProgramRow
                key={program.id}
                program={program}
                isCurrent={isCurrent}
                isTV={isTV}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
