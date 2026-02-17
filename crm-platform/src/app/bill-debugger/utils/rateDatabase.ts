export const RATE_CONTEXT = {
    "Oncor": {
        territory: "Dallas-Fort Worth",
        demandMeteredThreshold: 10,  // kW: above this = demand metered

        // LARGE FACILITY (>10kW demand, >25,000 kWh/month)
        largeMarketAverageAllIn: 0.1150,      // 11.5¢/kWh (Retail Energy + Delivery)
        largeEnergyComponent: 0.0720,          // 7.2¢/kWh (Sold Energy Rate)
        largeDeliveryComponent: 0.044,        // 4.4¢/kWh (Typical TDSP)
        largeDemandCharge: 10.87818,          // $/kW (Oncor schedule)
        largeRatchetFloor: 0.80,              // 80% of highest 11-month

        // SMALL FACILITY (<10kW or <5,000 kWh/month, NO DEMAND METER)
        smallMarketAverageAllIn: 0.1350,       // 13.5¢/kWh (Sold Energy + Delivery)
        smallEnergyComponent: 0.0900,          // 9.0¢/kWh (Sold Energy Rate)
        smallDeliveryComponent: 0.045,        // 4.5¢/kWh (Simplified TDSP impact)
        smallNoRatchet: true,                 // NO demand ratchet for small
        smallPostTermAverage: 0.240,          // 24.0¢/kWh (month-to-month penalty)
    },
    "CenterPoint": {
        territory: "Houston",
        demandMeteredThreshold: 10,
        largeMarketAverageAllIn: 0.1120,
        largeEnergyComponent: 0.0680,
        largeDeliveryComponent: 0.044,
        largeDemandCharge: 9.72,              // $/kW (CenterPoint schedule)
        largeRatchetFloor: 0.80,
        smallMarketAverageAllIn: 0.1320,
        smallEnergyComponent: 0.0880,
        smallDeliveryComponent: 0.044,
        smallPostTermAverage: 0.235,
    }
};

export const FEEDBACK_THRESHOLDS = {
    // Large facility thresholds
    green_large: 0.1100,   // < this = green (below market)
    yellow_large_low: 0.1100,
    yellow_large_high: 0.1250,  // 11.0–12.5¢ = yellow (at market)
    red_large: 0.1250,     // > this = red (above market)

    // Small Facility thresholds
    green_small: 0.1300,   // < this = green (below market)
    yellow_small_low: 0.1300,
    yellow_small_high: 0.1500,  // 13.0–15.0¢ = yellow (at market)
    red_small: 0.1500,     // > this = red (above market)
};

/**
 * Maps an ERCOT Load Zone to a specific TDU territory for benchmarking.
 */
export function getTerritoryFromZone(zone: string): "Oncor" | "CenterPoint" {
    const z = zone.toUpperCase();
    if (z.includes('HOUSTON')) return "CenterPoint";
    // Default to Oncor for North, West, South for commercial benchmarking in this CRM's primary footprint
    return "Oncor";
}

/**
 * Gets the market context metadata for a given zone/territory.
 */
export function getMarketContext(zoneOrTerritory: string) {
    const territory = zoneOrTerritory.includes('LZ_')
        ? getTerritoryFromZone(zoneOrTerritory)
        : (zoneOrTerritory === "CenterPoint" ? "CenterPoint" : "Oncor");

    return RATE_CONTEXT[territory];
}
