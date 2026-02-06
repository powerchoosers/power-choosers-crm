// Maps high-level industry vectors to specific Supabase industry values
export const INDUSTRY_VECTORS: Record<string, string[]> = {
  'Manufacturing': [
    'Manufacturing',
    '3D Printing Materials',
    'Agricultural Plastics Manufacturing',
    'Battery Manufacturing',
    'Building Materials',
    'Building Materials Manufacturing',
    'Building Products',
    'Building Systems',
    'Chemical Manufacturing',
    'Electric Lighting Equipment Manufacturing',
    'Electrical & Electronic Manufacturing',
    'Electronics Assembly',
    'Electronics Manufacturing',
    'Equipment Manufacturing',
    'Furniture Manufacturing',
    'Hydraulic Components Manufacturing',
    'Industrial Assembly',
    'Industrial Equipment',
    'Industrial Machinery & Equipment',
    'Industrial Products',
    'Industrial Pump Manufacturing',
    'Manufacturing Services',
    'Manufacturing Support',
    'Manufacturing, Food & Beverage',
    'Medical Device Manufacturing',
    'Motor Vehicle Manufacturing',
    'Optical Equipment Manufacturing',
    'Optical Manufacturing',
    'Pipe Manufacturing',
    'Plastics Manufacturing',
    'Precision Components',
    'Precision Manufacturing',
    'Seismic Equipment Manufacturing',
    'Specialty Chemical Manufacturing',
    'Specialty Steel Manufacturing',
    'Steel Manufacturing',
    'Supplement Manufacturing',
    'Technology Manufacturing',
    'automotive',
    'aviation & aerospace',
    'building materials',
    'business supplies & equipment',
    'chemicals',
    'computer hardware',
    'defense & space',
    'electrical/electronic manufacturing',
    'furniture',
    'industrial automation',
    'machinery',
    'mechanical or industrial engineering',
    'medical devices',
    'mining & metals',
    'nanotechnology',
    'packaging & containers',
    'paper & forest products',
    'pharmaceuticals',
    'plastics',
    'printing',
    'semiconductors',
    'textiles',
    'glass, ceramics & concrete'
  ],
  'Healthcare': [
    'Healthcare',
    'Health Care and Social Assistance',
    'Assisted Living And Memory Care',
    'Hospitals, Healthcare & Clinics',
    'Nursing Homes and Residential Care Facilities',
    'biotechnology',
    'health, wellness & fitness',
    'hospital & health care',
    'individual & family services',
    'medical practice',
    'mental health care',
    'veterinary'
  ],
  'Real Estate': [
    'Real Estate',
    'Construction',
    'Construction Services',
    'Engineering & Construction',
    'architecture & planning',
    'civil engineering',
    'construction',
    'facilities services',
    'commercial real estate',
    'residential real estate'
  ],
  'Retail': [
    'Retail',
    'Retail Distribution',
    'Retailer',
    'Distribution',
    'Distribution Services',
    'Sporting Goods Distribution',
    'Wholesale Building Materials',
    'Wholesaler',
    'apparel & fashion',
    'consumer goods',
    'consumer services',
    'cosmetics',
    'import & export',
    'luxury goods & jewelry',
    'sporting goods',
    'supermarkets',
    'wholesale',
    'wine & spirits'
  ],
  'Education': [
    'Education',
    'School district office',
    'education management',
    'e-learning',
    'higher education',
    'primary/secondary education',
    'research'
  ],
  'Technology': [
    'Technology',
    'IT Services',
    'Information',
    'Technology Services',
    'Travel Technology',
    'computer & network security',
    'computer networking',
    'computer software',
    'information services',
    'information technology & services',
    'internet',
    'telecommunications',
    'Telecommunications Services'
  ],
  'Energy': [
    'Energy',
    'Oil & Gas',
    'Oil & Gas Production',
    'Oil, Gas & Mining',
    'oil & energy',
    'renewables & environment',
    'utilities'
  ],
  'Food & Beverage': [
    'Food & Beverage',
    'Accommodation and Food Services',
    'Agriculture Processing',
    'Food & Beverage Manufacturing',
    'Food Distribution',
    'Food Processing',
    'Ice Manufacturing',
    'Manufacturing, Food & Beverage',
    'dairy',
    'farming',
    'fishery',
    'food & beverages',
    'food production',
    'hospitality',
    'ranching',
    'restaurants'
  ],
  'Logistics & Warehouse': [
    'Cross-border Logistics',
    'logistics & supply chain',
    'package/freight delivery',
    'transportation/trucking/railroad',
    'warehousing',
    'distribution',
    'supply chain',
    'Transportation and Warehousing',
    'Warehousing & 3PL Services',
    'Transportation Services'
  ],
  'Services': [
    'Services',
    'Administrative and Support Services',
    'Business Services',
    'Finance and Insurance',
    'Financial Services/Housing Finance',
    'Hospitality',
    'Non-profit Organization Management',
    'Professional, Scientific, and Technical Services',
    'Public Administration',
    'Waste Management and Remediation Services',
    'accounting',
    'airlines/aviation',
    'banking',
    'capital markets',
    'design',
    'entertainment',
    'environmental services',
    'events services',
    'executive office',
    'financial services',
    'government administration',
    'human resources',
    'insurance',
    'international trade & development',
    'investment banking',
    'investment management',
    'law enforcement',
    'legal services',
    'logistics & supply chain',
    'management consulting',
    'maritime',
    'marketing & advertising',
    'media production',
    'nonprofit organization management',
    'package/freight delivery',
    'performing arts',
    'philanthropy',
    'photography',
    'public relations and communications',
    'public safety',
    'publishing',
    'recreational facilities & services',
    'security and investigations',
    'staffing & recruiting',
    'translation and localization',
    'transportation/trucking/railroad',
    'venture capital & private equity',
    'warehousing',
    'writing & editing'
  ]
};

