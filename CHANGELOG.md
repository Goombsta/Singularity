# Changelog

**March 2026**

---

## v1.5.1

### Fix: Live TV .m3u8 streams now play via MPV

Live TV HLS streams (`.m3u8`) were not playing in the built-in hls.js player. They now route through MPV's native HLS support, bypassing Chromium's MSE pipeline entirely. hls.js remains as a fallback if MPV is not available.

---

## v1.5.0

### New Feature: MPV Native Player for MKV/AVI/MOV/WMV/FLV/WebM VOD

MKV and other container formats now play via **MPV** instead of the hls.js/MSE pipeline. MPV uses native hardware decoders and handles any codec or container without transcoding — the same approach as TiViMate on Android.

**How it works:**
- When a VOD URL contains a recognised container extension (`.mkv`, `.avi`, `.mov`, `.wmv`, `.flv`, `.webm`), MPV is spawned as a frameless always-on-top window positioned over the player div
- MPV communicates via its JSON IPC named pipe (`\\.\pipe\singularity-mpv`): time position, seek, pause/resume all route through it
- The existing PlayerControls overlay (seek bar, pause button) works transparently — commands are forwarded to MPV
- A `ResizeObserver` repositions the MPV window when the app is resized or fullscreened
- On channel change or close, MPV is terminated cleanly

**MPV is not bundled.** Detection order:
1. External player configured in Settings with "mpv" in the name
2. `C:\Program Files\mpv\mpv.exe` or `%LOCALAPPDATA%\Programs\mpv\mpv.exe`
3. `mpv` on PATH
4. If not found: error toast shown, no crash

All HLS, MPEG-TS, and plain MP4 streams continue to use the existing hls.js path unchanged.

---

## v1.4.9

### Bug Fixes

#### MKV VOD still fails with "Format not supported" even after v1.4.8 encode retry

**Root cause:** Even with `-c:v libx264` output, hls.js's JavaScript MPEG-TS transmuxer has multiple failure modes that produce `MEDIA_ERR_SRC_NOT_SUPPORTED` before the browser ever sees the video: PES timestamp discontinuities from remuxed MKV sources, keyframe sync loss, and incorrect codec string detection from TS bitstream parsing. v1.4.8's retries all produced MPEG-TS segments, so none of them bypassed the transmuxer.

**Fixes applied:**

1. **fMP4 HLS segments** (`-hls_segment_type fmp4`): ffmpeg now produces fragmented MP4 (`.m4s`) segments instead of MPEG-TS. hls.js detects `fmp4` and skips its JS transmuxer entirely — segments go directly to MSE as `video/mp4`, which Chromium handles natively. Codec information comes from the MP4 `stsd` box (exact), not bitstream parsing.

2. **H.264 profile/level constraints**: The `forceEncode` path now adds `-profile:v main -level:v 4.1` and `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2`. This guarantees an MSE-compatible codec string (`avc1.4D4029`) and even dimensions (libx264 requirement), eliminating encode failures on odd-resolution sources.

3. **Optional audio mapping** (`-map 0:a:0?`): MKV files with no audio stream previously caused ffmpeg to exit with code 1 before writing any segments. The `?` suffix makes the mapping skip gracefully if no audio stream exists.

4. **`onError` retry via `startVodHlsRef`**: The `video` element `error` event handler now retries with `forceEncode = true` when `MEDIA_ERR_SRC_NOT_SUPPORTED` fires on a VOD stream (before the v1.4.9 fMP4 fix this was a dead path because `startVodHls` was unreachable from `onError`). `startVodHlsRef` is now assigned before `startVodHls()` is called.

5. **HLS VOD seek routing fix**: The seek handler (`handleVodSeek`) was being called for native `.m3u8` VOD streams (e.g. Xtream `.m3u8` with `#EXT-X-ENDLIST`), incorrectly spinning up a VOD proxy session to re-transcode an already-HLS stream. A new `isVodProxyRef` flag ensures `handleVodSeek` does a direct `video.currentTime` seek for native HLS VOD and only starts a proxy session when actually in proxy mode.

6. **File serving whitelist extended**: The proxy's file handler now allows `.mp4` (fMP4 init segment) and `.m4s` (fMP4 media segments) in addition to `.m3u8` and `.ts`.

