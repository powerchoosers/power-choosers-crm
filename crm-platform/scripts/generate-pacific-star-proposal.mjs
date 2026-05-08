import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const outputPath = path.join(
  repoRoot,
  'output',
  'Pacific Star Corporation - Nodal Point Proposal - 2026-05-08.pdf'
)
const previewDir = path.join(repoRoot, 'output', 'pacific-star-preview-raster')

const palette = {
  ink: '#07111f',
  blue: '#002FA7',
  blue2: '#1d5bff',
  cyan: '#6fd3ff',
  paper: '#f5f8fc',
  paper2: '#eaf1fb',
  text: '#122033',
  muted: '#5d6b81',
  line: '#d8e3f2',
  soft: '#ffffff',
}

function readAsset(name) {
  const filePath = path.join(repoRoot, 'public', 'images', name)
  const ext = path.extname(name).slice(1).toLowerCase()
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
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

function rateDisplay(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return `$${numeric.toFixed(5)}`
}

function formatDate(value) {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const [year, month, day] = String(value).split('-')
  const monthName = months[Number(month) - 1] || 'January'
  return `${monthName} ${Number(day)}, ${year}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const nodalIcon = readAsset('nodalpoint-webicon.png')
const constellationLogo = readAsset('constellation.png')
const engieLogo = readAsset('engie.png')
const hudsonLogo = readAsset('Hudson.png')
const freepointLogo = readAsset('freepoint (1).png')

const supplierRows = [
  {
    name: 'Constellation',
    logo: constellationLogo,
    description:
      'Competitive power and gas supplier with integrated energy solutions for commercial customers.',
    rate: '0.06740',
  },
  {
    name: 'Hudson Energy',
    logo: hudsonLogo,
    description:
      'Business-focused supplier known for reliability and certainty in a volatile market.',
    rate: '0.07200',
  },
  {
    name: 'ENGIE',
    logo: engieLogo,
    description:
      'Large non-residential supplier serving commercial and institutional customers across major markets.',
    rate: '0.07032',
  },
  {
    name: 'Freepoint Energy Solutions',
    logo: freepointLogo,
    description:
      'Retail energy arm of Freepoint Commodities, positioned on wholesale expertise and logistics depth.',
    rate: '0.08240',
  },
  {
    name: 'Gexa Energy',
    logo: null,
    description:
      'Texas retail supplier with a long commercial presence and a focus on straightforward pricing.',
    rate: '0.06816',
  },
]

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pacific Star Corporation Proposal</title>
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
        background: ${palette.ink};
        color: ${palette.text};
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      }

      .sheet {
        width: 8.5in;
        height: 11in;
        page-break-after: always;
        position: relative;
        overflow: hidden;
      }

      .sheet.last {
        page-break-after: auto;
      }

      .cover {
        background:
          radial-gradient(circle at 72% 20%, rgba(111, 211, 255, 0.18), transparent 22%),
          radial-gradient(circle at 18% 18%, rgba(29, 91, 255, 0.26), transparent 25%),
          linear-gradient(135deg, #050b14 0%, #071424 52%, #091a2f 100%);
        color: #f8fbff;
      }

      .cover::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
        background-size: 36px 36px;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 82%);
        pointer-events: none;
      }

      .cover-inner {
        position: relative;
        height: 100%;
        padding: 28px 34px 26px;
        display: flex;
        flex-direction: column;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding-bottom: 20px;
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
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: rgba(244, 249, 255, 0.62);
      }

      .confidential {
        font-size: 10px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(244, 249, 255, 0.66);
        text-align: right;
      }

      .hero {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
        align-items: stretch;
        flex: 1;
        padding-top: 10px;
      }

      .hero-copy {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .hero h1 {
        margin: 16px 0 14px;
        font-size: 40px;
        line-height: 0.98;
        letter-spacing: -0.04em;
        max-width: 5.6in;
      }

      .hero p {
        margin: 0;
        max-width: 5.95in;
        color: rgba(238, 244, 255, 0.84);
        font-size: 15px;
        line-height: 1.7;
      }

      .identity-card {
        align-self: start;
        justify-self: end;
        width: 100%;
        max-width: 2.9in;
        min-height: 4.2in;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 26px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)),
          rgba(2, 8, 18, 0.55);
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.36);
        padding: 22px 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .big-rate {
        font-size: 58px;
        line-height: 0.92;
        font-weight: 700;
        letter-spacing: -0.05em;
        margin: 0;
      }

      .subtle {
        font-size: 11px;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        color: rgba(238, 244, 255, 0.58);
      }

      .pill-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-top: 20px;
      }

      .pill {
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
      }

      .pill .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(238, 244, 255, 0.52);
        margin-bottom: 6px;
      }

      .pill .value {
        font-size: 12px;
        line-height: 1.4;
        color: #ffffff;
      }

      .cover-bottom {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        padding-top: 18px;
      }

      .cover-bottom .sender {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .cover-bottom .sender img {
        width: 60px;
        height: 60px;
        object-fit: contain;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        padding: 10px;
      }

      .sender-name {
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 3px;
      }

      .sender-meta {
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(238, 244, 255, 0.62);
        line-height: 1.6;
      }

      .cover-note {
        max-width: 3.2in;
        font-size: 12px;
        line-height: 1.7;
        color: rgba(238, 244, 255, 0.72);
        text-align: right;
      }

      .paper {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.98)),
          ${palette.paper};
      }

      .paper-inner {
        height: 100%;
        padding: 28px 32px 26px;
        display: flex;
        flex-direction: column;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding-bottom: 18px;
        border-bottom: 1px solid ${palette.line};
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .header-left img {
        width: 28px;
        height: 28px;
      }

      .header-right {
        text-align: right;
      }

      .header-right .title {
        font-size: 10px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: ${palette.muted};
      }

      .header-right .date {
        margin-top: 4px;
        font-size: 11px;
        color: ${palette.text};
      }

      .section-title {
        margin: 0;
        font-size: 24px;
        line-height: 1.05;
        letter-spacing: -0.04em;
        color: ${palette.text};
      }

      .section-subtitle {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.65;
        color: ${palette.muted};
        max-width: 5.9in;
      }

      .info-strip {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 10px;
      }

      .info-card {
        border: 1px solid ${palette.line};
        border-radius: 16px;
        background: ${palette.soft};
        padding: 12px 12px 11px;
        min-height: 74px;
      }

      .info-card .label {
        font-size: 9px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: ${palette.muted};
        margin-bottom: 8px;
      }

      .info-card .value {
        font-size: 12px;
        line-height: 1.45;
        color: ${palette.text};
      }

      .table-wrap {
        margin-top: 18px;
        border: 1px solid ${palette.line};
        border-radius: 22px;
        overflow: hidden;
        background: ${palette.soft};
      }

      .table-head {
        display: grid;
        grid-template-columns: 1.85fr 0.75fr 0.6fr;
        gap: 0;
        padding: 14px 16px;
        background:
          linear-gradient(90deg, rgba(0,47,167,0.08), rgba(0,47,167,0.02)),
          #f8fbff;
        border-bottom: 1px solid ${palette.line};
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: ${palette.muted};
      }

      .table-row {
        display: grid;
        grid-template-columns: 1.85fr 0.75fr 0.6fr;
        align-items: center;
        gap: 0;
        padding: 16px;
        border-bottom: 1px solid ${palette.line};
      }

      .table-row:last-child {
        border-bottom: none;
      }

      .supplier {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .supplier-logo {
        width: 68px;
        height: 34px;
        border-radius: 12px;
        border: 1px solid ${palette.line};
        background: #fff;
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
        min-width: 68px;
        height: 34px;
        padding: 0 10px;
        border-radius: 12px;
        border: 1px solid ${palette.line};
        background: #f3f7ff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: ${palette.blue};
        font-weight: 700;
        text-align: center;
        line-height: 1.2;
      }

      .supplier-name {
        font-size: 15px;
        font-weight: 700;
        color: ${palette.text};
        margin-bottom: 4px;
      }

      .supplier-desc {
        font-size: 11px;
        line-height: 1.55;
        color: ${palette.muted};
        max-width: 4.2in;
      }

      .rate {
        font-size: 28px;
        line-height: 1;
        letter-spacing: -0.05em;
        color: ${palette.text};
        font-weight: 700;
      }

      .rate-sub {
        margin-top: 6px;
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: ${palette.muted};
      }

      .term {
        font-size: 12px;
        color: ${palette.text};
      }

      .callout-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 14px;
        flex: 1;
      }

      .card {
        border: 1px solid ${palette.line};
        border-radius: 20px;
        background: ${palette.soft};
        padding: 16px;
      }

      .card-title {
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: ${palette.muted};
        margin-bottom: 12px;
      }

      .card-note {
        font-size: 12px;
        line-height: 1.7;
        color: ${palette.text};
      }

      .bullet {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.6;
        color: ${palette.text};
      }

      .bullet::before {
        content: "";
        width: 7px;
        height: 7px;
        margin-top: 6px;
        border-radius: 999px;
        background: ${palette.blue};
        flex: 0 0 auto;
      }

      .profile-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .profile {
        border: 1px solid ${palette.line};
        border-radius: 16px;
        background: linear-gradient(180deg, #ffffff, #f8fbff);
        padding: 12px;
        min-height: 84px;
      }

      .profile .name {
        font-size: 12px;
        font-weight: 700;
        color: ${palette.text};
        margin-bottom: 6px;
      }

      .profile .desc {
        font-size: 10.5px;
        line-height: 1.5;
        color: ${palette.muted};
      }

      .footer {
        margin-top: auto;
        padding-top: 14px;
        border-top: 1px solid ${palette.line};
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .footer .left {
        font-size: 10px;
        line-height: 1.55;
        color: ${palette.muted};
      }

      .footer .right {
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: ${palette.muted};
        text-align: right;
      }

      .mono {
        font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
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
              <div class="subtle">Commercial Energy Proposal</div>
            </div>
          </div>
          <div class="confidential">Confidential energy proposal</div>
        </div>

        <div class="hero">
          <div class="hero-copy">
            <div>
              <div class="eyebrow">Pacific Star Corporation</div>
              <h1>12-Month Fixed All-In Pricing Proposal</h1>
              <p>
                Nodal Point presentation, rebuilt from the supplied pricing sheet and stripped of
                Power Choosers branding. This version keeps the comparison clear enough for a CFO
                scan: the product, the term, the service details, and the quoted rate are all
                visible without hunting through the page.
              </p>
            </div>

            <div class="cover-note">
              Supplier order follows the source document. Rates are quoted for 05/08/2026 and expire
              at 4:00 PM CST / 5:00 PM EST.
            </div>
          </div>

          <div class="identity-card">
            <div>
              <div class="subtle">Quoted rate range</div>
              <div class="big-rate">$0.06740</div>
              <div class="subtle" style="margin-top:10px;">to $0.08240 / kWh</div>
            </div>

            <div class="pill-grid">
              <div class="pill">
                <div class="label">Product</div>
                <div class="value mono">Fixed (All In)</div>
              </div>
              <div class="pill">
                <div class="label">Start Date</div>
                <div class="value mono">06/2026</div>
              </div>
              <div class="pill">
                <div class="label">Volume</div>
                <div class="value mono">7,000 kWh</div>
              </div>
              <div class="pill">
                <div class="label">Bill Type</div>
                <div class="value mono">Single Bill</div>
              </div>
              <div class="pill">
                <div class="label">Swing</div>
                <div class="value mono">100%</div>
              </div>
              <div class="pill">
                <div class="label">Utility</div>
                <div class="value mono">CenterPoint</div>
              </div>
            </div>

            <div style="margin-top:18px; border-top:1px solid rgba(255,255,255,0.12); padding-top:14px;">
              <div class="subtle">Site</div>
              <div style="margin-top:8px; font-size:13px; line-height:1.6; color:#ffffff;">
                4550 S Wayside Dr 101<br />
                Houston, TX 77087
              </div>
              <div style="margin-top:10px; font-size:11px; line-height:1.55; color:rgba(238,244,255,0.72);">
                Account 1008901025002660980122
              </div>
            </div>
          </div>
        </div>

        <div class="cover-bottom">
          <div class="sender">
            <img src="${nodalIcon}" alt="Nodal Point icon" />
            <div>
              <div class="sender-name">Lewis Patterson</div>
              <div class="sender-meta">
                Nodal Point<br />
                l.patterson@nodalpoint.io<br />
                (972) 834-2317
              </div>
            </div>
          </div>

          <div class="cover-note">
            Built to read fast and trust fast. The full comparison is on the next page, followed by
            supplier notes and the operating terms on the last page.
          </div>
        </div>
      </div>
    </section>

    <section class="sheet paper">
      <div class="paper-inner">
        <div class="header">
          <div class="header-left">
            <img src="${nodalIcon}" alt="Nodal Point" />
            <div>
              <div class="eyebrow" style="color:${palette.muted};">Nodal Point</div>
              <div style="font-size:11px; letter-spacing:0.24em; text-transform:uppercase; color:${palette.blue}; font-weight:700;">
                Rate comparison
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="title">Pacific Star Corporation</div>
            <div class="date">${formatDate('2026-05-08')}</div>
          </div>
        </div>

        <div style="margin-top:18px;">
          <h2 class="section-title">Supplier options at a glance</h2>
          <p class="section-subtitle">
            Five 12-month fixed all-in quotes from the source sheet. The table below keeps the
            supplier identity, the quoted rate, and the term together so the decision is obvious
            without extra explanation.
          </p>
        </div>

        <div class="info-strip">
          <div class="info-card">
            <div class="label">Product</div>
            <div class="value mono">Fixed (All In)</div>
          </div>
          <div class="info-card">
            <div class="label">Start Date</div>
            <div class="value mono">06/2026</div>
          </div>
          <div class="info-card">
            <div class="label">Volume</div>
            <div class="value mono">7,000 kWh</div>
          </div>
          <div class="info-card">
            <div class="label">Bill Type</div>
            <div class="value mono">Single Bill</div>
          </div>
          <div class="info-card">
            <div class="label">Swing</div>
            <div class="value mono">100%</div>
          </div>
          <div class="info-card">
            <div class="label">Utility</div>
            <div class="value mono">CenterPoint Houston</div>
          </div>
        </div>

      <div class="table-wrap">
          <div class="table-head">
            <div>Supplier</div>
            <div>12-Month Rate</div>
            <div>Term</div>
          </div>
          ${supplierRows
            .map(
              (row) => `
              <div class="table-row">
                <div class="supplier">
                  <div>
                    <div class="supplier-name">${escapeHtml(row.name)}</div>
                    <div class="supplier-desc">${escapeHtml(row.description)}</div>
                  </div>
                </div>
                <div>
                  <div class="rate mono">${rateDisplay(row.rate)}</div>
                  <div class="rate-sub">all-in</div>
                </div>
                <div class="term mono">12 months</div>
              </div>
            `
            )
            .join('')}
        </div>

        <div class="footer">
          <div class="left">
            Prices are valid for 05/08/2026. This page is the clean comparison view for internal
            review.
          </div>
          <div class="right">Pacific Star Corporation</div>
        </div>
      </div>
    </section>

    <section class="sheet paper last">
      <div class="paper-inner">
        <div class="header">
          <div class="header-left">
            <img src="${nodalIcon}" alt="Nodal Point" />
            <div>
              <div class="eyebrow" style="color:${palette.muted};">Nodal Point</div>
              <div style="font-size:11px; letter-spacing:0.24em; text-transform:uppercase; color:${palette.blue}; font-weight:700;">
                Supplier notes and terms
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="title">Internal review only</div>
            <div class="date">Generated ${formatDate('2026-05-08')}</div>
          </div>
        </div>

        <div style="margin-top:18px;">
          <h2 class="section-title">What the account looks like</h2>
          <p class="section-subtitle">
            The source file points to a small 7,000 kWh fixed-price account on CenterPoint in
            Houston. That makes the job simple: keep the proposal clean, show the full quote set,
            and leave no question about what the client is looking at.
          </p>
        </div>

        <div class="callout-grid">
          <div class="card">
            <div class="card-title">Supplier profiles</div>
            <div class="profile-grid">
              ${supplierRows
                .map(
                  (row) => `
                    <div class="profile">
                      <div class="name">${escapeHtml(row.name)}</div>
                      <div class="desc">${escapeHtml(row.description)}</div>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-title">Operating terms</div>
            <div class="card-note">
              <div class="bullet">Product: Fixed (All In)</div>
              <div class="bullet">Start date: June 2026</div>
              <div class="bullet">Annual volume: 7,000 kWh</div>
              <div class="bullet">Bill type: Single Bill</div>
              <div class="bullet">Swing: 100%</div>
              <div class="bullet">Pricing expires at 4:00 PM CST on 05/08/2026</div>
              <div class="bullet">This package is written for internal review before client send.</div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:14px;">
          <div class="card-title">Plain-English read</div>
          <div class="card-note">
            The point of this proposal is not to decorate the numbers. It is to make the decision
            obvious: a stable 12-month fixed quote set, a simple service profile, and a clean
            supplier comparison that can be reviewed in seconds.
          </div>
          <div class="card-note" style="margin-top:10px; color:${palette.muted};">
            Recommended next step: choose the supplier to carry forward and attach the final
            commercial terms before sending it to Pacific Star Corporation.
          </div>
        </div>

        <div class="footer">
          <div class="left">
            Lewis Patterson · Nodal Point · l.patterson@nodalpoint.io · (972) 834-2317
          </div>
          <div class="right">Confidential energy proposal</div>
        </div>
      </div>
    </section>
  </body>
</html>`

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 816, height: 1056, deviceScaleFactor: 2 },
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'screen' })
    await delay(250)

    fs.mkdirSync(previewDir, { recursive: true })

    const sheetHandles = await page.$$('.sheet')
    const screenshots = []
    for (let i = 0; i < sheetHandles.length; i += 1) {
      const handle = sheetHandles[i]
      const shotPath = path.join(previewDir, `page-${i + 1}.png`)
      await handle.screenshot({ path: shotPath })
      screenshots.push(shotPath)
    }

    const { PDFDocument } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.create()
    for (const shotPath of screenshots) {
      const bytes = fs.readFileSync(shotPath)
      const image = await pdfDoc.embedPng(bytes)
      const pageDoc = pdfDoc.addPage([612, 792])
      pageDoc.drawImage(image, {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      })
    }

    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync(outputPath, Buffer.from(pdfBytes))
  } finally {
    await browser.close()
  }

console.log(outputPath)
