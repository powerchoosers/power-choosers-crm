'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    ImageIcon,
    Palette
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface RichTextEditorProps {
    content: string
    onChange: (html: string) => void
    placeholder?: string
    className?: string
    autoFocus?: boolean
}

const COLORS = [
    '#FAFAFA', '#A1A1AA', '#EF4444', '#F97316', '#F59E0B',
    '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
    '#002FA7' // Nodal Blue
]

export function RichTextEditor({ content, onChange, placeholder, className, autoFocus }: RichTextEditorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                bulletList: {
                    keepMarks: true,
                    keepAttributes: false,
                    HTMLAttributes: {
                        class: 'list-disc ml-4 space-y-1',
                    },
                },
                orderedList: {
                    keepMarks: true,
                    keepAttributes: false,
                    HTMLAttributes: {
                        class: 'list-decimal ml-4 space-y-1',
                    },
                },
            }),
            Underline,
            TextStyle,
            Color,
            Image.configure({
                inline: true,
                allowBase64: true,
                HTMLAttributes: {
                    class: 'max-w-full h-auto rounded-md my-2',
                },
            }),
        ],
        content,
        editorProps: {
            attributes: {
                class: cn(
                    'prose prose-invert prose-sm max-w-none w-full min-h-[150px] focus:outline-none font-sans leading-relaxed',
                    '[&_ul]:list-outside [&_ul]:ml-4 [&_ol]:list-outside [&_ol]:ml-4',
                    '[&_p]:m-0',
                    className
                ),
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        immediatelyRender: false, // Prevent hydration mismatch
    })

    // Set initial focus
    if (autoFocus && editor && !editor.isFocused) {
        setTimeout(() => editor.commands.focus('end'), 0)
    }

    // Update content strictly if it differs from external source and hasn't just been typed
    // TipTap usually handles its internal state, we just need to catch when `content` changes widely
    // We can use useEffect to track external content change
    useCallback(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, { emitUpdate: false })
        }
    }, [content, editor]) // Just defining logic inside editor config directly is safer


    const uploadImage = async (file: File) => {
        const toastId = toast.loading('Uploading image...')
        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) throw new Error('Failed to upload image')

            const data = await response.json()

            if (editor && data.url) {
                editor.chain().focus().setImage({ src: data.url }).run()
            }

            toast.success('Image uploaded', { id: toastId })
        } catch (error) {
            toast.error('Failed to upload image', { id: toastId })
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            uploadImage(file)
        }
        // reset
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    if (!editor) {
        return null
    }

    return (
        <div className="flex flex-col w-full h-full relative">
            {/* Editor Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-1 mb-2 rounded-lg border border-white/5 bg-zinc-950/50 backdrop-blur-sm">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors",
                        editor.isActive('bold') && "bg-white/10 text-white"
                    )}
                    title="Bold"
                >
                    <Bold className="w-4 h-4" />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors",
                        editor.isActive('italic') && "bg-white/10 text-white"
                    )}
                    title="Italic"
                >
                    <Italic className="w-4 h-4" />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors",
                        editor.isActive('underline') && "bg-white/10 text-white"
                    )}
                    title="Underline"
                >
                    <UnderlineIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors",
                        editor.isActive('bulletList') && "bg-white/10 text-white"
                    )}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={cn(
                        "p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors",
                        editor.isActive('orderedList') && "bg-white/10 text-white"
                    )}
                    title="Numbered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors flex items-center gap-1"
                            title="Text Color"
                        >
                            <Palette className="w-4 h-4" />
                            <div
                                className="w-3 h-3 rounded-full border border-white/20"
                                style={{ backgroundColor: editor.getAttributes('textStyle').color || 'transparent' }}
                            />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2 bg-zinc-950 border-white/10 nodal-monolith-edge z-[200]" align="start">
                        <div className="grid grid-cols-6 gap-1.5">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={cn(
                                        "w-6 h-6 rounded-md hover:scale-110 transition-transform flex items-center justify-center",
                                        editor.getAttributes('textStyle').color === color && "ring-2 ring-white/50"
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => editor.chain().focus().setColor(color).run()}
                                />
                            ))}
                            <button
                                className="col-span-6 mt-1 text-[10px] text-zinc-400 hover:text-white transition-colors py-1"
                                onClick={() => editor.chain().focus().unsetColor().run()}
                            >
                                Reset Color
                            </button>
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors"
                    title="Insert Image"
                >
                    <ImageIcon className="w-4 h-4" />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                />
            </div>

            <div className="relative flex-1 cursor-text w-full">
                {!editor.isFocused && (!editor.getText().trim() && !editor.isActive('image')) && (
                    <div className="absolute top-0 left-0 text-zinc-600 pointer-events-none select-none text-sm px-[1px]">
                        {placeholder || 'Write your message...'}
                    </div>
                )}
                <EditorContent editor={editor} className="w-full text-zinc-300 h-full max-h-[400px] overflow-y-auto np-scroll" />
            </div>
        </div>
    )
}
