import { create } from 'zustand'
import type { EpgChannel } from '../types'
import { parseXMLTV } from '../utils/xmltvParser'

interface EpgStore {
  channels: Map<string, EpgChannel>
  loading: boolean
  lastUpdated: number | null
  error: string | null

  load: (urls: string[]) => Promise<void>
  getChannel: (tvgId: string) => EpgChannel | undefined
  clear: () => void
}

/** Decode base64 string to UTF-8 text without using Node's Buffer */
function base64ToUtf8(b64: string): string {
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Decompress gzipped base64 data using pako */
async function base64GzipToUtf8(b64: string): Promise<string> {
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  const pako = await import('pako')
  return pako.inflate(bytes, { to: 'string' })
}

export const useEpgStore = create<EpgStore>((set, get) => ({
  channels: new Map(),
  loading: false,
  lastUpdated: null,
  error: null,

  load: async (urls: string[]) => {
    if (urls.length === 0) return
    set({ loading: true, error: null })

    const merged = new Map<string, EpgChannel>()

    for (const url of urls) {
      try {
        let xmlText = ''

        // In Electron: use IPC net.fetch to bypass CORS
        // In browser preview: falls back to fetch via the shim
        const result = await window.api.net.fetch(url)
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`)

        // Detect gzip by checking actual magic bytes (0x1f 0x8b) rather than URL extension.
        // Android's HTTP stack (CapacitorHttp) auto-decompresses gzip responses, so a URL
        // ending in .gz may already be plain XML by the time it reaches JS. Trusting the URL
        // extension alone causes double-decompression failures. We check the first two decoded
        // bytes instead — if they are the gzip magic bytes we decompress, otherwise treat as text.
        const firstThreeChars = result.data.substring(0, 4) // 4 base64 chars → 3 bytes
        const firstBytes = atob(firstThreeChars.padEnd(4, '='))
        const isActuallyGzip = firstBytes.charCodeAt(0) === 0x1f && firstBytes.charCodeAt(1) === 0x8b

        if (isActuallyGzip) {
          xmlText = await base64GzipToUtf8(result.data)
        } else {
          xmlText = base64ToUtf8(result.data)
        }

        const parsed = parseXMLTV(xmlText)
        parsed.forEach((ch, id) => {
          if (merged.has(id)) {
            merged.get(id)!.programs.push(...ch.programs)
          } else {
            merged.set(id, ch)
          }
        })
      } catch (err) {
        console.error('EPG load error for', url, err)
        set({ error: `Failed to load EPG from ${url}` })
      }
    }

    set({ channels: merged, loading: false, lastUpdated: Date.now() })
    await window.api.store.set('epgLastUpdated', Date.now())
  },

  getChannel: (tvgId: string) => get().channels.get(tvgId),

  clear: () => set({ channels: new Map(), lastUpdated: null }),
}))
