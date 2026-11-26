import { LegalPage } from '@/components/landing/LegalPage'

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
        <p>By accessing nodalpoint.io or using any Nodal Point service — including the Bill Debugger, reports, or consultation services — you agree to these Terms of Service.</p>
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
        <p>Nodal Point provides commercial energy bill review and advisory services, including:</p>
        <ul>
          <li><strong>Bill Debugger</strong> — an automated tool that reviews your energy bill against market and utility data to identify cost issues.</li>
          <li><strong>Reports</strong> — written analysis of your load profile, demand charges, and contract structure.</li>
          <li><strong>Consultations</strong> — direct discussions with Nodal Point analysts about the findings and next steps.</li>
        </ul>
        <p>All analysis is based on the information you provide. We are an advisory and analytical service, not your energy supplier, utility provider, or legal representative.</p>
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
        <p>Energy markets change, and past results do not guarantee future outcomes. You are responsible for verifying any recommendation before making a procurement decision.</p>
        <p>We recommend working with qualified legal and financial advisors whenever you need that kind of guidance.</p>
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
        <p>We use current market data and utility rate schedules where available. We try to keep the information accurate, but we cannot guarantee a specific result or savings amount.</p>
        <p>Your analysis depends on the quality and completeness of the bill and usage data you provide. If the input is incomplete or inaccurate, the results may be too.</p>
        <p>Market conditions and utility rates can change after a report is generated.</p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    number: '06',
    title: 'Intellectual Property',
    content: (
      <>
        <p>All content on nodalpoint.io — including the review method, software, design, and written content — is the intellectual property of Nodal Point and protected by applicable copyright and trade secret law.</p>
        <p>Your reports are licensed to you for personal and internal business use only. You may not redistribute, resell, or publish them without written consent from Nodal Point.</p>
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
        <p>Our total liability for any claim arising from use of the platform will not exceed the fees you paid to Nodal Point in the three months before the claim.</p>
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
        <p>You may end your engagement with Nodal Point at any time by emailing <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a>. We will delete your data as described in the Privacy Policy.</p>
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
    <LegalPage
      title="Terms of service"
      lead="These terms explain how the platform works, what you can expect from us, and what we expect from you. Plain language where possible."
      effective="March 2026"
      sections={SECTIONS}
      note={
        <p>
          Questions about these terms? Contact us at <a href="mailto:signal@nodalpoint.io">signal@nodalpoint.io</a> or call +1 (817) 809-3367.
        </p>
      }
      related={[
        { label: 'Privacy policy', href: '/privacy' },
        { label: 'Contact us', href: '/contact' },
      ]}
    />
  )
}
