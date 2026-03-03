import Link from 'next/link'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

export const metadata = {
  title: 'Terms of Service — Nodal Point',
  description: 'Terms governing use of the Nodal Point platform and services.',
}

const SECTIONS = [
  {
    id: 'acceptance',
    number: '01',
    title: 'Acceptance of Terms',
    content: (
      <>
        <p>By accessing nodalpoint.io or using any Nodal Point service — including the Bill Debugger, forensic analysis reports, or consultation services — you agree to be bound by these Terms of Service.</p>
        <p>If you do not agree to these terms, do not use the platform. These terms apply to all visitors, users, and clients.</p>
      </>
    ),
  },
  {
    id: 'services',
    number: '02',
    title: 'Description of Services',
    content: (
      <>
        <p>Nodal Point provides commercial energy forensics and advisory services, including:</p>
        <ul>
          <li><strong>Bill Debugger</strong> — an automated tool that analyzes your energy bill against supplier tariffs to identify cost leakage.</li>
          <li><strong>Forensic Analysis Reports</strong> — detailed written analysis of your energy load profile, demand charges, and contract structure.</li>
          <li><strong>Advisory Consultations</strong> — direct engagement with Nodal Point analysts to develop an energy cost reduction strategy.</li>
        </ul>
        <p>All analysis is based solely on information you provide. We are an advisory and analytical service — we do not act as your energy supplier, utility provider, or legal representative.</p>
      </>
    ),
  },
  {
    id: 'not-financial-advice',
    number: '03',
    title: 'Not Financial or Legal Advice',
    content: (
      <>
        <p>The analysis, reports, and recommendations provided by Nodal Point are informational in nature. Nothing in our services constitutes financial, legal, tax, or investment advice.</p>
        <p>Energy market conditions are complex and subject to change. Historical performance of tariff structures does not guarantee future outcomes. You are responsible for independently verifying any recommendations before making energy procurement decisions.</p>
        <p>We strongly recommend consulting qualified legal and financial advisors before signing any energy contract.</p>
      </>
    ),
  },
  {
    id: 'your-responsibilities',
    number: '04',
    title: 'Your Responsibilities',
    content: (
      <>
        <p>When using Nodal Point services, you agree to:</p>
        <ul>
          <li>Provide accurate and complete information about your energy usage and current contracts.</li>
          <li>Use the platform only for lawful purposes relating to your own energy accounts or accounts you are authorized to manage.</li>
          <li>Not attempt to reverse-engineer, scrape, or circumvent any part of the platform.</li>
          <li>Not upload malicious files or attempt to compromise platform security.</li>
          <li>Keep your account credentials confidential and notify us immediately of any unauthorized access.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'accuracy',
    number: '05',
    title: 'Accuracy of Analysis',
    content: (
      <>
        <p>Our tariff simulation engine is built on current ERCOT market data and supplier rate schedules. We maintain a 99.9% uptime and accuracy standard for our data sources.</p>
        <p>However, the accuracy of your specific analysis depends on the quality and completeness of the data you submit. Nodal Point is not liable for errors in analysis resulting from incomplete, illegible, or inaccurate bills or usage data provided by you or your utility.</p>
        <p>Tariff structures and utility rates change. Analysis reflects conditions at the time of generation and may not account for subsequent regulatory or market changes.</p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    number: '06',
    title: 'Intellectual Property',
    content: (
      <>
        <p>All content on nodalpoint.io — including the forensic methodology, analysis framework, software, design, and written content — is the intellectual property of Nodal Point and protected by applicable copyright and trade secret law.</p>
        <p>Your forensic reports are licensed to you for personal and internal business use only. You may not redistribute, resell, or publish them without written consent from Nodal Point.</p>
        <p>You retain full ownership of any data you submit to the platform.</p>
      </>
    ),
  },
  {
    id: 'limitation',
    number: '07',
    title: 'Limitation of Liability',
    content: (
      <>
        <p>To the maximum extent permitted by applicable law, Nodal Point and its principals are not liable for:</p>
        <ul>
          <li>Any indirect, incidental, or consequential damages arising from use of the platform.</li>
          <li>Energy procurement decisions made based on our analysis.</li>
          <li>Losses resulting from market changes after analysis delivery.</li>
          <li>Service interruptions, data loss, or security incidents outside our reasonable control.</li>
        </ul>
        <p>Our total liability to you for any claim arising from use of the platform shall not exceed the fees paid by you to Nodal Point in the three months preceding the claim.</p>
      </>
    ),
  },
  {
    id: 'termination',
    number: '08',
    title: 'Termination',
    content: (
      <>
        <p>We reserve the right to suspend or terminate access to the platform at any time for violations of these terms, suspected fraudulent activity, or for any other reason at our discretion.</p>
        <p>You may terminate your engagement with Nodal Point at any time by emailing <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a>. Upon termination, your data will be deleted in accordance with our Privacy Policy.</p>
      </>
    ),
  },
  {
    id: 'governing-law',
    number: '09',
    title: 'Governing Law',
    content: (
      <>
        <p>These Terms are governed by the laws of the State of Texas, United States, without regard to conflict of law principles. Any disputes arising from these terms shall be resolved in the courts of Tarrant County, Texas.</p>
        <p>If any provision of these Terms is found unenforceable, the remaining provisions will continue in full force and effect.</p>
      </>
    ),
  },
  {
    id: 'changes',
    number: '10',
    title: 'Changes to These Terms',
    content: (
      <>
        <p>We may update these Terms periodically. Material changes will be communicated to registered users via email at least 14 days before taking effect. Your continued use of the platform after changes take effect constitutes acceptance of the revised terms.</p>
        <p>The current effective date is always displayed at the top of this page.</p>
      </>
    ),
  },
]

export default function TermsOfService() {
  return (
    <div className="bg-[#F5F5F7] min-h-screen font-sans selection:bg-[#002FA7] selection:text-white">
      <LandingHeader />

      {/* BACKGROUND TEXTURE */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.05] pointer-events-none" />

      <main className="max-w-4xl mx-auto px-6 pt-36 md:pt-44 pb-32 relative z-10">

        {/* Page Header */}
        <div className="mb-16 border-b border-zinc-200 pb-12">
          <div className="text-xs font-mono text-[#002FA7] tracking-widest uppercase mb-4">Legal Document</div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-black mb-6">
            Terms of Service
          </h1>
          <p className="text-zinc-500 text-lg leading-relaxed max-w-2xl">
            These terms define the relationship between Nodal Point and the businesses that use our forensic energy analysis platform. Plain language where possible. No surprises.
          </p>
          <div className="mt-6 flex flex-wrap gap-6 text-sm font-mono text-zinc-400">
            <span>Effective: March 2026</span>
            <span>Jurisdiction: Texas, United States</span>
            <span>Contact: <a href="mailto:signal@nodalpoint.io" className="text-[#002FA7] hover:underline">signal@nodalpoint.io</a></span>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-16">
          {SECTIONS.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-32">
              <div className="flex items-baseline gap-4 mb-4">
                <span className="text-xs font-mono text-[#002FA7] tracking-widest">{section.number}</span>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-black">{section.title}</h2>
              </div>
              <div className="prose prose-zinc max-w-none text-zinc-600 leading-relaxed [&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-4 [&_a]:text-[#002FA7] [&_a]:underline [&_strong]:text-zinc-900">
                {section.content}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-20 pt-8 border-t border-zinc-200">
          <p className="text-sm text-zinc-400 font-mono">
            Questions about these terms? Contact us at <a href="mailto:signal@nodalpoint.io" className="text-[#002FA7] hover:underline">signal@nodalpoint.io</a> or call +1 (817) 809-3367.
          </p>
          <div className="mt-6 flex gap-6 text-sm">
            <Link href="/privacy" className="text-[#002FA7] hover:underline">Privacy Policy</Link>
            <Link href="/contact" className="text-[#002FA7] hover:underline">Contact Us</Link>
          </div>
        </div>

      </main>

      <LandingFooter />
    </div>
  )
}
