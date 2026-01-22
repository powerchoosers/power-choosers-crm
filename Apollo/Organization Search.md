Organization Search
post
https://api.apollo.io/api/v1/mixed_companies/search
Use the Organization Search endpoint to find companies in the Apollo database. Several filters are available to help narrow your search.

Calling this endpoint does consume credits as part of your Apollo pricing plan. This feature is not accessible to Apollo users on free plans.

To protect Apollo's performance for all users, this endpoint has a display limit of 50,000 records (100 records per page, up to 500 pages). Add more filters to narrow your search results as much as possible. This limitation does not restrict your access to Apollo's database; you just need to access the data in batches.

Query Params
organization_num_employees_ranges[]
array of strings
The number range of employees working for the company. This enables you to find companies based on headcount. You can add multiple ranges to expand your search results.

Each range you add needs to be a string, with the upper and lower numbers of the range separated only by a comma.

Examples: 1,10; 250,500; 10000,20000


ADD string
organization_locations[]
array of strings
The location of the company headquarters. You can search across cities, US states, and countries.

If a company has several office locations, results are still based on the headquarters location. For example, if you search chicago but a company's HQ location is in boston, any Boston-based companies will not appearch in your search results, even if they match other parameters.

To exclude companies based on location, use the organization_not_locations parameter.

Examples: texas; tokyo; spain


ADD string
organization_not_locations[]
array of strings
Exclude companies from search results based on the location of the company headquarters. You can use cities, US states, and countries as locations to exclude.

This parameter is useful for ensuring you do not prospect in an undesirable territory. For example, if you use ireland as a value, no Ireland-based companies will appear in your search results.

Examples: minnesota; ireland; seoul


ADD string
revenue_range[min]
integer
Search for organizations based on their revenue.

Use this parameter to set the lower range of organization revenue. Use the revenue_range[max] parameter to set the upper range of revenue.

Do not enter currency symbols, commas, or decimal points in the figure.

Example: 300000

revenue_range[max]
integer
Search for organizations based on their revenue.

Use this parameter to set the upper range of organization revenue. Use the revenue_range[min] parameter to set the lower range of revenue.

Do not enter currency symbols, commas, or decimal points in the figure.

Example: 50000000

currently_using_any_of_technology_uids[]
array of strings
Find organizations based on the technologies they currently use. Apollo supports filtering by 1,500+ technologies.

Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file.

Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file.

Examples: salesforce; google_analytics; wordpress_org


ADD string
q_organization_keyword_tags[]
array of strings
Filter search results based on keywords associated with companies. For example, you can enter mining as a value to return only companies that have an association with the mining industry.

Examples: mining; sales strategy; consulting


ADD string
q_organization_name
string
Filter search results to include a specific company name.

If the value you enter for this parameter does not match with a company's name, the company will not appear in search results, even if it matches other parameters. Partial matches are accepted. For example, if you filter by the value marketing, a company called NY Marketing Unlimited would still be eligible as a search result, but NY Market Analysis would not be eligible.

Example: apollo or mining

organization_ids[]
array of strings
The Apollo IDs for the companies you want to include in your search results. Each company in the Apollo database is assigned a unique ID.

To find IDs, identify the values for organization_id when you call this endpoint.

Example: 5e66b6381e05b4008c8331b8


ADD string
latest_funding_amount_range[min]
integer
The minimum amount the company received with its most recent funding round. Use this parameter in combination with latest_funding_amount_range[max] to set a monetary range for the company's most recent funding round.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 5000000; 15000000

latest_funding_amount_range[max]
integer
The maximium amount the company received with its most recent funding round. Use this parameter in combination with latest_funding_amount_range[min] to set a monetary range for the company's most recent funding round.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 5000000; 15000000

total_funding_range[min]
integer
The minimum amount the company received during all of its funding rounds combined. Use this parameter in combination with total_funding_range[max] to set a monetary range for all of the company's funding rounds.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 50000000; 350000000

total_funding_range[max]
integer
The maximum amount the company received during all of its funding rounds combined. Use this parameter in combination with total_funding_range[min] to set a monetary range for all of the company's funding rounds.

Do not enter currency symbols, commas, or decimal points in the figure.

Examples: 50000000; 350000000

latest_funding_date_range[min]
date
The earliest date when the company received its most recent funding round. Use this parameter in combination with latest_funding_date_range[max] to set a date range for when the company received its most recent funding round.

Example: 2025-07-25

