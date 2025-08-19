NCCO reference
A Call Control Object (NCCO) is represented by a JSON array. You can use it to control the flow of a Voice API call. For your NCCO to execute correctly, the JSON objects must be valid.

While developing and testing NCCOs, you can use the Voice Playground to try out NCCOs interactively. You can read more about it in the Voice API Overview or go directly to the Voice Playground in the Dashboard.

NCCO actions
The order of actions in the NCCO controls the flow of the Call. Actions that have to complete before the next action can be executed are synchronous. Other actions are asynchronous. That is, they are supposed to continue over the following actions until a condition is met. For example, a record action terminates when the endOnSilence option is met. When all the actions in the NCCO are complete, the Call ends.

The NCCO actions and the options and types for each action are:

Action	Description	Synchronous
record	All or part of a Call	No
conversation	Create or join an existing Conversation	Yes
connect	To a connectable endpoint such as a phone number or VBC extension.	Yes
talk	Send synthesized speech to a Conversation.	Yes, unless bargeIn=true
stream	Send audio files to a Conversation.	Yes, unless bargeIn=true
input	Collect digits or capture speech input from the person you are calling.	Yes
notify	Send a request to your application to track progress through an NCCO	Yes
wait	Pause execution for a specified number of seconds	Yes
Note: Connect an inbound call provides an example of how to serve your NCCOs to Vonage after a Call or Conference is initiated.

Note that in all actions, the eventUrl parameter MUST be an array, even if it only contains a single value.

Record
Use the record action to record a Call or part of a Call:


[
  {
    "action": "record",
    "eventUrl": ["https://example.com/recordings"]
  },
  {
    "action": "connect",
    "eventUrl": ["https://example.com/events"],
    "from":"447700900000",
    "endpoint": [
      {
        "type": "phone",
        "number": "447700900001"
      }
    ]
  }
]
The record action is asynchronous. You can define a synchronous condition - endOnSilence, timeOut or endOnKey - to finish the recording when it is met. If no condition is set, the record will work in an asynchronous manner and will instantly continue on to the next action while still recording the call. The recording will only end and send the relevant event when the call is ended. This is used for scenarios similar to call monitoring.

You can transcribe a recording using the transcription option. Once the recording's transcription is complete, a callback will be sent to an eventUrl. Using the transcription settings you can specify a custom eventUrl and language for your transcriptions. Please note, this is a chargeable feature; exact rates can be found on the Voice API Pricing page under 'Programmable Features'.

For information about the workflow to follow, see Recording.

You can use the following options to control a record action:

Option	Description	Required
format	Record the Call in a specific format. Options are:
mp3
wav
ogg
The default value is mp3, or wav when recording more than 2 channels.	No
split	Record the sent and received audio in separate channels of a stereo recording—set to conversation to enable this.	No
channels	The number of channels to record (maximum 32). If the number of participants exceeds channels any additional participants will be added to the last channel in file. split conversation must also be enabled.	No
endOnSilence	Stop recording after n seconds of silence. Once the recording is stopped the recording data is sent to event_url. The range of possible values is 3<=endOnSilence<=10.	No
endOnKey	Stop recording when a digit is pressed on the handset. Possible values are: *, # or any single digit e.g. 9.	No
timeOut	The maximum length of a recording in seconds. One the recording is stopped the recording data is sent to event_url. The range of possible values is between 3 seconds and 7200 seconds (2 hours).	No
beepStart	Set to true to play a beep when a recording starts.	No
eventUrl	The URL to the webhook endpoint that is called asynchronously when a recording is finished. If the message recording is hosted by Vonage, this webhook contains the URL you need to download the recording and other meta data.	No
eventMethod	The HTTP method used to make the request to eventUrl. The default value is POST.	No
transcription [Beta]	Set to an empty object, {}, to use the default values or customize with Transcription Settings	No
Transcription Settings
Option	Description	Required
language	The language (BCP-47 format) for the recording you're transcribing. This currently supports the same languages as Automatic Speech Recording, and a list is available here.	No
eventUrl	The URL to the webhook endpoint that is called asynchronously when a transcription is finished.	No
eventMethod	The HTTP method Vonage uses to make the request to eventUrl. The default value is POST.	No
sentimentAnalysis [Developer Preview]	Perform sentiment analysis on the call recording transcription segments. Will return a value between -1 (negative sentiment) and 1 (positive sentiment) for each segment. Defaults to false.	No
Please Note: there is a 2 hour maximum limit for transcribing voice calls.

