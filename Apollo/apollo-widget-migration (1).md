People Search
post
https://api.apollo.io/api/v1/mixed_people/search
Use the People Search endpoint to find people in the Apollo database. Several filters are available to help narrow your search.

Calling this endpoint does consume credits as part of your Apollo pricing plan. This feature is not accessible to Apollo users on free plans.

This endpoint does not return new email addresses or phone numbers. Use the People Enrichment or Bulk People Enrichment endpoints to enrich data.

To protect Apollo's performance for all users, this endpoint has a display limit of 50,000 records (100 records per page, up to 500 pages). Add more filters to narrow your search results as much as possible. This limitation does not restrict your access to Apollo's database; you just need to access the data in batches.

Query Params
person_titles[]
array of strings
Job titles held by the people you want to find. For a person to be included in search results, they only need to match 1 of the job titles you add. Adding more job titles expands your search results.

Results also include job titles with the same terms, even if they are not exact matches. For example, searching for marketing manager might return people with the job title content marketing manager.

Use this parameter in combination with the person_seniorities[] parameter to find people based on specific job functions and seniority levels.

Examples: sales development representative; marketing manager; research analyst


ADD string
include_similar_titles
boolean
This parameter determines whether people with job titles similar to the titles you define in the person_titles[] parameter are returned in the response.

Set this parameter to false when using person_titles[] to return only strict matches for job titles.


true
q_keywords
string
A string of words over which we want to filter the results.

person_locations[]
array of strings
The location where people live. You can search across cities, US states, and countries.

To find people based on the headquarters locations of their current employer, use the organization_locations parameter.

Examples: california; ireland; chicago


ADD string
person_seniorities[]
array of strings
The job seniority that people hold within their current employer. This enables you to find people that currently hold positions at certain reporting levels, such as Director level or senior IC level.

For a person to be included in search results, they only need to match 1 of the seniorities you add. Adding more seniorities expands your search results.

Searches only return results based on their current job title, so searching for Director-level employees only returns people that currently hold a Director-level title. If someone was previously a Director, but is currently a VP, they would not be included in your search results.

Use this parameter in combination with the person_titles[] parameter to find people based on specific job functions and seniority levels.

The following options can be used for this parameter:

owner
founder
c_suite
partner
vp
head
director
manager
senior
entry
intern

ADD string
organization_locations[]
array of strings
The location of the company headquarters for a person's current employer. You can search across cities, US states, and countries.

If a company has several office locations, results are still based on the headquarters location. For example, if you search chicago but a company's HQ location is in boston, people that work for the Boston-based company will not appear in your results, even if they match other \parameters.

To find people based on their personal location, use the person_locations parameter.

Examples: texas; tokyo; spain


ADD string
q_organization_domains_list[]
array of strings
The domain name for the person's employer. This can be the current employer or a previous employer. Do not include www., the @ symbol, or similar.

This parameter accepts up to 1,000 domains in a single request.

Examples: apollo.io; microsoft.com


ADD string
contact_email_status[]
array of strings
The email statuses for the people you want to find. You can add multiple statuses to expand your search.

The statuses you can search include:

verified
unverified
likely to engage
unavailable

ADD string
organization_ids[]
array of strings
The Apollo IDs for the companies (employers) you want to include in your search results. Each company in the Apollo database is assigned a unique ID.

To find IDs, call the Organization Search endpoint and identify the values for organization_id.

Example: 5e66b6381e05b4008c8331b8


ADD string
organization_num_employees_ranges[]
array of strings
The number range of employees working for the person's current company. This enables you to find people based on the headcount of their employer. You can add multiple ranges to expand your search results.

Each range you add needs to be a string, with the upper and lower numbers of the range separated only by a comma.

Examples: 1,10; 250,500; 10000,20000


ADD string
revenue_range[min]
integer
The minimum revenue the person's current employer generates. Use this parameter in combination with revenue_range[max] to set a revenue range.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 500000; 1500000

revenue_range[max]
integer
The maximum revenue the person's current employer generates. Use this parameter in combination with revenue_range[min] to set a revenue range.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 500000; 1500000

currently_using_all_of_technology_uids[]
array of strings
Find people based on all of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies.

Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file.

Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file.

