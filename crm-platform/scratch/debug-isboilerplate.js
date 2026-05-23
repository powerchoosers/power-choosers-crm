const fs = require('fs');
const code = fs.readFileSync('src/pages/api/accounts/[accountId]/intelligence-brief.ts', 'utf8');

// Extract function implementation
const startIdx = code.indexOf('function isBoilerplatePageTitle');
const endIdx = code.indexOf('function sanitizeResearchTitle');
const fnString = code.substring(startIdx, endIdx);

// Define cleanText helper
function cleanText(v) {
  return String(v || '').trim();
}

function toTitleCase(s) {
  return s;
}

function cleanCompanyNameForSearch(name) {
  return cleanText(name)
    .replace(/\b(llc|inc|l\.l\.c\.|co\.|corp\.|corporation|ltd|limited|company|lp|gmbh|p\.a\.|pa)\b/gi, '')
    .replace(/[^a-z0-9\s&]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Recreate the function with step-by-step logs
function testIsBoilerplatePageTitle(title, accountName) {
  const t = cleanText(title)
  if (!t) { console.log('Empty title matched'); return true; }
  const lower = t.toLowerCase()
  const companyLower = cleanCompanyNameForSearch(accountName).toLowerCase()

  console.log('Testing title:', t);
  console.log('lower:', lower);
  console.log('companyLower:', companyLower);

  // HTTP error and server response strings that leak into titles
  if (/^(the request could not be satisfied|access denied|403 forbidden|404 not found|error 403|error 404|service unavailable|bad gateway|gateway timeout|too many requests|you are using an outdated browser)/i.test(t)) {
    console.log('Matched HTTP error');
    return true;
  }
  if (/\byou are using an outdated browser\b/i.test(t)) {
    console.log('Matched outdated browser');
    return true;
  }
  if (/\bdefend your assets\b.*\boutdated browser\b/i.test(t)) {
    console.log('Matched defend your assets');
    return true;
  }

  // Pure homepage title patterns
  if (/^home\s*[-|–]\s*/i.test(t)) {
    console.log('Matched home start');
    return true;
  }
  if (/\s*[-|–]\s*home$/i.test(t)) {
    console.log('Matched home end');
    return true;
  }
  if (/^welcome to\b/i.test(t)) {
    console.log('Matched welcome to');
    return true;
  }
  if (/^about\s*[-|–]\s*/i.test(t)) {
    console.log('Matched about start');
    return true;
  }
  if (/^(home|about|contact|services|products|solutions|default)$/i.test(t.trim())) {
    console.log('Matched single word');
    return true;
  }
  if (/^homepage\s*[-|–]/i.test(t)) {
    console.log('Matched homepage start');
    return true;
  }
  if (/\bhomepage\b/i.test(t) && t.split(/\s+/).length <= 5) {
    console.log('Matched homepage word count');
    return true;
  }

  // Title is just the company name
  const strippedCompanyChars = companyLower.replace(/[^a-z0-9]/g, '')
  const strippedTitleChars = lower.replace(/[^a-z0-9]/g, '')
  if (strippedCompanyChars.length > 3 && strippedTitleChars === strippedCompanyChars) {
    console.log('Matched exact company name');
    return true;
  }

  // Domain-separator
  if (/^[^|–-]{3,80}\s*[|–-]\s*(home|homepage|official site|official website|welcome)$/i.test(t)) {
    console.log('Matched end separator');
    return true;
  }
  if (/^(home|homepage|official site|official website|welcome)\s*[|–-]\s*[^|–-]{3,80}$/i.test(t)) {
    console.log('Matched start separator');
    return true;
  }

  // Repetitive company name check (e.g. "Shine Pediatrics At Shine Pediatrics...")
  if (companyLower.length > 3 && lower.split(companyLower).length > 2) {
    console.log('Matched repetitive company name');
    return true;
  }

  // Tagline check
  if (companyLower.length > 3 && lower.startsWith(companyLower)) {
    const afterName = lower.slice(companyLower.length).trim()
    console.log('TagName check afterName:', afterName);
    const startsWithFiller = /^(is|at|we|our|the|your|welcome|offers|provides|serves|specializes|specialise|specialises|helping)\b/i.test(afterName);
    const startsWithSeparator = /^[-|–|,|:|]/.test(afterName);
    if ((startsWithSeparator && afterName.split(/\s+/).length <= 15) || (startsWithFiller && afterName.split(/\s+/).length <= 25)) {
      console.log('Matched company name prefix tagline / filler phrase');
      return true;
    }
  }


  // Location check
  if (companyLower.length > 3) {
    const nameVariant = companyLower.replace(/[-|–|,|\s]+/g, '')
    const titleVariant = lower.replace(/[-|–|,|\s]+/g, '')
    console.log('Location check variants:', { nameVariant, titleVariant });
    if (titleVariant.startsWith(nameVariant) && titleVariant.length - nameVariant.length < 30) {
      console.log('Matched company name with location');
      return true;
    }
  }

  console.log('No matches');
  return false;
}

testIsBoilerplatePageTitle('Shine Pediatrics At Shine Pediatrics, we are not your typical pediatric doctor’s office', 'Shine Pediatrics, LLC');
testIsBoilerplatePageTitle('Allergy & ENT Associates is Greater Houston’s premier multi-specialty clinic, offering expert care in allergies, asthma, ENT and sinus health.', 'Allergy & ENT Associates');

