'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { flexRender, Header } from '@tanstack/react-table'
import { TableHead } from '@/components/ui/table'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraggableTableHeaderProps {
    header: Header<any, unknown>
}

export function DraggableTableHeader({ header }: DraggableTableHeaderProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: header.id,
    })

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
        position: 'relative',
    }

    return (
        <TableHead
            ref={setNodeRef}
            style={style}
            className={cn(
                "text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3 relative group select-none",
                isDragging && "bg-zinc-900 border-x border-[#002FA7]/30"
            )}
        >
            <div className="flex items-center gap-2">
                {/* Grab Handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-400"
                    title="Drag to reorder"
                >
                    <GripVertical className="w-3 h-3" />
                </button>

                <div className="flex-1">
                    {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
            </div>

            {/* Drop indicator/spacer could go here if needed, but sortable handle usually handles it */}
        </TableHead>
    )
}
