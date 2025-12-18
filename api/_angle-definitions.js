// _angle-definitions.js
// Industry-specific angle definitions for first-touch cold emails
// Each angle maps to industry-specific openers, proof points, and CTAs

export const ANGLES_DEFINITIONS = {
  
  // ===== DEMAND EFFICIENCY ANGLE =====
  // Focus: Right rate structure for their load pattern
  demand_efficiency: {
    id: 'demand_efficiency',
    label: 'Peak Demand Optimization',
    primaryMessage: 'Matching rate structure to actual load pattern',
    
    // Industry-specific opening hooks that create observable pain
    industryOpeners: {
      manufacturing: {
        observablePain: 'Peak demand charges eat 30-40% of your bill when you\'re on the wrong rate.',
        hook: (company) => `Most manufacturing operations we audit are on peak-based rates when 4CP would save them 20%+. How are you currently structured—peak-based or 4CP?`,
        contextWhy: 'Summer demand spikes + winter baseline creates predictable pattern that most ops miss'
      },
      healthcare: {
        observablePain: 'Healthcare demand spikes during predictable shifts—yet most facilities pay generic peak rates.',
        hook: (company) => `Quick observation: most hospitals we work with overpay 15-20% on demand charges because their rate structure doesn't match their shift-change pattern. Are you on 4CP or a generic peak rate?`,
        contextWhy: 'ED, OR, and HVAC create predictable afternoon/evening peaks that differ from commercial baseline'
      },
      dataCenter: {
        observablePain: 'Data center compute loads are predictable—yet most data centers don\'t correlate demand charges to compute usage.',
        hook: (company) => `Looking at your operations: do you have visibility into which workloads are driving your demand charges? Most datacenters we audit find 15-25% savings by load-aware rate selection.`,
        contextWhy: 'VM spawning patterns create predictable peaks—opportunity for demand response or rate restructuring'
      },
      retail: {
        observablePain: 'Retail peaks on shopping hours (evening/weekend) yet you probably pay for peak-hour rates year-round.',
        hook: (company) => `Quick question: are your energy peaks aligned with shopping hours, or are you paying demand charges for times you don't actually spike? Most retailers discover they're on the wrong rate.`,
        contextWhy: 'Retail peaks are predictable (6-9pm, weekends) but TDU charges peak hours (2-6pm)—mismatch'
      },
      hospitality: {
        observablePain: 'Hotel occupancy and HVAC create predictable demand patterns most properties ignore.',
        hook: (company) => `Are you managing demand around guest occupancy and check-in times? Most hotels we work with are overpaying 10-15% because their rate doesn't match their actual usage pattern.`,
        contextWhy: 'Occupancy + HVAC ramp creates predictable 4pm-8pm spike—opportunity to optimize'
      },
      nonprofit: {
        observablePain: 'Nonprofit facilities often overpay on demand charges because nobody has audited the rate structure.',
        hook: (company) => `When was the last time someone audited whether your energy rate matches your facility\'s actual demand pattern? Most nonprofits we work with find they\'re leaving 10-20% on the table.`,
        contextWhy: 'Internal staff often handle this without expertise—simple audit usually finds easy fixes'
      },
      education: {
        observablePain: 'Schools and universities have predictable demand (class hours, HVAC cycles) yet overpay on demand charges.',
        hook: (company) => `Quick question for ${company}: are you optimizing demand charges around class schedules? Most schools we audit find they're on a rate that doesn't match their actual usage pattern.`,
        contextWhy: 'Usage clusters around school hours + HVAC ramp—different from 9-5 office peak'
      },
      default: {
        observablePain: 'Most businesses pay demand charges on a rate structure that doesn\'t match their actual load pattern.',
        hook: (company) => `How are you currently structured for demand charges—peak-based, 4CP, or another structure? Most operations we audit discover their rate doesn't match their actual usage.`,
        contextWhy: 'Universal pain point—most companies inherit a rate and never revisit it'
      }
    },
    
    // Social proof specific to industry (use these as CTA evidence)
    industryProof: {
      manufacturing: '70% of manufacturing ops we audit find 15-25% savings by switching to a rate matching their load pattern.',
      healthcare: '60% of healthcare systems discover they\'re overpaying on demand due to rate misalignment.',
      dataCenter: '80% of datacenters optimize demand by correlating compute workloads to rate structure.',
      retail: '65% of retailers find they\'re on a peak rate that doesn\'t match shopping hours.',
      hospitality: '55% of hotels find 10-15% savings by rate optimization around occupancy patterns.',
      nonprofit: '50% of nonprofits have never had a demand charge audit—average finding is 12-18% overcharge.',
      education: '60% of schools find savings by aligning rate structure to class schedule patterns.',
      default: 'Average finding: 12-20% overcharge on delivery/demand costs due to rate misalignment.'
    },
    
    // High-friction CTAs (requires admission of problem, not dismissable with "we\'re fine")
    roleCtas: {
      ceo: {
        hook: 'Real question:',
        cta: 'Are you aware how much of your margin is hidden in misaligned energy rates?',
        why: 'CEO = bottom-line impact, margin protection'
      },
      cfo: {
        hook: 'Quick reality check:',
        cta: 'When was the last time someone audited your demand charges? (Most CFOs we talk to are shocked by what they find.)',
        why: 'CFO = budget variance, audit trail, cost predictability'
      },
      controller: {
        hook: 'Compliance question:',
        cta: 'Are you optimizing all available rate reductions before contract renewal?',
        why: 'Controller = compliance, documentation, avoiding overcharges'
      },
      operations: {
        hook: 'One question:',
        cta: 'How are you optimizing consumption before renewal without impacting production?',
        why: 'Operations = uptime, reliability, no production risk'
      },
      facilities: {
        hook: 'Quick audit question:',
        cta: 'Do you have visibility into which hours are driving your demand charges?',
        why: 'Facilities = operational efficiency, cost optimization'
      },
      default: {
        hook: '',
        cta: 'Worth a 10-minute audit to see if you\'re leaving money on the table?',
        why: 'Generic high-friction CTA'
      }
    }
  },

  // ===== EXEMPTION RECOVERY ANGLE =====
  // Focus: Sales tax recovery for tax-exempt entities
  exemption_recovery: {
    id: 'exemption_recovery',
    label: 'Sales Tax Exemption Recovery',
    primaryMessage: 'Claiming all available tax exemptions on electricity',
    
    industryOpeners: {
      nonprofit: {
        observablePain: 'Most nonprofits overpay sales tax on electricity—they just don\'t know it.',
        hook: (company) => `Quick question: has anyone filed a Predominant Use Study for ${company} in the last 4 years? We find 40% of nonprofits are overpaying sales tax on electricity.`,
        contextWhy: 'Nonprofits qualify for exemptions but rarely pursue them—biggest ROI opportunity'
      },
      healthcare: {
        observablePain: 'Healthcare facilities typically qualify for sales tax exemptions but often don\'t claim them.',
        hook: (company) => `Are you claiming all available sales tax exemptions at your healthcare facility? Most hospitals we audit find $25K-$150K in refunds from a Predominant Use Study.`,
        contextWhy: 'Healthcare = high energy usage + clear exemption path = high ROI'
      },
      education: {
        observablePain: 'Schools and universities almost always qualify for electricity tax exemptions—yet rarely claim them.',
        hook: (company) => `When was the last time ${company} filed a Predominant Use Study? Most schools we work with recover $10K-$50K in back taxes.`,
        contextWhy: 'Education = strongest exemption case + clear documentation + high recovery'
      },
      government: {
        observablePain: 'Government entities qualify for exemptions but compliance is inconsistent across locations.',
        hook: (company) => `Are all your government facilities claiming available sales tax exemptions? Most municipalities we audit find $50K-$300K in multi-site recovery opportunities.`,
        contextWhy: 'Government = automatic exemption + multi-site complexity = high-value audit'
      },
      default: {
        observablePain: 'Tax-exempt organizations often overpay on electricity sales tax without realizing it.',
        hook: (company) => `Is ${company} claiming all available sales tax exemptions on electricity? We find most tax-exempt entities leave 12-18% on the table.`,
        contextWhy: 'Universal for tax-exempt: should claim but usually don\'t'
      }
    },
    
    industryProof: {
      nonprofit: '40% of nonprofits overpay electricity sales tax. Average recovery: $35K-$75K per Predominant Use Study.',
      healthcare: '55% of healthcare systems haven\'t optimized tax exemptions. Average hospital recovery: $50K-$150K.',
      education: '70% of schools can recover back taxes through proper exemption filing. Average recovery: $10K-$50K.',
      government: '45% of government entities have inconsistent exemption claims across locations. Average municipality recovery: $50K-$300K.',
      default: 'Most tax-exempt entities recover 8-15% in back taxes through exemption optimization.'
    },
    
    roleCtas: {
      cfo: {
        hook: 'Strategic question:',
        cta: 'Are all your tax exemptions being claimed on the books? Most CFOs we speak with find $20K-$100K in unclaimed refunds.',
        why: 'CFO = bottom line, audit preparation, recovered cash'
      },
      controller: {
        hook: 'Compliance check:',
        cta: 'When was your last Predominant Use Study filed? (Most controllers haven\'t done one in 5+ years.)',
        why: 'Controller = compliance, documentation, tax filing accuracy'
      },
      ceo: {
        hook: 'Funding question:',
        cta: 'Did you know your organization can usually recover 8-15% of past electricity costs through tax exemption optimization?',
        why: 'CEO = mission funding recovery, operational margin'
      },
      operations: {
        hook: 'Quick audit question:',
        cta: 'Has anyone verified all your locations are claiming available electricity tax exemptions?',
        why: 'Operations = compliance verification, cost optimization'
      },
      default: {
        hook: '',
        cta: 'Worth a quick audit to see if you\'re leaving exemptions on the table?',
        why: 'Generic CTA for tax exemption'
      }
    }
  },

  // ===== CONSOLIDATION ANGLE =====
  // Focus: Multi-site consolidation & master agreements
  consolidation: {
    id: 'consolidation',
    label: 'Multi-Site Portfolio Consolidation',
    primaryMessage: 'Consolidating multiple meters/suppliers into master agreement',
    
    industryOpeners: {
      manufacturing: {
        observablePain: 'Multi-facility manufacturers renew sites individually—missing 15-25% bulk discounts.',
        hook: (company) => `Quick question: are you renewing each manufacturing location individually, or do you have a consolidated master agreement? Most multi-site ops we work with leave 15-25% on the table by managing sites separately.`,
        contextWhy: 'Manufacturing often has multiple plants in different regions—perfect consolidation candidate'
      },
      healthcare: {
        observablePain: 'Hospital systems with multiple locations often manage energy site-by-site instead of as a portfolio.',
        hook: (company) => `Does ${company} manage energy contracts individually per location, or consolidated across the system? Most health systems discover they\'re leaving 12-20% bulk discounts on the table.`,
        contextWhy: 'Health systems typically have 5-20+ locations—strong consolidation ROI'
      },
      retail: {
        observablePain: 'Multi-store retailers renewing each store individually instead of leveraging their footprint.',
        hook: (company) => `Are you managing energy contracts store-by-store, or do you have a consolidated retail portfolio agreement? Most retail chains we work with find 20-30% savings through consolidation.`,
        contextWhy: 'Retail chains = highest ROI on consolidation (volume leverage + uniform stores)'
      },
      hospitality: {
        observablePain: 'Multi-property hotel groups don\'t consolidate—missing 15-20% portfolio discounts.',
        hook: (company) => `Does ${company} have a consolidated energy agreement across all properties, or are properties renewing individually? Most groups we work with find 15-20% savings through consolidation.`,
        contextWhy: 'Hotel groups = predictable usage + high volume + consolidation discounts'
      },
      nonprofit: {
        observablePain: 'Nonprofit networks with multiple facilities often manage energy separately—organizational fragmentation costs them.',
        hook: (company) => `If ${company} has multiple locations, are they on one consolidated agreement or separate contracts? Most nonprofit networks discover they\'re missing 10-18% bulk discounts.`,
        contextWhy: 'Nonprofit networks = complexity + internal silos + consolidation opportunity'
      },
      default: {
        observablePain: 'Managing multiple meters individually is a recipe for missed windows and orphan rates.',
        hook: (company) => `Does ${company} manage energy across all locations with one agreement, or are you site-by-site? Most multi-location companies leave 10-20% bulk discounts on the table.`,
        contextWhy: 'Universal: consolidation always beats individual renewals'
      }
    },
    
    industryProof: {
      manufacturing: '70% of multi-plant manufacturers manage sites individually—average consolidation savings 15-25%.',
      healthcare: '60% of hospital systems renew locations separately—average consolidation savings 12-20%.',
      retail: '80% of retail chains leave money on consolidation—average savings 20-30%.',
      hospitality: '65% of hotel groups don\'t have consolidated agreements—average savings 15-20%.',
      nonprofit: '55% of nonprofit networks manage energy separately—average consolidation savings 10-18%.',
      default: 'Average consolidation savings across multi-site portfolios: 10-25% on energy costs.'
    },
    
    roleCtas: {
      cfo: {
        hook: 'Strategic opportunity:',
        cta: 'Are all your locations on one consolidated energy agreement, or are you leaving 15-25% bulk discounts on the table?',
        why: 'CFO = scale leverage, bottom-line impact'
      },
      operations: {
        hook: 'Portfolio question:',
        cta: 'How many different energy suppliers do you manage across your locations?',
        why: 'Operations = simplification, vendor reduction, control'
      },
      ceo: {
        hook: 'Quick question:',
        cta: 'Did you know consolidating energy across your portfolio usually saves 15-25%?',
        why: 'CEO = margin impact, strategic leverage'
      },
      default: {
        hook: '',
        cta: 'Worth a quick look at whether a master agreement makes sense for your portfolio?',
        why: 'Generic consolidation CTA'
      }
    }
  },

  // ===== TIMING STRATEGY ANGLE =====
  // Focus: Forward market opportunity, contract renewal windows
  timing_strategy: {
    id: 'timing_strategy',
    label: 'Contract Renewal Timing & Forward Rates',
    primaryMessage: 'Locking rates early before market spikes',
    
    industryOpeners: {
      manufacturing: {
        observablePain: 'ERCOT 2026 capacity is tightening—forward rates for locking today are 15-20% below Q1 2026 window.',
        hook: (company) => `Quick timing question: when is ${company}\'s next contract window? Most ops that lock 60-90 days early save 15-20% vs. waiting for the renewal date.`,
        contextWhy: 'Manufacturing = high load + sensitive to market timing'
      },
      default: {
        observablePain: 'The 2026 ERCOT capacity cliff is already pushing forward curves higher. Locking in early saves 12-24%.',
        hook: (company) => `When does ${company}\'s energy contract expire? We\'re finding that companies locking rates now are saving 15-20% vs. waiting for the renewal window.`,
        contextWhy: 'Universal opportunity: forward market is favorable now, not at renewal'
      }
    },
    
    industryProof: {
      manufacturing: 'Manufacturers who lock 90 days early are saving 15-20% vs. standard renewal window.',
      default: 'Early contract locks average 12-24% savings vs. locking at standard renewal dates.'
    },
    
    roleCtas: {
      cfo: {
        hook: 'Timing question:',
        cta: 'When is your contract window, and have you looked at locking rates now vs. waiting for renewal?',
        why: 'CFO = budget planning, getting ahead of surprises'
      },
      ceo: {
        hook: 'Strategic question:',
        cta: 'Do you know when your energy contracts expire? Proactive renewal planning saves 15-20%.',
        why: 'CEO = margin protection, strategic advantage'
      },
      default: {
        hook: '',
        cta: 'Worth checking if an early lock makes sense for your renewal window?',
        why: 'Generic timing CTA'
      }
    }
  },

  // ===== BUDGET STABILITY ANGLE =====
  // Focus: Cost predictability, protecting from volatility
  budget_stability: {
    id: 'budget_stability',
    label: 'Budget Stability & Cost Predictability',
    primaryMessage: 'Locking fixed rates to eliminate volatility exposure',
    
    industryOpeners: {
      default: {
        observablePain: 'Market volatility is making energy budgets unpredictable—especially for companies on variable rates.',
        hook: (company) => `How is ${company} handling budget planning with ERCOT volatility? Most companies we work with are 100% exposed to index pricing and discovering they need fixed-rate protection.`,
        contextWhy: 'Universal post-December volatility: everyone cares about predictability'
      }
    },
    
    industryProof: {
      default: 'Companies on fixed rates have 95% budget predictability. Variable-rate companies average 40% variance.'
    },
    
    roleCtas: {
      cfo: {
        hook: 'Budget question:',
        cta: 'What percentage of your energy spend is locked into fixed rates vs. exposed to index pricing?',
        why: 'CFO = budget variance, forecast accuracy'
      },
      default: {
        hook: '',
        cta: 'Worth evaluating a fixed-rate strategy to protect your 2026 budget?',
        why: 'Generic budget stability CTA'
      }
    }
  },

  // ===== OPERATIONAL SIMPLICITY ANGLE =====
  // Focus: Reducing vendor/supplier complexity
  operational_simplicity: {
    id: 'operational_simplicity',
    label: 'Vendor Consolidation & Administrative Simplicity',
    primaryMessage: 'Reducing multiple suppliers to one vendor relationship',
    
    industryOpeners: {
      default: {
        observablePain: 'Managing multiple energy suppliers creates administrative overhead and missed optimization.',
        hook: (company) => `How many different energy suppliers is ${company} managing right now? Most companies with multiple vendors spend 80+ hours annually just managing renewals and billing.`,
        contextWhy: 'Universal pain: supplier complexity = administrative burden'
      }
    },
    
    industryProof: {
      default: 'Single-vendor consolidation reduces energy management overhead by 70-80% annually.'
    },
    
    roleCtas: {
      operations: {
        hook: 'Simplification question:',
        cta: 'How much time are you spending managing multiple energy suppliers?',
        why: 'Operations = workload reduction, simplification'
      },
      cfo: {
        hook: 'Cost question:',
        cta: 'Do you know what internal labor costs you\'re spending on energy vendor management?',
        why: 'CFO = hidden costs, efficiency'
      },
      default: {
        hook: '',
        cta: 'Worth consolidating to a single vendor to reduce administrative burden?',
        why: 'Generic simplicity CTA'
      }
    }
  }
  
};

