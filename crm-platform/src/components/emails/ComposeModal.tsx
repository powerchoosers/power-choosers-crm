import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEmails } from '@/hooks/useEmails'
import { Loader2, X, Paperclip, Sparkles, Minus, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ComposeModalProps {
  isOpen: boolean
  onClose: () => void
  to?: string
  subject?: string
}

function ComposePanel({
  initialTo,
  initialSubject,
  onClose,
}: {
  initialTo: string
  initialSubject: string
  onClose: () => void
}) {
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [content, setContent] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const { sendEmail, isSending } = useEmails()

  const handleSend = () => {
    if (!to || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    sendEmail(
      { to, subject, content },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "fixed bottom-0 right-4 sm:right-10 z-[100] w-full sm:w-[500px] bg-zinc-950 border border-white/10 rounded-t-xl shadow-2xl flex flex-col overflow-hidden",
        isMinimized ? "h-[60px]" : "h-[500px]"
      )}
    >
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/95 backdrop-blur-sm cursor-pointer hover:bg-zinc-900 transition-colors"
        onClick={() => isMinimized && setIsMinimized(false)}
      >
        <h3 className="text-lg font-semibold text-white">New Message</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(!isMinimized)
            }}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-red-500/20 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col flex-1 bg-zinc-950 transition-all duration-300",
          isMinimized ? "opacity-0 invisible" : "opacity-100 visible"
        )}
      >
        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <Input
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20"
            />
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-0 focus-visible:ring-0 focus-visible:border-white/20 font-medium"
            />
          </div>

          <div className="min-h-[150px] flex-1">
            <textarea
              placeholder="Write your message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full min-h-[150px] bg-transparent border-0 resize-none focus:outline-none text-zinc-300 placeholder:text-zinc-600 font-sans leading-relaxed"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/5">
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10">
              <Sparkles className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white hover:bg-white/5">
              Discard
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-white text-zinc-950 hover:bg-zinc-200 min-w-[100px]"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function ComposeModal({ isOpen, onClose, to: initialTo = '', subject: initialSubject = '' }: ComposeModalProps) {

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <ComposePanel initialTo={initialTo} initialSubject={initialSubject} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body
  )
}
