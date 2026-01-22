Find People Using Filters
Overview
Apollo offers a highly accurate database of hundreds of millions of people, enabling you to find and connect with your ideal customers across the world. The People API Search enables you to find the prospects most likely to benefit from your product or service through targeted search filters.

🚧
Credits
Using this endpoint doesn't consume your account’s credits.

The following section describes how to search for and filter people using Apollo's People API Search.

Before You Start: Check Out Reference Docs
Apollo’s API reference docs show the query parameters available for you to use with the People API. Apollo is going to walk through specific scenarios in this article, but you can address your own cases by combining these examples with the reference information.

Example: Search for Sales Directors Based on the West Coast of the US
To show how the People API Search can be used with Apollo’s search filters, let’s walk through a scenario: finding people that are currently Sales Directors that are personally located in US states on the west coast (California, Oregon, and Washington).

To find people matching these demographics:

Call the People API Search endpoint:
HTTP

POST https://api.apollo.io/api/v1/mixed_people/api_search
Add the following query parameters:
Parameter

Value for this Example

Notes

person_titles

["sales director", "director sales", "director, sales"]

Your search filters need to be added as an array of strings.

The person_titles parameter should be used to limit your search to people with specific job titles.

person_locations

=["California, US", "Oregon, US", "Washington, US"]

Your search filters need to be added as an array of strings.

The person_locations parameter should be used to find people based on their own location. To search for people based on the headquarters location of their current employer, use the organization_locations parameter.

per_page

5

Your value should be an integer between 1 and 100. This parameter can be used to specify how many results to return per page.

Add the following keys and values to the header of your request:
Content-Type: application/json
Cache-Control: no-cache
X-Api-Key: Enter your Apollo API key.
cURL Request
The following code sample shows the example as a cURL request:

cURL

curl --request POST \
     --url 'https://api.apollo.io/api/v1/mixed_people/api_search?person_titles[]=sales%20director&person_titles[]=director%20sales&person_titles[]=director%2C%20sales&person_locations[]=California%2C%20US&person_locations[]=Oregon%2C%20US&person_locations[]=Washington%2C%20US&per_page=5' \
     --header 'Cache-Control: no-cache' \
     --header 'Content-Type: application/json' \
     --header 'accept: application/json' \
     --header 'x-api-key: YOUR_API_KEY'
Postman Request
The following image shows how the request can be formatted in Postman. If you prefer to pass the parameters via the body of the request, use the raw option, not form-data.


Response Details
A 200 response returns JSON data as shown below.

To get complete person profiles, use the id values from this response and include them in the details array when calling the people/bulk_match endpoint. For more details and usage examples, refer to the Enrich People Data tutorial.

JSON

{
    "total_entries": 31993,
    "people": [
        {
            "id": "63519a6d6fa6ba00019200f8",
            "first_name": "Chuck",
            "last_name_obfuscated": "Po***r",
            "title": "Dir. of Sales, Director of Sales",
            "last_refreshed_at": "2025-10-16T08:16:08.485+00:00",
            "has_email": false,
            "has_city": false,
            "has_state": true,
            "has_country": true,
            "has_direct_phone": "Yes",
            "organization": {
                "name": "Vans",
                "has_industry": true,
                "has_phone": true,
                "has_city": true,
                "has_state": true,
                "has_country": true,
                "has_zip_code": true,
                "has_revenue": true,
                "has_employee_count": true
            }
        },
        {
            "id": "67da57bcf3aa9a0001ef0500",
            "first_name": "Carrie",
            "last_name_obfuscated": "Ki***r",
            "title": "Sales Director, Sales Director",
            "last_refreshed_at": "2025-11-10T08:39:18.742+00:00",
            "has_email": false,
            "has_city": true,
            "has_state": true,
            "has_country": true,
            "has_direct_phone": "Yes",
            "organization": {
                "name": "Pearson",
                "has_industry": true,
                "has_phone": true,
                "has_city": false,
                "has_state": true,
                "has_country": true,
                "has_zip_code": true,
                "has_revenue": true,
                "has_employee_count": true
            }
        },
        {
            "id": "55d6d50df3e5bb19db00382b",
            "first_name": "Dave",
            "last_name_obfuscated": "Sc***r",
            "title": "Director of Sales, Director",
            "last_refreshed_at": "2025-11-10T10:38:42.300+00:00",
            "has_email": false,
            "has_city": true,
            "has_state": true,
            "has_country": true,
            "has_direct_phone": "Yes",
            "organization": {
                "name": "TalentMatch LLC",
                "has_industry": true,
                "has_phone": true,
                "has_city": true,
                "has_state": true,
                "has_country": true,
                "has_zip_code": true,
                "has_revenue": false,
                "has_employee_count": true
            }
        },
        {
            "id": "67bbfd72fe96a70001ebb388",
            "first_name": "Scott",
            "last_name_obfuscated": "Br***n",
            "title": "Sales Director, Sales",
            "last_refreshed_at": "2025-11-08T01:30:13.928+00:00",
            "has_email": true,
            "has_city": true,
            "has_state": true,
            "has_country": true,
            "has_direct_phone": "Yes",
            "organization": {
                "name": "Lennar Title",
                "has_industry": true,
                "has_phone": true,
                "has_city": true,
                "has_state": true,
                "has_country": true,
                "has_zip_code": true,
                "has_revenue": true,
                "has_employee_count": true
            }
        },
        {
            "id": "6820ea8427ffb80001b7c115",
            "first_name": "Joe",
            "last_name_obfuscated": "Gy***i",
            "title": "Sales Director, Director of Sales",
            "last_refreshed_at": "2025-11-03T23:32:52.029+00:00",
            "has_email": true,
            "has_city": true,
            "has_state": true,
            "has_country": true,
            "has_direct_phone": "Maybe: please request direct dial via people/bulk_match",
            "organization": {
                "name": "AT&T",
                "has_industry": true,
                "has_phone": true,
                "has_city": true,
                "has_state": true,
                "has_country": true,
                "has_zip_code": true,
                "has_revenue": true,
                "has_employee_count": true
            }
        }
    ]
}
The following table details some key elements of the API response:

Element	Description
"title"	The value in this object shows the job title for the person.
"organization": { }	This object provides more details about the person's current organization.


