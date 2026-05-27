const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Compile the TS file on the fly using esbuild
const codePath = path.join(__dirname, '../src/pages/api/accounts/[accountId]/intelligence-brief.ts');
const compileResult = esbuild.buildSync({
  entryPoints: [codePath],
  bundle: true,
  write: false,
  format: 'cjs',
  target: 'node20',
  external: [
    '@google/generative-ai',
    '@supabase/supabase-js',
    'next',
    'dotenv',
    'fs',
    'path',
    'crypto',
    'http',
    'https',
    'zlib',
    'stream',
    'util',
    'url',
    'os',
    'tty',
    'net',
    'child_process',
    'fs/promises'
  ],
  alias: {
    '@': path.join(__dirname, '../src')
  },
  tsconfig: path.join(__dirname, '../tsconfig.json'),
});

let code = compileResult.outputFiles[0].text;

// Mock require Next to prevent actual imports
code = code.replace(/require\("next"\)/g, '{}');

code += `
global.cleanText = cleanText;
global.getPublicAccountDescription = getPublicAccountDescription;
global.getAccountNotes = getAccountNotes;
global.detectMultiSiteScale = detectMultiSiteScale;
global.buildStructuredIdentityProfile = buildStructuredIdentityProfile;
global.buildTalkTrackContext = buildTalkTrackContext;
global.buildIdentityProfileText = buildIdentityProfileText;
global.getAccountIdentityProfile = getAccountIdentityProfile;
global.TALK_TRACK_GENERIC_PATTERNS = TALK_TRACK_GENERIC_PATTERNS;
global.TALK_TRACK_SIGNAL_KEYWORDS = TALK_TRACK_SIGNAL_KEYWORDS;
global.TALK_TRACK_INDUSTRY_KEYWORDS = TALK_TRACK_INDUSTRY_KEYWORDS;
global.splitTalkTrackSentences = splitTalkTrackSentences;
global.hasStrongDmeSignals = hasStrongDmeSignals;
global.hasStrongRestaurantSignals = hasStrongRestaurantSignals;
global.hasStrongLogisticsSignals = hasStrongLogisticsSignals;
global.hasMaterialHandlingEquipmentSignals = hasMaterialHandlingEquipmentSignals;
global.hasStrongPetrochemicalSignals = hasStrongPetrochemicalSignals;
global.hasStrongOfficeServicesSignals = hasStrongOfficeServicesSignals;
global.hasStrongSchoolSignals = hasStrongSchoolSignals;
global.hasStrongAutomotiveSignals = hasStrongAutomotiveSignals;
global.hasStrongAutoPartsDistributionSignals = hasStrongAutoPartsDistributionSignals;
global.isCompetitorEnergyBroker = isCompetitorEnergyBroker;
global.TALK_TRACK_INDUSTRY_LABELS = TALK_TRACK_INDUSTRY_LABELS;
global.escapeRegExp = escapeRegExp;
global.talkTrackDriftsFromStructuredFacts = talkTrackDriftsFromStructuredFacts;
`;

// Run it using eval
eval(code);

