Voice JavaScript SDK: Twilio in the browserRecord Phone Calls in Node.js


In this guide we'll show you how to use Programmable Voice
 to record phone calls with your Node.js web application. You can tell Twilio to record part of a phone call or the entire thing. The code snippets in this guide are written using modern JavaScript language features in Node.js version 6 or higher, and make use of the following modules:

Express
body-parser
Twilio Node.js SDK
Let's get started!

Set up your web application


Incoming Voice.
Expand image
When a phone number you have bought through Twilio receives an incoming call, Twilio will send an HTTP request to a server you control, asking for instructions on how to handle the call. Your server will respond with an XML document containing TwiML that tells Twilio to read out a message, play an MP3 file, make a recording, and much more.

To start answering phone calls, you must:

Buy and configure a Twilio-powered phone number
 capable of making and receiving phone calls, and point it at your web application
Write web application code to tell Twilio how to handle the incoming call (using TwiML)
Make your web application accessible on the Internet so Twilio can send you a webhook request when you receive a call
(warning)
Warning
If you are sending SMS messages to the U.S. or Canada, before proceeding further, be aware of updated restrictions on the use of Toll-Free numbers for messaging, including TF numbers obtained by purchasing them. These restrictions do not apply to Voice or other uses outside of SMS messaging. See this support article
 for details.

Buy and configure a phone number


In the console
, you can search for and buy phone numbers in dozens of different countries, capable of calling (and being called by) just about every phone on the planet.

Search for voice capable numbers.
Expand image
Once you purchase a number, you'll need to configure that number to send a request to your web application. This callback mechanism is called a webhook
. This can be done in the number's configuration page.

configure an incoming phone number URL.
Expand image
What's a Webhook?


A webhook
 is a callback mechanism that allows two systems to communicate events to one another over the Internet using HTTP requests. In this case, Twilio is sending a webhook request to your web application whenever a phone number you control receives an incoming call. You'll see this webhook mechanism used in many Twilio APIs for handling event notifications like this.

Not working on a server with a public URL? We'll show you how to expose your local development machine to the public Internet later in this guide. Next, you'll need to write some server-side code that will be executed when an incoming call comes in.

Record part of a phone call


Now comes the fun part - writing code that will handle an incoming HTTP request from Twilio!

In this example we'll use the Express web framework
 for Node.js to respond to Twilio's request and we'll use TwiML to tell Twilio how to handle the call.

Record part of an incoming call

Node.js

Report code block

Copy code block
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();

// Returns TwiML which prompts the caller to record a message
app.post('/record', (request, response) => {
  // Use the Twilio Node.js SDK to build an XML response
  const twiml = new VoiceResponse();
  twiml.say('Hello. Please leave a message after the beep.');

  // Use <Record> to record the caller's message
  twiml.record();

  // End the call with <Hangup>
  twiml.hangup();

  // Render the response as XML in reply to the webhook request
  response.type('text/xml');
  response.send(twiml.toString());
});

// Create an HTTP server and listen for requests on port 3000
app.listen(3000);
TwiML is a set of XML tags that tell Twilio how to handle an incoming call (or SMS). In this example we tell Twilio to read some instructions to the caller and then record whatever the caller says next.

You can listen to your recordings in your Twilio Console or access them directly through Twilio's REST API.

Transcribing a recording


You can also tell Twilio to transcribe a recording, giving you a text representation of what the caller said.

Record and transcribe an incoming call

Node.js

Report code block

Copy code block
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();

// Returns TwiML which prompts the caller to record a message
app.post('/record', (request, response) => {
  // Use the Twilio Node.js SDK to build an XML response
  const twiml = new VoiceResponse();
  twiml.say('Hello. Please leave a message after the beep.');

  // Use <Record> to record and transcribe the caller's message
  twiml.record({ transcribe: true, maxLength: 30 });

  // End the call with <Hangup>
  twiml.hangup();

  // Render the response as XML in reply to the webhook request
  response.type('text/xml');
  response.send(twiml.toString());
});

// Create an HTTP server and listen for requests on port 3000
app.listen(3000);
Here we add "transcribe: true" to our response to tell Twilio to transcribe the recording after it's complete. We also pass a "maxLength" argument to limit the length of the recording (it defaults to an hour).

Check out the <Record> reference docs to see all the parameters you can use to customize your recordings.

Record an entire outgoing call


When you make outgoing calls with the Twilio REST API, you can tell Twilio to record the entire call from beginning to end.

Grab your Twilio account credentials


First, you'll need to get your Twilio account credentials. They can be found on the home page of the console.

console credentials.
Expand image
Make and record an outbound call


Just pass an extra "record" argument to "client.calls.create()" and Twilio will record the entire phone call.

Record an outbound call

Node.js

Report code block

Copy code block
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createCall() {
  const call = await client.calls.create({
    from: "+15017122661",
    record: true,
    to: "+14155551212",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

createCall();
Response

Copy response
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+15017122661",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json"
  },
  "to": "+14155551212",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
Once the call is complete, you can listen to your recordings in your Twilio Console
 or access them directly through Twilio's REST API.

You can also gain access to the recording as soon as the call is complete by including a recordingStatusCallback with your client.calls.create method. When your recording is ready, Twilio will send a request to the URL you specified, and that request will include a link to the recording's audio file.

You can learn more about the RecordingStatusCallback parameter in the Call Resource API documentation.

Where to next?


If this guide was helpful, you might also want to check out these tutorials for Programmable Voice and Node.js. Tutorials walk through full sample applications, implementing Twilio use cases like these:

Automated phone surveys
Call tracking and lead attribution
Click to call
Happy hacking!