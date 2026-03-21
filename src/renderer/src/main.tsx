import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Type declarations for Electron API
declare global {
  interface Window {
    api: {
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
// Browser-preview safety shim — stubs window.api when running outside Electron
// ---------------------------------------------------------------------------
if (!window.api) {
  const noop = async () => {}
  const noopFalse = async () => false
  const noopArr = async () => []
  const noopNull = async () => null
  window.api = {
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
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        return { data: b64, status: res.status }
      },
    },
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
