import { supabaseAdmin } from '@/lib/supabase';
import SignatureClient from '@/app/secure-portal/sign/[token]/SignatureClient';

export const metadata = {
    title: 'Secure Document Execution | Nodal Point',
};

export default async function SecureSignPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    // Validate the token and fetch request details
    const { data: request, error } = await supabaseAdmin
        .from('signature_requests')
        .select('*, document:documents(*), contact:contacts(*)')
        .eq('access_token', token)
        .single();

    if (error || !request) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-mono">
                <div className="h-12 w-12 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 flex items-center justify-center mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <h1 className="text-xl text-zinc-200 uppercase tracking-widest mb-2">Invalid or Expired Link</h1>
                <p className="text-sm text-zinc-500 max-w-md">
                    This secure link is no longer valid. If you believe this is an error, please contact your Nodal Point representative.
                </p>
            </div>
        );
    }

    // If already signed, show completed view
    if (request.status === 'signed' || request.status === 'completed') {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-mono">
                <div className="h-12 w-12 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </div>
                <h1 className="text-xl text-zinc-200 uppercase tracking-widest mb-2">Document Executed</h1>
                <p className="text-sm text-zinc-500 max-w-md">
                    This document has already been fully executed and a forensic copy has been emailed to {request.contact?.email}.
                </p>
            </div>
        );
    }

    // Get temporary signed URL for the document so the client can render it safely
    const { data: urlData, error: urlError } = await supabaseAdmin.storage
        .from('vault')
        .createSignedUrl(request.document.storage_path, 3600); // 1 hour expiry

    const documentUrl = urlData?.signedUrl || null;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200 selection:bg-[#002FA7]">
            <SignatureClient
                token={token}
                request={request}
                documentUrl={documentUrl}
            />
        </div>
    );
}
