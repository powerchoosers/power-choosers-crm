Voice API Webhooks Reference
Vonage uses webhooks alongside its Voice API to enable your application to interact with the call. There are two required, and one optional, webhook endpoints:

Answer webhook is sent when a call is answered. This is for both incoming and outgoing calls.
Event webhook is sent for all the events that occur during a call. Your application can log, react to or ignore each event type.
Fallback URL is used when either the Answer or Event webhook fails or returns an HTTP error status.
Errors are also delivered to the event webhook endpoint if they occur.
For more general information, check out our webhooks guide.

Signed Webhooks
Signed webhooks are a way to verify that the request is coming from Vonage and its payload has not been tampered with during transit. Voice API, as well as Messages and Dispatch APIs, support signed callbacks by default. See Decoding signed webhooks to learn how to decode an incoming JWT signature.

Answer Webhook
When an incoming call is answered, an HTTP request is sent to the answer_url you specified when setting up the application. For outgoing calls, specify the answer_url when you make the call.

By default, the answer webhook will be a GET request but this can be overridden to POST by setting the answer_method field. For incoming calls, you configure these values when you create the application. For outgoing calls, you specify these values when making a call.

Answer webhook data fields
Field	Example	Description
to	442079460000	The number that answered the call. (This is the virtual number linked to in your application.)
from	447700900000	The number that called to. This could be a landline or mobile number, or another virtual number if the call was made programmatically.
from_user	JaneDoe	The username that called to only if the call was made using the Client SDK. In this case, from will be absent (that is, from and from_user will never both be present together).
endpoint_type	phone	The voice channel type that answered the call. Possible values are phone, sip, websocket, app, vbc.
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	A unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	A unique identifier for this conversation
region_url	https://api-ap-3.vonage.com	Regional API endpoint which should be used to control the call with REST API; see the full list of regions here
custom_data	{ "key": "value" }	A custom data object, optionally passed as parameter on the serverCall method when a call is initiated from an application using the Client SDK
Transmitting additional data with SIP headers
In addition to the above fields, you can specify any additional headers you need when using SIP Connect. Any headers provided must start with X- and will be sent to your answer_url with a prefix of SipHeader_. For example, if you add a header of X-UserId with a value of 1938ND9, Vonage will add SipHeader_X-UserId=1938ND9 to the request made to your answer_url.

Warning: Headers that start with X-Nexmo will not be sent to your answer_url

Answer webhook data field examples
For a GET request, the variables will be in the URL, like this:


/answer.php?to=442079460000&from=447700900000&conversation_uuid=CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab&uuid=aaaaaaaa-bbbb-cccc-dddd-0123456789ab&SipHeader_X-UserId=1938ND9
If you set the answer_method to POST then you will receive the request with JSON format data in the body:


{
  "from": "442079460000",
  "to": "447700900000",
  "uuid": "aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
  "conversation_uuid": "CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
  "SipHeader_X-UserId": "1938ND9"
}
Responding to the answer webhook
Vonage expect you to return an NCCO in JSON format containing the actions to perform.

Event webhook
Event webhook HTTP requests will arrive at the event webhook endpoint when there is any status change for a call. The URL will be the event_url you specified when creating your application unless you override it by setting a specific event_url when starting a call.

By default, the incoming requests are POST requests with a JSON body. You can override the method to GET by configuring the event_method in addition to the event_url. It is expected that your system will respond to the HTTP request. If your system doesn't acknowledge the event or instead responds with a 429, 502, 503 or a 504 a retry will be attempted. For events that require a NCCO to be returned, the fallback URL will then be used. Refer to the fallback URL section for further details.

The format of the data included depends on which event has occurred:

started
ringing
answered
busy
cancelled
unanswered
disconnected
rejected
failed
human/machine
timeout
completed
record
input
transfer
Started
Indicates that the call has been created.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	started	Call status
direction	outbound	Call direction, can be either inbound or outbound
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Ringing
The call destination is ringing.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	ringing	Call status
direction	outbound	Call direction, can be either inbound or outbound
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Answered
The call was answered.

Field	Example	Description
start_time	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
rate	0.12	Cost of the call in Euros
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	answered	Call status
direction	inbound	Call direction, can be either inbound or outbound
network	null	Type of network that was used in the call
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Busy
The destination is on the line with another caller.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	busy	Call status
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Cancelled
An outgoing call is cancelled by the originator before being answered.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	cancelled	Call status
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Unanswered
Either the recipient is unreachable or the recipient declined the call.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	unanswered	Call status
detail	unavailable	Indicates if the subscriber is temporarily unavailable (unavailable) or the carrier could not produce a response within a suitable amount of time (timeout)
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Disconnected
If the WebSocket connection is terminated from the application side for any reason then the disconnected event callback will be sent, if the response contains an NCCO then this will be processed, if no NCCO is present then normal execution will continue.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	disconnected	Call status
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Rejected
The call was rejected by Vonage before it was connected.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	rejected	Call status
detail	restricted	Indicates if to or from numbers are invalid (invalid_number), the call rejected by carrier (restricted) or rejected by callee (declined)
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Failed
The outgoing call could not be connected.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	failed	Call status
detail	cannot_route	Indicates the destination is not supported or blocked for the account (cannot_route), the number is not available (number_out_of_service) or a server error occurred (internal_error)
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Human / Machine
For an outbound call made programmatically, if the machine_detection option is set then an event with a status of human or machine will be sent depending whether a person answered the call or not.

