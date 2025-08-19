Before you begin
What are Code Snippets?
Code snippets are short pieces of code you can reuse in your own applications. The code snippets use code from example repositories.

Please read this information carefully, so you can best use the code snippets.

Prerequisites
Before going further, you must create a Vonage account to manage applications and numbers.

Create an Application
Go to the Application's page on the Dashboard, and define a Name for your Application.

An example of brand new application
Make sure to click on the Generate public and private key button, and keep the file private.key around.

Then, enable the Voice capability. For the moment, leave everything by default.

An example of enabling Voice capabilities
Finally, click Save at the bottom of the page.

Rent a Number
In the Dashboard, go to the Buy Numbers page. Make sure to tick Voice in the search filter, and select the country you want to buy a number in.

An example of number research
You can then click the Buy button next to the number you want, and validate your purchase.

Congratulations! Your virtual number is now listed in Your Numbers

Link a Number
Now that you have both an application and a number, you need to link them together.

Go to the Application page, and click on the application you created earlier.

An example of an application
In the Voice section, click on the Link button next to the number you want to link.

Other resources:

Our blog post on how to use Ngrok.
Replaceable variables
Generic replaceable
The following replaceable information depends on the library and specific call:

Key	Description
VONAGE_API_KEY	
Your Vonage API key (see it on your dashboard).

VONAGE_API_SECRET	
Your Vonage API secret (also available on your dashboard).

VONAGE_APPLICATION_PRIVATE_KEY_PATH	
Private key path.

VONAGE_APPLICATION_PRIVATE_KEY	
Private key.

VONAGE_APPLICATION_ID	
The Vonage Application ID.

JWT	
Used to authenticate your request. See Authentication for more information, including how to generate a JWT.

Numbers
All phone numbers are in E.164 format.

Key	Description
VONAGE_VIRTUAL_NUMBER	
Your Vonage Number. E.g. 447700900000

VOICE_TO_NUMBER	
The recipient number to call, e.g. 447700900002.

UUIDs
UUIDs are typically used in the code snippets to identify a specific call.

Key	Description
VOICE_CALL_ID	
The UUID of the call leg.

Specific replaceable/variables
Some code snippets have more specialized variables that will need to be replaced by actual values. These may be specified on a per-code snippet basis.

Authentication
Voice API requires authentication using JWTs. You can generate a JWT using the Vonage CLI or the online tool.

Webhooks
The main ones you will meet here are:

/webhooks/answer - Vonage makes a GET request here when you receive an inbound call. You respond with an NCCO.
/webhooks/event - Vonage makes POST requests here when an event occurs. You receive a JSON event.
/webhooks/recordings - Vonage makes a POST request here when the recording is available. You receive a JSON object with recording details.
/webhooks/dtmf - Vonage POSTs user DTMF input here in a JSON object.
If you are using Ngrok you will set your webhook URLs in the Vonage Application object to something like:

https://demo.ngrok.io/webhooks/answer
https://demo.ngrok.io/webhooks/event
https://demo.ngrok.io/webhooks/recordings
https://demo.ngrok.io/webhooks/dtmf
Change demo in the above with whatever applies in your case.