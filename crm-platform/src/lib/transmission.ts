import { supabase } from './supabase'

export async function compileTransmission(assetId: string, contactData: any) {
  const { data: asset, error } = await supabase
    .from('transmission_assets')
    .select('*')
    .eq('id', assetId)
    .single()

  if (error || !asset) {
    throw new Error(`Failed to fetch transmission asset: ${error?.message || 'Not found'}`)
  }

  let html = asset.compiled_html || ''
  const variables = asset.variables || []

  // Replace variables in the compiled HTML
  // contactData should contain keys matching the variables
  variables.forEach((variable: string) => {
    const value = contactData[variable] || `[MISSING_${variable.toUpperCase()}]`
    const regex = new RegExp(`{{${variable}}}`, 'g')
    html = html.replace(regex, value)
  })

  // Add signature if not present (simplified for now)
  if (!html.includes('Lewis Patterson')) {
    html += `
      <div style="margin-top: 40px; border-top: 1px solid #f4f4f5; padding-top: 20px; font-family: sans-serif;">
        <div style="font-weight: bold; color: #18181b;">Lewis Patterson</div>
        <div style="color: #71717a; font-size: 12px;">Director of Energy Architecture</div>
      </div>
    `
  }

  return html
}

export function generateStaticHtml(blocks: any[]) {
  // This would be used in the builder to generate the final HTML string
  // for storage in transmission_assets.compiled_html
  let html = `
    <div style="font-family: 'Inter', sans-serif; background: #ffffff; color: #18181b; padding: 40px; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 1px solid #e4e4e7; padding-bottom: 12px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: monospace; font-size: 10px; font-weight: bold; letter-spacing: 2px; color: #18181b;">NODAL_POINT // INTELLIGENCE</span>
        <span style="font-family: monospace; font-size: 10px; color: #71717a;">REF: {{date}} // {{context_id}}</span>
      </div>
  `

  blocks.forEach((block: any) => {
    if (block.type === 'TEXT_MODULE') {
      html += `<p style="line-height: 1.6; margin-bottom: 20px;">${block.content}</p>`
    } else if (block.type === 'TACTICAL_BUTTON') {
      html += `
        <div style="margin: 30px 0;">
          <a href="{{cta_url}}" style="background: #002FA7; color: #ffffff; padding: 12px 24px; text-decoration: none; font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 1px; border-radius: 2px;">${block.content}</a>
        </div>
      `
    } else if (block.type === 'TELEMETRY_GRID') {
      html += `
        <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin-bottom: 20px; border: 1px solid #e4e4e7;">
          <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #d4d4d8;">
                ${block.content.headers.map((h: string) => `<th style="text-align: left; padding: 8px 0; font-size: 10px; color: #71717a; text-transform: uppercase;">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${block.content.rows.map((row: string[]) => `
                <tr>
                  ${row.map((cell: string) => `<td style="padding: 8px 0; color: #18181b;">${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
    } else if (block.type === 'VARIABLE_CHIP') {
      html += `<span style="font-family: monospace; font-size: 12px; color: #002FA7;">${block.content}</span>`
    }
  })

  html += `
      <div style="margin-top: 40px; border-top: 1px solid #f4f4f5; padding-top: 20px; font-family: sans-serif;">
        <div style="font-weight: bold; color: #18181b;">Lewis Patterson</div>
        <div style="color: #71717a; font-size: 12px;">Director of Energy Architecture</div>
      </div>
    </div>
  `

  return html
}
