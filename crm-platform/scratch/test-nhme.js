const account = {
  name: "National HME",
  industry: "hospital & health care",
  description: "National HME, Inc. is a prominent provider of durable medical equipment (DME) focused on hospice, PACE, long-term care, and post-acute care settings. Founded in 2006 and based in Irving, TX, the company operates over 60 branches across the U.S. and features a 40,000 sq ft national distribution center. This infrastructure allows for efficient service delivery without backorders or long lead times.\n\nThe company offers a wide range of high-quality DME, including oxygen concentrators and BiPap machines, with a direct-service model that ensures timely delivery and setup. National HME also utilizes its proprietary Hospice Cloud Pro technology for streamlined ordering and management, providing real-time tracking and analytics. With a commitment to high standards in equipment and patient care, the company operates a 24/7 call center and emphasizes a family-oriented approach in its services. National HME proudly serves thousands of hospices and healthcare organizations nationwide, ensuring a positive experience for patients and their families.",
  metadata: {}
};

function cleanText(t) {
  return (t || '').trim();
}
function getPublicAccountDescription(acc) {
  return acc.description;
}
function getAccountNotes(acc) {
  return '';
}

function hasStrongDmeSignals(text) {
  return /(durable medical equipment|\bdme\b|home medical equipment|medical equipment|medical supplies?|equipment logistics|equipment delivery|equipment maintenance|direct-service locations?|direct service locations?|hospice dme|hospice equipment|inventory management|medical supply(?:ies)?)/i.test(text);
}

function inferIndustryClusterFromSignals(account, candidate) {
  const notes = getAccountNotes(account)
  const cleanCandidate = candidate?.label === 'Industry Trends' ? null : candidate
  const text = cleanText(`${account.industry || ''} ${account.name || ''} ${getPublicAccountDescription(account)} ${notes} ${cleanCandidate?.title || ''} ${cleanCandidate?.snippet || ''}`).toLowerCase()
  
  if (/(healthcare|\bhospital\b|clinic|medical|senior living|assisted living|nursing|alzheimer'?s?|memory care|retirement living|continuum of care|skilled nursing|pharma|pharmacy|psychiatric|partial hospitalization|intensive outpatient|substance use|chemical dependency)/.test(text)) {
    // Wait, let's see if this healthcare check is run before the DME check in the real file!
    // In our file view, line 4033 is DME, line 4050 is healthcare.
  }
  
  // Let's print out what text matches.
  console.log("has DME signals:", hasStrongDmeSignals(text));
  
  // Healthcare check in line 4050:
  const healthcareRegex = /(healthcare|\bhospital\b|clinic|medical|senior living|assisted living|nursing|alzheimer'?s?|memory care|retirement living|continuum of care|skilled nursing|pharma|pharmacy|psychiatric|partial hospitalization|intensive outpatient|substance use|chemical dependency)/;
  console.log("matches healthcare:", healthcareRegex.test(text));
}

inferIndustryClusterFromSignals(account, null);
