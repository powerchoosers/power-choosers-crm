// _angle-definitions.js
// Cold email angle/hook definitions for first-touch prompts

/**
 * Get industry-specific opener based on selected angle
 */
export function getIndustryOpener(angleId, industry) {
    // Default generic openers
    const defaultOpeners = {
        '4cp': {
            hook: 'Question about your summer peak strategy',
            pain: 'Most facilities get hit with unexpected 4CP tags'
        },
        'ratchet': {
            hook: 'Noticed a pattern in manufacturing demand charges',
            pain: 'Ghost capacity penalties eating into margins'
        },
        'volatility': {
            hook: 'How are you handling the price swings?',
            pain: 'Real-time spikes creating budget uncertainty'
        }
    };

    return defaultOpeners[angleId] || {
        hook: 'Question about your energy strategy',
        pain: 'Most companies overpay without realizing it'
    };
}

/**
 * Get role-specific CTA based on angle
 */
export function getRoleCta(angleId, role) {
    // High-friction CTAs that force engagement
    const defaultCtas = {
        '4cp': {
            cta: 'Are you tracking your 4CP exposure this summer?',
            why: 'Forces them to admit they either track it (and care) or don\'t (and should)'
        },
        'ratchet': {
            cta: 'Do you know your current ratchet floor?',
            why: 'Most don\'t track this - creates curiosity gap'
        },
        'volatility': {
            cta: 'How much volatility protection do you have baked in?',
            why: 'Implies expertise gap if they don\'t know'
        }
    };

    return defaultCtas[angleId] || {
        cta: 'Worth a quick audit?',
        why: 'Low-friction fallback'
    };
}

/**
 * Get industry-specific proof point
 */
export function getIndustryProof(angleId, industry) {
    const proofPoints = {
        '4cp': `Most ${industry || 'commercial'} facilities we audit find 15-30% of their transmission costs are avoidable`,
        'ratchet': `${industry || 'Manufacturing'} clients typically recover $8-12k annually by resetting demand ratchets`,
        'volatility': `We've helped ${industry || 'industrial'} buyers cut exposure to scarcity pricing by 40%+`
    };

    return proofPoints[angleId] || `Most clients find significant savings in their current structure`;
}
