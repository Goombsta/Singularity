import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'

interface MiniPlayerProps {
  url: string
  className?: string
  style?: React.CSSProperties
}

export default function MiniPlayer({ url, className = '', style }: MiniPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    let cancelled = false

    // Tear down any existing instances
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy()
      mpegtsRef.current = null
    }
    video.pause()
    video.removeAttribute('src')
    video.load()

    setLoading(true)

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
        video.play().catch(() => {/* muted autoplay should always succeed */})
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || !data.fatal) return
        // Fallback to native on manifest timeout
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

  return (
    <div className={`relative overflow-hidden bg-black ${className}`} style={style}>
      <video
        ref={videoRef}
        className="w-full h-full"
        style={{ objectFit: 'contain' }}
        muted
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
