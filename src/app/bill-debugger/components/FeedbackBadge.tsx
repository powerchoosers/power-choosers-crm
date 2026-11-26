import React from 'react'
import { AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react'
import { FeedbackStatus } from '../utils/feedbackLogic'

interface FeedbackBadgeProps {
    status: FeedbackStatus
    title: string
    isLarge: boolean
}

/** One-line verdict for the bill. Colour carries meaning here: good, watch, or problem. */
export function FeedbackBadge({ status, title }: FeedbackBadgeProps) {
    const styles = {
        green: { text: 'text-emerald-700', icon: CheckCircle },
        yellow: { text: 'text-amber-700', icon: AlertTriangle },
        red: { text: 'text-red-700', icon: AlertOctagon },
    }

    const style = styles[status]
    const Icon = style.icon

    return (
        <p className={`flex items-start gap-2 text-base font-semibold ${style.text}`}>
            <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{title}</span>
        </p>
    )
}
