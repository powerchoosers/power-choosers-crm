'use client'

import React from 'react'
import { Phone, Globe, MapPin, Building2, ArrowUpRight } from 'lucide-react'
import { Account } from '@/hooks/useAccounts'
import { useCallStore } from '@/store/callStore'
import { cn } from '@/lib/utils'

interface AccountUplinkCardProps {
  account: Account
  isEditing?: boolean
  onUpdate?: (updates: Partial<Account>) => void
}

export const AccountUplinkCard: React.FC<AccountUplinkCardProps> = ({ account, isEditing, onUpdate }) => {
  const initiateCall = useCallStore((state) => state.initiateCall)

  const handleCallClick = () => {
    if (!account.companyPhone || isEditing) return
    initiateCall(account.companyPhone, { 
      name: account.name,
      account: account.name,
      logoUrl: account.logoUrl
    })
  }

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm space-y-6">
      <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-[0.2em]">Primary Uplink</h3>
      
      <div className="space-y-4">
        {/* Phone */}
        <div className="group flex items-center gap-4">
          <div className="p-2 rounded-lg bg-white/5 border border-white/5 group-hover:bg-[#002FA7]/10 group-hover:border-[#002FA7]/20 transition-all">
            <Phone className="w-4 h-4 text-zinc-400 group-hover:text-[#002FA7]" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Corporate Phone</div>
            {isEditing ? (
              <input
                type="text"
                value={account.companyPhone}
                onChange={(e) => onUpdate?.({ companyPhone: e.target.value })}
                className="w-full bg-transparent border-none outline-none text-white text-sm font-mono focus:ring-1 focus:ring-[#002FA7]/30 rounded"
              />
            ) : (
              <button 
                onClick={handleCallClick}
                className="text-sm font-mono text-white hover:text-[#002FA7] transition-colors tabular-nums"
              >
                {account.companyPhone || '--'}
              </button>
            )}
          </div>
        </div>

        {/* Website */}
        <div className="group flex items-center gap-4">
          <div className="p-2 rounded-lg bg-white/5 border border-white/5 group-hover:bg-[#002FA7]/10 group-hover:border-[#002FA7]/20 transition-all">
            <Globe className="w-4 h-4 text-zinc-400 group-hover:text-[#002FA7]" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Digital Domain</div>
            {isEditing ? (
              <input
                type="text"
                value={account.domain}
                onChange={(e) => onUpdate?.({ domain: e.target.value })}
                className="w-full bg-transparent border-none outline-none text-white text-sm font-mono focus:ring-1 focus:ring-[#002FA7]/30 rounded"
              />
            ) : (
              <a 
                href={account.domain ? `https://${account.domain}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-white hover:text-[#002FA7] transition-colors flex items-center gap-1"
              >
                {account.domain || '--'}
                <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100" />
              </a>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="group flex items-center gap-4">
          <div className="p-2 rounded-lg bg-white/5 border border-white/5 group-hover:bg-[#002FA7]/10 group-hover:border-[#002FA7]/20 transition-all">
            <MapPin className="w-4 h-4 text-zinc-400 group-hover:text-[#002FA7]" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Asset Recon (Location)</div>
            {isEditing ? (
              <input
                type="text"
                value={account.address}
                onChange={(e) => onUpdate?.({ address: e.target.value })}
                className="w-full bg-transparent border-none outline-none text-white text-sm font-sans focus:ring-1 focus:ring-[#002FA7]/30 rounded"
              />
            ) : (
              <div className="text-sm text-zinc-300">
                {account.address || '--'}
              </div>
            )}
          </div>
        </div>

        {/* Zone Identifier */}
        <div className="group flex items-center gap-4">
          <div className="p-2 rounded-lg bg-white/5 border border-white/5 group-hover:bg-[#002FA7]/10 group-hover:border-[#002FA7]/20 transition-all">
            <Building2 className="w-4 h-4 text-zinc-400 group-hover:text-[#002FA7]" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-0.5">Zone Identifier</div>
            <div className="text-sm font-mono text-[#002FA7] bg-[#002FA7]/5 border border-[#002FA7]/10 px-2 py-0.5 rounded-md inline-block">
              {account.loadZone || 'LZ_NORTH'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
