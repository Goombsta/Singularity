import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { CapacitorHttp } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FilePicker } from '@capawesome/capacitor-file-picker'

// Type declarations for Electron API
declare global {
  interface Window {
    api: {
      platform: string
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
      }
      dialog: {
        openFile: (filters?: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>
        saveFile: (defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>
      }
      fs: {
        readFile: (filePath: string) => Promise<string>
        readFileBinary: (filePath: string) => Promise<Buffer>
        writeFile: (filePath: string, content: string) => Promise<boolean>
      }
      store: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<boolean>
        delete: (key: string) => Promise<boolean>
        clear: () => Promise<boolean>
      }
      player: {
        openExternal: (playerPath: string, streamUrl: string) => Promise<{ success: boolean; error?: string }>
        detectExternal: () => Promise<{ name: string; path: string }[]>
      }
      net: {
        fetch: (url: string) => Promise<{ data: string; status: number }>
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: encode arbitrary bytes to base64 (safe for binary / UTF-8 data)
// ---------------------------------------------------------------------------
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Helper: decode base64 to UTF-8 text
// ---------------------------------------------------------------------------
function base64ToUtf8Text(b64: string): string {
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

// ---------------------------------------------------------------------------
// Helper: encode UTF-8 text to base64 (preserves multi-byte chars)
// ---------------------------------------------------------------------------
function utf8TextToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

// ---------------------------------------------------------------------------
// Platform shim — populates window.api when Electron preload isn't present
// ---------------------------------------------------------------------------
if (!window.api) {
  const cap = (window as any).Capacitor

  if (cap?.isNativePlatform()) {
    // -------------------------------------------------------------------------
    // Capacitor (Android / iOS) — real native implementations
    // -------------------------------------------------------------------------
    window.api = {
      platform: cap.getPlatform?.() ?? 'android',

      window: {
        minimize: async () => {},
        maximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
      },

      dialog: {
        openFile: async () => {
          try {
            const result = await FilePicker.pickFiles({ types: ['*/*'], limit: 1 })
            const file = result.files[0]
            if (!file) return { canceled: true, filePaths: [] }
            return { canceled: false, filePaths: [file.path ?? file.name] }
          } catch {
            return { canceled: true, filePaths: [] }
          }
        },
        saveFile: async (defaultName: string) => {
          // Android has no save dialog — caller will write to Documents via fs.writeFile
          return { canceled: false, filePath: defaultName }
        },
      },

      fs: {
        readFile: async (filePath: string) => {
          const { data } = await Filesystem.readFile({ path: filePath })
          return base64ToUtf8Text(data as string)
        },
        readFileBinary: async (filePath: string) => {
          const { data } = await Filesystem.readFile({ path: filePath })
          const binStr = atob(data as string)
          const bytes = new Uint8Array(binStr.length)
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
          return Buffer.from(bytes)
        },
        writeFile: async (filePath: string, content: string) => {
          await Filesystem.writeFile({
            path: filePath,
            data: utf8TextToBase64(content),
            directory: Directory.Documents,
          })
          return true
        },
      },

      store: {
        get: async (key: string) => {
          const { value } = await Preferences.get({ key })
          return value ? JSON.parse(value) : null
        },
        set: async (key: string, value: unknown) => {
          await Preferences.set({ key, value: JSON.stringify(value) })
          return true
        },
        delete: async (key: string) => {
          await Preferences.remove({ key })
          return true
        },
        clear: async () => {
          await Preferences.clear()
          return true
        },
      },

      player: {
        openExternal: async (_playerPath: string, streamUrl: string) => {
          try {
            await cap.Plugins.ExternalPlayer.open({ url: streamUrl })
            return { success: true }
          } catch (e: any) {
            return { success: false, error: e?.message ?? 'Failed to open external player' }
          }
        },
        detectExternal: async () => {
          try {
            const { players } = await cap.Plugins.ExternalPlayer.detect()
            return players ?? []
          } catch {
            return []
          }
        },
      },

      net: {
        fetch: async (url: string) => {
          const res = await CapacitorHttp.get({ url, responseType: 'arraybuffer' })
          const bytes = new Uint8Array(res.data as ArrayBuffer)
          return { data: bytesToBase64(bytes), status: res.status }
        },
      },

      // Cast — uses the native CastPlugin for real network device discovery and casting.
      // Discovers Chromecast (mDNS) and DLNA devices (SSDP) on the local network.
      // Supports media controls (pause/resume/seek/volume) on Chromecast.
      cast: {
        startDiscovery: async () => {
          try { await cap.Plugins.Cast.startDiscovery() } catch (e) {
            console.warn('[Cast] startDiscovery failed:', e)
          }
        },
        getDevices: async () => {
          try {
            const res = await cap.Plugins.Cast.getDevices()
            return res?.devices ?? []
          } catch (e) {
            console.warn('[Cast] getDevices failed:', e)
            return []
          }
        },
        onDevicesUpdated: (cb: (devices: unknown[]) => void) => {
          cap.Plugins.Cast.addListener('devicesUpdated', (data: any) => {
            cb(data?.devices ?? [])
          }).catch((e: any) => {
            console.warn('[Cast] onDevicesUpdated listener failed:', e)
          })
        },
        offDevicesUpdated: () => {
          try { cap.Plugins.Cast.removeAllListeners?.() } catch { /* ignore */ }
        },
        start: async (deviceId: string, url: string, name?: string) => {
          try {
            await cap.Plugins.Cast.cast({ deviceId, url, name: name || 'IPTV Channel' })
            return { success: true }
          } catch (e: any) {
            console.warn('[Cast] cast failed:', e)
            return { success: false, error: e?.message ?? 'Cast failed' }
          }
        },
        stop: async () => {
          try { await cap.Plugins.Cast.stop() } catch { /* ignore */ }
        },
        refreshDiscovery: async () => {
          try { await cap.Plugins.Cast.refreshDiscovery() } catch (e) {
            console.warn('[Cast] refreshDiscovery failed:', e)
          }
        },
        pauseCast: async () => {
          try { await cap.Plugins.Cast.pauseCast() } catch { /* ignore */ }
        },
        resumeCast: async () => {
          try { await cap.Plugins.Cast.resumeCast() } catch { /* ignore */ }
        },
        seekCast: async (time: number) => {
          try { await cap.Plugins.Cast.seekCast({ time }) } catch { /* ignore */ }
        },
        setVolumeCast: async (level: number) => {
          try { await cap.Plugins.Cast.setVolumeCast({ level }) } catch { /* ignore */ }
        },
      },
    }
  } else {
    // -------------------------------------------------------------------------
    // Browser preview stubs — used in Vite dev server / non-Electron contexts
    // -------------------------------------------------------------------------
    const noop = async () => {}
    const noopFalse = async () => false
    const noopArr = async () => []
    const noopNull = async () => null
    window.api = {
      platform: 'web',
      window: {
        minimize: noop,
        maximize: noop,
        close: noop,
        isMaximized: async () => false,
      },
      dialog: {
        openFile: async () => ({ canceled: true, filePaths: [] }),
        saveFile: async () => ({ canceled: true, filePath: undefined }),
      },
      fs: {
        readFile: async () => '',
        readFileBinary: async () => Buffer.from(''),
        writeFile: noopFalse,
      },
      store: {
        get: noopNull,
        set: noopFalse,
        delete: noopFalse,
        clear: noopFalse,
      },
      player: {
        openExternal: async () => ({ success: false, error: 'Not in Electron' }),
        detectExternal: noopArr,
      },
      net: {
        fetch: async (url: string) => {
          // Fall back to browser fetch in preview mode
          const res = await fetch(url)
          const buf = await res.arrayBuffer()
          return { data: bytesToBase64(new Uint8Array(buf)), status: res.status }
        },
      },
      cast: {
        startDiscovery: noop,
        getDevices: noopArr,
        onDevicesUpdated: (_cb: unknown) => {},
        offDevicesUpdated: noop,
        start: noop,
        stop: noop,
        refreshDiscovery: noop,
        pauseCast: noop,
        resumeCast: noop,
        seekCast: noop,
        setVolumeCast: noop,
      },
    }
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
