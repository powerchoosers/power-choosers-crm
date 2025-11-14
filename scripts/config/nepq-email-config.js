/**
 * NEPQ Cold Email Configuration
 * Defines angles, exemption types, news hooks, and personalization rules
 * Based on NEPQ-Driven Cold Email Optimization Guide
 */

// ========== TAX EXEMPTION CONFIGURATION ==========

/**
 * Map industries to tax exemption types
 * Used to automatically determine if a prospect qualifies for tax exemption recovery
 */
export const INDUSTRY_EXEMPTION_MAP = {
  // Manufacturing (Federal exemption)
  'Manufacturing': 'Manufacturing',
  'Industrial': 'Manufacturing',
  'Factory': 'Manufacturing',
  'Production': 'Manufacturing',
  'Chemical Manufacturing': 'Manufacturing',
  'Food Manufacturing': 'Manufacturing',
  
  // Nonprofit (501(c)(3) exemption)
  'Nonprofit': 'Nonprofit',
  'Non-Profit': 'Nonprofit',
  'Charity': 'Nonprofit',
  'Foundation': 'Nonprofit',
  'Religious Organization': 'Nonprofit',
  'Educational Institution': 'Nonprofit',
  
  // Government (Government exemption)
  'Government': 'Government',
  'Public Sector': 'Government',
  'Municipal': 'Government',
  'State Agency': 'Government',
  'Federal Agency': 'Government',
  'School District': 'Government',
  'Public School': 'Government',
  
  // RV Parks (Predominant use exemption)
  'RV Park': 'RVPark',
  'Mobile Home Park': 'RVPark',
  'Campground': 'RVPark',
  'Trailer Park': 'RVPark',
  
  // Healthcare (Varies by type - often nonprofit)
  'Healthcare': 'Healthcare',
  'Hospital': 'Healthcare',
  'Medical Center': 'Healthcare',
  'Clinic': 'Healthcare',
  'Nursing Home': 'Healthcare'
};

/**
 * Exemption type details with refund potential and claim process
 */
export const EXEMPTION_TYPES = {
  Manufacturing: {
    name: 'Manufacturing',
    description: 'Manufacturing electricity sales tax exemption',
    refundPotential: '$50K–$200K over 4 years',
    refundPotentialMin: 50000,
    refundPotentialMax: 200000,
    qualifyingUsage: 'Electricity used in manufacturing process is federally exempt from sales tax',
    claimProcess: 'File Form 01-339 (Sales and Use Tax Exemption Certificate) with electricity provider',
    refundWindow: '4 years retroactive',
    priority: 1 // Highest priority - clear-cut exemption
  },
  
  Nonprofit: {
    name: 'Nonprofit',
    description: '501(c)(3) nonprofit electricity sales tax exemption',
    refundPotential: '$20K–$150K over 4 years',
    refundPotentialMin: 20000,
    refundPotentialMax: 150000,
    qualifyingUsage: 'Electricity used for exempt purposes at nonprofit facilities',
    claimProcess: 'File Form 01-339 with 501(c)(3) documentation to electricity provider',
    refundWindow: '4 years retroactive',
    priority: 1
  },
  
  RVPark: {
    name: 'RVPark',
    description: 'RV Park predominant use electricity sales tax exemption',
    refundPotential: '$50K–$500K over 4 years for multi-park operators',
    refundPotentialMin: 50000,
    refundPotentialMax: 500000,
    qualifyingUsage: 'If >50% of electricity is used by long-term residents (30+ day stays), entire bill is exempt',
    claimProcess: 'Conduct predominant use study (12 months), submit Form 01-339 + study, file Form 01-158 for refunds',
    refundWindow: '4 years retroactive',
    priority: 1
  },
  
  Government: {
    name: 'Government',
    description: 'Government entity electricity sales tax exemption',
    refundPotential: '$30K–$250K over 4 years',
    refundPotentialMin: 30000,
    refundPotentialMax: 250000,
    qualifyingUsage: 'Electricity for government use is exempt',
    claimProcess: 'File Form 01-339 with government entity documentation',
    refundWindow: '4 years retroactive',
    priority: 1
  },
  
  Healthcare: {
    name: 'Healthcare',
    description: 'Healthcare facility electricity sales tax exemption (varies)',
    refundPotential: '$25K–$200K over 4 years',
    refundPotentialMin: 25000,
    refundPotentialMax: 200000,
    qualifyingUsage: 'Varies by facility type - nonprofit hospitals typically exempt',
    claimProcess: 'Verify exemption status, file Form 01-339 if applicable',
    refundWindow: '4 years retroactive',
    priority: 2 // Lower priority - not always exempt
  }
};

