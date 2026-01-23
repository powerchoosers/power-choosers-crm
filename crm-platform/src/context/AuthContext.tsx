'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

type UserProfile = {
  name: string | null
  firstName: string | null
  lastName: string | null
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
  profile: { name: null, firstName: null, lastName: null },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile>({ name: null, firstName: null, lastName: null })
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)
      
      if (user) {
        // Ensure session cookie is set for middleware
        document.cookie = 'np_session=1; Path=/; SameSite=Lax'

        if (user.email) {
          try {
            // Fetch user role
            const userDocRef = doc(db, 'users', user.email.toLowerCase())
            const userDoc = await getDoc(userDocRef)
            if (userDoc.exists()) {
              const data = userDoc.data() as Record<string, unknown>
              setRole((data.role as string | undefined) || 'employee')

              const firstName = typeof data.firstName === 'string' ? data.firstName.trim() || null : null
              const lastName = typeof data.lastName === 'string' ? data.lastName.trim() || null : null
              const storedName = typeof data.name === 'string' ? data.name.trim() || null : null
              const storedDisplayName = typeof data.displayName === 'string' ? data.displayName.trim() || null : null

              const derivedName =
                storedName ||
                storedDisplayName ||
                (firstName ? `${firstName} ${lastName || ''}`.trim() : null) ||
                (user.displayName?.trim() || null)

              setProfile({ name: derivedName, firstName, lastName })

              if (!storedName && derivedName) {
                try {
                  await setDoc(
                    userDocRef,
                    {
                      email: user.email.toLowerCase(),
                      name: derivedName,
                      displayName: derivedName,
                      updatedAt: new Date().toISOString(),
                    },
                    { merge: true }
                  )
                } catch {}
              }
            } else {
              setRole('employee')
              const derivedName = user.displayName?.trim() || null
              setProfile({ name: derivedName, firstName: null, lastName: null })

              try {
                await setDoc(
                  userDocRef,
                  {
                    email: user.email.toLowerCase(),
                    role: 'employee',
                    ...(derivedName ? { name: derivedName, displayName: derivedName } : {}),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                )
              } catch {}
            }
          } catch (error) {
            console.error("Error fetching user role:", error)
            setRole('employee') // Fallback
            setProfile({ name: user.displayName?.trim() || null, firstName: null, lastName: null })
          }
        }
      } else {
        setRole(null)
        setProfile({ name: null, firstName: null, lastName: null })
        // Clear session cookie
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      }

      setLoading(false)
      
      const path = window.location.pathname
      
      // Only protect /crm-platform routes
      if (!user && path.startsWith('/crm-platform')) {
        router.push('/login')
      } 
      // Redirect logged-in users from login page to platform
      else if (user && path === '/login') {
        router.push('/crm-platform')
      }
    })

    return () => unsubscribe()
  }, [router])

  return (
    <AuthContext.Provider value={{ user, loading, role, profile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
