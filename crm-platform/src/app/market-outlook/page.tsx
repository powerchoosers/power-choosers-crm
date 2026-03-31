import { Metadata } from 'next';
import MarketOutlookContent from './MarketOutlookContent';

export const metadata: Metadata = {
    title: 'Nodal Point | Market Outlook',
    description: 'Forward price trends for Texas electricity buyers, explained in plain English.',
};

export default function MarketOutlookPage() {
    return <MarketOutlookContent />;
}
