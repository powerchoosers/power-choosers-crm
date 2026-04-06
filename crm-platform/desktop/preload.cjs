const { contextBridge, ipcRenderer } = require('electron')

const UPDATE_EVENT_CHANNEL = 'desktop-update:event'

contextBridge.exposeInMainWorld('nodalDesktop', {
  isDesktop: true,
  getUpdateState: () => ipcRenderer.invoke('desktop-update:get-state'),
  checkForUpdatesNow: () => ipcRenderer.invoke('desktop-update:check-now'),
  installUpdate: () => ipcRenderer.invoke('desktop-update:install'),
  onUpdateEvent: (listener) => {
    const handler = (_event, state) => {
      listener(state)
    }

    ipcRenderer.on(UPDATE_EVENT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(UPDATE_EVENT_CHANNEL, handler)
    }
  },
})
