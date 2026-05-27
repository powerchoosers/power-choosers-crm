// Node script to trigger generation endpoints


const targets = [
  {
    accountId: "0081dd8b-be38-4ae4-a9ed-1bf5e4b1472b",
    accountName: "TES - Telecom Electric Supply",
    executionId: "e5067dfa-9db2-43c6-8335-7957f0228514",
    contactName: "Christy Moses"
  },
  {
    accountId: "0238b55e-a3fc-4f38-8472-12674cf17790",
    accountName: "Galena Park ISD",
    executionId: "19500d11-bd5d-437a-9dc9-c80031cc2722",
    contactName: "Zach Fade"
  },
  {
    accountId: "0934f138-506e-49cf-9fe3-6c5b76ea1b6f",
    accountName: "Architectural Lighting Alliance (ALA)",
    executionId: "ad743359-c2fd-4508-a958-58402709510b",
    contactName: "Saji Daniel"
  },
  {
    accountId: "099525bf-3c9e-4104-be57-4f7c2ca0393e",
    accountName: "Mission Produce",
    executionId: "af577d27-ea65-4285-b461-9a1760c1111e",
    contactName: "Francisco Padilla"
  },
  {
    accountId: "0a682018-5ab1-4533-bf5f-16ddfc5711f8",
    accountName: "National HME",
    executionId: "bb125ece-2cec-4fe5-8a7c-6839bac6117f",
    contactName: "Alex Johnson"
  }
];

async function run() {
  for (const target of targets) {
    console.log(`\n==================================================`);
    console.log(`STEP 1: Refreshing Intelligence Brief for: ${target.accountName} (${target.accountId})`);
    
    try {
      const briefUrl = `http://localhost:3000/api/accounts/${target.accountId}/intelligence-brief`;
      const briefRes = await fetch(briefUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev-bypass-token',
          'Content-Type': 'application/json'
        }
      });
      
      const briefData = await briefRes.json();
      console.log(`Brief status: ${briefRes.status}`);
      console.log(`Brief result message: ${briefData.message}`);
      if (briefData.brief) {
        console.log(`Headline: ${briefData.brief.signal_headline}`);
        console.log(`Detail: ${briefData.brief.signal_detail}`);
        console.log(`Talk Track: ${briefData.brief.talk_track}`);
      }
      
      console.log(`\nSTEP 2: Regenerating Email Step for Contact: ${target.contactName} (Execution: ${target.executionId})`);
      const reviewUrl = `http://localhost:3000/api/email/sequence-review`;
      const reviewRes = await fetch(reviewUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          executionId: target.executionId,
          action: 'regenerate'
        })
      });
      
      const reviewData = await reviewRes.json();
      console.log(`Email generation status: ${reviewRes.status}`);
      console.log(`Email generation result:`, JSON.stringify(reviewData));
      
    } catch (err) {
      console.error(`Error processing pipeline for ${target.accountName}:`, err);
    }
  }
}

run();