Field	Example	Description
call_uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call (Note call_uuid, not uuid as in some other endpoints)
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
status	human	Call status, can be either human if a person answered or machine if the call was answered by voicemail or another automated service
sub_state	beep_start	Advanced machine detection status, when call is answered by voicemail, or fax machine, and the beep is detected. Possible values are beep_start for voicemail, fax for fax machine and beep_timeout.
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Timeout
If the duration of the ringing phase exceeds the specified ringing_timeout duration, this event will be sent.

Field	Example	Description
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	timeout	Call status
direction	outbound	Call direction, this will be outbound in this context
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Completed
The call is over, this event also includes summary data about the call.

Field	Example	Description
end_time	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
network	GB-FIXED	The type of network that was used in the call
duration	2	Call length (in seconds)
start_time	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
rate	0.00450000	Cost per minute of the call (EUR)
price	0.00015000	Total cost of the call (EUR)
from	442079460000	The number the call came from
to	447700900000	The number the call was made to
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
status	completed	Call status
direction	inbound	Call direction, can be either inbound or outbound
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
disconnected_by	user	Can be one of two values:
platform - The call was terminated by the Voice API platform, for example the NCCO finished its last action and call was disconnected.
user - The call was terminated by the user, for example the user hung up the call, rejected the call, or didn't answer.
Back to event webhooks list

Record
This webhook arrives when an NCCO with a "record" action has finished. When creating a record action, you can set a different eventUrl for this event to be sent to. This can be useful if you want to use separate code to handle this event type.

Field	Example	Description
start_time	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
recording_url	https://api.nexmo.com/v1/files/bbbbbbbb-aaaa-cccc-dddd-0123456789ab	Where to download the recording
size	12222	The size of the recording file (in bytes)
recording_uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	A unique identifier for this recording
end_time	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Transcription
Field	Example	Description
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
type	record	The NCCO action of type record
recording_uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	A unique identifier for this recording
status	transcribed	Transcription status
transcription_url	https://api.nexmo.com/v1/files/bbbbbbbb-aaaa-cccc-dddd-0123456789ab	The URL to the file containing the recording's transcription
Back to event webhooks list

Input
This webhook is sent by Vonage when an NCCO with an action of "input" has finished.

Field	Example	Description
from	447700900000	The number the call came from
to	447700900000	The number the call was made to
dtmf	see below	DTMF capturing results
speech	see below	Speech recognition results
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call. The property might not appear when an input reaches a DTMF timeout.
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
DTMF Capturing Results
Field	Example	Description
digits	42	The buttons pressed by the user
timed_out	true	Whether the DTMF input timed out: true if it did, false if not
Speech Recognition Results
Field	Example	Description
timeout_reason	end_on_silence_timeout	Indicates if the input ended when user stopped speaking (end_on_silence_timeout), by max duration timeout (max_duration) or if the user didn't say anything (start_timeout)
results	see below	Array of recognized text objects
error	ERR1: Failed to analyze audio	Error message.
recording_url	https://api-us.nexmo.com/v1/files/eeeeeee-ffff-0123-4567-0123456789ab	Speech recording. Included if saveAudio flag is set to true in the input action. Requires JWT authorization for downloading, see Download a recording.
 Transcript text
Field	Example	Description
text	sales	Transcript text representing the words that the user spoke.
confidence	0.9405097	The confidence estimate between 0.0 and 1.0. A higher number indicates an estimated greater likelihood that the recognized words are correct.
See also complete example payload shown in NCCO Reference

Back to event webhooks list

Transfer
This webhook is sent by Vonage when a leg has been transferred from one conversation to another. This can be done using an NCCO or the transfer action

Field	Example	Description
conversation_uuid_from	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The conversation ID that the leg was originally in
conversation_uuid_to	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The conversation ID that the leg was transferred to
uuid	aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this call
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)
Back to event webhooks list

Fallback URL
The fallback webhook is accessed when either the answer webhook or the event webhook, when the event is expected to respond with an NCCO, returns an HTTP error status or is unreachable. The data that is returned from the fallback URL is the same as would be received in the original answer URL or event URL, with the addition of two new parameters, reason and original_request:


{
  "reason": "Connection closed.",
  "original_request": {
    "url": "https://api.example.com/webhooks/event",
    "type": "event"
  }
}
If there was a connection closed or reset, timeout or an HTTP status code of 429, 503 or 504 during the initial NCCO the answer_url is attempted twice, then:

Attempt to reach the fallback_answer_url twice
If no success, then the call is terminated
If there was a connection closed or reset, timeout or an HTTP status code of 429, 503 or 504 during a call in progress the event_url for events that are expected to return an NCCO (e.g. return for an input or notify action) is attempted twice, then:

Attempt to reach the fallback_answer_url twice
If no success, continue the call flow
Errors
The event endpoint will also receive webhooks in the event of an error. This can be useful when debugging your application.

Field	Example	Description
reason	Syntax error in NCCO. Invalid value type or action.	Information about the nature of the error
conversation_uuid	CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab	The unique identifier for this conversation
timestamp	2020-01-01T12:00:00.000Z	Timestamp (ISO 8601 format)