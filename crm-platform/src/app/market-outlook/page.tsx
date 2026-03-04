import { Metadata } from 'next';
import MarketOutlookContent from './MarketOutlookContent';

export const metadata: Metadata = {
    title: 'Market Outlook | Nodal Point',
    description: 'ERCOT South Load Zone forward price curve — where volatility is hiding and when to lock in fixed rates before the grid reprices.',
};

export default function MarketOutlookPage() {
    return <MarketOutlookContent />;
}