// Export angle IDs for random selection
export const ANGLE_IDS = Object.keys(ANGLES_DEFINITIONS);

// Helper to get angle by ID
export function getAngleById(angleId) {
  return ANGLES_DEFINITIONS[angleId] || null;
}

// Helper to get industry-specific opener
export function getIndustryOpener(angleId, industry) {
  const angle = ANGLES_DEFINITIONS[angleId];
  if (!angle) return null;
  
  // Normalize industry to lowercase for matching
  const normalizedIndustry = (industry || '').toLowerCase();
  
  const opener = angle.industryOpeners[normalizedIndustry] || angle.industryOpeners.default;
  return opener || null;
}

// Helper to get industry-specific CTA
export function getRoleCta(angleId, role) {
  const angle = ANGLES_DEFINITIONS[angleId];
  if (!angle) return null;
  
  // Normalize role string
  const normalizedRole = (role || '').toLowerCase()
    .replace(/\s+/g, '')
    .replace('controller', 'controller')
    .replace('cfo', 'cfo')
    .replace('chief financial officer', 'cfo');
  
  // Find best match
  const cta = angle.roleCtas[normalizedRole] || angle.roleCtas.default;
  return cta || null;
}

// Helper to get industry-specific proof
export function getIndustryProof(angleId, industry) {
  const angle = ANGLES_DEFINITIONS[angleId];
  if (!angle) return null;
  
  // Normalize industry to lowercase for matching
  const normalizedIndustry = (industry || '').toLowerCase();
  
  return angle.industryProof[normalizedIndustry] || angle.industryProof.default || null;
}