latest_funding_date_range[max]
date
The latest date when the company received its most recent funding round. Use this parameter in combination with latest_funding_date_range[min] to set a date range for when the company received its most recent funding round.

Example: 2025-09-25

q_organization_job_titles[]
array of strings
The job titles that are listed in active job postings at the company.

Examples: sales manager; research analyst


ADD string
organization_job_locations[]
array of strings
The locations of the jobs being actively recruited by the company.

Examples: atlanta; japan


ADD string
organization_num_jobs_range[min]
integer
The minimum number of job postings active at the company. Use this parameter in combination with organization_num_jobs_range[max] to set a job postings range.

Examples: 50; 500

organization_num_jobs_range[max]
integer
The maximum number of job postings active at the company. Use this parameter in combination with organization_num_jobs_range[min] to set a job postings range.

Examples: 50; 500

organization_job_posted_at_range[min]
date
The earliest date when jobs were posted by the company. Use this parameter in combination with organization_job_posted_at_range[max] to set a date range for when jobs posted.

Example: 2025-07-25

organization_job_posted_at_range[max]
date
The latest date when jobs were posted by the company. Use this parameter in combination with organization_job_posted_at_range[min] to set a date range for when jobs posted.

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
const url = 'https://api.apollo.io/api/v1/mixed_companies/search';
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
  "breadcrumbs": [
    {
      "label": "# Employees",
      "signal_field_name": "organization_num_employees_ranges",
      "value": "250,1000",
      "display_name": "250-1000"
    },
    {
      "label": "# Employees",
      "signal_field_name": "organization_num_employees_ranges",
      "value": "5000,10000",
      "display_name": "5000-10000"
    },
    {
      "label": "Company Locations",
      "signal_field_name": "organization_locations",
      "value": "japan",
      "display_name": "japan"
    },
    {
      "label": "Company Locations",
      "signal_field_name": "organization_locations",
      "value": "ireland",
      "display_name": "ireland"
    }
  ],
  "partial_results_only": false,
  "has_join": false,
  "disable_eu_prospecting": false,
  "partial_results_limit": 10000,
  "pagination": {
    "page": 1,
    "per_page": 2,
    "total_entries": 1184,
    "total_pages": 592
  },
  "accounts": [],
  "organizations": [
    {
      "id": "615d029256de500001bdb460",
      "name": "Nikkei Asia",
      "website_url": "http://www.nikkei.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/nikkeiasia",
      "twitter_url": "https://twitter.com/nikkei",
      "facebook_url": "https://facebook.com/nikkei",
      "primary_phone": {
        "number": "+81 362-56-2793",
        "source": "Scraped",
        "sanitized_number": "+81362562793"
      },
      "languages": [
        "Japanese",
        "Chinese"
      ],
      "alexa_ranking": 1583,
      "phone": "+81 362-56-2793",
      "linkedin_uid": "3335963",
      "founded_year": 1876,
      "publicly_traded_symbol": null,
      "publicly_traded_exchange": null,
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66de78ba1ad1eb00018e27a5/picture",
      "crunchbase_url": null,
      "primary_domain": "nikkei.com",
      "sanitized_phone": "+81362562793",
      "owned_by_organization_id": null,
      "intent_strength": null,
      "show_intent": true,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    {
      "id": "55f1fcddf3e5bb0be2000a92",
      "name": "Mitsui & Co., Ltd.",
      "website_url": "http://www.mitsui.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/mitsui-co-ltd-",
      "twitter_url": "https://twitter.com/citra_citrasa",
      "facebook_url": "https://facebook.com/mitsuiandco/",
      "primary_phone": {
        "number": "+81 3328-5-1111",
        "source": "Owler",
        "sanitized_number": "+81332851111"
      },
      "languages": [],
      "alexa_ranking": 265731,
      "phone": "+81 3328-5-1111",
      "linkedin_uid": "6675",
      "founded_year": 1947,
      "publicly_traded_symbol": "8031",
      "publicly_traded_exchange": "tyo",
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66da87a3b12bcc0001042a77/picture",
      "crunchbase_url": null,
      "primary_domain": "mitsui.com",
      "sanitized_phone": "+81332851111",
      "owned_by_organization_id": null,
      "intent_strength": null,
      "show_intent": true,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    }
  ],
  "model_ids": [
    "615d029256de500001bdb460",
    "55f1fcddf3e5bb0be2000a92"
  ],
  "num_fetch_result": null,
  "derived_params": null
}