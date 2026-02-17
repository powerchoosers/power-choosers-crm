export const RATE_CONTEXT = {
    "Oncor": {
        territory: "Dallas-Fort Worth",
        demandMeteredThreshold: 10,  // kW: above this = demand metered

        // LARGE FACILITY (>10kW demand, >20,000 kWh/month)
        largeMarketAverageAllIn: 0.0985,      // 9.85¢/kWh
        largeEnergyComponent: 0.055,          // 5.5¢/kWh (typical supply)
        largeDeliveryComponent: 0.052,        // 5.2¢/kWh (with demand ratchet)
        largeDemandCharge: 10.87818,          // $/kW (Oncor schedule)
        largeRatchetFloor: 0.80,              // 80% of highest 11-month

        // SMALL FACILITY (<10kW or <5,000 kWh/month, NO DEMAND METER)
        smallMarketAverageAllIn: 0.155,       // 15.5¢/kWh (locked contract)
        smallEnergyComponent: 0.080,          // 8.0¢/kWh (typical supply)
        smallDeliveryComponent: 0.075,        // 7.5¢/kWh (high fixed-charge impact)
        smallNoRatchet: true,                 // NO demand ratchet for small
        smallPostTermAverage: 0.240,          // 24.0¢/kWh (month-to-month penalty)
    },
    "CenterPoint": {
        territory: "Houston",
        demandMeteredThreshold: 10,
        largeMarketAverageAllIn: 0.0975,
        largeEnergyComponent: 0.050,
        largeDeliveryComponent: 0.047,
        largeDemandCharge: 9.72,              // $/kW (CenterPoint schedule)
        largeRatchetFloor: 0.80,
        smallMarketAverageAllIn: 0.150,
        smallEnergyComponent: 0.075,
        smallDeliveryComponent: 0.075,
        smallPostTermAverage: 0.235,
    }
};

export const FEEDBACK_THRESHOLDS = {
    // Large facility thresholds
    green_large: 0.0950,   // < this = green (below market)
    yellow_large_low: 0.0950,
    yellow_large_high: 0.1050,  // 9.50–10.50¢ = yellow (at market)
    red_large: 0.1050,     // > this = red (above market)

    // Small Facility thresholds
    green_small: 0.1400,   // < this = green (below market)
    yellow_small_low: 0.1400,
    yellow_small_high: 0.1600,  // 14.0–16.0¢ = yellow (at market)
    red_small: 0.1600,     // > this = red (above market, likely post-term)
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