Examples: salesforce; google_analytics; wordpress_org


ADD string
currently_using_any_of_technology_uids[]
array of strings
Find people based on any of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies.

Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file.

Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file.

Examples: salesforce; google_analytics; wordpress_org


ADD string
currently_not_using_any_of_technology_uids[]
array of strings
Exclude people from your search based on any of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies.

Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file.

Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file.

Examples: salesforce; google_analytics; wordpress_org


ADD string
q_organization_job_titles[]
array of strings
The job titles that are listed in active job postings at the person's current employer.

Examples: sales manager; research analyst


ADD string
organization_job_locations[]
array of strings
The locations of the jobs being actively recruited by the person's employer.

Examples: atlanta; japan


ADD string
organization_num_jobs_range[min]
integer
The minimum number of job postings active at the person's current empployer. Use this parameter in combination with organization_num_jobs_range[max] to set a job postings range.

Examples: 50; 500

organization_num_jobs_range[max]
integer
The maximum number of job postings active at the person's current empployer. Use this parameter in combination with organization_num_jobs_range[min] to set a job postings range.

Examples: 50; 500

organization_job_posted_at_range[min]
date
The earliest date when jobs were posted by the person's current employer. Use this parameter in combination with organization_job_posted_at_range[max] to set a date range for when jobs posted.

Example: 2025-07-25

organization_job_posted_at_range[max]
date
The latest date when jobs were posted by the person's current employer. Use this parameter in combination with organization_job_posted_at_range[min] to set a date range for when jobs posted.

Example: 2025-09-25

page
int32
The page number of the Apollo data that you want to retrieve.

Use this parameter in combination with the per_page parameter to make search results for navigable and improve the performance of the endpoint.

Example: 4

per_page
int32
The number of search results that should be returned for each page. Limiting the number of results per page improves the endpoint's performance.

Use the page parameter to search the different pages of data.

Example: 10

