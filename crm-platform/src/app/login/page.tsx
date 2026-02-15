'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'


function LoginContent() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams ? searchParams.get('error') : null

  useEffect(() => {
    if (urlError) {
      toast.error(decodeURIComponent(urlError))
      // Clear the error from the URL without refreshing
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [urlError])

  const handleZohoLogin = () => {
    setIsLoading(true)
    // Redirect to the Zoho auth initiation route
    window.location.href = '/api/auth/zoho/login'
  }

  const handleDevBypass = () => {
    document.cookie = 'np_session=1; Path=/; SameSite=Lax'
    toast.success('Dev Bypass Active')
    window.location.href = '/network'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/80 backdrop-blur-xl text-zinc-100 shadow-2xl relative z-10">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-6">
            <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-lg p-4">
              <div className="relative w-full h-full">
                <Image src="/images/nodalpoint.png" alt="Nodal Point" fill className="object-contain" priority />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">Nodal Point CRM</CardTitle>
          <CardDescription className="text-zinc-400">
            Securely access your market intelligence
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="space-y-4">
            <Button
              className="w-full bg-[#002FA7] hover:bg-blue-700 text-white font-semibold h-12 text-lg shadow-lg shadow-blue-900/20 group relative overflow-hidden"
              onClick={handleZohoLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Mail className="mr-3 h-5 w-5" />
              )}
              {isLoading ? 'Authenticating...' : 'Sign in with Zoho'}

              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </Button>

            <p className="text-center text-xs text-zinc-500">
              Only authorized Nodal Point identities can access this network.
            </p>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="pt-4 border-t border-zinc-800">
              <Button
                variant="ghost"
                className="w-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 text-xs"
                onClick={handleDevBypass}
              >
                [DEV] Bypass Login
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center pb-8">
          <span className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase">
            Authenticated via Supabase • Identity by Zoho
          </span>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
      <LoginContent />
    </Suspense>
  )
}