---

## v1.4.8

### Bug Fixes

#### MKV (and other container) VOD files fail with "Format not supported"

**Root cause:** The HLS proxy always started with `-c:v copy`. For `.mkv` files whose video track uses VP9, AV1, or other codecs that cannot be muxed into MPEG-TS, ffmpeg never produced a valid playlist. After a 15-second timeout, the code fell back to loading the raw `.mkv` URL directly in the `<video>` element — which Chromium cannot decode — triggering `MEDIA_ERR_SRC_NOT_SUPPORTED`.

**Fixes applied:**

1. **Container extension detection**: `.mkv`, `.avi`, `.mov`, `.wmv`, `.flv`, `.webm` URLs immediately set `forceEncode = true`, skipping the doomed copy attempt and transcoding to H.264/AAC from the first request. Eliminates the 15-second wait entirely for these formats.

2. **Catch block retry**: When the proxy times out or fails (copy-mode ffmpeg crash), the catch block now retries once with `forceEncode = true` instead of loading the raw container URL into the browser. Only shows an error if the encode attempt also fails.

3. **hls.js `MEDIA_ERROR` retry**: If a codec copies successfully into MPEG-TS but the browser's MSE cannot decode it (e.g. HEVC in TS), hls.js fires a fatal `MEDIA_ERROR`. The handler now retries with `forceEncode = true` rather than immediately showing an error.

4. **Simplified probe**: Removed the unreliable codec-restart logic from `MANIFEST_PARSED` (it required the playlist to exist before detecting the codec). The probe now only sets accurate duration. Codec handling is fully covered by the three fixes above.

---

## v1.4.7

### Bug Fixes

#### 1 — VOD seeking resets to position 0 or freezes
- Seeking now restarts the HLS session with ffmpeg `-ss` input seek instead of calling `video.currentTime = t` on a live-transcoding playlist
- `handleVodSeek(t)` destroys the current hls.js instance, stops the ffmpeg session, then starts a new session with `seekTime: t`; playback resumes from the keyframe ≤ t
- `vodSeekOffsetRef` tracks the session start position so `onTimeUpdate` reports the correct stream-absolute time and the seek bar stays accurate throughout playback

#### 2 — "Format not supported" on HEVC / MPEG-2 / non-H.264 streams
- MSE (used by hls.js) only decodes H.264/AVC video; `-c:v copy` silently passes incompatible codecs to the browser
- The `/probe` endpoint now returns `videoCodec` alongside `duration`
- On `MANIFEST_PARSED`, if the detected codec is not H.264/AVC, `vodForceEncodeRef` is set and the session is restarted with `-c:v libx264 -preset ultrafast -crf 23`
- Subsequent seeks also pass `forceEncode: true` so the correct codec is used throughout the session

### Security / Robustness

- **URL scheme allowlist**: both `/hls` and `/probe` endpoints now reject `file://`, `data://`, and any non-HTTP/RTMP/RTSP scheme with a 400 response — prevents local file read via a malicious M3U8
- **Session cap**: `hlsSessions` is capped at 10 concurrent sessions; the oldest session is evicted automatically on overflow — prevents ffmpeg process/disk exhaustion during rapid channel switching
- **Playlist readiness check**: `waitForFile` now checks `fs.statSync().size > 50` instead of `fs.existsSync()` — prevents returning a 0-byte playlist to hls.js before ffmpeg has written the m3u8 header
- **Probe orphan guard**: a `destroyed` flag prevents writing to a disconnected HTTP response when the client closes before ffmpeg finishes probing
- **Removed dead HLS flag**: `delete_segments` was a no-op with `hls_list_size 0`; replaced with `temp_file` only (atomic segment writes on Windows)

---

## v1.4.6

### Bug Fixes

#### 1 — VOD seeking resets playback to beginning
- Replaced fragmented MP4 streaming proxy with HLS local segmentation: ffmpeg now writes `.m3u8` + `.ts` segments to a per-session temp directory; hls.js (already used for live streams) serves as the VOD playback engine via MSE, enabling native `video.currentTime` seeking without reloading the stream
- Each VOD session gets a unique ID; the ffmpeg process and temp directory are cleaned up when the user changes channel, seeks, or quits the app
- Removed `handleVodSeek`, `vodProxyActiveRef`, `vodOriginalUrlRef`, `vodSeekOffsetRef`, and all proxy-reload seek logic from `Player.tsx`

