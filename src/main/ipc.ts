import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import Store from 'electron-store'

// electron-store v10 extends Conf — cast to any to avoid TS type issues with older @types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store() as any

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

  // File I/O
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer.toString('utf-8')
  })

  ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer
  })

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
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

  // External player launch
  ipcMain.handle('player:openExternal', async (_, playerPath: string, streamUrl: string) => {
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
  ipcMain.handle('net:fetch', async (_, url: string) => {
    const { net } = await import('electron')
    return new Promise((resolve) => {
      try {
        const request = net.request({ url, method: 'GET' })
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
}
