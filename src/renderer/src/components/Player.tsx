import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { usePlayerStore } from '../stores/playerStore'
import PlayerControls from './PlayerControls'

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

function SeriesEpisodePicker({ channel, onEpisode }: {
  channel: { name: string; url: string; logo?: string }
  onEpisode: (url: string, title: string) => void
}): JSX.Element {
  const [info, setInfo] = useState<SeriesInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSeason, setActiveSeason] = useState<string>('')

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
          <div className="flex flex-col gap-1 p-3 flex-shrink-0" style={{ width: 120, borderRight: '1px solid var(--border-hard)' }}>
            <p className="text-xs font-semibold px-2 py-1 uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>Season</p>
            {seasonKeys.map((s) => (
              <button
                key={s}
                className={`nav-item w-full text-left text-sm ${activeSeason === s ? 'active' : ''}`}
                onClick={() => setActiveSeason(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Episode list */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-2">
              {episodes.map((ep) => (
                <button
                  key={ep.id}
                  className="neu-raised p-3 text-left w-full rounded-xl hover:scale-[1.01] transition-transform"
                  onClick={() => onEpisode(ep.url, `${channel.name} — S${ep.season}E${ep.episodeNum}`)}
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

// ─── Main Player ────────────────────────────────────────────────────────────

export default function Player(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showControls, setShowControls] = useState(true)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Episode URL override for series (local state — doesn't touch playerStore)
  const [episodeUrl, setEpisodeUrl] = useState<string | null>(null)
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null)

  const {
    url,
    channel,
    isPlaying,
    isPaused,
    isMuted,
    volume,
    isFullscreen,
    setLoading,
    setError,
    setStreamInfo,
    setCurrentTime,
    setDuration,
    setIsLive,
    setFullscreen,
  } = usePlayerStore()

  // Reset episode state whenever channel changes
  useEffect(() => {
    setEpisodeUrl(null)
    setEpisodeTitle(null)
  }, [channel?.id])

  // Controls auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  // Fullscreen handler
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [setFullscreen])

  useEffect(() => {
    if (isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.()
    } else if (!isFullscreen && document.fullscreenElement) {
      document.exitFullscreen?.()
    }
  }, [isFullscreen])

  // Volume / mute
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = volume
    videoRef.current.muted = isMuted
  }, [volume, isMuted])

  // Play/pause — only pause here; playing is started by the load effect.
  // Guard video.play() with readyState check to avoid AbortError when src isn't loaded yet.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPaused) {
      video.pause()
    } else if (isPlaying && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.play().catch(() => {})
    }
  }, [isPlaying, isPaused])

  // Determine the effective URL to load into the video element
  // For series: use episodeUrl (set when user picks an episode), otherwise null
  const effectiveUrl = channel?.streamType === 'series' ? episodeUrl : url

  // When the URL is cleared (e.g. playlist switch → stop()), tear down immediately
  useEffect(() => {
    if (!effectiveUrl) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
      const v = videoRef.current
      if (v) { v.pause(); v.removeAttribute('src'); v.load() }
    }
  }, [effectiveUrl])

  // Load stream
  useEffect(() => {
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

    // Apply volume/mute before any play() fires
    video.volume = volume
    video.muted = isMuted

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
        lowLatencyMode: true,
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
      })
      hlsRef.current = hls
      hls.loadSource(effectiveUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return
        setLoading(false)
        setIsLive(hls.levels?.[0]?.details?.live ?? true)
        video.play().catch((e: Error) => {
          if (cancelled || e.name === 'AbortError') return
          setError(String(e))
        })
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (cancelled) return
        const level = hls.levels[hls.currentLevel]
        if (level) {
          setStreamInfo({
            codec: level.videoCodec || 'H.264',
            resolution: level.width ? `${level.width}×${level.height}` : undefined,
            bitrate: level.bitrate ? `${Math.round(level.bitrate / 1000)} Kbps` : undefined,
          })
        }
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cancelled || !data.fatal) return

        // On manifest timeout, attempt native <video> fallback before giving up.
        // Some Xtream /live/ URLs serve a direct MPEG-TS stream rather than an
        // HLS playlist — native playback handles these without needing a manifest.
        if (data.details === 'manifestLoadTimeOut') {
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
          // If native also fails within 12s, surface the error
          const fallbackTimer = setTimeout(() => {
            if (cancelled) return
            video.removeEventListener('canplay', onCanPlayFallback)
            setError('Stream unavailable — the channel may be offline or geo-blocked.')
            setLoading(false)
          }, 12000)
          video.addEventListener('canplay', () => clearTimeout(fallbackTimer), { once: true })
          return
        }

        setError('Stream error — the channel may be offline or temporarily unavailable.')
        setLoading(false)
      })
    } else if (isMpegTs && mpegts.isSupported()) {
      // ── mpegts.js — raw MPEG-TS over HTTP ────────────────────────
      // Handles live IPTV .ts streams that HLS.js can't manifest-load
      // and Chromium can't decode natively (video/mp2t was removed in Chrome 47).
      const player = mpegts.createPlayer({
        type: 'mpegts',
        url: effectiveUrl,
        isLive: true,
      }, {
        enableWorker: true,
        liveBufferLatencyChasing: true,
        liveSync: true,
      })
      mpegtsRef.current = player
      player.attachMediaElement(video)
      player.load()

      player.on(mpegts.Events.MEDIA_INFO, () => {
        if (cancelled) return
        setLoading(false)
        setIsLive(true)
        video.play().catch((e: Error) => {
          if (cancelled || e.name === 'AbortError') return
          setError(String(e))
        })
      })

      player.on(mpegts.Events.ERROR, (_type: unknown, data: unknown) => {
        if (cancelled) return
        const info = data as { code?: string; msg?: string }
        setError(info?.msg || 'Stream error — the channel may be offline.')
        setLoading(false)
      })

    } else {
      // ── Native video element (MP4, MKV, direct streams) ──────────
      video.src = effectiveUrl
      setIsLive(false)

      // Detect resolution + audio codec support once metadata is loaded
      const onLoadedMetadata = () => {
        if (cancelled) return
        const w = video.videoWidth
        const h = video.videoHeight
        // Test whether common audio codecs are supported to surface a hint in the UI
        const ac3 = video.canPlayType('audio/ac3') || video.canPlayType('audio/x-ac3') || video.canPlayType('audio/eac3')
        const audioHint = ac3 ? undefined : 'AC3/EAC3 audio may be unsupported — use packaged build'
        setStreamInfo({
          resolution: w && h ? `${w}×${h}` : undefined,
          codec: audioHint,
          bitrate: undefined,
        })
      }
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })

      // canplay fires once enough data is buffered to start playback
      const onCanPlay = () => {
        if (cancelled) return
        setLoading(false)
        video.play().catch((e: Error) => {
          if (cancelled || e.name === 'AbortError') return
          const msg = String(e)
          if (msg.includes('NotSupportedError') || msg.includes('no supported source')) {
            setError('Format not supported — try opening in an external player (VLC).')
          } else {
            setError(msg)
          }
        })
      }
      video.addEventListener('canplay', onCanPlay, { once: true })
    }

    const onTimeUpdate = () => { if (!cancelled) setCurrentTime(video.currentTime) }
    const onDurationChange = () => { if (!cancelled) setDuration(video.duration) }
    const onPlaying = () => { if (!cancelled) setLoading(false) }
    const onError = () => {
      if (cancelled) return
      const err = video.error
      if (!err) return
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError('Format not supported — try opening in an external player (VLC).')
      } else if (err.code !== MediaError.MEDIA_ERR_ABORTED) {
        setError('Playback error — stream may be offline or the format is unsupported.')
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onError)

    return () => {
      cancelled = true
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onError)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy()
        mpegtsRef.current = null
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

  // ── Series episode picker ──────────────────────────────────────
  if (channel?.streamType === 'series' && !episodeUrl) {
    return (
      <SeriesEpisodePicker
        channel={channel}
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
      className="relative w-full h-full bg-black"
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {/* Episode title overlay */}
      {episodeTitle && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <p className="text-xs font-medium px-2 py-1 rounded-md" style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
            {episodeTitle}
          </p>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full"
        style={{ objectFit: 'contain' }}
        playsInline
      />

      {/* Loading spinner */}
      {usePlayerStore.getState().isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }}
          />
        </div>
      )}

      {/* Error */}
      {usePlayerStore.getState().error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass rounded-2xl p-6 text-center" style={{ maxWidth: 340 }}>
            <p className="font-semibold text-white mb-2">Playback Error</p>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {usePlayerStore.getState().error}
            </p>
            <button
              className="btn-primary btn text-xs px-3 py-1.5"
              onClick={openInExternal}
            >
              Open in External Player
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <PlayerControls visible={showControls} videoRef={videoRef} />
    </div>
  )
}
