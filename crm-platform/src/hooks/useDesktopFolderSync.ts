'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DesktopFolderSyncAcknowledgeInput,
  DesktopFolderSyncConnectInput,
  DesktopFolderSyncEvent,
  DesktopFolderSyncReadResult,
  DesktopFolderSyncState,
  DesktopFolderSyncWriteResult,
  NodalDesktopBridge,
} from '@/types/desktop'

function getDesktopBridge() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.nodalDesktop ?? null
}

type FolderSyncBridge = NodalDesktopBridge & {
  getFolderSyncState: () => Promise<DesktopFolderSyncState>
  onFolderSyncEvent: (listener: (event: DesktopFolderSyncEvent) => void) => () => void
}

function hasFolderSyncBridge(bridge: ReturnType<typeof getDesktopBridge>): bridge is FolderSyncBridge {
  return Boolean(
    bridge !== null &&
      bridge.isDesktop &&
      typeof bridge.getFolderSyncState === 'function' &&
      typeof bridge.onFolderSyncEvent === 'function'
  )
}

export function useDesktopFolderSync() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [state, setState] = useState<DesktopFolderSyncState | null>(null)

  useEffect(() => {
    const bridge = getDesktopBridge()

    if (!hasFolderSyncBridge(bridge)) {
      setIsDesktop(false)
      setState(null)
      return
    }

    let mounted = true
    setIsDesktop(true)

    const syncState = async () => {
      try {
        const nextState = await bridge.getFolderSyncState()
        if (mounted) {
          setState(nextState)
        }
      } catch {
        // Keep the UI usable if the bridge is not ready yet.
      }
    }

    void syncState()

    const unsubscribe = bridge.onFolderSyncEvent((event: DesktopFolderSyncEvent) => {
      if (!mounted) {
        return
      }

      if (event?.state) {
        setState(event.state)
      }
    })

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  const refreshState = useCallback(async () => {
    const bridge = getDesktopBridge()
    if (!bridge?.getFolderSyncState) {
      return null
    }

    try {
      const nextState = await bridge.getFolderSyncState()
      setState(nextState)
      return nextState
    } catch {
      return null
    }
  }, [])

  const chooseFolder = useCallback(async () => {
    const bridge = getDesktopBridge()
    if (!bridge?.chooseFolderForSync) {
      return null
    }

    try {
      return await bridge.chooseFolderForSync()
    } catch {
      return null
    }
  }, [])

  const connect = useCallback(async (input: DesktopFolderSyncConnectInput) => {
    const bridge = getDesktopBridge()
    if (!bridge?.connectFolderSync) {
      throw new Error('Folder sync bridge unavailable')
    }

    const result = await bridge.connectFolderSync(input)
    if (result?.state) {
      setState(result.state)
    }
    return result
  }, [])

  const disconnect = useCallback(async () => {
    const bridge = getDesktopBridge()
    if (!bridge?.disconnectFolderSync) {
      throw new Error('Folder sync bridge unavailable')
    }

    const result = await bridge.disconnectFolderSync()
    if (result?.state) {
      setState(result.state)
    }
    return result
  }, [])

  const scanNow = useCallback(async () => {
    const bridge = getDesktopBridge()
    if (!bridge?.scanFolderSyncNow) {
      throw new Error('Folder sync bridge unavailable')
    }

    const result = await bridge.scanFolderSyncNow()
    if (result?.state) {
      setState(result.state)
    }
    return result
  }, [])

  const setKeepRunningInTray = useCallback(async (keepRunningInTray: boolean) => {
    const bridge = getDesktopBridge()
    if (!bridge?.setFolderSyncKeepRunningInTray) {
      throw new Error('Folder sync bridge unavailable')
    }

    const result = await bridge.setFolderSyncKeepRunningInTray(keepRunningInTray)
    if (result?.state) {
      setState(result.state)
    }
    return result
  }, [])

  const openFolder = useCallback(async () => {
    const bridge = getDesktopBridge()
    if (!bridge?.openFolderSyncLocation) {
      throw new Error('Folder sync bridge unavailable')
    }

    return bridge.openFolderSyncLocation()
  }, [])

  const readFile = useCallback(async (absolutePath: string): Promise<DesktopFolderSyncReadResult> => {
    const bridge = getDesktopBridge()
    if (!bridge?.readFolderSyncFile) {
      throw new Error('Folder sync bridge unavailable')
    }

    return bridge.readFolderSyncFile(absolutePath)
  }, [])

  const writeFile = useCallback(async (payload: {
    relativePath: string
    fileName: string
    base64: string
    mimeType?: string | null
  }): Promise<DesktopFolderSyncWriteResult> => {
    const bridge = getDesktopBridge()
    if (!bridge?.writeFolderSyncFile) {
      throw new Error('Folder sync bridge unavailable')
    }

    return bridge.writeFolderSyncFile(payload)
  }, [])

  const deleteFile = useCallback(async (relativePath: string) => {
    const bridge = getDesktopBridge()
    if (!bridge?.deleteFolderSyncFile) {
      throw new Error('Folder sync bridge unavailable')
    }

    return bridge.deleteFolderSyncFile(relativePath)
  }, [])

  const acknowledgeFile = useCallback(async (payload: DesktopFolderSyncAcknowledgeInput) => {
    const bridge = getDesktopBridge()
    if (!bridge?.acknowledgeFolderSyncFile) {
      throw new Error('Folder sync bridge unavailable')
    }

    const result = await bridge.acknowledgeFolderSyncFile(payload)
    if (result) {
      setState(result)
    }
    return result
  }, [])

  return useMemo(() => ({
    isDesktop,
    state,
    refreshState,
    chooseFolder,
    connect,
    disconnect,
    scanNow,
    setKeepRunningInTray,
    openFolder,
    readFile,
    writeFile,
    deleteFile,
    acknowledgeFile,
  }), [
    isDesktop,
    state,
    refreshState,
    chooseFolder,
    connect,
    disconnect,
    scanNow,
    setKeepRunningInTray,
    openFolder,
    readFile,
    writeFile,
    deleteFile,
    acknowledgeFile,
  ])
}
