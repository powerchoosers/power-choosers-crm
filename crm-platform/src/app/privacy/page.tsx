import Link from 'next/link'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

export const metadata = {
  title: 'Privacy Policy — Nodal Point',
  description: 'How Nodal Point collects, uses, and protects your data.',
}

const SECTIONS = [
  {
    id: 'what-we-collect',
    number: '01',
    title: 'What We Collect',
    content: (
      <>
        <p>When you use the Bill Debugger or contact us, we may collect:</p>
        <ul>
          <li><strong>Email address</strong> — used to send your report and follow up with you.</li>
          <li><strong>Energy bill files</strong> — PDFs or images you upload so we can review the account and charges.</li>
          <li><strong>Usage data</strong> — basic page and product activity that helps us keep the site working and improve it.</li>
        </ul>
        <p>We do not collect payment card numbers, social security numbers, or government IDs.</p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    number: '02',
    title: 'How We Use It',
    content: (
      <>
        <p>Your data is used to:</p>
        <ul>
          <li>Review your bill and generate a report.</li>
          <li>Send the report to you and respond to your questions.</li>
          <li>Improve the product and fix problems.</li>
        </ul>
        <p>We do not sell your data or use it for advertising. We do not share it with suppliers or brokers unless you ask us to.</p>
      </>
    ),
  },
  {
    id: 'retention',
    number: '03',
    title: 'How Long We Keep It',
    content: (
      <>
        <p>We keep data only as long as we need it:</p>
        <ul>
          <li><strong>Bill sessions:</strong> Uploaded files and session data are deleted after 72 hours if you do not continue with us.</li>
          <li><strong>Active clients:</strong> If you become a client, we may keep related records for the length of the engagement and for our business records.</li>
          <li><strong>Email addresses:</strong> Kept until you ask us to delete them.</li>
        </ul>
        <p>To request deletion of your data at any time, email us at <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a>.</p>
      </>
    ),
  },
  {
    id: 'security',
    number: '04',
    title: 'Security',
    content: (
      <>
        <p>We use encrypted connections and store data in controlled systems. Access is limited to people who need it to do their job.</p>
        <p>No system is perfectly secure. If you think something is wrong, email <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a> and we will review it within 48 hours.</p>
      </>
    ),
  },
  {
    id: 'third-parties',
    number: '05',
    title: 'Third-Party Services',
    content: (
      <>
        <p>We use the following third-party services to operate the platform:</p>
        <ul>
          <li><strong>Supabase</strong> — database and authentication infrastructure.</li>
          <li><strong>Zoho Mail</strong> — transactional email delivery.</li>
          <li><strong>Google (Gemini API)</strong> — AI-assisted analysis processing.</li>
          <li><strong>Vercel</strong> — application hosting and edge delivery.</li>
        </ul>
        <p>Each provider has its own privacy policy and data processing terms. We do not let them use your data for their own purposes.</p>
      </>
    ),
  },
  {
    id: 'your-rights',
    number: '06',
    title: 'Your Rights',
    content: (
      <>
        <p>You have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your data at any time.</li>
          <li>Opt out of all communications at any time by replying STOP to any email.</li>
        </ul>
        <p>To exercise any of these rights, contact us at <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a>. We will respond within 10 business days.</p>
      </>
    ),
  },
]

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p className="text-zinc-500 text-lg leading-relaxed max-w-2xl">
            We built Nodal Point so businesses can review energy bills without guessing. This policy explains what we collect, why we collect it, and how you can control it.
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
            This policy may be updated periodically. Material changes will be communicated via email to registered users. Continued use of the platform after changes constitutes acceptance.
          </p>
          <div className="mt-6 flex gap-6 text-sm">
            <Link href="/terms" className="text-[#002FA7] hover:underline">Terms of Service</Link>
            <Link href="/contact" className="text-[#002FA7] hover:underline">Contact Us</Link>
          </div>
        </div>

      </main>

      <LandingFooter />
    </div>
  )
}
