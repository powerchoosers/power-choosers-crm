import type { ReactNode } from 'react'

/** Shared ease for every transition on the bill review page. */
export const EASE = [0.23, 1, 0.32, 1] as const

/**
 * Compact dark band that opens every step after the upload step. It is shorter than
 * PageHero so the step's content stays above the fold, and it keeps the shared header
 * in its light-on-dark style when the step changes without a scroll.
 */
export function StepBand({
    title,
    lead,
    children,
}: {
    title: ReactNode
    lead?: ReactNode
    children?: ReactNode
}) {
    return (
        <section
            data-header-tone="dark"
            className="bg-zinc-950 px-6 pb-10 pt-28 text-white lg:px-10 lg:pb-14 lg:pt-32"
        >
            <div className="mx-auto max-w-7xl">
                <div className="max-w-3xl">
                    <h1 className="np-display text-4xl md:text-5xl">{title}</h1>
                    {lead ? <p className="mt-4 text-lg leading-8 text-zinc-300">{lead}</p> : null}
                    {children ? <div className="mt-6">{children}</div> : null}
                </div>
            </div>
        </section>
    )
}
