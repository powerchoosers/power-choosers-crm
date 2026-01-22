Conversational Intelligence API Overview


The Conversational Intelligence API allows you to analyze and extract actionable business intelligence from conversations between your customers and agents using artificial intelligence and machine learning technologies.

This REST API lets you start conversation analysis services, generate transcripts, and manage webhooks that send information to your application while Intelligence Services extracts meaningful data.

Base URL for API


All endpoints in the Conversational Intelligence API reference documentation use the following base URL:


Copy code block
https://intelligence.twilio.com/v2
The API is served over HTTPS. To ensure data privacy, it doesn't support unencrypted HTTP. It provides all responses in JSON format.

API resources overview


The Conversational Intelligence API includes these resources:

Service resource

Service resource: Create, initialize, and manage Intelligence Services.
OperatorAttachment subresource: Create and delete Operator Attachments from a Service.
OperatorAttachments subresource: Fetch Operator Attachments associated with a Service.
Transcript resource

Transcript resource: Generate and manage conversation Transcripts.
Transcript Media subresource: Access recording media associated with a Transcript.
Transcript OperatorResults subresource: Get the list of OperatorResults for a transcript.
Transcript Sentence subresource: List the Sentences of a Transcript.
Operator resource

Operator resource: Retrieve the details of a Pre-built or Custom Operator.
PrebuiltOperator subresource: Fetch and list Pre-built Operators.
CustomOperator subresource: Create, fetch, list, update, and delete Custom Operators.
OperatorType resource

OperatorType resource: Get the details of an OperatorType.
Authenticate API requests


To authenticate requests to the Twilio APIs, Twilio supports HTTP Basic authentication
. Use your API key as the username and your API key secret as the password. You can create an API key either in the Twilio Console or using the API.

Note: Twilio recommends using API keys for authentication in production apps. For local testing, you can use your Account SID as the username and your Auth token as the password. You can find your Account SID and Auth Token in the Twilio Console
.

Learn more about Twilio API authentication.

Restricted API keys


You can use Restricted API keys with Conversational Intelligence for fine-grained control over API resources. For example, you can provide permissions for an API key to only modify Intelligence Service resources, but not access potentially-sensitive information such as unredacted Transcript Media subresources, Transcript resources, or Transcript OperatorResults subresources.

For more information on Twilio's REST API, refer to the Usage documentation on sending requests, API responses, and security.

Rate limiting


Conversational Intelligence API endpoints are rate limited. You should follow the REST API Best Practices, and implement retries with exponential backoff to properly handle the API response Error 429 "Too Many Requests"
 for high-volume workloads.

Need some help?
We all do sometimes; code is hard. Get help now from our support team
, or lean on the wisdom of the crowd by browsing the Twilio tag
 on Stack Overflow.

Terms of service
Privacy Poli