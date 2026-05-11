'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { X, Shield } from 'lucide-react'

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('nodal_cookie_consent')
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('nodal_cookie_consent', 'accepted')
    setIsVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem('nodal_cookie_consent', 'declined')
    setIsVisible(false)
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="fixed bottom-6 left-6 right-6 z-[100] flex justify-center pointer-events-none"
        >
          <div className="w-full max-w-2xl nodal-glass border border-zinc-800/50 p-6 rounded-2xl shadow-2xl pointer-events-auto flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-[#002FA7]">
                <Shield className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Forensic Privacy Notice</span>
              </div>
              <h3 className="text-sm font-semibold text-white">We use cookies to optimize your intelligence pipeline.</h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
                Nodal Point uses essential cookies for authentication and performance metrics. By accepting, you enable high-fidelity forensic data visualization and session persistence.
              </p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDecline}
                className="text-zinc-500 hover:text-zinc-300 text-xs font-medium"
              >
                Essential Only
              </Button>
              <Button 
                size="sm" 
                onClick={handleAccept}
                className="bg-[#002FA7] hover:bg-blue-700 text-white text-xs font-semibold px-6"
              >
                Accept All
              </Button>
            </div>

            <button 
              onClick={() => setIsVisible(false)}
              className="absolute top-4 right-4 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
