import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'

interface MiniPlayerProps {
  url: string
  muted?: boolean
  volume?: number
  className?: string
  style?: React.CSSProperties
  fullscreenOnDoubleClick?: boolean
}

export default function MiniPlayer({ url, muted = true, volume = 1, className = '', style, fullscreenOnDoubleClick }: MiniPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const [loading, setLoading] = useState(true)

  // Keep refs current so url effect can read latest values without becoming a dep
  const mutedRef = useRef(muted)
  const volumeRef = useRef(volume)
  mutedRef.current = muted
  volumeRef.current = volume

  // Sync muted / volume when props change (e.g. user clicks mute toggle)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    video.volume = volume
  }, [muted, volume])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    let cancelled = false

    // Tear down any existing instances
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
    video.pause()
    video.removeAttribute('src')
    video.load()

    setLoading(true)

    // Apply current muted/volume before playback starts
    video.volume = volumeRef.current
    video.muted = mutedRef.current

    const isHls = url.includes('.m3u8') || (url.includes('/live/') && !url.endsWith('.ts'))
    const isMpegTs = url.endsWith('.ts')

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 2000,
        levelLoadingTimeOut: 20000,
        fragLoadingTimeOut: 20000,
        backBufferLength: 10,
        maxBufferLength: 20,
      })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return
        setLoading(false)
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || !data.fatal) return
        if (data.details === 'manifestLoadTimeOut') {
          hls.destroy()
          hlsRef.current = null
          video.src = url
          video.addEventListener('canplay', () => {
            if (cancelled) return
            setLoading(false)
            video.play().catch(() => {})
          }, { once: true })
        } else {
          setLoading(false)
        }
      })
    } else if (isMpegTs) {
      try {
        const player = mpegts.createPlayer({ type: 'mpegts', url, isLive: true }, {
          enableWorker: false,
          liveBufferLatencyChasing: false,
          autoCleanupSourceBuffer: true,
          autoCleanupMinBackwardDuration: 3,
          autoCleanupMaxBackwardDuration: 6,
          fixAudioTimestampGap: false,
        })
        mpegtsRef.current = player
        player.attachMediaElement(video)
        player.load()

        video.addEventListener('canplay', () => {
          if (cancelled) return
          setLoading(false)
          video.play().catch(() => {})
        }, { once: true })

        player.on(mpegts.Events.ERROR, () => {
          if (!cancelled) setLoading(false)
        })
      } catch {
        setLoading(false)
      }
    } else {
      video.src = url
      video.addEventListener('canplay', () => {
        if (cancelled) return
        setLoading(false)
        video.play().catch(() => {})
      }, { once: true })
      video.addEventListener('error', () => {
        if (!cancelled) setLoading(false)
      }, { once: true })
    }

    return () => {
      cancelled = true
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [url])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleDoubleClick = () => {
    if (!fullscreenOnDoubleClick) return
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black ${className}`}
      style={style}
      onDoubleClick={handleDoubleClick}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        style={{ objectFit: 'contain' }}
        autoPlay
        playsInline
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div
            className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }}
          />
        </div>
      )}
    </div>
  )
}