// Helper to get all industry strings for a given set of vectors
export function getIndustryFilters(selectedVectors: string[]): string[] {
  return selectedVectors.flatMap(vector => INDUSTRY_VECTORS[vector] || [vector]);
}

/**
 * NEPQ-style: who is the Decision Maker (DM) vs Champion by industry.
 * Used for gatekeeper scripts so we ask for the right title (money conversation, not Facilities/IT).
 * Based on B2B research (SalesHive, RAIN Group) and NEPQ "Expert Guide" frame.
 */
export const NEPQ_DM_CHAMPION: Record<string, { decisionMaker: string[]; champion: string[] }> = {
  Manufacturing: { decisionMaker: ['COO', 'Controller'], champion: ['Plant Manager'] },
  Nonprofits: { decisionMaker: ['Executive Director', 'CFO'], champion: ['Facilities Director'] },
  'Retail': { decisionMaker: ['Owner', 'VP of Operations'], champion: ['General Manager'] },
  'Real Estate': { decisionMaker: ['Asset Manager'], champion: ['Property Manager'] },
  Healthcare: { decisionMaker: ['CFO', 'VP Operations'], champion: ['Facilities Director'] },
  Education: { decisionMaker: ['CFO', 'Business Director'], champion: ['Facilities Director'] },
  Technology: { decisionMaker: ['CFO', 'VP Operations'], champion: ['Facilities Manager'] },
  'Logistics & Warehouse': { decisionMaker: ['COO', 'VP Operations'], champion: ['Operations Manager'] },
  Services: { decisionMaker: ['CFO', 'VP Operations', 'Owner'], champion: ['Facilities Director', 'General Manager'] },
  'Food & Beverage': { decisionMaker: ['Owner', 'COO'], champion: ['General Manager'] },
  Energy: { decisionMaker: ['CFO', 'VP Operations'], champion: ['Facilities Manager'] },
};

/** Resolve raw industry string to NEPQ DM/Champion. Uses first matching vector. */
export function getNepqTargets(industry: string | null | undefined): { decisionMaker: string[]; champion: string[] } {
  const defaultTargets = { decisionMaker: ['CFO', 'VP Operations', 'Owner'], champion: ['Facilities Director', 'General Manager'] };
  if (!industry || typeof industry !== 'string') return defaultTargets;
  const normalized = industry.trim().toLowerCase();
  if (!normalized) return defaultTargets;
  // Nonprofit check first (often under "Services" in our vectors; we want NEPQ Nonprofits targets)
  if (normalized.includes('nonprofit') || normalized.includes('non-profit') || normalized.includes('non profit')) {
    return NEPQ_DM_CHAMPION.Nonprofits ?? defaultTargets;
  }
  // Find which INDUSTRY_VECTORS bucket this industry belongs to
  for (const [vector, values] of Object.entries(INDUSTRY_VECTORS)) {
    const match = values.some(v => v.toLowerCase() === normalized || normalized.includes(v.toLowerCase()));
    if (match && NEPQ_DM_CHAMPION[vector]) return NEPQ_DM_CHAMPION[vector];
  }
  // Fallback: direct key match (e.g. "Manufacturing", "Real Estate")
  for (const key of Object.keys(NEPQ_DM_CHAMPION)) {
    if (normalized.includes(key.toLowerCase())) return NEPQ_DM_CHAMPION[key];
  }
  return defaultTargets;
}
