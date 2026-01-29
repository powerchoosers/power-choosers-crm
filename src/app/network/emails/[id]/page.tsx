'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEmail } from '@/hooks/useEmail'
import { Button } from "@/components/ui/button"
import { ArrowLeft, Reply, Trash2, MoreHorizontal, Printer, Star } from 'lucide-react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ComposeModal } from '@/components/emails/ComposeModal'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function EmailDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { data: email, isLoading } = useEmail(id)
  const [isComposeOpen, setIsComposeOpen] = useState(false)

  const handleBack = () => {
    router.back()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <LoadingOrb label="Loading email..." />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <p className="text-zinc-500">Email not found</p>
        <Button onClick={handleBack} variant="outline">Go Back</Button>
      </div>
    )
  }

  const parseMailbox = (value: string) => {
    const v = String(value || '').trim()
    const angleMatch = v.match(/^(.*)<\s*([^>]+)\s*>\s*$/)
    if (angleMatch) {
      const name = angleMatch[1].trim().replace(/^"|"$/g, '')
      const address = angleMatch[2].trim()
      return { name: name || null, address: address || null }
    }
    return { name: null, address: v || null }
  }

  const fromMailbox = parseMailbox(email.from)
  const displayFromName = (email.type === 'sent' ? (email.fromName || null) : fromMailbox.name) || email.from
  const displayFromAddress = (email.type === 'sent' ? email.from : fromMailbox.address) || null
  const replyToAddress = email.type === 'received' ? (fromMailbox.address || '') : ''

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Actions */}
      <div className="flex items-center justify-between nodal-glass p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-zinc-400 hover:text-white hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="h-6 w-px bg-white/10 mx-2" />
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
            <Star className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
            <Printer className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 nodal-glass rounded-2xl overflow-hidden flex flex-col relative">
        <div className="flex-none p-8 border-b border-white/5 space-y-6 bg-transparent">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold text-white tracking-tighter leading-tight">{email.subject}</h1>
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400 ring-1 ring-inset ring-white/10">
                    {email.type === 'sent' ? 'Sent' : 'Inbox'}
                </span>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12 border border-white/10">
                <AvatarFallback className="bg-indigo-500/10 text-indigo-400 text-lg">
                  {email.from?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-baseline gap-2">
                    <span className="font-medium text-white text-lg">{displayFromName}</span>
                    {displayFromAddress ? (
                      <span className="text-sm text-zinc-500">&lt;{displayFromAddress}&gt;</span>
                    ) : null}
                </div>
                <div className="text-sm text-zinc-400">
                  To: <span className="text-zinc-300">{Array.isArray(email.to) ? email.to.join(', ') : email.to}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-zinc-300">
                {format(new Date(email.date), 'MMM d, yyyy, h:mm a')}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {format(new Date(email.date), 'PP')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white/0 np-scroll">
          {email.html ? (
            <div 
              className="prose prose-invert max-w-none text-zinc-300 prose-headings:text-zinc-100 prose-a:text-indigo-400 prose-strong:text-zinc-100 prose-code:text-indigo-300"
              dangerouslySetInnerHTML={{ __html: email.html }}
            />
          ) : (
            <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
              {email.text || email.snippet || 'No content'}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5 bg-zinc-900/80 backdrop-blur-sm">
            <Button 
                onClick={() => setIsComposeOpen(true)}
                className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
            >
                <Reply className="w-4 h-4 mr-2" />
                Reply
            </Button>
        </div>
      </div>

      <ComposeModal 
        isOpen={isComposeOpen} 
        onClose={() => setIsComposeOpen(false)} 
        to={replyToAddress}
        subject={`Re: ${email.subject}`}
      />
    </div>
  )
}