// Helper to get complete angle CTA data (opening, proof, CTA) for a selected angle
// This combines industry-specific opener, proof, and role-based CTA
export function getAngleCta(selectedAngle, industry, role, company = '') {
  if (!selectedAngle || !selectedAngle.id) return null;
  
  const angleId = selectedAngle.id;
  const angle = getAngleById(angleId);
  
  if (!angle) return null;
  
  // Get industry-specific opener (normalize industry to lowercase for matching)
  const normalizedIndustry = (industry || '').toLowerCase();
  const industryOpener = getIndustryOpener(angleId, normalizedIndustry);
  
  // Get role-specific CTA (if available, otherwise use default)
  const roleCta = getRoleCta(angleId, role);
  
  // Get industry-specific proof
  const proof = getIndustryProof(angleId, normalizedIndustry);
  
  // If industryOpener.hook is a function, call it with company name
  let openingHook = 'Question about your energy strategy:';
  if (industryOpener && industryOpener.hook) {
    if (typeof industryOpener.hook === 'function') {
      openingHook = industryOpener.hook(company || 'your company');
    } else {
      openingHook = industryOpener.hook;
    }
  }
  
  // Build CTA object
  return {
    opening: openingHook,
    value: proof || '',
    full: roleCta?.cta || 'Worth a quick look?',
    angleId: angleId,
    contextWhy: industryOpener?.contextWhy || '',
    roleInfo: roleCta?.why || ''
  };
}
