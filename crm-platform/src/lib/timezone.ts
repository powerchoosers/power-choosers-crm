/**
 * Utility to resolve IANA timezone string based on US city, state, or phone area code.
 */

const STATE_TIMEZONES: Record<string, string> = {
  // Eastern
  'ct': 'America/New_York',
  'de': 'America/New_York',
  'dc': 'America/New_York',
  'fl': 'America/New_York', // mostly Eastern, panhandle Central
  'ga': 'America/New_York',
  'in': 'America/New_York', // mostly Eastern, some Central
  'ky': 'America/New_York', // split Eastern/Central
  'me': 'America/New_York',
  'md': 'America/New_York',
  'ma': 'America/New_York',
  'mi': 'America/New_York', // mostly Eastern, some Central
  'nh': 'America/New_York',
  'nj': 'America/New_York',
  'ny': 'America/New_York',
  'nc': 'America/New_York',
  'oh': 'America/New_York',
  'pa': 'America/New_York',
  'ri': 'America/New_York',
  'sc': 'America/New_York',
  'vt': 'America/New_York',
  'va': 'America/New_York',
  'wv': 'America/New_York',
  'connecticut': 'America/New_York',
  'delaware': 'America/New_York',
  'district of columbia': 'America/New_York',
  'florida': 'America/New_York',
  'georgia': 'America/New_York',
  'indiana': 'America/New_York',
  'kentucky': 'America/New_York',
  'maine': 'America/New_York',
  'maryland': 'America/New_York',
  'massachusetts': 'America/New_York',
  'michigan': 'America/New_York',
  'new hampshire': 'America/New_York',
  'new jersey': 'America/New_York',
  'new york': 'America/New_York',
  'north carolina': 'America/New_York',
  'ohio': 'America/New_York',
  'pennsylvania': 'America/New_York',
  'rhode island': 'America/New_York',
  'south carolina': 'America/New_York',
  'vermont': 'America/New_York',
  'virginia': 'America/New_York',
  'west virginia': 'America/New_York',

  // Central
  'al': 'America/Chicago',
  'alabama': 'America/Chicago',
  'ar': 'America/Chicago',
  'arkansas': 'America/Chicago',
  'il': 'America/Chicago',
  'illinois': 'America/Chicago',
  'ia': 'America/Chicago',
  'iowa': 'America/Chicago',
  'ks': 'America/Chicago', // split Central/Mountain
  'kansas': 'America/Chicago',
  'la': 'America/Chicago',
  'louisiana': 'America/Chicago',
  'mn': 'America/Chicago',
  'minnesota': 'America/Chicago',
  'ms': 'America/Chicago',
  'mississippi': 'America/Chicago',
  'mo': 'America/Chicago',
  'missouri': 'America/Chicago',
  'ne': 'America/Chicago', // split Central/Mountain
  'nebraska': 'America/Chicago',
  'nd': 'America/Chicago', // split Central/Mountain
  'north dakota': 'America/Chicago',
  'ok': 'America/Chicago',
  'oklahoma': 'America/Chicago',
  'sd': 'America/Chicago', // split Central/Mountain
  'south dakota': 'America/Chicago',
  'tn': 'America/Chicago', // split Central/Eastern
  'tennessee': 'America/Chicago',
  'tx': 'America/Chicago', // split Central/Mountain
  'texas': 'America/Chicago',
  'wi': 'America/Chicago',
  'wisconsin': 'America/Chicago',

  // Mountain
  'az': 'America/Phoenix', // Arizona (MST, no DST)
  'arizona': 'America/Phoenix',
  'co': 'America/Denver',
  'colorado': 'America/Denver',
  'id': 'America/Denver', // split Mountain/Pacific
  'idaho': 'America/Denver',
  'mt': 'America/Denver',
  'montana': 'America/Denver',
  'nm': 'America/Denver',
  'new mexico': 'America/Denver',
  'ut': 'America/Denver',
  'utah': 'America/Denver',
  'wy': 'America/Denver',
  'wyoming': 'America/Denver',

  // Pacific
  'ca': 'America/Los_Angeles',
  'california': 'America/Los_Angeles',
  'nv': 'America/Los_Angeles', // split Pacific/Mountain
  'nevada': 'America/Los_Angeles',
  'or': 'America/Los_Angeles', // split Pacific/Mountain
  'oregon': 'America/Los_Angeles',
  'wa': 'America/Los_Angeles',
  'washington': 'America/Los_Angeles',

  // Alaska & Hawaii
  'ak': 'America/Anchorage',
  'alaska': 'America/Anchorage',
  'hi': 'America/Honolulu',
  'hawaii': 'America/Honolulu',
};

