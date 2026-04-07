const { contextBridge, ipcRenderer } = require('electron')

const UPDATE_EVENT_CHANNEL = 'desktop-update:event'
const UI_EVENT_CHANNEL = 'desktop-ui:event'
const FOLDER_SYNC_EVENT_CHANNEL = 'desktop-folder-sync:event'

contextBridge.exposeInMainWorld('nodalDesktop', {
  isDesktop: true,
  getUpdateState: () => ipcRenderer.invoke('desktop-update:get-state'),
  checkForUpdatesNow: () => ipcRenderer.invoke('desktop-update:check-now'),
  installUpdate: () => ipcRenderer.invoke('desktop-update:install'),
  showNotification: (payload) => ipcRenderer.invoke('desktop-notification:show', payload),
  getFolderSyncState: () => ipcRenderer.invoke('desktop-folder-sync:get-state'),
  chooseFolderForSync: () => ipcRenderer.invoke('desktop-folder-sync:choose-folder'),
  connectFolderSync: (payload) => ipcRenderer.invoke('desktop-folder-sync:connect', payload),
  disconnectFolderSync: () => ipcRenderer.invoke('desktop-folder-sync:disconnect'),
  scanFolderSyncNow: () => ipcRenderer.invoke('desktop-folder-sync:scan-now'),
  setFolderSyncKeepRunningInTray: (keepRunningInTray) =>
    ipcRenderer.invoke('desktop-folder-sync:set-keep-running-in-tray', keepRunningInTray),
  openFolderSyncLocation: () => ipcRenderer.invoke('desktop-folder-sync:open-folder'),
  readFolderSyncFile: (absolutePath) => ipcRenderer.invoke('desktop-folder-sync:read-file', absolutePath),
  writeFolderSyncFile: (payload) => ipcRenderer.invoke('desktop-folder-sync:write-file', payload),
  acknowledgeFolderSyncFile: (payload) => ipcRenderer.invoke('desktop-folder-sync:acknowledge-file', payload),
  onUiEvent: (listener) => {
    const handler = (_event, payload) => {
      listener(payload)
    }

    ipcRenderer.on(UI_EVENT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(UI_EVENT_CHANNEL, handler)
    }
  },
  onUpdateEvent: (listener) => {
    const handler = (_event, state) => {
      listener(state)
    }

    ipcRenderer.on(UPDATE_EVENT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(UPDATE_EVENT_CHANNEL, handler)
    }
  },
  onFolderSyncEvent: (listener) => {
    const handler = (_event, payload) => {
      listener(payload)
    }

    ipcRenderer.on(FOLDER_SYNC_EVENT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(FOLDER_SYNC_EVENT_CHANNEL, handler)
    }
  },
})
