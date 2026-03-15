'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import HardBreak from '@tiptap/extension-hard-break'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'

export interface RichTextEditorProps {
    content: string
    onChange: (html: string) => void
    placeholder?: string
    className?: string
    autoFocus?: boolean
    /** @deprecated use onEditorReady + floating toolbar in parent instead */
    showToolbar?: boolean
    /** Called once the TipTap editor instance is ready (or destroyed). Use this to drive an external toolbar. */
    onEditorReady?: (editor: Editor | null) => void
}

export function RichTextEditor({ content, onChange, placeholder, className, autoFocus, onEditorReady }: RichTextEditorProps) {
    const hasAutoFocused = useRef(false)
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
            HardBreak.extend({
                addKeyboardShortcuts() {
                    return {
                        Enter: () => {
                            // Keep list behavior native; elsewhere Enter should be a single line break.
                            if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList')) {
                                return false
                            }
                            return this.editor.commands.setHardBreak()
                        },
                    }
                },
            }),
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
                    '[&_p]:mt-0 [&_p]:mb-3 [&_p:last-child]:mb-0',
                    className
                ),
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        immediatelyRender: false,
    })

    // Notify parent when editor instance becomes available or is destroyed
    useEffect(() => {
        onEditorReady?.(editor ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    // Set initial focus once when the editor first mounts — NOT on every re-render.
    // Using a ref guard prevents focus from being stolen back to the editor when the
    // user types in sibling input fields (To / Subject / CC) that trigger a parent re-render.
    useEffect(() => {
        if (autoFocus && editor && !hasAutoFocused.current) {
            hasAutoFocused.current = true
            setTimeout(() => editor.commands.focus('end'), 0)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    // Sync external content changes into TipTap (e.g. when AI content is accepted)
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content, { emitUpdate: false })
        }
    }, [content, editor])

    if (!editor) {
        return null
    }

    return (
        <div className="relative flex-1 cursor-text w-full">
            {!editor.isFocused && (!editor.getText().trim() && !editor.isActive('image')) && (
                <div className="absolute top-0 left-0 text-zinc-600 pointer-events-none select-none text-sm px-[1px]">
                    {placeholder || 'Write your message...'}
                </div>
            )}
            <EditorContent editor={editor} className="w-full text-zinc-300" />
        </div>
    )
}
