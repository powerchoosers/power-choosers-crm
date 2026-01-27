'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Session, User as SupabaseUser } from '@supabase/supabase-js'

// Define a compatible User type that matches what the app expects (Firebase-like)
export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

type UserProfile = {
  name: string | null
  firstName: string | null
  lastName: string | null
  bio: string | null
  twilioNumbers: Array<{ name: string; number: string }> | null
  selectedPhoneNumber: string | null
  bridgeToMobile: boolean | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  role: string | null
  profile: UserProfile
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  profile: { 
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
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile>({ 
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
    let mounted = true

    // Function to map Supabase user to our AuthUser
    const mapUser = (sbUser: SupabaseUser): AuthUser => {
      const metadata = sbUser.user_metadata || {}
      return {
        uid: sbUser.id,
        email: sbUser.email || null,
        displayName: metadata.full_name || metadata.name || metadata.displayName || null,
        photoURL: metadata.avatar_url || metadata.picture || metadata.photoURL || null
      }
    }

    // Initialize Supabase Auth Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      const sbUser = session?.user || null
      const currentUser = sbUser ? mapUser(sbUser) : null
      
      setUser(currentUser)

      if (currentUser && currentUser.email) {
        // Set session cookie for middleware
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'

        // Firestore Sync Logic (Keep existing logic but prioritize Supabase metadata)
        const userDocRef = doc(db, 'users', currentUser.email.toLowerCase())
        const emailLower = currentUser.email.toLowerCase().trim()
        
        // Unsubscribe previous listener if any
        if (unsubProfile) unsubProfile()

        unsubProfile = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data() as Record<string, unknown>
            setRole((data.role as string | undefined) || 'employee')

            // Prioritize Supabase Metadata for Name/Avatar if available, else fall back to Firestore
            const sbMetadata = sbUser?.user_metadata || {}
            
            // Resolve Names
            const sbFullName = sbMetadata.full_name || sbMetadata.name
            const sbFirstName = sbMetadata.full_name ? sbMetadata.full_name.split(' ')[0] : null
            
            const dbFirstName = typeof data.firstName === 'string' ? data.firstName.trim() : null
            const dbLastName = typeof data.lastName === 'string' ? data.lastName.trim() : null
            const dbName = typeof data.name === 'string' ? data.name.trim() : null

            const inferred = 
              inferNameFromString(sbFullName) ||
              inferNameFromString(currentUser.displayName) ||
              inferNameFromString(dbName) ||
              inferNameFromEmail(emailLower)

            const resolvedFirstName = dbFirstName || inferred?.firstName || null
            const resolvedLastName = dbLastName || inferred?.lastName || null
            const explicitFullName = resolvedFirstName ? `${resolvedFirstName} ${resolvedLastName || ''}`.trim() : null

            const derivedName = 
              explicitFullName || 
              dbName || 
              currentUser.displayName || 
              (sbUser?.email?.split('@')[0]) || 
              null

            setProfile({ 
              name: derivedName, 
              firstName: resolvedFirstName, 
              lastName: resolvedLastName,
              bio: typeof data.bio === 'string' ? data.bio : null,
              twilioNumbers: Array.isArray(data.twilioNumbers) ? data.twilioNumbers : [],
              selectedPhoneNumber: typeof data.selectedPhoneNumber === 'string' ? data.selectedPhoneNumber : null,
              bridgeToMobile: typeof data.bridgeToMobile === 'boolean' ? data.bridgeToMobile : false
            })
          } else {
            // Document doesn't exist yet, use Supabase metadata
            setRole('employee')
            const inferred = inferNameFromString(currentUser.displayName) || inferNameFromEmail(emailLower)
            const derivedName = inferred?.fullName || currentUser.displayName || null
            
            setProfile({ 
              name: derivedName, 
              firstName: inferred?.firstName || null, 
              lastName: inferred?.lastName || null,
              bio: null,
              twilioNumbers: [],
              selectedPhoneNumber: null,
              bridgeToMobile: false
            })
            
            // Create the document in Firestore if it doesn't exist (Migration)
             const createProfile = async () => {
               try {
                 const userDoc = await getDoc(userDocRef)
                 if (!userDoc.exists()) {
                    await setDoc(userDocRef, {
                      email: emailLower,
                      role: 'employee',
                      name: derivedName,
                      firstName: inferred?.firstName || null,
                      lastName: inferred?.lastName || null,
                      photoURL: currentUser.photoURL,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      metadataSource: 'supabase_auth'
                    }, { merge: true })
                 }
               } catch (e) {
                 console.error("Error creating user profile:", e)
               }
             }
             createProfile()
          }
        })

      } else {
        // No user
        if (unsubProfile) {
          unsubProfile()
          unsubProfile = null
        }
        setRole(null)
        setProfile({ 
          name: null, 
          firstName: null, 
          lastName: null,
          bio: null,
          twilioNumbers: null,
          selectedPhoneNumber: null,
          bridgeToMobile: null
        })
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      }

      setLoading(false)

      const path = window.location.pathname
      
      // Route Protection
      if (!currentUser && path.startsWith('/crm-platform')) {
        router.push('/login')
      } 
      else if (currentUser && path === '/login') {
        router.push('/crm-platform')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (unsubProfile) unsubProfile()
    }
  }, [router])

  return (
    <AuthContext.Provider value={{ user, loading, role, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
