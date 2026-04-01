import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { usePlayerStore } from '../stores/playerStore'
import PlayerControls from './PlayerControls'
import EPGOverlay from './EPGOverlay'
import { resolveChannelUrl } from '../utils/stalkerApi'

const STALL_TIMEOUT_MS = 10_000

// ─── Native Player (Android / Capacitor) ────────────────────────────────────
// Access the Capacitor NativePlayer plugin for ExoPlayer-backed playback.
// Returns null on non-Capacitor platforms (desktop Electron).
function getNativePlayer(): any | null {
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.NativePlayer ?? null
}

// ─── Series Episode Picker ─────────────────────────────────────────────────

interface SeriesInfo {
  seasons: Record<string, Episode[]>
}

interface Episode {
  id: string
  title: string
  season: string
  episodeNum: string
  containerExtension: string
  url: string
}

function parseSeriesUrl(url: string): { base: string; username: string; password: string; seriesId: string } | null {
  const m = url.match(/^(.+)\/series\/([^/]+)\/([^/]+)\/(\d+)$/)
  if (!m) return null
  return { base: m[1], username: m[2], password: m[3], seriesId: m[4] }
}

function SeriesEpisodePicker({ channel, onEpisode, isTV }: {
  channel: { name: string; url: string; logo?: string }
  onEpisode: (url: string, title: string) => void
  isTV?: boolean
}): JSX.Element {
  const [info, setInfo] = useState<SeriesInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSeason, setActiveSeason] = useState<string>('')
  const seasonListRef = useRef<HTMLDivElement>(null)
  const episodeListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parsed = parseSeriesUrl(channel.url)
    if (!parsed) {
      setError('Cannot load episodes: invalid series URL')
      setLoading(false)
      return
    }
    const { base, username, password, seriesId } = parsed
    const apiUrl = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${seriesId}`

    fetch(apiUrl)
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { episodes?: Record<string, { id: string; title: string; season: string; episode_num: string; container_extension: string }[]> }
        if (!d.episodes) throw new Error('No episodes found')
        const seasons: Record<string, Episode[]> = {}
        for (const [season, eps] of Object.entries(d.episodes)) {
          seasons[season] = (eps || []).map((e) => ({
            id: String(e.id),
            title: e.title || `Episode ${e.episode_num}`,
            season: e.season,
            episodeNum: String(e.episode_num),
            containerExtension: e.container_extension || 'mp4',
            url: `${base}/series/${username}/${password}/${e.id}.${e.container_extension || 'mp4'}`,
          }))
        }
        setInfo({ seasons })
        const firstSeason = Object.keys(seasons).sort((a, b) => Number(a) - Number(b))[0]
        setActiveSeason(firstSeason || '')
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(String(e))
        setLoading(false)
      })
  }, [channel.url])

  const seasonKeys = info ? Object.keys(info.seasons).sort((a, b) => Number(a) - Number(b)) : []
  const episodes = (info && activeSeason) ? (info.seasons[activeSeason] || []) : []

  // Auto-focus first season button on TV when data loads
  useEffect(() => {
    if (!isTV || !info) return
    const firstBtn = seasonListRef.current?.querySelector<HTMLElement>('button')
    firstBtn?.focus()
  }, [isTV, info])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-hard)' }}>
        {channel.logo && (
          <img src={channel.logo} alt="" className="w-16 h-16 object-contain rounded-xl" style={{ boxShadow: 'var(--shadow-raised-sm)' }} />
        )}
        <div>
          <h2 className="text-xl font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
            {channel.name}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Select an episode to watch
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-hard)', borderTopColor: 'var(--accent)' }} />
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>{error}</p>
        </div>
      )}

      {info && !loading && (
        <div className="flex flex-1 overflow-hidden">
          {/* Season tabs */}
          <div
            ref={seasonListRef}
            className="flex flex-col gap-1 p-3 flex-shrink-0"
            style={{ width: 120, borderRight: '1px solid var(--border-hard)' }}
          >
            <p className="text-xs font-semibold px-2 py-1 uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>Season</p>
            {seasonKeys.map((s, idx) => (
              <button
                key={s}
                tabIndex={0}
                className={`nav-item w-full text-left text-sm ${activeSeason === s ? 'active' : ''}`}
                onClick={() => setActiveSeason(s)}
                onKeyDown={(e) => {
                  if (!isTV) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    const btns = Array.from(seasonListRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
                    btns[idx + 1]?.focus()
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    const btns = Array.from(seasonListRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
                    btns[idx - 1]?.focus()
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    episodeListRef.current?.querySelector<HTMLElement>('button')?.focus()
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    document.querySelector<HTMLElement>('[data-tv-content] [tabindex="0"]')?.focus()
                  }
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Episode list */}
          <div ref={episodeListRef} className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-2">
              {episodes.map((ep, idx) => (
                <button
                  key={ep.id}
                  tabIndex={0}
                  className="neu-raised p-3 text-left w-full rounded-xl hover:scale-[1.01] transition-transform"
                  onClick={() => onEpisode(ep.url, `${channel.name} — S${ep.season}E${ep.episodeNum}`)}
                  onKeyDown={(e) => {
                    if (!isTV) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      const btns = Array.from(episodeListRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
                      btns[idx + 1]?.focus()
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      if (idx === 0) {
                        seasonListRef.current?.querySelector<HTMLElement>('button')?.focus()
                      } else {
                        const btns = Array.from(episodeListRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
                        btns[idx - 1]?.focus()
                      }
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault()
                      // Return focus to the active season button
                      const seasonBtns = Array.from(seasonListRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
                      const activeIdx = seasonKeys.indexOf(activeSeason)
                      seasonBtns[activeIdx >= 0 ? activeIdx : 0]?.focus()
                    }
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    E{ep.episodeNum} · {ep.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Error Overlay ──────────────────────────────────────────────────────────

function ErrorOverlay({ error, isTV, onOpenExternal }: {
  error: string
  isTV: boolean
  onOpenExternal: () => void
}): JSX.Element {
  const btnRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the button on TV so the user can act immediately
  useEffect(() => {
    if (isTV) btnRef.current?.focus()
  }, [isTV])

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="glass rounded-2xl p-6 text-center" style={{ maxWidth: 340 }}>
        <p className="font-semibold text-white mb-2">Playback Error</p>
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>{error}</p>
        <button
          ref={btnRef}
          tabIndex={0}
          className="btn-primary btn text-xs px-3 py-1.5"
          onClick={onOpenExternal}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenExternal() }
          }}
        >
          Open in External Player
        </button>
      </div>
    </div>
  )
}

// ─── Main Player ────────────────────────────────────────────────────────────

export default function Player(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fpsTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Android native player refs
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const nativePlayerRef = useRef<boolean>(false)

  // Proxy port — used to build /probe URL for VOD duration
  const vodProxyPortRef = useRef<number | null>(null)
  // Active HLS session ID — used to stop ffmpeg when channel changes
  const vodHlsSessionRef = useRef<string | null>(null)
  // Seek offset: video.currentTime is relative to the HLS session start, not the full stream
  const vodSeekOffsetRef = useRef<number>(0)
  // Whether to force H.264 encode (true for HEVC/MPEG-2/other non-H.264 sources)
  const vodForceEncodeRef = useRef<boolean>(false)
  // Stable ref to the current effectiveUrl so handleVodSeek closure stays fresh
  const effectiveUrlRef = useRef<string>('')
  // Ref exposing startVodHls to onError callback (defined inside useEffect)
  const startVodHlsRef = useRef<((seekTime?: number) => void) | null>(null)
  // Whether the current stream is routed through the VOD proxy (vs native HLS)
  const isVodProxyRef = useRef<boolean>(false)
  // Whether the current stream is being played by MPV (bypasses hls.js + MSE entirely)
  const isMpvModeRef = useRef<boolean>(false)

  // Episode URL override for series (local state — doesn't touch playerStore)
  const [episodeUrl, setEpisodeUrl] = useState<string | null>(null)
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null)

  // Stalker channels: resolved URL from create_link (null while pending)
  const [stalkerUrl, setStalkerUrl] = useState<string | null>(null)

  const isAndroid = window.api?.platform === 'android'
  const isTV = isAndroid && !!(window as unknown as { __IS_TV__?: boolean }).__IS_TV__
  const [playerFocused, setPlayerFocused] = useState(false)
  const [showEpgOverlay, setShowEpgOverlay] = useState(false)

  const {
    url,
    channel,
    isPlaying,
    isPaused,
    isMuted,
    volume,
    isFullscreen,
    isLoading,
    setLoading,
    setError,
    setStreamInfo,
    setCurrentTime,
    setDuration,
    setIsLive,
    setFullscreen,
    pause: pausePlayer,
    resume: resumePlayer,
    setAudioTracks,
    setSubtitleTracks,
    activeAudioTrack,
    activeSubtitleTrack,
  } = usePlayerStore()

  // Subscribe to error state so we can react to format errors on Android
  const storeError = usePlayerStore((s) => s.error)

  // Fetch the VOD proxy port from the main process once on mount (Electron only)
  useEffect(() => {
    ;(window.api as any)?.vod?.getProxyPort?.().then((port: number | null) => {
      vodProxyPortRef.current = port ?? null
    }).catch(() => {})
  }, [])

  // Reset episode state whenever channel changes
  useEffect(() => {
    setEpisodeUrl(null)
    setEpisodeTitle(null)
    // Stop any active HLS session for the previous channel
    if (vodHlsSessionRef.current) {
      ;(window.api as any)?.vod?.stopHls?.(vodHlsSessionRef.current).catch(() => {})
      vodHlsSessionRef.current = null
    }
  }, [channel?.id])

  // Stalker URL resolution — get a fresh token + create_link on every channel change
  useEffect(() => {
    if (!channel?.stalkerCmd) {
      setStalkerUrl(null)
      return
    }
    let cancelled = false
    setStalkerUrl(null)
    setLoading(true)
    resolveChannelUrl(channel)
      .then((resolved) => { if (!cancelled) setStalkerUrl(resolved) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [channel?.id])

  // Controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      // On TV, never auto-hide — controls must stay reachable by D-pad
      if (isPlaying && !isTV) setShowControls(false)
    }, 3000)
  }, [isPlaying, isTV])

  // Fullscreen handler
  // On TV, fullscreen is implemented via CSS position:fixed (WebView doesn't support
  // requestFullscreen). On desktop/mobile, use the native browser Fullscreen API.
  useEffect(() => {
    if (isTV) return
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [setFullscreen, isTV])

  useEffect(() => {
    if (isTV) return // TV fullscreen handled via CSS position:fixed below
    if (isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.()
    } else if (!isFullscreen && document.fullscreenElement) {
      document.exitFullscreen?.()
    }
  }, [isFullscreen, isTV])

  // Volume / mute
  useEffect(() => {
    if (isAndroid) {
      const plugin = getNativePlayer()
      if (plugin && nativePlayerRef.current) {
        plugin.setVolume({ volume }).catch(() => {})
        plugin.setMute({ muted: isMuted }).catch(() => {})
      }
      return
    }
    if (!videoRef.current) return
    videoRef.current.volume = volume
    videoRef.current.muted = isMuted
  }, [volume, isMuted, isAndroid])

  // Audio track switching
  useEffect(() => {
    if (isAndroid) {
      const plugin = getNativePlayer()
      if (plugin && nativePlayerRef.current && activeAudioTrack >= 0) {
        plugin.selectAudioTrack({ trackId: activeAudioTrack }).catch(() => {})
      }
      return
    }
    if (hlsRef.current) {
      if (activeAudioTrack >= 0) hlsRef.current.audioTrack = activeAudioTrack
      return
    }
    // Native <video> audio track switching (VOD multi-audio)
    if (!videoRef.current || activeAudioTrack < 0) return
    const nativeTracks = (videoRef.current as any).audioTracks
    if (!nativeTracks) return
    for (let i = 0; i < nativeTracks.length; i++) {
      nativeTracks[i].enabled = (i === activeAudioTrack)
    }
  }, [activeAudioTrack, isAndroid])

  // Subtitle track switching — -1 means off
  useEffect(() => {
    if (isAndroid) {
      const plugin = getNativePlayer()
      if (plugin && nativePlayerRef.current) {
        plugin.selectSubtitleTrack({ trackId: activeSubtitleTrack }).catch(() => {})
      }
      return
    }
    if (!hlsRef.current) return
    hlsRef.current.subtitleTrack = activeSubtitleTrack
  }, [activeSubtitleTrack, isAndroid])

  // Play/pause
  useEffect(() => {
    if (isAndroid) {
      const plugin = getNativePlayer()
      if (plugin && nativePlayerRef.current) {
        if (isPaused) plugin.pause().catch(() => {})
        else if (isPlaying) plugin.play().catch(() => {})
      }
      return
    }
    if (isMpvModeRef.current) {
      if (isPaused) (window.api as any)?.mpv?.pause?.()
      else if (isPlaying) (window.api as any)?.mpv?.resume?.()
      return
    }
    const video = videoRef.current
    if (!video) return
    if (isPaused) {
      video.pause()
    } else if (isPlaying && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.play().catch(() => {})
    }
  }, [isPlaying, isPaused, isAndroid])

  // Determine the effective URL to load into the video element
  // Series: episodeUrl | Stalker: stalkerUrl (wait for resolution) | otherwise: url from store
  const effectiveUrl = channel?.streamType === 'series'
    ? episodeUrl
    : channel?.stalkerCmd
      ? stalkerUrl   // null until create_link resolves — keeps player from loading localhost
      : url

  // Keep ref in sync so handleVodSeek closure is always fresh
  effectiveUrlRef.current = effectiveUrl ?? ''

  // When the URL is cleared (e.g. playlist switch → stop()), tear down immediately
  useEffect(() => {
    if (!effectiveUrl) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
      const v = videoRef.current
      if (v) { v.pause(); v.removeAttribute('src'); v.load() }
      // Stop native player too
      const plugin = getNativePlayer()
      if (plugin && nativePlayerRef.current) {
        plugin.stop().catch(() => {})
        nativePlayerRef.current = false
      }
    }
  }, [effectiveUrl])

  // ── Android: make WebView background transparent so ExoPlayer TextureView shows through ──
  useEffect(() => {
    if (!isAndroid) return
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const root = document.getElementById('root')
    if (root) root.style.background = 'transparent'
    // No cleanup: on Android the WebView must stay transparent for the lifetime of the
    // Player. Restoring backgrounds on unmount caused a visible flash when navigating
    // away and back (e.g. Settings → Live) — there is a frame gap between unmount
    // cleanup and the next mount's effect re-running, during which the App div's
    // opaque bg-base re-appears and hides the video on remount.
  }, [isAndroid])

  // ── Android: sync SurfaceView position with the transparent placeholder div ──
  useEffect(() => {
    if (!isAndroid) return
    const plugin = getNativePlayer()
    if (!plugin) return

    const sync = () => {
      if (!videoContainerRef.current) return
      const r = videoContainerRef.current.getBoundingClientRect()
      // Only send non-zero rects — zero means the layout hasn't settled yet
      if (r.width === 0 && r.height === 0) return
      plugin.setVideoRect({ x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => {})
    }

    sync() // initial sync

    const ro = new ResizeObserver(sync)
    if (videoContainerRef.current) ro.observe(videoContainerRef.current)
    window.addEventListener('scroll', sync, true)

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', sync, true)
    }
  }, [isAndroid, isFullscreen])

  // ── Android: native player load + event listeners ──
  useEffect(() => {
    if (!isAndroid) return  // non-Android uses HLS.js/mpegts.js below
    const plugin = getNativePlayer()
    if (!plugin || !effectiveUrl) return

    let cancelled = false
    nativePlayerRef.current = true

    setLoading(true)
    setError(null)
    setReconnecting(false)

    // Push the current video rect to the native SurfaceView immediately.
    // The ResizeObserver sync runs when the effect mounts (isAndroid, isFullscreen deps),
    // but nativePlayerRef.current is false at that point and the rect may be zero.
    // Re-sync here now that the player is active and the layout has settled.
    if (videoContainerRef.current) {
      const r = videoContainerRef.current.getBoundingClientRect()
      if (r.width > 0 || r.height > 0) {
        plugin.setVideoRect({ x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => {})
      }
    }

    // Load the stream into ExoPlayer
    plugin.load({ url: effectiveUrl }).catch((e: any) => {
      if (!cancelled) setError(e?.message ?? 'Failed to load stream')
    })

    // Listen to native events
    const listeners: { remove: () => void }[] = []

    plugin.addListener('nativePlayerReady', (data: any) => {
      if (cancelled) return
      setLoading(false)
      setIsLive(!!data.isLive)
    }).then((l: any) => listeners.push(l))

    plugin.addListener('nativePlayerError', (data: any) => {
      if (cancelled) return
      setLoading(false)
      setError(data.message || 'Playback error')
    }).then((l: any) => listeners.push(l))

    plugin.addListener('nativePlayerTrackInfo', (data: any) => {
      if (cancelled) return
      const audioTracks = (data.audioTracks || []).map((t: any) => ({
        id: t.id ?? 0,
        name: t.name || `Audio ${(t.id ?? 0) + 1}`,
        lang: t.lang || '',
      }))
      const subtitleTracks = (data.subtitleTracks || []).map((t: any) => ({
        id: t.id ?? 0,
        name: t.name || `Sub ${(t.id ?? 0) + 1}`,
        lang: t.lang || '',
      }))
      setAudioTracks(audioTracks)
      setSubtitleTracks(subtitleTracks)
    }).then((l: any) => listeners.push(l))

    plugin.addListener('nativePlayerStreamInfo', (data: any) => {
      if (cancelled) return
      setStreamInfo({
        resolution: data.resolution || undefined,
        fps: data.fps ? `${data.fps}fps` : undefined,
        codec: data.codec || undefined,
        bitrate: data.bitrate ? `${Math.round(data.bitrate / 1000)} Kbps` : undefined,
      })
    }).then((l: any) => listeners.push(l))

    plugin.addListener('nativePlayerTimeUpdate', (data: any) => {
      if (cancelled) return
      setCurrentTime(data.currentTime ?? 0)
      setDuration(data.duration ?? 0)
    }).then((l: any) => listeners.push(l))

    plugin.addListener('nativePlayerStateChange', (data: any) => {
      if (cancelled) return
      if (data.state === 'buffering') setLoading(true)
      else setLoading(false)
    }).then((l: any) => listeners.push(l))

    return () => {
      cancelled = true
      nativePlayerRef.current = false
      plugin.stop().catch(() => {})
      listeners.forEach((l) => l.remove?.())
    }
  }, [effectiveUrl, isAndroid])

  // Load stream (WebView path — skipped on Android which uses native ExoPlayer above)
  useEffect(() => {
    if (isAndroid) return  // Android uses native ExoPlayer effect above
    const video = videoRef.current
    if (!video || !effectiveUrl) return

    // Cancellation token — prevents stale callbacks from updating state after cleanup
    let cancelled = false

    // Destroy any previous HLS / mpegts instances
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.destroy()
      mpegtsRef.current = null
    }

    // Cancel any pending play() immediately before loading new source
    video.pause()
    video.removeAttribute('src')
    video.load()

    setLoading(true)
    setError(null)
    setReconnecting(false)
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }

    // Reconnect helper — used by all three playback paths (HLS.js / mpegts / native)
    const scheduleReconnect = (delayMs = STALL_TIMEOUT_MS) => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(() => {
        if (cancelled) return
        setReconnecting(true)
        if (hlsRef.current) {
          // HLS.js network recovery: resume loading from the live edge
          hlsRef.current.startLoad(-1)
        } else if (mpegtsRef.current) {
          mpegtsRef.current.unload()
          mpegtsRef.current.load()
          video.play().catch(() => {})
        } else {
          // Native <video>: reload the current source
          video.load()
          video.play().catch(() => {})
        }
      }, delayMs)
    }

    // Apply volume/mute before any play() fires
    video.volume = volume
    video.muted = isMuted

    // Flag set in the native <video> (VOD) branch to suppress live-only reconnect on end
    let vodPath = false

    // ── URL type detection ─────────────────────────────────────────
    // Three playback paths:
    //
    // 1. HLS.js  — .m3u8 manifests, or /live/ URLs with no extension
    //              (extensionless live streams return HLS from the server)
    //
    // 2. mpegts.js — URLs ending in .ts (raw MPEG-TS over HTTP)
    //              Chromium dropped video/mp2t native support; HLS.js expects
    //              M3U8 text not binary TS. mpegts.js demuxes TS→fMP4 via MSE.
    //
    // 3. Native <video> — everything else (.mp4, .mkv, Xtream VOD, etc.)

    const isHls = effectiveUrl.includes('.m3u8') ||
      (effectiveUrl.includes('/live/') && !effectiveUrl.endsWith('.ts'))
    const isMpegTs = effectiveUrl.endsWith('.ts')

    if (isHls && Hls.isSupported()) {
      // ── HLS / TS playback via HLS.js ───────────────────────────
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        // Generous timeouts for slow IPTV servers (default is 10s / 1 retry)
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 2000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 2000,
      })
      hlsRef.current = hls
      hls.loadSource(effectiveUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return
        setLoading(false)
        setIsLive(hls.levels?.[0]?.details?.live ?? true)

        // Collect audio tracks (only meaningful if more than one)
        const aTracks = (hls.audioTracks ?? []).map((t, i) => ({
          id: i,
          name: t.name || t.lang || `Audio ${i + 1}`,
          lang: t.lang || '',
        }))
        setAudioTracks(aTracks)

        // Collect subtitle/text tracks
        const sTracks = (hls.subtitleTracks ?? []).map((t, i) => ({
          id: i,
          name: t.name || t.lang || `Subtitle ${i + 1}`,
          lang: t.lang || '',
        }))
        setSubtitleTracks(sTracks)

        video.play().catch((e: Error) => {
          if (cancelled || e.name === 'AbortError') return
          setError(String(e))
        })
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (cancelled) return
        const level = hls.levels[hls.currentLevel]
        if (level) {
          // Many IPTV manifests omit RESOLUTION= and FRAME-RATE — fall back to video element
          const h = level.height || video.videoHeight
          const qualityMap: [number, string][] = [[2160,'4K'],[1440,'1440p'],[1080,'1080p'],[720,'720p'],[480,'480p'],[360,'360p']]
          const quality = h ? (qualityMap.find(([t]) => h >= t)?.[1] ?? `${h}p`) : undefined
          const fps = level.frameRate ? `${Math.round(level.frameRate)}fps` : undefined
          setStreamInfo({
            codec: level.videoCodec || 'H.264',
            resolution: quality,
            bitrate: level.bitrate ? `${Math.round(level.bitrate / 1000)} Kbps` : undefined,
            fps,
          })
        }
      })

      // Fallback: read resolution from video element once metadata is decoded.
      // Fires even when the HLS manifest omits RESOLUTION= in EXT-X-STREAM-INF.
      // Also samples FPS via getVideoPlaybackQuality() — two reads 1 s apart gives
      // frames-per-second without needing FRAME-RATE in the manifest.
      video.addEventListener('loadedmetadata', () => {
        if (cancelled) return
        const vh = video.videoHeight
        if (!vh) return
        const level = hls.levels[hls.currentLevel]
        const qualityMap: [number, string][] = [[2160,'4K'],[1440,'1440p'],[1080,'1080p'],[720,'720p'],[480,'480p'],[360,'360p']]
        const quality = qualityMap.find(([t]) => vh >= t)?.[1] ?? `${vh}p`
        // Use manifest frame rate if available, otherwise measure from playback
        const manifestFps = level?.frameRate ? Math.round(level.frameRate) : 0
        setStreamInfo({
          codec: level?.videoCodec || 'H.264',
          resolution: quality,
          bitrate: level?.bitrate ? `${Math.round(level.bitrate / 1000)} Kbps` : undefined,
          fps: manifestFps ? `${manifestFps}fps` : undefined,
        })
        // Measure actual FPS: sample frame counter twice, 1 s apart
        const t1 = setTimeout(() => {
          if (cancelled) return
          const f1 = video.getVideoPlaybackQuality().totalVideoFrames
          const t2 = setTimeout(() => {
            if (cancelled) return
            const f2 = video.getVideoPlaybackQuality().totalVideoFrames
            const measured = Math.round(f2 - f1)
            if (measured > 0) {
              const cur = usePlayerStore.getState().streamInfo
              setStreamInfo({ ...cur, fps: `${measured}fps` })
            }
          }, 1000)
          fpsTimersRef.current.push(t2)
        }, 500)
        fpsTimersRef.current.push(t1)
      }, { once: true })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || !data.fatal) return

        // ── Native <video> fallback helper ───────────────────────────
        // Used for both manifest-timeout and codec-unsupported cases.
        const fallbackToNative = (timeoutMsg: string) => {
          hls.destroy()
          hlsRef.current = null
          video.src = effectiveUrl
          setIsLive(true)
          const onCanPlayFallback = () => {
            if (cancelled) return
            setLoading(false)
            video.play().catch((e: Error) => {
              if (cancelled || e.name === 'AbortError') return
              setError('Stream unavailable — the channel may be offline.')
            })
          }
          video.addEventListener('canplay', onCanPlayFallback, { once: true })
          const fallbackTimer = setTimeout(() => {
            if (cancelled) return
            video.removeEventListener('canplay', onCanPlayFallback)
            setError(timeoutMsg)
            setLoading(false)
          }, 12000)
          video.addEventListener('canplay', () => clearTimeout(fallbackTimer), { once: true })
        }

        // On manifest timeout, attempt native <video> fallback before giving up.
        // Some Xtream /live/ URLs serve a direct MPEG-TS stream rather than an
        // HLS playlist — native playback handles these without needing a manifest.
        if (data.details === 'manifestLoadTimeOut') {
          fallbackToNative('Stream unavailable — the channel may be offline or geo-blocked.')
          return
        }

        // AC-3 / EAC-3 (Dolby Digital) audio: Chromium's MSE rejects the
        // 'audio/mp4;codecs=ac-3' SourceBuffer type even with the full-codec
        // ffmpeg.dll. Fall back to native <video> which uses ffmpeg directly
        // and supports AC-3/EAC-3/DTS out of the box in the packaged build.
        if (data.details === 'bufferAddCodecError') {
          const isAndroid = window.api?.platform === 'android'
          fallbackToNative(isAndroid
            ? 'AC-3/Dolby audio is not supported in the built-in player — try an external player.'
            : 'AC-3/Dolby audio is not supported in the built-in player — try opening in VLC.'
          )
          return
        }

        // Network errors (stall, timeout, loss of connectivity) → auto-reconnect
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          scheduleReconnect()
          return
        }
        // Media errors (codec decode failure) → HLS.js internal recovery
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }
        setError('Stream error — the channel may be offline or temporarily unavailable.')
        setLoading(false)
      })
    } else if (isMpegTs) {
      // ── mpegts.js — raw MPEG-TS over HTTP ────────────────────────
      // Handles live IPTV .ts streams that HLS.js can't manifest-load
      // and Chromium can't decode natively (video/mp2t removed in Chrome 47).
      // Do NOT gate on mpegts.isSupported() — it checks MediaSource.isTypeSupported
      // which can return false in Electron even when MSE is fully functional.
      // Disable worker: Electron's renderer sandbox can block worker creation.
      try {
        const player = mpegts.createPlayer({
          type: 'mpegts',
          url: effectiveUrl,
          isLive: true,
        }, {
          enableWorker: false,
          liveBufferLatencyChasing: false, // disabling prevents the 1-second stutter/skip
          autoCleanupSourceBuffer: true,   // prevent SourceBuffer growing unbounded
          autoCleanupMinBackwardDuration: 3,
          autoCleanupMaxBackwardDuration: 6,
          fixAudioTimestampGap: false,
        })
        mpegtsRef.current = player
        player.attachMediaElement(video)
        player.load()
        setIsLive(true)

        // Start playback as soon as enough data is buffered
        const onMpegTsCanPlay = () => {
          if (cancelled) return
          setLoading(false)
          video.play().catch((e: Error) => {
            if (cancelled || e.name === 'AbortError') return
            setError(String(e))
          })
        }
        video.addEventListener('canplay', onMpegTsCanPlay, { once: true })

        // mpegts.Events.ERROR signature: (errorType, errorDetail, errorInfo)
        player.on(mpegts.Events.ERROR, (_errorType: unknown, _errorDetail: unknown, _errorInfo: unknown) => {
          if (cancelled) return
          scheduleReconnect()
        })
      } catch (e) {
        // mpegts.js failed to initialize — surface error and let user open externally
        setError('Stream format not supported in browser player — try opening in VLC.')
        setLoading(false)
      }

    } else {
      // ── VOD (MP4, MKV, Xtream VOD) — route through HLS proxy ─────
      // hls.js handles all seeking natively via MSE; no video.src reload needed
      vodPath = true
      setIsLive(false)

      // Reset seek state when starting a new channel/episode
      vodSeekOffsetRef.current = 0
      vodForceEncodeRef.current = false

      // Containers that need native hardware decoding — route to MPV instead of hls.js
      const FORCE_ENCODE_CONTAINERS = ['.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm']
      const needsMpv = effectiveUrl
        ? FORCE_ENCODE_CONTAINERS.some((ext) => effectiveUrl.toLowerCase().includes(ext))
        : false

      if (needsMpv && (window.api as any)?.mpv) {
        isMpvModeRef.current = true
        isVodProxyRef.current = false

        // Send CSS-pixel rect relative to the Electron content area.
        // Use videoRef (the <video> element) — it always has the correct bounds at this point.
        // Main process converts to physical screen pixels via getContentBounds() + scaleFactor.
        const getBounds = (): { left: number; top: number; width: number; height: number } => {
          const el = videoRef.current ?? videoContainerRef.current
          if (!el) return { left: 0, top: 0, width: 800, height: 450 }
          const r = el.getBoundingClientRect()
          return {
            left: Math.round(r.left),
            top: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }
        }

        ;(async () => {
          try {
            const { useSettingsStore } = await import('../stores/settingsStore')
            const { settings } = useSettingsStore.getState()
            const result = await (window.api as any).mpv.start(
              effectiveUrl,
              getBounds(),
              settings.externalPlayers,
            )
            if (cancelled) { ;(window.api as any).mpv.stop(); return }
            if (result?.duration) setDuration(result.duration)
            setLoading(false)
            ;(window.api as any).mpv.onTimePos((t: number) => { if (!cancelled) setCurrentTime(t) })
            // Observe the video element for size/position changes and reposition MPV
            const observeTarget = videoRef.current ?? videoContainerRef.current
            const ro = new ResizeObserver(() => {
              if (!cancelled) (window.api as any).mpv.setBounds(getBounds())
            })
            if (observeTarget) ro.observe(observeTarget)
          } catch {
            if (cancelled) return
            isMpvModeRef.current = false
            setError('MPV not found — install from mpv.io or add it to External Players in Settings.')
            setLoading(false)
          }
        })()

        // Skip HLS proxy setup entirely for MPV-routed streams
      } else {
        isVodProxyRef.current = true
        if (needsMpv) {
          // mpv API not available (web/Android build) — fall back to encode
          vodForceEncodeRef.current = true
        }

      const startVodHls = async (seekTime = 0) => {
        // Stop any previous HLS session before starting a new one
        if (vodHlsSessionRef.current) {
          ;(window.api as any)?.vod?.stopHls?.(vodHlsSessionRef.current).catch(() => {})
          vodHlsSessionRef.current = null
        }

        let playlistUrl: string
        let sessionId: string | null = null

        try {
          const result = await (window.api as any)?.vod?.startHls?.(effectiveUrl, {
            seekTime: seekTime > 0 ? seekTime : undefined,
            forceEncode: vodForceEncodeRef.current || undefined,
          })
          if (cancelled) return
          if (result?.playlistUrl) {
            playlistUrl = result.playlistUrl
            sessionId = result.sessionId
            vodHlsSessionRef.current = sessionId
          } else {
            // No proxy available (web build / Android) — fall back to direct src
            video.src = effectiveUrl
            video.addEventListener('canplay', () => {
              if (!cancelled) { setLoading(false); video.play().catch(() => {}) }
            }, { once: true })
            return
          }
        } catch {
          if (cancelled) return
          if (!vodForceEncodeRef.current) {
            // Copy-mode failed (codec incompatible with MPEG-TS) — retry with H.264 encode
            vodForceEncodeRef.current = true
            startVodHls(seekTime)
            return
          }
          // Both copy and encode failed — show error, do not load container URL directly
          setError('VOD stream unavailable — try opening in an external player (VLC).')
          setLoading(false)
          return
        }

        if (!Hls.isSupported()) {
          // hls.js not supported (shouldn't happen in Electron) — direct src fallback
          video.src = playlistUrl
          video.addEventListener('canplay', () => {
            if (!cancelled) { setLoading(false); video.play().catch(() => {}) }
          }, { once: true })
          return
        }

        const hls = new Hls({ enableWorker: false })
        hlsRef.current = hls

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return
          // Probe for accurate duration (codec handling is done via extension detection + error retry)
          const port = vodProxyPortRef.current
          if (port && seekTime === 0) {
            fetch(`http://127.0.0.1:${port}/probe?url=${encodeURIComponent(effectiveUrl)}`)
              .then((r) => r.json())
              .then(({ duration }: { duration: number | null }) => {
                if (!cancelled && duration) setDuration(duration)
              })
              .catch(() => {})
          }
          setLoading(false)
          video.play().then(() => {
            if (!cancelled) { video.volume = volume; video.muted = isMuted }
          }).catch((e: Error) => {
            if (cancelled || e.name === 'AbortError') return
            setError(String(e))
          })
        })

        // fMP4 safety net: MANIFEST_PARSED fires before init.mp4 is fetched, so the
        // pending video.play() may never resolve if MSE has no data yet. Once the
        // first fragment is actually buffered we know MSE is ready — retry play().
        hls.once(Hls.Events.FRAG_BUFFERED, () => {
          if (!cancelled && video.paused) {
            video.play().catch(() => {})
          }
        })

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (cancelled || !data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !vodForceEncodeRef.current) {
            // Codec copied into TS but MSE can't decode it (e.g. HEVC) — re-transcode to H.264
            vodForceEncodeRef.current = true
            hls.destroy()
            hlsRef.current = null
            startVodHls(vodSeekOffsetRef.current)
          } else {
            setError('VOD stream error — try opening in an external player (VLC).')
          }
        })

        // Detect resolution once metadata arrives
        video.addEventListener('loadedmetadata', () => {
          if (cancelled) return
          const h = video.videoHeight
          const qualityMap: [number, string][] = [[2160,'4K'],[1440,'1440p'],[1080,'1080p'],[720,'720p'],[480,'480p'],[360,'360p']]
          const quality = h ? (qualityMap.find(([t]) => h >= t)?.[1] ?? `${h}p`) : undefined
          setStreamInfo({ resolution: quality, codec: undefined, bitrate: undefined })
        }, { once: true })

        hls.loadSource(playlistUrl)
        hls.attachMedia(video)
      }

      startVodHlsRef.current = startVodHls
      startVodHls()
      } // end else (HLS proxy path)
    }

    const onTimeUpdate = () => { if (!cancelled) setCurrentTime(video.currentTime + vodSeekOffsetRef.current) }
    const onDurationChange = () => {
      if (!cancelled && isFinite(video.duration) && !vodPath) setDuration(video.duration)
    }
    const onPlaying = () => {
      if (!cancelled) {
        setLoading(false)
        setReconnecting(false)
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      }
    }
    // VOD (hls.js) handles its own stall recovery — only reconnect for live streams
    const onWaiting = () => { if (!cancelled && !vodPath) scheduleReconnect() }
    const onStalled = () => { if (!cancelled && !vodPath) scheduleReconnect() }
    const onEnded = () => { if (!cancelled && !vodPath) scheduleReconnect(3000) }
    const onError = () => {
      if (cancelled) return
      const err = video.error
      if (!err) return
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        if (vodPath && !vodForceEncodeRef.current) {
          // MSE rejected the stream — retry with forced H.264 transcode
          vodForceEncodeRef.current = true
          startVodHlsRef.current?.(vodSeekOffsetRef.current)
          return
        }
        setError('Format not supported — try opening in an external player (VLC).')
      } else if (err.code !== MediaError.MEDIA_ERR_ABORTED && !vodPath) {
        scheduleReconnect()
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    return () => {
      cancelled = true
      fpsTimersRef.current.forEach(clearTimeout)
      fpsTimersRef.current = []
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy()
        mpegtsRef.current = null
      }
      // Stop HLS session if this was a VOD stream
      if (vodHlsSessionRef.current) {
        ;(window.api as any)?.vod?.stopHls?.(vodHlsSessionRef.current).catch(() => {})
        vodHlsSessionRef.current = null
      }
      isVodProxyRef.current = false
      startVodHlsRef.current = null
      if (isMpvModeRef.current) {
        ;(window.api as any)?.mpv?.stop?.()
        ;(window.api as any)?.mpv?.offTimePos?.()
        isMpvModeRef.current = false
      }
    }
  }, [effectiveUrl])

  // External player helper — resolves the configured player path and opens the stream
  const openInExternal = useCallback(async () => {
    const targetUrl = effectiveUrl || url || ''
    if (!targetUrl) return
    try {
      const { useSettingsStore } = await import('../stores/settingsStore')
      const { settings } = useSettingsStore.getState()
      const defaultName = settings.defaultExternalPlayer
      // Find the full path for the default (or first available) player
      const player =
        settings.externalPlayers.find((p) => p.name === defaultName) ||
        settings.externalPlayers[0]
      const playerPath = player?.path || ''
      // ipc: openExternal(playerPath, streamUrl) — falls back to shell.openExternal if path not found
      await window.api.player.openExternal(playerPath, targetUrl)
    } catch {
      // ignore
    }
  }, [effectiveUrl, url])

  // VOD seek — restarts the HLS session at the requested position using ffmpeg -ss input seek.
  // video.currentTime alone can't seek past segments that haven't been transcoded yet.
  const handleVodSeek = useCallback(async (t: number) => {
    if (isMpvModeRef.current) {
      ;(window.api as any)?.mpv?.seek?.(t)
      setCurrentTime(t)
      return
    }
    if (!isVodProxyRef.current) {
      // Native HLS VOD — hls.js handles seeking directly via currentTime
      if (videoRef.current) videoRef.current.currentTime = t
      setCurrentTime(t)
      return
    }
    const url = effectiveUrlRef.current
    if (!url) return
    // Destroy current hls instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    // Stop current session
    if (vodHlsSessionRef.current) {
      ;(window.api as any)?.vod?.stopHls?.(vodHlsSessionRef.current).catch(() => {})
      vodHlsSessionRef.current = null
    }
    // Optimistically update UI so seek bar stays at t while the new session starts
    vodSeekOffsetRef.current = t
    setCurrentTime(t)
    setLoading(true)
    try {
      const result = await (window.api as any)?.vod?.startHls?.(url, {
        seekTime: t,
        forceEncode: vodForceEncodeRef.current || undefined,
      })
      if (!result?.playlistUrl) return
      vodHlsSessionRef.current = result.sessionId
      const video = videoRef.current
      if (!video) return
      if (!Hls.isSupported()) {
        video.src = result.playlistUrl
        video.addEventListener('canplay', () => { setLoading(false); video.play().catch(() => {}) }, { once: true })
        return
      }
      const hls = new Hls({ enableWorker: false })
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else setError('VOD seek error — try opening in an external player (VLC).')
      })
      hls.loadSource(result.playlistUrl)
      hls.attachMedia(video)
    } catch {
      setLoading(false)
    }
  }, [setCurrentTime, setLoading, setError])

  // On Android, auto-forward to the system player when the WebView can't decode the format.
  // This covers movies (MKV, HEVC, etc.) and series episodes with unsupported codecs.
  // Use a ref so the effect dep array stays stable regardless of effectiveUrl changes.
  const openInExternalRef = useRef(openInExternal)
  openInExternalRef.current = openInExternal

  useEffect(() => {
    if (!isAndroid || !storeError) return
    const isFormatError =
      storeError.includes('Format not supported') ||
      storeError.includes('not supported in browser')
    if (isFormatError) {
      openInExternalRef.current()
    }
  }, [storeError, isAndroid])

  // ── Series episode picker ──────────────────────────────────────
  if (channel?.streamType === 'series' && !episodeUrl) {
    return (
      <SeriesEpisodePicker
        channel={channel}
        isTV={isTV}
        onEpisode={(epUrl, title) => {
          setEpisodeUrl(epUrl)
          setEpisodeTitle(title)
        }}
      />
    )
  }

  // ── No channel selected ────────────────────────────────────────
  if (!url && !channel) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-hard)' }}
      >
        <div
          className="rounded-2xl flex items-center justify-center mb-6"
          style={{ width: 80, height: 80, background: 'var(--bg-surface)', boxShadow: 'var(--shadow-raised)' }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
            <path d="M14 10l12 8-12 8V10z"/>
          </svg>
        </div>
        <h2
          className="text-2xl font-bold text-metallic"
          style={{ fontFamily: 'Syne', letterSpacing: '-0.04em' }}
        >
          Select a Channel
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          Choose from the list to start watching
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-tv-player
      tabIndex={isTV ? 0 : undefined}
      className={`relative w-full h-full ${isAndroid ? '' : 'bg-black'}`}
      onMouseMove={resetControlsTimer}
      onPointerDown={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onDoubleClick={() => setFullscreen(!isFullscreen)}
      onFocus={() => { setPlayerFocused(true); resetControlsTimer() }}
      onBlur={() => setPlayerFocused(false)}
      style={{
        cursor: showControls ? 'default' : 'none',
        outline: 'none',
        // TV: fullscreen = cover viewport via CSS (WebView doesn't support requestFullscreen)
        ...(isTV && isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999 } : {}),
      }}
      onKeyDown={(e) => {
        // i / Info key → toggle EPG overlay (works on both TV and desktop)
        if ((e.key === 'i' || e.key === 'I' || e.key === 'Info') && e.target === e.currentTarget) {
          e.preventDefault()
          setShowEpgOverlay((v) => !v)
          return
        }
        if (!isTV) return
        // Enter / Space → play/pause toggle
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          if (isPlaying) pausePlayer()
          else resumePlayer()
        }
        // ArrowDown → focus first control button
        if (e.key === 'ArrowDown' && e.target === e.currentTarget) {
          e.preventDefault()
          const btn = document.querySelector<HTMLElement>(
            '[data-tv-controls] button, [data-tv-controls] input[type="range"]'
          )
          btn?.focus()
        }
        // ArrowLeft / ArrowUp → back to channel list
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && e.target === e.currentTarget) {
          e.preventDefault()
          document.querySelector<HTMLElement>('[data-tv-content] [tabindex="0"]')?.focus()
        }
      }}
    >
      {/* Episode title overlay */}
      {episodeTitle && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <p className="text-xs font-medium px-2 py-1 rounded-md" style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
            {episodeTitle}
          </p>
        </div>
      )}

      {isAndroid ? (
        /* Android: transparent placeholder div — ExoPlayer SurfaceView renders behind the WebView */
        <div
          ref={videoContainerRef}
          className="w-full h-full"
          style={{ background: 'transparent' }}
        />
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
          playsInline
          tabIndex={-1}
        />
      )}

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }}
          />
        </div>
      )}

      {/* Reconnecting badge — shown during stall recovery, hides once playback resumes */}
      {reconnecting && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            <div
              className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }}
            />
            Reconnecting…
          </div>
        </div>
      )}

      {/* Error */}
      {storeError && (
        <ErrorOverlay error={storeError} isTV={isTV} onOpenExternal={openInExternal} />
      )}

      {/* EPG overlay — TV Guide panel, toggled by pressing i / Info */}
      <EPGOverlay
        show={showEpgOverlay}
        onDismiss={() => setShowEpgOverlay(false)}
        channel={channel}
        isTV={isTV}
      />

      {/* Controls overlay — always visible on TV (D-pad must be able to reach them) */}
      <PlayerControls
        visible={showControls || playerFocused}
        videoRef={videoRef}
        onToggleEpgOverlay={() => setShowEpgOverlay((v) => !v)}
        onSeek={handleVodSeek}
      />
    </div>
  )
}
