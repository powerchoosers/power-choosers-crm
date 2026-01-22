// Shared industry detection helpers for email generation and compose flows
// Centralizes all regex-based industry inference so changes stay in sync.

export function inferIndustryFromCompanyName(companyName) {
  if (!companyName) return '';

  const name = String(companyName).toLowerCase();

  // Manufacturing (including building materials, machinery, chemicals)
  if (/\b(manufacturing|manufacturer|industrial|factory|plant|fabrication|production|assembly|machinery|machine|equipment|chemical|chemicals|petrochemical|building\s+materials?|building\s+products?|lumber|millwork|concrete|ready\s+mix|asphalt|steel)\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Hospitality / Restaurant
  if (/\b(hotel|inn|motel|resort|lodge|restaurant|cafe|dining|hospitality)\b/i.test(name)) {
    return 'Hospitality';
  }

  // Healthcare (including dental / dentist offices)
  if (/\b(hospital|clinic|medical|healthcare|health\s*care|physician|doctor|dental|dentist|orthodontic|pharmacy)\b/i.test(name)) {
    return 'Healthcare';
  }

  // Retail
  if (/\b(retail|store|shop|market|outlet|merchandise|boutique)\b/i.test(name)) {
    return 'Retail';
  }

  // Logistics / Transportation / Warehousing
  if (/\b(logistics|transportation|warehouse|shipping|freight|delivery|distribution|trucking)\b/i.test(name)) {
    return 'Logistics';
  }

  // Data Center / Hosting / Cloud
  if (/\b(data\s*center|datacenter|server|hosting|cloud|colo)\b/i.test(name)) {
    return 'DataCenter';
  }

  // Nonprofit
  if (/\b(nonprofit|non-profit|charity|foundation|501c3|501\(c\)\(3\))\b/i.test(name)) {
    return 'Nonprofit';
  }

  // Education
  if (/\b(school|university|college|education|educational|academy|institute)\b/i.test(name)) {
    return 'Education';
  }

  // Construction
  if (/\b(construction|contractor|builder|contracting)\b/i.test(name)) {
    return 'Construction';
  }

  // Government / Public
  if (/\b(government|municipality|municipal|public|state|county|federal|agency)\b/i.test(name)) {
    return 'Government';
  }

  // Precision Manufacturing / Machine Shops
  if (/\b(precision|machine\s+shop|fabrication|metalworking|cnc|machining|tooling)\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Water/Utilities (for potential B2B partnerships)
  if (/\b(water|wastewater|utility|utilities|municipal)\b/i.test(name)) {
    return 'Government';
  }

  // Food Processing / Beverage (subset of Manufacturing)
  if (/\b(food\s+(processing|service)|beverage|brewery|distillery|bakery|meat\s+processing)\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Aviation / Aerospace (manufacturing subset)
  // Match full words and also "aero" and "air" as standalone terms
  if (/\b(aviation|aerospace|aircraft|airline|airport|charter|aero|air\s+(service|charter|base|operations?))\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Drilling / Oil & Gas (manufacturing subset)
  if (/\b(drilling|oil\s+gas|petroleum|refining|exploration|rig|well)\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Tube / Pipe / Tubing (manufacturing)
  if (/\b(tube|tubing|pipe|piping|conduit)\b/i.test(name)) {
    return 'Manufacturing';
  }

  // Lifting / Crane / Heavy Equipment (manufacturing/construction)
  if (/\b(lifting|crane|hoist|heavy\s+equipment|material\s+handling)\b/i.test(name)) {
    return 'Manufacturing';
  }

  return '';
}

export function inferIndustryFromDescription(description) {
  if (!description) return '';

  const desc = String(description).toLowerCase();

  // Hospitality
  if (/\b(hotel|inn|motel|resort|lodge|accommodation|hospitality|guest|room|booking|stay)\b/i.test(desc)) {
    return 'Hospitality';
  }

  // Restaurant / Food
  if (/\b(restaurant|cafe|dining|food|beverage|menu|cuisine|chef)\b/i.test(desc)) {
    return 'Hospitality';
  }

  // Manufacturing (including building materials, machinery, chemicals)
  if (/\b(manufacturing|production|factory|plant|industrial|assembly|fabrication|machinery|machine|equipment|chemical|chemicals|petrochemical|building\s+materials?|building\s+products?|lumber|millwork|concrete|ready\s+mix|asphalt|steel)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Healthcare (including dental / dentist offices)
  if (/\b(hospital|clinic|medical|healthcare|patient|treatment|diagnosis|surgery|dental|dentist|orthodontic)\b/i.test(desc)) {
    return 'Healthcare';
  }

  // Retail
  if (/\b(retail|store|merchandise|shopping|customer|product|sale)\b/i.test(desc)) {
    return 'Retail';
  }

  // Logistics
  if (/\b(logistics|warehouse|shipping|distribution|freight|transportation|delivery)\b/i.test(desc)) {
    return 'Logistics';
  }

  // Data Center
  if (/\b(data\s*center|server|hosting|cloud|infrastructure|computing)\b/i.test(desc)) {
    return 'DataCenter';
  }

  // Nonprofit
  if (/\b(nonprofit|charity|foundation|mission|donation|volunteer)\b/i.test(desc)) {
    return 'Nonprofit';
  }

  // Education
  if (/\b(school|university|college|education|student|learning|institution)\b/i.test(desc)) {
    return 'Education';
  }

  // Construction
  if (/\b(construction|contractor|builder|contracting|building)\b/i.test(desc)) {
    return 'Construction';
  }

  // Government
  if (/\b(government|municipality|public|state|county|federal|agency)\b/i.test(desc)) {
    return 'Government';
  }

  // Precision Manufacturing / Machine Shops
  if (/\b(precision|machine\s+shop|fabrication|metalworking|cnc|machining|tooling)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Water/Utilities
  if (/\b(water|wastewater|utility|utilities|municipal)\b/i.test(desc)) {
    return 'Government';
  }

  // Food Processing / Beverage
  if (/\b(food\s+(processing|service)|beverage|brewery|distillery|bakery|meat\s+processing)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Aviation / Aerospace
  if (/\b(aviation|aerospace|aircraft|airline|airport|charter|aero|air\s+(service|charter|base|operations?))\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Drilling / Oil & Gas
  if (/\b(drilling|oil\s+gas|petroleum|refining|exploration|rig|well)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Tube / Pipe / Tubing
  if (/\b(tube|tubing|pipe|piping|conduit)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  // Lifting / Crane / Heavy Equipment
  if (/\b(lifting|crane|hoist|heavy\s+equipment|material\s+handling)\b/i.test(desc)) {
    return 'Manufacturing';
  }

  return '';
}