Record Return Parameters
See the Webhook Reference for record or transcription parameters which are returned to the eventUrl.

Conversation
You can use the conversation action to create standard or moderated conferences, while preserving the communication context. Using conversation with the same name reuses the same persisted Conversation. The first person to call the virtual number assigned to the conversation creates it. This action is synchronous.

Note: you can invite up to 200 people to your Conversation.

The following NCCO examples show how to configure different types of Conversation. You can use the answer_url webhook GET request parameters to ensure you deliver one NCCO to participants and another to the moderator.


[
  {
    "action": "conversation",
    "name": "nexmo-conference-standard",
    "record": true,
    "transcription": {
      "eventUrl": [ "https://example.com/transcription" ],
      "eventMethod": "POST",
      "language": "he-IL"
    }
  }
]
You can use the following options to control a conversation action:

Option	Description	Required
name	The name of the Conversation room. Names are namespaced to the application level and region.	Yes
musicOnHoldUrl	A URL to the mp3 file to stream to participants until the conversation starts. By default the conversation starts when the first person calls the virtual number associated with your Voice app. To stream this mp3 before the moderator joins the conversation, set startOnEnter to false for all users other than the moderator.	No
startOnEnter	The default value of true ensures that the conversation starts when this caller joins conversation name. Set to false for attendees in a moderated conversation.	No
endOnExit	Specifies whether a moderated conversation ends when the moderator hangs up. This is set to false by default, which means that the conversation only ends when the last remaining participant hangs up, regardless of whether the moderator is still on the call. Set endOnExit to true to terminate the conversation when the moderator hangs up.	No
record	Set to true to record this conversation. For standard conversations, recordings start when one or more attendees connects to the conversation. For moderated conversations, recordings start when the moderator joins. That is, when an NCCO is executed for the named conversation where startOnEnter is set to true. When the recording is terminated, the URL you download the recording from is sent to the event URL. You can override the default recording event URL and default HTTP method by providing custom eventUrl and eventMethod options in the conversation action definition.
By default audio is recorded in MP3 format. See the recording guide for more details.	No
canSpeak	A list of leg UUIDs that this participant can be heard by. If not provided, the participant can be heard by everyone. If an empty list is provided, the participant will not be heard by anyone	No
canHear	A list of leg UUIDs that this participant can hear. If not provided, the participant can hear everyone. If an empty list is provided, the participant will not hear any other participants	No
mute	Set to true to mute the participant. The audio from the participant will not be played to the conversation and will not be recorded. When using canSpeak, the mute parameter is not supported.	No
transcription	Transcription settings. If presented (even as empty object), transcription is activated. The record parameter must be set to true. See Transcription Settings above for more details.	No
Connect
You can use the connect action to connect a call to endpoints such as phone numbers or a VBC extension.

This action is synchronous, after a connect the next action in the NCCO stack is processed. A connect action ends when the endpoint you are calling is busy or unavailable. You ring endpoints sequentially by nesting connect actions.

The following NCCO examples show how to configure different types of connections.


[
  {
    "action": "talk",
    "text": "Please wait while we connect you"
  },
  {
    "action": "connect",
    "eventUrl": ["https://example.com/events"],
    "timeout": "45",
    "from": "447700900000",
    "endpoint": [
      {
        "type": "phone",
        "number": "447700900001",
        "dtmfAnswer": "2p02p"
      }
    ]
  }
]
You can use the following options to control a connect action:

