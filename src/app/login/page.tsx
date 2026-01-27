'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Chrome } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth)
        if (result) {
          document.cookie = 'np_session=1; Path=/; SameSite=Lax'
          toast.success('Logged in with Google successfully')
          router.push('/network')
        }
      } catch (error: unknown) {
        console.error('Redirect login error:', error)
        const message = error instanceof Error ? error.message : 'Failed to login with Google'
        toast.error(message)
      }
    }
    
    checkRedirect()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      document.cookie = 'np_session=1; Path=/; SameSite=Lax'
      toast.success('Logged in successfully')
      router.push('/network')
    } catch (error: unknown) {
      console.error('Login error:', error)
      const message = error instanceof Error ? error.message : 'Failed to login'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      document.cookie = 'np_session=1; Path=/; SameSite=Lax'
      toast.success('Logged in with Google successfully')
      router.push('/network')
    } catch (error: any) {
      console.error('Google login error:', error)
      
      // Fallback to redirect for embedded environments (like Trae IDE) or mobile
      if (
        error.code === 'auth/popup-closed-by-user' || 
        error.code === 'auth/popup-blocked' || 
        error.code === 'auth/cancelled-popup-request' ||
        error.message?.includes('Cross-Origin-Opener-Policy') ||
        error.message?.includes('popup')
      ) {
         toast.info('Popup blocked. Switching to redirect login...')
         try {
             const provider = new GoogleAuthProvider()
             await signInWithRedirect(auth, provider)
             return 
         } catch (redirectError) {
             console.error('Redirect error:', redirectError)
             toast.error('Failed to initiate redirect login')
         }
      } else {
         const message = error instanceof Error ? error.message : 'Failed to login with Google'
         toast.error(message)
      }
      setIsGoogleLoading(false)
    }
  }

  const handleDevBypass = () => {
    document.cookie = 'np_session=1; Path=/; SameSite=Lax'
    toast.success('Dev Bypass Active')
    // Use window.location.href to force a full page load and refresh AuthContext
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
          <CardTitle className="text-2xl font-bold tracking-tight text-white">Welcome Back</CardTitle>
          <CardDescription className="text-zinc-400">
            Sign in to Nodal Point CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Button 
                variant="outline" 
                className="w-full bg-white text-zinc-900 hover:bg-zinc-100 border-zinc-200 font-medium h-11"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isLoading}
            >
                {isGoogleLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Chrome className="mr-2 h-4 w-4 text-red-500" />
                )}
                Sign in with Google
            </Button>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-zinc-900 px-2 text-zinc-500">Or continue with</span>
                </div>
            </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500 h-11"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11"
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In with Email
            </Button>
          </form>

          {process.env.NODE_ENV === 'development' && (
            <div className="pt-2">
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
      </Card>
    </div>
  )
}
