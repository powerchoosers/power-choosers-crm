View an Account
get
https://api.apollo.io/api/v1/accounts/{id}
Use the View an Account endpoint to retrieve details for an existing account in your team's Apollo database. In Apollo terminology, an account is a company that your team has explicitly added to your database.

This endpoint requires a master API key. If you attempt to call the endpoint without a master key, you will receive a 403 response. Refer to Create API keys to learn how to create a master API key.

Path Params
id
string
required
The Apollo ID for the account that you want to retrieve.

To find account IDs, call the Search for Accounts endpoint and identify the id value for the account.

Example: 6518c6184f20350001a0b9c0

Responses

200

401
Unauthorized


403
Forbidden


422
Unprocessable Entity

fetch request:
const url = 'https://api.apollo.io/api/v1/accounts/id';
const options = {
  method: 'GET',
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
  "account": {
    "id": "6518c6184f20350001a0b9c0",
    "name": "Apollo.io",
    "website_url": "http://www.apollo.io",
    "linkedin_url": "http://www.linkedin.com/company/apolloio",
    "twitter_url": "https://twitter.com/MeetApollo/",
    "facebook_url": "https://facebook.com/MeetApollo/",
    "alexa_ranking": 3514,
    "linkedin_uid": "18511550",
    "founded_year": 2015,
    "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/67ced4f5414db000016da285/picture",
    "primary_domain": "apollo.io",
    "industry": "information technology & services",
    "estimated_num_employees": 910,
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
      "b2b data",
      "software development",
      "crm integration",
      "data enrichment",
      "deal management",
      "pipeline management",
      "automated workflows",
      "analytics & reporting",
      "coaching & feedback",
      "signal-based prospecting",
      "inbound optimization",
      "contact & account search",
      "email outreach automation",
      "meeting scheduling",
      "ai sales assistant",
      "multi-channel outreach",
      "lead qualification",
      "form optimization",
      "sales performance improvement",
      "live data network",
      "ai sales automation",
      "revops tools",
      "account-based prospecting",
      "sales pipeline",
      "meeting preparedness",
      "ai recommendations",
      "webinar integration",
      "sales coaching",
      "team collaboration",
      "sales insights",
      "buyer's journey tracking",
      "market intelligence",
      "lead prioritization",
      "customer journey mapping",
      "sales funnel tracking",
      "data-driven sales",
      "email deliverability management",
      "automated lead follow-up",
      "predictive analytics for sales",
      "sales campaign management",
      "sales productivity tools",
      "sales performance management",
      "b2b sales intelligence",
      "ai-driven automation",
      "prospecting tools",
      "contact database",
      "sales automation",
      "email tracking",
      "intent data",
      "sales workflow management",
      "advanced search filters",
      "customer success",
      "scalable solutions",
      "sales analytics",
      "outreach optimization",
      "data-driven strategies",
      "customer acquisition",
      "sales productivity",
      "marketing automation",
      "user-friendly interface",
      "comprehensive features",
      "business growth",
      "sales optimization",
      "competitive advantage",
      "market potential",
      "sales teams",
      "enterprise solutions",
      "small business support",
      "mid-market focus",
      "diverse industries",
      "customer demographics",
      "sales intelligence platform",
      "marketing & advertising",
      "sales",
      "information technology & services",
      "enterprise software",
      "enterprises",
      "computer software",
      "b2b",
      "saas"
    ],
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
    "raw_address": "535 mission st, san francisco, california, united states, 94105",
    "street_address": "535 Mission Street",
    "city": "San Francisco",
    "state": "California",
    "country": "United States",
    "postal_code": "94105",
    "owned_by_organization_id": null,
    "short_description": "Apollo.io is an AI sales platform that provides businesses with tools to enhance their go-to-market strategies. Founded in 2015 by Tim and Ray, the company was created to address the limitations of existing sales tools they encountered in their previous startup. Apollo.io offers an all-in-one platform that integrates lead intelligence and sales engagement capabilities, helping businesses find leads, engage prospects, and close deals more effectively.\n\nThe platform features detailed insights into potential customers, tools for managing leads from initial contact to deal closure, and a community-based approach to data accuracy. Apollo.io serves nearly 9,000 paying customers, including startups and large enterprises, and supports over 500,000 sales professionals globally. The company has experienced rapid growth, surpassing $100 million in annual recurring revenue and achieving a valuation of $1.6 billion. Apollo.io has also received funding from notable investors like Y Combinator and Nexus Venture Partners.",
    "suborganizations": [],
    "num_suborganizations": 0,
    "annual_revenue_printed": "100M",
    "annual_revenue": 100000000,
    "total_funding": 251200000,
    "total_funding_printed": "251.2M",
    "latest_funding_round_date": "2023-08-01T00:00:00.000+00:00",
    "latest_funding_stage": "Series D",
    "funding_events": [
      {
        "id": "6574c1ff9b797d0001fdab1b",
        "date": "2023-08-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series D",
        "investors": "Bain Capital Ventures, Sequoia Capital, Tribe Capital, Nexus Venture Partners",
        "amount": "100M",
        "currency": "$"
      },
      {
        "id": "624f4dfec786590001768016",
        "date": "2022-03-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series C",
        "investors": "Sequoia Capital, Tribe Capital, Nexus Venture Partners, NewView Capital",
        "amount": "110M",
        "currency": "$"
      },
      {
        "id": "61b13677623110000186a478",
        "date": "2021-10-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series B",
        "investors": "Tribe Capital, NewView Capital, Nexus Venture Partners",
        "amount": "32M",
        "currency": "$"
      },
      {
        "id": "5ffe93caa54d75077c59acef",
        "date": "2018-06-26T00:00:00.000+00:00",
        "news_url": "https://techcrunch.com/2018/06/26/yc-grad-zenprospect-rebrands-as-apollo-lands-7-m-series-a/",
        "type": "Series A",
        "investors": "Nexus Venture Partners, Social Capital, Y Combinator",
        "amount": "7M",
        "currency": "$"
      },
      {
        "id": "6574c1ff9b797d0001fdab20",
        "date": "2016-10-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Other",
        "investors": "Y Combinator, SV Angel, Social Capital, Nexus Venture Partners",
        "amount": "2.2M",
        "currency": "$"
      }
    ],
    "technology_names": [
      "AI",
      "Android",
      "Basis",
      "Canva",
      "Circle",
      "CloudFlare Hosting",
      "Cloudflare DNS",
      "Drift",
      "Gmail",
      "Google Apps",
      "Google Tag Manager",
      "Google Workspace",
      "Hubspot",
      "Microsoft Office 365",
      "Mobile Friendly",
      "Python",
      "Rackspace MailGun",
      "Remote",
      "Render",
      "Reviews",
      "Salesforce",
      "SharePoint",
      "Stripe",
      "WP Engine",
      "Webmail",
      "Zendesk"
    ],
    "current_technologies": [
      {
        "uid": "ai",
        "name": "AI",
        "category": "Other"
      },
      {
        "uid": "android",
        "name": "Android",
        "category": "Frameworks and Programming Languages"
      },
      {
        "uid": "basis",
        "name": "Basis",
        "category": "Advertising Networks"
      },
      {
        "uid": "canva",
        "name": "Canva",
        "category": "Content Management Platform"
      },
      {
        "uid": "circle",
        "name": "Circle",
        "category": "Financial Software"
      },
      {
        "uid": "cloudflare_hosting",
        "name": "CloudFlare Hosting",
        "category": "Hosting"
      },
      {
        "uid": "cloudflare_dns",
        "name": "Cloudflare DNS",
        "category": "Domain Name Services"
      },
      {
        "uid": "drift",
        "name": "Drift",
        "category": "Widgets"
      },
      {
        "uid": "gmail",
        "name": "Gmail",
        "category": "Email Providers"
      },
      {
        "uid": "google_apps",
        "name": "Google Apps",
        "category": "Other"
      },
      {
        "uid": "google_tag_manager",
        "name": "Google Tag Manager",
        "category": "Tag Management"
      },
      {
        "uid": "google workspace",
        "name": "Google Workspace",
        "category": "Cloud Services"
      },
      {
        "uid": "hubspot",
        "name": "Hubspot",
        "category": "Marketing Automation"
      },
      {
        "uid": "office_365",
        "name": "Microsoft Office 365",
        "category": "Other"
      },
      {
        "uid": "mobile_friendly",
        "name": "Mobile Friendly",
        "category": "Other"
      },
      {
        "uid": "python",
        "name": "Python",
        "category": "Frameworks and Programming Languages"
      },
      {
        "uid": "rackspace_mailgun",
        "name": "Rackspace MailGun",
        "category": "Email Delivery"
      },
      {
        "uid": "remote",
        "name": "Remote",
        "category": "Other"
      },
      {
        "uid": "render",
        "name": "Render",
        "category": "Other"
      },
      {
        "uid": "reviews",
        "name": "Reviews",
        "category": "Customer Reviews"
      },
      {
        "uid": "salesforce",
        "name": "Salesforce",
        "category": "Customer Relationship Management"
      },
      {
        "uid": "sharepoint",
        "name": "SharePoint",
        "category": "CMS"
      },
      {
        "uid": "stripe",
        "name": "Stripe",
        "category": "Payments"
      },
      {
        "uid": "wp_engine",
        "name": "WP Engine",
        "category": "CMS"
      },
      {
        "uid": "webmail",
        "name": "Webmail",
        "category": "Email Providers"
      },
      {
        "uid": "zendesk",
        "name": "Zendesk",
        "category": "Support and Feedback"
      }
    ],
    "org_chart_root_people_ids": [
      "66f6de0d74c57a00015d2b39"
    ],
    "org_chart_sector": "OrgChart::SectorHierarchy::Rules::IT",
    "org_chart_removed": false,
    "org_chart_show_department_filter": true,
    "organization_raw_address": "535 mission street, san francisco, california, united states, 94105",
    "organization_postal_code": "94105",
    "organization_street_address": "535 Mission Street",
    "organization_city": "San Francisco",
    "organization_state": "California",
    "organization_country": "United States",
    "suggest_location_enrichment": false,
    "domain": "apollo.io",
    "team_id": "6095a710bd01d100a506d4ac",
    "organization_id": "5e66b6381e05b4008c8331b8",
    "account_stage_id": "6095a710bd01d100a506d4b9",
    "source": "job_change",
    "original_source": "job_change",
    "creator_id": "60affe7d6e270a00f5db6fe4",
    "owner_id": "66302798d03b9601c7934ec2",
    "created_at": "2023-10-01T01:06:32.057Z",
    "phone": "+1 415-640-9303",
    "phone_status": "no_status",
    "salesforce_id": "001gK000004oCRvQAM",
    "crm_owner_id": "005gK0000028NzBQAU",
    "engagement_graph": [
      {
        "year": 2024,
        "month": 7,
        "inbound": 0,
        "outbound": 2
      },
      {
        "year": 2025,
        "month": 1,
        "inbound": 0,
        "outbound": 2
      },
      {
        "year": 2025,
        "month": 2,
        "inbound": 0,
        "outbound": 1
      },
      {
        "year": 2025,
        "month": 3,
        "inbound": 0,
        "outbound": 4
      },
      {
        "year": 2025,
        "month": 4,
        "inbound": 0,
        "outbound": 3
      }
    ],
    "sanitized_phone": "+14156409303",
    "account_playbook_statuses": [],
    "existence_level": "full",
    "label_ids": [
      "6504905b21ba8e00a334eb0f"
    ],
    "typed_custom_fields": {
      "671932d76c03c402d0528199": [
        "671932d76c03c402d0528195"
      ]
    },
    "custom_field_errors": {},
    "modality": "account",
    "source_display_name": "Job Change",
    "salesforce_record_url": "https://orgfarm-8b954aef01-dev-ed.develop.my.salesforce.com/001gK000004oCRvQAM",
    "crm_record_url": null,
    "contact_emailer_campaign_ids": [
      "61964b4f2f2b4801128bdccf",
      "617006aa01d9c3008c563b80",
      "6137561c78029300a4442f2c",
      "61df24be4ed86000a4f05dab",
      "624dbc81790dd000a518a8f7",
      "626975c09d940c00a5e0685d",
      "624b4d82f6a95501165cafcc",
      "626a709fa58d1c008d9a9deb",
      "626a8ed480fa5f00ddebaae3",
      "657c8b7bc0ee7301c689fbbe",
      "65820320ea75fb06b0921560",
      "66425e61b56bc503009c8c15",
      "66a97236a8759801b5417678",
      "66e9e215ece19801b219997f",
      "6462b4b66ec01300a3388865",
      "665755d24404d001d65dd7ea",
      "672131a9213b0403ebbfcf20",
      "6480faa352529300f1501086",
      "66186b69391e0901c7dc89b0",
      "6789e720c2277502d07c33ee",
      "681a8f70182476001d4115f1",
      "67bde6d5b5eeec0021ad09c2",
      "67be333b81ca47000d1cfb9f",
      "680011ea812b54001dcd28c6",
      "60c0ec0be9da2200a425bfd1",
      "65ea4082b0815b01ae2f248b",
      "662a75fe1d925201c7a8c26d",
      "6567758e12b81a0264ab0bb1"
    ],
    "contact_campaign_status_tally": {
      "active": 29,
      "finished": 27,
      "not_sent": 25,
      "paused": 10,
      "bounced": 1
    },
    "num_contacts": 100,
    "last_activity_date": "2025-04-25T18:46:35.000+00:00",
    "intent_strength": null,
    "show_intent": false,
    "intent_signal_account": null,
    "organization_headcount_six_month_growth": null,
    "organization_headcount_twelve_month_growth": null,
    "organization_headcount_twenty_four_month_growth": null,
    "account_queues": [],
    "disable_flag": false
  },
  "salesforce_users": [],
  "hubspot_owners": []
}