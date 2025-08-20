Twilio API requests


Learn how to authenticate your requests, what content type to use for API requests, and how the Twilio APIs handle webhooks. You'll also see examples of how to make requests to the Twilio APIs.

Ways to make requests to the Twilio APIs


There are several ways you can make an HTTP request to the Twilio API.

Make a raw HTTP request either in your code (for example, by using a module like got in NodeJS
) or with a tool like Postman
.
Use a Twilio Helper Library for your preferred programming language.
Use the Twilio CLI if you prefer working in the terminal.
Authentication


(information)
Environment variables
Always store your credentials in environment variables before sharing any code or deploying to production. Learn more about setting environment variables
.

To authenticate requests to the Twilio APIs, Twilio supports HTTP Basic authentication
. You can use the following credentials:

Username	Password	Best practice
API Key	API Key Secret	This is the recommended way to authenticate with the Twilio APIs. When a key is compromised or no longer used, revoke it to prevent unauthorized access.
Account SID	AuthToken	Limit your use to local testing.
(information)
Regional API credentials
Twilio API credentials are region-specific resources. If your account uses Twilio Regions, see Manage Regional API credentials.

Using API keys (recommended)


An API key is a unique identifier that allows a client to access your Twilio account and create, read, update, or delete resources through the Twilio APIs. You can create multiple API keys for different purposes, such as for different developers or subsystems within your application. If a key is compromised or no longer used, you can revoke it to prevent unauthorized access.

You can create an API key either in the Twilio Console or using the API.

The API key types are Main, Standard, and Restricted (Public Beta, Key resource v1 only). The following table describes each type:

Key type	Access permissions	Create in Console	Create with REST API
Main	Full access to all Twilio API resources. Equivalent to using your Account SID and Auth Token for API requests.	Yes	No
Standard	Access to all Twilio API resources, except for Accounts (/Accounts) or Keys (/Accounts/{SID}/Keys, /v1/Keys) resources.	Yes	Yes
Restricted	Customized, fine-grained access to specific Twilio API resources. Learn more about Restricted API keys.	Yes	Yes (v1 only)
When making an API request, use your API key as the username and your API key secret as the password.

Note: In the following example, you must use a Main API key.


Copy code block
curl -G https://api.twilio.com/2010-04-01/Accounts \
  -u $YOUR_API_KEY:$YOUR_API_KEY_SECRET
The user remains logged in for the duration of the request. Learn more about how Twilio handles authentication.

Using your Account SID and Auth Token


Twilio recommends using only API keys for production applications. If a bad actor gains access to your Account SID and Auth Token, then your Twilio Account is compromised.

For local testing, you can use your Account SID as the username and your Auth token as the password. You can find your Account SID and Auth Token in the Twilio Console
, under the Account Dashboard.


Copy code block
curl -G https://api.twilio.com/2010-04-01/Accounts \
  -u $YOUR_ACCOUNT_SID:$YOUR_AUTH_TOKEN
Twilio helper libraries


A Twilio helper library is a server-side SDK that helps you use Twilio's REST APIs, generate TwiML, and perform other common server-side programming tasks. All Twilio helper libraries come with a Utilities class that validates requests by passing your credentials to the library.

HTTP Methods


The Twilio APIs are RESTful and use standard HTTP methods to interact with resources. The following are the most common methods:

POST: Create or update a resource.
GET: Retrieve a resource.
DELETE: Delete a resource.
POST
GET: List messages
GET: Retrieve a message
DELETE
POST a new SMS message

Node.js

Report code block

Copy code block
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID at twilio.com/console
// Provision API Keys at twilio.com/console/runtime/api-keys
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const client = twilio(apiKey, apiSecret, { accountSid: accountSid });

async function createMessage() {
  const message = await client.messages.create({
    body: "Hello",
    from: "+14155552344",
    to: "+15558675310",
  });

  console.log(message.body);
}

createMessage();
Response

Copy response
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "api_version": "2010-04-01",
  "body": "Hello",
  "date_created": "Thu, 24 Aug 2023 05:01:45 +0000",
  "date_sent": "Thu, 24 Aug 2023 05:01:45 +0000",
  "date_updated": "Thu, 24 Aug 2023 05:01:45 +0000",
  "direction": "outbound-api",
  "error_code": null,
  "error_message": null,
  "from": "+14155552344",
  "num_media": "0",
  "num_segments": "1",
  "price": null,
  "price_unit": null,
  "messaging_service_sid": "MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sid": "SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "queued",
  "subresource_uris": {
    "media": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages/SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media.json"
  },
  "tags": {
    "campaign_name": "Spring Sale 2022",
    "message_type": "cart_abandoned"
  },
  "to": "+15558675310",
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages/SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"
}
Content type


Twilio's APIs expect the API request content type to be application/x-www-form-urlencoded or multipart/form-data. Using an unsupported content type might cause unexpected behavior or errors.

Vanity URLs


Twilio doesn't support CNAMEs for unauthenticated access to HTTP Voice recording media URLs. Use HTTPS endpoints and Transport-Layer-Security (TLS) protocols when accessing voice recordings media files from your account. For more information, see the Changelog
.

How the Twilio APIs handle webhooks


Webhooks are user-defined HTTP callbacks triggered by an event in a web application. Twilio uses webhooks to let your application know when events happen, like getting an incoming call or receiving an SMS message. Webhooks are triggered asynchronously.

When a webhook event occurs, Twilio makes an HTTP request, such as POST or GET, to the URL you configured for your webhook. Twilio's request to your application includes details of the event like the body of an incoming message or an incoming phone number. Your application can then process the event and reply to Twilio with a response containing the instructions you'd like Twilio to perform.

To handle a webhook when you use Twilio, you need to build a web application that can accept HTTP requests. Check out the Twilio Helper Libraries to get up and running quickly.