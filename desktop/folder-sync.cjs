const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { dialog, shell } = require('electron')

const STATE_FILE_NAME = 'folder-sync-state.json'
const EVENT_CHANNEL = 'desktop-folder-sync:event'
const WATCH_DEBOUNCE_MS = 600
const PERIODIC_SCAN_MS = 45 * 1000
const SUPPRESSED_WRITE_TTL_MS = 5000

function createDefaultState() {
  return {
    enabled: false,
    watching: false,
    keepRunningInTray: false,
    folderPath: null,
    syncId: null,
    mode: 'vault-root',
    lastScanAt: null,
    lastSyncAt: null,
    lastError: null,
    syncedFiles: {},
    syncedDocumentIds: [],
  }
}

function sanitizeRelativePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 96) || 'file'
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizeRelativePathSegment(segment))
    .filter(Boolean)
    .join('/')
}

function buildVaultAccountFolderLabel(_accountId, accountName) {
  return sanitizeRelativePathSegment(String(accountName || '').trim() || 'Account').slice(0, 64)
}

function normalizeVaultDocumentType(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (!normalized) {
    return null
  }

  if (normalized === 'SIGNED_CONTRACT' || normalized === 'CONTRACT' || normalized === 'CONTRACTS') {
    return 'CONTRACT'
  }

  if (normalized === 'BILL' || normalized === 'INVOICE' || normalized === 'INVOICES') {
    return 'INVOICE'
  }

  if (normalized === 'LOE' || normalized === 'LOES') {
    return 'LOE'
  }

  if (normalized === 'USAGE' || normalized === 'USAGE_DATA' || normalized === 'TELEMETRY') {
    return 'USAGE_DATA'
  }

  if (normalized === 'PROPOSAL' || normalized === 'PROPOSALS') {
    return 'PROPOSAL'
  }

  return null
}

function buildVaultDocumentTypeFolderLabel(documentType) {
  switch (normalizeVaultDocumentType(documentType)) {
    case 'CONTRACT':
      return 'Contracts'
    case 'LOE':
      return 'LOEs'
    case 'INVOICE':
      return 'Invoices'
    case 'USAGE_DATA':
      return 'Telemetry'
    case 'PROPOSAL':
      return 'Proposals'
    default:
      return 'Unsorted'
  }
}

function parseVaultDocumentTypeFolderLabel(folderName) {
  const normalized = String(folderName || '').trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized === 'contracts' || normalized === 'contract') {
    return { documentType: 'CONTRACT', folderLabel: 'Contracts' }
  }

  if (normalized === 'loes' || normalized === 'loe') {
    return { documentType: 'LOE', folderLabel: 'LOEs' }
  }

  if (normalized === 'invoices' || normalized === 'invoice' || normalized === 'bills' || normalized === 'bill') {
    return { documentType: 'INVOICE', folderLabel: 'Invoices' }
  }

  if (normalized === 'telemetry' || normalized === 'usage data' || normalized === 'usage_data' || normalized === 'usage') {
    return { documentType: 'USAGE_DATA', folderLabel: 'Telemetry' }
  }

  if (normalized === 'proposals' || normalized === 'proposal') {
    return { documentType: 'PROPOSAL', folderLabel: 'Proposals' }
  }

  if (normalized === 'unsorted' || normalized === 'other') {
    return { documentType: null, folderLabel: 'Unsorted' }
  }

  return null
}

function parseVaultAccountFolderLabel(folderName) {
  const normalized = String(folderName || '').trim()
  if (!normalized) {
    return null
  }

  const legacyMatch = normalized.match(/^(.*)\s\[([^\[\]]+)\]$/)
  if (legacyMatch) {
    const accountName = String(legacyMatch[1] || '').trim()
    const accountId = String(legacyMatch[2] || '').trim()

    if (!accountId) {
      return null
    }

    return {
      accountId,
      accountName: accountName || accountId,
      folderLabel: normalized,
    }
  }

  const suffixMatch = normalized.match(/^(.*)\s\((\d+)\)$/)

  return {
    accountId: null,
    accountName: String(suffixMatch?.[1] || normalized).trim() || normalized,
    folderLabel: normalized,
    duplicateIndex: suffixMatch ? Number.parseInt(suffixMatch[2] || '0', 10) || null : null,
  }
}

function parseVaultRootRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) {
    return null
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  const folder = parseVaultAccountFolderLabel(segments[0])
  if (!folder) {
    return null
  }

  return {
    ...folder,
    relativePath: normalized,
    nestedRelativePath: segments.slice(1).join('/'),
  }
}

function buildCanonicalVaultRootRelativePath(document, accountName, storedRelativePath) {
  const accountFolder = buildVaultAccountFolderLabel(document.account_id || 'unassigned', accountName)
  const documentTypeFolder = buildVaultDocumentTypeFolderLabel(
    document.document_type || document?.metadata?.ai_extraction?.type || document.type
  )
  const normalizedStoredPath = normalizeRelativePath(storedRelativePath || '')
  const segments = normalizedStoredPath ? normalizedStoredPath.split('/').filter(Boolean) : []

  if (segments.length > 0) {
    const parsedAccount = parseVaultAccountFolderLabel(segments[0])
    if (parsedAccount) {
      segments.shift()
    }

    const parsedType = parseVaultDocumentTypeFolderLabel(segments[0] || '')
    if (parsedType) {
      segments.shift()
    }
  }

  const leafPath = normalizeRelativePath(segments.join('/'))
  if (leafPath) {
    return `${accountFolder}/${documentTypeFolder}/${leafPath}`
  }

  const rawFileName = normalizeRelativePath(document.name || 'file') || 'file'
  const dotIndex = rawFileName.lastIndexOf('.')
  const shortId = document.id ? String(document.id).slice(0, 8) : 'file'
  const fallbackName =
    dotIndex > 0
      ? `${rawFileName.slice(0, dotIndex)}-${shortId}${rawFileName.slice(dotIndex)}`
      : `${rawFileName}-${shortId}`

  return `${accountFolder}/${documentTypeFolder}/${fallbackName}`
}