// Override key cities in split states
const CITY_TIMEZONE_OVERRIDES: Record<string, string> = {
  // Texas - El Paso is Mountain time
  'el paso': 'America/Denver',
  
  // Florida - Panhandle is Central time
  'pensacola': 'America/Chicago',
  'panama city': 'America/Chicago',
  
  // Indiana - Gary & Evansville are Central time
  'gary': 'America/Chicago',
  'hammond': 'America/Chicago',
  'evansville': 'America/Chicago',

  // Tennessee - Eastern part is Eastern time
  'knoxville': 'America/New_York',
  'chattanooga': 'America/New_York',
  'johnson city': 'America/New_York',
  'kingsport': 'America/New_York',
  
  // Idaho - Northern part is Pacific time
  'coeur dalene': 'America/Los_Angeles',
  "coeur d'alene": 'America/Los_Angeles',
  'lewiston': 'America/Los_Angeles',
};

// Maps US area codes to their state abbreviation
const AREA_CODE_TO_STATE: Record<string, string> = {
  '201': 'NJ', '202': 'DC', '203': 'CT', '205': 'AL', '206': 'WA', '207': 'ME', '208': 'ID', '209': 'CA',
  '210': 'TX', '212': 'NY', '213': 'CA', '214': 'TX', '215': 'PA', '216': 'OH', '217': 'IL', '218': 'MN',
  '219': 'IN', '220': 'OH', '223': 'PA', '224': 'IL', '225': 'LA', '228': 'MS', '229': 'GA', '231': 'MI',
  '234': 'OH', '239': 'FL', '240': 'MD', '248': 'MI', '251': 'AL', '252': 'NC', '253': 'WA', '254': 'TX',
  '256': 'AL', '260': 'IN', '262': 'WI', '267': 'PA', '269': 'MI', '270': 'KY', '272': 'PA', '276': 'VA',
  '281': 'TX', '301': 'MD', '302': 'DE', '303': 'CO', '304': 'WV', '305': 'FL', '307': 'WY', '308': 'NE',
  '309': 'IL', '310': 'CA', '312': 'IL', '313': 'MI', '314': 'MO', '315': 'NY', '316': 'KS', '317': 'IN',
  '318': 'LA', '319': 'IA', '320': 'MN', '321': 'FL', '323': 'CA', '325': 'TX', '326': 'OH', '330': 'OH',
  '331': 'IL', '332': 'NY', '334': 'AL', '336': 'NC', '337': 'LA', '346': 'TX', '347': 'NY', '351': 'MA',
  '352': 'FL', '360': 'WA', '361': 'TX', '364': 'KY', '385': 'UT', '386': 'FL', '401': 'RI', '402': 'NE',
  '404': 'GA', '405': 'OK', '406': 'MT', '407': 'FL', '409': 'TX', '410': 'MD', '412': 'PA', '413': 'MA',
  '414': 'WI', '415': 'CA', '417': 'MO', '419': 'OH', '423': 'TN', '424': 'CA', '425': 'WA', '430': 'TX',
  '432': 'TX', '434': 'VA', '435': 'UT', '440': 'OH', '442': 'CA', '443': 'MD', '447': 'IL', '458': 'OR',
  '463': 'IN', '464': 'IL', '469': 'TX', '470': 'GA', '475': 'CT', '478': 'GA', '479': 'AR', '480': 'AZ',
  '484': 'PA', '501': 'AR', '502': 'KY', '503': 'OR', '504': 'LA', '505': 'NM', '507': 'MN', '508': 'MA',
  '509': 'WA', '510': 'CA', '512': 'TX', '513': 'OH', '515': 'IA', '516': 'NY', '517': 'MI', '518': 'NY',
  '520': 'AZ', '531': 'NE', '534': 'WI', '539': 'OK', '540': 'VA', '541': 'OR', '551': 'NJ', '559': 'CA',
  '561': 'FL', '562': 'CA', '563': 'IA', '564': 'WA', '567': 'OH', '570': 'PA', '571': 'VA', '573': 'MO',
  '574': 'IN', '575': 'NM', '580': 'OK', '585': 'NY', '586': 'MI', '601': 'MS', '602': 'AZ', '603': 'NH',
  '605': 'SD', '606': 'KY', '607': 'NY', '608': 'WI', '609': 'NJ', '610': 'PA', '612': 'MN', '614': 'OH',
  '615': 'TN', '616': 'MI', '617': 'MA', '618': 'IL', '619': 'CA', '620': 'KS', '623': 'AZ', '626': 'CA',
  '629': 'TN', '630': 'IL', '631': 'NY', '636': 'MO', '641': 'IA', '646': 'NY', '650': 'CA', '651': 'MN',
  '657': 'CA', '660': 'MO', '661': 'CA', '662': 'MS', '667': 'MD', '669': 'CA', '678': 'GA', '681': 'WV',
  '682': 'TX', '701': 'ND', '702': 'NV', '703': 'VA', '704': 'NC', '706': 'GA', '707': 'CA', '708': 'IL',
  '712': 'IA', '713': 'TX', '714': 'CA', '715': 'WI', '716': 'NY', '717': 'PA', '718': 'NY', '719': 'CO',
  '720': 'CO', '724': 'PA', '725': 'NV', '727': 'FL', '731': 'TN', '732': 'NJ', '734': 'MI', '737': 'TX',
  '740': 'OH', '743': 'NC', '747': 'CA', '754': 'FL', '757': 'VA', '760': 'CA', '762': 'GA', '763': 'MN',
  '765': 'IN', '769': 'MS', '770': 'GA', '771': 'DC', '772': 'FL', '773': 'IL', '774': 'MA', '775': 'NV',
  '779': 'IL', '781': 'MA', '785': 'KS', '786': 'FL', '801': 'UT', '802': 'VT', '803': 'SC', '804': 'VA',
  '805': 'CA', '806': 'TX', '808': 'HI', '810': 'MI', '812': 'IN', '813': 'FL', '814': 'PA', '815': 'IL',
  '816': 'MO', '817': 'TX', '818': 'CA', '828': 'NC', '830': 'TX', '831': 'CA', '832': 'TX', '838': 'NY',
  '843': 'SC', '845': 'NY', '847': 'IL', '848': 'NJ', '850': 'FL', '854': 'SC', '856': 'NJ', '857': 'MA',
  '858': 'CA', '859': 'KY', '860': 'CT', '862': 'NJ', '863': 'FL', '864': 'SC', '865': 'TN', '870': 'AR',
  '872': 'IL', '878': 'PA', '901': 'TN', '903': 'TX', '904': 'FL', '906': 'MI', '907': 'AK', '908': 'NJ',
  '909': 'CA', '910': 'NC', '912': 'GA', '913': 'KS', '914': 'NY', '915': 'TX', '916': 'CA', '917': 'NY',
  '918': 'OK', '919': 'NC', '920': 'WI', '925': 'CA', '928': 'AZ', '929': 'NY', '930': 'IN', '931': 'TN',
  '934': 'NY', '936': 'TX', '937': 'OH', '938': 'AL', '940': 'TX', '941': 'FL', '947': 'MI', '949': 'CA',
  '951': 'CA', '952': 'MN', '954': 'FL', '956': 'TX', '959': 'CT', '970': 'CO', '971': 'OR', '972': 'TX',
  '973': 'NJ', '978': 'MA', '979': 'TX', '980': 'NC', '984': 'NC', '985': 'LA', '986': 'ID', '989': 'MI'
};

