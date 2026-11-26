import type { ReactNode } from 'react'
import { PageHero } from '@/components/landing/PageHero'
import { PublicShell } from '@/components/landing/PublicShell'
import { TextLink } from '@/components/landing/ui'

export type LegalSection = { id: string; title: string; content: ReactNode }

/** Shared layout for the privacy policy and terms of service. */
export function LegalPage({
  title,
  lead,
  effective,
  sections,
  note,
  related,
}: {
  title: string
  lead: string
  effective: string
  sections: LegalSection[]
  note: ReactNode
  related: { label: string; href: string }[]
}) {
  return (
    <PublicShell>
      <PageHero title={title} lead={lead}>
        <p className="text-sm leading-6 text-zinc-400">
          Effective {effective}. Governed by the laws of Texas, United States.
        </p>
      </PageHero>

      <section className="bg-white px-6 py-16 lg:px-10 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-20">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-sm font-medium text-zinc-950">On this page</p>
              <ul className="mt-4 space-y-3 border-l border-zinc-200">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l border-transparent pl-4 text-sm text-zinc-600 transition-colors duration-200 hover:border-[#002FA7] hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7]"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="max-w-2xl">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-b border-zinc-200 py-10 first:pt-0">
                <h2 className="np-display text-3xl text-zinc-950 md:text-4xl">{section.title}</h2>
                <div className="mt-5 text-base leading-7 text-zinc-600 [&_a]:font-medium [&_a]:text-[#002FA7] [&_a]:underline [&_a]:decoration-[#002FA7]/30 [&_a]:underline-offset-4 hover:[&_a]:decoration-[#002FA7] [&_li]:pl-1 [&_p+p]:mt-4 [&_p+ul]:mt-3 [&_strong]:font-semibold [&_strong]:text-zinc-950 [&_ul+p]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.content}
                </div>
              </section>
            ))}

            <div className="pt-10 text-sm leading-6 text-zinc-500 [&_a]:font-medium [&_a]:text-[#002FA7] [&_a]:underline [&_a]:underline-offset-4">
              {note}
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {related.map((link) => (
                <TextLink key={link.href} href={link.href}>
                  {link.label}
                </TextLink>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
