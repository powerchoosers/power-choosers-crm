'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, RefreshCw, Server, Globe, Wifi } from 'lucide-react'

interface HealthResponse {
  ok: boolean
  serverTime: string
  vercelUrl: string | null
  envFlags: Record<string, boolean>
  firestore: {
    enabled: boolean
    error?: string
    lastCalls: unknown[]
    webhooks: unknown[]
  }
  notes: string[]
  error?: string
}

export default function ConnectivityPage() {
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [proxyData, setProxyData] = useState<HealthResponse | null>(null)
  const [proxyError, setProxyError] = useState<string | null>(null)

  const [directStatus, setDirectStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [directData, setDirectData] = useState<HealthResponse | null>(null)
  const [directError, setDirectError] = useState<string | null>(null)

  const [clientEnv, setClientEnv] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Check client-side environment variables
    setClientEnv({
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'window.GOOGLE_MAPS_API': typeof window !== 'undefined' && 'GOOGLE_MAPS_API' in window
    })

    checkProxy()
  }, [])

  const checkProxy = async () => {
    setProxyStatus('loading')
    setProxyError(null)
    try {
      const res = await fetch('/api/debug/health')
      if (!res.ok) throw new Error(`Status: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setProxyData(data)
      setProxyStatus('success')
    } catch (err) {
      console.error('Proxy check failed:', err)
      setProxyError(err instanceof Error ? err.message : String(err))
      setProxyStatus('error')
    }
  }

  const checkDirect = async () => {
    setDirectStatus('loading')
    setDirectError(null)
    const directUrl = 'https://nodal-point-network.vercel.app/api/debug/health'
    try {
      const res = await fetch(directUrl)
      if (!res.ok) throw new Error(`Status: ${res.status} ${res.statusText}`)
      const data = await res.json()
      setDirectData(data)
      setDirectStatus('success')
    } catch (err) {
      console.error('Direct check failed:', err)
      setDirectError(err instanceof Error ? err.message : String(err))
      setDirectStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              <span className="text-indigo-500 mr-2">●</span>
              System Connectivity Diagnostic
            </h1>
            <p className="text-zinc-500">
              Analyze network path integrity between Frontend (Next.js) and Backend (Network Service).
            </p>
          </div>
          <Button
            onClick={() => { checkProxy(); checkDirect(); }}
            variant="outline"
            className="border-white/10 hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Run Diagnostics
          </Button>
        </div>

        {/* PROXY CHECK (Frontend -> Backend) */}
        <Card className="p-6 bg-zinc-900/50 border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold">Internal Uplink (Next.js Proxy)</h2>
            <StatusBadge status={proxyStatus} />
          </div>

          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Testing route: <code className="bg-zinc-950 px-2 py-1 rounded text-indigo-300">/api/debug/health</code>
            </p>

            {proxyError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <strong>Connection Failed:</strong> {proxyError}
              </div>
            )}

            {proxyData && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                    <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Environment Flags</h3>
                    <div className="space-y-2">
                      {Object.entries(proxyData.envFlags || {}).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400">{key}</span>
                          {val ? (
                            <span className="text-emerald-400">DETECTED</span>
                          ) : (
                            <span className="text-red-500 font-bold">MISSING</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-black/20 rounded-lg border border-white/5">
                    <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Backend State</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Firestore</span>
                        <span className={proxyData.firestore.enabled ? "text-emerald-400" : "text-red-500"}>
                          {proxyData.firestore.enabled ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Server Time</span>
                        <span className="text-zinc-200">{new Date(proxyData.serverTime).toLocaleTimeString()}</span>
                      </div>
                      {proxyData.firestore.error && (
                        <div className="mt-2 p-2 bg-red-900/20 rounded text-red-300">
                          FS Error: {proxyData.firestore.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* DIRECT CHECK (Browser -> Network Service) */}
        <Card className="p-6 bg-zinc-900/50 border-white/10 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Direct Network Ping</h2>
              <StatusBadge status={directStatus} />
            </div>
            <Button size="sm" variant="ghost" onClick={checkDirect} disabled={directStatus === 'loading'}>
              Test Direct Connection
            </Button>
          </div>

          <p className="text-sm text-zinc-400 mb-4">
            Testing URL: <code className="bg-zinc-950 px-2 py-1 rounded text-emerald-300">https://nodal-point-network.../api/debug/health</code>
          </p>

          {directError && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
              <strong>Direct Access Failed:</strong> {directError}
              <p className="mt-2 text-xs opacity-75">
                If &quot;Internal Uplink&quot; works but this fails, it&apos;s likely a CORS issue (which is fine for backend-to-backend comms, but prevents browser direct access).
                If BOTH fail, the Network Service is down or unreachable.
              </p>
            </div>
          )}

          {directData && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              <strong>Direct Connection Successful!</strong>
              <p className="mt-1 text-xs opacity-75">
                The Network Service is online, publicly accessible, and CORS is correctly configured for this origin.
              </p>
            </div>
          )}
        </Card>

        {/* CLIENT ENV CHECK */}
        <Card className="p-6 bg-zinc-900/50 border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <Wifi className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Frontend Client Environment</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(clientEnv).map(([key, val]) => (
              <div key={key} className="p-3 bg-black/20 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-mono">{key}</span>
                {val ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'idle' | 'loading' | 'success' | 'error' }) {
  if (status === 'idle') return <Badge variant="outline" className="text-zinc-500 border-zinc-700">IDLE</Badge>
  if (status === 'loading') return <Badge variant="outline" className="text-yellow-500 border-yellow-700 animate-pulse">PINGING...</Badge>
  if (status === 'success') return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">ONLINE</Badge>
  if (status === 'error') return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">OFFLINE</Badge>
  return null
}
