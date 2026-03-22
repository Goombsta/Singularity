import { motion } from 'framer-motion'
import type { CastDevice } from '../../../shared/castTypes'

interface Props {
  devices: CastDevice[]
  isCasting: boolean
  castingDevice: CastDevice | null
  castError: string | null
  onSelect: (deviceId: string) => void
  onStop: () => void
  onClose: () => void
}

export default function CastDevicePicker({
  devices,
  isCasting,
  castingDevice,
  castError,
  onSelect,
  onStop,
  onClose,
}: Props): JSX.Element {
  return (
    <>
      {/* Backdrop — click outside to close */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-12 right-0 z-50 glass rounded-xl overflow-hidden"
        style={{ minWidth: 220, maxWidth: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center gap-2 border-b"
          style={{ borderColor: 'var(--border-soft)', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}
        >
          <CastIconSm />
          <span style={{ fontFamily: 'Syne', fontWeight: 600 }}>Cast to Device</span>
        </div>

        {/* Device list */}
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {devices.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              <Spinner />
              Scanning for devices…
            </div>
          ) : (
            devices.map((device) => {
              const active = isCasting && castingDevice?.id === device.id
              return (
                <button
                  key={device.id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                  style={{
                    fontSize: 13,
                    color: active ? 'var(--accent)' : 'rgba(255,255,255,0.85)',
                    background: active ? 'rgba(91,127,166,0.15)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                  onClick={() => (active ? onStop() : onSelect(device.id))}
                >
                  <span style={{ flexShrink: 0, opacity: 0.7 }}>
                    {device.type === 'chromecast' ? <ChromecastIcon /> : <TvIcon />}
                  </span>
                  <span className="flex-1 truncate">{device.name}</span>
                  {active && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
                    />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Cast error */}
        {castError && (
          <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border-soft)' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,100,100,0.9)', lineHeight: 1.4 }}>
              {castError}
            </p>
          </div>
        )}

        {/* Stop button when casting */}
        {isCasting && (
          <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border-soft)' }}>
            <button
              className="w-full text-center rounded-lg py-1.5"
              style={{
                fontSize: 12,
                color: 'rgba(255,80,80,0.9)',
                background: 'rgba(255,80,80,0.1)',
              }}
              onClick={onStop}
            >
              Stop casting
            </button>
          </div>
        )}
      </motion.div>
    </>
  )
}

function CastIconSm(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 9a8 8 0 018-8"/>
      <path d="M1 6a5 5 0 015-5"/>
      <circle cx="1" cy="9" r="1" fill="currentColor" stroke="none"/>
      <rect x="4" y="7" width="7" height="4" rx="1" stroke="currentColor"/>
    </svg>
  )
}

function ChromecastIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="12" height="8" rx="1"/>
      <path d="M1 9a4 4 0 014-4"/>
      <path d="M1 11a6 6 0 016-6"/>
      <circle cx="1" cy="11" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function TvIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="12" height="9" rx="1"/>
      <path d="M5 12h4M7 11v1"/>
    </svg>
  )
}

function Spinner(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
    >
      <circle cx="6" cy="6" r="5" strokeOpacity="0.3"/>
      <path d="M6 1a5 5 0 015 5" strokeLinecap="round"/>
    </svg>
  )
}
