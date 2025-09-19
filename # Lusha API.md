# Lusha API

Lusha provides a RESTful API that allows you to query a comprehensive dataset of business profiles and company information.

All API requests should be made over HTTPS (SSL), and the response bodies are delivered in JSON format.

## Data Source and Privacy
Please note that **Lusha is a search platform**, meaning the data provided is not created or directly managed by us. Instead, it is retrieved from publicly available sources and through contributions from trusted business partners.

For more information on how we collect, use, and handle business profiles, please refer to our [Privacy Policy](https://lusha.com/legal/privacy-notice/).

## Authentication
To access the Lusha API, you must authenticate your requests using your API key. This key is unique to your account and is used to identify your usage of the API.

### How to Authenticate
When making an API call, include your API key in the `api_key` header of the request.

### Important Notes
- To obtain your API key, please visit the following link: https://dashboard.lusha.com/enrich/api
- Your API key is sensitive and should be kept private. **Do not share it** with anyone outside of your organisation.
- The API key is used to track and manage your usage of the API, so **ensure it is protected** from unauthorised access.

## Available Endpoints
- **Person Enrichment**: Get contact information for individuals
- **Company Enrichment**: Get detailed company information
- **Prospecting**: Search and enrich contacts and companies based on specific criteria
- **Account Management**: Monitor your API credit usage
- **Signals**: Retrieve signals data for contacts and companies

## Rate Limiting
Lusha API enforces rate limiting to ensure fair usage and protect against excessive load.

- **General Rate Limit**: You can make up to 25 requests per second to each API endpoint
- **Credit Usage API**: Has a specific rate limit of 5 requests per minute

### Rate Limit Headers
To monitor your current rate limit status, check the HTTP response headers in your API calls:

| Header | Description |
|--------|-------------|
| `x-rate-limit-daily` | The total number of requests allowed per day under your current plan |
| `x-daily-requests-left` | The number of requests remaining in your daily quota |
| `x-daily-usage` | The number of requests you have made in the current daily period |
| `x-rate-limit-hourly` | The total number of requests allowed per hour under your current plan |
| `x-hourly-requests-left` | The number of requests remaining in your hourly quota |
| `x-hourly-usage` | The number of requests you have made in the current hourly period |
| `x-rate-limit-minute` | The total number of requests allowed per minute under your current plan |
| `x-minute-requests-left` | The number of requests remaining in your current minute window |
| `x-minute-usage` | The number of requests you have made in the current minute window |

### Notes on API Rate Limiting
- If you exceed the rate limit, the API will return a 429 (Too Many Requests) error.
- To ensure a smooth experience, respect the rate limits defined by your subscription tier.
- Daily limits vary based on your billing plan â€” higher tiers have higher quotas.
- You can programmatically track your usage through these response headers:
  - `X-RateLimit-Remaining-Daily`
  - `X-RateLimit-Reset-Daily`
- It is strongly recommended to implement logic that:
  - Monitors these headers
  - Pauses or retries requests accordingly
  - Helps avoid hitting the limit and ensures reliable operation

## Error Codes
Lusha API uses standard HTTP response codes to indicate the status of your request. These codes help you understand whether the request was successful or if there was an issue.

| Status Code | Name | Description |
|-------------|------|-------------|
| **200** | OK | Successful request |
| **400** | Bad Request | Badly formatted request |
| **401** | Unauthorized | The API key is invalid |
| **403** | Forbidden | Your account is not active. Please reach out to support at *support@lusha.com* for assistance |
| **403** | Forbidden | Your pricing version does not support requesting individual datapoints [revealEmails, revealPhones] |
| **404** | Not Found | The requested endpoint was not found |
| **412** | Precondition Failed | The request failed due to invalid syntax that was provided. Please make sure to send a full name field that contains a valid first & last name |
| **429** | Too Many Requests | You've reached your trial limit, please contact support for upgrade |
| **429** | Too Many Requests | Daily API quota limit exceeded. Limit X calls per day |
| **429** | Too Many Requests | Hourly API rate limit exceeded. Limit: X calls per hour. Reset in X seconds |
| **451** | Unavailable For Legal Reasons | We are unable to process this contact request due to our GDPR regulations |
| **499** | Client Closed Request | Request failed due to request timeout |
| **5XX** | Server Error | There's a problem on Lusha's end |

### Error Response Format
In case of an error, the response body will contain details about the error:

```json
{
  "error": {
    "code": 400,
    "message": "Invalid request parameters"
  }
}
```

### Handling Errors
- Always ensure your API key is correct and valid
- Pay attention to the specific error message and code to troubleshoot issues efficiently
- Implement proper error handling and retry logic in your application
- For 5XX errors, implement exponential backoff before retrying



## Servers

Production server
```
https://api.lusha.com
```

## Security

### ApiKeyAuth

Your Lusha API key. You can find this in your Lusha dashboard under API settings.

Include this key in the `api_key` header for all requests.


Type: apiKey
In: header
Name: api_key

## Download OpenAPI description

[Lusha API](https://docs.lusha.com/_spec/apis/openapi.yaml)

## Person Enrichment

The Person API allows you to look up detailed information about a person using various identifiers, such as their email, LinkedIn URL, full name, company name, or company domain. You can retrieve key data points like Location, Email, Phone number, Social network URLs.

### Search Single Contact

 - [GET /v2/person](https://docs.lusha.com/apis/openapi/person-enrichment/searchsinglecontact.md): Find and enrich a single contact using various search criteria. You can search by name, email, 
LinkedIn URL, or company information.

: You must provide either:
- LinkedIn URL OR
- Email OR
- firstName AND lastName AND (companyName OR companyDomain)


- Provide as much information as possible for better results
- Use  to get the latest employment data
- Use  parameter to specify what contact details you need
- Include the  parameter to retriever contact signals (If no signals data is found for the specified period, the  object will be empty but still present in the response.)
  - When requesting signals, you can optionally specify a start date using .
  - Signals data is optional. If you don't include the  parameter, no signals data will be returned.

---

âš ï¸ 

| Parameter | Requirement |
|-----------|-------------|
|  and  | Only available to customers on the  pricing plan |
| Plan Restriction | Attempting to use these parameters on other plans will result in a  error |
| Default Behavior | When neither parameter is used, the API returns , if available |

---


### Search Multiple Contacts

 - [POST /v2/person](https://docs.lusha.com/apis/openapi/person-enrichment/searchmultiplecontacts.md): Enrich multiple contacts in a single request. This endpoint allows you to submit a list of contacts 
and receive enriched data for each one, including company information.

You can process up to 100 contacts per request.

: You must provide either:
- LinkedIn URL OR
- Email OR
- firstName AND lastName AND (companyName OR companyDomain)        
---

âš ï¸ 

| Parameter | Requirement |
|-----------|-------------|
|  and  | Only available to customers on the  pricing plan |
| Plan Restriction | Attempting to use these parameters on other plans will result in a  error |
| Default Behavior | When neither parameter is used, the API returns , if available |

---


## Company Enrichment

The Company API allows you to retrieve detailed company information based on a company's domain or name.

### Search Single Company

 - [GET /v2/company](https://docs.lusha.com/apis/openapi/company-enrichment/searchsinglecompanyv2.md): Find detailed information about a single company using domain name, company name, or company ID.

: At least one of , , or  is required.


### Search Multiple Companies

 - [POST /v2/company](https://docs.lusha.com/apis/openapi/company-enrichment/searchmultiplecompaniesv2.md): Search for multiple companies in a single request. Provide a list of companies with 
identifiers like domain names or company IDs.

: Up to 25 requests per second. You can process up to 100 companies per request.


## Contact Filters

Available filters for contact searches

### Departments

 - [GET /prospecting/filters/contacts/departments](https://docs.lusha.com/apis/openapi/contact-filters/getcontactdepartments.md): Get list of available departments for contact filtering

### Seniority

 - [GET /prospecting/filters/contacts/seniority](https://docs.lusha.com/apis/openapi/contact-filters/getcontactseniority.md): Get list of available seniority levels for contact filtering

### Data Points

 - [GET /prospecting/filters/contacts/existing_data_points](https://docs.lusha.com/apis/openapi/contact-filters/getcontactdatapoints.md): Get list of available data points for contact filtering

### Countries

 - [GET /prospecting/filters/contacts/all_countries](https://docs.lusha.com/apis/openapi/contact-filters/getcontactcountries.md): Get list of all available countries for contact filtering

### Locations

 - [POST /prospecting/filters/contacts/locations](https://docs.lusha.com/apis/openapi/contact-filters/searchcontactlocations.md): Search for locations by text for contact filtering

## Company Filters

Available filters for company searches

### Names

 - [POST /prospecting/filters/companies/names](https://docs.lusha.com/apis/openapi/company-filters/searchcompanynames.md): Search for company names by text

### Industries

 - [GET /prospecting/filters/companies/industries_labels](https://docs.lusha.com/apis/openapi/company-filters/getcompanyindustries.md): Get list of available industries for company filtering

### Sizes

 - [GET /prospecting/filters/companies/sizes](https://docs.lusha.com/apis/openapi/company-filters/getcompanysizes.md): Get list of available company size ranges

### Revenues

 - [GET /prospecting/filters/companies/revenues](https://docs.lusha.com/apis/openapi/company-filters/getcompanyrevenues.md): Get list of available revenue ranges

### Locations

 - [POST /prospecting/filters/companies/locations](https://docs.lusha.com/apis/openapi/company-filters/searchcompanylocations.md): Search for company locations by text

### SIC Codes

 - [GET /prospecting/filters/companies/sics](https://docs.lusha.com/apis/openapi/company-filters/getcompanysiccodes.md): Get list of available SIC codes

### NAICS Codes

 - [GET /prospecting/filters/companies/naics](https://docs.lusha.com/apis/openapi/company-filters/getcompanynaicscodes.md): Get list of available NAICS codes

### Intent Topics

 - [GET /prospecting/filters/companies/intent_topics](https://docs.lusha.com/apis/openapi/company-filters/getcompanyintenttopics.md): Get list of available intent topics

### Technologies

 - [POST /prospecting/filters/companies/technologies](https://docs.lusha.com/apis/openapi/company-filters/searchcompanytechnologies.md): Search for technologies by text

## Contact Search & Enrich

Search and enrich contact data

### Search Contacts

 - [POST /prospecting/contact/search](https://docs.lusha.com/apis/openapi/contact-search-and-enrich/searchprospectingcontacts.md): Search for contacts using various filters. This is step 2 of the prospecting process.


### Enrich Contacts

 - [POST /prospecting/contact/enrich](https://docs.lusha.com/apis/openapi/contact-search-and-enrich/enrichprospectingcontacts.md): Enrich contacts from search results. This is step 3 of the prospecting process.
        
---

âš ï¸ 

| Parameter | Requirement |
|-----------|-------------|
|  and  | Only available to customers on the  pricing plan |
| Plan Restriction | Attempting to use these parameters on other plans will result in a  error |
| Default Behavior | When neither parameter is used, the API returns , if available |

---


## Company Search & Enrich

Search and enrich company data

### Search Companies

 - [POST /prospecting/company/search](https://docs.lusha.com/apis/openapi/company-search-and-enrich/searchprospectingcompanies.md): Search for companies using various filters. This is step 2 of the prospecting process.


### Enrich Companies

 - [POST /prospecting/company/enrich](https://docs.lusha.com/apis/openapi/company-search-and-enrich/enrichprospectingcompanies.md): Enrich companies from search results. This is step 3 of the prospecting process.


## Account Management

Manage your account and monitor usage

### Get Account Usage Statistics

 - [GET /account/usage](https://docs.lusha.com/apis/openapi/account-management/getaccountusagestats.md): Retrieve your current API credit usage statistics including used, remaining, and total credits.

: This endpoint has a specific rate limit of 5 requests per minute.


## Signal Filters

### Get Signal Options

 - [GET /api/signals/filters/{objectType}](https://docs.lusha.com/apis/openapi/signal-filters/getsignaloptions.md): Retrieve available signal options for a specific entity type (contact or company).
This endpoint returns the list of signal types you can filter by when enriching contacts or companies.


## Signals

### Get Contact Signals by IDs

 - [POST /api/signals/contacts](https://docs.lusha.com/apis/openapi/signals/getcontactsignalsbyid.md): Retrieve signals data for a list of contact IDs.
This endpoint allows you to get recent activities and signals for up to 100 contacts per request.


- Returns signals from the last 6 months by default
- Use  to customize the timeframe
- Each signal type requested counts towards credit usage


### Search Contact Signals

 - [POST /api/signals/contacts/search](https://docs.lusha.com/apis/openapi/signals/searchcontactsignals.md): Search for contact signals using identifiers like LinkedIn URL, email, or name + company.
This endpoint combines search and signal enrichment in a single request.


Each contact can be identified by:
- Contact ID
- LinkedIn URL
- Email address
- Full name + Company (name or domain)


- Returns signals from the last 6 months by default
- Contacts are matched based on provided identifiers
- Returns both contact data and associated signals


### Get Company Signals by IDs

 - [POST /api/signals/companies](https://docs.lusha.com/apis/openapi/signals/getcompanysignalsbyid.md): Retrieve signals data for a list of company IDs.
This endpoint allows you to get recent activities and signals for up to 100 companies per request.


- Returns signals from the last 6 months by default
- Use  to customize the timeframe


### Search Company Signals

 - [POST /api/signals/companies/search](https://docs.lusha.com/apis/openapi/signals/searchcompanysignals.md): Search for company signals using identifiers like domain, company name, or ID.
This endpoint combines search and signal enrichment in a single request.


Each company must have at least one identifier:
- Company ID (as string)
- Company name
- Company domain


- Returns signals from the last 6 months by default
- Companies are matched based on provided identifiers
