'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export type UserProfile = {
  email: string | null
  name: string | null
  firstName: string | null
  lastName: string | null
  bio: string | null
  jobTitle: string | null
  linkedinUrl: string | null
  city: string | null
  state: string | null
  hostedPhotoUrl: string | null
  twilioNumbers: Array<{ name: string; number: string }> | null
  selectedPhoneNumber: string | null
  bridgeToMobile: boolean | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  role: string | null
  profile: UserProfile
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  profile: {
    email: null,
    name: null,
    firstName: null,
    lastName: null,
    bio: null,
    jobTitle: null,
    linkedinUrl: null,
    city: null,
    state: null,
    hostedPhotoUrl: null,
    twilioNumbers: null,
    selectedPhoneNumber: null,
    bridgeToMobile: null
  },
  refreshProfile: async () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile>({
    email: null,
    name: null,
    firstName: null,
    lastName: null,
    bio: null,
    jobTitle: null,
    linkedinUrl: null,
    city: null,
    state: null,
    hostedPhotoUrl: null,
    twilioNumbers: null,
    selectedPhoneNumber: null,
    bridgeToMobile: null
  })
  const router = useRouter()

  const titleize = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  }, [])

  const inferNameFromString = useCallback((value: string | null | undefined) => {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return null
    const parts = raw.split(/\s+/).filter(Boolean)
    if (parts.length < 2) return null
    const firstName = titleize(parts[0])
    const lastName = titleize(parts.slice(1).join(' '))
    const fullName = `${firstName} ${lastName}`.trim()
    return { firstName, lastName, fullName }
  }, [titleize])

  const inferNameFromEmail = useCallback((email: string) => {
    const emailLower = String(email).toLowerCase().trim()
    const prefix = emailLower.split('@')[0] || ''
    const parts = prefix.split(/[._-]+/).filter(Boolean)
    if (parts.length < 2) return null
    const firstName = titleize(parts[0])
    const lastName = titleize(parts.slice(1).join(' '))
    const fullName = `${firstName} ${lastName}`.trim()
    return { firstName, lastName, fullName }
  }, [titleize])

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const currentUser = session?.user || user
    if (!currentUser?.email) return

    const emailLower = currentUser.email.toLowerCase().trim()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', emailLower)
      .maybeSingle()

    if (error) {
      console.error('[Auth] Error fetching profile:', error)
      return
    }

    if (data) {
      const settings = (data.settings as Record<string, any>) || {}
      // Hardcode l.patterson@nodalpoint.io as admin
      const isAdmin = emailLower === 'l.patterson@nodalpoint.io'
      setRole(isAdmin ? 'admin' : (settings.role || 'employee'))

      const firstName = data.first_name || null
      const lastName = data.last_name || null
      const storedName = data.name || settings.name || null

      const inferred =
        inferNameFromString(currentUser.user_metadata?.full_name) ||
        inferNameFromString(storedName) ||
        inferNameFromEmail(emailLower)

      const resolvedFirstName = firstName || inferred?.firstName || null
      const resolvedLastName = lastName || inferred?.lastName || null
      const explicitFullName = resolvedFirstName ? `${resolvedFirstName} ${resolvedLastName || ''}`.trim() : null

      const derivedName = explicitFullName || storedName || (currentUser.user_metadata?.full_name?.trim() || null)

      setProfile({
        email: currentUser.email,
        name: derivedName,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        bio: data.bio || null,
        jobTitle: data.job_title || null,
        linkedinUrl: data.linkedin_url || null,
        city: settings.city ?? null,
        state: settings.state ?? null,
        hostedPhotoUrl: data.hosted_photo_url || null,
        twilioNumbers: settings.twilioNumbers || [],
        selectedPhoneNumber: settings.selectedPhoneNumber || null,
        bridgeToMobile: settings.bridgeToMobile || false
      })

      // If user has Zoho/External avatar but no hosted URL, host it and save (for email signature)
      const photoURL = currentUser.user_metadata?.avatar_url
      const isExternalPhoto = photoURL && !photoURL.includes('imgur.com')
      if (isExternalPhoto && !data.hosted_photo_url) {
        fetch('/api/upload/host-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: photoURL }),
        })
          .then((res) => res.json())
          .then((payload) => {
            const imageUrl = payload?.imageUrl ?? payload?.url
            if (imageUrl) {
              supabase.from('users').update({ hosted_photo_url: imageUrl, updated_at: new Date().toISOString() }).eq('email', emailLower).then(() => refreshProfile())
            }
          })
          .catch(() => { })
      }
    }
  }

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null
    let didResolve = false

    // IMMEDIATE DEV BYPASS CHECK
    const isDev = process.env.NODE_ENV === 'development'
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie.includes('np_session=1')

    if (isDev && hasSessionCookie) {
      console.log('[Auth] Immediate Dev Bypass Check')
      didResolve = true
      setUser({
        id: 'dev-bypass-uid',
        email: 'dev@nodalpoint.io',
        user_metadata: { full_name: 'Dev User' },
        aud: 'authenticated',
        role: 'authenticated',
      } as unknown as User)
      setRole('admin')
      setProfile({
        email: 'dev@nodalpoint.io',
        name: 'Dev User',
        firstName: 'Dev',
        lastName: 'User',
        bio: 'System Administrator (Bypass)',
        jobTitle: 'Principal Market Architect',
        linkedinUrl: 'https://linkedin.com/in/nodalpoint',
        city: null,
        state: null,
        hostedPhotoUrl: null,
        twilioNumbers: [],
        selectedPhoneNumber: null,
        bridgeToMobile: false
      })
      setLoading(false)
    }

    const timeoutId = window.setTimeout(() => {
      if (!didResolve) {
        setUser(null)
        setRole(null)
        setProfile({
          email: null,
          name: null,
          firstName: null,
          lastName: null,
          bio: null,
          jobTitle: null,
          linkedinUrl: null,
          city: null,
          state: null,
          hostedPhotoUrl: null,
          twilioNumbers: null,
          selectedPhoneNumber: null,
          bridgeToMobile: null
        })
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
        setLoading(false)
      }
    }, 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null
      didResolve = true
      window.clearTimeout(timeoutId)

      // DEV BYPASS LOGIC: If in dev mode and cookie exists, force mock user
      const isDev = process.env.NODE_ENV === 'development'
      const hasSessionCookie = document.cookie.includes('np_session=1')

      if (!user && isDev && hasSessionCookie) {
        console.log('[Auth] Dev Bypass Active')
        const mockUser = {
          id: 'dev-bypass-uid',
          email: 'dev@nodalpoint.io',
          user_metadata: { full_name: 'Dev User' },
          aud: 'authenticated',
          role: 'authenticated',
        } as unknown as User

        setUser(mockUser)
        setRole('admin')
        setProfile({
          email: 'dev@nodalpoint.io',
          name: 'Dev User',
          firstName: 'Dev',
          lastName: 'User',
          bio: 'System Administrator (Bypass)',
          jobTitle: 'Principal Market Architect',
          linkedinUrl: 'https://linkedin.com/in/nodalpoint',
          city: null,
          state: null,
          hostedPhotoUrl: null,
          twilioNumbers: [],
          selectedPhoneNumber: null,
          bridgeToMobile: false
        })
        setLoading(false)

        // Redirect if on login page
        if (window.location.pathname === '/login') {
          router.push('/network')
        }
        return
      }

      setUser(user)

      if (user) {
        // Ensure session cookie is set for middleware
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'

        if (user.email) {
          const emailLower = user.email.toLowerCase().trim()

          const fetchProfile = async () => {
            const { data, error } = await supabase
              .from('users')
              .select('*')
              .eq('email', emailLower)
              .maybeSingle()

            if (error) {
              console.error('[Auth] Error fetching profile:', error)
              return
            }

            if (data) {
              const settings = (data.settings as Record<string, any>) || {}
              // Hardcode l.patterson@nodalpoint.io as admin
              const isAdmin = emailLower === 'l.patterson@nodalpoint.io'
              setRole(isAdmin ? 'admin' : (settings.role || 'employee'))

              const firstName = data.first_name || null
              const lastName = data.last_name || null
              const storedName = data.name || settings.name || null

              const inferred =
                inferNameFromString(user.user_metadata?.full_name) ||
                inferNameFromString(storedName) ||
                inferNameFromEmail(emailLower)

              const resolvedFirstName = firstName || inferred?.firstName || null
              const resolvedLastName = lastName || inferred?.lastName || null
              const explicitFullName = resolvedFirstName ? `${resolvedFirstName} ${resolvedLastName || ''}`.trim() : null

              const derivedName = explicitFullName || storedName || (user.user_metadata?.full_name?.trim() || null)

              setProfile({
                email: user.email ?? null,
                name: derivedName,
                firstName: resolvedFirstName,
                lastName: resolvedLastName,
                bio: data.bio || null,
                jobTitle: data.job_title || null,
                linkedinUrl: data.linkedin_url || null,
                city: settings.city ?? null,
                state: settings.state ?? null,
                hostedPhotoUrl: data.hosted_photo_url || null,
                twilioNumbers: settings.twilioNumbers || [],
                selectedPhoneNumber: settings.selectedPhoneNumber || null,
                bridgeToMobile: settings.bridgeToMobile || false
              })
            } else {
              // Hardcode l.patterson@nodalpoint.io as admin
              const isAdmin = emailLower === 'l.patterson@nodalpoint.io'
              setRole(isAdmin ? 'admin' : 'employee')
              const inferred = inferNameFromString(user.user_metadata?.full_name) || inferNameFromEmail(emailLower)
              const derivedName = inferred?.fullName || user.user_metadata?.full_name?.trim() || null

              const newProfile = {
                id: user.id,
                email: emailLower,
                first_name: inferred?.firstName || null,
                last_name: inferred?.lastName || null,
                bio: null,
                settings: {
                  role: isAdmin ? 'admin' : 'employee',
                  twilioNumbers: [],
                  selectedPhoneNumber: null,
                  bridgeToMobile: false
                }
              }

              await supabase.from('users').insert(newProfile)

              setProfile({
                email: user.email ?? null,
                name: derivedName,
                firstName: inferred?.firstName || null,
                lastName: inferred?.lastName || null,
                bio: null,
                jobTitle: null,
                linkedinUrl: null,
                city: null,
                state: null,
                hostedPhotoUrl: null,
                twilioNumbers: [],
                selectedPhoneNumber: null,
                bridgeToMobile: false
              })
            }
          }

          fetchProfile()

          const channel = supabase
            .channel(`user-profile-${emailLower}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'users',
                filter: `email=eq.${emailLower}`
              },
              () => {
                fetchProfile()
              }
            )
            .subscribe()

          unsubscribeProfile = () => {
            supabase.removeChannel(channel)
          }
        }
      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile()
          unsubscribeProfile = null
        }
        setRole(null)
        setProfile({
          email: null,
          name: null,
          firstName: null,
          lastName: null,
          bio: null,
          jobTitle: null,
          linkedinUrl: null,
          city: null,
          state: null,
          hostedPhotoUrl: null,
          twilioNumbers: null,
          selectedPhoneNumber: null,
          bridgeToMobile: null
        })
        // Clear session cookie
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      }

      setLoading(false)

      const path = window.location.pathname
      if (!user && path.startsWith('/network')) {
        router.push('/login')
      } else if (user && path === '/login') {
        router.push('/network')
      }
    })

    return () => {
      subscription.unsubscribe()
      if (unsubscribeProfile) unsubscribeProfile()
      window.clearTimeout(timeoutId)
    }
  }, [router, inferNameFromEmail, inferNameFromString])

  return (
    <AuthContext.Provider value={{ user, loading, role, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