#### 2 — Audio/video sync drift over time
- Added `-map 0:v:0 -map 0:a:0` for explicit stream selection
- Added `-avoid_negative_ts make_zero` to normalize all PTS timestamps to a 0 baseline, fixing initial offset from `-ss` keyframe snapping
- Added `-async 1` to continuously resample audio locked to the video clock throughout playback — replaces `-af aresample=async=1` which only corrected sample-rate mismatches

#### 3 — Seek bar jitter and oscillation during playback
- Replaced controlled React `<input type="range" value={currentTime}>` with a CSS progress bar + invisible range input overlay
- The visual fill div is updated via `requestAnimationFrame` directly on a DOM ref — zero React re-renders during playback
- The invisible `<input type="range">` handles all pointer and keyboard interaction; seek commits on `pointerup`
- Removed `isDraggingSeek` and `dragSeekValue` state entirely

---

## v1.4.5

### Bug Fixes

#### 1 — VOD playback terminates prematurely at 60–120 seconds
- When ffmpeg finishes writing the fragmented MP4 and closes the pipe, the browser fires `MEDIA_ERR_NETWORK` — previously this triggered `scheduleReconnect()`, reloading `video.src` from position 0
- `onError` is now gated behind `!usingProxy`; pipe-close at end-of-file is normal termination for proxy streams and is silently ignored

#### 2 — Audio/video sync drift over time
- `-c:v copy` preserves original video PTS, but the AAC encoder introduces per-frame latency; without timestamp correction, audio and video clocks diverge progressively
- Added `-af aresample=async=1` to the ffmpeg transcode args: the audio resampler continuously compensates for A/V timestamp mismatches, keeping audio locked to the video clock

#### 3 — Seek bar jitter and oscillation during playback
- The seek bar was a fully controlled React input (`value={currentTime}`); every `timeupdate` event (~4 Hz) triggered a Zustand → React re-render that reset the slider's DOM position, visibly fighting the user's pointer during drag
- Added local `isDraggingSeek` / `dragSeekValue` state to `PlayerControls`; while the pointer is down the slider shows the local drag value and ignores `timeupdate` updates — seek is committed only on `pointerup`

---

## v1.4.4

### Bug Fixes

#### 1 — VOD seek bar oscillating / inaccurate duration / scrubbing resets to beginning
- Seek bar oscillated because the proxy serves chunked fMP4 with no `Content-Length`, making `video.duration = Infinity`
- New `/probe` endpoint in `vodProxy.ts` runs ffmpeg to extract the real duration from the stream before playback starts; `setDuration()` is called with the accurate value
- `onDurationChange` is suppressed for proxy streams to prevent `Infinity` overwriting the probed value
- Scrubbing reset to the beginning because `video.currentTime = t` on a chunked byte stream restarts the connection from offset 0
- New `handleVodSeek` callback rebuilds the proxy URL with a `?start=N` parameter instead; the proxy uses `-ss N` for fast server-side keyframe seeking
- `onTimeUpdate` now adds `vodSeekOffsetRef` to `video.currentTime` so the displayed position is always relative to the original file, not the current proxy segment
- `onWaiting` / `onStalled` no longer trigger `scheduleReconnect` for proxy streams — buffering pauses are normal and reconnect was reloading `video.src` back to position 0

---

## v1.4.3

### Bug Fixes

#### 1 — VOD audio silent on AC3/EAC3/DTS content (primary fix)
- VOD streams with Dolby Digital (AC3), Dolby Digital Plus (EAC3), or DTS audio played video with no sound — Chromium's bundled ffmpeg omits proprietary audio decoders
- Added a local HTTP transcoding proxy (`vodProxy.ts`) in the main process using `ffmpeg-static`: VOD URLs are routed through `http://127.0.0.1:{port}/transcode?url=...`, ffmpeg copies video unchanged and transcodes audio to AAC before Chromium receives it
- Proxy starts on a random localhost port at app launch; active ffmpeg processes are killed when the client disconnects or the app exits
- Removed the broken `afterPack` NW.js ffmpeg.dll replacement hook (NW.js binary was ABI-incompatible with Electron 33 at runtime despite appearing to replace the file)
- Added `asarUnpack: node_modules/ffmpeg-static/**` to `electron-builder.yml` so the ffmpeg binary is accessible outside the asar archive in production builds

