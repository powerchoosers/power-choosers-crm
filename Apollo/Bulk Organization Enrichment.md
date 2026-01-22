Bulk Organization Enrichment
post
https://api.apollo.io/api/v1/organizations/bulk_enrich
Use the Bulk Organization Enrichment endpoint to enrich data for up to 10 companies with a single API call. To enrich data for only 1 company, use the Organization Enrichment endpoint instead.

Enriched data potentially includes industry information, revenue, employee counts, funding round details, and corporate phone numbers and locations.

This endpoint's rate limit is throttled to 50% of the Organization Enrichment endpoint's per-minute rate limit, and is 100% of the hourly and daily rate limits for the same individual endpoint.

Query Params
domains[]
array of strings
required
The domain of each company that you want to enrich. Do not include www., the @ symbol, or similar.

Example: apollo.io and microsoft.com


ADD string
Responses

200
200


400
400


401
401


429
429

Fetch Request:
const url = 'https://api.apollo.io/api/v1/organizations/bulk_enrich';
const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'x-api-key': 'tk12p3bWUcOHfZjcxow_vA'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));
  {
  "status": "success",
  "error_code": null,
  "error_message": null,
  "total_requested_domains": 4,
  "unique_domains": 4,
  "unique_enriched_records": 4,
  "missing_records": 0,
  "organizations": [
    {
      "id": "5e66b6381e05b4008c8331b8",
      "name": "Apollo.io",
      "website_url": "http://www.apollo.io",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/apolloio",
      "twitter_url": "https://twitter.com/meetapollo/",
      "facebook_url": "https://www.facebook.com/MeetApollo",
      "primary_phone": {},
      "languages": [],
      "alexa_ranking": 3514,
      "phone": null,
      "linkedin_uid": "18511550",
      "founded_year": 2015,
      "publicly_traded_symbol": null,
      "publicly_traded_exchange": null,
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66d13c8d98ec9600013525b8/picture",
      "crunchbase_url": null,
      "primary_domain": "apollo.io",
      "industry": "information technology & services",
      "keywords": [
        "sales engagement",
        "lead generation",
        "predictive analytics",
        "lead scoring",
        "sales strategy",
        "conversation intelligence",
        "sales enablement",
        "lead routing",
        "sales development",
        "email engagement",
        "revenue intelligence",
        "sales operations",
        "sales intelligence",
        "lead intelligence",
        "prospecting",
        "b2b data"
      ],
      "estimated_num_employees": 1600,
      "industries": [
        "information technology & services"
      ],
      "secondary_industries": [],
      "snippets_loaded": true,
      "industry_tag_id": "5567cd4773696439b10b0000",
      "industry_tag_hash": {
        "information technology & services": "5567cd4773696439b10b0000"
      },
      "retail_location_count": 0,
      "raw_address": "415 mission st, floor 37, san francisco, california 94105, us",
      "street_address": "415 Mission St",
      "city": "San Francisco",
      "state": "California",
      "country": "United States",
      "postal_code": "94105-2301",
      "owned_by_organization_id": null,
      "seo_description": "Search, engage, and convert over 275 million contacts at over 73 million companies with Apollo's sales intelligence and engagement platform.",
      "short_description": "Apollo.io combines a buyer database of over 270M contacts and powerful sales engagement and automation tools in one, easy to use platform. Trusted by over 160,000 companies including Autodesk, Rippling, Deel, Jasper.ai, Divvy, and Heap, Apollo has more than one million users globally. By helping sales professionals find their ideal buyers and intelligently automate outreach, Apollo helps go-to-market teams sell anything.\n\nCelebrating a $100M Series D Funding Round 🦄",
      "account_id": "63f53afe4ceeca00016bdd37",
      "account": {
        "id": "63f53afe4ceeca00016bdd37",
        "domain": "apollo.io",
        "name": "Apollo",
        "team_id": "6095a710bd01d100a506d4ac",
        "organization_id": "5e66b6381e05b4008c8331b8",
        "account_stage_id": null,
        "source": "salesforce",
        "original_source": "salesforce",
        "creator_id": null,
        "owner_id": "60affe7d6e270a00f5db6fe4",
        "created_at": "2023-02-21T21:43:26.351Z",
        "phone": "+1(202) 374-1312",
        "phone_status": "no_status",
        "hubspot_id": null,
        "salesforce_id": null,
        "crm_owner_id": null,
        "parent_account_id": null,
        "linkedin_url": null,
        "sanitized_phone": "+12023741312",
        "account_playbook_statuses": [],
        "account_rule_config_statuses": [],
        "existence_level": "full",
        "label_ids": [
          "6504905b21ba8e00a334eb0f"
        ],
        "typed_custom_fields": {},
        "custom_field_errors": null,
        "modality": "account",
        "source_display_name": "Imported from Salesforce",
        "crm_record_url": null,
        "intent_strength": null,
        "show_intent": false,
        "has_intent_signal_account": false,
        "intent_signal_account": null
      },
      "departmental_head_count": {
        "engineering": 228,
        "operations": 28,
        "support": 30,
        "marketing": 36,
        "human_resources": 29,
        "sales": 177,
        "finance": 8,
        "consulting": 8,
        "legal": 5,
        "arts_and_design": 27,
        "accounting": 3,
        "business_development": 14,
        "information_technology": 8,
        "education": 6,
        "media_and_commmunication": 3,
        "product_management": 16,
        "entrepreneurship": 3,
        "data_science": 6,
        "administrative": 3
      },
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    {
      "id": "62337760d02af100a5ca2468",
      "name": "Microsoft",
      "website_url": "http://www.microsoft.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/microsoft",
      "twitter_url": "https://twitter.com/microsoftindia",
      "facebook_url": "https://facebook.com/MicrosoftIndia",
      "primary_phone": {
        "number": "+1 800-642-7676",
        "source": "Scraped",
        "sanitized_number": "+18006427676"
      },
      "languages": [
        "English"
      ],
      "alexa_ranking": 32,
      "phone": "+1 800-642-7676",
      "linkedin_uid": "1035",
      "founded_year": 1975,
      "publicly_traded_symbol": "MSFT",
      "publicly_traded_exchange": "nasdaq",
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66d1118cf2b54c0001174ae4/picture",
      "crunchbase_url": null,
      "primary_domain": "microsoft.com",
      "sanitized_phone": "+18006427676",
      "market_cap": "3100.6B",
      "industry": "information technology & services",
      "keywords": [
        "digital marketing",
        "business software",
        "developer tools",
        "home",
        "educational software",
        "tablets",
        "search",
        "advertising",
        "servers",
        "windows operating system",
        "windows applications",
        "platforms",
        "smartphones",
        "cloud computing",
        "quantum computing",
        "future of work",
        "productivity",
        "ai",
        "artificial intelligence",
        "machine learning",
        "laptops",
        "mixed reality",
        "virtual reality",
        "gaming",
        "developers",
        "it professional",
        "computers",
        "electronics",
        "mobile phones",
        "shopping"
      ],
      "estimated_num_employees": 245000,
      "industries": [
        "information technology & services",
        "internet"
      ],
      "secondary_industries": [
        "internet"
      ],
      "snippets_loaded": true,
      "industry_tag_id": "5567cd4773696439b10b0000",
      "industry_tag_hash": {
        "information technology & services": "5567cd4773696439b10b0000",
        "internet": "5567cd4d736964397e020000"
      },
      "retail_location_count": 96,
      "raw_address": "1 microsoft way, redmond, washington 98052, us",
      "street_address": "1 Microsoft Way",
      "city": "Redmond",
      "state": "Washington",
      "country": "United States",
      "postal_code": "98052",
      "owned_by_organization_id": null,
      "seo_description": "Sign in to your Outlook.com, Hotmail.com, MSN.com or Live.com account. Download the free desktop and mobile app to connect all your email accounts, including Gmail, Yahoo, and iCloud, in one place.",
      "short_description": "Every company has a mission. What's ours? To empower every person and every organization to achieve more. We believe technology can and should be a force for good and that meaningful innovation contributes to a brighter world in the future and today. Our culture doesn't just encourage curiosity; it embraces it. Each day we make progress together by showing up as our authentic selves. We show up with a learn-it-all mentality. We show up cheering on others, knowing their success doesn't diminish our own. We show up every day open to learning our own biases, changing our behavior, and inviting in differences. Because impact matters. \n\nMicrosoft operates in 190 countries and is made up of approximately 228,000 passionate employees worldwide.",
      "account_id": "6658955677a2f20001c64787",
      "account": {
        "id": "6658955677a2f20001c64787",
        "domain": "microsoft.com",
        "name": "Microsoft",
        "team_id": "6095a710bd01d100a506d4ac",
        "organization_id": "62337760d02af100a5ca2468",
        "account_stage_id": "6095a710bd01d100a506d4b7",
        "source": "crm",
        "original_source": "crm",
        "creator_id": null,
        "owner_id": null,
        "created_at": "2024-05-30T15:03:50.069Z",
        "phone": null,
        "phone_status": "no_status",
        "hubspot_id": null,
        "salesforce_id": null,
        "crm_owner_id": null,
        "parent_account_id": null,
        "linkedin_url": null,
        "account_playbook_statuses": [],
        "account_rule_config_statuses": [],
        "existence_level": "full",
        "label_ids": [],
        "typed_custom_fields": {},
        "custom_field_errors": null,
        "modality": "account",
        "source_display_name": "Imported from CRM",
        "crm_record_url": null,
        "intent_strength": null,
        "show_intent": false,
        "has_intent_signal_account": false,
        "intent_signal_account": null
      },
      "departmental_head_count": {
        "engineering": 41862,
        "sales": 7633,
        "support": 8019,
        "marketing": 3671,
        "human_resources": 2898,
        "education": 13257,
        "media_and_commmunication": 1167,
        "consulting": 2616,
        "operations": 2611,
        "finance": 2335,
        "product_management": 6637,
        "business_development": 5768,
        "information_technology": 2591,
        "data_science": 1732,
        "arts_and_design": 1398,
        "entrepreneurship": 88,
        "administrative": 281,
        "legal": 662,
        "accounting": 169
      },
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    {
      "id": "5fc93db64c38d300d6aa24e6",
      "name": "Google",
      "website_url": "http://www.google.com",
      "blog_url": null,
      "angellist_url": "http://angel.co/category-five",
      "linkedin_url": "http://www.linkedin.com/company/google",
      "twitter_url": "http://twitter.com/Cat5BoatShoes.com",
      "facebook_url": "https://facebook.com/Google",
      "primary_phone": {
        "number": "+1 650-253-0000",
        "source": "Owler",
        "sanitized_number": "+16502530000"
      },
      "languages": [],
      "alexa_ranking": 9,
      "phone": "+1 650-253-0000",
      "linkedin_uid": "1441",
      "founded_year": 1998,
      "publicly_traded_symbol": "GOOGL",
      "publicly_traded_exchange": "nasdaq",
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66d37f6c0e5b970001b78b8d/picture",
      "crunchbase_url": null,
      "primary_domain": "google.com",
      "sanitized_phone": "+16502530000",
      "market_cap": "652.3B",
      "industry": "information technology & services",
      "keywords": [
        "e-commerce",
        "fashion",
        "retail",
        "social commerce",
        "consumer internet",
        "internet",
        "information technology",
        "search",
        "ads",
        "mobile",
        "android",
        "online video",
        "apps",
        "machine learning",
        "virtual reality",
        "cloud",
        "hardware",
        "artificial intelligence",
        "youtube",
        "software"
      ],
      "estimated_num_employees": 300000,
      "industries": [
        "information technology & services",
        "internet",
        "computer software"
      ],
      "secondary_industries": [
        "internet",
        "computer software"
      ],
      "snippets_loaded": true,
      "industry_tag_id": "5567cd4773696439b10b0000",
      "industry_tag_hash": {
        "information technology & services": "5567cd4773696439b10b0000",
        "internet": "5567cd4d736964397e020000",
        "computer software": "5567cd4e7369643b70010000"
      },
      "retail_location_count": 0,
      "raw_address": "1600 amphitheatre parkway, mountain view, ca 94043, us",
      "street_address": "1600 Amphitheatre Parkway",
      "city": "Mountain View",
      "state": "California",
      "country": "United States",
      "postal_code": "94043",
      "owned_by_organization_id": "57c4a824a6da98411e7df3eb",
      "owned_by_organization": {
        "id": "57c4a824a6da98411e7df3eb",
        "name": "Alphabet Inc.",
        "website_url": "http://www.abc.xyz"
      },
      "seo_description": "",
      "short_description": "Google is a California-based multinational technology company that offers internet-related services such as a search engine, online advertising and cloud computing.",
      "account_id": "665c3308da53130001240992",
      "account": {
        "id": "665c3308da53130001240992",
        "domain": "google.com",
        "name": "Google",
        "team_id": "6095a710bd01d100a506d4ac",
        "organization_id": "5fc93db64c38d300d6aa24e6",
        "account_stage_id": "6095a710bd01d100a506d4b7",
        "source": "crm",
        "original_source": "crm",
        "creator_id": null,
        "owner_id": null,
        "created_at": "2024-06-02T08:53:28.090Z",
        "phone": null,
        "phone_status": "no_status",
        "hubspot_id": null,
        "salesforce_id": null,
        "crm_owner_id": null,
        "parent_account_id": null,
        "linkedin_url": null,
        "account_playbook_statuses": [],
        "account_rule_config_statuses": [],
        "existence_level": "full",
        "label_ids": [],
        "typed_custom_fields": {},
        "custom_field_errors": null,
        "modality": "account",
        "source_display_name": "Imported from CRM",
        "crm_record_url": null,
        "intent_strength": null,
        "show_intent": false,
        "has_intent_signal_account": false,
        "intent_signal_account": null
      },
      "departmental_head_count": {
        "engineering": 47305,
        "finance": 1664,
        "marketing": 4714,
        "human_resources": 2428,
        "business_development": 4166,
        "operations": 4771,
        "education": 1510,
        "consulting": 2033,
        "sales": 6025,
        "legal": 1075,
        "information_technology": 970,
        "arts_and_design": 1717,
        "product_management": 3743,
        "administrative": 695,
        "support": 778,
        "media_and_commmunication": 1358,
        "entrepreneurship": 135,
        "data_science": 1663,
        "accounting": 280
      },
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    {
      "id": "5da2e6a3f978a8000177e831",
      "name": "Goldman Sachs",
      "website_url": "http://www.goldmansachs.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/goldman-sachs",
      "twitter_url": "https://twitter.com/goldmansachs",
      "facebook_url": "https://facebook.com/goldmansachs/",
      "primary_phone": {
        "number": "+1 212-902-1000",
        "source": "Owler",
        "sanitized_number": "+12129021000"
      },
      "languages": [
        "English"
      ],
      "alexa_ranking": 36319,
      "phone": "+1 212-902-1000",
      "linkedin_uid": "1382",
      "founded_year": 1869,
      "publicly_traded_symbol": "GS",
      "publicly_traded_exchange": "nasdaq",
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66d199b5c5a3e80001b0033e/picture",
      "crunchbase_url": null,
      "primary_domain": "goldmansachs.com",
      "sanitized_phone": "+12129021000",
      "market_cap": "161.1B",
      "industry": "financial services",
      "keywords": [
        "financial services",
        "finance technology",
        "payments",
        "consumer internet",
        "finance",
        "internet",
        "information technology"
      ],
      "estimated_num_employees": 56000,
      "industries": [
        "financial services"
      ],
      "secondary_industries": [],
      "snippets_loaded": true,
      "industry_tag_id": "5567cdd67369643e64020000",
      "industry_tag_hash": {
        "financial services": "5567cdd67369643e64020000"
      },
      "retail_location_count": 0,
      "raw_address": "200 west street, new york, new york, united states",
      "street_address": "200 West Street",
      "city": "New York",
      "state": "New York",
      "country": "United States",
      "postal_code": "10282",
      "owned_by_organization_id": null,
      "seo_description": "Využijte naší lokální expertízy a vyberte si z široké nabídky podílových fondů v české koruně i cizích měnách.",
      "short_description": "At Goldman Sachs, we believe progress is everyone's business. That's why we commit our people, capital and ideas to help our clients, shareholders and the communities we serve to grow.\nFounded in 1869, Goldman Sachs is a leading global investment banking, securities and investment management firm. Headquartered in New York, we maintain offices in all major financial centers around the world. \n\nMore about our company can be found at www.goldmansachs.com\n\nFor insights on developments currently shaping markets, industries and the global economy, subscribe to BRIEFINGS, a weekly email from Goldman Sachs. Copy and paste this link into your browser to sign up: http://link.gs.com/Qxf3\n\ngs.com/social-media-disclosures",
      "account_id": "6598a1d4d229e900012160ea",
      "account": {
        "id": "6598a1d4d229e900012160ea",
        "domain": "goldmansachs.com",
        "name": "Goldman Sachs",
        "team_id": "6095a710bd01d100a506d4ac",
        "organization_id": "5da2e6a3f978a8000177e831",
        "account_stage_id": "6095a710bd01d100a506d4b7",
        "source": "deployment",
        "original_source": "deployment",
        "creator_id": "60affe7d6e270a00f5db6fe4",
        "owner_id": null,
        "created_at": "2024-01-06T00:41:56.898Z",
        "phone": "+18556277830",
        "phone_status": "no_status",
        "hubspot_id": null,
        "salesforce_id": null,
        "crm_owner_id": null,
        "parent_account_id": null,
        "linkedin_url": null,
        "sanitized_phone": "+18556277830",
        "account_playbook_statuses": [],
        "account_rule_config_statuses": [
          {
            "_id": "664f9ea3d0ff61000146a48d",
            "created_at": null,
            "rule_action_config_id": "65735e0ea63d2700faba5c6e",
            "rule_config_id": "65735e0ea63d2700faba5c6f",
            "status_cd": "completed",
            "updated_at": null,
            "id": "664f9ea3d0ff61000146a48d",
            "key": "664f9ea3d0ff61000146a48d"
          }
        ],
        "existence_level": "full",
        "label_ids": [],
        "typed_custom_fields": {},
        "custom_field_errors": null,
        "modality": "account",
        "source_display_name": "Requested from Apollo",
        "crm_record_url": null,
        "intent_strength": null,
        "show_intent": false,
        "has_intent_signal_account": false,
        "intent_signal_account": null
      },
      "departmental_head_count": {
        "human_resources": 577,
        "engineering": 4332,
        "business_development": 667,
        "arts_and_design": 88,
        "operations": 1186,
        "sales": 786,
        "finance": 1816,
        "product_management": 324,
        "information_technology": 249,
        "marketing": 229,
        "administrative": 297,
        "accounting": 109,
        "legal": 500,
        "data_science": 329,
        "consulting": 258,
        "education": 51,
        "media_and_commmunication": 109,
        "support": 173,
        "entrepreneurship": 15
      },
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    }
  ]
}