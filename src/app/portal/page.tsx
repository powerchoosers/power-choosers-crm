import { Metadata } from 'next';
import PortalContent from './PortalContent';

export const metadata: Metadata = {
    title: 'Client Portal | Nodal Point',
    description: 'Access your forensic energy intelligence dashboard. Nodal Point client portal — existing clients only.',
};

export default function PortalPage() {
    return <PortalContent />;
}
