'use client'

import { useState, useEffect } from 'react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { Plus, Zap, FileText, Activity, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function FoundryPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const { data, error } = await supabase
          .from('transmission_assets')
          .select('*')
          .order('updated_at', { ascending: false })
        
        if (error) {
          console.error('Error fetching assets:', error)
        } else {
          setAssets(data || [])
        }
      } catch (err) {
        console.error('Unexpected error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAssets()
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="FOUNDRY"
        description="Engineer high-fidelity intelligence assets for automated deployment."
        globalFilter={searchQuery}
        onSearchChange={setSearchQuery}
        primaryAction={{
          label: "Forge New Asset",
          onClick: () => router.push('/network/foundry/new'),
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto np-scroll">
          <Table>
            <TableHeader className="sticky top-0 z-20 border-b border-white/5 nodal-recessed">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Asset Name</TableHead>
                <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Classification</TableHead>
                <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Last Modified</TableHead>
                <TableHead className="text-right text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow 
                  key={asset.id} 
                  className="border-white/5 hover:bg-white/[0.02] cursor-pointer group"
                  onClick={() => router.push(`/network/foundry/${asset.id}`)}
                >
                  <TableCell className="font-medium text-zinc-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[10px] bg-zinc-900 border border-white/5 flex items-center justify-center">
                        <Zap size={14} className="text-[#002FA7]" />
                      </div>
                      <span>{asset.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-white/10 bg-black/20 text-zinc-400 font-mono text-[10px] uppercase tracking-tighter">
                      {asset.type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 font-mono text-xs">
                    {new Date(asset.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white hover:bg-white/5">
                      Open_Asset
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex-none border-t border-white/5 nodal-recessed p-4">
          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            <span>Sync_Block 01–02</span>
            <div className="h-1 w-1 rounded-full bg-black/40" />
            <span className="text-zinc-500">Active_Foundry_Assets: <span className="text-zinc-400 tabular-nums">{assets.length}</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
