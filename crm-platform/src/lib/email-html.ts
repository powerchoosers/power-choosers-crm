const LIGHT_BG = '#fafafa'
const LIGHT_TEXT = '#18181b'
const LIGHT_MUTED = '#52525b'
const LIGHT_BORDER = '#e4e4e7'
const LIGHT_LINK = '#002FA7'

const DARK_BG = '#0a0a0a'
const DARK_TEXT = '#e4e4e7'
const DARK_MUTED = '#a1a1aa'
const DARK_BORDER = 'rgba(255, 255, 255, 0.1)'
const DARK_LINK = '#6b8eff'

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hasHtmlDocumentShell(html: string): boolean {
  return /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html)
}

function hasAdaptiveEmailSupport(html: string): boolean {
  return /color-scheme|supported-color-schemes|prefers-color-scheme|nodal-email-shell|compose-email-shell|foundry-email-shell/i.test(html)
}

function injectBeforeClosingTag(html: string, tagName: 'head' | 'body' | 'html', snippet: string): string {
  const pattern = new RegExp(`</${tagName}>`, 'i')
  if (pattern.test(html)) {
    return html.replace(pattern, `${snippet}</${tagName}>`)
  }
  return `${html}${snippet}`
}

function insertIntoBodyClass(html: string, className: string): string {
  return html.replace(/<body([^>]*)>/i, (match, rawAttrs: string = '') => {
    const classMatch = rawAttrs.match(/\bclass=(["'])(.*?)\1/i)
    if (classMatch) {
      const [full, quote, classValue] = classMatch
      const nextClassValue = `${classValue} ${className}`.trim()
      return match.replace(full, `class=${quote}${nextClassValue}${quote}`)
    }
    return `<body${rawAttrs} class="${className}">`
  })
}

function buildSupportSnippet(): string {
  return `
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      :root {
        color-scheme: light dark;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background-color: ${LIGHT_BG};
        color: ${LIGHT_TEXT};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.45;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
      }

      body {
        overflow-wrap: break-word;
      }

      .nodal-email-shell {
        margin: 0;
        padding: 0;
        background-color: ${LIGHT_BG};
        color: ${LIGHT_TEXT};
      }

      .nodal-email-body,
      .nodal-email-signature {
        color: inherit;
      }

      .nodal-email-body p,
      .nodal-email-body div,
      .nodal-email-body span,
      .nodal-email-body li,
      .nodal-email-body td,
      .nodal-email-body th,
      .nodal-email-signature p,
      .nodal-email-signature div,
      .nodal-email-signature span,
      .nodal-email-signature li,
      .nodal-email-signature td,
      .nodal-email-signature th {
        color: inherit;
      }

      .nodal-email-body a,
      .nodal-email-signature a {
        color: ${LIGHT_LINK};
        text-decoration: underline;
      }

      .nodal-email-body img,
      .nodal-email-signature img {
        max-width: 100%;
        height: auto;
      }

      @media (prefers-color-scheme: dark) {
        html,
        body,
        .nodal-email-shell {
          background-color: ${DARK_BG} !important;
          color: ${DARK_TEXT} !important;
        }

        .nodal-email-body a,
        .nodal-email-signature a {
          color: ${DARK_LINK} !important;
        }

        .nodal-email-body blockquote,
        .nodal-email-signature blockquote {
          border-left-color: ${DARK_BORDER} !important;
          color: ${DARK_MUTED} !important;
        }

        .nodal-email-body hr,
        .nodal-email-signature hr {
          border-color: ${DARK_BORDER} !important;
        }
      }
    </style>
  `
}

export function appendHtmlFragment(html: string, snippet: string): string {
  const value = String(html || '')
  const addition = String(snippet || '')
  if (!value || !addition) return value

  if (/<\/body>/i.test(value)) {
    return injectBeforeClosingTag(value, 'body', addition)
  }

  if (/<\/html>/i.test(value)) {
    return injectBeforeClosingTag(value, 'html', addition)
  }

  return `${value}${addition}`
}

export function buildAdaptiveEmailDocument(bodyHtml: string, signatureHtml = ''): string {
  const body = String(bodyHtml || '').trim()
  const signature = String(signatureHtml || '').trim()

  const documentBody = signature
    ? `${body}<div class="nodal-email-signature">${signature}</div>`
    : body

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${buildSupportSnippet()}
  </head>
  <body class="nodal-email-shell">
    <div class="nodal-email-shell">
      <div class="nodal-email-body">${documentBody}</div>
    </div>
  </body>
</html>`
}

export function ensureAdaptiveEmailDocument(html: string, signatureHtml = ''): string {
  const value = String(html || '').trim()
  if (!value) return value

  if (!hasHtmlDocumentShell(value)) {
    return buildAdaptiveEmailDocument(value, signatureHtml)
  }

  let normalized = value

  if (!hasAdaptiveEmailSupport(normalized)) {
    normalized = injectBeforeClosingTag(normalized, 'head', buildSupportSnippet())
  }

  if (!/class=(["'])(?:[^"']*\s)?nodal-email-shell(?:\s[^"']*)?\1/i.test(normalized)) {
    normalized = insertIntoBodyClass(normalized, 'nodal-email-shell')
  }

  if (signatureHtml.trim()) {
    normalized = appendHtmlFragment(normalized, `<div class="nodal-email-signature">${signatureHtml}</div>`)
  }

  return normalized
}

export function buildReadablePreviewDocument(html: string): string {
  const value = String(html || '').trim()
  const previewStyles = `
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
        color: ${LIGHT_TEXT} !important;
      }

      body,
      body * {
        color: inherit !important;
      }

      a {
        color: ${LIGHT_LINK} !important;
      }
    </style>
  `

  if (hasHtmlDocumentShell(value)) {
    if (/<\/head>/i.test(value)) {
      return value.replace(/<\/head>/i, `${previewStyles}</head>`)
    }

    if (/<html[\s>]/i.test(value)) {
      return value.replace(/<html([^>]*)>/i, (match) => `${match}<head>${previewStyles}</head>`)
    }
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${previewStyles}
  </head>
  <body>
    ${value}
  </body>
</html>`
}

export { escapeHtml }
