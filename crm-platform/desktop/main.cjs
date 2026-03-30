const path = require('path')
const { app, BrowserWindow, Menu, shell, session } = require('electron')

const DEV_URL = 'http://localhost:3000/network'
const PROD_URL = 'https://www.nodalpoint.io/network'

let mainWindow = null

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

  mainWindow.loadURL(getStartUrl())

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
