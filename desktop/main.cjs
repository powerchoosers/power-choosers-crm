const path = require('path')
const { app, BrowserWindow, Menu, Tray, Notification, clipboard, globalShortcut, ipcMain, nativeImage, shell, session } = require('electron')
const { autoUpdater } = require('electron-updater')

const DEV_URL = 'http://localhost:3000/network'
const PROD_URL = 'https://www.nodalpoint.io/network'
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let mainWindow = null
let tray = null
let updateCheckTimer = null
let isQuitting = false
let checkForUpdates = async () => {}
let latestUpdateState = {
  phase: 'idle',
  version: null,
  releaseName: null,
  progress: null,
  error: null,
}

function sendUpdateState(nextState) {
  latestUpdateState = nextState

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-update:event', latestUpdateState)
  }

  updateTrayMenu()
}

function resetUpdateState() {
  sendUpdateState({
    phase: 'idle',
    version: null,
    releaseName: null,
    progress: null,
    error: null,
  })
}

function getUpdateVersion(info) {
  return info?.version || info?.releaseName || null
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

function sendUiEvent(payload) {
  const windowRef = focusMainWindow()
  if (!windowRef) {
    return
  }

  if (windowRef.webContents.isLoading()) {
    windowRef.webContents.once('did-finish-load', () => {
      if (!windowRef.isDestroyed()) {
        windowRef.webContents.send('desktop-ui:event', payload)
      }
    })
    return
  }

  windowRef.webContents.send('desktop-ui:event', payload)
}

function showDesktopNotification(payload) {
  const title = String(payload?.title || '').trim()
  const body = String(payload?.body || '').trim()

  if (!title) {
    return { ok: false, reason: 'missing_title' }
  }

  const notification = new Notification({
    title,
    body,
    silent: false,
  })

  notification.on('click', () => {
    const windowRef = focusMainWindow()
    if (windowRef && payload?.link) {
      const link = String(payload.link)
      if (/^https?:\/\//i.test(link)) {
        shell.openExternal(link)
      } else {
        sendUiEvent({ type: 'navigate', href: link })
      }
    }
  })

  notification.show()
  return { ok: true }
}

function installDownloadedUpdate() {
  if (latestUpdateState.phase !== 'downloaded') {
    return { ok: false, reason: 'no_update_ready' }
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall()
  })

  return { ok: true }
}