Option	Description	Required
endpoint	Array of endpoint objects to connect to. Currently supports a maximum of one endpoint object. Available endpoint types.	Yes
from	A number in E.164 format that identifies the caller. This must be one of your Vonage virtual numbers if you're connecting to a real phone, as the call won't connect otherwise.	No
randomFromNumber	Set to true to use a random phone number as from. The number will be selected from the list of the numbers assigned to the current application. The application will try to use number(s) from the same country as the destination (if available). randomFromNumber: true cannot be used together with from. The default value is false.	No
eventType	Set to synchronous to:
make the connect action synchronous
enable eventUrl to return an NCCO that overrides the current NCCO when a call moves to specific states.
No
timeout	If the call is unanswered, set the number in seconds before Vonage stops ringing endpoint. Must be an integer between 1 and 120. The default value is 60.	No
limit	Maximum length of the call in seconds. The default and maximum value is 7200 seconds (2 hours).	No
machineDetection	Configure the behavior when Vonage detects that a destination is an answerphone. Set to either:
continue - Vonage sends an HTTP request to event_url with the Call event machine
hangup - end the Call
No
advancedMachineDetection	Configure the behavior of Vonage's advanced machine detection. Overrides machineDetection if both are set. See the API reference for parameter details. This feature is chargeable; exact rates can be found on the Voice API Pricing page under 'Programmable Features'.	No
eventUrl	Set the webhook endpoint that Vonage calls asynchronously on each of the possible Call States. If eventType is set to synchronous the eventUrl can return an NCCO that overrides the current NCCO when a timeout occurs.	No
eventMethod	The HTTP method Vonage uses to make the request to eventUrl. The default value is POST.	No
ringbackTone	A URL value that points to a ringbackTone to be played back on repeat to the caller, so they don't hear silence. The ringbackTone will automatically stop playing when the call is fully connected. It's not recommended to use this parameter when connecting to a phone endpoint, as the carrier will supply their own ringbackTone. Example: "ringbackTone": "http://example.com/ringbackTone.wav".	No
Endpoint Types and Values
Phone (PSTN) - phone numbers in E.164 format
Value	Description
type	The endpoint type: phone for a PSTN endpoint.
number	The phone number to connect to in E.164 format.
dtmfAnswer	Set the digits that are sent to the user as soon as the Call is answered. The * and # digits are respected. You create pauses using p. Each pause is 500ms.
onAnswer	A JSON object containing a required url key. The URL serves an NCCO to execute in the number being connected to, before that call is joined to your existing conversation. Optionally, the ringbackTone key can be specified with a URL value that points to a ringbackTone to be played back on repeat to the caller, so they do not hear just silence. The ringbackTone will automatically stop playing when the call is fully connected. Example: {"url":"https://example.com/answer", "ringbackTone":"http://example.com/ringbackTone.wav" }. Please note, the key ringback is still supported.
App - Connect the call to a RTC capable application
Value	Description
type	The endpoint type: app for an application.
user	The username of the user to connect to. This username must have been added as a user.
WebSocket - the WebSocket to connect to
Value	Description
type	The endpoint type: websocket for a WebSocket.
uri	The URI to the websocket you are streaming to.
content-type	the internet media type for the audio you are streaming. Possible values are: audio/l16;rate=16000 or audio/l16;rate=8000.
headers	a JSON object containing any metadata you want. See connecting to a websocket for example headers.
SIP - the SIP endpoint to connect to
Value	Description
type	The endpoint type: sip for SIP.
uri	The SIP URI to the endpoint you are connecting to in the format sip:rebekka@sip.example.com. To use TLS and/or SRTP, include respectively transport=tls or media=srtp to the URL with the semicolon ; as a delimiter, for example: sip:rebekka@sip.example.com;transport=tls;media=srtp. Note that this property is mutually exclusive with user and domain.
user	The user component of the URI. It will be used along the domain property to create the full SIP URI. If you set this property, you must also set domain and leave uri unset.
domain	The identifier for a trunk created using the dashboard. This must be a successfully provisioned domain using the SIP Trunking dashboard or the Programmable SIP API. The URIs provisioned in the trunk will be used along the user property to create the full SIP URI. So for example, if the URI in the trunk is: sip.example.com and user is example_user, Vonage will send the call to example_user@sip.example.com. If you set this property, you must leave uri unset. Note that this property refers to the domain name, not the domain URI.
headers	key => value string pairs containing any metadata you need e.g. { "location": "New York City", "occupation": "developer" }. The headers are transmitted as part of the SIP INVITE as X-key: value headers. So in the example, these headers are sent: X-location: New York City and X-occupation: developer.
standardHeaders	A JSON object containing a single key User-to-User. This is used to transmit user-to-user information if supported by the vendor, as per RFC 7433. Unlike headers, the key will not be prepended with X-, since it is standardised. For example: { "User-to-User": "342342ef34;encoding=hex" }. Vonage will not validate the content of the User-to-User header, other than making sure it using valid characters and that the content is within the maximum number of characters permitted (256).
To understand how your application can receive and handle SIP Custom Headers instead, check the following page on Programmable SIP

