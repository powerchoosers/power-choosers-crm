Get Complete Organization Info
get
https://api.apollo.io/api/v1/organizations/{id}
Use the Get Complete Organization Info endpoint to retrieve complete details about an organization in the Apollo database.

This endpoint requires a master API key. If you attempt to call the endpoint without a master key, you will receive a 403 response. Refer to Create API Keys to learn how to create a master API key.

This feature is not accessible to Apollo users on free plans.

Path Params
id
string
required
The Apollo ID for the organization that you want to research.

To find organization IDs, call the Organization Search endpoint and identify the organizaton_id value for the organization.

Example: 5e66b6381e05b4008c8331b8

Fetch Request:
const url = 'https://api.apollo.io/api/v1/organizations/id';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));

  Response:
  {
  "organization": {
    "id": "5e66b6381e05b4008c8331b8",
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
    "raw_address": "535 mission street, san francisco, california, united states, 94105",
    "street_address": "535 Mission Street",
    "city": "San Francisco",
    "state": "California",
    "postal_code": "94105",
    "country": "United States",
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
    "account_id": "63f53afe4ceeca00016bdd47",
    "account": {
      "id": "63f53afe4ceeca00016bdd47",
      "domain": "apollo.io",
      "name": "Apollo",
      "team_id": "6095a710bd01d100a506d4ac",
      "organization_id": "5e66b6381e05b4008c8331b8",
      "source": "chrome_extension_linkedin",
      "original_source": "salesforce",
      "owner_id": "60affe7d6e270a00f5db6fe4",
      "created_at": "2023-02-21T21:43:26.352Z",
      "phone": "+1(202) 374-1312",
      "phone_status": "no_status",
      "sanitized_phone": "+12023741312",
      "account_playbook_statuses": [],
      "existence_level": "full",
      "label_ids": [],
      "typed_custom_fields": {},
      "custom_field_errors": {},
      "modality": "account",
      "source_display_name": "Added from LinkedIn",
      "crm_record_url": null,
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": true,
      "intent_signal_account": {
        "_id": "6663bd946cef250001def02a",
        "account_id": "6658955677a2f20001c647ad",
        "aggregated_at": "2024-09-04T10:02:28.878+00:00",
        "computed": true,
        "created_at": "2024-06-08T02:10:28.537Z",
        "domain_aggregates": [
          {
            "domain": "tableofdiscontents.com",
            "total_visits": 15,
            "last_visit": 20240611,
            "first_visit": 20240607,
            "unique_visitors": 6,
            "weekly_aggregates": [
              {
                "week_start_date": "2024-06-07T00:00:00.000Z",
                "count": 15
              }
            ],
            "top_5_paths": [
              {
                "_id": "www.tableofdiscontents.com",
                "total_visits": 9
              },
              {
                "_id": "www.tableofdiscontents.com/pricing",
                "total_visits": 3
              },
              {
                "_id": "www.tableofdiscontents.com/premium",
                "total_visits": 2
              },
              {
                "_id": "www.tableofdiscontents.com/features",
                "total_visits": 1
              }
            ],
            "intent": "low",
            "intent_score": 0
          }
        ],
        "first_visited_at": 20240607,
        "last_visited_at": 20240611,
        "need_aggregation": false,
        "need_es_update": false,
        "new_reveal": false,
        "organization_id": "5e66b6381e05b4008c8331b8",
        "overall_intent": "low",
        "pre_generated_account_id": "6658955677a2f20001c647ad",
        "random": 0.162172829,
        "team_id": "6095a710bd01d100a506d4ac",
        "team_org_id": "6095a710bd01d100a506d4ac_5e66b6381e05b4008c8331b8",
        "total_visits": 15,
        "unique_visitors": 6,
        "updated_at": "2024-09-04T10:02:28.959Z",
        "website_visitor_metrics": {
          "overall_intent": "low",
          "total_visits": 15,
          "unique_visitors": 6,
          "domain_aggregates": [
            {
              "domain": "tableofdiscontents.com",
              "first_intent_signal_received_at": 20240607,
              "last_intent_signal_received_at": 20240611
            }
          ],
          "page_view_aggregates": {
            "one_day_count": 0,
            "seven_day_count": 0,
            "fifteen_day_count": 0,
            "thirty_day_count": 0,
            "sixty_day_count": 0,
            "ninety_day_count": 15
          },
          "pages": [
            "www.tableofdiscontents.com",
            "www.tableofdiscontents.com/pricing",
            "www.tableofdiscontents.com/premium",
            "www.tableofdiscontents.com/features"
          ],
          "first_intent_signal_received_at": 20240607,
          "last_intent_signal_received_at": 20240611
        },
        "id": "6663bd946cef250001def02a",
        "key": "6663bd946cef250001def02a"
      },
      "organization_headcount_six_month_growth": null,
      "organization_headcount_twelve_month_growth": null,
      "organization_headcount_twenty_four_month_growth": null,
      "generic_org_insights": null
    },
    "employee_metrics": [
      {
        "start_date": "2023-05-01",
        "departments": [
          {
            "functions": null,
            "new": 0,
            "retained": 97,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 0,
            "retained": 71,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 11,
            "churned": 1
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 0,
            "retained": 100,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 13,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 7,
            "churned": 1
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 9,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 4,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-06-01",
        "departments": [
          {
            "functions": null,
            "new": 17,
            "retained": 98,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 9,
            "retained": 70,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 2,
            "retained": 10,
            "churned": 1
          },
          {
            "functions": "human_resources",
            "new": 3,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 0,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 16,
            "retained": 100,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 1,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 13,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 1,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 7,
            "churned": 2
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 4,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-07-01",
        "departments": [
          {
            "functions": null,
            "new": 9,
            "retained": 114,
            "churned": 2
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 15,
            "retained": 79,
            "churned": 0
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 2,
            "retained": 12,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 24,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 9,
            "retained": 116,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 1,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 2,
            "retained": 12,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 2,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 2,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 5,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-08-01",
        "departments": [
          {
            "functions": null,
            "new": 6,
            "retained": 119,
            "churned": 1
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 9,
            "retained": 92,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 24,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 2,
            "retained": 4,
            "churned": 1
          },
          {
            "functions": "marketing",
            "new": 3,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 2,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 10,
            "retained": 124,
            "churned": 1
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 4,
            "churned": 1
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 10,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 12,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 5,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-09-01",
        "departments": [
          {
            "functions": null,
            "new": 6,
            "retained": 123,
            "churned": 1
          },
          {
            "functions": "accounting",
            "new": 1,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 7,
            "retained": 99,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 9,
            "retained": 134,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 1,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 13,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 2,
            "retained": 10,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 12,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 6,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-10-01",
        "departments": [
          {
            "functions": null,
            "new": 5,
            "retained": 129,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 7,
            "retained": 104,
            "churned": 2
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 27,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 7,
            "retained": 143,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 3,
            "churned": 1
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 1,
            "churned": 1
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 12,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 12,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 6,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-11-01",
        "departments": [
          {
            "functions": null,
            "new": 3,
            "retained": 135,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 110,
            "churned": 0
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 27,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 1,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 4,
            "retained": 150,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 2,
            "retained": 13,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 13,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 6,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2023-12-01",
        "departments": [
          {
            "functions": null,
            "new": 5,
            "retained": 139,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 2,
            "retained": 110,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 18,
            "churned": 1
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 27,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 7,
            "retained": 154,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 2,
            "retained": 14,
            "churned": 1
          },
          {
            "functions": "support",
            "new": 2,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 6,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-01-01",
        "departments": [
          {
            "functions": null,
            "new": 9,
            "retained": 145,
            "churned": 4
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 106,
            "churned": 5
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 2,
            "retained": 18,
            "churned": 1
          },
          {
            "functions": "human_resources",
            "new": 2,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 8,
            "retained": 159,
            "churned": 2
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 2,
            "retained": 13,
            "churned": 2
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 7,
            "churned": 1
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 14,
            "churned": 2
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 7,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-02-01",
        "departments": [
          {
            "functions": null,
            "new": 8,
            "retained": 154,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 0,
            "retained": 105,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 28,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 11,
            "retained": 167,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 2,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 2,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 1,
            "retained": 18,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-03-01",
        "departments": [
          {
            "functions": null,
            "new": 7,
            "retained": 160,
            "churned": 2
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 0,
            "retained": 103,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 24,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 27,
            "churned": 1
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 9,
            "retained": 178,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 14,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 7,
            "churned": 1
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 1,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-04-01",
        "departments": [
          {
            "functions": null,
            "new": 5,
            "retained": 162,
            "churned": 5
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 1,
            "retained": 101,
            "churned": 2
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 2,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 28,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 4,
            "retained": 187,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 14,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 6,
            "churned": 1
          },
          {
            "functions": "media_and_commmunication",
            "new": 2,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-05-01",
        "departments": [
          {
            "functions": null,
            "new": 8,
            "retained": 165,
            "churned": 2
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 97,
            "churned": 2
          },
          {
            "functions": "operations",
            "new": 2,
            "retained": 23,
            "churned": 3
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 26,
            "churned": 2
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 4,
            "retained": 188,
            "churned": 3
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 18,
            "churned": 3
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 14,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 3,
            "retained": 16,
            "churned": 1
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-06-01",
        "departments": [
          {
            "functions": null,
            "new": 3,
            "retained": 168,
            "churned": 6
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 99,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 2,
            "retained": 23,
            "churned": 1
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 22,
            "churned": 2
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 22,
            "churned": 3
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 1,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 2,
            "retained": 189,
            "churned": 4
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 12,
            "churned": 2
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-07-01",
        "departments": [
          {
            "functions": null,
            "new": 6,
            "retained": 163,
            "churned": 7
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 101,
            "churned": 1
          },
          {
            "functions": "operations",
            "new": 2,
            "retained": 25,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 6,
            "churned": 2
          },
          {
            "functions": "marketing",
            "new": 3,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 21,
            "churned": 1
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 3,
            "retained": 190,
            "churned": 1
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 13,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 3,
            "churned": 1
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 1
          }
        ]
      },
      {
        "start_date": "2024-08-01",
        "departments": [
          {
            "functions": null,
            "new": 1,
            "retained": 169,
            "churned": 1
          },
          {
            "functions": "accounting",
            "new": 1,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 1,
            "retained": 101,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 26,
            "churned": 1
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 20,
            "churned": 1
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 4,
            "retained": 192,
            "churned": 1
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 16,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 2,
            "retained": 13,
            "churned": 1
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-09-01",
        "departments": [
          {
            "functions": null,
            "new": 5,
            "retained": 169,
            "churned": 1
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 2,
            "retained": 99,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 3,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 1
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 24,
            "churned": 2
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 4,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 1,
            "retained": 193,
            "churned": 3
          },
          {
            "functions": "business_development",
            "new": 2,
            "retained": 15,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 7,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 9,
            "churned": 1
          },
          {
            "functions": "media_and_commmunication",
            "new": 1,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 20,
            "churned": 1
          },
          {
            "functions": "support",
            "new": 1,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 8,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-10-01",
        "departments": [
          {
            "functions": null,
            "new": 7,
            "retained": 168,
            "churned": 4
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 0,
            "retained": 101,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 27,
            "churned": 2
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 22,
            "churned": 3
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 3,
            "retained": 189,
            "churned": 4
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 17,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 1
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 9,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-11-01",
        "departments": [
          {
            "functions": null,
            "new": 6,
            "retained": 171,
            "churned": 6
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 99,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 1,
            "retained": 25,
            "churned": 2
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 20,
            "churned": 3
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 21,
            "churned": 1
          },
          {
            "functions": "information_technology",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 2,
            "retained": 190,
            "churned": 2
          },
          {
            "functions": "business_development",
            "new": 1,
            "retained": 16,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 9,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 1,
            "retained": 0,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 1
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 19,
            "churned": 1
          },
          {
            "functions": "support",
            "new": 2,
            "retained": 24,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 9,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2024-12-01",
        "departments": [
          {
            "functions": null,
            "new": 3,
            "retained": 177,
            "churned": 1
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 4,
            "retained": 96,
            "churned": 5
          },
          {
            "functions": "operations",
            "new": 3,
            "retained": 26,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 19,
            "churned": 1
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 22,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 1
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 1
          },
          {
            "functions": "engineering",
            "new": 5,
            "retained": 191,
            "churned": 1
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 16,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 8,
            "churned": 1
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 25,
            "churned": 1
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 10,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2025-01-01",
        "departments": [
          {
            "functions": null,
            "new": 8,
            "retained": 178,
            "churned": 2
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 1,
            "retained": 98,
            "churned": 2
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 29,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 4,
            "churned": 2
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 21,
            "churned": 1
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 7,
            "retained": 194,
            "churned": 2
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 15,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 1,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 25,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 9,
            "churned": 1
          }
        ]
      },
      {
        "start_date": "2025-02-01",
        "departments": [
          {
            "functions": null,
            "new": 4,
            "retained": 184,
            "churned": 2
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 3,
            "retained": 96,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 27,
            "churned": 2
          },
          {
            "functions": "finance",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "human_resources",
            "new": 0,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 2,
            "retained": 201,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 15,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 9,
            "churned": 0
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 8,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 0,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 23,
            "churned": 2
          },
          {
            "functions": "data_science",
            "new": 1,
            "retained": 9,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2025-03-01",
        "departments": [
          {
            "functions": null,
            "new": 6,
            "retained": 187,
            "churned": 0
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 5,
            "retained": 96,
            "churned": 3
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 27,
            "churned": 0
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 2,
            "retained": 20,
            "churned": 2
          },
          {
            "functions": "human_resources",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 0,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "engineering",
            "new": 0,
            "retained": 203,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 0,
            "retained": 14,
            "churned": 1
          },
          {
            "functions": "product_management",
            "new": 0,
            "retained": 16,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 9,
            "churned": 1
          },
          {
            "functions": "education",
            "new": 1,
            "retained": 9,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 2,
            "churned": 0
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 19,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 0,
            "retained": 23,
            "churned": 0
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 10,
            "churned": 0
          }
        ]
      },
      {
        "start_date": "2025-04-01",
        "departments": [
          {
            "functions": null,
            "new": 5,
            "retained": 189,
            "churned": 3
          },
          {
            "functions": "accounting",
            "new": 0,
            "retained": 3,
            "churned": 0
          },
          {
            "functions": "sales",
            "new": 2,
            "retained": 99,
            "churned": 2
          },
          {
            "functions": "operations",
            "new": 0,
            "retained": 26,
            "churned": 1
          },
          {
            "functions": "finance",
            "new": 1,
            "retained": 6,
            "churned": 0
          },
          {
            "functions": "marketing",
            "new": 0,
            "retained": 20,
            "churned": 2
          },
          {
            "functions": "human_resources",
            "new": 2,
            "retained": 21,
            "churned": 0
          },
          {
            "functions": "information_technology",
            "new": 0,
            "retained": 5,
            "churned": 0
          },
          {
            "functions": "legal",
            "new": 1,
            "retained": 5,
            "churned": 1
          },
          {
            "functions": "engineering",
            "new": 3,
            "retained": 204,
            "churned": 0
          },
          {
            "functions": "business_development",
            "new": 2,
            "retained": 14,
            "churned": 0
          },
          {
            "functions": "product_management",
            "new": 1,
            "retained": 16,
            "churned": 0
          },
          {
            "functions": "consulting",
            "new": 0,
            "retained": 7,
            "churned": 2
          },
          {
            "functions": "education",
            "new": 0,
            "retained": 10,
            "churned": 0
          },
          {
            "functions": "administrative",
            "new": 0,
            "retained": 1,
            "churned": 0
          },
          {
            "functions": "media_and_commmunication",
            "new": 0,
            "retained": 1,
            "churned": 1
          },
          {
            "functions": "arts_and_design",
            "new": 1,
            "retained": 20,
            "churned": 0
          },
          {
            "functions": "support",
            "new": 2,
            "retained": 23,
            "churned": 1
          },
          {
            "functions": "data_science",
            "new": 0,
            "retained": 9,
            "churned": 1
          }
        ]
      }
    ],
    "has_intent_signal_account": true,
    "intent_signal_account": {
      "_id": "6663bd946cef250001def02a",
      "account_id": "6658955677a2f20001c647ad",
      "aggregated_at": "2024-09-04T10:02:28.878+00:00",
      "computed": true,
      "created_at": "2024-06-08T02:10:28.537Z",
      "domain_aggregates": [
        {
          "domain": "tableofdiscontents.com",
          "total_visits": 15,
          "last_visit": 20240611,
          "first_visit": 20240607,
          "unique_visitors": 6,
          "weekly_aggregates": [
            {
              "week_start_date": "2024-06-07T00:00:00.000Z",
              "count": 15
            }
          ],
          "top_5_paths": [
            {
              "_id": "www.tableofdiscontents.com",
              "total_visits": 9
            },
            {
              "_id": "www.tableofdiscontents.com/pricing",
              "total_visits": 3
            },
            {
              "_id": "www.tableofdiscontents.com/premium",
              "total_visits": 2
            },
            {
              "_id": "www.tableofdiscontents.com/features",
              "total_visits": 1
            }
          ],
          "intent": "low",
          "intent_score": 0
        }
      ],
      "first_visited_at": 20240607,
      "last_visited_at": 20240611,
      "need_aggregation": false,
      "need_es_update": false,
      "new_reveal": false,
      "organization_id": "5e66b6381e05b4008c8331b8",
      "overall_intent": "low",
      "pre_generated_account_id": "6658955677a2f20001c647ad",
      "random": 0.162172829,
      "team_id": "6095a710bd01d100a506d4ac",
      "team_org_id": "6095a710bd01d100a506d4ac_5e66b6381e05b4008c8331b8",
      "total_visits": 15,
      "unique_visitors": 6,
      "updated_at": "2024-09-04T10:02:28.959Z",
      "website_visitor_metrics": {
        "overall_intent": "low",
        "total_visits": 15,
        "unique_visitors": 6,
        "domain_aggregates": [
          {
            "domain": "tableofdiscontents.com",
            "first_intent_signal_received_at": 20240607,
            "last_intent_signal_received_at": 20240611
          }
        ],
        "page_view_aggregates": {
          "one_day_count": 0,
          "seven_day_count": 0,
          "fifteen_day_count": 0,
          "thirty_day_count": 0,
          "sixty_day_count": 0,
          "ninety_day_count": 15
        },
        "pages": [
          "www.tableofdiscontents.com",
          "www.tableofdiscontents.com/pricing",
          "www.tableofdiscontents.com/premium",
          "www.tableofdiscontents.com/features"
        ],
        "first_intent_signal_received_at": 20240607,
        "last_intent_signal_received_at": 20240611
      },
      "id": "6663bd946cef250001def02a",
      "key": "6663bd946cef250001def02a"
    },
    "generic_org_insights": null,
    "show_intent": false,
    "detail_view_loaded": true
  }
}