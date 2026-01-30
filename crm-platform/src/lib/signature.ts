import { UserProfile } from "@/context/AuthContext"
import { User } from "firebase/auth"

export function generateNodalSignature(profile: UserProfile, user: User | null, isDarkMode: boolean = false): string {
  const name = profile.name || user?.displayName || 'Nodal Point Team'
  const jobTitle = profile.jobTitle || 'Market Architect'
  const email = profile.email || user?.email || 'contact@nodalpoint.io'
  const linkedinUrl = profile.linkedinUrl || 'https://linkedin.com/company/nodal-point'
  const avatarUrl = user?.photoURL || ''
  
  // Theme-aware colors
  const textColor = isDarkMode ? '#e4e4e7' : '#18181b' // zinc-200 vs zinc-900
  const subTextColor = isDarkMode ? '#a1a1aa' : '#52525b' // zinc-400 vs zinc-600
  const secondaryTextColor = isDarkMode ? '#71717a' : '#3f3f46' // zinc-500 vs zinc-800
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : '#e4e4e7'
  
  // Use the selected phone number if available, otherwise the first twilio number, otherwise a fallback
  const phone = profile.selectedPhoneNumber || 
                (profile.twilioNumbers && profile.twilioNumbers.length > 0 ? profile.twilioNumbers[0].number : '+1 (817) 809-3367')

  return `
<table cellpadding="0" cellspacing="0" style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; width: 100%; max-width: 600px; border-collapse: collapse;">
  <tr>
    <!-- THE SIGNAL LINE (Vertical Blue Bar) -->
    <td style="width: 4px; background-color: #002FA7; vertical-align: top; border-radius: 2px;"></td>
    
    <!-- PADDING GAP -->
    <td style="width: 20px;"></td>
    
    <!-- THE INTEL BLOCK -->
    <td style="vertical-align: top;">
      
      <!-- IDENTITY VECTOR -->
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
        ${avatarUrl ? `
        <img src="${avatarUrl}" alt="${name}" style="width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 2px 10px -2px rgba(0,0,0,0.6);" />
        ` : ''}
        <div>
          <span style="font-weight: 700; letter-spacing: -0.5px; font-size: 16px; color: ${textColor}; display: block;">
            ${name}
          </span>
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: ${subTextColor}; display: block; margin-top: 4px;">
            ${jobTitle}
          </span>
        </div>
      </div>

      <!-- TELEMETRY (Contact Info) -->
      <div style="margin-bottom: 16px; font-size: 12px; line-height: 1.6; color: ${secondaryTextColor};">
        <span style="font-family: 'Courier New', Courier, monospace;">E:</span> ${email} <br>
        <span style="font-family: 'Courier New', Courier, monospace;">P:</span> ${phone}
      </div>

      <!-- COMMAND DECK (Links) -->
      <div style="font-size: 11px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.5px;">
        
        <!-- LINKEDIN -->
        <a href="${linkedinUrl}" style="color: #002FA7; text-decoration: none; font-weight: 700;">
          LINKEDIN
        </a>
        
        <span style="color: #d4d4d8; margin: 0 8px;">//</span>
        
        <!-- NETWORK (Website) -->
        <a href="https://nodalpoint.io" style="color: #002FA7; text-decoration: none; font-weight: 700;">
          HQ
        </a>
        
        <span style="color: #d4d4d8; margin: 0 8px;">//</span>
        
        <!-- BILL DEBUGGER (The Weapon) -->
        <a href="https://nodalpoint.io/bill-debugger" style="color: #002FA7; text-decoration: none; font-weight: 700;">
          [ RUN_FORENSIC_AUDIT ]
        </a>
      </div>

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
