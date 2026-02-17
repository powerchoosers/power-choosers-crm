import React from 'react';
import { useAuth } from '@/context/AuthContext';

interface ForensicSignatureProps {
    isRawHtml?: boolean; // If true, returns string for API; if false, returns React component
}

const NODAL_BLUE = '#002FA7';
const ZINC_500 = '#71717a';
const ZINC_950 = '#09090b';

/**
 * ForensicSignature Component
 * High-deliverability minimalist email signature for Nodal Point.
 * Use for cold outreach in sequences.
 */
export const ForensicSignature: React.FC<ForensicSignatureProps> = ({ isRawHtml = false }) => {
    const { profile } = useAuth();

    if (!profile) return null;

    const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Nodal Point Architect';

    // If we need raw HTML string (e.g. for Zoho API injection), we use a helper instead
    // This component is primarily for frontend preview in the Protocol Builder.

    return (
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-white/5 max-w-[500px]">
            <table className="border-collapse font-sans" cellPadding="0" cellSpacing="0">
                <tbody>
                    <tr>
                        <td className="pr-3 align-top">
                            {profile.hostedPhotoUrl ? (
                                <img
                                    src={profile.hostedPhotoUrl}
                                    alt={fullName}
                                    className="w-12 h-12 rounded-[14px] object-cover block"
                                    style={{ borderRadius: '14px' }}
                                />
                            ) : (
                                <div
                                    className="w-12 h-12 bg-zinc-950 rounded-[14px] text-white flex items-center justify-center font-bold text-sm"
                                    style={{ borderRadius: '14px' }}
                                >
                                    {initials}
                                </div>
                            )}
                        </td>
                        <td className="border-l-2 border-[#002FA7] pl-3 align-middle">
                            <p className="m-0 text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                                {fullName}
                            </p>
                            <p className="m-0.5 font-mono text-[10px] text-zinc-500 uppercase tracking-widest leading-tight">
                                {profile.jobTitle || 'Market Architect'} // [VECTOR_OPS]
                            </p>
                            <a
                                href="https://nodalpoint.io"
                                className="text-xs text-[#002FA7] no-underline font-medium hover:underline"
                            >
                                nodalpoint.io
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td colSpan={2} className="pt-3">
                            <div className="font-mono text-[10px] font-bold tracking-widest leading-relaxed">
                                <div className="text-emerald-500">// SYSTEM_STATUS: OPERATIONAL</div>
                                <div className="text-zinc-900 dark:text-white">
                  // ACTIVE_DIAGNOSTIC: <span className="text-[#002FA7]">[ RUN_FORENSIC_SNAPSHOT ]</span>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default ForensicSignature;