#### 2 — VOD could silently stay muted after autoplay
- Chromium's autoplay policy can silently mute a video element at the point `play()` is called; the React `isMuted` state remained `false` with no correction
- `onCanPlay` now chains `.then()` after `video.play()` to re-assert `video.volume` and `video.muted` immediately after playback starts

#### 3 — VOD looped indefinitely after playback ended
- `onEnded` called `scheduleReconnect(3000)` unconditionally — correct for live streams but caused VOD content to reload and replay in a loop
- Added a `vodPath` flag (set in the native `<video>` branch); `onEnded` only reconnects when `!vodPath`

#### 4 — Multi-audio VOD tracks not enumerable or switchable
- Native `<video>` audio tracks were never enumerated for VOD content; the audio track picker showed nothing and track switching was silently ignored
- `onLoadedMetadata` now reads `video.audioTracks` and populates the store when more than one track is present
- Audio track switching `useEffect` now handles the native `AudioTrackList` API (toggle `.enabled`) when `hlsRef.current` is null (VOD path)

---

## v1.4.2

### Features & Improvements

#### 1 — EPG overlay (press `i` / `Info`)
- Press **i** / **Info** while a channel is playing to show an inline EPG guide overlay with current and upcoming programs
- Works on TV remote Info key, keyboard shortcut, and via a button in the player controls
- Overlay dismissed by pressing the same key again or clicking outside

#### 2 — Audio & subtitle track selection
- HLS streams with multiple audio tracks now expose a track selector in the player controls
- Subtitle/closed-caption tracks can be toggled on/off per stream
- Track selections applied live without restarting the stream

