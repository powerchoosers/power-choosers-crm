'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AuthCallback] Event: ${event}`, session?.user?.email)
      
      if (event === 'SIGNED_IN' && session) {
        // Set the session cookie manually to ensure middleware picks it up immediately
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'
        router.push('/crm-platform')
        subscription.unsubscribe()
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          document.cookie = 'np_session=1; Path=/; SameSite=Lax'
          router.push('/crm-platform')
          subscription.unsubscribe()
        }
      }
    })

    // Fallback timeout in case event doesn't fire as expected
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'
        router.push('/crm-platform')
      } else {
        console.warn('[AuthCallback] Session timeout - redirecting to login')
        router.push('/login?error=timeout')
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase">Synchronizing_Session...</p>
      </div>
    </div>
  )
}