// ========== NEWS HOOKS FOR 2025 ==========

/**
 * Current market news and trends to weave into emails
 * Adds relevance and urgency to outreach
 */
export const NEWS_HOOKS_2025 = {
  rate_spike_national: {
    key: 'rate_spike_national',
    headline: 'Residential electricity prices up 11% nationally in 2025',
    fact: 'Residential electricity prices increased 11% nationally from January to August 2025',
    date: '2025',
    source: 'CBS News',
    relevance: ['timing_risk', 'budget_certainty', 'contract_urgency'],
    emailHook: 'With electricity rates up 11% nationally this year, timing your renewal matters.'
  },
  
  rate_spike_nj: {
    key: 'rate_spike_nj',
    headline: 'New Jersey electricity rates spike 17% in 2025',
    fact: 'New Jersey residential rates increased 17% effective June 2025',
    date: 'June 2025',
    source: 'CBS News',
    relevance: ['timing_risk', 'volatility_protection'],
    emailHook: 'Residential rates spiked 17% in New Jersey this year—commercial markets tracking similar.'
  },
  
  rate_hikes_approved: {
    key: 'rate_hikes_approved',
    headline: '$34 billion in rate hike requests approved in 2025',
    fact: 'Rate increase requests and approvals totaled $34 billion in first 3 quarters of 2025 (vs. $16 billion in 2024), affecting over 124 million customers',
    date: '2025 Q1-Q3',
    source: 'Industry Report',
    relevance: ['multi_site', 'consolidation', 'budget_certainty'],
    emailHook: 'With $34 billion in rate hikes approved nationally this year, centralizing your energy agreements protects your budget.'
  },
  
  ai_data_center_demand: {
    key: 'ai_data_center_demand',
    headline: 'AI and data centers drove electricity rates up 50% (2023-2024)',
    fact: 'AI and data centers pushed electricity rates up 50% between 2023-2024, with energy demand expected to grow 42% by 2035',
    date: '2023-2024',
    source: 'AppDirect Energy Report',
    relevance: ['demand_efficiency', 'timing_risk', 'contract_urgency'],
    emailHook: 'Data center demand pushed electricity rates up 50% in the last 18 months—early contract review prevents rate shock.'
  },
  
  deregulation_risk: {
    key: 'deregulation_risk',
    headline: 'Texas deregulation saw rates spike 7x in early years',
    fact: 'Texas deregulation led to residential rates spiking 7x in early years, with long-term costs exceeding $24 billion (~$5,100 per household)',
    date: 'Historical',
    source: 'Customers First Coalition',
    relevance: ['deregulation_risk', 'volatility_protection'],
    emailHook: 'If you operate in a deregulated market like Texas, timing your renewal strategically is critical.'
  },
  
  renewable_mandates: {
    key: 'renewable_mandates',
    headline: 'Renewable energy is second-highest sustainability priority for executives in 2025',
    fact: 'Renewable energy is now the second-highest sustainability priority for executives in 2025 (after AI), with companies resuming net-zero goals',
    date: '2025',
    source: 'Forbes, Accenture',
    relevance: ['renewable_bundling', 'audit_risk'],
    emailHook: 'With renewable energy mandates tightening and corporate sustainability goals resetting, many facilities are re-evaluating their energy contracts.'
  }
};

// ========== 13 NEPQ ANGLES ==========

/**
 * NEPQ-driven email angles with structure:
 * - Connection Question (disarming, status-frame)
 * - Situational Relevance (why now, not someday)
 * - Outcome Teaser (specific, not generic)
 * - CTA (yes/no, mobile-friendly)
 */
