import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import * as castService from './castService'
import { startVodProxy, stopVodProxy, getVodProxyPort } from './vodProxy'

let mainWindow: BrowserWindow | null = null

// ── Security helpers ──────────────────────────────────────────────────────────

/** URL schemes safe to pass to shell.openExternal */
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'rtsp:', 'rtmp:', 'rtsps:', 'rtmps:'])

function isSafeUrl(url: string): boolean {
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    // hiddenInset on macOS: native traffic lights appear inside the titlebar area
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: '#f0f2f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sandbox: false is required by @electron-toolkit/preload — the preload script
      // uses Node.js APIs before handing off via contextBridge. contextIsolation
      // remains true (the default) so the renderer still cannot call Node directly.
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only open URLs with safe schemes — blocks custom protocol handler exploits
    if (isSafeUrl(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.iptvplayer.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── CORS intercept ────────────────────────────────────────────────────────
  // Inject Access-Control-Allow-Origin on HTTP/HTTPS responses so the renderer
  // can fetch IPTV API endpoints that don't send CORS headers themselves.
  // This replaces the previous webSecurity:false approach — it is narrowly
  // scoped to external HTTP/HTTPS only, so Electron's other security features
  // remain active.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const headers: Record<string, string[]> = {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
      }
      // Only inject CSP in production — Vite dev server needs 'unsafe-eval' for
      // HMR and dynamic imports; injecting a strict CSP in dev breaks the renderer.
      if (!is.dev) {
        headers['Content-Security-Policy'] = [
          "default-src 'self';" +
            " script-src 'self';" +
            " style-src 'self' 'unsafe-inline';" +
            " media-src *;" +
            " img-src * data: blob:;" +
            " connect-src *;" +
            " font-src 'self' data:",
        ]
      }
      callback({ responseHeaders: headers })
    },
  )

  registerIpcHandlers()
  ipcMain.handle('vod:proxyPort', () => getVodProxyPort())
  startVodProxy().catch((err) => console.error('[vodProxy] Failed to start:', err))
  createWindow()
  if (mainWindow) castService.initCastService(mainWindow.webContents)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  castService.destroyCastService()
  stopVodProxy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
