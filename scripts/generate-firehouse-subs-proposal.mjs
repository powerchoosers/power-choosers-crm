import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const outputDir = path.join(repoRoot, 'output', 'firehouse-subs-proposal')
const pdfPath = path.join(outputDir, 'Firehouse Subs - Jeff Lepow - Nodal Point Proposal.pdf')
const screenshotDir = path.join(outputDir, 'screenshots')

const annualUsageKwh = 220000
const termColumns = [24, 36, 60]
const currentBrokerRate = 0.08769
const recommendedRate = 0.0676

function readAsset(relativePath) {
  const filePath = path.join(repoRoot, 'public', 'images', relativePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
  const bytes = fs.readFileSync(filePath)
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatRate(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `$${numeric.toFixed(5)}`
}

function formatCurrency(value) {
  const rounded = Math.round(Number(value) || 0)
  return `$${rounded.toLocaleString('en-US')}`
}

function annualCost(rate) {
  return rate ? annualUsageKwh * Number(rate) : null
}

function termCost(rate, months) {
  return rate ? annualUsageKwh * Number(rate) * (Number(months) / 12) : null
}

function shortCost(rate) {
  const value = annualCost(rate)
  return value == null ? '—' : `~${formatCurrency(value)} / yr`
}

function savingsFromCurrent(rate) {
  const currentAnnual = annualCost(currentBrokerRate)
  const offeredAnnual = annualCost(rate)
  if (currentAnnual == null || offeredAnnual == null) return null
  return currentAnnual - offeredAnnual
}

function savingsTermTotal(rate, months) {
  const currentTerm = termCost(currentBrokerRate, months)
  const offeredTerm = termCost(rate, months)
  if (currentTerm == null || offeredTerm == null) return null
  return currentTerm - offeredTerm
}

const nodalIcon = readAsset('nodalpoint-webicon.png')
const engieLogo = readAsset('engie.png')
const constellationLogo = readAsset('constellation.png')
const chariotLogo = readAsset('chariot.png')
const apgeLogo = readAsset('apg&e.png')

const account = {
  name: 'Firehouse Subs',
  contact: 'Jeff Lepow',
  title: 'Owner / Operator',
  email: 'jlepow@firehousesubs.com',
  phone: '+1 (713)-927-7123',
  city: 'Houston',
  state: 'Texas',
  annualUsage: annualUsageKwh,
  currentRate: currentBrokerRate,
  locations: [
    {
      address: '3924 Bellaire Blvd, Houston, TX 77025-1137',
      esid: '1008901023805105370100',
    },
    {
      address: '420 Meyerland Plaza Mall 170, Houston, TX 77096-1613',
      esid: '1008901024900446250110',
    },
  ],
}

const supplierRows = [
  {
    name: 'APG&E',
    logo: apgeLogo,
    note: 'Fully fixed quote from the source sheet.',
    rates: {
      24: 0.07175,
      36: 0.07335,
      60: 0.07633,
    },
  },
  {
    name: 'Atlantic Energy',
    logo: null,
    note: 'Competitive mid-term pricing.',
    rates: {
      24: 0.06988,
      36: 0.07191,
      60: null,
    },
  },
  {
    name: 'Chariot Energy',
    logo: chariotLogo,
    note: 'Strong 24-month and 36-month pricing.',
    rates: {
      24: 0.06917,
      36: 0.07068,
      60: null,
    },
  },
  {
    name: 'CleanSky',
    logo: null,
    note: 'Higher-priced option in the set.',
    rates: {
      24: 0.0746,
      36: 0.0741,
      60: null,
    },
  },
  {
    name: 'Constellation',
    logo: constellationLogo,
    note: 'Competitive alternative with full fixed pricing.',
    rates: {
      24: 0.0677,
      36: 0.0692,
      60: 0.0708,
    },
  },
  {
    name: 'ENGIE',
    logo: engieLogo,
    note: 'Recommended 36-month option.',
    recommended: true,
    rates: {
      24: 0.06612,
      36: 0.0676,
      60: 0.06966,
    },
  },
]

function termCellHtml(row, term) {
  const rate = row.rates[term]
  const isMissing = rate == null
  const isRecommended = row.recommended && term === 36
  const annual = rate == null ? '—' : shortCost(rate)
  return `
    <div class="term-cell${isRecommended ? ' term-cell--recommended' : ''}${isMissing ? ' term-cell--missing' : ''}">
      <div class="term-cell__rate">${isMissing ? '—' : formatRate(rate)}</div>
      <div class="term-cell__meta">${annual}</div>
    </div>
  `
}

function rowLogoHtml(row) {
  if (!row.logo) {
    return `<div class="supplier-badge">${escapeHtml(row.name)}</div>`
  }

  return `<div class="supplier-logo"><img src="${row.logo}" alt="${escapeHtml(row.name)} logo" /></div>`
}

function renderRows() {
  return supplierRows
    .map((row) => `
      <div class="table-row${row.recommended ? ' table-row--recommended' : ''}">
        <div class="supplier">
          ${rowLogoHtml(row)}
          <div>
            <div class="supplier-name-row">
              <div class="supplier-name">${escapeHtml(row.name)}</div>
              ${row.recommended ? '<div class="inline-badge">Recommended</div>' : ''}
            </div>
            <div class="supplier-note">${escapeHtml(row.note)}</div>
          </div>
        </div>
        ${termCellHtml(row, 24)}
        ${termCellHtml(row, 36)}
        ${termCellHtml(row, 60)}
      </div>
    `)
    .join('')
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Firehouse Subs - Nodal Point Proposal</title>
    <style>
      @page {
        size: Letter;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #0a0f18;
        color: #e5ecf6;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      }

      .sheet {
        width: 8.5in;
        height: 11in;
        page-break-after: always;
        overflow: hidden;
        position: relative;
      }

      .sheet.last {
        page-break-after: auto;
      }

      .cover {
        background:
          radial-gradient(circle at 78% 18%, rgba(0, 47, 167, 0.34), transparent 24%),
          radial-gradient(circle at 18% 20%, rgba(84, 135, 255, 0.18), transparent 26%),
          linear-gradient(145deg, #08101d 0%, #09111f 54%, #0b1528 100%);
      }

      .cover::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 82%);
        pointer-events: none;
      }

      .cover-inner,
      .paper-inner {
        position: relative;
        height: 100%;
        padding: 28px 32px 26px;
        display: flex;
        flex-direction: column;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand img {
        width: 30px;
        height: 30px;
        display: block;
      }

      .eyebrow {
        font-size: 10px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.72);
      }

      .subtle {
        font-size: 9px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.54);
      }

      .confidential {
        text-align: right;
        font-size: 10px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.62);
      }

      .hero {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 16px;
        margin-top: 18px;
        flex: 1;
      }

      .hero-copy {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding-top: 6px;
      }

      .hero h1 {
        margin: 12px 0 14px;
        font-size: 40px;
        line-height: 0.98;
        letter-spacing: -0.04em;
        max-width: 5.8in;
        color: #f7fbff;
      }

      .hero p {
        margin: 0;
        max-width: 5.9in;
        font-size: 15px;
        line-height: 1.72;
        color: rgba(226, 236, 248, 0.82);
      }

      .summary-card {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 26px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)),
          rgba(3, 9, 18, 0.62);
        box-shadow: 0 26px 52px rgba(0, 0, 0, 0.32);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .summary-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .summary-title {
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.58);
      }

      .summary-status {
        padding: 8px 11px;
        border-radius: 999px;
        border: 1px solid rgba(111, 211, 255, 0.22);
        background: rgba(0, 47, 167, 0.16);
        color: #d9e7ff;
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .metric {
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.05);
        padding: 12px;
      }

      .metric .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.54);
        margin-bottom: 6px;
      }

      .metric .value {
        font-size: 14px;
        line-height: 1.45;
        color: #ffffff;
      }

      .location-box {
        margin-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.11);
        padding-top: 14px;
      }

      .location-box .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.54);
        margin-bottom: 10px;
      }

      .location {
        padding: 12px 12px 11px;
        border-radius: 16px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        margin-bottom: 10px;
      }

      .location:last-child {
        margin-bottom: 0;
      }

      .location .address {
        color: #ffffff;
        font-size: 13px;
        line-height: 1.55;
        margin-bottom: 6px;
      }

      .location .esid {
        color: rgba(226, 236, 248, 0.68);
        font-size: 11px;
        letter-spacing: 0.08em;
        font-family: "Consolas", "SFMono-Regular", monospace;
      }

      .recommendation {
        margin-top: 18px;
        border-radius: 24px;
        border: 1px solid rgba(111, 211, 255, 0.18);
        background:
          linear-gradient(180deg, rgba(0,47,167,0.26), rgba(0,47,167,0.12)),
          rgba(4, 12, 26, 0.65);
        padding: 18px 18px 16px;
      }

      .recommendation .kicker {
        font-size: 9px;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        color: rgba(220, 233, 255, 0.7);
        margin-bottom: 10px;
      }

      .recommendation .headline {
        font-size: 24px;
        line-height: 1.05;
        letter-spacing: -0.04em;
        color: #ffffff;
        margin-bottom: 8px;
      }

      .recommendation .rate {
        font-size: 34px;
        line-height: 1;
        letter-spacing: -0.05em;
        color: #f7fbff;
        margin-bottom: 8px;
      }

      .recommendation .note {
        font-size: 13px;
        line-height: 1.7;
        color: rgba(226, 236, 248, 0.84);
      }

      .comparison-strip {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      .comparison-card {
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        padding: 12px;
      }

      .comparison-card .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.54);
        margin-bottom: 6px;
      }

      .comparison-card .value {
        font-size: 13px;
        line-height: 1.5;
        color: #ffffff;
      }

      .comparison-card .value strong {
        color: #ffffff;
      }

      .comparison-card .sub {
        margin-top: 5px;
        font-size: 10px;
        line-height: 1.4;
        color: rgba(226, 236, 248, 0.72);
      }

      .rate-strip {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }

      .rate-card {
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        padding: 14px 14px 13px;
      }

      .rate-card--recommended {
        border-color: rgba(111, 211, 255, 0.34);
        background:
          linear-gradient(180deg, rgba(0,47,167,0.24), rgba(0,47,167,0.12)),
          rgba(255,255,255,0.04);
      }

      .rate-card .label {
        font-size: 9px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(226, 236, 248, 0.54);
        margin-bottom: 8px;
      }

      .rate-card .rate {
        font-size: 26px;
        line-height: 1;
        letter-spacing: -0.05em;
        color: #ffffff;
        margin-bottom: 6px;
      }

      .rate-card .meta {
        font-size: 11px;
        line-height: 1.5;
        color: rgba(226, 236, 248, 0.74);
      }

      .paper {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(245, 248, 252, 0.98)),
          #f4f7fb;
        color: #0f172a;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding-bottom: 16px;
        border-bottom: 1px solid #dbe4f0;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .header-left img {
        width: 28px;
        height: 28px;
        display: block;
      }

      .header-right {
        text-align: right;
      }

      .header-right .title {
        font-size: 10px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: #6b7280;
      }

      .header-right .meta {
        margin-top: 4px;
        font-size: 11px;
        color: #0f172a;
      }

      .section-title {
        margin: 18px 0 8px;
        font-size: 24px;
        line-height: 1.05;
        letter-spacing: -0.04em;
        color: #0f172a;
      }

      .section-subtitle {
        margin: 0;
        max-width: 6.15in;
        font-size: 13px;
        line-height: 1.65;
        color: #526077;
      }

      .info-strip {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      .info-card {
        border-radius: 16px;
        border: 1px solid #dbe4f0;
        background: #ffffff;
        padding: 12px;
        min-height: 76px;
      }

      .info-card .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #6b7280;
        margin-bottom: 8px;
      }

      .info-card .value {
        font-size: 12px;
        line-height: 1.55;
        color: #0f172a;
      }

      .table-wrap {
        margin-top: 16px;
        border: 1px solid #dbe4f0;
        border-radius: 22px;
        overflow: hidden;
        background: #ffffff;
      }

      .table-head,
      .table-row {
        display: grid;
        grid-template-columns: 2.05fr 0.95fr 0.95fr 0.95fr;
      }

      .table-head {
        padding: 14px 16px;
        background: linear-gradient(90deg, rgba(0,47,167,0.08), rgba(0,47,167,0.02));
        border-bottom: 1px solid #dbe4f0;
        color: #607085;
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }

      .table-row {
        padding: 10px 16px;
        border-bottom: 1px solid #edf2f7;
        align-items: stretch;
        min-height: 64px;
      }

      .table-row:last-child {
        border-bottom: none;
      }

      .table-row--recommended {
        background: linear-gradient(90deg, rgba(0,47,167,0.05), rgba(0,47,167,0.01));
      }

      .supplier {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-right: 12px;
      }

      .supplier-logo {
        width: 70px;
        height: 36px;
        border-radius: 12px;
        border: 1px solid #dbe4f0;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6px 8px;
        flex: 0 0 auto;
      }

      .supplier-logo img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .supplier-badge {
        min-width: 70px;
        height: 36px;
        border-radius: 12px;
        border: 1px solid #dbe4f0;
        background: #f7fbff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 8px;
        font-size: 9px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #002fa7;
        font-weight: 700;
        line-height: 1.2;
        text-align: center;
      }

      .supplier-name {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 0;
      }

      .supplier-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .supplier-note {
        font-size: 10px;
        line-height: 1.35;
        color: #607085;
        max-width: 3.3in;
      }

      .term-cell {
        position: relative;
        border-left: 1px solid #edf2f7;
        padding: 0 10px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .term-cell--recommended {
        background: linear-gradient(180deg, rgba(0,47,167,0.1), rgba(0,47,167,0.04));
      }

      .term-cell--missing {
        color: #94a3b8;
      }

      .term-cell__rate {
        font-size: 20px;
        line-height: 1;
        letter-spacing: -0.04em;
        color: #0f172a;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .term-cell--recommended .term-cell__rate {
        color: #002fa7;
      }

      .term-cell__meta {
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #607085;
        line-height: 1.4;
      }

      .inline-badge {
        border-radius: 999px;
        border: 1px solid rgba(0,47,167,0.15);
        background: rgba(0,47,167,0.12);
        color: #002fa7;
        font-size: 8px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        padding: 5px 8px 4px;
        white-space: nowrap;
      }

      .notes-grid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1.08fr 0.92fr;
        gap: 12px;
      }

      .note-card {
        border-radius: 20px;
        border: 1px solid #dbe4f0;
        background: #ffffff;
        padding: 14px;
      }

      .note-card .kicker {
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: #6b7280;
        margin-bottom: 10px;
      }

      .note-card .headline {
        font-size: 17px;
        line-height: 1.15;
        color: #0f172a;
        margin-bottom: 10px;
      }

      .note-card .body {
        font-size: 12px;
        line-height: 1.7;
        color: #334155;
      }

      .bullet {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.6;
        color: #0f172a;
      }

      .bullet::before {
        content: "";
        width: 7px;
        height: 7px;
        margin-top: 6px;
        border-radius: 999px;
        background: #002fa7;
        flex: 0 0 auto;
      }

      .footer {
        margin-top: auto;
        padding-top: 14px;
        border-top: 1px solid #dbe4f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .footer .left,
      .footer .right {
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #6b7280;
        line-height: 1.6;
      }

      .mono {
        font-family: "Consolas", "SFMono-Regular", monospace;
      }
    </style>
  </head>
  <body>
    <section class="sheet cover">
      <div class="cover-inner">
        <div class="topbar">
          <div class="brand">
            <img src="${nodalIcon}" alt="Nodal Point" />
            <div>
              <div class="eyebrow">Nodal Point</div>
              <div class="subtle">Commercial energy proposal</div>
            </div>
          </div>
          <div class="confidential">Confidential internal review</div>
        </div>

        <div class="hero">
          <div class="hero-copy">
            <div>
              <div class="eyebrow">Firehouse Subs</div>
              <h1>Fixed-rate proposal for Jeff Lepow's two Houston locations</h1>
              <p>
                Jeff, this is an apples-to-apples comparison against your other broker's fixed-rate
                options. It uses your two Houston locations and your 220,000 kWh per year estimate,
                then lays out the 24 month, 36 month, and 60 month pricing side by side so the
                decision is easy to review.
              </p>
            </div>

            <div class="comparison-strip">
              <div class="comparison-card">
                <div class="label">Your current rate</div>
                <div class="value mono">${formatRate(account.currentRate)} / kWh</div>
                <div class="sub">Estimated from the rate you are paying now.</div>
              </div>
              <div class="comparison-card">
                <div class="label">ENGIE 36 month offer</div>
                <div class="value mono">${formatRate(recommendedRate)} / kWh</div>
                <div class="sub">Recommended because it balances price and term length.</div>
              </div>
              <div class="comparison-card">
                <div class="label">Annual savings</div>
                <div class="value mono">${formatCurrency(savingsFromCurrent(recommendedRate))} / year</div>
                <div class="sub">Based on 220,000 kWh per year.</div>
              </div>
              <div class="comparison-card">
                <div class="label">36-month savings</div>
                <div class="value mono">${formatCurrency(savingsTermTotal(recommendedRate, 36))} total</div>
                <div class="sub">Compared with staying at your current rate.</div>
              </div>
            </div>

            <div class="recommendation">
              <div class="kicker">Recommended option</div>
              <div class="headline">ENGIE 36 months</div>
              <div class="rate">${formatRate(0.0676)} / kWh all-in</div>
              <div class="note">
                This is the best balance of price and term length. The ENGIE 24 month quote is a
                touch lower, but the 36 month option gives you a longer lock with only a small
                step up in rate.
              </div>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-top">
              <div class="summary-title">Account snapshot</div>
              <div class="summary-status">Fully fixed</div>
            </div>

            <div class="metric-grid">
              <div class="metric">
                <div class="label">Contact</div>
                <div class="value">${escapeHtml(account.contact)}</div>
              </div>
              <div class="metric">
                <div class="label">Title</div>
                <div class="value">${escapeHtml(account.title)}</div>
              </div>
              <div class="metric">
                <div class="label">Annual usage</div>
                <div class="value mono">${account.annualUsage.toLocaleString('en-US')} kWh</div>
              </div>
              <div class="metric">
                <div class="label">Terms shown</div>
                <div class="value mono">24 / 36 / 60 months</div>
              </div>
            </div>

            <div class="location-box">
              <div class="label">Two active locations</div>
              ${account.locations
                .map(
                  (location, index) => `
                    <div class="location">
                      <div class="address">${index + 1}. ${escapeHtml(location.address)}</div>
                      <div class="esid mono">ESID ${escapeHtml(location.esid)}</div>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="rate-strip">
          <div class="rate-card">
            <div class="label">ENGIE 24 months</div>
            <div class="rate">${formatRate(0.06612)}</div>
            <div class="meta">${shortCost(0.06612)}</div>
            <div class="meta">~${formatCurrency(termCost(0.06612, 24))} total</div>
          </div>
          <div class="rate-card rate-card--recommended">
            <div class="label">ENGIE 36 months</div>
            <div class="rate">${formatRate(0.0676)}</div>
            <div class="meta">${shortCost(0.0676)}</div>
            <div class="meta">Recommended for balance and term security</div>
          </div>
          <div class="rate-card">
            <div class="label">ENGIE 60 months</div>
            <div class="rate">${formatRate(0.06966)}</div>
            <div class="meta">${shortCost(0.06966)}</div>
            <div class="meta">~${formatCurrency(termCost(0.06966, 60))} total</div>
          </div>
        </div>
      </div>
    </section>

    <section class="sheet paper last">
      <div class="paper-inner">
        <div class="header">
          <div class="header-left">
            <img src="${nodalIcon}" alt="Nodal Point" />
            <div>
              <div class="eyebrow" style="color:#6b7280;">Nodal Point</div>
              <div class="subtle" style="color:#002fa7;font-weight:700;">Supplier comparison</div>
            </div>
          </div>
          <div class="header-right">
            <div class="title">Firehouse Subs</div>
            <div class="meta">Jeff Lepow - Houston, TX</div>
          </div>
        </div>

        <h2 class="section-title">Fully fixed pricing, no congestion pass-through</h2>
        <p class="section-subtitle">
          The grid below keeps the supplier, term, and rate together. ENGIE is highlighted because
          it is the best overall choice here, especially on the 36 month option.
          Total annual spend is estimated at 220,000 kWh per year and will move up or down with the
          actual load.
        </p>

        <div class="info-strip">
          <div class="info-card">
            <div class="label">Recommended pick</div>
            <div class="value"><strong>ENGIE 36 months</strong></div>
          </div>
          <div class="info-card">
            <div class="label">Rate</div>
            <div class="value mono">${formatRate(0.0676)} / kWh</div>
          </div>
          <div class="info-card">
            <div class="label">Estimated annual energy cost</div>
            <div class="value mono">${shortCost(0.0676)}</div>
          </div>
          <div class="info-card">
            <div class="label">Why it wins</div>
            <div class="value">Good rate, longer lock, cleaner renewal timing.</div>
          </div>
        </div>

        <div class="table-wrap">
          <div class="table-head">
            <div>Supplier</div>
            <div>24 month</div>
            <div>36 month</div>
            <div>60 month</div>
          </div>
          ${renderRows()}
        </div>

        <div class="notes-grid">
          <div class="note-card">
            <div class="kicker">Straight answer</div>
            <div class="headline">ENGIE 24 months is slightly cheaper, but 36 months is the better recommendation.</div>
            <div class="body">
              If you want the absolute lowest quoted rate on paper, ENGIE 24 months comes in lower
              at ${formatRate(0.06612)}. If you want the better business decision, the 36 month
              ENGIE option is the stronger choice because it holds a competitive rate longer and
              avoids having to renegotiate again too soon.
            </div>
          </div>

          <div class="note-card">
            <div class="kicker">Account facts</div>
            <div class="body">
              <div class="bullet">Contact: ${escapeHtml(account.contact)} - ${escapeHtml(account.title)}</div>
              <div class="bullet">Email: ${escapeHtml(account.email)}</div>
              <div class="bullet">Phone: ${escapeHtml(account.phone)}</div>
              <div class="bullet">Locations: 2 Houston sites confirmed in the account data</div>
              <div class="bullet">Usage: ${account.annualUsage.toLocaleString('en-US')} kWh / year estimated</div>
              <div class="bullet">Product: fully fixed, no congestion pass-through</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="left">
            Nodal Point - prepared for internal review only
          </div>
          <div class="right">
            Firehouse Subs proposal
          </div>
        </div>
      </div>
    </section>
  </body>
</html>`

async function main() {
  const { chromium } = await import('playwright')
  const { PDFDocument } = await import('pdf-lib')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 816, height: 1056, deviceScaleFactor: 2 },
    })

    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'screen' })

    const sheets = await page.$$('.sheet')
    for (let i = 0; i < sheets.length; i += 1) {
      const shotPath = path.join(screenshotDir, `page-${i + 1}.png`)
      await sheets[i].screenshot({ path: shotPath })
    }

    const pdfDoc = await PDFDocument.create()
    for (let i = 0; i < sheets.length; i += 1) {
      const shotPath = path.join(screenshotDir, `page-${i + 1}.png`)
      const bytes = fs.readFileSync(shotPath)
      const image = await pdfDoc.embedPng(bytes)
      const pdfPage = pdfDoc.addPage([612, 792])
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      })
    }

    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync(pdfPath, Buffer.from(pdfBytes))

    const fullPageShot = path.join(outputDir, 'firehouse-subs-full-document.png')
    const composed = await page.screenshot({
      path: fullPageShot,
      fullPage: true,
      type: 'png',
    })
    void composed
  } finally {
    await browser.close()
  }

  console.log(pdfPath)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