export const NEPQ_ANGLES = {
  exemption_recovery: {
    key: 'exemption_recovery',
    name: 'Tax Exemption Recovery',
    priority: 1, // Highest - 2-5x more valuable than rate savings
    hook: 'Quick one—has your {industry_type} facility filed for electricity sales tax exemption, or are you still paying sales tax on power?',
    situational: '{industry_type} electricity is {exemption_type} exempt, but most facilities never claim it. Over 4 years, that\'s typically {refund_potential} in refundable tax, plus ongoing elimination.',
    outcome: 'Exemption recovery typically nets {refund_potential} plus ongoing tax elimination.',
    cta: 'Should I send an exemption audit for your facility—yes/no?',
    requiresExemption: true,
    newsHooks: ['rate_spike_national', 'rate_hikes_approved'],
    industries: ['Manufacturing', 'Nonprofit', 'RVPark', 'Government', 'Healthcare'],
    roles: ['Finance Director', 'CFO', 'Controller', 'Finance Manager', 'Accounting']
  },
  
  timing_risk: {
    key: 'timing_risk',
    name: 'Contract Timing Risk',
    priority: 2,
    hook: 'Quick one—with electricity rates up {rate_increase}% this year, are you locking in early, or waiting?',
    situational: 'Locking in 6 months early vs 90 days typically saves {savings_range}%, plus budget predictability. With rates spiking, timing matters.',
    outcome: 'Early renewal prevents the {savings_range}% market spike most teams see at renewal.',
    cta: 'Worth a 15-minute timing strategy check before rates jump further—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_spike_national', 'rate_spike_nj', 'ai_data_center_demand'],
    industries: ['all'],
    roles: ['all']
  },
  
  multi_site: {
    key: 'multi_site',
    name: 'Multi-Site Consolidation',
    priority: 2,
    hook: 'Quick one—with {facility_count} facilities in different rate zones, are you consolidating contracts or managing separately?',
    situational: 'Scattered renewals across sites typically overpay by 2-4%. Centralized agreements give you one renewal calendar instead of {facility_count} different dates.',
    outcome: 'Consolidating gives you one renewal calendar instead of {facility_count} different dates, preventing 2-4% scatter overpay.',
    cta: 'Open to a quick consolidation check across your sites—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_hikes_approved'],
    industries: ['all'],
    roles: ['Operations', 'Facilities Manager', 'COO', 'CEO'],
    requiresFacilityCount: true
  },
  
  demand_efficiency: {
    key: 'demand_efficiency',
    name: 'Demand-Side Efficiency',
    priority: 2,
    hook: 'Real question—are you cutting demand before negotiating rates, or just focusing on price?',
    situational: 'Demand-side efficiency often cuts 12-20% before rate negotiation. Data centers often cut another 15-25% via load optimization.',
    outcome: 'Demand-side efficiency often cuts more than rate negotiation alone—typically 12-20% reduction.',
    cta: 'Want to see potential savings from demand optimization—yes/no?',
    requiresExemption: false,
    newsHooks: ['ai_data_center_demand'],
    industries: ['Manufacturing', 'Data Center', 'Healthcare', 'Retail'],
    roles: ['Operations', 'Facilities Manager', 'COO', 'Engineering']
  },
  
  volatility_protection: {
    key: 'volatility_protection',
    name: 'Rate Volatility Protection',
    priority: 2,
    hook: 'Quick one—how are you protecting your budget from the {rate_increase}% rate swings we\'re seeing this year?',
    situational: 'Rate volatility hit {rate_increase}% in some markets this year. Early rate locks protect budgets from unexpected spikes.',
    outcome: 'Rate locks protect you from the {rate_increase}% volatility hitting markets this year.',
    cta: 'Worth a quick volatility protection check—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_spike_nj', 'deregulation_risk'],
    industries: ['all'],
    roles: ['Finance Director', 'CFO', 'Controller']
  },
  
  consolidation: {
    key: 'consolidation',
    name: 'Contract Consolidation',
    priority: 2,
    hook: 'Quick one—are your energy contracts centralized, or scattered across departments?',
    situational: 'Scattered contracts typically overpay by 2-4% and create administrative headaches. Centralization simplifies renewals and improves negotiating power.',
    outcome: 'Centralization simplifies renewals, improves negotiating power, and prevents 2-4% overpay.',
    cta: 'Want a quick assessment of consolidation potential—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_hikes_approved'],
    industries: ['all'],
    roles: ['Procurement', 'Operations', 'COO', 'CEO']
  },
  
  deregulation_risk: {
    key: 'deregulation_risk',
    name: 'Deregulation Market Risk',
    priority: 2,
    hook: 'Quick one—operating in a deregulated market like Texas—how are you managing rate volatility?',
    situational: 'Texas deregulation saw rates spike 7x in early years. In deregulated markets, timing your renewal strategically is critical.',
    outcome: 'Strategic renewal timing protects you from deregulation volatility (Texas saw rates spike 7x).',
    cta: 'Worth a deregulation risk assessment for your market—yes/no?',
    requiresExemption: false,
    newsHooks: ['deregulation_risk'],
    industries: ['all'],
    roles: ['Finance Director', 'CFO', 'Risk Manager', 'Operations'],
    requiresDeregulatedMarket: true
  },
  
  news_triggered: {
    key: 'news_triggered',
    name: 'News-Triggered Outreach',
    priority: 3,
    hook: 'Quick one—with ${news_headline}, has this impacted your energy planning?',
    situational: '{news_fact}. Many teams are revisiting their contracts early to avoid unexpected costs.',
    outcome: 'Early review protects you from market shifts affecting {customer_count} customers nationwide.',
    cta: 'Worth a quick timing check given the market changes—yes/no?',
    requiresExemption: false,
    newsHooks: ['all'],
    industries: ['all'],
    roles: ['all']
  },
  
  expansion_window: {
    key: 'expansion_window',
    name: 'Expansion Timing Window',
    priority: 2,
    hook: 'Quick one—as you expand to new {location}, are you locking in energy contracts early or waiting?',
    situational: 'Expanding to new markets? Contract timing in new regions often locks in 8-15% better rates than waiting.',
    outcome: 'Early contract timing in new regions typically saves 8-15% vs waiting.',
    cta: 'Want a timing strategy for your expansion markets—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_spike_national'],
    industries: ['all'],
    roles: ['CEO', 'COO', 'Operations', 'CFO'],
    requiresExpansion: true
  },
  
  renewable_bundling: {
    key: 'renewable_bundling',
    name: 'Renewable Energy Bundling',
    priority: 3,
    hook: 'Quick one—are you bundling renewable energy credits with your rate locks, or handling separately?',
    situational: 'With government incentives for clean energy rising and corporate sustainability goals resetting, many facilities are bundling rate locks with renewable credits—often saving 15-25% total.',
    outcome: 'Bundling rate locks with renewable credits often saves 15-25% total, plus compliance benefits.',
    cta: 'Want to see renewable bundling options for your facilities—yes/no?',
    requiresExemption: false,
    newsHooks: ['renewable_mandates'],
    industries: ['all'],
    roles: ['Sustainability', 'Operations', 'CFO', 'CEO']
  },
  
  audit_risk: {
    key: 'audit_risk',
    name: 'Compliance & Audit Risk',
    priority: 2,
    hook: 'Quick one—when was the last time you audited your energy contracts for tax compliance?',
    situational: 'Tax exemption slip-ups = audit exposure for {industry_type}. We prevent that—plus recover missed years.',
    outcome: 'Compliance audit prevents tax exposure and often recovers $20K-$100K in missed exemptions.',
    cta: 'Should I run a compliance check on your energy contracts—yes/no?',
    requiresExemption: true,
    newsHooks: ['renewable_mandates'],
    industries: ['Nonprofit', 'Government', 'Healthcare'],
    roles: ['Finance Director', 'CFO', 'Compliance', 'Controller']
  },
  
  budget_certainty: {
    key: 'budget_certainty',
    name: 'Budget Predictability',
    priority: 2,
    hook: 'Quick one—with {rate_increase}% rate volatility this year, how are you protecting budget predictability?',
    situational: 'Rate spikes hit {rate_increase}% in some markets this year. Budget certainty requires early rate locks, not last-minute renewals.',
    outcome: 'Early rate locks provide budget certainty and prevent {rate_increase}% surprise spikes.',
    cta: 'Worth a quick budget protection strategy check—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_spike_national', 'rate_hikes_approved'],
    industries: ['all'],
    roles: ['Finance Director', 'CFO', 'Controller', 'Accounting']
  },
  
  contract_urgency: {
    key: 'contract_urgency',
    name: 'Contract Renewal Urgency',
    priority: 2,
    hook: 'Quick one—with your contract expiring {urgency_timeframe}, have you started renewal discussions yet?',
    situational: 'Contracts expiring in the next {urgency_timeframe} should start renewal now. Waiting until 90 days out typically costs {savings_range}% more.',
    outcome: 'Starting renewal early (6 months vs 90 days) typically saves {savings_range}%.',
    cta: 'Want to start your renewal process early—yes/no?',
    requiresExemption: false,
    newsHooks: ['rate_spike_national', 'ai_data_center_demand'],
    industries: ['all'],
    roles: ['all'],
    requiresContractDate: true
  }
};