export function resolveTimezone(params: { city?: string; state?: string; phone?: string }): string {
  const normState = params.state?.toLowerCase().trim() || '';
  const normCity = params.city?.toLowerCase().trim() || '';

  // 1. Try resolving using direct state mapping first
  if (normState) {
    if (STATE_TIMEZONES[normState]) {
      // Check for city overrides in split states
      if (CITY_TIMEZONE_OVERRIDES[normCity]) {
        return CITY_TIMEZONE_OVERRIDES[normCity];
      }
      return STATE_TIMEZONES[normState];
    }
  }

  // 2. Try resolving via phone area code if city/state missing or unresolved
  if (params.phone) {
    const digits = params.phone.replace(/\D/g, '');
    const cleanDigits = digits.startsWith('1') ? digits.slice(1) : digits;
    const areaCode = cleanDigits.slice(0, 3);
    
    if (areaCode && AREA_CODE_TO_STATE[areaCode]) {
      const stateFromPhone = AREA_CODE_TO_STATE[areaCode].toLowerCase();
      if (STATE_TIMEZONES[stateFromPhone]) {
        if (CITY_TIMEZONE_OVERRIDES[normCity]) {
          return CITY_TIMEZONE_OVERRIDES[normCity];
        }
        return STATE_TIMEZONES[stateFromPhone];
      }
    }
  }

  // Default fallback for Nodal Point
  return 'America/Chicago';
}
