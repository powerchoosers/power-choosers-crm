/**
 * Utility to map Texas cities and regions to ERCOT Load Zones.
 */

export const ERCOT_ZONES = {
  NORTH: 'LZ_NORTH',
  SOUTH: 'LZ_SOUTH',
  WEST: 'LZ_WEST',
  HOUSTON: 'LZ_HOUSTON',
} as const;

export type ErcotZone = typeof ERCOT_ZONES[keyof typeof ERCOT_ZONES];

/**
 * Maps a city or state string to an ERCOT Load Zone.
 * Primarily focused on Texas cities.
 */
export function mapLocationToZone(city?: string, state?: string, rawLocation?: string): ErcotZone {
  const c = city?.toLowerCase().trim() || '';
  const s = state?.toLowerCase().trim() || '';
  const r = rawLocation?.toLowerCase().trim() || '';

  // If state is not Texas, default to North (most generic) or handle accordingly
  if (s && s !== 'tx' && s !== 'texas' && !r.includes('tx') && !r.includes('texas')) {
    return ERCOT_ZONES.NORTH;
  }

  // Houston Area
  if (
    c.includes('houston') || 
    c.includes('katy') || 
    c.includes('sugar land') || 
    c.includes('the woodlands') || 
    c.includes('conroe') ||
    c.includes('cypress') ||
    c.includes('humble') ||
    r.includes('houston') ||
    r.includes('lz_houston')
  ) {
    return ERCOT_ZONES.HOUSTON;
  }

  // West Texas
  if (
    c.includes('midland') || 
    c.includes('odessa') || 
    c.includes('lubbock') || 
    c.includes('amarillo') || 
    c.includes('san angelo') || 
    c.includes('abilene') ||
    r.includes('west') ||
    r.includes('lz_west')
  ) {
    return ERCOT_ZONES.WEST;
  }

  // South Texas
  if (
    c.includes('san antonio') || 
    c.includes('corpus christi') || 
    c.includes('laredo') || 
    c.includes('mcallen') || 
    c.includes('brownsville') ||
    r.includes('south') ||
    r.includes('lz_south')
  ) {
    return ERCOT_ZONES.SOUTH;
  }

  // Default to North (Dallas, Fort Worth, Austin, etc.)
  return ERCOT_ZONES.NORTH;
}

/**
 * Calculates a volatility index (0-100) based on real-time market metrics.
 */
export function calculateVolatilityIndex(params: {
  price: number;
  reserves: number;
  capacity: number;
  scarcity: number;
}): number {
  const { price, reserves, capacity, scarcity } = params;

  // 1. Price Component (0-40 points)
  // Base price is ~$20-30. Anything above $100 starts feeling volatile. $250+ is critical.
  let priceScore = 0;
  if (price > 20) priceScore = Math.min(40, ((price - 20) / 230) * 40);

  // 2. Reserve Component (0-40 points)
  // Low reserves mean high volatility.
  // 60,000+ MW capacity. If reserves < 3,000 MW, it's critical.
  const reserveRatio = capacity > 0 ? reserves / capacity : 0.05; // Default to 5% if unknown
  let reserveScore = 0;
  if (reserveRatio < 0.15) {
    // If below 15% reserves, start adding to score
    reserveScore = Math.min(40, (1 - (reserveRatio / 0.15)) * 40);
  }

  // 3. Scarcity Component (0-20 points)
  // Direct percentage from ERCOT
  const scarcityScore = Math.min(20, (scarcity / 100) * 20);

  const total = Math.round(priceScore + reserveScore + scarcityScore);
  
  // Ensure minimum floor of 12% for "normal" market noise
  return Math.max(12, Math.min(100, total));
}