Fetch Request:
const url = 'https://api.apollo.io/api/v1/people/match?reveal_personal_emails=false&reveal_phone_number=false';
const options = {
  method: 'POST',
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
  "person": {
    "id": "66b8a5d38d90c000011cce51",
    "first_name": "Tim",
    "last_name": "Zheng",
    "name": "Tim Zheng",
    "linkedin_url": "http://www.linkedin.com/in/tim-zheng-677ba010",
    "title": "Founder & CEO",
    "email_status": "verified",
    "photo_url": "https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2",
    "twitter_url": null,
    "github_url": null,
    "facebook_url": null,
    "extrapolated_email_confidence": null,
    "headline": "Founder & CEO at Apollo",
    "email": "tim@apollo.io",
    "organization_id": "5e66b6381e05b4008c8331b8",
    "employment_history": [
      {
        "_id": "66d7af8c200cad0001404c1f",
        "created_at": null,
        "current": true,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": null,
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": "5e66b6381e05b4008c8331b8",
        "organization_name": "Apollo",
        "raw_address": null,
        "start_date": "2016-01-01",
        "title": "Founder & CEO",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c1f",
        "key": "66d7af8c200cad0001404c1f"
      },
      {
        "_id": "66d7af8c200cad0001404c20",
        "created_at": null,
        "current": false,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": "2015-01-01",
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": null,
        "organization_name": "Braingenie",
        "raw_address": null,
        "start_date": "2011-01-01",
        "title": "Founder & CEO",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c20",
        "key": "66d7af8c200cad0001404c20"
      },
      {
        "_id": "66d7af8c200cad0001404c21",
        "created_at": null,
        "current": false,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": "2011-01-01",
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": "54a22f23746869331840e813",
        "organization_name": "Citadel Investment Group",
        "raw_address": null,
        "start_date": "2011-01-01",
        "title": "Investment & Trading Associate",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c21",
        "key": "66d7af8c200cad0001404c21"
      },
      {
        "_id": "66d7af8c200cad0001404c22",
        "created_at": null,
        "current": false,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": "2010-09-01",
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": "54a1216169702d7fe6dfca02",
        "organization_name": "The Boston Consulting Group",
        "raw_address": null,
        "start_date": "2010-08-01",
        "title": "Summer Associate",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c22",
        "key": "66d7af8c200cad0001404c22"
      },
      {
        "_id": "66d7af8c200cad0001404c23",
        "created_at": null,
        "current": false,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": "2010-08-01",
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": "5da2e6a3f978a8000177e831",
        "organization_name": "Goldman Sachs",
        "raw_address": null,
        "start_date": "2010-06-01",
        "title": "Summer Analyst",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c23",
        "key": "66d7af8c200cad0001404c23"
      },
      {
        "_id": "66d7af8c200cad0001404c24",
        "created_at": null,
        "current": false,
        "degree": null,
        "description": null,
        "emails": null,
        "end_date": "2010-02-01",
        "grade_level": null,
        "kind": null,
        "major": null,
        "organization_id": "54a1a06274686945fa1ffc02",
        "organization_name": "Jane Street",
        "raw_address": null,
        "start_date": "2009-12-01",
        "title": "Trading Intern",
        "updated_at": null,
        "id": "66d7af8c200cad0001404c24",
        "key": "66d7af8c200cad0001404c24"
      }
    ],
    "state": "California",
    "city": "San Francisco",
    "country": "United States",
    "contact_id": "664fa05cf8299f0001f90876",
    "contact": {
      "contact_roles": [],
      "id": "664fa05cf8299f0001f90876",
      "first_name": "Roy",
      "last_name": "Chung",
      "name": "Roy Chung",
      "linkedin_url": "http://www.linkedin.com/in/tim-zheng-677ba010",
      "title": "Reaching Peak Potential 💪⛰️📈🧪️ | President",
      "contact_stage_id": "6095a710bd01d100a506d4ae",
      "owner_id": null,
      "creator_id": "66302798d03b9601c7934ec2",
      "person_id": "66b8a5d38d90c000011cce51",
      "email_needs_tickling": null,
      "organization_name": "Apollo.io",
      "source": "crm",
      "original_source": "crm",
      "organization_id": "5e66b6381e05b4008c8331b8",
      "headline": "Reaching Peak Potential 💪⛰️📈🧪️ | President at FRC",
      "photo_url": null,
      "present_raw_address": "New York, New York, United States",
      "linkedin_uid": null,
      "extrapolated_email_confidence": null,
      "salesforce_id": null,
      "salesforce_lead_id": null,
      "salesforce_contact_id": null,
      "salesforce_account_id": null,
      "crm_owner_id": null,
      "created_at": "2024-05-23T20:00:28.527Z",
      "emailer_campaign_ids": [],
      "direct_dial_status": null,
      "direct_dial_enrichment_failed_at": null,
      "email_status": "verified",
      "email_source": null,
      "account_id": "6658955877a2f20001c648ac",
      "last_activity_date": null,
      "hubspot_vid": null,
      "hubspot_company_id": null,
      "crm_id": null,
      "sanitized_phone": "+11234567890",
      "merged_crm_ids": null,
      "updated_at": "2024-06-02T08:53:51.266Z",
      "queued_for_crm_push": null,
      "suggested_from_rule_engine_config_id": null,
      "email_unsubscribed": null,
      "label_ids": [],
      "has_pending_email_arcgate_request": false,
      "has_email_arcgate_request": false,
      "existence_level": "invisible",
      "email": "roy@apollo.io",
      "email_from_customer": true,
      "typed_custom_fields": {},
      "custom_field_errors": null,
      "crm_record_url": null,
      "email_status_unavailable_reason": null,
      "email_true_status": "Verified",
      "updated_email_true_status": false,
      "contact_rule_config_statuses": [],
      "source_display_name": "Imported from CRM",
      "contact_emails": [
        {
          "email": "roy@apollo.iorrr",
          "email_md5": "879440a4afe6515e2de11dd7c531b770",
          "email_sha256": "354f0caf2a603f6bd8e1646693ad829615254584fd83692766ac2db3aaa58e0f",
          "email_status": "verified",
          "email_source": null,
          "extrapolated_email_confidence": null,
          "position": 0,
          "email_from_customer": null,
          "free_domain": false
        }
      ],
      "time_zone": "America/Los_Angeles",
      "phone_numbers": [
        {
          "raw_number": "(123) 456-7890",
          "sanitized_number": "+11234567890",
          "type": null,
          "position": 0,
          "status": "valid_number",
          "dnc_status": null,
          "dnc_other_info": null,
          "dialer_flags": null
        },
        {
          "raw_number": "(123) 456-1234",
          "sanitized_number": "+11234561234",
          "type": null,
          "position": 1,
          "status": "valid_number",
          "dnc_status": null,
          "dnc_other_info": null,
          "dialer_flags": null
        },
        {
          "raw_number": "+1-415-763-6055",
          "sanitized_number": "+14157636055",
          "type": null,
          "position": 2,
          "status": "valid_number",
          "dnc_status": null,
          "dnc_other_info": null,
          "dialer_flags": {
            "country_name": "United States",
            "country_enabled": true,
            "high_risk_calling_enabled": false,
            "potential_high_risk_number": false
          }
        }
      ],
      "account_phone_note": null,
      "free_domain": false,
      "is_likely_to_engage": false
    },
    "revealed_for_current_team": true,
    "organization": {
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
      "raw_address": "415 Mission St, Floor 37, San Francisco, California 94105, US",
      "street_address": "415 Mission St",
      "city": "San Francisco",
      "state": "California",
      "postal_code": "94105-2301",
      "country": "United States",
      "owned_by_organization_id": null,
      "seo_description": "Search, engage, and convert over 275 million contacts at over 73 million companies with Apollo's sales intelligence and engagement platform.",
      "short_description": "Apollo.io combines a buyer database of over 270M contacts and powerful sales engagement and automation tools in one, easy to use platform. Trusted by over 160,000 companies including Autodesk, Rippling, Deel, Jasper.ai, Divvy, and Heap, Apollo has more than one million users globally. By helping sales professionals find their ideal buyers and intelligently automate outreach, Apollo helps go-to-market teams sell anything.\n\nCelebrating a $100M Series D Funding Round 🦄",
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
        "Gravity Forms",
        "Hubspot",
        "Intercom",
        "Mailchimp Mandrill",
        "Marketo",
        "Microsoft Office 365",
        "Mobile Friendly",
        "Python",
        "Rackspace MailGun",
        "Remote",
        "Render",
        "Reviews",
        "Salesforce",
        "Stripe",
        "Typekit",
        "WP Engine",
        "Wistia",
        "WordPress.org",
        "Yandex Metrica",
        "reCAPTCHA"
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
          "uid": "gravity_forms",
          "name": "Gravity Forms",
          "category": "Hosted Forms"
        },
        {
          "uid": "hubspot",
          "name": "Hubspot",
          "category": "Marketing Automation"
        },
        {
          "uid": "intercom",
          "name": "Intercom",
          "category": "Support and Feedback"
        },
        {
          "uid": "mailchimp_mandrill",
          "name": "Mailchimp Mandrill",
          "category": "Email Delivery"
        },
        {
          "uid": "marketo",
          "name": "Marketo",
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
          "uid": "stripe",
          "name": "Stripe",
          "category": "Payments"
        },
        {
          "uid": "typekit",
          "name": "Typekit",
          "category": "Fonts"
        },
        {
          "uid": "wp_engine",
          "name": "WP Engine",
          "category": "CMS"
        },
        {
          "uid": "wistia",
          "name": "Wistia",
          "category": "Online Video Platforms"
        },
        {
          "uid": "wordpress_org",
          "name": "WordPress.org",
          "category": "CMS"
        },
        {
          "uid": "yandex_metrika",
          "name": "Yandex Metrica",
          "category": "Analytics and Tracking"
        },
        {
          "uid": "recaptcha",
          "name": "reCAPTCHA",
          "category": "Captcha"
        }
      ],
      "org_chart_root_people_ids": [
        "652fc57e2802bf00010c52f8"
      ],
      "org_chart_sector": "OrgChart::SectorHierarchy::Rules::IT",
      "org_chart_removed": false,
      "org_chart_show_department_filter": true
    },
    "is_likely_to_engage": true,
    "intent_strength": null,
    "show_intent": false,
    "departments": [
      "c_suite"
    ],
    "subdepartments": [
      "executive",
      "founder"
    ],
    "functions": [
      "entrepreneurship"
    ],
    "seniority": "founder"
  }
}