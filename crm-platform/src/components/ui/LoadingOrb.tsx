'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LoadingOrbProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function LoadingOrb({ className, size = 'md', label }: LoadingOrbProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-16 w-16'
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-6", className)}>
      <div className="relative">
        {/* Main Glowing Orb */}
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className={cn(
            "rounded-full bg-[#002FA7] shadow-[0_0_40px_rgba(0,47,167,0.6)]",
            sizeClasses[size]
          )}
        />
        
        {/* Outer Pulsing Ring */}
        <motion.div
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className={cn(
            "absolute inset-0 rounded-full border-2 border-[#002FA7]",
            sizeClasses[size]
          )}
        />

        {/* Inner Core */}
        <div className={cn(
          "absolute inset-0 m-auto rounded-full bg-white opacity-40 blur-[1px]",
          size === 'lg' ? 'h-4 w-4' : size === 'md' ? 'h-2 w-2' : 'h-1 w-1'
        )} />
      </div>

      {label && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] ml-[0.3em]"
        >
          {label}
        </motion.div>
      )}
    </div>
  )
}