// ========== ROLE-BASED ANGLE PRIORITIES ==========

/**
 * Map roles to preferred angles for personalization
 */
export const ROLE_ANGLE_PRIORITY = {
  'CFO': ['budget_certainty', 'exemption_recovery', 'volatility_protection', 'timing_risk'],
  'Finance Director': ['exemption_recovery', 'budget_certainty', 'timing_risk', 'audit_risk'],
  'Controller': ['exemption_recovery', 'audit_risk', 'budget_certainty'],
  'Finance Manager': ['exemption_recovery', 'budget_certainty', 'timing_risk'],
  'Accounting': ['exemption_recovery', 'audit_risk'],
  
  'Facilities Manager': ['multi_site', 'demand_efficiency', 'consolidation', 'timing_risk'],
  'Operations': ['demand_efficiency', 'multi_site', 'consolidation', 'expansion_window'],
  'COO': ['multi_site', 'consolidation', 'expansion_window', 'timing_risk'],
  
  'CEO': ['budget_certainty', 'expansion_window', 'renewable_bundling', 'timing_risk'],
  'Procurement': ['consolidation', 'timing_risk', 'multi_site'],
  
  'Sustainability': ['renewable_bundling', 'audit_risk'],
  'Compliance': ['audit_risk', 'exemption_recovery'],
  'Risk Manager': ['deregulation_risk', 'volatility_protection', 'audit_risk']
};

