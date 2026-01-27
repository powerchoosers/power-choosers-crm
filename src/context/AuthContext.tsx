'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

type UserProfile = {
  email: string | null
  name: string | null
  firstName: string | null
  lastName: string | null
  bio: string | null
  twilioNumbers: Array<{ name: string; number: string }> | null
  selectedPhoneNumber: string | null
  bridgeToMobile: boolean | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  role: string | null
  profile: UserProfile
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
    twilioNumbers: null,
    selectedPhoneNumber: null,
    bridgeToMobile: null
  },
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
    twilioNumbers: null,
    selectedPhoneNumber: null,
    bridgeToMobile: null
  })
  const router = useRouter()

  useEffect(() => {
    const titleize = (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return ''
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
    }

    const inferNameFromString = (value: string | null | undefined) => {
      const raw = typeof value === 'string' ? value.trim() : ''
      if (!raw) return null
      const parts = raw.split(/\s+/).filter(Boolean)
      if (parts.length < 2) return null
      const firstName = titleize(parts[0])
      const lastName = titleize(parts.slice(1).join(' '))
      const fullName = `${firstName} ${lastName}`.trim()
      return { firstName, lastName, fullName }
    }

    const inferNameFromEmail = (email: string) => {
      const emailLower = String(email).toLowerCase().trim()
      const prefix = emailLower.split('@')[0] || ''
      const parts = prefix.split(/[._-]+/).filter(Boolean)
      if (parts.length < 2) return null
      const firstName = titleize(parts[0])
      const lastName = titleize(parts.slice(1).join(' '))
      const fullName = `${firstName} ${lastName}`.trim()
      return { firstName, lastName, fullName }
    }

    let unsubProfile: (() => void) | null = null
    let didResolve = false

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
          twilioNumbers: null,
          selectedPhoneNumber: null,
          bridgeToMobile: null
        })
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
        setLoading(false)
      }
    }, 5000)

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      didResolve = true
      window.clearTimeout(timeoutId)
      setUser(user)
      
      if (user) {
        // Ensure session cookie is set for middleware
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'

        if (user.email) {
          // Listen for real-time updates to user profile
          const userDocRef = doc(db, 'users', user.email.toLowerCase())
          const emailLower = user.email.toLowerCase().trim()
          
          unsubProfile = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
              const data = doc.data() as Record<string, unknown>
              setRole((data.role as string | undefined) || 'employee')

              const firstName = typeof data.firstName === 'string' ? data.firstName.trim() || null : null
              const lastName = typeof data.lastName === 'string' ? data.lastName.trim() || null : null
              const storedName = typeof data.name === 'string' ? data.name.trim() || null : null
              const storedDisplayName = typeof data.displayName === 'string' ? data.displayName.trim() || null : null

              const inferred =
                inferNameFromString(storedDisplayName) ||
                inferNameFromString(user.displayName) ||
                inferNameFromString(storedName) ||
                inferNameFromEmail(emailLower)

              const resolvedFirstName = firstName || inferred?.firstName || null
              const resolvedLastName = lastName || inferred?.lastName || null
              const explicitFullName = resolvedFirstName ? `${resolvedFirstName} ${resolvedLastName || ''}`.trim() : null

              const derivedName =
                explicitFullName ||
                storedName ||
                storedDisplayName ||
                (user.displayName?.trim() || null)

              if ((!firstName || !lastName) && inferred?.fullName) {
                const nextName = inferred.fullName
                const shouldOverrideName = !storedName || !storedName.includes(' ')
                void setDoc(
                  userDocRef,
                  {
                    ...(resolvedFirstName ? { firstName: resolvedFirstName } : {}),
                    ...(resolvedLastName ? { lastName: resolvedLastName } : {}),
                    ...(shouldOverrideName ? { name: nextName, displayName: nextName } : {}),
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                )
              }

              setProfile({ 
                email: user.email,
                name: derivedName, 
                firstName: resolvedFirstName, 
                lastName: resolvedLastName,
                bio: typeof data.bio === 'string' ? data.bio : null,
                twilioNumbers: Array.isArray(data.twilioNumbers) ? data.twilioNumbers : [],
                selectedPhoneNumber: typeof data.selectedPhoneNumber === 'string' ? data.selectedPhoneNumber : null,
                bridgeToMobile: typeof data.bridgeToMobile === 'boolean' ? data.bridgeToMobile : false
              })
            } else {
              setRole('employee')
              const inferred = inferNameFromString(user.displayName) || inferNameFromEmail(emailLower)
              const derivedName = inferred?.fullName || user.displayName?.trim() || null
              setProfile({ 
                email: user.email,
                name: derivedName, 
                firstName: inferred?.firstName || null, 
                lastName: inferred?.lastName || null,
                bio: null,
                twilioNumbers: [],
                selectedPhoneNumber: null,
                bridgeToMobile: false
              })
            }
          })

          // Initial check/setup for user document if it doesn't exist
          try {
            const userDoc = await getDoc(userDocRef)
            if (!userDoc.exists()) {
              const inferred = inferNameFromString(user.displayName) || inferNameFromEmail(emailLower)
              const derivedName = inferred?.fullName || user.displayName?.trim() || null
              await setDoc(
                userDocRef,
                {
                  email: emailLower,
                  role: 'employee',
                  ...(derivedName ? { name: derivedName, displayName: derivedName } : {}),
                  ...(inferred?.firstName ? { firstName: inferred.firstName } : {}),
                  ...(inferred?.lastName ? { lastName: inferred.lastName } : {}),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              )
            }
          } catch (error) {
            console.error("Error setting up user document:", error)
          }
        }
      } else {
        if (unsubProfile) {
          unsubProfile()
          unsubProfile = null
        }
        setRole(null)
        setProfile({ 
          email: null,
          name: null, 
          firstName: null, 
          lastName: null,
          bio: null,
          twilioNumbers: null,
          selectedPhoneNumber: null,
          bridgeToMobile: null
        })
        // Clear session cookie
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      }

      setLoading(false)
      
      const path = window.location.pathname
      
      // Only protect /network routes
      if (!user && path.startsWith('/network')) {
        router.push('/login')
      } 
      // Redirect logged-in users from login page to platform
      else if (user && path === '/login') {
        router.push('/network')
      }
    })

    return () => {
      unsubscribe()
      if (unsubProfile) unsubProfile()
      window.clearTimeout(timeoutId)
    }
  }, [router])

  return (
    <AuthContext.Provider value={{ user, loading, role, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
