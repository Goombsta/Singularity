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

        const isGzip = url.endsWith('.gz') || url.includes('.xml.gz')

        if (isGzip) {
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
