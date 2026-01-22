Overview - Apollo API Tutorials
Apollo's REST API is available to all customers and partners, and, depending on your Apollo pricing plan, you can access advanced API functionality.

Advanced functionality includes, but is not limited to, the following use cases:

Find People Using Filters
Enrich Your Own People Data
Retrieve Mobile Phone Numbers for Contacts
Convert Enriched People to Contacts
Find People Using Filters
Apollo offers a highly accurate database of hundreds of millions of people, enabling you to find and connect with your ideal customers across the world. The People API enables you to find the prospects most likely to benefit from your product or service through targeted search filters.

Apollo walks through a scenario to demonstrate how the People API's query parameters can be used, including to search for Sales Directors based on the West Coast of the US.

Check out the full tutorial.

Enrich Your Own People Data
Apollo's database features information for hundreds of millions of people. By providing basic details such as an email address or name, you can retrieve people data from Apollo's Enrichment API to supplement your own data.

Apollo shows how to use the Enrichment API with an email address alone, as well as with the combination of a name and company domain. Both scenarios show the valuable data that can be pulled for a person in the Apollo database.

Check out the full tutorial.

Retrieve Mobile Phone Numbers for Contacts
By default, Apollo does not provide mobile phone numbers for contacts. However, with basic details such as an email address or name, the Enrichment API enables you to retrieve all of a contact's phone numbers, including those highly valued mobile phone numbers.

Check out the full tutorial.

Convert Enriched People to Contacts
When you use the Apollo API to enrich your own people data and pull mobile phone numbers, you've likely already consumed email, export, or mobile credits as part of your Apollo pricing plan. If you call the API to enrich data for the same people in the future, you potentially consume more credits to access the same data you've previously accessed.

To avoid consuming your account's credits unnecessarily, use the Contacts API to convert enriched people into contacts. A contact is a person that you have added to your organization's Apollo account, which means their data becomes permanently accessible to your organization

Convert Enriched People to Contacts
Overview
When you use the Apollo API to enrich your own people data and pull mobile phone numbers, you've likely already consumed email, export, or mobile credits as part of your Apollo pricing plan. If you call the API to enrich data for the same people in the future, you potentially consume more credits to access the same data you've previously accessed.

To avoid consuming your account's credits unnecessarily, use the Create a Contact endpoint to convert enriched people into contacts. A contact is a person that you have added to your organization's Apollo account, which means their data becomes permanently accessible to your organization.

🚧
New Contacts
Apollo does not run any deduplication during this process. If your record contains the same email address, or name and company, as an existing contact, Apollo will create a new contact instead of updating the existing contact.

The following sections detail how to use the Contacts API to create new contacts in Apollo.

Before You Start: Check Out Reference Docs
Apollo’s API reference docs show the query parameters available for you to use with the Contacts API. Apollo is going to walk through a specific scenario in this article, but you can address your own cases by combining these examples with the reference information.

Example: Create a Contact
First, ensure that you can access the person data that you have pulled via the Enrichment API. For this example, Apollo is going to pass the following information to the Contacts API:

First name
Last name
Email address
Company name
Company domain
Direct phone
Mobile phone
To create a contact via the API for your Apollo account:

Call the Create a Contact endpoint:
HTTP

POST https://api.apollo.io/api/v1/contacts
Add the following query parameters:
Parameter	Value for this Example
"first_name"	"Mark"
"last_name"	"Twain"
"organization_name"	"Great American Writers Co."
"email"	"themarktwain@greatamericanwriters.com "
"website_url"	"https://www.greatamericanwriters.com"
"direct_phone"	"555-123-4567"
"mobile_phone"	"555-765-4321"

Add the following keys and values to the header of your request:
Content-Type: application/json
Cache-Control: no-cache
X-Api-Key: Enter your Apollo API key.
cURL Request
The following shows the example as a cURL request:

cURL

curl --request POST \
     --url 'https://api.apollo.io/api/v1/contacts?first_name=Mark&last_name=Twain&organization_name=Great%20American%20Writers%20Co.&email=themarktwain%40greatamericanwriters.com&website_url=https%3A%2F%2Fwww.greatamericanwriters.com&direct_phone=555-123-4567&mobile_phone=555-765-4321' \
     --header 'Cache-Control: no-cache' \
     --header 'Content-Type: application/json' \
     --header 'accept: application/json' \
     --header 'x-api-key: YOUR_API_KEY'
Postman Request
The following image shows how the request can be formatted in Postman. If you prefer to pass the parameters via the body of the request, use the raw option, not form-data.


Response Details
A successful request returns a 200 response status and JSON data similar to the following response:

JSON

{
    "contact": {
        "contact_roles": [],
        "id": "668463fe9709b70afd54fb5a",
        "first_name": "Mark",
        "last_name": "Twain",
        "name": "Mark Twain",
        "linkedin_url": null,
        "title": null,
        "contact_stage_id": "6095a710bd01d100a506d4ae",
        "owner_id": "60affe7d6e270a00f5db6fe4",
        "creator_id": "60affe7d6e270a00f5db6fe4",
        "person_id": null,
        "email_needs_tickling": null,
        "organization_name": "Great American Writers Co.",
        "source": "api",
        "original_source": "api",
        "organization_id": null,
        "headline": null,
        "photo_url": null,
        "present_raw_address": null,
        "linkedin_uid": null,
...
        "phone_numbers": [
            {
                "raw_number": "555-123-4567",
                "sanitized_number": "+15551234567",
                "type": "work_direct",
                "position": 0,
                "status": "no_status",
                "dnc_status": null,
                "dnc_other_info": null,
                "dialer_flags": null
            },
            {
                "raw_number": "555-765-4321",
                "sanitized_number": "+15557654321",
                "type": "mobile",
                "position": 1,
                "status": "no_status",
                "dnc_status": null,
                "dnc_other_info": null,
                "dialer_flags": null
            }
        ],
...
}%

Confirm Contact Status
To confirm that a contact has been created for your Apollo account:

Call the People Enrichment endpoint:
HTTP

POST https://api.apollo.io/api/v1/people/match
Add the email query parameter, and provide the email value from the API response. For this example, the email address is themarktwain@greatamericanwriters.com.
Add the following keys and values to the header of your request:
Content-Type: application/json
Cache-Control: no-cache
X-Api-Key: Enter your Apollo API key.
The API response provides the details you used when creating the contact, including the email address and phone numbers. This means you don't need to consume credits from your Apollo account to reveal this information again.
