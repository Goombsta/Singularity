import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
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
    fetch: (url: string) => ipcRenderer.invoke('net:fetch', url),
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
