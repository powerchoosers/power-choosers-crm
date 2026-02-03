
const fetch = require('node-fetch'); // Ensure node-fetch is available or use built-in if Node 18+
const API_KEY = process.env.APOLLO_API_KEY || 'YOUR_API_KEY_HERE'; // I will rely on the server to have this or use the one from existing config if possible, but for this script I might need to read it from a file or assume environment.
// Actually, better to run this via the existing server or read the .env file.
// I'll assume I can read .env.local

require('dotenv').config({ path: './crm-platform/.env.local' });

async function testApollo() {
    const apiKey = process.env.NEXT_PUBLIC_APOLLO_API_KEY;
    if (!apiKey) {
        console.error("No API Key found in .env.local");
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey
    };

    console.log("1. Searching for Company: Integrated Circuit Solutions USA");
    const searchRes = await fetch('https://api.apollo.io/v1/organizations/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            q_organization_name: "Integrated Circuit Solutions USA",
            page: 1,
            per_page: 1
        })
    });
    
    const searchData = await searchRes.json();
    console.log("Search Result Count:", searchData.organizations?.length);
    
    if (!searchData.organizations?.length) {
        console.log("No organization found.");
        return;
    }

    const org = searchData.organizations[0];
    console.log("Organization Found:", {
        id: org.id,
        name: org.name,
        domain: org.domain,
        phone: org.phone,
        phones: org.organization_phones // check if this exists
    });

    console.log("\n2. Searching for People at this Org...");
    const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            organization_ids: [org.id],
            page: 1,
            per_page: 3,
            person_titles: ["Sales", "Manager", "Director", "CEO"] 
        })
    });

    const peopleData = await peopleRes.json();
    console.log("People Found:", peopleData.people?.length);

    if (peopleData.people?.length > 0) {
        const person = peopleData.people[0];
        console.log("Target Person:", {
            id: person.id,
            name: person.name,
            email: person.email, // often hidden
            phone_numbers: person.phone_numbers // often hidden
        });

        console.log("\n3. Enriching Person (Simulating Reveal)...");
        // Note: Real enrichment costs credits. 
        // I will just check the /people/match endpoint which is sometimes used for enrichment or just re-fetching.
        // Or I can check the legacy 'reveal' logic. 
        // For now, let's see what data we have *before* reveal.
        
        // If the user says "phones and emails reveal in two different ways", 
        // it implies we might be hitting different endpoints or using specific flags.
    }
}

testApollo();
