'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

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
        immediatelyRender: false,
    })

    // Notify parent when editor instance becomes available or is destroyed
    useEffect(() => {
        onEditorReady?.(editor ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    // Set initial focus
    if (autoFocus && editor && !editor.isFocused) {
        setTimeout(() => editor.commands.focus('end'), 0)
    }

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
