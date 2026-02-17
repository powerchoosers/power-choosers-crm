import { RATE_CONTEXT, FEEDBACK_THRESHOLDS } from './rateDatabase'

export interface BillAnalysis {
    allInRate: number;          // ¢/kWh (decimal: 0.0998 = 9.98¢, so 0.0998 is $0.0998/kWh)
    // Wait, let's stick to $ / kWh decimal to match rateDatabase (e.g., 0.0985)
    // Or should we use ¢? rateDatabase seems to use $0.0985 (decimal).
    // Yes, rateDatabase uses decimal dollars: 0.0985.

    energyComponent?: number;    // $/kWh
    deliveryComponent?: number;  // $/kWh
    peakDemandKW: number;
    totalUsage: number;
    totalBill: number;
    billingPeriod: string;
    provider: string;
    productType?: string;
    contractEndDate?: string;
}

export type FeedbackStatus = "green" | "yellow" | "red";

export interface FeedbackResult {
    status: FeedbackStatus;
    title: string;
    description: string;
    facilitySize: "large" | "small";
    actionItems: string[];
    variance: number; // Difference from market
    marketAvg: number;
    isRateEstimated: boolean; // If we calculated all-in from total/usage
    missingPeak: boolean; // If peak demand was missing/zero
    contractInfo: {
        detected: boolean;
        expiryDate?: string;
        timeRemaining?: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
}

export function generateFeedback(
    analysis: BillAnalysis,
    territory: "Oncor" | "CenterPoint" = "Oncor" // Default to Oncor for now
): FeedbackResult {
    const market = RATE_CONTEXT[territory];

    // 1. Determine Facility Size
    // If peak demand is 0/missing, use Usage to proxy.
    // 25,000 kWh/month is roughly the cutoff in the document (line 27: 25k kWh).
    const USAGE_THRESHOLD = 20000;

    let isFacilityLarge = false;
    let missingPeak = false;

    if (analysis.peakDemandKW > 0) {
        isFacilityLarge = analysis.peakDemandKW > market.demandMeteredThreshold;
    } else {
        // Proxy by usage if demand missing
        missingPeak = true;
        isFacilityLarge = analysis.totalUsage > USAGE_THRESHOLD;
    }

    const facilitySize = isFacilityLarge ? "large" : "small";

    // 2. Determine Market Benchmarks
    const marketAvg = isFacilityLarge
        ? market.largeMarketAverageAllIn
        : market.smallMarketAverageAllIn;

    // 3. Calculate Variance
    // allInRate might be derived: Total Bill / Total Usage
    const derivedRate = analysis.totalBill > 0 && analysis.totalUsage > 0
        ? analysis.totalBill / analysis.totalUsage
        : 0;

    // Use provided allInRate if valid, else derived
    const effectiveRate = analysis.allInRate > 0 ? analysis.allInRate : derivedRate;

    const variance = effectiveRate - marketAvg;

    // 4. Generate Status
    let status: FeedbackStatus = "yellow";

    if (isFacilityLarge) {
        if (effectiveRate < FEEDBACK_THRESHOLDS.green_large) {
            status = "green";
        } else if (effectiveRate < FEEDBACK_THRESHOLDS.yellow_large_high) {
            status = "yellow";
        } else {
            status = "red";
        }
    } else {
        // Small Facility
        if (effectiveRate < FEEDBACK_THRESHOLDS.green_small) {
            status = "green";
        } else if (effectiveRate < FEEDBACK_THRESHOLDS.yellow_small_high) {
            status = "yellow";
        } else {
            status = "red";
        }
    }

    // 5. Generate Title & Description
    let title = "";
    let description = "";

    const pctVariance = (Math.abs(variance) / marketAvg * 100).toFixed(1);
    const isBelow = variance < 0;
    const rateCent = (effectiveRate * 100).toFixed(2);
    const marketCent = (marketAvg * 100).toFixed(2);

    if (status === "green") {
        title = isFacilityLarge ? "You're Positioned Well" : "You're Locked in Well";
        description = `Your effective rate of ${rateCent}¢/kWh is ${pctVariance}% ${isBelow ? "below" : "near"} the regional benchmark of ${marketCent}¢/kWh. ${missingPeak ? "However, missing peak demand data obscures potential volatility risks." : "Your contract appears competitive."}`;
    } else if (status === "yellow") {
        title = isFacilityLarge
            ? "Rate is Market. Demand is the Opportunity."
            : "Rate is competitive for your size.";

        description = isFacilityLarge
            ? `You are paying market rates (${rateCent}¢/kWh). The real leverage point is likely your Peak Demand, which drives ~30% of delivery costs.`
            : `At ${rateCent}¢/kWh, you are within the normal range for small facilities. Focus on renewal timing to avoid post-term spikes.`;
    } else { // Red
        const isFixed = analysis.productType?.toLowerCase().includes('fixed');

        title = isFacilityLarge
            ? "Above-Market Rate Detected"
            : (isFixed ? "Competitive Pricing Opportunity" : "Likely Expired or Post-Term");

        description = isFacilityLarge
            ? `Your rate of ${rateCent}¢/kWh is ${pctVariance}% above the benchmark. This indicates either an older contract or inefficient demand management.`
            : (isFixed
                ? `You are on a Fixed Price plan at ${rateCent}¢/kWh, which is significantly above the market average of ${marketCent}¢/kWh. Resetting your rate could yield major savings.`
                : `You are paying ${rateCent}¢/kWh, which is significantly above the market average of ${marketCent}¢/kWh. You may be on a month-to-month penalty rate.`);
    }

    // 6. Action Items
    const actionItems: string[] = [];

    if (status === "green") {
        actionItems.push("Set renewal reminder 90 days before expiration");
        if (isFacilityLarge) actionItems.push("Monitor peak demand during summer months");
    } else if (status === "yellow") {
        actionItems.push("Review contract end date");
        if (isFacilityLarge) {
            actionItems.push("Quantify potential load shifting (after 9PM)");
            actionItems.push("Investigate demand response programs");
        }
    } else { // Red
        actionItems.push("URGENT: Check contract status for expiration");
        actionItems.push("Request competitive quotes immediately");
        if (isFacilityLarge) actionItems.push("Analyze load profile for peak spikes");
    }

    // 7. Contract Lifecycle Analysis (v2.2.3)
    let contractInfo: FeedbackResult['contractInfo'] = {
        detected: false,
        riskLevel: 'medium'
    };

    if (analysis.contractEndDate) {
        // Robust parsing for MM/YYYY or other formats
        let expiryDate = new Date(analysis.contractEndDate);

        // Handle MM/YYYY specifically if normal parsing is shaky
        if (isNaN(expiryDate.getTime()) && /^\d{1,2}\/\d{4}$/.test(analysis.contractEndDate)) {
            const [mm, yyyy] = analysis.contractEndDate.split('/');
            expiryDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 28); // End of month
        }

        if (!isNaN(expiryDate.getTime())) {
            const now = new Date();
            const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const diffYears = diffDays / 365;
            const monthsRemaining = Math.ceil(diffDays / 30);

            contractInfo = {
                detected: true,
                expiryDate: analysis.contractEndDate,
                timeRemaining: diffDays > 0 ? `${monthsRemaining} months` : 'Recently Expired',
                riskLevel: diffDays < 180 ? 'critical' : diffYears < 1.5 ? 'high' : 'low'
            };

            // Strategic Warnings
            if (status === "green" && diffYears > 0 && diffYears <= 2) {
                title = "Potential Budget Cliff Detected";
                description = `You are currently locked in at ${rateCent}¢/kWh, which is significantly below today's market rates. However, your contract expires in ${monthsRemaining} months. Given current volatility, you face a high risk of a 40-60% budget increase upon renewal.`;
                actionItems.unshift(`STRATEGY: Quote ${monthsRemaining > 12 ? 'forward' : 'immediate'} renewals now to hedge against further spikes.`);
            } else if (status === "red" && diffDays > 0 && diffDays < 180) {
                actionItems.unshift("CRITICAL: Current contract expires in < 6 months. Lock new rate immediately to avoid month-to-month penalties.");
            }
        }
    } else {
        // Contract end date NOT found
        actionItems.push("NOTICE: Contract end date not detected on bill. Verify expiration manually to avoid MTM penalty rates.");
    }

    // 8. Action Items Finalization
    const finalActionItems: string[] = [...new Set(actionItems)]; // Dedupe

    return {
        status,
        title,
        description,
        facilitySize,
        actionItems: finalActionItems,
        variance,
        marketAvg,
        isRateEstimated: effectiveRate === derivedRate,
        missingPeak,
        contractInfo
    };
}
