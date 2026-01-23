'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  loading: boolean
  role: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
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
              setRole(userDoc.data().role || 'employee')
            } else {
               // Default to employee if no profile found (or handle creation if needed)
               // For now, assume employee to be safe
               setRole('employee')
            }
          } catch (error) {
            console.error("Error fetching user role:", error)
            setRole('employee') // Fallback
          }
        }
      } else {
        setRole(null)
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
    <AuthContext.Provider value={{ user, loading, role }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