VBC - the Vonage Business Cloud (VBC) extension to connect to
Value	Description
type	The endpoint type: vbc for a VBC extension.
extension	the VBC extension to connect the call to.
Talk
The talk action sends synthesized speech to a Conversation.

The text provided in the talk action can either be plain, or formatted using SSML. SSML tags provide further instructions to the text-to-speech synthesizer which allow you to set pitch, pronunciation and to combine together text in multiple languages. SSML tags are XML-based and sent inline in the JSON string.

By default, the talk action is synchronous. However, if you set bargeIn to true you must set an input action later in the NCCO stack. The following NCCO examples shows how to send a synthesized speech message to a Conversation or Call:


[
  {
    "action": "talk",
    "text": "You are listening to a Call made with Voice API"
  }
]
You can use the following options to control a talk action:

Option	Description	Required
text	A string of up to 1,500 characters (excluding SSML tags) containing the message to be synthesized in the Call or Conversation. A single comma in text adds a short pause to the synthesized speech. To add a longer pause a break tag needs to be used in SSML. To use SSML tags, you must enclose the text in a speak element.	Yes
bargeIn	Set to true so this action is terminated when the user interacts with the application either with DTMF or ASR voice input. Use this feature to enable users to choose an option without having to listen to the whole message in your Interactive Voice Response (IVR). If you set bargeIn to true the next non-talk action in the NCCO stack must be an input action. The default value is false.

Once bargeIn is set to true it will stay true (even if bargeIn: false is set in a following action) until an input action is encountered	No
loop	The number of times text is repeated before the Call is closed. The default value is 1. Set to 0 to loop infinitely.	No
level	The volume level that the speech is played. This can be any value between -1 to 1 with 0 being the default.	No
language	The language (BCP-47 format) for the message you are sending. Default: en-US. Possible values are listed in the Text-To-Speech guide.	No
style	The vocal style (vocal range, tessitura and timbre). Default: 0. Possible values are listed in the Text-To-Speech guide.	No
premium	Set to true to use the premium version of the specified style if available, otherwise the standard version will be used. The default value is false. You can find more information about Premium Voices in the Text-To-Speech guide.	No
Talk Return Parameters
See Webhook Reference for the parameters which are returned to the eventUrl.

Stream
The stream action allows you to send an audio stream to a Conversation

By default, the stream action is synchronous. However, if you set bargeIn to true you must set an input action later in the NCCO stack.

The following NCCO example shows how to send an audio stream to a Conversation or Call:


[
  {
    "action": "stream",
    "streamUrl": ["https://acme.com/streams/music.mp3"]
  }
]
You can use the following options to control a stream action:

Option	Description	Required
streamUrl	An array containing a single URL to an mp3 or wav (16-bit) audio file to stream to the Call or Conversation.	Yes
level	Set the audio level of the stream in the range -1 >=level<=1 with a precision of 0.1. The default value is 0.	No
bargeIn	Set to true so this action is terminated when the user interacts with the application either with DTMF or ASR voice input. Use this feature to enable users to choose an option without having to listen to the whole message in your Interactive Voice Response (IVR ). If you set bargeIn to true on one more Stream actions then the next non-stream action in the NCCO stack must be an input action. The default value is false.

