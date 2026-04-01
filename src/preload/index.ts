import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Platform string — lets renderer show/hide platform-specific UI (e.g. hide custom window
  // controls on macOS where native traffic lights are used instead)
  platform: process.platform,
  // Window
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  // Dialogs
  dialog: {
    openFile: (filters?: Electron.FileFilter[]) => ipcRenderer.invoke('dialog:openFile', filters),
    saveFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  },
  // File system
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    readFileBinary: (filePath: string) => ipcRenderer.invoke('fs:readFileBinary', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),
  },
  // Store
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },
  // External players
  player: {
    openExternal: (playerPath: string, streamUrl: string) =>
      ipcRenderer.invoke('player:openExternal', playerPath, streamUrl),
    detectExternal: () => ipcRenderer.invoke('player:detectExternal'),
  },
  // Network
  net: {
    fetch: (url: string, options?: { headers?: Record<string, string> }) =>
      ipcRenderer.invoke('net:fetch', url, options),
  },
  // Updater — download platform installer to temp and run it
  updater: {
    download: (url: string) => ipcRenderer.invoke('updater:download', url),
  },
  // VOD proxy
  vod: {
    getProxyPort: (): Promise<number | null> => ipcRenderer.invoke('vod:proxyPort'),
    startHls: (url: string, opts?: { seekTime?: number; forceEncode?: boolean }): Promise<{ sessionId: string; playlistUrl: string }> =>
      ipcRenderer.invoke('vod:startHls', url, opts),
    stopHls: (sessionId: string): Promise<void> => ipcRenderer.invoke('vod:stopHls', sessionId),
  },
  // MPV native player
  mpv: {
    start: (url: string, cssRect: { left: number; top: number; width: number; height: number }, externalPlayers: { name: string; path: string }[]) =>
      ipcRenderer.invoke('mpv:start', url, cssRect, externalPlayers),
    stop: () => ipcRenderer.invoke('mpv:stop'),
    setBounds: (cssRect: { left: number; top: number; width: number; height: number }) =>
      ipcRenderer.invoke('mpv:bounds', cssRect),
    seek: (t: number) => ipcRenderer.invoke('mpv:seek', t),
    pause: () => ipcRenderer.invoke('mpv:pause'),
    resume: () => ipcRenderer.invoke('mpv:resume'),
    onTimePos: (cb: (t: number) => void) => {
      ipcRenderer.on('mpv:timePos', (_e, t) => cb(t))
    },
    offTimePos: () => {
      ipcRenderer.removeAllListeners('mpv:timePos')
    },
  },
  // Casting (Chromecast + DLNA)
  cast: {
    getDevices: () => ipcRenderer.invoke('cast:getDevices'),
    startDiscovery: () => ipcRenderer.invoke('cast:startDiscovery'),
    start: (deviceId: string, streamUrl: string, channelName: string) =>
      ipcRenderer.invoke('cast:start', deviceId, streamUrl, channelName),
    stop: () => ipcRenderer.invoke('cast:stop'),
    onDevicesUpdated: (cb: (devices: unknown[]) => void) => {
      ipcRenderer.on('cast:devicesUpdated', (_event, devices) => cb(devices))
    },
    offDevicesUpdated: () => {
      ipcRenderer.removeAllListeners('cast:devicesUpdated')
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
