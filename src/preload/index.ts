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
  // VOD proxy — returns the localhost port of the transcoding proxy
  vod: {
    getProxyPort: (): Promise<number | null> => ipcRenderer.invoke('vod:proxyPort'),
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
