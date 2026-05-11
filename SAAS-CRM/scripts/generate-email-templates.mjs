import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDir = resolve(process.cwd(), 'public', 'downloads')
const logoUrl = 'https://nodalpoint.io/images/nodalpoint-webicon.png'

function esc(value) {
  return String(value ?? '')
}

function card(title, body) {
  return `
            <div class="cell">
              <div class="card">
                <h2>${esc(title)}</h2>
                <p>${esc(body)}</p>
              </div>
            </div>`
}

function stat(value, label) {
  return `
            <div class="cell">
              <div class="stat">
                <strong>${esc(value)}</strong>
                <span>${esc(label)}</span>
              </div>
            </div>`
}

function bulletList(items) {
  return items.map((item) => `<li>${esc(item)}</li>`).join('\n')
}

function renderTemplate(t) {
  const rows = t.cards.map((pair) => `
          <div class="row">
            ${card(pair.left.title, pair.left.body)}
            ${card(pair.right.title, pair.right.body)}
          </div>`).join('\n')

  const stats = t.stats.map((pair) => `
          <div class="row">
            ${stat(pair.left.value, pair.left.label)}
            ${stat(pair.right.value, pair.right.label)}
          </div>`).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nodal Point | ${esc(t.title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #18181b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    .wrap {
      width: 100%;
      padding: 28px 14px;
      box-sizing: border-box;
    }

    .shell {
      max-width: 680px;
      margin: 0 auto;
      border: 1px solid #e4e4e7;
      border-radius: 20px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 8px 30px rgba(24, 24, 27, 0.06);
    }

    .top {
      padding: 26px 28px 18px;
      background:
        radial-gradient(circle at top right, rgba(0,47,167,0.12), transparent 30%),
        linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
      border-bottom: 1px solid #e4e4e7;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 18px;
    }

    .logo {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: #fff;
      border: 1px solid #e4e4e7;
      padding: 4px;
      object-fit: contain;
      flex: 0 0 auto;
      margin-right: 0;
    }

    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 4px;
    }

    h1 {
      margin: 0;
      font-size: 29px;
      line-height: 1.08;
      letter-spacing: -0.04em;
      color: #09090b;
    }

    .intro {
      margin: 14px 0 0;
      font-size: 15px;
      line-height: 1.65;
      color: #3f3f46;
      max-width: 54ch;
    }

    .body {
      padding: 24px 28px 28px;
    }

    .callout {
      border-left: 4px solid #002FA7;
      background: #eef2ff;
      border-radius: 14px;
      padding: 16px 16px 16px 14px;
      margin: 18px 0 22px;
      color: #1e1b4b;
      line-height: 1.6;
      font-size: 14px;
    }

    .grid {
      display: table;
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 12px;
    }

    .row {
      display: table-row;
    }

    .cell {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      padding-right: 12px;
    }

    .card {
      border: 1px solid #e4e4e7;
      border-radius: 16px;
      padding: 16px;
      background: #ffffff;
    }

    .card h2 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: #71717a;
    }

    .card p {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: #27272a;
    }

    .stat {
      margin: 0 0 10px;
      padding: 14px 16px;
      border: 1px solid #e4e4e7;
      border-radius: 14px;
      background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
    }

    .stat strong {
      display: block;
      font-size: 22px;
      line-height: 1;
      color: #09090b;
      margin-bottom: 4px;
      letter-spacing: -0.04em;
    }

    .stat span {
      display: block;
      color: #52525b;
      font-size: 13px;
      line-height: 1.45;
    }

    .bullet-list {
      margin: 12px 0 0;
      padding: 0 0 0 18px;
      color: #27272a;
      font-size: 14px;
      line-height: 1.6;
    }

    .bullet-list li { margin-bottom: 8px; }

    .cta {
      margin-top: 18px;
      border-radius: 16px;
      background: linear-gradient(135deg, #002FA7 0%, #0040d8 100%);
      color: #fff;
      padding: 18px 18px 16px;
    }

    .cta .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      opacity: 0.8;
      margin-bottom: 8px;
    }

    .cta p {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: #fff;
    }

    .button {
      display: inline-block;
      margin-top: 14px;
      background: #ffffff;
      color: #002FA7 !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 18px;
      border-radius: 999px;
    }

    .footer {
      padding: 18px 28px 24px;
      font-size: 12px;
      line-height: 1.55;
      color: #71717a;
      border-top: 1px solid #e4e4e7;
      background: #fafafa;
    }

    .footer-shell {
      display: table;
      width: 100%;
      border-collapse: collapse;
    }

    .footer-avatar {
      width: 54px;
      vertical-align: top;
      padding-right: 12px;
    }

    .footer-avatar img {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      object-fit: cover;
      border: 1px solid #e4e4e7;
      display: block;
      background: #fff;
    }

    .footer-copy strong {
      color: #09090b;
      display: block;
      margin-bottom: 2px;
      font-size: 13px;
    }

    .footer-copy .title {
      color: #52525b;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .footer-copy .meta {
      color: #71717a;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .footer-links {
      margin-top: 8px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .footer-links a {
      color: #002FA7;
      text-decoration: none;
      font-weight: 700;
    }

    .footer-links span {
      color: #d4d4d8;
      padding: 0 8px;
    }

    @media only screen and (max-width: 640px) {
      .wrap { padding: 14px 8px; }
      .top, .body, .footer { padding-left: 18px; padding-right: 18px; }
      h1 { font-size: 24px; }
      .cell {
        display: block;
        width: 100%;
        padding-right: 0;
        margin-bottom: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="shell">
      <div class="top">
        <div class="brand">
          <img class="logo" src="${logoUrl}" alt="Nodal Point logo" />
          <div>
            <div class="eyebrow">${esc(t.eyebrow)}</div>
            <h1>${esc(t.title)}</h1>
          </div>
        </div>
        <p class="intro">
          ${esc(t.intro)}
        </p>
      </div>

      <div class="body">
        <div class="callout">
          ${esc(t.callout)}
        </div>

        <div class="grid">
          ${rows}
        </div>

        <div class="grid">
          ${stats}
        </div>

        <div class="card">
          <h2>${esc(t.bulletHeading)}</h2>
          <ul class="bullet-list">
            ${bulletList(t.bullets)}
          </ul>
        </div>

        <div class="cta">
          <div class="label">${esc(t.ctaLabel)}</div>
          <p>${esc(t.cta)}</p>
          <a class="button" href="${esc(t.ctaHref)}">${esc(t.ctaButton)}</a>
        </div>
      </div>

      <div class="footer">
        <div class="footer-shell">
          <div class="footer-avatar">
            <img src="{{sender.photoUrl}}" alt="{{sender.name}}" />
          </div>
          <div class="footer-copy">
            <strong>{{sender.name}}</strong>
            <div class="title">{{sender.title}}</div>
            <div class="meta">{{sender.email}} | {{sender.phone}}</div>
            <div class="meta">{{sender.city}}, {{sender.state}}</div>
            <div class="footer-links">
              <a href="{{sender.linkedinUrl}}">LinkedIn</a>
              <span>//</span>
              <a href="{{sender.websiteUrl}}">{{sender.website}}</a>
            </div>
          </div>
        </div>
        <div style="margin-top: 10px; color: #a1a1aa;">
          We do not sell energy. We audit inefficiency.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

const templates = [
  {
    filename: 'case-study-followup-2026-03-18.html',
    eyebrow: 'Case Study Follow-Up',
    title: 'How B.I.G. Logistics cut energy cost',
    intro: '{{contact.firstName}}, thanks again for the call. I kept this short on purpose because you said you get this kind of outreach a lot.',
    callout: 'One example I wanted to share: we helped B.I.G. Logistics reduce their energy cost on both the rate per kWh and the demand charges, which netted them over $30,000 in annual savings using cost-efficient solutions.',
    cards: [
      {
        left: { title: 'What changed', body: 'We looked at the bill like a system, not just a price. That meant checking the electricity rate, the peak-usage fees, and the parts of the bill that were creating avoidable spend.' },
        right: { title: 'Why it worked', body: 'The savings came from tightening both sides of the bill: the unit price for power and the charges tied to peak demand.' },
      },
    ],
    stats: [
      {
        left: { value: '$30,000+', label: 'Annual savings for B.I.G. Logistics from a cleaner energy structure.' },
        right: { value: '2 levers', label: 'Lower price per kWh plus demand charge reduction.' },
      },
    ],
    bulletHeading: 'What I would do for {{contact.companyName}}',
    bullets: [
      'Review one recent bill and see if the rate structure is still competitive.',
      'Check the demand charges to see if the peak-usage fee is getting too high.',
      'Tell you in plain English whether there is enough there to justify a future conversation.',
    ],
    ctaLabel: 'Next step',
    cta: 'If you want, send me one recent bill and I will take a look. If it is worth a deeper conversation, I will show you why. If not, I will be straight with you.',
    ctaButton: 'Send a bill',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'send-me-some-information-2026-03-18.html',
    eyebrow: 'Send Me Some Information',
    title: 'A quick overview you can forward',
    intro: '{{contact.firstName}}, I wanted to keep this simple and easy to forward if you need to share it with someone else.',
    callout: 'Here is the short version: we look for hidden cost in the rate, the demand side of the bill, and any contract terms that are quietly costing money over time.',
    cards: [
      {
        left: { title: 'How we help', body: 'We review the bill, the contract timing, and the usage pattern so you know whether the account has real room for savings.' },
        right: { title: 'What you get', body: 'A plain-English summary of what matters, what does not, and whether it is worth a deeper conversation.' },
      },
    ],
    stats: [
      {
        left: { value: '1 bill', label: 'Is enough for us to spot the biggest issues fast.' },
        right: { value: 'No pressure', label: 'If it is not worth a move, we will say so.' },
      },
    ],
    bulletHeading: 'What I can send if useful',
    bullets: [
      'A short bill-review summary.',
      'A recent case study from a similar account.',
      'A simple next-step list if the numbers make sense.',
    ],
    ctaLabel: 'If it helps',
    cta: 'Reply back and I will send over the right information for your team.',
    ctaButton: 'Reply here',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'invoice-request-2026-03-18.html',
    eyebrow: 'Invoice Request',
    title: 'Send over the latest bill when you can',
    intro: '{{contact.firstName}}, if you have a recent bill handy, that is the fastest way for me to tell you if there is anything worth looking at.',
    callout: 'I do not need a full packet to start. One recent bill usually gives us enough to see the rate, the demand charges, and whether the current setup still makes sense.',
    cards: [
      {
        left: { title: 'What I need', body: 'One recent invoice or bill PDF is usually enough to get a first read.' },
        right: { title: 'What I will check', body: 'Rate per kWh, demand charges, and any items that look out of step with the current market.' },
      },
    ],
    stats: [
      {
        left: { value: 'Quick read', label: 'We can usually tell fast if there is something worth pursuing.' },
        right: { value: 'Plain English', label: 'No jargon, just the answer you need.' },
      },
    ],
    bulletHeading: 'Send if available',
    bullets: [
      'A recent bill or invoice PDF.',
      'Any contract end date you already know.',
      'Anything that feels unusual on the bill.',
    ],
    ctaLabel: 'Best next step',
    cta: 'If you send the bill over, I will review it and tell you whether a follow-up conversation is worth your time.',
    ctaButton: 'Send the bill',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'bill-review-offer-2026-03-18.html',
    eyebrow: 'Bill Review Offer',
    title: 'Let me take a look at one bill',
    intro: '{{contact.firstName}}, this is the simplest way for us to see whether there is any real room to improve the account.',
    callout: 'If you send me one recent bill, I can tell you whether the rate and demand structure look competitive or whether there is something that should be reviewed.',
    cards: [
      {
        left: { title: 'Why this is useful', body: 'You do not have to commit to anything to get a useful answer back.' },
        right: { title: 'What happens next', body: 'If the bill is clean, I will say that. If there is opportunity, I will show you where it is.' },
      },
    ],
    stats: [
      {
        left: { value: 'Low effort', label: 'One bill is enough to start.' },
        right: { value: 'Clear result', label: 'You will know if there is anything worth a deeper look.' },
      },
    ],
    bulletHeading: 'What to send',
    bullets: [
      'A recent bill PDF.',
      'A contract end date if you have it.',
      'A note if there has been a recent load change.',
    ],
    ctaLabel: 'No pressure',
    cta: 'Send it over and I will tell you, straight up, whether it is worth a future conversation.',
    ctaButton: 'Review my bill',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'call-recap-2026-03-18.html',
    eyebrow: 'Call Recap',
    title: 'Quick recap from our conversation',
    intro: '{{contact.firstName}}, I wanted to send a short recap so the next step is easy to keep track of.',
    callout: 'We talked about how the account is set up today, what the bill is doing, and whether there is enough signal to justify a deeper review.',
    cards: [
      {
        left: { title: 'What I heard', body: 'You wanted a short, practical email and you did not want a long pitch.' },
        right: { title: 'What I am doing', body: 'I am keeping the follow-up focused on the bill, the rate, and the question of whether there is real savings to be found.' },
      },
    ],
    stats: [
      {
        left: { value: 'Short and clear', label: 'No long memo, just the next move.' },
        right: { value: 'Easy to forward', label: 'This should be simple for anyone else to read.' },
      },
    ],
    bulletHeading: 'Next steps',
    bullets: [
      'Review one current bill.',
      'Check whether the rate and demand charges still make sense.',
      'Decide if there is enough value for a follow-up conversation.',
    ],
    ctaLabel: 'Close the loop',
    cta: 'If I missed anything from our call, reply back and I will correct it. Otherwise, send the bill when ready and I will take a look.',
    ctaButton: 'Reply with edits',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'book-a-review-2026-03-18.html',
    eyebrow: 'Book A Review',
    title: 'A quick bill review would tell us a lot',
    intro: '{{contact.firstName}}, if you are open to it, a short review would give us a clean answer fast.',
    callout: 'We can look at one recent bill, scan the rate and demand charges, and tell you if there is enough there to justify more time together.',
    cards: [
      {
        left: { title: 'Why a review works', body: 'It is the fastest way to see whether the account is already priced well or whether there is hidden cost sitting in the bill.' },
        right: { title: 'What the call covers', body: 'The bill structure, the current rate, the demand charges, and any obvious timing issues.' },
      },
    ],
    stats: [
      {
        left: { value: '15 minutes', label: 'Is usually enough for a first look.' },
        right: { value: 'Low friction', label: 'Nothing to prepare beyond the bill.' },
      },
    ],
    bulletHeading: 'If we talk, I will cover',
    bullets: [
      'What the bill is actually telling us.',
      'Whether the current pricing looks competitive.',
      'Whether the account is worth a deeper follow-up.',
    ],
    ctaLabel: 'Schedule it',
    cta: 'Reply with a time that works and I will send the invite, or send the bill first and I will tell you if the meeting is even necessary.',
    ctaButton: 'Book a review',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'proposal-ready-2026-03-18.html',
    eyebrow: 'Proposal Ready',
    title: 'I have options ready if you want to see them',
    intro: '{{contact.firstName}}, once I have the bill in front of me, I can usually tell pretty quickly whether the account has enough room for real options.',
    callout: 'If the numbers make sense, I can put together a clear proposal and walk you through the tradeoffs in plain English.',
    cards: [
      {
        left: { title: 'What the proposal does', body: 'Shows the practical options, not just the cheapest number on paper.' },
        right: { title: 'How I present it', body: 'I keep it simple so you can compare the savings, the structure, and the timing without sorting through noise.' },
      },
    ],
    stats: [
      {
        left: { value: 'Clear options', label: 'You can see what changes and why.' },
        right: { value: 'No confusion', label: 'We will not bury the decision in jargon.' },
      },
    ],
    bulletHeading: 'What I need first',
    bullets: [
      'One recent bill.',
      'Any contract timing you already know.',
      'A quick note if there is a decision-maker I should include.',
    ],
    ctaLabel: 'Ready when you are',
    cta: 'Send the bill and I will tell you whether the account is worth building out a proposal for.',
    ctaButton: 'Send the bill',
    ctaHref: 'mailto:{{sender.email}}',
  },
  {
    filename: 'already-have-a-broker-2026-03-18.html',
    eyebrow: 'Already Have A Broker',
    title: 'You may already have someone, and that is fine',
    intro: '{{contact.firstName}}, if another broker is already in the picture, I do not want to waste your time or step on toes.',
    callout: 'What I can do is give you a second set of eyes on the bill and tell you whether the current setup still looks clean, competitive, and worth keeping as-is.',
    cards: [
      {
        left: { title: 'No pressure', body: 'If what you have is already strong, I will tell you that.' },
        right: { title: 'Useful anyway', body: 'If there is a gap in the rate or demand side, we will see it fast.' },
      },
    ],
    stats: [
      {
        left: { value: 'Respectful', label: 'No hard sell, no awkward push.' },
        right: { value: 'Helpful', label: 'A second read can still be valuable.' },
      },
    ],
    bulletHeading: 'If you want a second look',
    bullets: [
      'Send one recent bill.',
      'I will compare what I see against the current market.',
      'If it is already in good shape, I will say that directly.',
    ],
    ctaLabel: 'Optional',
    cta: 'If you want a second opinion, send me the bill and I will keep it straight with you.',
    ctaButton: 'Compare notes',
    ctaHref: 'mailto:{{sender.email}}',
  },
]

await mkdir(outputDir, { recursive: true })

for (const template of templates) {
  const html = renderTemplate(template)
  const filePath = resolve(outputDir, template.filename)
  await writeFile(filePath, html, 'utf8')
  console.log(`Wrote ${filePath}`)
}
