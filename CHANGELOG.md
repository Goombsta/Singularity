# Changelog

**March 2026**

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
