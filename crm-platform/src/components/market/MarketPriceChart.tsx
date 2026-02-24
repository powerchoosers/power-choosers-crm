'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useMemo } from 'react';

interface PricePoint {
    time: string;
    price: number;
}

interface MarketPriceChartProps {
    currentPrice: number;
    history?: PricePoint[];
}

export function MarketPriceChart({ currentPrice, history }: MarketPriceChartProps) {
    // If no history provided, generate a realistic 24h mockup trend
    const chartData = useMemo(() => {
        if (history && history.length > 0) return history;

        // Mockup 24 points (one per hour) leading up to current price
        const mockData: PricePoint[] = [];
        const basePrice = currentPrice > 0 ? currentPrice : 12.37;

        for (let i = 24; i >= 0; i--) {
            const now = new Date();
            now.setHours(now.getHours() - i);
            const hour = now.getHours();

            // Add some "market noise" and a slight daily curve
            const noise = (Math.random() - 0.5) * 4;
            const dailyCurve = Math.sin((hour - 6) * Math.PI / 12) * 5;

            mockData.push({
                time: `${hour}:00`,
                price: Math.max(1.5, basePrice + noise + dailyCurve)
            });
        }
        // Ensure the last point is exactly currentPrice
        mockData[mockData.length - 1].price = basePrice;

        return mockData;
    }, [currentPrice, history]);

    return (
        <div className="w-full h-full min-h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#002FA7" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#002FA7" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        dataKey="time"
                        hide
                    />
                    <YAxis
                        hide
                        domain={['auto', 'auto']}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-[#1A1A1A] border border-white/10 p-2 rounded-lg backdrop-blur-md shadow-xl">
                                        <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">{payload[0].payload.time}</p>
                                        <p className="text-sm font-mono font-bold text-white">${Number(payload[0].value).toFixed(2)}</p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#002FA7"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorPrice)"
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
