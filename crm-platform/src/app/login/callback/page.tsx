'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

function CallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams ? searchParams.get('token') : null;
    const [status, setStatus] = useState('Authenticating...');

    useEffect(() => {
        if (!token) {
            setStatus('No token found. Redirecting to login...');
            setTimeout(() => router.push('/login'), 2000);
            return;
        }

        const signIn = async () => {
            try {
                await signInWithCustomToken(auth, token);
                setStatus('Success! Redirecting...');
                router.push('/network');
            } catch (error: any) {
                console.error('Firebase Sign-In Error:', error);
                setStatus(`Authentication failed: ${error.message}`);
            }
        };

        signIn();
    }, [token, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
            <div className="w-full max-w-md space-y-8 p-8 bg-zinc-900 rounded-lg shadow text-center border border-zinc-800">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                    {status}
                </h2>
                {status.includes('Authenticating') && (
                    <div className="mt-4 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LoginCallbackPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-zinc-950">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        }>
            <CallbackContent />
        </Suspense>
    );
}
