import { UserProfile } from "@/context/AuthContext"

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function generateNodalSignature(profile: UserProfile, user: any, isDarkMode: boolean = false): string {
  // Name: first + last from profile, else profile.name, else user_metadata.full_name
  const nameParts = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const authName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const name = nameParts || profile.name || authName || 'Nodal Point Team'
  const jobTitle = profile.jobTitle || 'Market Architect'
  const email = profile.email || user?.email || 'contact@nodalpoint.io'
  const linkedinUrl = profile.linkedinUrl || 'https://linkedin.com/company/nodal-point'
  // Use hosted avatar (from host-google-avatar) for email reliability, fallback to Supabase user_metadata
  const avatarUrl = profile.hostedPhotoUrl || user?.user_metadata?.avatar_url || ''

  // Theme-aware colors
  const textColor = isDarkMode ? '#e4e4e7' : '#18181b' // zinc-200 vs zinc-900
  const subTextColor = isDarkMode ? '#a1a1aa' : '#52525b' // zinc-400 vs zinc-600
  const secondaryTextColor = isDarkMode ? '#71717a' : '#3f3f46' // zinc-500 vs zinc-800
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : '#e4e4e7'

  // Phone: selected number for calls (from Settings)
  const phone = profile.selectedPhoneNumber ||
    (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : '+1 (817) 809-3367')

  const city = profile.city || ''
  const state = profile.state || ''
  const locationLine = [city, state].filter(Boolean).join(', ')

  return `
<table cellpadding="0" cellspacing="0" style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; width: 100%; max-width: 600px; border-collapse: collapse;">
  <tr>
    <!-- THE SIGNAL LINE (Vertical Blue Bar) -->
    <td style="width: 4px; background-color: #002FA7; vertical-align: top; border-radius: 2px;"></td>
    
    <!-- PADDING GAP -->
    <td style="width: 20px;"></td>
    
    <!-- THE INTEL BLOCK -->
    <td style="vertical-align: top;">
      
      <!-- IDENTITY VECTOR (avatar left of name/title) -->
      <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
        <tr>
          ${avatarUrl ? `
          <td style="padding-right: 12px; vertical-align: middle;">
            <img src="${esc(avatarUrl)}" alt="${esc(name)}" style="width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 2px 10px -2px rgba(0,0,0,0.6); display: block;" />
          </td>
          ` : ''}
          <td style="vertical-align: middle;">
            <span style="font-weight: 700; letter-spacing: -0.5px; font-size: 16px; color: ${textColor}; display: block;">
              ${esc(name)}
            </span>
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: ${subTextColor}; display: block; margin-top: 4px;">
              ${esc(jobTitle)}
            </span>
          </td>
        </tr>
      </table>

      <!-- TELEMETRY (Contact Info: email, phone, city/state) -->
      <div style="margin-bottom: 16px; font-size: 12px; line-height: 1.6; color: ${secondaryTextColor};">
        <span style="font-family: 'Courier New', Courier, monospace;">E:</span> ${esc(email)} <br>
        <span style="font-family: 'Courier New', Courier, monospace;">P:</span> ${esc(phone)}
        ${locationLine ? ` <br><span style="font-family: 'Courier New', Courier, monospace;">${esc(locationLine)}</span>` : ''}
      </div>

      <!-- COMMAND DECK (Links) -->
      <table border="0" cellpadding="0" cellspacing="0" style="font-size: 11px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.5px;">
        <tr>
          <!-- LINKEDIN -->
          <td>
            <a href="${esc(linkedinUrl)}" style="color: #002FA7; text-decoration: none; font-weight: 700;">
              LINKEDIN
            </a>
          </td>
          
          <td style="color: #d4d4d8; padding: 0 8px;">//</td>
          
          <!-- NETWORK (Website) -->
          <td>
            <a href="https://nodalpoint.io" style="color: #002FA7; text-decoration: none; font-weight: 700;">
              HQ
            </a>
          </td>
          
          <td style="color: #d4d4d8; padding: 0 8px;">//</td>
          
          <!-- BILL DEBUGGER (The Weapon) -->
          <td>
            <a href="https://nodalpoint.io/bill-debugger" style="color: #002FA7; text-decoration: none; font-weight: 700;">
              [ RUN_FORENSIC_AUDIT ]
            </a>
          </td>
        </tr>
      </table>

      <!-- PHILOSOPHY FOOTER -->
      <div style="margin-top: 12px; border-top: 1px solid ${borderColor}; padding-top: 8px;">
        <span style="font-style: italic; color: #a1a1aa; font-size: 10px; font-family: Helvetica, Arial, sans-serif;">
          We do not sell energy. We audit inefficiency.
        </span>
      </div>
    </td>
  </tr>
</table>
  `
}
