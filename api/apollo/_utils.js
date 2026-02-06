/**
 * Apollo API Shared Utilities
 * Provides common functions for Apollo API integration
 */

export const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

/**
 * Handle CORS preflight requests
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} - True if CORS preflight was handled
 */
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return true;
  }
  return false;
}

/**
 * Fetch with retry logic for transient errors
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retries (default: 3)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Return successful responses immediately
      if (response.ok || response.status === 404 || response.status === 400) {
        return response;
      }
      
      // Retry on 5xx errors or 429 (rate limit)
      if (response.status >= 500 || response.status === 429) {
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Normalize domain from various input formats
 * @param {string} input - Domain, URL, or company name
 * @returns {string} - Normalized domain
 */
export function normalizeDomain(input) {
  if (!input) return '';
  
  let domain = String(input).trim().toLowerCase();
  
  // Remove protocol
  domain = domain.replace(/^https?:\/\//i, '');
  
  // Remove www.
  domain = domain.replace(/^www\./i, '');
  
  // Remove trailing slash and path
  domain = domain.split('/')[0];
  
  // Remove port
  domain = domain.split(':')[0];
  
  return domain;
}

/**
 * Get Apollo API key from environment
 * @returns {string} - Apollo API key
 * @throws {Error} - If API key is not configured
 */
export function getApiKey() {
  const apiKey = process.env.APOLLO_API_KEY;
  
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY environment variable is not set');
  }
  
  // Trim whitespace that might have been accidentally added
  const trimmedKey = apiKey.trim();
  
  // Validate API key format (basic check)
  if (trimmedKey.length < 10) {
    throw new Error('APOLLO_API_KEY appears to be invalid (too short)');
  }

  return trimmedKey;
}

/**
 * Format location from city, state, country
 * @param {string} city - City name
 * @param {string} state - State/province name
 * @param {string} country - Country name
 * @returns {string} - Formatted location string
 */
export function formatLocation(city, state, country) {
  const parts = [city, state, country].filter(Boolean);
  return parts.join(', ');
}

/**
 * Format employee count range
 * @param {number} count - Employee count
 * @returns {string} - Employee range string
 */
export function formatEmployeeRange(count) {
  if (!count) return '';
  if (count < 10) return '1-10';
  if (count < 50) return '10-50';
  if (count < 200) return '50-200';
  if (count < 500) return '200-500';
  if (count < 1000) return '500-1000';
  if (count < 5000) return '1000-5000';
  return '5000+';
}

/**
 * Format revenue for display
 * @param {string} revenuePrinted - Apollo's printed revenue format
 * @returns {string} - Formatted revenue string
 */
export function formatRevenue(revenuePrinted) {
  return revenuePrinted || '';
}

/**
 * Format phone for contact record (US: +1 (XXX) XXX-XXXX)
 * @param {string} raw - sanitized_number or raw_number from Apollo
 * @returns {string}
 */
export function formatPhoneForContact(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length === 0) return '';
  return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}