// ========== INDUSTRY-BASED ANGLE PRIORITIES ==========

/**
 * Map industries to most relevant angles
 */
export const INDUSTRY_ANGLE_PRIORITY = {
  'Manufacturing': ['exemption_recovery', 'demand_efficiency', 'timing_risk', 'multi_site'],
  'Nonprofit': ['exemption_recovery', 'audit_risk', 'budget_certainty'],
  'Government': ['exemption_recovery', 'audit_risk', 'consolidation'],
  'RVPark': ['exemption_recovery', 'timing_risk'],
  'RV Park': ['exemption_recovery', 'timing_risk'],
  'Mobile Home Park': ['exemption_recovery', 'timing_risk'],
  'Healthcare': ['exemption_recovery', 'audit_risk', 'budget_certainty', 'demand_efficiency'],
  'Data Center': ['demand_efficiency', 'timing_risk', 'renewable_bundling'],
  'Retail': ['multi_site', 'consolidation', 'timing_risk'],
  'Hospitality': ['multi_site', 'demand_efficiency']
};

// ========== ENABLED ANGLES (TOGGLEABLE) ==========

/**
 * Control which angles are active
 */
export const ENABLED_ANGLES = [
  'exemption_recovery',
  'timing_risk',
  'multi_site',
  'demand_efficiency',
  'volatility_protection',
  'consolidation',
  'deregulation_risk',
  'news_triggered',
  'expansion_window',
  'renewable_bundling',
  'audit_risk',
  'budget_certainty',
  'contract_urgency'
];

// ========== EXEMPTION-FIRST STRATEGY ==========

/**
 * If true, prioritize exemption angles for exempt industries
 */
export const EXEMPTION_FIRST_STRATEGY = true;

// ========== EXPORT CONFIG OBJECT ==========

export const NEPQ_CONFIG = {
  industryExemptionMap: INDUSTRY_EXEMPTION_MAP,
  exemptionTypes: EXEMPTION_TYPES,
  newsHooks: NEWS_HOOKS_2025,
  angles: NEPQ_ANGLES,
  roleAnglePriority: ROLE_ANGLE_PRIORITY,
  industryAnglePriority: INDUSTRY_ANGLE_PRIORITY,
  enabledAngles: ENABLED_ANGLES,
  exemptionFirstStrategy: EXEMPTION_FIRST_STRATEGY
};

export default NEPQ_CONFIG;

