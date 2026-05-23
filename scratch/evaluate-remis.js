const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = '';
let serviceRoleKey = '';

try {
  const env = fs.readFileSync('.env.local', 'utf8');
  const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim().replace(/['\"]/g, '');
  if (keyMatch) serviceRoleKey = keyMatch[1].trim().replace(/['\"]/g, '');
} catch (e) {
  console.error('Failed to read env:', e.message);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Import helpers from the api handler (since it's Next.js and has TS/ESM, we can just copy-paste the regexes and variables to evaluate here)
const hasStrongHealthcareSignals = (text) => /(healthcare|hospital|clinic|medical|behavioral health|mental health|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health|crisis center|crisis services|early childhood intervention|surgical center|surgery center|ambulatory surgery center|patient care|specialist|wellness|doctor)/i.test(text);
const hasStrongBehavioralHealthSignals = (text) => /(psychiatric|psychiatry|mental health|behavioral health|behavioral healthcare|substance use|substance abuse|chemical dependency|addiction treatment|inpatient mental health|partial hospitalization|intensive outpatient|residential treatment|crisis services|counseling|therapy|trauma-informed|idd|intellectual\/developmental disabilities|intellectual and developmental disabilities|community mental health)/i.test(text);
const hasStrongDentalSignals = (text) => /(dental|dentist|dentistry|orthodont|orthodontic|oral surgery|oral health|periodont|endodont|prosthodont|hygienist|hygiene|dso\b|dpo\b|practice acquisition|practice management|operatories?|patient chairs?|chairside|implant|restorative dentistry|multi-site dental|dental partnership organization)/i.test(text);
const hasStrongAutomotiveSignals = (text) => /(auto group|automotive|dealership|dealerships|car dealer|auto dealer|vehicle inventory|service bays?|service department|parts department|parts store|showrooms?|showroom|certified pre-owned|new vehicles?|used vehicles?|pre-owned|lot lighting|amg|mercedes|bmw|audi|lexus|toyota|honda|ford|chevrolet|cadillac|hyundai|kia|volkswagen|nissan|jeep|dodge|ram|gmc|subaru)/i.test(text);
const hasStrongRetailStoreSignals = (text) => /(convenience stores?|c[-\s]?stores?|gas station|fuel stations?|travel centers?|board games?|card games?|collectibles?|gaming accessories|game store|game retailer|hobby store|tabletop games?|trading cards?|tcg\b|miniatures?|pokemon|magic:?\s*the gathering|warhammer|lifestyle (?:and )?design store|department store|luxury retail|retail store|showroom space|showrooms?|home goods|tabletop|bedding|bath|furniture|garden|fashion|apothecary|shopping|customer-facing retail)/i.test(text);
const hasStrongRestaurantSignals = (text) => /(restaurant|dining|kitchen|food service|service rushes?|grills?|fryers?|cafe|café|bakery caf[eé]|bar|eatery|banquet|event space|hospitality|hotel|resort|lodging|\b(coffee|espresso|barista)\b|drive-thru coffee)/i.test(text);
const hasStrongManufacturingSignals = (text) => /(manufacturing|industrial|plant|production|fabricat|machine|chemical|packag|assembly|process equipment)/i.test(text);
const hasStrongPetrochemicalSignals = (text) => /(petrochemical|petroleum[-\s]?based|c4 hydrocarbons?|crude c4|butadiene|butene[-\s]?1|polyisobutylene|\bmtbe\b|isobutylene|raffinate|chemical products?|chemical manufacturing|processor of crude c4|petrochemical raw materials?|synthetic rubber|lubricant additives|surfactants)/i.test(text);
const hasStrongLogisticsSignals = (text) => /(freight forwarder|nvo?cc|cargo|shipping|trucking|transport|logistics|warehouse|distribution|fulfillment|auto logistics|terminal|dock|yard|supply chain)/i.test(text);
const hasStrongOfficeServicesSignals = (text) => /(office|professional services|law|legal|consulting|accounting|marketing|real estate|staffing|agency|design|engineering|architect|executive office)/i.test(text);
const hasStrongSchoolSignals = (text) => /(school district|independent school district|isd\b|public school|charter school|k-12|school campus|students|classrooms|teachers|school\b|academy|daycare|preschool|childcare|tutoring|learning center)/i.test(text);
const hasStrongDmeSignals = (text) => /(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/i.test(text);
const hasStrongAutoPartsDistributionSignals = (text) => /(wholesale auto parts|automotive parts supplier|auto parts supplier|auto parts distributor|aftermarket parts|aftermarket collision parts|parts house|parts stores?|parts supplier|parts distribution|distribution centers?|same[-\s]?day parts|automotive service centers|repair centers|fleet and municipal)/i.test(text);

async function run() {
  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', '2ce36fd8-72c6-4cc2-a9fa-098f00cc582f');
  
  const account = data[0];
  const talkTrack = "Having those glass door production lines running and the plant HVAC humming through the day naturally pulls a heavy demand spike on the utility meter, especially when those refrigeration components are cycling. I'm curious, how do y'all time the production equipment and HVAC load against the peak hours, or is that side of things pretty much on autopilot?";

  const accountText = `${account.name || ''} ${account.industry || ''} ${account.description || ''} ${JSON.stringify(account.metadata || {})} ${account.website || ''}`.toLowerCase();
  const lower = talkTrack.toLowerCase();

  const context = {
    industryCluster: 'manufacturing'
  };

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
    /\b(retail footprint|roll-?up view|store meters?|store-level|stores?|customer-facing retail|retail group)\b/i.test(lower);
  const accountIsFoodProduction = /\b(food production|food manufacturing|food manufacturer|food processing|usda[-\s]?approved|custom proteins?|soups?|sauces?|side dishes?|salad dressings?|dehydrated beans|dry sausage|kettle soups?|restaurant chains?|foodservice)\b/i.test(accountText);
  const accountFoodLogisticsJargon = accountIsFoodProduction &&
    /\b(warehouse groups?|dock activity|dock work|dock doors?|high-volume logistics|logistics groups?|automation and hvac|warehouse's summer peak)\b/i.test(lower);
  
  const accountIsPetrochemical = hasStrongPetrochemicalSignals(accountText);
  const accountPetrochemicalLogisticsJargon = accountIsPetrochemical &&
    /\b(logistics business|warehouse groups?|warehouse support|dock activity|dock doors?|terminal-adjacent|high-volume logistics|distribution centers?)\b/i.test(lower);
  
  const accountIsDme = hasStrongDmeSignals(accountText);
  const accountIsRestaurant = hasStrongRestaurantSignals(accountText);
  const accountIsLogistics = hasStrongLogisticsSignals(accountText);
  const accountIsOfficeServices = hasStrongOfficeServicesSignals(accountText);
  const accountIsSchool = hasStrongSchoolSignals(accountText);
  
  const accountRestaurantManufacturingJargon = accountIsRestaurant &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution)\b/i.test(lower);
  const accountLogisticsManufacturingJargon = accountIsLogistics &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|process equipment|assembly)\b/i.test(lower);
  const accountOfficeIndustrialJargon = accountIsOfficeServices &&
    /\b(production lines?|machine startup|startup sequence|plant|factory|manufacturing|industrial|warehouse|logistics|distribution|dock activity|dock doors?|terminal throughput)\b/i.test(lower);
  const accountRetailIndustrialJargon = accountIsRetail &&
    /\b(energy-intensive facility|process equipment|process startup|startup times|large motors|manufacturing|industrial|production lines?|machine startup|factory|plant)\b/i.test(lower);
  const accountRetailLogisticsJargon = accountIsRetail &&
    /\b(logistics operation|logistics and distribution|dock activity|dock doors?|daily throughput|terminal|freight|cargo)\b/i.test(lower);

  console.log('--- Remis America Evaluation ---');
  console.log('accountText:', accountText);
  console.log('lower:', lower);
  console.log('accountIsRetail:', accountIsRetail);
  console.log('accountIsRestaurant:', accountIsRestaurant);
  console.log('accountIsLogistics:', accountIsLogistics);
  console.log('accountIsOfficeServices:', accountIsOfficeServices);
  console.log('accountIsSchool:', accountIsSchool);
  console.log('accountRestaurantManufacturingJargon:', accountRestaurantManufacturingJargon);
  console.log('accountLogisticsManufacturingJargon:', accountLogisticsManufacturingJargon);
  console.log('accountOfficeIndustrialJargon:', accountOfficeIndustrialJargon);
  console.log('accountRetailIndustrialJargon:', accountRetailIndustrialJargon);
  console.log('accountRetailLogisticsJargon:', accountRetailLogisticsJargon);
}

run();
