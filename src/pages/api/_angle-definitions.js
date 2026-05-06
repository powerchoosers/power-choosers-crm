// _angle-definitions.js
// Cold email angle/hook definitions for first-touch prompts

/**
 * Get industry-specific opener based on selected angle
 */
export function getIndustryOpener(angleId, industry) {
    // Default generic openers
    const defaultOpeners = {
        '4cp': {
            hook: 'Question about summer usage spikes',
            pain: 'Some facilities get hit with charges tied to only a few hot-weather spikes'
        },
        'ratchet': {
            hook: 'Question about old usage spikes still affecting the bill',
            pain: 'Old peak charges can keep showing up long after the busy day is over'
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
            cta: 'Are you tracking which summer hours create the biggest charges?',
            why: 'Gets them talking about whether they know what drives the expensive moments'
        },
        'ratchet': {
            cta: 'Do you know if an old usage spike is still affecting the bill?',
            why: 'Most do not track this and it creates a useful discovery gap'
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
        '4cp': `Most ${industry || 'commercial'} facilities we review find avoidable charges tied to a few summer usage spikes`,
        'ratchet': `${industry || 'Manufacturing'} clients often find old peak charges that no longer match how the site runs`,
        'volatility': `We've helped ${industry || 'industrial'} buyers cut exposure to scarcity pricing by 40%+`
    };

    return proofPoints[angleId] || `Most clients find significant savings in their current structure`;
}
