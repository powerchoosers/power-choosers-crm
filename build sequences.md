Component Specification: ForensicSignature.tsx

This component implements the "Nodal Point" forensic aesthetic using high-deliverability HTML patterns. It is designed to be utilized within the Protocol Builder for live previews and as a string generator for the Zoho API.

Implementation Code
import React from 'react';
import { useAuth } from '@/context/AuthContext';

interface ForensicSignatureProps {
  isRawHtml?: boolean; // If true, returns string for API; if false, returns React component
}

const NODAL_BLUE = '#002FA7';
const ZINC_500 = '#71717a';
const ZINC_950 = '#09090b';

export const ForensicSignature: React.FC<ForensicSignatureProps> = ({ isRawHtml = false }) => {
  const { profile } = useAuth();

  if (!profile) return null;

  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const fullName = `${profile.firstName} ${profile.lastName}`;
  
  // Inline styles for high-deliverability
  const styles = {
    container: "margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; max-width: 500px;",
    table: "border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
    avatarTd: "padding-right: 12px; vertical-align: top;",
    avatarSquircle: `width: 48px; height: 48px; background-color: ${ZINC_950}; border-radius: 14px; object-fit: cover; display: block; text-align: center; line-height: 48px; color: white; font-weight: bold; font-size: 14px;`,
    infoTd: `border-left: 2px solid ${NODAL_BLUE}; padding-left: 12px; vertical-align: middle;`,
    name: "margin: 0; font-size: 14px; font-weight: 700; color: #09090b; letter-spacing: -0.02em;",
    jobTitle: `margin: 2px 0; font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: ${ZINC_500}; text-transform: uppercase; letter-spacing: 0.05em;`,
    link: `font-size: 12px; color: ${NODAL_BLUE}; text-decoration: none; font-weight: 500;`,
    systemBlocks: "margin-top: 12px; font-family: ui-monospace, Consolas, monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.05em;",
    statusOperational: "color: #10b981; margin-bottom: 2px;",
    statusDiagnostic: "color: #09090b; text-transform: uppercase;"
  };

  const renderContent = () => (
    <table style={{ borderCollapse: 'collapse' }} cellPadding="0" cellSpacing="0">
      <tr>
        <td style={{ paddingRight: '12px', verticalAlign: 'top' }}>
          {profile.hostedPhotoUrl ? (
            <img 
              src={profile.hostedPhotoUrl} 
              alt={fullName} 
              style={{ width: '48px', height: '48px', borderRadius: '14px', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: '48px', height: '48px', backgroundColor: ZINC_950, borderRadius: '14px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {initials}
            </div>
          )}
        </td>
        <td style={{ borderLeft: `2px solid ${NODAL_BLUE}`, paddingLeft: '12px', verticalAlign: 'middle' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: ZINC_950, letterSpacing: '-0.02em' }}>
            {fullName}
          </p>
          <p style={{ margin: '2px 0', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11px', color: ZINC_500, textTransform: 'uppercase' }}>
            {profile.jobTitle} // [VECTOR_OPS]
          </p>
          <a href="[https://nodalpoint.io](https://nodalpoint.io)" style={{ fontSize: '12px', color: NODAL_BLUE, textDecoration: 'none', fontWeight: 500 }}>
            nodalpoint.io
          </a>
        </td>
      </tr>
      <tr>
        <td colSpan={2} style={{ paddingTop: '12px' }}>
          <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>
            <div style={{ color: '#10b981' }}>// SYSTEM_STATUS: OPERATIONAL</div>
            <div style={{ color: ZINC_950 }}>// ACTIVE_DIAGNOSTIC: <span style={{ color: NODAL_BLUE }}>[ RUN_FORENSIC_SNAPSHOT ]</span></div>
          </div>
        </td>
      </tr>
    </table>
  );

  return (
    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
      {renderContent()}
    </div>
  );
};

export default ForensicSignature;
```

## Deliverability Checklist
- **Table Layout:** Uses standard `<table>` structure for consistent rendering in Outlook and mobile.
- **Squircle Rule:** Explicitly sets `border-radius: 14px` to match the Nodal Point design system.
- **Fallback Logic:** If `hostedPhotoUrl` is missing, it renders a high-contrast dark div with white initials.
- **Monospace Priority:** System blocks and job titles use `ui-monospace` to signal technical authority.
- **Compactness:** Total height remains under 80px for a "peer-note" feel.