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
        title = isFacilityLarge
            ? "Above-Market Rate Detected"
            : "Likely Expired or Post-Term";

        description = isFacilityLarge
            ? `Your rate of ${rateCent}¢/kWh is ${pctVariance}% above the benchmark. This indicates either an older contract or inefficient demand management.`
            : `You are paying ${rateCent}¢/kWh, which is significantly above the market average of ${marketCent}¢/kWh. You may be on a month-to-month penalty rate.`;
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

    return {
        status,
        title,
        description,
        facilitySize,
        actionItems,
        variance,
        marketAvg,
        isRateEstimated: effectiveRate === derivedRate,
        missingPeak
    };
}
