const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Read API key from .env.local
let supabaseUrl = '';
let supabaseServiceKey = '';
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim().replace(/['\"]/g, '');
  if (keyMatch) supabaseServiceKey = keyMatch[1].trim().replace(/['\"]/g, '');
} catch (e) {
  console.error('Failed to read .env.local:', e.message);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Copy definitions of functions from intelligence-brief.ts
function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\\+/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function getPublicAccountDescription(account) {
  return account.description ? cleanText(account.description) : '';
}

function getAccountNotes(account) {
  const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : null;
  const candidates = [
    metadata && 'notes' in metadata ? metadata.notes : null,
    metadata && 'note' in metadata ? metadata.note : null,
    metadata && 'accountNotes' in metadata ? metadata.accountNotes : null,
    metadata && 'summary' in metadata ? metadata.summary : null,
  ];
  return candidates.map(cleanText).filter(Boolean).join(' ').toLowerCase();
}

function getIdentityProfileSeedText(account) {
  return cleanText([
    account.name,
    account.industry,
    getPublicAccountDescription(account),
    getAccountNotes(account),
    account.website,
    account.domain,
  ].filter(Boolean).join(' ')).toLowerCase();
}

function hasStrongSchoolSignals(text) {
  return /(school district|independent school district|isd\b|public school|charter school|k-12|school campus|students|classrooms|teachers|students|school\b)/i.test(text);
}

function hasStrongAutomotiveDealerSignals(text) {
  return /(dealership|dealerships|car dealer|auto dealer|vehicle inventory|showrooms?|showroom|certified pre-owned|new vehicles?|used vehicles?|pre-owned|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)/i.test(text);
}

function hasStrongRetailStoreSignals(text) {
  return /(convenience stores?|c[-\s]?stores?|gas station|fuel stations?|travel centers?|board games?|card games?|collectibles?|gaming accessories|game store|game retailer|hobby store|tabletop games?|trading cards?|tcg\b|miniatures?|pokemon|magic:?\s*the gathering|warhammer|lifestyle (?:and )?design store|department store|luxury retail|retail store|showroom space|showrooms?|home goods|tabletop|bedding|bath|furniture|garden|fashion|apothecary|shopping|customer-facing retail)/i.test(text);
}

function hasPublicTransitSignals(text) {
  return /(public transportation|transit authority|streetcar|street car|trolley|m-line|railway|light rail|fare-free|historic trolley|operate(?:s|d)? .*trolley|restore, maintain, and operate historic trolley cars|vintage trolley)/i.test(text);
}

function hasPrintFulfillmentSignals(text) {
  return /(direct mail|mailing company|commercial mailer|bulk mail|reprographics|document reproduction|digital imaging|print shop|print production|on[-\s]?demand printing|content management|branded storefronts?|training materials|compliance communications?|fulfillment and print|print and fulfillment|ecommerce fulfillment|e-commerce fulfillment)/i.test(text);
}

function hasMovingStorageSignals(text) {
  return /(moving (?:and|&) storage|moving storage|moving company|relocation services?|commercial moving|residential moving|household goods|storage company|warehousing and moving|supply chain solutions|van line|movers?\b)/i.test(text);
}

function hasStrongBehavioralHealthSignals(text) {
  return /(psychiatric|psychiatry|mental health|behavioral health|behavioral healthcare|substance use|substance abuse|chemical dependency|addiction treatment|inpatient mental health|partial hospitalization|intensive outpatient|residential treatment|crisis services|counseling|therapy|trauma-informed|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health)/i.test(text);
}

function hasStrongBakeryCafeSignals(text) {
  return /(bakery caf[eé]|bakery cafe|neighborhood bakery|bakery chain|fresh baked goods|pastries|warm breads|cakes|brewed drinks|bakery-caf[eé]|baked goods and beverages|\b(coffee|espresso|barista)\b|drive-thru coffee)/i.test(text);
}

function isCompetitorEnergyBroker(account) {
  return false;
}

function inferIndustryClusterFromSignals(account, candidate) {
  const notes = getAccountNotes(account);
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${getPublicAccountDescription(account)} ${notes} ${candidate?.title || ''} ${candidate?.snippet || ''}`).toLowerCase();
  
  if (!text) return 'unknown';
  if (isCompetitorEnergyBroker(account)) return 'office_services';
  
  if (/(defense|space|aerospace|rocket|aviation|aircraft|missile|orbital|satellite)/.test(text)) return 'manufacturing';
  if (/(oil and gas|oilfield|natural gas|mining|quarry|cement|refinery|industrial gas|midstream|upstream|downstream|pipeline|petroleum)/.test(text)) {
    return 'energy_intensive';
  }
  if (/(blood center|bloodcare|blood bank|blood donation|blood products|blood components|transfusion|donor center|mobile blood drives?|blood collection|blood processing|specialized laboratory testing)/.test(text)) return 'healthcare';
  if (hasPublicTransitSignals(text)) return 'public_transit';
  if (hasPrintFulfillmentSignals(text)) return 'print_fulfillment';
  if (hasMovingStorageSignals(text)) return 'moving_storage';
  if (/(shelter|women's shelter|emergency shelter|homeless shelter|transitional housing|supportive housing|children'?s home|foster care|adoption assistance|residential services|independent living center|counseling center|youth services|human services|group home|residential care)/.test(text)) return 'residential_care';
  if (hasStrongBehavioralHealthSignals(text)) return 'healthcare';
  if (hasStrongBakeryCafeSignals(text)) return 'restaurant';
  if (hasStrongAutomotiveDealerSignals(text)) {
    console.log('RETAIL MATCHED ON hasStrongAutomotiveDealerSignals:', text.match(/(dealership|dealerships|car dealer|auto dealer|vehicle inventory|showrooms?|showroom|certified pre-owned|new vehicles?|used vehicles?|pre-owned|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)/i));
    return 'retail';
  }
  if (/(\bbrewery\b|\bbreweries\b|\bbrewing company\b|\bbrewing co\.?\b|\btaproom\b|\btap room\b|\bcraft beer\b|\bcraft brewery\b|\bmicrobrewery\b|\bnanobrewery\b|\bdistillery\b|\bdistilled spirits\b|\bwinery\b|\bwine maker\b|\bwinemaker\b|\bvineyard\b|\balemaker\b|\bale house\b)/.test(text)) return 'food_storage';
  if (hasStrongRetailStoreSignals(text)) {
    console.log('RETAIL MATCHED ON hasStrongRetailStoreSignals:', text.match(/(convenience stores?|c[-\s]?stores?|gas station|fuel stations?|travel centers?|board games?|card games?|collectibles?|gaming accessories|game store|game retailer|hobby store|tabletop games?|trading cards?|tcg\b|miniatures?|pokemon|magic:?\s*the gathering|warhammer|lifestyle (?:and )?design store|department store|luxury retail|retail store|showroom space|showrooms?|home goods|tabletop|bedding|bath|furniture|garden|fashion|apothecary|shopping|customer-facing retail)/i));
    return 'retail';
  }
  
  if (/(healthcare|hospital|clinic|medical|senior living|assisted living|nursing|alzheimer'?s?|memory care|retirement living|continuum of care|skilled nursing|pharma|pharmacy|psychiatric|partial hospitalization|intensive outpatient|substance use|chemical dependency)/.test(text)) return 'healthcare';
  if (/(restaurant|dining|cafe|café|grill|bar\b|pub\b|eatery|hospitality|hotel|lodging|venue|wedding|event space|banquet)/.test(text)) return 'restaurant';
  if (/(retail|store|shopping|franchise|dealer|showroom|convenience|recreation|fitness|gym|entertainment|amusement|automotive|auto)/.test(text)) {
    console.log('RETAIL MATCHED ON:', text.match(/(retail|store|shopping|franchise|dealer|showroom|convenience|recreation|fitness|gym|entertainment|amusement|automotive|auto)/));
    return 'retail';
  }
  if (/(bank|credit union|financial|wealth|insurance|lending)/.test(text)) return 'banking';
  if (/(cold storage|refrigerat|freezer|food (?:storage|process|production|distribut|wholesale)|beverage (?:storage|process|production|distribut|wholesale)|grocery|produce|dairy|meat|bakery)/.test(text)) return 'food_storage';
  if (/(church|synagogue|mosque|temple|congregation|parish|worship|ministry|religious|faith)/.test(text)) return 'religious';
  if (/(primary\/secondary education|school district|independent school district|isd|public school|charter school|k-12|school board|high school|middle school|elementary school|\bschools?\b)/.test(text)) return 'school_district';
  if (/(college|university|higher education|community college|student housing|dorm|residence hall|campus ministry)/.test(text)) return 'higher_education';
  if (/(municipal|government|city|county|public sector|civic|public works|public safety|utility infrastructure)/.test(text)) return 'public_sector';
  if (/(school|education|university|college|nonprofit|foundation|charity)/.test(text)) return 'education_nonprofit';
  if (/(technology|software|saas|data center|it services|cloud|digital)/.test(text)) return 'technology';
  if (/(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect)/.test(text)) return 'office_services';
  
  return 'unknown';
}

function profileConflictsWithCoreSignals(profile, accountText) {
  const profileText = cleanText([
    profile.companyType,
    profile.operatingModel,
    profile.facilityType,
    ...(profile.identityKeywords || []),
    ...(profile.powerKeywords || []),
    ...(profile.talkTrackGuardrails || []),
  ].join(' ')).toLowerCase();

  const schoolSignals = hasStrongSchoolSignals(accountText);
  if (schoolSignals && /(retail|store|showroom|shopping|customer-facing retail|retail group|retail footprint|roll-?up view)/i.test(profileText)) {
    return true;
  }
  return false;
}

async function run() {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', '8d92a33f-1112-4c2b-9748-d5db5708ecb8')
    .single();

  if (error) {
    console.error('Error fetching account:', error.message);
    process.exit(1);
  }

  console.log('Account Name:', account.name);
  console.log('Account Industry:', account.industry);
  console.log('Account Description:', account.description);

  const accountText = getIdentityProfileSeedText(account);
  console.log('\nSeed Text:', accountText);

  const schoolSignals = hasStrongSchoolSignals(accountText);
  console.log('hasStrongSchoolSignals:', schoolSignals);

  const baseCluster = inferIndustryClusterFromSignals(account, null);
  console.log('Base Cluster inferred:', baseCluster);

  const profile = account.metadata?.intelligenceProfile;
  if (profile) {
    console.log('\nProfile found in metadata:', JSON.stringify(profile, null, 2));
    const conflict = profileConflictsWithCoreSignals(profile, accountText);
    console.log('Profile conflicts with core signals:', conflict);
  } else {
    console.log('\nNo profile found in metadata.');
  }
}

run();