Once bargeIn is set to true it will stay true (even if bargeIn: false is set in a following action) until an input action is encountered.	No
loop	The number of times audio is repeated before the Call is closed. The default value is 1. Set to 0 to loop infinitely.	No
The audio stream referred to should be a file in MP3 or WAV format. If you have issues with the file playing, please encode it to the following technical specification: What kind of prerecorded audio files can I use?

If you play the same audio file multiple times, for example using the same recording in many calls, consider adding a Cache-Control header to the URL response with proper values.


Cache-Control: public, max-age=360000
This allows Vonage to cache your audio file instead of downloading it each time, which may significantly improve performance and user experience. Caching is supported for both HTTP and HTTPS URLs.

Stream Return Parameters
See Webhook Reference for the parameters which are returned to the eventUrl.

Input
You can use the input action to collect digits or speech input by the person you are calling. This action is synchronous, Vonage processes the input and forwards it in the parameters sent to the eventUrl webhook endpoint you configure in your request. Your webhook endpoint should return another NCCO that replaces the existing NCCO and controls the Call based on the user input. You could use this functionality to create an Interactive Voice Response (IVR). For example, if your user presses 4 or says "Sales", you return a connect NCCO that forwards the call to your sales department.

The following NCCO example shows how to configure an IVR endpoint:


[
  {
    "action": "talk",
    "text": "Please enter a digit or say something"
  },
  {
    "action": "input",
    "eventUrl": [
      "https://example.com/ivr"
    ],
    "type": [ "dtmf", "speech" ],
    "dtmf": {
      "maxDigits": 1
    },
    "speech": {
      "context": [ "sales", "support" ]
    }
  }
]
The following NCCO example shows how to use bargeIn to allow a user to interrupt a talk action. Note that an input action must follow any action that has a bargeIn property (e.g. talk or stream).


[
  {
    "action": "talk",
    "text": "Please enter a digit or say something",
    "bargeIn": true
  },
  {
    "action": "input",
    "eventUrl": [
      "https://example.com/ivr"
    ],
    "type": [ "dtmf", "speech" ],	
    "dtmf": {
      "maxDigits": 1
    },
    "speech": {
      "context": [ "sales", "support" ]
    }	
  }
]
The following options can be used to control an input action:

Option	Description	Required
type	Acceptable input type, can be set as [ "dtmf" ] for DTMF input only, [ "speech" ] for ASR only, or [ "dtmf", "speech" ] for both.	Yes
dtmf	DTMF settings.	No
speech	Speech recognition settings.	No
mode	Input processing mode, currently only applicable to DTMF. Valid values are synchronous (the default) and asynchronous. If set to asynchronous, all DTMF settings must be left blank. In asynchronous mode, digits are sent one at a time to the event webhook in real time. In the default synchronous mode, this is controlled by the DTMF settings instead and the inputs are sent in batch.	No
eventUrl	Vonage sends the digits pressed by the callee to this URL 1) after timeOut pause in activity or when # is pressed for DTMF or 2) after user stops speaking or 30 seconds of speech for speech input.	No
eventMethod	The HTTP method used to send event information to event_url The default value is POST.	No
DTMF Input Settings
Note: These settings do not apply if the mode is set to asynchronous.

