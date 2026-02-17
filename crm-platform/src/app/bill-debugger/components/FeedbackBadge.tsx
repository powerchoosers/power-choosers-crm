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
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            text: "text-emerald-400",
            icon: CheckCircle
        },
        yellow: {
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            text: "text-amber-400",
            icon: AlertTriangle
        },
        red: {
            bg: "bg-red-500/10",
            border: "border-red-500/20",
            text: "text-red-400",
            icon: AlertOctagon
        }
    }

    const style = colors[status]
    const Icon = style.icon

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${style.bg} ${style.border} backdrop-blur-sm`}
        >
            <Icon className={`w-4 h-4 ${style.text}`} />
            <span className={`text-xs font-medium uppercase tracking-wide ${style.text}`}>
                {title}
            </span>
        </motion.div>
    )
}