async function debug() {
  const accountId = '2e23e350-fa3a-4fd7-9874-d1a0f69949af';
  const { data: account, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log('ACCOUNT METADATA:', JSON.stringify(account.metadata, null, 2));
  console.log('GET ACCOUNT IDENTITY PROFILE:', JSON.stringify(getAccountIdentityProfile(account), null, 2));

  // Let's build synthesized account with fallback candidates just like the API does
  const publicDescription = getPublicAccountDescription(account);
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${publicDescription} ${getAccountNotes(account)}`).toLowerCase();
  
  console.log('ACCOUNT TEXT PREVIEW (first 500 chars):');
  console.log(accountText.substring(0, 500));

  const multiSiteInfo = detectMultiSiteScale(account, null);
  const identityProfile = buildStructuredIdentityProfile(account, [], null, []);
  console.log('IDENTITY PROFILE FROM BUILD:', JSON.stringify(identityProfile, null, 2));
  
  const briefingAccount = identityProfile
    ? {
        ...account,
        metadata: {
          ...account.metadata,
          intelligenceProfile: identityProfile
        }
      }
    : account;

  const candidate = null; // In fallback mode, candidate is null
  const context = buildTalkTrackContext(briefingAccount, candidate, true, null);
  
  // The first generated talk track that was rejected:
  const firstTrack = "Often times for a national retail and distribution network like Hobby Lobby, the distribution center cooling, store HVAC, and facility lighting can all hit the meter during the same busy window. I'm curious, how do y'all tell whether the distribution center cooling, store HVAC, and facility lighting are what moved the bill that month, or is that side of things pretty much handled?";
  
  // The second generated talk track that was rejected:
  const secondTrack = "Having that Oklahoma City distribution hub running cooling, lighting, and production work all at the same time as the store network is pulling its own HVAC load — that can leave the meter carrying a pretty heavy peak charge across the whole portfolio heading into summer. I'm curious, how do y'all tell which piece of the footprint actually moved the bill that month, or is that side of things pretty much on autopilot?";

  console.log('\n--- RUNNING VALIDATION ON FIRST TRACK ---');
  runValidation(firstTrack, context, briefingAccount, candidate);

  console.log('\n--- RUNNING VALIDATION ON SECOND TRACK ---');
  runValidation(secondTrack, context, briefingAccount, candidate);
}

function runValidation(talkTrack, context, account, candidate) {
  const text = cleanText(talkTrack);
  const lower = text.toLowerCase();
  
  const accountText = cleanText(`${account.name || ''} ${account.industry || ''} ${getPublicAccountDescription(account)} ${getAccountNotes(account)} ${buildIdentityProfileText(account, candidate)} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const firstSentence = cleanText(text.split(/[.!?]+/)[0] || '');
  const genericHits = TALK_TRACK_GENERIC_PATTERNS.filter((pattern) => pattern.test(lower)).length;
  const sentenceCount = splitTalkTrackSentences(text).length;
  
  const mentionsSignal = context.signalFamily !== 'industry_context' &&
    TALK_TRACK_SIGNAL_KEYWORDS[context.signalFamily].some((keyword) => lower.includes(keyword.toLowerCase()));
  const mentionsIndustry = TALK_TRACK_INDUSTRY_KEYWORDS[context.industryCluster].some((keyword) => lower.includes(keyword.toLowerCase()));
  const mentionsMarket = context.marketFocus.some((phrase) => lower.includes(phrase.toLowerCase()));
  const mentionsAtLeastOneFocus = context.ercotFocus.some((phrase) => lower.includes(phrase.toLowerCase()));
  
  const isNationalRetailDistribution = account
    ? getAccountIdentityProfile(account, candidate)?.companyType === 'national retail and distribution network'
    : false;

  const genericOpening = /^(that|this|it)\s+(makes|is|was|would|can|usually|tends)\b/i.test(firstSentence);
  const unsupportedLeadershipAngle = context.signalFamily !== 'leadership_change' &&
    /\b(new leader|new cfo|new coo|new ceo|new president|new facilities director|new energy manager)\b/i.test(lower);
  const unsupportedAcquisitionAngle = context.signalFamily !== 'acquisition' &&
    /\b(ownership changes|ownership change|got inherited|what got inherited|inherited on the electricity side)\b/i.test(lower);
  const unsupportedFootprintAngle = context.signalFamily !== 'restructuring' &&
    /\b(footprint change|stranded power costs|unused meters|leftover contracts|meter cleanup|contract cleanup)\b/i.test(lower);
  const repeatedQuestionEcho = /\b(autopilot|proactively|current setup)\b[\s\S]{0,120}\b\1\b/i.test(lower);
  const filingJargon = /\b(sec filing|public filing|recent filing|filing)\b/i.test(lower);
  const footprintOpener = /reviewing the operational footprint|operational footprint for|reviewing the company profile|company profile for/i.test(lower);
  const incompleteReportOpener = /^i\s+(?:saw|noticed|came across)\s+(?:a|the)?\s*(?:report|article|news item|piece|update|post online)\s+(?:about|on)\s+[^.!?]{2,80}\.\s*(?:that|this|it)\s+(?:is|was|would|can|usually|tends|makes)\b/i.test(text);
  
  const healthcareRestaurantJargon = context.industryCluster === 'healthcare' &&
    /\b(coincident kitchen peak|service rushes?|game[-\s]?day|fryers?|grills?|restaurant|restaurant brand|kitchen peak)\b/i.test(lower);
  const healthcareHospitalityJargon = context.industryCluster === 'healthcare' &&
    /\b(lodging hvac|guest rooms?|hotel|motel|resort|banquet|event venue|wedding venue)\b/i.test(lower);
  const healthcareBankingJargon = context.industryCluster === 'healthcare' &&
    /\b(branch operations|branch portfolio|branch it loads?|atms?)\b/i.test(lower);
  const schoolManufacturingJargon = context.industryCluster === 'school_district' &&
    /\b(shift(?:s)?|production|startup|bake line|machine startup|factory)\b/i.test(lower);
  const residentialRestaurantJargon = context.industryCluster === 'residential_care' &&
    /\b(coincident kitchen peak|service rushes?|fryers?|grills?|restaurant)\b/i.test(lower);
  const hotelEventSpaceJargon = context.industryCluster === 'hotel_owner' &&
    /\b(event space|banquet space|banquet hall|wedding venue|concert venue|conference venue|game[-\s]?day)\b/i.test(lower);
  
  const accountIsHealthcare = /\b(healthcare|hospital|clinic|medical|medical practice|acupunctur|functional wellness|doctor|dental|ophthalmology|retina|therapy|patient|wellness care)\b/i.test(accountText);
  const accountIsDental = /\b(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry)\b/i.test(accountText);
  const accountIsDme = hasStrongDmeSignals(accountText);
  const accountIsRestaurant = hasStrongRestaurantSignals(accountText);
  const accountIsLogistics = hasStrongLogisticsSignals(accountText);
  const accountIsMaterialHandlingEquipment = hasMaterialHandlingEquipmentSignals(accountText);
  const accountIsPetrochemical = hasStrongPetrochemicalSignals(accountText);
  const accountIsOfficeServices = hasStrongOfficeServicesSignals(accountText);
  const accountIsSchool = hasStrongSchoolSignals(accountText);
  
  const accountHealthcareHotelJargon = accountIsHealthcare &&
    /\b(hotel load|hotel meter|guest rooms?|room load|laundry|lodging|motel|resort|hotel property|blended property|property-by-property)\b/i.test(lower);
  const accountDentalHospitalJargon = accountIsDental &&
    /\b(hospital|hospitality|emergency department|emergency room|inpatient|short-stay rooms?|acute care|guest rooms?|laundry|lodging|banquet|event venue|clinic)\b/i.test(lower);
  const accountDmeHospitalJargon = accountIsDme &&
    /\b(hospital|hospitality|clinic|medical practice|patient rooms?|patient care|emergency department|emergency room|inpatient|short-stay rooms?|acute care|guest rooms?|laundry|lodging|banquet|event venue)\b/i.test(lower);
  
  const accountSchoolManufacturingJargon = accountIsSchool &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|shift(?:s)?|bake line)\b/i.test(lower);
  const accountSchoolPracticeJargon = accountIsSchool &&
    /\b(practice(?:s)?|operatories?|patient flow|sterilization|imaging|clinic|dental|medical practice|hospitals?)\b/i.test(lower);
  const accountSchoolRetailJargon = accountIsSchool &&
    /\b(retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group)\b/i.test(lower);
    
  const accountIsAutomotive = hasStrongAutomotiveSignals(accountText);
  const accountIsRetail = context.industryCluster === 'retail' ||
    ((hasStrongRetailStoreSignals(accountText) || /\b(retail|store|stores?|showroom|customer-facing)\b/i.test(accountText)) &&
     !['manufacturing', 'logistics', 'food_storage', 'print_fulfillment', 'moving_storage'].includes(context.industryCluster));
     
  const accountIsAutoPartsDistribution = hasStrongAutoPartsDistributionSignals(accountText);
  const accountAutoPartsDealershipJargon = accountIsAutoPartsDistribution &&
    /\b(dealership|dealerships|showroom traffic|service bays?|lot lighting|vehicle inventory|auto dealer)\b/i.test(lower);
  const accountAutomotiveHotelJargon = accountIsAutomotive &&
    /\b(hotel|hotels|hotel's|guest rooms?|room load|laundry|lodging|motel|resort|hotel property|blended property)\b/i.test(lower);
  const accountAutomotiveRetailJargon = accountIsAutomotive &&
    /\b(retail operation|retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group)\b/i.test(lower);
    
  const accountIsFoodProduction = /\b(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|restaurant chains?|foodservice)\b/i.test(accountText);
  const accountFoodLogisticsJargon = accountIsFoodProduction &&
    /\b(warehouse groups?|dock activity|dock work|dock doors?|high-volume logistics|logistics groups?|automation and hvac|warehouse's summer peak)\b/i.test(lower);
  const accountPetrochemicalLogisticsJargon = accountIsPetrochemical &&
    /\b(logistics business|warehouse groups?|warehouse support|dock activity|dock doors?|terminal-adjacent|high-volume logistics|distribution centers?)\b/i.test(lower);
  const accountDmeMedicalAllowance = accountIsDme &&
    /\b(dme|durable medical equipment|medical equipment|equipment|inventory|delivery|storage|turnaround)\b/i.test(lower);
    
  const accountRestaurantManufacturingJargon = accountIsRestaurant &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution)\b/i.test(lower);
  const accountRestaurantRetailJargon = accountIsRestaurant &&
    /\b(showroom|showroom cooling|retail floor|store traffic|lot lighting|service bays?)\b/i.test(lower);
  const accountLogisticsManufacturingJargon = accountIsLogistics &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|process equipment|assembly)\b/i.test(lower);
  const accountMaterialHandlingManufacturingJargon = accountIsMaterialHandlingEquipment &&
    /\b(manufacturing operation|production lines?|process loads?|compressed air|machine startup|startup sequence|plant|factory)\b/i.test(lower);
  const accountMaterialHandlingGenericLogisticsJargon = accountIsMaterialHandlingEquipment &&
    /\b(distribution operation|logistics operation|warehouse group|freight|cargo|dock activity|dock doors?|storage climate control)\b/i.test(lower);
  const accountOfficeIndustrialJargon = accountIsOfficeServices &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|dock activity|dock doors?|terminal throughput)\b/i.test(lower);
    
  const accountRetailIndustrialJargon = accountIsRetail && !isNationalRetailDistribution &&
    /\b(energy-intensive facility|process equipment|process startup|startup times|large motors|manufacturing|industrial|production lines?|machine startup|factory|plant)\b/i.test(lower);
  const accountRetailLogisticsJargon = accountIsRetail && !isNationalRetailDistribution &&
    /\b(logistics operation|logistics and distribution|dock activity|dock doors?|daily throughput|terminal|freight|cargo)\b/i.test(lower);
    
  const unexplainedJargon = /\b(load factor|base load|demand ratchet|demand ratchets|forensic signal|forensic driver|thermal liability|artificial liability|peak demand charges|transmission side|correlation)\b/i.test(lower);
  const bannedJargonTerms = /\b(coincident peaks?|4cp exposure|4-cp|four coincident peak|scarcity adder|ercot real-time|ancillary services charge|nodal price)\b/i.test(lower);
  const redundantFootprint = (/\bfootprint\b/i.test(lower) && lower.indexOf('footprint') !== lower.lastIndexOf('footprint'));
  const isCompetitor = account ? isCompetitorEnergyBroker(account) : false;
  const matchedAngleBuckets = [mentionsSignal, mentionsIndustry, mentionsMarket].filter(Boolean).length;
  const marketFeelsBoltedOn = mentionsMarket && (mentionsSignal || mentionsIndustry) && sentenceCount > 2;
  
  const mismatchedIndustryLabel = (Object.entries(TALK_TRACK_INDUSTRY_LABELS)).some(([cluster, labels]) => {
    if (cluster === context.industryCluster) return false;
    return labels.some((label) => {
      const escaped = escapeRegExp(label.toLowerCase());
      return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
    });
  });
  const overstuffed = matchedAngleBuckets > 2 || marketFeelsBoltedOn;
  const structuredFactDrift = talkTrackDriftsFromStructuredFacts(text, context);

  console.log('genericHits:', genericHits > 0);
  console.log('genericOpening:', genericOpening);
  console.log('isCompetitor:', isCompetitor);
  console.log('bannedJargonTerms:', bannedJargonTerms);
  console.log('redundantFootprint:', redundantFootprint);
  console.log('unsupportedLeadershipAngle:', unsupportedLeadershipAngle);
  console.log('unsupportedAcquisitionAngle:', unsupportedAcquisitionAngle);
  console.log('unsupportedFootprintAngle:', unsupportedFootprintAngle);
  console.log('repeatedQuestionEcho:', repeatedQuestionEcho);
  console.log('filingJargon:', filingJargon);
  console.log('footprintOpener:', footprintOpener);
  console.log('incompleteReportOpener:', incompleteReportOpener);
  console.log('schoolManufacturingJargon:', schoolManufacturingJargon);
  console.log('accountSchoolManufacturingJargon:', accountSchoolManufacturingJargon);
  console.log('accountSchoolPracticeJargon:', accountSchoolPracticeJargon);
  console.log('accountSchoolRetailJargon:', accountSchoolRetailJargon);
  console.log('structuredFactDrift:', structuredFactDrift);
  console.log('residentialRestaurantJargon:', residentialRestaurantJargon);
  console.log('hotelEventSpaceJargon:', hotelEventSpaceJargon);
  console.log('unexplainedJargon:', unexplainedJargon);
  console.log('sentenceCount:', sentenceCount !== 2);
  console.log('wordCount:', wordCount < 14 || wordCount > 95);
  console.log('overstuffed:', overstuffed);
  console.log('mismatchedIndustryLabel:', mismatchedIndustryLabel && !accountDmeMedicalAllowance);
  
  // Custom checks that are not logged:
  console.log('\n-- NON-LOGGED CHECKS --');
  console.log('accountIsAutomotive:', accountIsAutomotive);
  console.log('accountIsRetail:', accountIsRetail);
  console.log('isNationalRetailDistribution:', isNationalRetailDistribution);
  console.log('accountRetailIndustrialJargon:', accountRetailIndustrialJargon);
  console.log('accountRetailLogisticsJargon:', accountRetailLogisticsJargon);
  console.log('accountAutomotiveRetailJargon:', accountAutomotiveRetailJargon);
  console.log('accountAutomotiveHotelJargon:', accountAutomotiveHotelJargon);
}

debug();