function fingerprintForStat(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`
}

function inferMimeType(fileName) {
  const extension = path.extname(String(fileName || '')).toLowerCase()

  switch (extension) {
    case '.pdf':
      return 'application/pdf'
    case '.csv':
      return 'text/csv'
    case '.txt':
      return 'text/plain'
    case '.json':
      return 'application/json'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

function isIgnoredFileName(fileName) {
  const normalized = String(fileName || '').trim().toLowerCase()
  if (!normalized) return true

  if (normalized === '.ds_store' || normalized === 'thumbs.db' || normalized === 'desktop.ini') {
    return true
  }

  if (normalized.startsWith('~$') || normalized.startsWith('.~')) {
    return true
  }

  if (normalized.endsWith('.tmp') || normalized.endsWith('.part') || normalized.endsWith('.crdownload')) {
    return true
  }

  return false
}

function buildSyncId(folderPath) {
  return crypto
    .createHash('sha1')
    .update(`${String(folderPath || '').toLowerCase()}`)
    .digest('hex')
    .slice(0, 16)
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveUniqueRelativePath(rootFolder, preferredRelativePath) {
  const normalized = normalizeRelativePath(preferredRelativePath)
  const parsed = path.posix.parse(normalized || 'file')
  const parsedName = parsed.name || 'file'
  const parsedExt = parsed.ext || ''
  const parsedDir = parsed.dir || ''

  let candidate = normalized || `${parsedName}${parsedExt}`
  let suffix = 2

  while (await fileExists(path.join(rootFolder, candidate))) {
    const nextName = `${parsedName} (${suffix})${parsedExt}`
    candidate = parsedDir ? path.posix.join(parsedDir, nextName) : nextName
    suffix += 1
  }

  return candidate
}

async function walkFolder(rootFolder, currentFolder = rootFolder, results = []) {
  const entries = await fs.promises.readdir(currentFolder, { withFileTypes: true })

  for (const entry of entries) {
    if (isIgnoredFileName(entry.name)) {
      continue
    }

    const absolutePath = path.join(currentFolder, entry.name)

    if (entry.isDirectory()) {
      await walkFolder(rootFolder, absolutePath, results)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const stat = await fs.promises.stat(absolutePath)
    const relativePath = normalizeRelativePath(path.relative(rootFolder, absolutePath))

    results.push({
      absolutePath,
      relativePath,
      fileName: entry.name,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      fingerprint: fingerprintForStat(stat),
    })
  }

  return results
}

function cloneState(state) {
  return {
    enabled: Boolean(state.enabled),
    watching: Boolean(state.watching),
    keepRunningInTray: Boolean(state.keepRunningInTray),
    folderPath: state.folderPath || null,
    folderName: state.folderPath ? path.basename(state.folderPath) : null,
    syncId: state.syncId || null,
    mode: 'vault-root',
    lastScanAt: state.lastScanAt || null,
    lastSyncAt: state.lastSyncAt || null,
    lastError: state.lastError || null,
    syncedFileCount: Object.keys(state.syncedFiles || {}).length,
    syncedDocumentIds: Array.isArray(state.syncedDocumentIds) ? [...state.syncedDocumentIds] : [],
    syncedFiles: { ...(state.syncedFiles || {}) },
  }
}

function createFolderSyncManager({ app, ipcMain, getMainWindow }) {
  const stateFilePath = path.join(app.getPath('userData'), STATE_FILE_NAME)
  let state = createDefaultState()
  let watcher = null
  let periodicTimer = null
  let scanTimer = null
  let scanInFlight = null
  const suppressedPaths = new Map()

  function persistState() {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true })
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8')
  }

  function loadState() {
    try {
      if (!fs.existsSync(stateFilePath)) {
        state = createDefaultState()
        return
      }

      const raw = fs.readFileSync(stateFilePath, 'utf8')
      const parsed = JSON.parse(raw)
      state = {
        ...createDefaultState(),
        ...parsed,
        syncedFiles: parsed?.syncedFiles && typeof parsed.syncedFiles === 'object' ? parsed.syncedFiles : {},
        syncedDocumentIds: Array.isArray(parsed?.syncedDocumentIds) ? parsed.syncedDocumentIds : [],
      }
    } catch (error) {
      console.error('[Folder Sync] Failed to load state:', error)
      state = createDefaultState()
    }
  }

  function sendEvent(payload) {
    const windowRef = typeof getMainWindow === 'function' ? getMainWindow() : null

    if (!windowRef || windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) {
      return
    }

    windowRef.webContents.send(EVENT_CHANNEL, payload)
  }

  function updateSuppressedPaths() {
    const now = Date.now()
    for (const [relativePath, until] of suppressedPaths.entries()) {
      if (until <= now) {
        suppressedPaths.delete(relativePath)
      }
    }
  }

  function shouldSuppressPath(relativePath) {
    updateSuppressedPaths()
    return suppressedPaths.has(normalizeRelativePath(relativePath))
  }

  function markPathSuppressed(relativePath, ttlMs = SUPPRESSED_WRITE_TTL_MS) {
    const normalized = normalizeRelativePath(relativePath)
    suppressedPaths.set(normalized, Date.now() + ttlMs)
  }

  function emitState(reason = null) {
    sendEvent({
      type: 'state-changed',
      reason,
      state: cloneState(state),
    })
  }

  function clearWatchers() {
    if (watcher) {
      try {
        watcher.close()
      } catch (error) {
        console.error('[Folder Sync] Failed to close watcher:', error)
      }
      watcher = null
    }

    if (periodicTimer) {
      clearInterval(periodicTimer)
      periodicTimer = null
    }

    if (scanTimer) {
      clearTimeout(scanTimer)
      scanTimer = null
    }
  }

  function startWatchers() {
    clearWatchers()

    if (!state.enabled || !state.folderPath) {
      state.watching = false
      persistState()
      emitState('stopped')
      return
    }

    const recursive = process.platform === 'win32' || process.platform === 'darwin'

    try {
      watcher = fs.watch(state.folderPath, { recursive, persistent: true }, () => {
        scheduleScan('watch-event')
      })
      watcher.on('error', (error) => {
        console.error('[Folder Sync] Watcher error:', error)
        state.lastError = error instanceof Error ? error.message : String(error)
        persistState()
        emitState('watch-error')
      })
      state.watching = true
      periodicTimer = setInterval(() => {
        void runScan('interval')
      }, PERIODIC_SCAN_MS)
      persistState()
      emitState('watching')
    } catch (error) {
      console.error('[Folder Sync] Failed to start watcher:', error)
      state.watching = false
      state.lastError = error instanceof Error ? error.message : String(error)
      persistState()
      emitState('watch-error')
    }
  }

  function scheduleScan(reason = 'manual') {
    if (!state.enabled || !state.folderPath) {
      return
    }

    if (scanTimer) {
      clearTimeout(scanTimer)
    }

    scanTimer = setTimeout(() => {
      void runScan(reason)
    }, WATCH_DEBOUNCE_MS)
  }

  async function runScan(reason = 'manual') {
    if (!state.enabled || !state.folderPath) {
      return cloneState(state)
    }

    if (scanInFlight) {
      return scanInFlight
    }

    scanInFlight = (async () => {
      try {
        const files = await walkFolder(state.folderPath)
        const detected = []

        for (const file of files) {
          if (shouldSuppressPath(file.relativePath)) {
            continue
          }

          const parsed = parseVaultRootRelativePath(file.relativePath)
          if (!parsed) {
            continue
          }

          const current = state.syncedFiles[file.relativePath]
          if (!current || current.fingerprint !== file.fingerprint) {
            detected.push({
              ...file,
              accountId: parsed.accountId,
              accountName: parsed.accountName,
              accountFolder: parsed.folderLabel,
            })
          }
        }

        state.lastScanAt = new Date().toISOString()
        state.lastError = null
        persistState()

        if (detected.length > 0) {
          sendEvent({
            type: 'local-files-detected',
            reason,
            files: detected,
            state: cloneState(state),
          })
        }

        sendEvent({
          type: 'scan-complete',
          reason,
          detectedCount: detected.length,
          state: cloneState(state),
        })

        return cloneState(state)
      } catch (error) {
        console.error('[Folder Sync] Scan failed:', error)
        state.lastError = error instanceof Error ? error.message : String(error)
        persistState()
        emitState('scan-error')
        sendEvent({
          type: 'error',
          reason,
          message: state.lastError || 'Folder scan failed',
          state: cloneState(state),
        })
        return cloneState(state)
      } finally {
        scanInFlight = null
      }
    })()

    return scanInFlight
  }

  async function chooseFolder() {
    const windowRef = typeof getMainWindow === 'function' ? getMainWindow() : null
    const result = await dialog.showOpenDialog(windowRef || undefined, {
      title: 'Choose a root vault folder',
      buttonLabel: 'Choose Folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return path.resolve(result.filePaths[0])
  }

  async function connectFolderSync({ folderPath, keepRunningInTray = false }) {
    const folderPathInput = String(folderPath || '').trim()
    if (!folderPathInput) {
      throw new Error('Choose a folder first')
    }

    const resolvedFolderPath = path.resolve(folderPathInput)

    const stat = await fs.promises.stat(resolvedFolderPath)
    if (!stat.isDirectory()) {
      throw new Error('Selected path is not a folder')
    }

    const nextSyncId = buildSyncId(resolvedFolderPath)
    const previousSyncId = state.syncId

    if (previousSyncId !== nextSyncId) {
      state.syncedFiles = {}
      state.syncedDocumentIds = []
      state.lastScanAt = null
      state.lastSyncAt = null
    }

    state = {
      ...state,
      enabled: true,
      watching: true,
      mode: 'vault-root',
      folderPath: resolvedFolderPath,
      syncId: nextSyncId,
      keepRunningInTray: Boolean(keepRunningInTray),
      lastError: null,
    }

    persistState()
    startWatchers()
    emitState('connected')
    void runScan('connect')

    return cloneState(state)
  }

  async function disconnectFolderSync() {
    state = {
      ...state,
      enabled: false,
      watching: false,
      lastError: null,
    }

    clearWatchers()
    persistState()
    emitState('disconnected')
    return cloneState(state)
  }

  async function setKeepRunningInTray(keepRunningInTray) {
    state = {
      ...state,
      keepRunningInTray: Boolean(keepRunningInTray),
    }

    persistState()
    emitState('tray-mode-updated')
    return cloneState(state)
  }

  async function openFolderSyncLocation() {
    if (!state.folderPath) {
      return { ok: false, reason: 'no_folder' }
    }

    const result = await shell.openPath(state.folderPath)
    if (result) {
      return { ok: false, reason: result }
    }

    return { ok: true }
  }

  async function readFolderSyncFile(absolutePath) {
    const resolvedPath = path.resolve(String(absolutePath || ''))
    const folderPath = state.folderPath ? path.resolve(state.folderPath) : null

    if (!folderPath) {
      throw new Error('No folder linked')
    }

    const relativePath = path.relative(folderPath, resolvedPath)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('File is outside the linked folder')
    }

    const stat = await fs.promises.stat(resolvedPath)
    const buffer = await fs.promises.readFile(resolvedPath)

    return {
      absolutePath: resolvedPath,
      relativePath: normalizeRelativePath(relativePath),
      fileName: path.basename(resolvedPath),
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      fingerprint: fingerprintForStat(stat),
      mimeType: inferMimeType(path.basename(resolvedPath)),
      base64: buffer.toString('base64'),
    }
  }

  async function writeFolderSyncFile({ relativePath, fileName, mimeType, base64 }) {
    const folderPath = state.folderPath ? path.resolve(state.folderPath) : null

    if (!folderPath) {
      throw new Error('No folder linked')
    }

    const preferredRelativePath = normalizeRelativePath(relativePath || fileName)
    if (!preferredRelativePath) {
      throw new Error('Missing file path')
    }

    const finalRelativePath = preferredRelativePath
    const finalAbsolutePath = path.join(folderPath, finalRelativePath)
    const directoryName = path.dirname(finalAbsolutePath)
    await fs.promises.mkdir(directoryName, { recursive: true })
    await fs.promises.writeFile(finalAbsolutePath, Buffer.from(String(base64 || ''), 'base64'))

    const stat = await fs.promises.stat(finalAbsolutePath)
    markPathSuppressed(finalRelativePath)

    return {
      absolutePath: finalAbsolutePath,
      relativePath: finalRelativePath,
      fileName: path.basename(finalAbsolutePath),
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      fingerprint: fingerprintForStat(stat),
      mimeType: mimeType || inferMimeType(finalAbsolutePath),
    }
  }

  async function acknowledgeFolderSyncFile({
    relativePath,
    size,
    mtimeMs,
    documentId,
    storagePath,
    direction,
    accountId,
    accountName,
    accountFolder,
    previousRelativePath,
    documentUpdatedAt,
  }) {
    const normalizedRelativePath = normalizeRelativePath(relativePath)
    if (!normalizedRelativePath) {
      throw new Error('Missing relative path')
    }

    const fingerprint = `${Number(size || 0)}:${Math.round(Number(mtimeMs || Date.now()))}`

    const normalizedPreviousRelativePath = normalizeRelativePath(previousRelativePath || '')

    state.syncedFiles = {
      ...Object.fromEntries(
        Object.entries(state.syncedFiles || {}).filter(([relativePathKey, entry]) => {
          if (relativePathKey === normalizedRelativePath) {
            return true
          }

          if (normalizedPreviousRelativePath && relativePathKey === normalizedPreviousRelativePath) {
            return false
          }

          if (documentId && entry?.documentId === documentId) {
            return false
          }

          return true
        })
      ),
      [normalizedRelativePath]: {
        fingerprint,
        size: Number(size || 0),
        mtimeMs: Math.round(Number(mtimeMs || Date.now())),
        documentId: documentId || null,
        storagePath: storagePath || null,
        direction: direction || 'local-to-vault',
        accountId: accountId || null,
        accountName: accountName || null,
        accountFolder: accountFolder || null,
        documentUpdatedAt: documentUpdatedAt || null,
        syncedAt: new Date().toISOString(),
      },
    }

    const nextDocIds = new Set(Array.isArray(state.syncedDocumentIds) ? state.syncedDocumentIds : [])
    if (documentId) {
      nextDocIds.add(String(documentId))
    }
    state.syncedDocumentIds = Array.from(nextDocIds)
    state.lastSyncAt = new Date().toISOString()
    state.lastError = null
    persistState()
    emitState('file-acknowledged')
    return cloneState(state)
  }

  async function deleteFolderSyncFile(relativePath) {
    const folderPath = state.folderPath ? path.resolve(state.folderPath) : null

    if (!folderPath) {
      throw new Error('No folder linked')
    }

    const normalizedRelativePath = normalizeRelativePath(relativePath)
    if (!normalizedRelativePath) {
      throw new Error('Missing file path')
    }

    const absolutePath = path.join(folderPath, normalizedRelativePath)

    try {
      await fs.promises.unlink(absolutePath)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error
      }
    }

    let currentDir = path.dirname(absolutePath)
    const rootDir = path.resolve(folderPath)
    while (currentDir.startsWith(rootDir) && currentDir !== rootDir) {
      try {
        await fs.promises.rmdir(currentDir)
      } catch {
        break
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        break
      }
      currentDir = parentDir
    }

    if (state.syncedFiles && state.syncedFiles[normalizedRelativePath]) {
      const nextSyncedFiles = { ...state.syncedFiles }
      delete nextSyncedFiles[normalizedRelativePath]
      state.syncedFiles = nextSyncedFiles
      persistState()
      emitState('file-deleted')
    }

    return { ok: true }
  }

  function shouldKeepRunningInTray() {
    return Boolean(state.enabled && state.keepRunningInTray)
  }

  async function dispose() {
    clearWatchers()
    if (scanInFlight) {
      try {
        await scanInFlight
      } catch {
        // ignore shutdown race
      }
    }
  }

  function registerHandlers() {
    ipcMain.handle('desktop-folder-sync:get-state', () => cloneState(state))
    ipcMain.handle('desktop-folder-sync:choose-folder', async () => chooseFolder())
    ipcMain.handle('desktop-folder-sync:connect', async (_event, input) => {
      const nextState = await connectFolderSync(input || {})
      return { ok: true, state: nextState }
    })
    ipcMain.handle('desktop-folder-sync:disconnect', async () => {
      const nextState = await disconnectFolderSync()
      return { ok: true, state: nextState }
    })
    ipcMain.handle('desktop-folder-sync:scan-now', async () => {
      const nextState = await runScan('manual')
      return { ok: true, state: nextState }
    })
    ipcMain.handle('desktop-folder-sync:set-keep-running-in-tray', async (_event, keepRunningInTray) => {
      const nextState = await setKeepRunningInTray(keepRunningInTray)
      return { ok: true, state: nextState }
    })
    ipcMain.handle('desktop-folder-sync:open-folder', async () => {
      return openFolderSyncLocation()
    })
    ipcMain.handle('desktop-folder-sync:read-file', async (_event, absolutePath) => {
      return readFolderSyncFile(absolutePath)
    })
    ipcMain.handle('desktop-folder-sync:write-file', async (_event, payload) => {
      return writeFolderSyncFile(payload || {})
    })
    ipcMain.handle('desktop-folder-sync:delete-file', async (_event, relativePath) => {
      return deleteFolderSyncFile(relativePath)
    })
    ipcMain.handle('desktop-folder-sync:acknowledge-file', async (_event, payload) => {
      return acknowledgeFolderSyncFile(payload || {})
    })
  }

  loadState()

  if (state.enabled && state.folderPath) {
    startWatchers()
    void runScan('startup')
  }

  registerHandlers()

  return {
    getState: () => cloneState(state),
    chooseFolder,
    connectFolderSync,
    disconnectFolderSync,
    scanNow: runScan,
    setKeepRunningInTray,
    openFolderSyncLocation,
    readFolderSyncFile,
    writeFolderSyncFile,
    deleteFolderSyncFile,
    acknowledgeFolderSyncFile,
    shouldKeepRunningInTray,
    dispose,
    EVENT_CHANNEL,
  }
}

module.exports = {
  createFolderSyncManager,
  EVENT_CHANNEL,
}
