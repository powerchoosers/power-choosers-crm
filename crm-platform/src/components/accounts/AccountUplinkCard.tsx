'use client'

import React, { useState } from 'react'
import { Phone, Globe, MapPin, Building2, ArrowUpRight, Sparkles, Star, Satellite } from 'lucide-react'
import { Account } from '@/hooks/useAccounts'
import { useCallStore } from '@/store/callStore'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { domainToClickableUrl } from '@/lib/url'

interface AccountUplinkCardProps {
  account: Account
  isEditing?: boolean
  onUpdate?: (updates: Partial<Account>) => void
}

export const AccountUplinkCard: React.FC<AccountUplinkCardProps> = ({ account, isEditing, onUpdate }) => {
  const initiateCall = useCallStore((state) => state.initiateCall)
  const [isSearching, setIsSearching] = useState(false)
  const [justUpdated, setJustUpdated] = useState(false)

  const handleCallClick = () => {
    if (!account.companyPhone || isEditing) return
    initiateCall(account.companyPhone, { 
      name: account.name,
      account: account.name,
      logoUrl: account.logoUrl,
      domain: account.domain,
      industry: account.industry,
      description: account.description,
      location: account.location || account.city,
      annualUsage: account.annualUsage,
      supplier: account.electricitySupplier,
      currentRate: account.currentRate,
      contractEnd: account.contractEnd,
      isAccountOnly: true,
      accountId: account.id
    })
  }

  const handleAddressSearch = async () => {
    if (isSearching || isEditing || account.address) return

    setIsSearching(true)
    try {
      // Build search query: Company name + city + state for better results
      let searchQuery = account.name
      
      // Add location context if available
      if (account.city || account.state) {
        const locationParts = [account.city, account.state].filter(Boolean)
        searchQuery = `${account.name} ${locationParts.join(' ')}`
      }
      
      toast.info('Initiating Satellite Scan...', { description: `Searching for ${account.name}` })
      
      // Search for the address using the Maps API with enhanced query
      const searchRes = await fetch(`/api/maps/search?q=${encodeURIComponent(searchQuery)}`)
      const searchData = await searchRes.json()
      
      if (searchData.found && searchData.address) {
        // Update the database
        const { error } = await supabase
          .from('accounts')
          .update({ address: searchData.address })
          .eq('id', account.id)
          
        if (!error) {
          // Trigger the animation
          setJustUpdated(true)
          setTimeout(() => setJustUpdated(false), 2000)
          
          // Update local state
          onUpdate?.({ address: searchData.address })
          
          toast.success('Asset Intelligence Acquired', {
            description: `Location coordinates synced`
          })
          
          // Open the map with the found address
          setTimeout(() => {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchData.address)}`, '_blank')
          }, 500)
        } else {
          console.error('Sync failed:', error)
          toast.error('Sync Failed', { description: 'Could not update location data' })
        }
      } else {
        toast.error('Target Not Found', { description: 'Satellite sweep returned no coordinates.' })
      }
    } catch (err) {
      console.error('Address search failed:', err)
      toast.error('Uplink Failed', { description: 'Signal interference detected.' })
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className={`rounded-2xl border transition-all duration-500 bg-zinc-900/30 backdrop-blur-xl p-6 relative overflow-hidden shadow-lg ${isEditing ? 'border-[#002FA7]/30 ring-1 ring-[#002FA7]/20' : 'border-white/10'}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Uplinks</h3>
        {isEditing && <Sparkles className="w-3 h-3 text-white animate-pulse" />}
      </div>

      <div className="space-y-4 relative z-10">
        {/* Phone (Primary Style) */}
        {isEditing ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="px-2">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Voice Channels</span>
            </div>
            <div className="group relative">
              <div className="flex items-center gap-2 mb-1 px-2">
                <Phone className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Corporate Phone</span>
              </div>
              <input
                type="text"
                value={account.companyPhone || ''}
                onChange={(e) => onUpdate?.({ companyPhone: formatPhoneNumber(e.target.value) })}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                placeholder="+1 (000) 000-0000"
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full group flex items-center justify-between p-4 bg-[#002FA7]/90 hover:bg-[#002FA7] rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)] hover:-translate-y-0.5"
            onClick={handleCallClick}
            disabled={!account.companyPhone}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <Phone className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
                <Star className="w-2 h-2 fill-yellow-500 text-yellow-500 absolute -top-1 -right-1" />
              </div>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">Corporate Phone (Primary)</span>
                <span className="font-mono tabular-nums text-[13px] tracking-tight text-white group-hover:text-white truncate w-full text-left">
                  {account.companyPhone || 'No phone'}
                </span>
              </div>
            </div>
            <ArrowUpRight className="w-3 h-3 text-white/50 group-hover:text-white transition-colors shrink-0" />
          </button>
        )}

        {/* Website & Address (Nodal Glass Style) */}
        {isEditing ? (
          <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="px-2">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Digital Infrastructure</span>
            </div>
            
            {/* Domain */}
            <div className="group relative">
              <div className="flex items-center gap-2 mb-1 px-2">
                <Globe className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Digital Domain</span>
              </div>
              <input
                type="text"
                value={account.domain || ''}
                onChange={(e) => onUpdate?.({ domain: e.target.value })}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                placeholder="domain.com"
              />
            </div>

            {/* Address */}
            <div className="group relative">
              <div className="flex items-center gap-2 mb-1 px-2">
                <MapPin className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Asset Recon (Location)</span>
              </div>
              <input
                type="text"
                value={account.address || ''}
                onChange={(e) => onUpdate?.({ address: e.target.value })}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                placeholder="Full Address"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              className="w-full group flex items-center justify-between p-3 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5"
              onClick={() => { const url = domainToClickableUrl(account.domain); url && window.open(url, '_blank') }}
              disabled={!account.domain}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Globe className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">Digital Domain</span>
                  <span className="font-mono text-xs tracking-tight text-zinc-400 group-hover:text-zinc-200 truncate w-full text-left">
                    {account.domain || 'No domain'}
                  </span>
                </div>
              </div>
              <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
            </button>

            <button
              type="button"
              className={cn(
                "w-full group flex items-center justify-between p-3 nodal-glass rounded-xl transition-all border",
                account.address 
                  ? "nodal-glass-hover border-white/5" 
                  : "border-[#4D88FF]/30 hover:border-[#4D88FF]/50 hover:bg-[#4D88FF]/10 cursor-pointer",
                justUpdated && "animate-in fade-in slide-in-from-right-4 duration-500 border-green-500/50 bg-green-500/10"
              )}
              onClick={() => {
                if (account.address) {
                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.address)}`, '_blank')
                } else {
                  handleAddressSearch()
                }
              }}
              disabled={isSearching}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isSearching ? (
                  <Satellite className="w-4 h-4 text-[#4D88FF] animate-pulse shrink-0" />
                ) : (
                  <MapPin className={cn(
                    "w-4 h-4 transition-colors shrink-0",
                    account.address 
                      ? "text-zinc-500 group-hover:text-zinc-300" 
                      : "text-[#4D88FF] group-hover:text-[#4D88FF]",
                    justUpdated && "text-green-500"
                  )} />
                )}
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">Asset Recon (Location)</span>
                  <span className={cn(
                    "text-xs tracking-tight truncate w-full text-left transition-all",
                    account.address 
                      ? "text-zinc-400 group-hover:text-zinc-200" 
                      : "text-[#4D88FF] group-hover:text-white font-mono",
                    isSearching && "animate-pulse",
                    justUpdated && "text-green-400 font-semibold"
                  )}>
                    {isSearching ? 'Scanning satellite...' : account.address || 'Search location'}
                  </span>
                </div>
              </div>
              {account.address ? (
                <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
              ) : (
                <Satellite className={cn(
                  "w-3 h-3 transition-colors shrink-0",
                  isSearching ? "text-[#4D88FF] animate-spin" : "text-[#4D88FF] group-hover:text-white"
                )} />
              )}
            </button>
          </div>
        )}

        {/* Zone Identifier (Nodal Glass Style) */}
        <div className="w-full group flex items-center justify-between p-3 nodal-glass rounded-xl border border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="w-4 h-4 text-zinc-500 shrink-0" />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">Zone Identifier</span>
              <span className="font-mono text-[10px] text-[#002FA7] bg-[#002FA7]/5 border border-[#002FA7]/10 px-2 py-0.5 rounded uppercase tracking-widest mt-0.5 truncate max-w-full">
                {account.loadZone || 'LZ_NORTH'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
