
account-detail.js:16     ❌ Industry: (empty)
account-detail.js:16     ❌ Employees: (empty)
account-detail.js:16     ❌ Location: (empty)
account-detail.js:16     ❌ LinkedIn: (empty)
account-detail.js:16     ❌ Founded Year: (empty)
account-detail.js:16     ❌ Revenue: (empty)
account-detail.js:16 
  💾 Saved to: window.__diagnosticCompanyData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 👥 TEST 2: CONTACTS SEARCH (People at Company)
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16   Using filters - Name: Steneral Consulting Domain: steneral.com
account-detail.js:16   Request URL: https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/contacts
account-detail.js:16   Request Body: {
  "pages": {
    "page": 0,
    "size": 10
  },
  "filters": {
    "companies": {
      "include": {
        "names": [
          "Steneral Consulting"
        ],
        "domains": [
          "steneral.com"
        ]
      }
    }
  }
}
account-detail.js:16   ✅ Contacts Search: SUCCESS
account-detail.js:16   Status: 200
account-detail.js:16   Contacts Found: 10
account-detail.js:16   Total Available: 67
account-detail.js:16   Total Pages: 7
account-detail.js:16 
  🔹 FIRST CONTACT DETAILS:
account-detail.js:16     Name: Prabhat Mishra
account-detail.js:16     Title: Talent Acquisition
account-detail.js:16     Company: Steneral Consulting
account-detail.js:16     Company ID: 627c23d47f33c500c09816f5
account-detail.js:16     Domain: steneral.com
account-detail.js:16     Email: email_not_unlocked@domain.com
account-detail.js:16     Phone: (not revealed)
account-detail.js:16     Has Emails: true
account-detail.js:16     Has Phones: false
account-detail.js:16     Location: Punjab, India
account-detail.js:16 
  🔹 CAN WE EXTRACT COMPANY INFO FROM THIS CONTACT?
account-detail.js:16     ✅ Company ID available: 627c23d47f33c500c09816f5
account-detail.js:16     📌 This can be used for fallback enrichment!
account-detail.js:16 
  💾 Saved to: window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 📊 DIAGNOSTIC SUMMARY
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 
  🏢 COMPANY DATA SOURCE:
account-detail.js:16     ⚠️  Company not in Apollo DB (minimal data returned)
account-detail.js:16     📌 Widget will attempt fallback enrichment from contacts
account-detail.js:16 
  👥 CONTACTS DATA:
account-detail.js:16     ✅ Contacts found: 10
account-detail.js:16     📌 Fallback enrichment WILL work (company ID available from contact)
account-detail.js:16 
  🎯 EXPECTED WIDGET BEHAVIOR:
account-detail.js:16     ⚠️  FALLBACK MODE: Contacts displayed, company data enriched from first contact
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 ✅ DIAGNOSTIC COMPLETE
account-detail.js:16 
Data saved to: window.__diagnosticCompanyData & window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 TEST 2: CONTACTS SEARCH (People at Company)
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16   Using filters - Name: Sekisui Specialty Chemicals Domain: lairdplastics.com
account-detail.js:16   Request URL: https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/contacts
account-detail.js:16   Request Body: {
  "pages": {
    "page": 0,
    "size": 10
  },
  "filters": {
    "companies": {
      "include": {
        "names": [
          "Sekisui Specialty Chemicals"
        ],
        "domains": [
          "lairdplastics.com"
        ]
      }
    }
  }
}
account-detail.js:16   ✅ Contacts Search: SUCCESS
account-detail.js:16   Status: 200
account-detail.js:16   Contacts Found: 0
account-detail.js:16   Total Available: 0
account-detail.js:16   Total Pages: 1
account-detail.js:16 
  💾 Saved to: window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 📊 DIAGNOSTIC SUMMARY
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 
  🏢 COMPANY DATA SOURCE:
account-detail.js:16     ⚠️  Company not in Apollo DB (minimal data returned)
account-detail.js:16     📌 Widget will attempt fallback enrichment from contacts
account-detail.js:16 
  👥 CONTACTS DATA:
account-detail.js:16     ❌ No contacts found
account-detail.js:16 
  🎯 EXPECTED WIDGET BEHAVIOR:
account-detail.js:16     ❌ PROBLEM: No contacts found - check domain/company name spelling
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 ✅ DIAGNOSTIC COMPLETE
account-detail.js:16 
Data saved to: window.__diagnosticCompanyData & window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 APOLLO WIDGET DIAGNOSTIC TOOL
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 📋 TEST PARAMETERS:
account-detail.js:16   Domain: northparkcenter.com
account-detail.js:16   Company Name: BioUrja Group
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 🏢 TEST 1: COMPANY SEARCH (Direct Account Data)
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16   Request URL: https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/company?domain=northparkcenter.com&company=BioUrja+Group
Promise {<pending>}
account-detail.js:16   ✅ Company Search: SUCCESS
account-detail.js:16   Status: 200
account-detail.js:16   ⚠️  MINIMAL DATA RETURNED (Company not in Apollo DB)
account-detail.js:16 
  🔹 POPULATED FIELDS:
account-detail.js:16     ❌ Company ID: (empty)
account-detail.js:16     ✅ Company Name: BioUrja Group
account-detail.js:16     ✅ Domain: northparkcenter.com
account-detail.js:16     ✅ Website: https://northparkcenter.com
account-detail.js:16     ❌ Description: (empty)
account-detail.js:16     ❌ Company Phone: (empty)
account-detail.js:16     ❌ Logo URL: (empty)
account-detail.js:16     ❌ Industry: (empty)
account-detail.js:16     ❌ Employees: (empty)
account-detail.js:16     ❌ Location: (empty)
account-detail.js:16     ❌ LinkedIn: (empty)
account-detail.js:16     ❌ Founded Year: (empty)
account-detail.js:16     ❌ Revenue: (empty)
account-detail.js:16 
  💾 Saved to: window.__diagnosticCompanyData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 👥 TEST 2: CONTACTS SEARCH (People at Company)
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16   Using filters - Name: BioUrja Group Domain: northparkcenter.com
account-detail.js:16   Request URL: https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/contacts
account-detail.js:16   Request Body: {
  "pages": {
    "page": 0,
    "size": 10
  },
  "filters": {
    "companies": {
      "include": {
        "names": [
          "BioUrja Group"
        ],
        "domains": [
          "northparkcenter.com"
        ]
      }
    }
  }
}
account-detail.js:16   ✅ Contacts Search: SUCCESS
account-detail.js:16   Status: 200
account-detail.js:16   Contacts Found: 0
account-detail.js:16   Total Available: 0
account-detail.js:16   Total Pages: 1
account-detail.js:16 
  💾 Saved to: window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 📊 DIAGNOSTIC SUMMARY
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 
  🏢 COMPANY DATA SOURCE:
account-detail.js:16     ⚠️  Company not in Apollo DB (minimal data returned)
account-detail.js:16     📌 Widget will attempt fallback enrichment from contacts
account-detail.js:16 
  👥 CONTACTS DATA:
account-detail.js:16     ❌ No contacts found
account-detail.js:16 
  🎯 EXPECTED WIDGET BEHAVIOR:
account-detail.js:16     ❌ PROBLEM: No contacts found - check domain/company name spelling
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 ✅ DIAGNOSTIC COMPLETE
account-detail.js:16 
Data saved to: window.__diagnosticCompanyData & window.__diagnosticContactsData
account-detail.js:16 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
account-detail.js:16 [Memory] 46MB / 48MB (limit: 2144MB)