const path = require('path')
const { app, BrowserWindow, Menu, clipboard, ipcMain, shell, session } = require('electron')
const { autoUpdater } = require('electron-updater')

const DEV_URL = 'http://localhost:3000/network'
const PROD_URL = 'https://www.nodalpoint.io/network'
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let mainWindow = null
let updateCheckTimer = null
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
    if (latestUpdateState.phase !== 'downloaded') {
      return { ok: false, reason: 'no_update_ready' }
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall()
    })

    return { ok: true }
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

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = new Set([
        'media',
        'notifications',
        'clipboard-read',
        'clipboard-sanitized-write',
      ])
      callback(allowedPermissions.has(permission))
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
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

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
