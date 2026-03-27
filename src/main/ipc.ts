import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron'
import { existsSync, createWriteStream, unlink } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import { normalize, resolve, join } from 'path'
import https from 'https'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import Store from 'electron-store'
import * as castService from './castService'

// electron-store v10 extends Conf — cast to any to avoid TS type issues with older @types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store() as any

// ── Security helpers ──────────────────────────────────────────────────────────

/** Allowed roots for file I/O — user home dir and app data dir only */
function getAllowedRoots(): string[] {
  return [normalize(app.getPath('home')), normalize(app.getPath('userData'))]
}

/**
 * Throws if filePath resolves outside the allowed roots.
 * Prevents path-traversal attacks via fs:readFile / fs:writeFile IPC handlers.
 */
function assertSafePath(filePath: string): void {
  const abs = normalize(resolve(filePath))
  const allowed = getAllowedRoots().some((root) => abs.startsWith(root))
  if (!allowed) throw new Error(`Access denied: path outside permitted directories`)
}

/** URL schemes safe to pass to shell.openExternal or spawn as stream URLs */
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'rtsp:', 'rtmp:', 'rtsps:', 'rtmps:'])

function isSafeUrl(url: string): boolean {
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** Headers the renderer must not be able to inject into proxied requests */
const BLOCKED_PROXY_HEADERS = new Set([
  'host',
  'cookie',
  'authorization',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
])

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  })

  // File dialogs
  ipcMain.handle('dialog:openFile', async (_, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }],
    })
    return result
  })

  ipcMain.handle('dialog:saveFile', async (_, defaultName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }],
    })
    return result
  })

  // File I/O — paths are restricted to user home + userData to prevent traversal
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    assertSafePath(filePath)
    const buffer = await readFile(filePath)
    return buffer.toString('utf-8')
  })

  ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => {
    assertSafePath(filePath)
    const buffer = await readFile(filePath)
    return buffer
  })

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    assertSafePath(filePath)
    if (typeof content !== 'string') throw new Error('content must be a string')
    await writeFile(filePath, content, 'utf-8')
    return true
  })

  // Store (persistent settings)
  ipcMain.handle('store:get', (_, key: string) => {
    return store.get(key)
  })
  ipcMain.handle('store:set', (_, key: string, value: unknown) => {
    store.set(key, value)
    return true
  })
  ipcMain.handle('store:delete', (_, key: string) => {
    store.delete(key)
    return true
  })
  ipcMain.handle('store:clear', () => {
    store.clear()
    return true
  })

  // External player launch — URL scheme validated before any shell/spawn call
  ipcMain.handle('player:openExternal', async (_, playerPath: string, streamUrl: string) => {
    if (!isSafeUrl(streamUrl)) {
      return { success: false, error: 'Blocked: unsupported URL scheme' }
    }
    // If a valid executable path is provided, use it
    if (playerPath && existsSync(playerPath)) {
      try {
        spawn(playerPath, [streamUrl], { detached: true, stdio: 'ignore' }).unref()
        return { success: true }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
    // Fallback: open URL with the OS default handler (e.g. VLC associated via file/protocol)
    try {
      await shell.openExternal(streamUrl)
      return { success: true, fallback: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Detect installed external players — paths are platform-specific
  ipcMain.handle('player:detectExternal', () => {
    const isMac = process.platform === 'darwin'

    const candidates = isMac
      ? [
          {
            name: 'IINA',
            paths: ['/Applications/IINA.app/Contents/MacOS/iina'],
          },
          {
            name: 'VLC',
            paths: ['/Applications/VLC.app/Contents/MacOS/VLC'],
          },
          {
            name: 'Infuse',
            paths: [
              '/Applications/Infuse 7.app/Contents/MacOS/Infuse',
              '/Applications/Infuse.app/Contents/MacOS/Infuse',
            ],
          },
        ]
      : [
          {
            name: 'VLC',
            paths: [
              'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
              'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
            ],
          },
          {
            name: 'MPC-HC',
            paths: [
              'C:\\Program Files\\MPC-HC\\mpc-hc64.exe',
              'C:\\Program Files (x86)\\MPC-HC\\mpc-hc.exe',
            ],
          },
          {
            name: 'PotPlayer',
            paths: [
              'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
              'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe',
            ],
          },
        ]

    const detected: { name: string; path: string }[] = []
    for (const player of candidates) {
      for (const p of player.paths) {
        if (existsSync(p)) {
          detected.push({ name: player.name, path: p })
          break
        }
      }
    }
    return detected
  })

  // Fetch URL (bypasses CORS for stream URLs / EPG)
  // Returns { data, status } on success or { error, status: 0 } on network failure.
  // Never rejects — always resolves — so the renderer gets a clean error message instead of
  // the "Error invoking remote method 'net:fetch': ..." Electron IPC prefix.
  ipcMain.handle('net:fetch', async (_, url: string, options?: { headers?: Record<string, string> }) => {
    // Validate URL scheme — only http/https permitted
    if (!isSafeUrl(url)) {
      return { error: 'Blocked: unsupported URL scheme', status: 0 }
    }
    const { net } = await import('electron')
    return new Promise((resolve) => {
      try {
        const request = net.request({ url, method: 'GET' })
        if (options?.headers) {
          for (const [key, value] of Object.entries(options.headers)) {
            // Block headers that could be used for header injection or SSRF
            if (!BLOCKED_PROXY_HEADERS.has(key.toLowerCase())) {
              request.setHeader(key, value)
            }
          }
        }
        const chunks: Buffer[] = []
        request.on('response', (response) => {
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () => {
            const buffer = Buffer.concat(chunks)
            resolve({ data: buffer.toString('base64'), status: response.statusCode })
          })
          response.on('error', (err: Error) => {
            resolve({ error: err.message, status: 0 })
          })
        })
        request.on('error', (err: Error) => {
          // Strip Electron/Node internal prefixes for a clean user-facing message
          const msg = err.message.replace(/^net::/, '')
          resolve({ error: msg, status: 0 })
        })
        request.end()
      } catch (err) {
        resolve({ error: String(err), status: 0 })
      }
    })
  })

  // Download a platform-specific installer to temp dir and run it via shell.openPath.
  // Follows HTTP redirects and handles errors on both request and response streams.
  ipcMain.handle('updater:download', async (_event, url: string) => {
    if (!isSafeUrl(url)) return { error: 'Blocked URL' }
    const fileName = url.split('/').pop()?.split('?')[0] ?? 'Singularity-update'
    const destPath = join(app.getPath('temp'), fileName)

    const fetchWithRedirects = (reqUrl: string, redirectsLeft = 10): Promise<import('http').IncomingMessage> =>
      new Promise((resolve, reject) => {
        const req = https.get(reqUrl, { headers: { 'User-Agent': 'Singularity-IPTV' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirectsLeft <= 0) { reject(new Error('Too many redirects')); return }
            // Resolve relative Location headers against the current URL
            const nextUrl = new URL(res.headers.location, reqUrl).href
            fetchWithRedirects(nextUrl, redirectsLeft - 1).then(resolve, reject)
          } else {
            resolve(res)
          }
        })
        req.setTimeout(30_000, () => { req.destroy(new Error('Request timed out')) })
        req.on('error', reject)
      })

    try {
      const res = await fetchWithRedirects(url)
      if (res.statusCode !== 200) return { error: `HTTP ${res.statusCode}` }

      await new Promise<void>((resolve, reject) => {
        const file = createWriteStream(destPath)
        // Must handle errors on res — unhandled error events crash the main process
        res.on('error', (err) => { file.destroy(); unlink(destPath, () => {}); reject(err) })
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', (err) => { file.close(); unlink(destPath, () => {}); reject(err) })
      })

      if (!app.isPackaged) {
        // Dev mode: launching the installer would kill the dev server. Show path instead.
        await dialog.showMessageBox({
          type: 'info',
          title: 'Dev: Download complete',
          message: `File saved to:\n${destPath}\n\nInstaller would launch here in production.`,
          buttons: ['OK'],
        })
        return { success: true }
      }

      if (process.platform === 'win32') {
        // spawn directly so the installer window surfaces in the foreground.
        // shell.openPath (ShellExecute) can silently fail to bring the window up.
        // Quit after 1s so Electron exits cleanly before NSIS's taskkill fires.
        const child = spawn(destPath, [], { detached: true, stdio: 'ignore', windowsHide: false })
        child.unref()
        setTimeout(() => app.quit(), 1000)
      } else {
        const errMsg = await shell.openPath(destPath)
        if (errMsg) return { error: errMsg }
      }
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // ── Casting ────────────────────────────────────────────────────────────────

  ipcMain.handle('cast:getDevices', () => castService.getDiscoveredDevices())

  ipcMain.handle('cast:startDiscovery', (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) castService.restartDiscovery(win.webContents)
  })

  ipcMain.handle(
    'cast:start',
    async (_event, deviceId: string, streamUrl: string, channelName: string) =>
      castService.startCast(deviceId, streamUrl, channelName),
  )

  ipcMain.handle('cast:stop', async () => castService.stopCast())
}
