'use client'

import { useState } from 'react'
import { Search, Plus, FileText, ChevronRight } from 'lucide-react'
import { useScripts, Script } from '@/hooks/useScripts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function ScriptsPage() {
  const { data: scripts, isLoading } = useScripts()
  const [searchTerm, setSearchTerm] = useState('')

  const filteredScripts = scripts?.filter(script => 
    script.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    script.category.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Scripts</h1>
          <p className="text-sm text-zinc-400 mt-1">Access and manage your sales and support scripts.</p>
        </div>
        <Button className="bg-[#004eea] hover:bg-[#003bb0] text-white border-0">
          <Plus className="w-4 h-4 mr-2" />
          New Script
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search scripts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-zinc-900/50 border-white/10 text-zinc-200 focus:border-[#004eea] focus:ring-[#004eea]/20 placeholder:text-zinc-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
           Array.from({ length: 6 }).map((_, i) => (
             <Card key={i} className="bg-zinc-900/30 border-white/5 animate-pulse">
               <CardHeader className="h-24" />
               <CardContent className="h-20" />
             </Card>
           ))
        ) : filteredScripts?.length ? (
          filteredScripts.map((script) => (
            <Card key={script.id} className="bg-zinc-900/30 border-white/5 hover:bg-white/5 transition-all group cursor-pointer overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 mb-3 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className={cn(
                    "border-white/10 bg-white/5 text-zinc-400",
                    script.category === 'Sales' && "text-green-400 bg-green-500/10 border-green-500/20",
                    script.category === 'Objection Handling' && "text-red-400 bg-red-500/10 border-red-500/20",
                    script.category === 'Closing' && "text-purple-400 bg-purple-500/10 border-purple-500/20",
                  )}>
                    {script.category}
                  </Badge>
                </div>
                <CardTitle className="text-lg text-zinc-100 group-hover:text-white">{script.title}</CardTitle>
                <CardDescription className="text-zinc-500 text-xs mt-1">Updated {script.lastUpdated}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400 text-sm line-clamp-3 leading-relaxed">
                  {script.content}
                </p>
                <div className="mt-4 flex items-center text-xs text-[#004eea] font-medium opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                  View Script <ChevronRight className="w-3 h-3 ml-1" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-12 text-zinc-500">
            No scripts found matching your search.
          </div>
        )}
      </div>
    </div>
  )
}
