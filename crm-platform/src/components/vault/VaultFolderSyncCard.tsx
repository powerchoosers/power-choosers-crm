'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, RefreshCw, UploadCloud, Download, Clock3, Link2, Link2Off, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { useDesktopFolderSync } from '@/hooks/useDesktopFolderSync'
import { cn } from '@/lib/utils'

interface VaultFolderSyncCardProps {
  defaultAccountId?: string | null
  defaultAccountName?: string | null
}

function formatShortTime(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString()
}

export function VaultFolderSyncCard({ defaultAccountId = null, defaultAccountName = null }: VaultFolderSyncCardProps) {
  const sync = useDesktopFolderSync()
  const [setupOpen, setSetupOpen] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [accountQuery, setAccountQuery] = useState(defaultAccountName || '')
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(
    defaultAccountId && defaultAccountName ? { id: defaultAccountId, name: defaultAccountName } : null
  )
  const [keepRunningInTray, setKeepRunningInTray] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const didInitSetupRef = useRef(false)

  const { data: searchAccounts = [], isFetching: searchingAccounts } = useSearchAccounts(accountQuery)

  const isDesktopReady = Boolean(sync.isDesktop)
  const isConnected = Boolean(sync.state?.enabled && sync.state.folderPath && sync.state.accountId)

  useEffect(() => {
    if (!setupOpen) {
      didInitSetupRef.current = false
      return
    }

    if (didInitSetupRef.current) {
      return
    }

    didInitSetupRef.current = true
    setFolderPath(sync.state?.folderPath || '')
    setKeepRunningInTray(Boolean(sync.state?.keepRunningInTray))

    if (sync.state?.accountId) {
      setSelectedAccount({
        id: sync.state.accountId,
        name: sync.state.accountName || sync.state.accountId,
      })
      if (sync.state.accountName) {
        setAccountQuery(sync.state.accountName)
      }
    } else if (defaultAccountId) {
      setSelectedAccount({ id: defaultAccountId, name: defaultAccountName || defaultAccountId })
      if (defaultAccountName) {
        setAccountQuery(defaultAccountName)
      }
    }
  }, [setupOpen, sync.state?.accountId, sync.state?.accountName, sync.state?.folderPath, sync.state?.keepRunningInTray, defaultAccountId, defaultAccountName])

  const statusBadge = useMemo(() => {
    if (!isDesktopReady) {
      return { label: 'Desktop only', className: 'border-white/10 text-zinc-500 bg-white/[0.03]' }
    }

    if (sync.state?.lastError) {
      return { label: 'Sync error', className: 'border-red-500/20 text-red-300 bg-red-500/5' }
    }

    if (isConnected) {
      return {
        label: sync.state?.keepRunningInTray ? 'Live in tray' : 'Connected',
        className: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5',
      }
    }

    if (sync.state?.folderPath || sync.state?.accountId) {
      return { label: 'Paused', className: 'border-amber-500/20 text-amber-300 bg-amber-500/5' }
    }

    return { label: 'Not linked', className: 'border-white/10 text-zinc-500 bg-white/[0.03]' }
  }, [isConnected, isDesktopReady, sync.state?.accountId, sync.state?.folderPath, sync.state?.keepRunningInTray, sync.state?.lastError])

  const handleChooseFolder = async () => {
    try {
      const nextPath = await sync.chooseFolder()
      if (nextPath) {
        setFolderPath(nextPath)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to choose a folder')
    }
  }

  const handleConnect = async () => {
    if (!folderPath.trim()) {
      toast.error('Choose a folder first')
      return
    }

    if (!selectedAccount?.id) {
      toast.error('Choose an account first')
      return
    }

    setIsWorking(true)
    const toastId = toast.loading('Linking folder to vault...')

    try {
      const result = await sync.connect({
        folderPath,
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        keepRunningInTray,
      })

      if (!result?.ok) {
        throw new Error(result?.reason || 'Failed to connect folder')
      }

      toast.success('Folder linked to the vault', { id: toastId })
      setSetupOpen(false)
      await sync.scanNow().catch(() => null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect folder', { id: toastId })
    } finally {
      setIsWorking(false)
    }
  }

  const handlePause = async () => {
    setIsWorking(true)
    const toastId = toast.loading('Pausing folder sync...')

    try {
      const result = await sync.disconnect()
      if (!result?.ok) {
        throw new Error(result?.reason || 'Failed to pause sync')
      }

      toast.success('Folder sync paused', { id: toastId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pause folder sync', { id: toastId })
    } finally {
      setIsWorking(false)
    }
  }

  const handleSyncNow = async () => {
    setIsWorking(true)
    const toastId = toast.loading('Scanning folder and vault...')

    try {
      const result = await sync.scanNow()
      if (!result?.ok) {
        throw new Error(result?.reason || 'Folder sync scan failed')
      }

      toast.success('Folder sync scan complete', { id: toastId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Folder sync scan failed', { id: toastId })
    } finally {
      setIsWorking(false)
    }
  }

  const handleOpenFolder = async () => {
    try {
      const result = await sync.openFolder()
      if (!result?.ok) {
        throw new Error(result?.reason || 'Unable to open folder')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open folder')
    }
  }

  const handleTrayToggle = async (nextValue: boolean) => {
    const previousValue = keepRunningInTray
    setKeepRunningInTray(nextValue)

    try {
      const result = await sync.setKeepRunningInTray(nextValue)
      if (!result?.ok) {
        throw new Error(result?.reason || 'Unable to update tray mode')
      }
    } catch (error) {
      setKeepRunningInTray(previousValue)
      toast.error(error instanceof Error ? error.message : 'Unable to update tray mode')
    }
  }

  if (!isDesktopReady) {
    return null
  }

  return (
    <>
      <Card className="nodal-glass border-white/5 overflow-hidden !p-0 !gap-0">
        <CardHeader className="h-11 px-5 border-b border-white/5 bg-white/[0.03] flex items-center justify-between !p-0 !gap-0 !px-5">
          <CardTitle className="text-[10px] font-mono tracking-[0.2em] text-zinc-100 flex items-center gap-2.5 uppercase leading-none">
            <Link2 className="w-3.5 h-3.5 text-zinc-400" /> Folder Mirror
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-zinc-600')} />
            <Badge variant="outline" className={cn('border-white/10 text-[9px] font-mono uppercase', statusBadge.className)}>
              {statusBadge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <CardDescription className="text-xs text-zinc-500 font-mono leading-relaxed">
            Link one folder to one account. New files sync both ways while the desktop app is open.
            Deletions stay manual so the vault does not eat your files by accident.
          </CardDescription>

          {isConnected ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Folder</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-zinc-200">
                    <FolderOpen className="size-4 text-[#8ba6ff]" />
                    <span className="truncate">{sync.state?.folderName || 'Linked folder'}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 font-mono truncate">{sync.state?.folderPath}</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Account</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-zinc-200">
                    <Link2 className="size-4 text-[#8ba6ff]" />
                    <span className="truncate">{sync.state?.accountName || 'Linked account'}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 font-mono truncate">{sync.state?.accountId}</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Last sync</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-zinc-200">
                    <Clock3 className="size-4 text-[#8ba6ff]" />
                    <span>{formatShortTime(sync.state?.lastSyncAt)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 font-mono">
                    {sync.state?.syncedFileCount || 0} file{(sync.state?.syncedFileCount || 0) === 1 ? '' : 's'} tracked
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/10 bg-white/[0.03] text-zinc-300 font-mono text-[10px]"
                    onClick={handleOpenFolder}
                    disabled={isWorking}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-2" /> Open Folder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/10 bg-white/[0.03] text-zinc-300 font-mono text-[10px]"
                    onClick={handleSyncNow}
                    disabled={isWorking}
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5 mr-2', isWorking && 'animate-spin')} /> Sync Now
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-500/30 text-red-400/90 font-mono text-[10px]"
                    onClick={handlePause}
                    disabled={isWorking}
                  >
                    <Link2Off className="w-3.5 h-3.5 mr-2" /> Pause Sync
                  </Button>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Keep running in tray</div>
                    <div className="text-[11px] text-zinc-600 font-mono">Hide the window and keep the mirror live.</div>
                  </div>
                  <Switch checked={keepRunningInTray} onCheckedChange={handleTrayToggle} />
                </div>
              </div>

              {sync.state?.lastError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-200 font-mono">
                  {sync.state.lastError}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-zinc-200">
                  <UploadCloud className="size-4 text-[#8ba6ff]" />
                  Connect a local folder
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">
                  {sync.state?.folderPath && sync.state?.accountId
                    ? 'Your folder link is paused. Open the setup to resume it.'
                    : 'Pick the folder you want to mirror into the vault. You can keep it on desktop, a shared drive, or a project folder.'}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-zinc-300 font-mono text-[10px]"
                  onClick={() => setSetupOpen(true)}
                >
                  <Link2 className="w-3.5 h-3.5 mr-2" /> {sync.state?.folderPath && sync.state?.accountId ? 'Resume Sync' : 'Link Folder'}
                </Button>
              </div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-zinc-200">
                  <Download className="size-4 text-[#8ba6ff]" />
                  What it does
                </div>
                <ul className="space-y-2 text-[11px] text-zinc-500 font-mono">
                  <li>• New files in the folder upload into the vault.</li>
                  <li>• Vault files for that account copy back into the folder.</li>
                  <li>• Deletes stay manual so you do not lose evidence by accident.</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-[860px] border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-[0.18em] text-sm">Link Folder Mirror</DialogTitle>
            <DialogDescription className="text-zinc-500 font-mono text-xs uppercase tracking-[0.12em]">
              Pick a folder and the account it should mirror. Adds and updates sync in both directions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Folder</div>
              <div className="flex gap-2">
                <Input
                  value={folderPath}
                  readOnly
                  placeholder="Choose a folder..."
                  className="font-mono text-xs bg-black/30 border-white/10 text-zinc-200"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleChooseFolder}
                  disabled={isWorking}
                  className="border-white/10 bg-white/[0.03] text-zinc-300 font-mono text-[10px]"
                >
                  Browse
                </Button>
              </div>
              <div className="text-[11px] text-zinc-600 font-mono">
                Tip: choose a folder you actually want to keep synced. The app will watch it while the desktop app is open.
              </div>

              <Separator className="bg-white/5" />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Keep running in tray</div>
                  <div className="text-[11px] text-zinc-600 font-mono">Required if you want sync to keep working after you close the window.</div>
                </div>
                <Switch checked={keepRunningInTray} onCheckedChange={setKeepRunningInTray} />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">Account</div>
              <div className="flex items-center gap-2 rounded-2xl border border-[#002FA7]/20 bg-[#002FA7]/8 px-4 py-3">
                <Search className="size-4 text-[#8ba6ff]" />
                <Input
                  value={accountQuery}
                  onChange={(event) => {
                    setAccountQuery(event.target.value)
                    setSelectedAccount(null)
                  }}
                  placeholder="Search account..."
                  className="border-0 bg-transparent px-0 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0"
                />
              </div>

              {selectedAccount ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300 font-mono">Selected account</div>
                  <div className="mt-1 text-sm text-zinc-100">{selectedAccount.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">{selectedAccount.id}</div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-[11px] text-zinc-600 font-mono">
                  Pick the account that should own the folder mirror.
                </div>
              )}

              <div className="max-h-56 overflow-auto rounded-2xl border border-white/5 bg-black/20 p-2">
                {searchingAccounts ? (
                  <div className="flex items-center justify-center py-6 text-zinc-600">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                ) : searchAccounts.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-zinc-600 font-mono">
                    Type at least two letters to search accounts.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchAccounts.map((account) => {
                      const active = selectedAccount?.id === account.id

                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setSelectedAccount({ id: account.id, name: account.name })}
                          className={cn(
                            'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                            active ? 'border-[#002FA7]/40 bg-[#002FA7]/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                          )}
                        >
                          <div className="text-sm text-zinc-100">{account.name}</div>
                          <div className="text-[11px] text-zinc-500 font-mono">{account.domain || account.industry || account.id}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-zinc-300 font-mono text-[10px]"
              onClick={() => setSetupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConnect}
              disabled={isWorking || !folderPath.trim() || !selectedAccount?.id}
              className="bg-[#002FA7] text-white hover:bg-[#0036c6] font-mono text-[10px]"
            >
              {isWorking ? 'LINKING...' : 'LINK FOLDER'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
