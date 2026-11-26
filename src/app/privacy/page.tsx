import { LegalPage } from '@/components/landing/LegalPage'

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
    <LegalPage
      title="Privacy policy"
      lead="We built Nodal Point so businesses can review energy bills without guessing. This policy explains what we collect, why we collect it, and how you can control it."
      effective="March 2026"
      sections={SECTIONS}
      note={
        <>
          <p>
            This policy may be updated periodically. Material changes will be communicated via email to registered users. Continued use of the platform after changes constitutes acceptance.
          </p>
          <p className="mt-3">
            Questions? Email <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a>.
          </p>
        </>
      }
      related={[
        { label: 'Terms of service', href: '/terms' },
        { label: 'Contact us', href: '/contact' },
      ]}
    />
  )
}