Option	Description	Required
timeOut	The result of the callee's activity is sent to the eventUrl webhook endpoint timeOut seconds after the last action. The default value is 3. Max is 10.	No
maxDigits	The number of digits the user can press. The maximum value is 20, the default is 4 digits.	No
submitOnHash	Set to true so the callee's activity is sent to your webhook endpoint at eventUrl after they press #. If # is not pressed the result is submitted after timeOut seconds. The default value is false. That is, the result is sent to your webhook endpoint after timeOut seconds.	No
Speech Recognition Settings
Option	Description	Required
uuid	The unique ID of the Call leg for the user to capture the speech of, defined as an array with a single element. The first joined leg of the call by default.	No
endOnSilence	Controls how long the system will wait after user stops speaking to decide the input is completed. The default value is 2.0 (seconds). The range of possible values is between 0.4 seconds and 10.0 seconds.	No
language	Expected language of the user's speech. Format: BCP-47. Default: en-US. List of supported languages.	No
context	Array of hints (strings) to improve recognition quality if certain words are expected from the user.	No
startTimeout	Controls how long the system will wait for the user to start speaking. The range of possible values is between 1 second and 60 seconds. The default value is 10.	No
maxDuration	Controls maximum speech duration (from the moment user starts speaking). The default value is 60 (seconds). The range of possible values is between 1 and 60 seconds.	No
saveAudio	Set to true so the speech input recording (recording_url) is sent to your webhook endpoint at eventUrl. The default value is false.	No
sensitivity	Audio sensitivity used to differentiate noise from speech. An integer value where 10 represents low sensitivity and 100 maximum sensitivity. Default is 90.	No
The following example shows the parameters sent to the eventUrl webhook for DTMF input:


{
  "speech": { "results": [ ] },
  "dtmf": {
    "digits": "1234",
    "timed_out": true
  },
  "from": "15551234567",
  "to": "15557654321",
  "uuid": "aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
  "conversation_uuid": "bbbbbbbb-cccc-dddd-eeee-0123456789ab",
  "timestamp": "2020-01-01T14:00:00.000Z"
}
The following example shows the parameters sent back to the eventUrl webhook for speech input:


{
  "speech": {
    "recording_url": "https://api-us.nexmo.com/v1/files/eeeeeee-ffff-0123-4567-0123456789ab",
    "timeout_reason": "end_on_silence_timeout",
    "results": [
      {
        "confidence": "0.9405097",
        "text": "sales"
      },
      {
        "confidence": "0.70543784",
        "text": "sails"
      },
      {
        "confidence": "0.5949854",
        "text": "sale"
      }
    ]
  },
  "dtmf": {
    "digits": null,
    "timed_out": false
  },
  "from": "15551234567",
  "to": "15557654321",  
  "uuid": "aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
  "conversation_uuid": "bbbbbbbb-cccc-dddd-eeee-0123456789ab",
  "timestamp": "2020-01-01T14:00:00.000Z"
}
Input Return Parameters
See Webhook Reference for input parameters which are returned to the eventUrl.

Notify
Use the notify action to send a custom payload to your event URL. Your webhook endpoint can return another NCCO that replaces the existing NCCO or return an empty payload meaning the existing NCCO will continue to execute.


[
  {
    "action": "notify",
    "payload": {
      "foo": "bar"
    },
    "eventUrl": [
      "https://example.com/webhooks/event"
    ],
    "eventMethod": "POST"
  }
]
Option	Description	Required
payload	The JSON body to send to your event URL.	Yes
eventUrl	The URL to send events to. If you return an NCCO when you receive a notification, it will replace the current NCCO.	Yes
eventMethod	The HTTP method to use when sending payload to your eventUrl.	No
Prompts Voice Settings
Option	Description	Required
language	The language (BCP-47 format) for the prompts. Default: en-US. Possible values are listed in the Text-To-Speech guide.	No
style	The vocal style (vocal range, tessitura and timbre). Default: 0. Possible values are listed in the Text-To-Speech guide.	No
Wait
You can use the wait action to add a wait period and pause execution of the running NCCO for a specified number of seconds.

The action is synchronous. The wait period starts when the wait action is executed in the NCCO and ends after the provided or default timeout value. At this point, the NCCO resumes execution. The timeout parameter can range from 2 to 60 seconds. If not specified, it defaults to 10 seconds.

Note: if you need a callback informing that the wait action ended, add a notify action after the wait action.

The following NCCO example shows how to execute the wait action:


[
  {
    "action": "talk",
    "text": "Welcome to a Vonage moderated conference"
  },
  {
    "action": "wait",
    "timeout": 2
  },
  {
    "action": "talk",
    "text": "We will connect you when an agent is available"
  }
]
You can use the following options to control a wait action:

Option	Description	Required
timeout	Controls the duration of the wait period before executing the next action in the NCCO. The range of possible values is between 2 and 60 seconds. The default value is 10.	No