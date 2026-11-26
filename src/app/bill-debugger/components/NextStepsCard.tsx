import React from 'react'
import { PrimaryLink } from '@/components/landing/ui'
import { Reveal } from '@/components/landing/Reveal'

interface NextStepsCardProps {
    email?: string;
}

/** Dark closing section of the full report. Runs into the footer. */
export function NextStepsCard({ email }: NextStepsCardProps) {
    return (
        <section
            data-header-tone="dark"
            className="relative isolate overflow-hidden bg-zinc-950 px-6 py-20 text-white lg:px-10 lg:py-28"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute -bottom-64 left-1/3 -z-10 h-[30rem] w-[44rem] rounded-full bg-[#002FA7]/35 blur-[150px]"
            />
            <Reveal className="mx-auto max-w-7xl">
                <h2 className="np-display max-w-3xl text-4xl sm:text-5xl lg:text-[4.25rem]">
                    Want us to walk through the report with you?
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-300">
                    If the report shows a real issue, we&apos;ll walk through the bill, answer questions,
                    and decide whether a quote or renewal review makes sense.
                </p>
                <div className="mt-9">
                    <PrimaryLink
                        href={`/book?${email ? `email=${encodeURIComponent(email)}&` : ''}from=%2Fbill-debugger`}
                        surface="dark"
                    >
                        Book a call
                    </PrimaryLink>
                </div>
                <p className="mt-5 text-sm text-zinc-400">
                    A private call, usually 30 minutes. No commitment required.
                </p>
            </Reveal>
        </section>
    )
}