#### 3 — TV / D-pad navigation
- Full arrow-key navigation in Multiview panels: channel select → volume slider → mute button
- Extended auto-hide timer for TV controls (10 s on TV vs 4 s on mobile)
- Series episode picker: D-pad navigation between season list and episode list, auto-focus on data load
- Multiview: panel `onFocus` events trigger the controls overlay on TV remotes
- TV fullscreen implemented via CSS `position:fixed` (WebView doesn't support `requestFullscreen`)
- Error overlay auto-focuses the action button on TV so it's immediately actionable with Enter

#### 4 — Android Back navigation history
- Back button now returns to the previous view instead of always jumping to Live TV
- Navigation history capped at 10 entries; each view change pushes to the stack

### Bug Fixes

#### 7 — Alphanumeric keys (U, V, Y, Z) blocked in text inputs
- The Fire OS media-key handler in `App.tsx` was matching `keyCode` 85/86/89/90 (KEYCODE_MEDIA_PLAY/PAUSE/REWIND/FAST_FORWARD) before checking whether the event came from a text field, causing `e.preventDefault()` to consume those characters when typed in any input
- Primary detection switched to `e.key === 'MediaPlay'` / `'MediaPause'` / `'MediaRewind'` / `'MediaFastForward'` — named media-key values that never collide with alphanumeric characters
- `keyCode` fallback retained for older Fire OS / Silk browser compatibility, guarded by an `inTextInput` check (`INPUT`, `TEXTAREA`, `contentEditable`) identical to the existing guard in `useKeyboard.ts`

#### 5 — EPG/channel logo fallback extended to EPG views
- Channels missing a `tvg-logo` or with a broken URL now show the Singularity placeholder image in the EPG grid rows, EPG preview panel, and EPG overlay header (previously only applied in the channel list)

#### 6 — External player on Android forwards channel name
- Channel name passed as the `title` extra to VLC / MX Player so the app shows the correct channel name during playback

---

## v1.4.1

### Changes

#### 1 — Update flow: installer opens, app stays running
- Removed auto-kill: Singularity no longer closes when the installer launches
- Removed `taskkill` from `installer.nsh` — the installer no longer force-kills the running app
- User manually closes Singularity before clicking Install in the wizard
- Installer window opens in the foreground via `spawn` (unchanged from v1.4.0)

---

## v1.4.0

### Bug Fixes

#### 1 — Installer now launches correctly and shows its window
- Replaced `shell.openPath` with `spawn` (direct process launch) on Windows
- `shell.openPath` uses ShellExecute with the default verb — the installer process started but its window never surfaced in the foreground, causing it to silently do nothing visible
- `spawn` with `windowsHide: false` launches the installer as its own visible process
- Electron now quits cleanly after 1 second so NSIS's `taskkill` step is a no-op and the installer runs unimpeded in the foreground
- macOS continues to use `shell.openPath` (correct behavior for `.dmg`)

---

## v1.3.9

### Improvements

#### 1 — Update download confirmed working; dev testing shim added
- Confirmed via dev-mode test: 89 MB installer downloads successfully end-to-end
- In dev mode (`app.isPackaged === false`) the installer is not launched (would kill the dev server); a native dialog shows the downloaded file path instead
- Added `console.error` logging in renderer when download returns an error

---

## v1.3.8

### Bug Fixes

#### 1 — Download Update no longer crashes the app
- Fixed: unhandled `error` event on HTTP response stream crashed the main process mid-download — now handled explicitly
- Fixed: relative `Location` headers in HTTP redirects caused "Invalid URL" crash — now resolved against the request URL before following
- Fixed: `app.quit()` was called immediately after `shell.openPath()` (which returns before the installer starts), killing the app before NSIS could initialize — removed; NSIS `installer.nsh` handles closing the app via `taskkill`
- Added 30-second socket timeout so a stalled download fails with an error instead of hanging indefinitely
- Reverted v1.3.7 GitHub-asset URL lookup (was causing download button to disappear); download uses static `singularitytv.app/downloads/` URLs as intended

---

## v1.3.7

### Bug Fixes

#### 1 — Check for Updates: download no longer crashes the app
- Fixed crash caused by `https.get` not following HTTP redirects (GitHub asset URLs redirect to CDN)
- Download handler now follows up to 10 redirects before failing
- Asset download URL is now sourced directly from the GitHub Releases API response (`browser_download_url`) — no longer relies on a static external URL
- App calls `app.quit()` before launching the installer so it closes cleanly instead of being force-killed by NSIS

---

## v1.3.6

### Features & Improvements

#### 1 — Default channel logo for streams without artwork
- Channels without a `tvg-logo` URL now show a custom default image (`tvlogo.png`) instead of text initials
- Channels with a broken or unreachable logo URL also fall back to the default image (via `onError` handler)

---

## v1.3.5

### Features & Improvements

#### 1 — Check for Updates: platform-aware auto-download
- When an update is available the yellow badge now reads **"v1.x.x — Download Update"** instead of opening a browser link
- Clicking it downloads the correct installer for the current platform to the system temp directory and launches it automatically:
  - **Windows** → `Singularity.Setup.exe` (NSIS installer, silent fresh install)
  - **macOS** → `Singularity.dmg` (mounts in Finder)
  - **Android** → `Singularity.apk`
- Badge state tracks the download: "Downloading…" → "Installing…" (once launched) or red "Download failed — retry"
- macOS build artifact renamed to `Singularity.dmg` (no version/arch suffix) for consistent download URL

---

## v1.3.4

### Features & Improvements

#### 1 — Settings → About: Check for Updates button
- New **Check for Updates** button below the Platform row in Settings → About
- Queries the GitHub Releases API via the main-process network layer (bypasses renderer CORS)
- Shows "Checking…" while in progress, then one of:
  - **✓ Up to date** — already on the latest version
  - **vX.X.X available ↗** (yellow badge) — newer version found; clicking opens `https://www.singularitytv.app/`
  - **Check failed** — network error or API unavailable
- Button remains clickable to re-check at any time

---

## v1.3.3

### Features & Improvements

#### 1 — Stream info: FPS now measured from live playback
- FPS is sampled directly from the video element using `getVideoPlaybackQuality()` — two readings 1 second apart give the actual decoded frame rate
- Works on all streams regardless of whether the HLS manifest includes a `FRAME-RATE` attribute
- FPS appears in the stream info overlay (press **I**) alongside quality: `Quality: 1080p · 30fps`

### Bug Fixes

#### 2 — Dev mode: renderer no longer loads a blank white screen
- The Content Security Policy injected by the session intercept was being applied to the Vite dev server (`http://localhost:5173`), blocking Vite's module system
- CSP is now only injected in production builds; dev mode skips it entirely

---

## v1.3.2

### Features & Improvements

#### 1 — Playlist Editor: category rename
- Inline rename for Live TV categories directly in the Playlist Editor groups panel
- Click the pencil icon on any group row to enter edit mode; press **Enter** to save or **Escape** to cancel
- Renaming a category updates all channels assigned to that group in the active playlist

#### 2 — Playlist Editor: category reorder
- Categories can now be moved up, down, or to the top using the arrow/top buttons that appear on hover — matching the existing channel reorder controls
- Drag-and-drop reorder also supported: grab the handle (⠿) on any group row and drop it into position

#### 3 — Playlist Editor: drag-and-drop channel reorder
- Channels within a category can be reordered via drag-and-drop in addition to the existing up/down arrow controls

#### 4 — Playlist Editor: category names no longer cut off
- Action buttons (reorder/rename) are now absolutely positioned and overlay the row on hover instead of consuming flex space
- Category names are fully visible at all times; buttons fade in over the right edge on hover with a gradient backdrop

#### 5 — Multiview: auto-reconnect on stall or stream end
- Each panel monitors for stalls (waiting / stalled / error events); after 10 seconds of no progress the stream reconnects automatically
- When a stream ends, the panel reconnects to the same channel after 3 seconds — no daisy-chaining to the next channel
- A "Reconnecting…" badge with a spinner appears in the top-right corner while a reconnect is in progress

#### 6 — Live TV: double-click player to toggle fullscreen
- Double-clicking the player area enters or exits fullscreen — same as pressing F or the fullscreen button

#### 7 — EPG Guide: double-click preview to toggle fullscreen
- Double-clicking the 480×270 preview player in the EPG Guide enters or exits fullscreen

#### 8 — Stream info: quality label and FPS
- Stream info overlay (press I) now shows "Quality: 1080p · 30fps" instead of raw pixel dimensions
- Quality label derived from stream height: 4K, 1440p, 1080p, 720p, 480p, etc.
- FPS read from HLS manifest FRAME-RATE attribute and shown alongside quality

#### 9 — Installer: silent fresh install, no upgrade prompt
- Removed the Fresh / Upgrade / Cancel dialog — installer now always performs a clean install automatically
- Running instance is silently killed before install; previous version is silently uninstalled; registry keys cleared to prevent the "Failed to uninstall old application files" double-uninstall error

#### 10 — About page: version number tracks GitHub release tag
- Version displayed in Settings → About is now injected at build time from `package.json` and always matches the GitHub release tag

---

## v1.3.1

### Features & Improvements

#### 1 — EPG Guide renamed
- Sidebar and bottom nav label changed from **Guide** to **EPG Guide**
- EPG Guide header title updated to match

#### 2 — EPG Guide always-on preview panel
- Mini player panel now always visible at the top of the EPG Guide — shows a black placeholder with instructions when no channel is playing
- Previously the panel was hidden until a channel was actively selected in Live TV

#### 3 — EPG mini player enlarged further
- Preview player increased from 320×180 to **480×270** (16:9)

#### 4 — EPG Guide: clicking channels no longer navigates to Live TV
- Clicking a channel or program tile plays/previews in the panel above — stays in EPG Guide

#### 5 — EPG Guide: scrollable category column replaces dropdown
- New fixed-width (160px) category column on the left with scrollable category list
- Active category highlighted; click **All Categories** to reset the filter
- Dropdown in the header removed

#### 6 — PiP: resizable from top-right corner
- Drag the top-right resize handle to scale the PiP window to any size
- Minimum size: 240×135; bottom edge stays fixed while resizing vertically
- Resize is independent from drag — does not trigger window movement

#### 7 — PiP: X close button at top-left
- Clicking X hides the PiP window without stopping the stream
- PiP automatically reappears next time you navigate away while a channel is playing

#### 8 — PiP: volume slider no longer triggers drag
- `onPointerDown` stop-propagation added directly on the range `<input>` element

#### 9 — About page: Singularity app icon
- About tab now displays the real Singularity icon instead of an SVG placeholder

#### 10 — Desktop icon: transparent background
- Regenerated `build/icon.ico` from updated `icon-source.png` preserving alpha transparency
- Sizes: 16, 32, 48, 64, 128, 256 px

#### 11 — Windows installer: upgrade/fresh-install dialog
- `customInit` NSIS macro detects existing installation before any UI is shown
- Dialog body clearly maps each button to its action:
  - **Choose Yes** → Fresh Install — removes old version first (recommended)
  - **Choose No** → Upgrade — keeps your playlists and settings
  - **Cancel** → exits the installer
- Installed version number shown in the prompt
- First-time installs skip the dialog entirely
- All installer-only code guarded with `!ifndef BUILD_UNINSTALLER` to prevent NSIS warning-as-error failures during the uninstaller build pass

#### 12 — AC-3 / Dolby Digital audio playback fix
- HLS streams with AC-3/EAC-3 audio previously crashed with `addSourceBuffer` failed — Chromium's MSE does not support `audio/mp4;codecs=ac-3`
- Player now catches `bufferAddCodecError` from HLS.js and falls back to native `<video>` element playback, which uses the full-codec `ffmpeg.dll` and supports AC-3/EAC-3/DTS
- Shared the existing `manifestLoadTimeOut` fallback logic into a reusable helper to avoid code duplication

#### 13 — Multiview: per-panel volume sliders
- Each multiview panel now has an independent volume slider (0–100%) in the hover controls overlay, between the channel dropdown and the mute button
- Dragging to 0 auto-mutes the panel; dragging above 0 auto-unmutes
- The mute button continues to work as a standalone toggle
- Volume level persists per panel independently of the mute state

#### 15 — Security hardening (main process IPC)
- Removed `webSecurity: false` from BrowserWindow; replaced with a targeted `session.defaultSession.webRequest.onHeadersReceived` intercept that injects `Access-Control-Allow-Origin` on HTTP/HTTPS responses only — Electron's same-origin and mixed-content protections remain active
- Added Content Security Policy via the same session intercept: `script-src 'self'` blocks injected scripts; `media-src *` and `img-src *` keep IPTV streams and channel logos working
- Added `assertSafePath()` to all three `fs:*` IPC handlers — file reads and writes are now restricted to the user's home directory and app data directory; paths outside those roots are rejected
- Added `isSafeUrl()` scheme allowlist (`http`, `https`, `rtsp`, `rtmp`, `rtsps`, `rtmps`) applied to `shell.openExternal` and `player:openExternal` — blocks custom OS protocol handler exploits (e.g. `ms-msdt://`, `search://`)
- Added URL scheme validation and sensitive header blocking (`host`, `cookie`, `authorization`, `proxy-authorization`, `x-forwarded-for`) to the `net:fetch` IPC proxy handler
- Added `.env.*` to `.gitignore` to cover `.env.local`, `.env.production`, and other variant files

#### 14 — Stalker Portal: play-time stream URL resolution
- Stalker channels previously resolved all `create_link` URLs at playlist load time with a single token, causing token expiry failures on large portals
- Channels now load instantly with the raw portal command stored; `create_link` is called with a fresh handshake token at the moment a channel is played
- Applies to both in-app playback and "Open in External Player" (VLC etc.)
- Fixes channels not loading and VLC receiving unusable `http://localhost/ch/...` addresses

---

## v1.3.0

### Features & Improvements

#### 1 — About page in Settings
- New **About** tab in Settings showing app name, version badge, and platform info
- Version injected at build time via `__APP_VERSION__` (Vite `define`) — no fragile relative JSON import

#### 2 — EPG mini player enlarged
- Mini player dimensions increased from 256×144 to **320×180**
- Extracted preview into a dedicated `EPGPreviewPanel` sub-component for cleaner code

#### 3 — Sound on EPG and PiP mini players
- `MiniPlayer` now accepts `muted` and `volume` props (defaults: `true`, `1`)
- `useEffect` syncs both to the video element on change; refs ensure URL-reload picks up latest values
- Previously both mini players were always muted with no way to unmute

#### 4 — Draggable Picture-in-Picture
- PiP window can now be dragged anywhere on screen and stays where dropped
- Replaced fixed CSS positioning with framer-motion `x`/`y` motion values initialized to the bottom-right corner
- `whileDrag` cursor/scale feedback; dot-indicator drag handle at top
- Controls use `onPointerDown stopPropagation` to prevent accidental drag when clicking buttons

#### 5 — Volume slider on all mini players
- **FloatingPiP:** volume slider (0–1) replaces the old non-functional mute toggle; 0 = muted
- **EPG Preview:** mute button + volume slider added beneath the preview player
- Main player already had a volume slider

#### 6 — Cast improvements
- `App.tsx` now calls `cast.getDevices()` on startup to populate devices discovered before the event listener registered
- `/live/` Xtream stream URLs now correctly identified as `application/x-mpegurl` (HLS) instead of `video/mp4` when casting to Chromecast
- Cast errors now shown inline in the Cast picker UI instead of being silently swallowed

---

## v1.2.0

### Features & Improvements

#### 1 — EPG preview player in Program Guide
- Mini video player panel at the top of the EPG view shows the currently playing channel
- Displays current program title, time range, description, and channel info alongside the preview

#### 2 — Floating Picture-in-Picture
- Small overlay player appears in the bottom-right corner when navigating to Settings or Playlist Editor while a channel is playing
- Shows channel name/logo, mute toggle, and a Go Live button to return to the player

#### 3 — Windows installer upgrade handling
- When installing over an existing version, the installer now prompts to uninstall the old version first (clean install) or upgrade in place
- User data (playlists, settings) is preserved in both cases

#### 4 — Multiview playback engine replaced
- Switched to MPEGTS.js for reliable multiview stream playback

---

### Bug Fixes

#### 1 — Xtream Live TV shows numbers instead of category names
- Category labels were not being mapped from the Xtream playlist response

#### 2 — Multiview dropdown text invisible (white on white)
- Dropdown font color was not inheriting a visible foreground color in the current theme

#### 3 — No way to switch channels in Multiview
- Missing channel-switch button and keyboard shortcut support in multiview mode

#### 4 — Multiview does not exit when navigating to another section
- Navigating to Settings, Movies, Live TV, etc. did not close the multiview session

#### 5 — Series and Movies sections populate as Live TV
- Content type not being distinguished — all items treated as Live TV streams

#### 6 — Add Playlist missing from Settings
- Settings menu lacked an "Add Playlist" option

#### 7 — EPG sources not loading
- EPG guide fails to fetch or render data from configured EPG sources

#### 8 — M3U playlist not populating all channels per category
- Channels missing from category listings when parsing M3U files

#### 9 — Search bar magnifying glass overlaps typed text
- Icon and input field lacked sufficient padding separation

#### 10 — Channel sidebar cut off — not full width on Live TV, Movies, Series
- Playlist channel panel not expanding to fill available space

#### 11 — Multiview dropdown shows all channels without category grouping
- Dropdown now shows categories first; channels populate after a category is selected
- Search filter cleared when opening the multiview picker

#### 12 — Series playback error: NotSupportedError — no supported source found
- Series stream URLs passed incorrect MIME type or format to the player

#### 13 — Playlist menu freezes the application
- Opening the playlist management menu caused a UI freeze / unresponsive state

#### 14 — EPG Guide left channel column does not scroll with the timeline
- Channel names on the left side remained static while the program guide scrolled vertically

#### 15 — Playback error when switching between playlists
- Second playlist failed to play after switching — stream source not properly re-initialized

#### 16 — Open in External Player button non-functional
- Button was not invoking the system's default media player

#### 17 — Stalker Portal stream URLs using localhost not playable
- Stream URLs stored as `http://localhost/ch/...` (STB-relative) were passed directly to the player instead of being resolved via the `create_link` API

#### 18 — mpegts.js live stream stuttering every second
- `liveBufferLatencyChasing` caused periodic buffer jumps; disabled for smooth playback

#### 19 — mpegts.js frozen frame on start
- Added `video.play()` call on the `canplay` event to unfreeze initial frame
