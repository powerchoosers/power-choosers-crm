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
              [ RUN_AUDIT ]
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

export function generateForensicSignature(profile: UserProfile): string {
  if (!profile) return '';

  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Nodal Point Architect';
  const NODAL_BLUE = '#002FA7';
  const ZINC_500 = '#71717a';
  const ZINC_950 = '#09090b';

  return `
<!-- NODAL_FORENSIC_SIGNATURE -->
<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; max-width: 500px;">
  <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <tr>
      <td style="padding-right: 12px; vertical-align: top;">
        ${profile.hostedPhotoUrl ? `
          <img 
            src="${profile.hostedPhotoUrl}" 
            alt="${fullName}" 
            style="width: 48px; height: 48px; border-radius: 14px; object-fit: cover; display: block;"
          />
        ` : `
          <div style="width: 48px; height: 48px; background-color: ${ZINC_950}; border-radius: 14px; color: white; display: block; line-height: 48px; text-align: center; font-weight: bold; font-size: 14px;">
            ${initials}
          </div>
        `}
      </td>
      <td style="border-left: 2px solid ${NODAL_BLUE}; padding-left: 12px; vertical-align: middle;">
        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #09090b; letter-spacing: -0.02em; line-height: 1.2;">
          ${fullName}
        </p>
        <p style="margin: 2px 0; font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: ${ZINC_500}; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.2;">
          ${profile.jobTitle || 'Market Architect'} // [VECTOR_OPS]
        </p>
        <a href="https://nodalpoint.io" style="font-size: 12px; color: ${NODAL_BLUE}; text-decoration: none; font-weight: 500;">
          nodalpoint.io
        </a>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top: 12px;">
        <div style="font-family: ui-monospace, Consolas, monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; line-height: 1.4;">
          <div style="color: #10b981;">// SYSTEM_STATUS: OPERATIONAL</div>
          <div style="color: ${ZINC_950};">// ACTIVE_DIAGNOSTIC: <span style="color: ${NODAL_BLUE};">[ RUN_FORENSIC_SNAPSHOT ]</span></div>
        </div>
      </td>
    </tr>
  </table>
</div>
  `;
}
