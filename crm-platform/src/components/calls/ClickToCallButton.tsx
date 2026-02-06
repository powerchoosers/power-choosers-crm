'use client'

import React from 'react'
import { Phone } from 'lucide-react'
import { useCallStore } from '@/store/callStore'
import { cn } from '@/lib/utils'

interface ClickToCallButtonProps {
  phoneNumber: string | null | undefined
  name?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
  variant?: 'ghost' | 'outline' | 'default' | 'secondary'
  size?: 'icon' | 'sm' | 'default' | 'lg'
  className?: string
  children?: React.ReactNode
  isCompany?: boolean
  contactId?: string
  accountId?: string
}

export const ClickToCallButton: React.FC<ClickToCallButtonProps> = ({
  phoneNumber,
  name,
  account,
  title,
  logoUrl,
  domain,
  variant = 'ghost',
  size = 'icon',
  className,
  children,
  isCompany = false,
  contactId,
  accountId
}) => {
  const initiateCall = useCallStore((state) => state.initiateCall)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!phoneNumber) return

    const metadata = isCompany 
      ? { 
          name: account || name,
          accountId,
          logoUrl,
          domain,
          isAccountOnly: true
        }
      : { 
          name, 
          account,
          title,
          logoUrl,
          domain,
          contactId,
          accountId
        }

    initiateCall(phoneNumber, metadata)
  }

  return (
    <button
      className={cn(
        "icon-button-forensic flex items-center justify-center",
        size === 'icon' ? "w-8 h-8" : "px-3 py-1.5 rounded-lg text-sm",
        className
      )}
      onClick={handleClick}
      disabled={!phoneNumber}
      title={phoneNumber ? `Call ${phoneNumber}` : 'No phone number'}
    >
      {children || <Phone className="h-4 w-4" />}
    </button>
  )
}
