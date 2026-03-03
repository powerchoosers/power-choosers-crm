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
          <li><strong>Email address</strong> — required to deliver your analysis and follow up.</li>
          <li><strong>Energy bill files</strong> — PDFs or images you upload for forensic analysis. These are processed in a read-only, zero-touch environment and never shared with suppliers or third parties.</li>
          <li><strong>Usage data</strong> — anonymous page visits and interaction signals used to improve the product. No cross-site tracking.</li>
        </ul>
        <p>We do not collect payment information, social security numbers, or any government-issued identifiers.</p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    number: '02',
    title: 'How We Use It',
    content: (
      <>
        <p>Your data is used exclusively to:</p>
        <ul>
          <li>Run forensic analysis on your energy profile and deliver a report.</li>
          <li>Contact you with your results and, if relevant, a follow-up consultation offer.</li>
          <li>Improve the accuracy of our tariff simulation engine.</li>
        </ul>
        <p>We do not sell your data. We do not use it for advertising. We do not share it with energy suppliers or brokers without your explicit consent.</p>
      </>
    ),
  },
  {
    id: 'retention',
    number: '03',
    title: 'Data Retention',
    content: (
      <>
        <p>Bill Debugger sessions operate on an ephemeral logic model:</p>
        <ul>
          <li><strong>Inactive sessions:</strong> All uploaded files and session data are automatically deleted after 72 hours if no audit is initiated.</li>
          <li><strong>Active audits:</strong> If you proceed with a full engagement, your encrypted load profile is moved to a private Evidence Locker and retained for the duration of the analysis period.</li>
          <li><strong>Email addresses:</strong> Retained until you request deletion.</li>
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
        <p>All data is encrypted in transit (TLS) and at rest (AES-256) within SOC 2 compliant infrastructure. We use Supabase for database storage and SendGrid for transactional email — both operate under industry-standard security practices.</p>
        <p>No system is perfectly secure. If you discover a vulnerability, please report it to <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a> and we will respond within 48 hours.</p>
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
          <li><strong>SendGrid</strong> — transactional email delivery.</li>
          <li><strong>Google (Gemini API)</strong> — AI-assisted analysis processing.</li>
          <li><strong>Vercel</strong> — application hosting and edge delivery.</li>
        </ul>
        <p>Each provider operates under their own privacy policy and data processing agreements. We do not permit these providers to use your data for their own purposes.</p>
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
            We built Nodal Point on a forensics model — your data should be as protected as the evidence in an audit. This policy explains exactly what we collect, why, and how it stays safe.
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
