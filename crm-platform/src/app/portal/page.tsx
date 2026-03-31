import { Metadata } from 'next';
import PortalContent from './PortalContent';

export const metadata: Metadata = {
    title: 'Nodal Point | Client Portal',
    description: 'Access your client dashboard. Existing clients only.',
};

export default function PortalPage() {
    return <PortalContent />;
}
