import React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react'
import { FeedbackStatus } from '../utils/feedbackLogic'

interface FeedbackBadgeProps {
    status: FeedbackStatus
    title: string
    isLarge: boolean
}

export function FeedbackBadge({ status, title, isLarge }: FeedbackBadgeProps) {

    // Size-aware color logic
    const colors = {
        green: {
            bg: "bg-emerald-50",
            border: "border-emerald-200",
            text: "text-emerald-700",
            icon: CheckCircle
        },
        yellow: {
            bg: "bg-amber-50",
            border: "border-amber-200",
            text: "text-amber-700",
            icon: AlertTriangle
        },
        red: {
            bg: "bg-rose-50",
            border: "border-rose-200",
            text: "text-rose-700",
            icon: AlertOctagon
        }
    }

    const style = colors[status]
    const Icon = style.icon

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm ${style.bg} ${style.border} backdrop-blur-md`}
        >
            <Icon className={`w-4 h-4 ${style.text}`} />
            <span className={`text-xs font-medium uppercase tracking-wide ${style.text}`}>
                {title}
            </span>
        </motion.div>
    )
}