function buildTrayMenu() {
  const isUpdateReady = latestUpdateState.phase === 'downloaded'

  return Menu.buildFromTemplate([
    {
      label: 'Open Nodal Point',
      click: () => {
        focusMainWindow()
      },
    },
    {
      label: 'Quick Search',
      accelerator: 'Ctrl/Cmd+Shift+K',
      click: () => {
        sendUiEvent({ type: 'open-command-bar' })
      },
    },
    {
      label: 'Sync Now',
      click: () => {
        sendUiEvent({ type: 'refresh-data' })
      },
    },
    {
      label: 'Import CSV',
      click: () => {
        sendUiEvent({ type: 'open-csv-import' })
      },
    },
    {
      label: 'Attach Files',
      click: () => {
        sendUiEvent({ type: 'open-file-attach' })
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: async () => {
        focusMainWindow()
        await checkForUpdates()
      },
    },
    {
      label: 'Install Update Now',
      enabled: isUpdateReady,
      click: () => {
        installDownloadedUpdate()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function updateTrayMenu() {
  if (!tray) {
    return
  }

  tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  if (!app.isPackaged || tray) {
    return
  }

  const trayIconPath = path.join(__dirname, '..', 'public', 'favicon.ico')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon)
  tray.setToolTip('Nodal Point CRM')
  tray.on('click', () => {
    focusMainWindow()
  })
  tray.on('double-click', () => {
    focusMainWindow()
  })
  updateTrayMenu()
}

function isUpdateCheckBusy() {
  return latestUpdateState.phase === 'checking' || latestUpdateState.phase === 'available' || latestUpdateState.phase === 'downloading' || latestUpdateState.phase === 'downloaded'
}

function buildTextContextMenu(params, webContents) {
  const template = []
  const selectionText = String(params.selectionText || '').trim()
  const spellSuggestions = Array.isArray(params.dictionarySuggestions)
    ? params.dictionarySuggestions.filter(Boolean).slice(0, 6)
    : []

  if (params.linkURL) {
    template.push(
      {
        label: 'Open Link',
        click: () => shell.openExternal(params.linkURL),
      },
      {
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      },
      { type: 'separator' }
    )
  }

  if (params.isEditable) {
    if (spellSuggestions.length > 0) {
      template.push(
        ...spellSuggestions.map((suggestion) => ({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        })),
        { type: 'separator' }
      )
    }

    if (params.misspelledWord) {
      template.push(
        {
          label: `Add "${params.misspelledWord}" to dictionary`,
          click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' }
      )
    }

    template.push(
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    )
    return Menu.buildFromTemplate(template)
  }

  if (selectionText) {
    template.push(
      { role: 'copy' },
      { role: 'selectAll' }
    )
  }

  return template.length > 0 ? Menu.buildFromTemplate(template) : null
}

function getStartUrl() {
  return process.env.ELECTRON_START_URL || (app.isPackaged ? PROD_URL : DEV_URL)
}

function resolveWindowOpenAction(targetUrl) {
  if (!targetUrl || targetUrl === 'about:blank') {
    return 'allow'
  }

  try {
    const parsed = new URL(targetUrl)
    const protocol = parsed.protocol.toLowerCase()
    const host = parsed.hostname.toLowerCase()

    if (protocol === 'mailto:' || protocol === 'tel:' || protocol === 'sms:') {
      return 'external'
    }

    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'about:') {
      return 'deny'
    }

    const allowedHosts = new Set([
      'localhost',
      '127.0.0.1',
      'nodalpoint.io',
      'www.nodalpoint.io',
      'accounts.zoho.com',
      'mail.zoho.com',
    ])

    return allowedHosts.has(host) ? 'allow' : 'external'
  } catch {
    return 'deny'
  }
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState({
      phase: 'checking',
      version: latestUpdateState.version,
      releaseName: latestUpdateState.releaseName,
      progress: null,
      error: null,
    })
  })

  autoUpdater.on('update-available', (info) => {
    const version = getUpdateVersion(info)
    sendUpdateState({
      phase: 'available',
      version,
      releaseName: info?.releaseName || version,
      progress: null,
      error: null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    resetUpdateState()
  })

  autoUpdater.on('download-progress', (progressInfo) => {
    sendUpdateState({
      phase: 'downloading',
      version: latestUpdateState.version,
      releaseName: latestUpdateState.releaseName,
      progress: Math.round(progressInfo.percent),
      error: null,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    const version = getUpdateVersion(info)
    sendUpdateState({
      phase: 'downloaded',
      version,
      releaseName: info?.releaseName || version,
      progress: 100,
      error: null,
    })
  })

  autoUpdater.on('error', (error) => {
    console.error('[Electron Updater] update check failed:', error)
    sendUpdateState({
      phase: 'error',
      version: latestUpdateState.version,
      releaseName: latestUpdateState.releaseName,
      progress: null,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  checkForUpdates = async () => {
    if (!app.isPackaged) {
      return null
    }

    if (isUpdateCheckBusy()) {
      return null
    }

    try {
      return await autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('[Electron Updater] checkForUpdates threw:', error)
      return null
    }
  }

  ipcMain.handle('desktop-update:get-state', () => latestUpdateState)
  ipcMain.handle('desktop-update:check-now', async () => {
    if (!app.isPackaged) {
      return {
        ok: false,
        reason: 'not_packaged',
        state: latestUpdateState,
      }
    }

    if (isUpdateCheckBusy()) {
      return {
        ok: true,
        skipped: true,
        state: latestUpdateState,
      }
    }

    const result = await checkForUpdates()

    if (latestUpdateState.phase === 'error') {
      return {
        ok: false,
        reason: latestUpdateState.error || 'update_check_failed',
        state: latestUpdateState,
      }
    }

    return {
      ok: true,
      updateAvailable: Boolean(result?.isUpdateAvailable),
      state: latestUpdateState,
    }
  })
  ipcMain.handle('desktop-update:install', async () => {
    return installDownloadedUpdate()
  })

  ipcMain.handle('desktop-notification:show', async (_event, payload) => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'not_packaged' }
    }

    return showDesktopNotification(payload)
  })
}

function startUpdateChecks() {
  void checkForUpdates()

  if (updateCheckTimer) {
    clearInterval(updateCheckTimer)
  }

  updateCheckTimer = setInterval(() => {
    void checkForUpdates()
  }, UPDATE_CHECK_INTERVAL_MS)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 800,
    title: 'Nodal Point CRM',
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const action = resolveWindowOpenAction(url)

    if (action === 'external') {
      shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action }
  })

  mainWindow.webContents.on('context-menu', (event, params) => {
    const webContents = mainWindow?.webContents
    if (!webContents) {
      return
    }

    const menu = buildTextContextMenu(params, webContents)

    if (!menu) {
      return
    }

    const popupWindow = BrowserWindow.fromWebContents(webContents) || mainWindow
    menu.popup({
      window: popupWindow,
      frame: params.frame,
    })
  })

  mainWindow.loadURL(getStartUrl())

  if (app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', startUpdateChecks)
  }

  mainWindow.on('close', (event) => {
    if (app.isPackaged && tray && !isQuitting) {
      tray.destroy()
      tray = null
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    app.setAppUserModelId('io.nodalpoint.crm')

    if (process.platform === 'win32' || process.platform === 'linux') {
      session.defaultSession.setSpellCheckerLanguages(['en-US'])
    }

    setupAutoUpdates()
    createWindow()
    createTray()

    globalShortcut.unregisterAll()
    if (app.isPackaged) {
      const didRegister = globalShortcut.register('CommandOrControl+Shift+K', () => {
        sendUiEvent({ type: 'open-command-bar' })
      })

      if (!didRegister) {
        console.warn('[Electron] Failed to register CommandOrControl+Shift+K')
      }
    }

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = new Set([
        'media',
        'notifications',
        'clipboard-read',
        'clipboard-sanitized-write',
      ])
      callback(allowedPermissions.has(permission))
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        createTray()
        return
      }

      focusMainWindow()
    })
  })

  app.on('second-instance', () => {
    if (!mainWindow) {
      createWindow()
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })
}

app.on('window-all-closed', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer)
    updateCheckTimer = null
  }

  if (tray && process.platform !== 'darwin' && isQuitting) {
    tray.destroy()
    tray = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
})
