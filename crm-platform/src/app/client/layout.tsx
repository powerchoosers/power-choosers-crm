import { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
    title: 'Client Portal | Nodal Point',
    description: 'Your Nodal Point energy intelligence dashboard.',
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-zinc-950">
            {children}
        </div>
    );
}
