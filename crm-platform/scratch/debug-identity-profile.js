const fs = require('fs');
const path = require('path');

// Mock data of the account as returned by the SQL query
const account = {
  id: "a0c44b32-4ac0-407e-80c2-c6b135d5641d",
  name: "Shine Pediatrics",
  industry: "Hospital & Health Care",
  metadata: {
    sqft: "",
    meters: [{ id: "936f64f5-a356-4606-a49d-aa388ac016fb", rate: "", esiId: "", address: "3600 Shire Boulevard, Richardson, TX 75082, United States", endDate: "" }],
    country: "United States",
    ownerId: "l.patterson@nodalpoint.io",
    enriched: false,
    company_description: "Shine Pediatrics and Wellness Center has grown out of a continued vision to spread the message of integrative healthcare in the pediatric sector. Officially opening in December of 2012 as part of an ongoing effort to improve access to integrative pediatric health care in the Dallas-Ft Worth area.\nIn order to meet the needs of the ever-changing health care environment, we offer a unique practice in the DFW metroplex. Our practice will provide the proper balance of well researched, evidenced based guidelines for the management of common disease processes while also providing expert guidance and care of more acute, complex medical conditions for children ages 0-18 years.\nCome shine with us at Shine Pediatrics and Wellness Center!",
    source_company_fields: {
      company_description: "Shine Pediatrics and Wellness Center has grown out of a continued vision to spread the message of integrative healthcare in the pediatric sector. Officially opening in December of 2012 as part of an ongoing effort to improve access to integrative pediatric health care in the Dallas-Ft Worth area.\nIn order to meet the needs of the ever-changing health care environment, we offer a unique practice in the DFW metroplex. Our practice will provide the proper balance of well researched, evidenced based guidelines for the management of common disease processes while also providing expert guidance and care of more acute, complex medical conditions for children ages 0-18 years.\nCome shine with us at Shine Pediatrics and Wellness Center!"
    }
  }
};

const candidate = {
  title: "Shine Pediatrics At Shine Pediatrics, we are not your typical pediatric doctor’s office",
  snippet: "Shine Pediatrics At Shine Pediatrics, we are not your typical pediatric doctor’s office. We integrate conventional and alternative methods that make us the most unique pediatric office. Get Started Now One Child at a Time with All of Our Spirit, Soul, & Senses WHAT WE’RE ALL ABOUT Providing a safe place for our patients and their loved ones. We promise to serve as a beacon of light and refuge to families in search of safe, effective, and individualized healthcare, by incorporating both conventional and functional m",
  url: "https://shinepediatrics.com",
  sourceKind: "web",
  priority: 8
};

// Read the code and extract helpers
const codePath = path.join(__dirname, '../src/pages/api/accounts/[accountId]/intelligence-brief.ts');
let code = fs.readFileSync(codePath, 'utf8');

// Replace exports/imports so it can run in Node
code = code.replace(/import\s+.*?;/g, '');
code = code.replace(/export\s+async\s+function\s+handler\b/, 'async function handler');
code = code.replace(/export\s+/, '');

// Run it using eval
eval(code);

// Now we can call getAccountIdentityProfile directly!
const mockBriefingAccount = {
  ...account,
  metadata: {
    ...account.metadata,
    intelligenceProfile: {
      version: 1,
      evidence: ["test"],
      confidence: "medium",
      companyType: "medical practice",
      generatedAt: new Date().toISOString(),
      sourceKinds: [],
      facilityType: "clinic / medical office",
      powerKeywords: ["HVAC", "patient hours", "treatment rooms"],
      operatingModel: "daytime clinical facility",
      industryCluster: "healthcare",
      identityKeywords: ["medical practice", "clinic", "patient care"],
      talkTrackGuardrails: ["No hotel language", "No hospital-inpatient language", "No restaurant language", "No manufacturing language"]
    }
  }
};

const profileResult = getAccountIdentityProfile(mockBriefingAccount, null);
console.log('getAccountIdentityProfile result:', profileResult);
