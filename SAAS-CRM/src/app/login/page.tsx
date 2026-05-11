'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageReveal } from '@/components/motion/PageReveal'
import { toast } from 'sonner'
import { Loader2, Mail, CheckCircle2, ShieldCheck, Zap, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function LoginContent() {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setIsLoading(provider)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
          scopes: provider === 'azure' ? 'email openid profile' : undefined,
        },
      })
      if (error) throw error
    } catch (error: any) {
      toast.error(error.message || 'Failed to authenticate')
      setIsLoading(null)
    }
  }

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault()
    toast.info('Email login is currently disabled for your organization. Please use SSO.')
  }

  const handleDevBypass = () => {
    document.cookie = 'np_session=1; Path=/; SameSite=Lax'
    toast.success('Dev Bypass Active')
    window.location.href = '/network'
  }

  return (
    <div className="flex min-h-screen bg-[#09090F]">
      {/* Left Side: Auth Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 relative overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent opacity-50" />
        
        <PageReveal className="w-full max-w-[400px] relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 mb-12 group">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-2 shadow-lg group-hover:scale-105 transition-transform">
              <Image src="/images/nodalpoint.png" alt="Nodal Point" width={24} height={24} className="object-contain" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Nodal Point</span>
          </Link>

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white mb-3">Welcome back</h1>
            <p className="text-zinc-500">Enter your credentials to access your intelligence dashboard.</p>
          </div>

          <div className="space-y-4 mb-8">
            <Button
              variant="outline"
              className="w-full h-12 bg-white hover:bg-zinc-100 text-zinc-900 font-bold border-zinc-200 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-95"
              onClick={() => handleOAuthLogin('google')}
              disabled={isLoading !== null}
            >
              {isLoading === 'google' ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <Button
              variant="outline"
              className="w-full h-12 bg-white hover:bg-zinc-100 text-zinc-900 font-bold border-zinc-200 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-95"
              onClick={() => handleOAuthLogin('azure')}
              disabled={isLoading !== null}
            >
              {isLoading === 'azure' ? (
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 0H0v10h10V0z" fill="#f25022"/>
                  <path d="M21 0H11v10h10V0z" fill="#7fba00"/>
                  <path d="M10 11H0v10h10V11z" fill="#00a4ef"/>
                  <path d="M21 11H11v10h10V11z" fill="#ffb900"/>
                </svg>
              )}
              Continue with Microsoft
            </Button>
          </div>

          <div className="relative my-8 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <span className="relative bg-[#09090F] px-4 text-xs font-mono uppercase tracking-widest text-zinc-600">or use work email</span>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Email Address</label>
              <input 
                type="email" 
                placeholder="name@company.com" 
                className="w-full h-12 px-4 rounded-lg bg-[#111118] border border-zinc-800 text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#2B5BFF] focus:ring-1 focus:ring-[#2B5BFF] transition-all"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Password</label>
                <Link href="#" className="text-xs font-bold text-[#2B5BFF] hover:text-blue-400">Forgot?</Link>
              </div>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full h-12 px-4 rounded-lg bg-[#111118] border border-zinc-800 text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#2B5BFF] focus:ring-1 focus:ring-[#2B5BFF] transition-all"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#2B5BFF] hover:bg-[#1A3ACC] text-white font-bold h-12 text-md shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
              disabled={isLoading !== null}
            >
              Sign In
            </Button>
          </form>

          {process.env.NODE_ENV === 'development' && (
            <button
              className="w-full mt-10 text-zinc-700 hover:text-zinc-500 text-[10px] font-mono tracking-tighter uppercase transition-colors"
              onClick={handleDevBypass}
            >
              [Dev Bypass Terminal]
            </button>
          )}

          <div className="mt-12 text-center">
            <p className="text-sm text-zinc-500">
              Don't have an account? <Link href="/pricing" className="text-white font-bold hover:underline decoration-[#2B5BFF] decoration-2 underline-offset-4">Contact Sales</Link>
            </p>
          </div>

          <div className="mt-20 pt-8 border-t border-zinc-800/50 flex flex-col items-center">
            <div className="flex items-center gap-2 text-zinc-600 mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Enterprise Secure</span>
            </div>
            <span className="text-[9px] text-zinc-700 font-mono tracking-tighter text-center">
              AUTHENTICATION ENFORCED BY SUPABASE AUTH & RLS POLICIES
            </span>
          </div>
        </PageReveal>
      </div>

      {/* Right Side: Product Showcase */}
      <div className="hidden lg:flex flex-1 bg-[#0A0A14] border-l border-zinc-800/50 relative overflow-hidden flex-col items-center justify-center p-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent" />
        
        <div className="relative z-10 w-full max-w-lg">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-6">
              Forensic Sound Profile // Enabled
            </div>
            <h2 className="text-4xl font-black text-white leading-tight mb-6">Walk into every <br/> meeting with forensic <br/> proof.</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">Identify hidden cost leakage for your clients in seconds, not days.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">Diagnose portfolio risk and uncover margin potential across the US.</p>
              </div>
            </div>
          </div>

          {/* Mini-Dashboard Mockup */}
          <div className="nodal-glass rounded-2xl border border-white/5 p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 font-mono leading-none mb-1 uppercase tracking-widest">Broker Intelligence</div>
                  <div className="text-sm font-bold text-white">ExxonMobil Portfolio</div>
                </div>
              </div>
              <div className="text-[10px] text-green-400 font-mono bg-green-400/10 px-2 py-1 rounded">HIGH CONFIDENCE</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Broker Margin</div>
                <div className="text-xl font-mono text-white">$12.4k</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Leakage Found</div>
                <div className="text-xl font-mono text-red-400">$124,500</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 w-[70%] animate-pulse" />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-600 font-mono uppercase tracking-widest">
                <span>Diagnostic Scan</span>
                <span>70% Complete</span>
              </div>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-between opacity-50 grayscale">
            <div className="text-lg font-bold text-white tracking-tighter">ENGIE</div>
            <div className="text-lg font-bold text-white tracking-tighter">NRG</div>
            <div className="text-lg font-bold text-white tracking-tighter">SHELL</div>
            <div className="text-lg font-bold text-white tracking-tighter">NRG</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090F] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2B5BFF]" /></div>}>
      <LoginContent />
    </Suspense>
  )
}
