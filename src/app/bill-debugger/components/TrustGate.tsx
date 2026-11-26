import React from 'react'
import { buttonPrimary, focusOnLight, NudgeArrow } from '@/components/landing/ui'
import { StepBand } from './StepBand'

interface TrustGateProps {
    onNext: () => void
}

const HANDLING = [
    {
        title: 'We only read it',
        body: 'We only look at the bill you upload. We do not contact your supplier or change your account.',
    },
    {
        title: 'It stays private',
        body: 'Your file is used for the review and for follow-up with you. It is handled with the same care as the report itself.',
    },
    {
        title: 'It is stored securely',
        body: 'The file is protected while it is uploaded and while it is stored, so the review stays private.',
    },
]

export function TrustGate({ onNext }: TrustGateProps) {
    return (
        <>
            <StepBand
                title="How we handle your bill"
                lead="We review the file you send, separate the charges, and show you the parts that matter. No supplier calls. No changes to your account during the review."
            />

            <section className="bg-white px-6 py-12 lg:px-10 lg:py-16">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl">
                        <dl className="border-t border-zinc-200">
                            {HANDLING.map((item) => (
                                <div
                                    key={item.title}
                                    className="grid gap-1 border-b border-zinc-200 py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8"
                                >
                                    <dt className="text-lg font-semibold tracking-[-0.01em] text-zinc-950">{item.title}</dt>
                                    <dd className="text-base leading-7 text-zinc-600">{item.body}</dd>
                                </div>
                            ))}
                        </dl>

                        <p className="mt-8 text-base leading-7 text-zinc-600">
                            Upload your bill. We pull out demand charges (charges based on your highest
                            usage), delivery costs and contract dates, then show you the main issue.
                        </p>

                        <button type="button" onClick={onNext} className={`${buttonPrimary} ${focusOnLight} mt-8`}>
                            Continue to upload
                            <NudgeArrow />
                        </button>
                        <p className="mt-4 text-sm text-zinc-500">Usually under 60 seconds. No commitment required.</p>
                    </div>
                </div>
            </section>
        </>
    )
}
