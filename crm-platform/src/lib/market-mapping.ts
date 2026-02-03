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

// City definitions for easier management
const CITIES_HOUSTON = [
  'houston', 'katy', 'sugar land', 'the woodlands', 'conroe', 'cypress', 'humble',
  'alvin', 'angleton', 'bay city', 'channelview', 'cleveland', 'deer park',
  'friendswood', 'fulshear', 'la porte', 'league city', 'manvel', 'missouri city',
  'needville', 'pasadena', 'pasedena', 'pearland', 'porter', 'richmond', 'rosenberg',
  'rosharon', 'spring', 'stafford', 'tomball', 'waller', 'webster', 'galveston',
  'lake jackson', 'freeport', 'wharton', 'el campo'
];

const CITIES_WEST = [
  'midland', 'odessa', 'lubbock', 'amarillo', 'san angelo', 'abilene',
  'pecos', 'sweetwater', 'seymour', 'big spring', 'snyder', 'monahans',
  'andrews', 'lamesa', 'brownfield', 'levelland', 'hereford', 'plainview',
  'canyon', 'pampa', 'borger', 'dalhart', 'childress', 'vernon'
];

const CITIES_SOUTH = [
  'san antonio', 'corpus christi', 'laredo', 'mcallen', 'brownsville',
  'austin', 'round rock', 'san marcos', 'new braunfels', 'georgetown',
  'pflugerville', 'cedar park', 'leander', 'kyle', 'buda', 'lockhart',
  'segovia', 'kerrville', 'fredericksburg', 'boerne', 'pleasanton',
  'victoria', 'harlingen', 'mission', 'pharr', 'edinburg', 'weslaco',
  'del rio', 'eagle pass', 'alice', 'kingsville', 'rockport', 'port aransas',
  'bulverde', 'manor', 'marion', 'schertz', 'cibolo', 'converse'
];

// Note: LZ_NORTH is the default catch-all for Dallas/Fort Worth and others,
// but we list major ones here for explicit matching if needed.
const CITIES_NORTH = [
  'dallas', 'fort worth', 'arlington', 'plano', 'garland', 'irving',
  'grand prairie', 'mckinney', 'frisco', 'mesquite', 'carrollton',
  'denton', 'richardson', 'lewisville', 'tyler', 'waco', 'wichita falls',
  'college station', 'bryan', 'killeen', 'temple', 'longview', 'flower mound',
  'north richland hills', 'mansfield', 'rowlett', 'euless', 'desoto',
  'grapevine', 'bedford', 'cedar hill', 'texas city', 'haltom city',
  'wylie', 'keller', 'coppell', 'rockwall', 'huntsville', 'sherman',
  'denison', 'the colony', 'burleson', 'hurst', 'lancaster', 'little elm',
  'texarkana', 'lufkin', 'nacogdoches', 'paris', 'corsicana', 'greenville',
  'weatherford', 'waxahachie', 'cleburne', 'midlothian', 'stephenville',
  'granbury', 'mineral wells', 'gainesville', 'bonham', 'sulphur springs',
  'mount pleasant', 'jacksonville', 'palestine', 'athens', 'terrell',
  'forney', 'sachse', 'seagoville', 'balch springs', 'university park',
  'colleyville', 'southlake', 'keller', 'trophy club', 'highland village'
];

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

  // Check Houston
  if (CITIES_HOUSTON.some(city => c.includes(city)) || r.includes('houston') || r.includes('lz_houston')) {
    return ERCOT_ZONES.HOUSTON;
  }

  // Check West
  if (CITIES_WEST.some(city => c.includes(city)) || r.includes('west') || r.includes('lz_west')) {
    return ERCOT_ZONES.WEST;
  }

  // Check South
  if (CITIES_SOUTH.some(city => c.includes(city)) || r.includes('south') || r.includes('lz_south')) {
    return ERCOT_ZONES.SOUTH;
  }

  // Default to North (Dallas, Fort Worth, etc.)
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
