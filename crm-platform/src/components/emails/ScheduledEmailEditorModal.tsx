'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { Loader2, Save, Clock3, Send, Ban, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { cn } from '@/lib/utils'
import type { Email } from '@/hooks/useEmails'
import { RichTextEditor } from './RichTextEditor'
import type { Editor } from '@tiptap/react'

type Props = {
  email: Email | null
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (payload: { subject: string; html: string; text: string; scheduledSendTime: string }) => void
  onSendNow: () => void
  onCancel: () => void
}

export function ScheduledEmailEditorModal({ email, open, saving, onClose, onSave, onSendNow, onCancel }: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const editorRef = useRef<Editor | null>(null)
  const [, setEditorTick] = useState(0)

  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor
    if (editor) {
      editor.on('transaction', () => setEditorTick((t) => t + 1))
    }
  }, [])

  useEffect(() => {
    if (!email) return
    setSubject(email.subject || '')
    setBody(String(email.html || email.text || ''))
    const base = email.scheduledSendTime || email.sentAt || email.date
    const date = base ? new Date(base) : new Date(Date.now() + 60 * 60 * 1000)
    const pad = (value: number) => String(value).padStart(2, '0')
    setScheduledFor(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`)
  }, [email])

  const scheduledLabel = useMemo(() => {
    if (!scheduledFor) return ''
    const date = new Date(scheduledFor)
    if (Number.isNaN(date.getTime())) return ''
    return format(date, 'PPP p')
  }, [scheduledFor])

  if (typeof document === 'undefined' || !open || !email) return null

  return createPortal(
    <AnimatePresence>
      {open && email && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-zinc-950 nodal-monolith-edge shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Scheduled Email</div>
                <h3 className="text-lg font-semibold text-zinc-100">{email.subject || 'Untitled draft'}</h3>
              </div>
              <ForensicClose onClick={onClose} size={18} title="Close" />
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Subject</div>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-white/5 border-white/10 text-zinc-100" />
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="flex items-center gap-1 p-2 border-b border-white/10 bg-zinc-950/70">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleBold().run() }}
                      className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('bold') && 'bg-white/10 text-white')}
                      title="Bold"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleItalic().run() }}
                      className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('italic') && 'bg-white/10 text-white')}
                      title="Italic"
                    >
                      <Italic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleUnderline().run() }}
                      className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('underline') && 'bg-white/10 text-white')}
                      title="Underline"
                    >
                      <UnderlineIcon className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleBulletList().run() }}
                      className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('bulletList') && 'bg-white/10 text-white')}
                      title="Bullets"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleOrderedList().run() }}
                      className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('orderedList') && 'bg-white/10 text-white')}
                      title="Numbered list"
                    >
                      <ListOrdered className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="min-h-[360px] px-3 py-3">
                    <RichTextEditor
                      content={body}
                      onChange={setBody}
                      placeholder="Edit the email copy here"
                      className="min-h-[320px]"
                      onEditorReady={handleEditorReady}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Schedule</div>
                  <Input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="bg-zinc-950 border-white/10 text-zinc-100"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <Clock3 className="w-3.5 h-3.5 text-[#002FA7]" />
                    <span>{scheduledLabel || 'Pick a send time'}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-[11px] text-zinc-400">
                  <div className="font-mono uppercase tracking-wider text-zinc-500">Row options</div>
                  <div>Edit the copy, move the send time, send it immediately, or cancel it.</div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={() => onSave({ subject, html: body, text: body, scheduledSendTime: new Date(scheduledFor).toISOString() })}
                    disabled={saving}
                    className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save changes
                  </Button>
                  <Button onClick={onSendNow} variant="outline" className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10">
                    <Send className="w-4 h-4 mr-2" />
                    Send now
                  </Button>
                  <Button onClick={onCancel} variant="outline" className="border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10">
                    <Ban className="w-4 h-4 mr-2" />
                    Cancel schedule
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
