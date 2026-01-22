Conversational Intelligence - Transcript Resource


A Conversational Intelligence Transcript resource represents a transcribed voice conversation. To initiate the transcription process of a specific recording's audio, you'll need to call the Create a new Conversational Intelligence Transcript endpoint. You can transcribe recordings created by Twilio or those that are externally created or stored.

If automatic transcription is enabled, Twilio creates a Conversational Intelligence Transcript resource whenever a Voice call within your Account has been recorded.

A Transcript resource contains links to the associated subresources:

The Transcript Sentence subresource contains the recording's transcribed sentences.
The Transcript Media subresource includes the URL of the recording's media file.
The Transcript OperatorResults subresource contains the results from the Intelligence Service's Language Operators.
Audio channel formats


Conversational Intelligence supports various audio formats, each suited for different needs:

Mono: A single audio channel, suitable for straightforward recordings where speaker differentiation isn't crucial.
Stereo: Two channels providing spatial sound, but not specifically separating speakers.
Dual-Channel: Two distinct audio tracks in the same file, ideal for differentiating speakers such as agents and customers in call recordings. This format enhances transcription accuracy and participant differentiation.
We recommend using dual-channel recordings to improve transcription accuracy, especially in scenarios requiring speaker differentiation.

Conversational Intelligence Transcript properties


Property nameTypeRequiredDescriptionChild properties
accountSid
SID<AC>
Optional
Not PII
The unique SID identifier of the Account.

Pattern:
^AC[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
serviceSid
SID<GA>
Optional
Not PII
The unique SID identifier of the Service.

Pattern:
^GA[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
sid
SID<GT>
Optional
Not PII
A 34 character string that uniquely identifies this Transcript.

Pattern:
^GT[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
dateCreated
string<date-time>
Optional
Not PII
The date that this Transcript was created, given in ISO 8601 format.

dateUpdated
string<date-time>
Optional
Not PII
The date that this Transcript was updated, given in ISO 8601 format.

status
enum<string>
Optional
Not PII
The Status of this Transcript. One of queued, in-progress, completed, failed or canceled.

Possible values:
queued
in-progress
completed
failed
canceled
channel
Optional
Not PII
Media Channel describing Transcript Source and Participant Mapping

dataLogging
boolean
Optional
Not PII
Data logging allows Twilio to improve the quality of the speech recognition & language understanding services through using customer data to refine, fine tune and evaluate machine learning models. Note: Data logging cannot be activated via API, only via www.twilio.com, as it requires additional consent.

languageCode
string
Optional
Not PII
The default language code of the audio.

customerKey
string
Optional
Not PII
mediaStartTime
string<date-time>
Optional
Not PII
The date that this Transcript's media was started, given in ISO 8601 format.

duration
integer
Optional
Not PII
The duration of this Transcript's source

Default:
0
url
string<uri>
Optional
Not PII
The URL of this resource.

redaction
boolean
Optional
Not PII
If the transcript has been redacted, a redacted alternative of the transcript will be available.

links
object<uri-map>
Optional
Not PII
Channel object


The Channel parameter object contains information about the conversational media used for the transcription. The table below describes the properties of the Channel object. Click Show child properties to show the details on each property.

Channel parameter properties
Property nameTypeRequiredDescriptionChild properties
channel
object
Optional
Not PII
Object representing the media associated with the transcript. It has information about the source of the transcript and its participants.

Show channel properties
Create a new Transcript


POST https://intelligence.twilio.com/v2/Transcripts

(information)
Info
When you use automatic transcription, you don't need this API request to create new Conversational Intelligence Transcripts.

Request body parameters


Encoding type:application/x-www-form-urlencoded
Schema
Example
Property nameTypeRequiredDescriptionChild properties
serviceSid
SID<GA>
required
Not PII
The unique SID identifier of the Service.

Pattern:
^GA[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
channel
required
Not PII
JSON object describing Media Channel including Source and Participants

customerKey
string
Optional
Not PII
Used to store client provided metadata. Maximum of 64 double-byte UTF8 characters.

mediaStartTime
string<date-time>
Optional
Not PII
The date that this Transcript's media was started, given in ISO 8601 format.

Channel parameter


The Channel parameter object contains information about the conversational media used for the transcription.

The table below describes the properties of the Channel parameter object. Click Show child properties to show the media_properties and participants fields.

Channel parameter properties
Property nameTypeRequiredDescriptionChild properties
channel
object
Optional
Not PII
Object representing the media associated with the transcript. It has information about the source of the transcript and its participants.

Show channel properties
CustomerKey parameter


You can optionally provide a CustomerKey parameter to map a Transcript to an internal identifier known within your system. This unique identifier helps track the Transcript, and it's included in webhook callback when the results for Transcripts and Operators are available. Note that CustomerKey doesn't replace the Transcript SID in Conversational Intelligence API calls.

Transcribe a Twilio Recording


To transcribe Recordings made via Twilio and stored within Twilio's infrastructure, provide the Recording SID in the Channel object's media_properties.source_sid property as shown below. REXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX represents a Recording SID.

In this scenario, the Channel information appears as follows:


Copy code block
{
     "media_properties":{
        "source_sid": "REXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
     }
}
Create a Conversational Intelligence Transcript from a Twilio Recording

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

async function createTranscript() {
  const transcript = await client.intelligence.v2.transcripts.create({
    channel: {
      media_properties: {
        source_sid: "REXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      },
    },
    serviceSid: "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  console.log(transcript.accountSid);
}

createTranscript();
Response

Copy response
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "service_sid": "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sid": "GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "date_created": "2010-08-31T20:36:28Z",
  "date_updated": "2010-08-31T20:36:28Z",
  "status": "queued",
  "channel": {
    "media_properties": {
      "media_url": "http://foobar.test/ClusterTests/call1.wav"
    }
  },
  "data_logging": false,
  "language_code": "en-US",
  "media_start_time": null,
  "duration": 0,
  "customer_key": "aaaaaaaa",
  "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "redaction": true,
  "links": {
    "sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences",
    "encrypted_sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences/Encrypted",
    "media": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media",
    "operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults",
    "encrypted_operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults/Encrypted"
  }
}
Limits for Twilio Recording transcriptions
The recording file size must not exceed 3GB.
Audio duration can't exceed eight hours.
Recordings shorter than two seconds aren't transcribed.
Transcripts are indexed and available for search for 90 days.
You can create only one Conversational Intelligence Transcript resource for a given Recording resource. To re-transcribe a Recording, delete the original Conversational Intelligence Transcript resource and create a new one.
To create Transcripts for Twilio Recordings in external storage, use the MediaUrl parameter. The SourceSid parameter isn't supported for externally-stored Twilio Recordings.
You can't create Conversational Intelligence Transcripts from encrypted Voice Recordings, because Conversational Intelligence can't decrypt those resources. You should move those recordings to your own external storage and generate pre-signed URLs for the decrypted recordings. Once you've done that, you can follow the instructions in the "Transcribe an external recording" section below.
Transcribe an external recording


To transcribe a recording stored externally, for example, a recording stored in your own S3 bucket, provide the recording's URL in the Channel object's media_properties.media_url property.

The following limitations apply when transcribing an external recording (specified by a MediaUrl):

You must make external recordings stored in Twilio Assets public.
Basic authentication on MediaUrls isn't supported for external recordings. If you store the recordings on S3, use a presigned URL
. And when storing them on Azure Blob Storage, use a Shared Access Signature (SAS)
.
MediaUrls that respond with a non-200 HTTP status code will result in a failed request.
Requests to access external recordings are performed once. There is currently no retry behavior.
Transcribe a Twilio Video recording


To transcribe the audio of a Twilio Video recording, it needs additional processing to become compatible with Conversational Intelligence.

First, create a dual-channel audio recording by transcoding a separate audio-only composition for each participant in the Video Room.

Create a dual-channel audio recording

Copy code block
curl -X POST "https://video.twilio.com/v1/Compositions" \ --data-urlencode "AudioSources=PAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
\ --data-urlencode "StatusCallback=https://www.example.com/callbacks"
\ --data-urlencode "Format=mp4"
\ --data-urlencode "RoomSid=RMXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
\ -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
Next, download the media from these compositions and merge them into a single stereo audio file.

Download the Video Room Media

Copy code block
ffmpeg -i speaker1.mp4 -i speaker2.mp4 -filter_complex "[0:a][1:a]amerge=inputs=2[a]" -map "[a]" -f flac -bits_per_raw_smaple 16 -ar 441000 output.flac
If the recording duration for each participant differs, you can avoid overlapping audio tracks. Use ffmpeg to create a single-stereo audio track with delay to cover the difference in track length. For example, if one audio track lasts 63 seconds and the other 67 seconds, use ffmpeg to create a stereo file with the first track, with four seconds of delay to match the length of the second track.

Create a single stereo audio track

Copy code block
ffmpeg -i speaker1.wav -i speaker2.wav -filter_complex "aevalsrc=0:d=${second_to_delay}[s1];[s1][1:a]concat=n=2:v=0:a=1[ac2];[0:a]apad[ac1];[ac1][ac2]amerge=2[a]" -map "[a]" -f flac -bits_per_raw_sample 16 -ar 441000 output.flac
Finally, use the Create a new Conversational Intelligence Transcript endpoint with the Channel parameter's media_properties.media_url property set to a publicly accessible URL of the audio file.

Supported media
Recordings must be publicly accessible during transcription. The recordings can be hosted or used on a time-limited pre-signed URL. To share a recording on an existing AWS S3 bucket, read the "Sharing objects with pre-signed URLs" guide from AWS
.

Twilio attempts to download an external recording for up to 10 minutes. After 10 minutes, the transcription fails.

You can't transcribe encrypted recordings.

Conversational Intelligence doesn't perform speaker diarization on recordings, meaning it doesn't differentiate between different speakers. Additionally, using mono recordings can lead to reduced transcription accuracy. For improved transcription accuracy and participant differentiation, use dual-channel recordings.

Conversational Intelligence supports both mono and stereo audio formats for the following media formats:

WAV (PCM-encoded)
MP3
FLAC
The following limits apply to the media files:

The maximum file size allowed is 3GB.
The maximum audio length is eight hours.
The minimum sample rate required is 8kHz (telephony grade). For best results, use 16KHz.
In this scenario, the Channel information appears as follows:


Copy code block
{
     "media_properties":{
        "media_url": "http://www.example.com/recording/call.wav"
     }
}
Create a Conversational Intelligence Transcript from an external media file

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

async function createTranscript() {
  const transcript = await client.intelligence.v2.transcripts.create({
    channel: {
      media_properties: {
        media_url: "https://example.com/your-recording.wav",
      },
    },
    serviceSid: "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  console.log(transcript.accountSid);
}

createTranscript();
Response

Copy response
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "service_sid": "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sid": "GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "date_created": "2010-08-31T20:36:28Z",
  "date_updated": "2010-08-31T20:36:28Z",
  "status": "queued",
  "channel": {
    "media_properties": {
      "media_url": "http://foobar.test/ClusterTests/call1.wav"
    }
  },
  "data_logging": false,
  "language_code": "en-US",
  "media_start_time": null,
  "duration": 0,
  "customer_key": "aaaaaaaa",
  "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "redaction": true,
  "links": {
    "sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences",
    "encrypted_sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences/Encrypted",
    "media": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media",
    "operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults",
    "encrypted_operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults/Encrypted"
  }
}
(warning)
Warning
If you include both MediaUrl and SourceSid in the Transcript creation request, Twilio uses the MediaUrl.

Specify participant information


By default, Conversational Intelligence labels the left channel (channel one) as Agent and the right channel (channel two) as Customer. Depending on your call flow and the recorded call leg, this may not accurately reflect the participant/channel relationships on your recording. If needed, specify which participant is on a given channel via the Channel parameter's participants array.

(warning)
Warning
If the default behavior doesn't align with your application's recording implementation, you can do one of the following:

Update your application's logic to ensure the "Agent" is always on the first channel. For two-party voice calls, that's the first call leg. For Conferences, that's the first Participant that joined the recorded Conference.
If your application logic places all "Agents" on channel 2 and all "Customers" on channel 1, reach out to Twilio Support to invert the Agent/Customer Conversational Intelligence labeling at the Account level. This affects all recordings within that Account.
Specify Participant information in the request to create a Transcript. Use this only if the first two options aren't feasible for your application. See below for how to do this.
Only two participants can be overridden in the Channel object of the Transcript resource.

The code sample below demonstrates an example request that overrides the default Conversational Intelligence labels.

Customize participant labels when creating a new Transcript

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

async function createTranscript() {
  const transcript = await client.intelligence.v2.transcripts.create({
    channel: {
      media_properties: {
        media_url: "https://example.com/your-recording",
      },
      participants: [
        {
          user_id: "id1",
          channel_participant: 1,
          media_participant_id: "+1555959545",
          email: "veronica.meyer@example.com",
          full_name: "Veronica Meyer",
          image_url:
            "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
          role: "Customer",
        },
        {
          user_id: "id2",
          channel_participant: 2,
          media_participant_id: "+1555959505",
          email: "lauryn.trujillo@example.com",
          full_name: "Lauryn Trujillo",
          image_url:
            "https://images.unsplash.com/photo-1554384645-13eab165c24b",
          role: "Agent",
        },
      ],
    },
    serviceSid: "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  console.log(transcript.accountSid);
}

createTranscript();
Response

Copy response
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "service_sid": "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sid": "GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "date_created": "2010-08-31T20:36:28Z",
  "date_updated": "2010-08-31T20:36:28Z",
  "status": "queued",
  "channel": {
    "media_properties": {
      "media_url": "http://foobar.test/ClusterTests/call1.wav"
    }
  },
  "data_logging": false,
  "language_code": "en-US",
  "media_start_time": null,
  "duration": 0,
  "customer_key": "aaaaaaaa",
  "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "redaction": true,
  "links": {
    "sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences",
    "encrypted_sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences/Encrypted",
    "media": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media",
    "operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults",
    "encrypted_operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults/Encrypted"
  }
}
Fetch a Conversational Intelligence Transcript resource


GET https://intelligence.twilio.com/v2/Transcripts/{Sid}

(information)
Info
Use the webhook callback to know when a Create a new Conversational Intelligence Transcript request has completed and when the results are available. This is preferable to polling the Fetch a Conversational Intelligence Transcript endpoint.

The webhook callback URL can be configured on the Intelligence Service's settings.

Path parameters


Property nameTypeRequiredPIIDescription
sid
SID<GT>
required
Not PII
A 34 character string that uniquely identifies this Transcript.

Pattern:
^GT[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
Fetch a Transcript

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

async function fetchTranscript() {
  const transcript = await client.intelligence.v2
    .transcripts("GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    .fetch();

  console.log(transcript.accountSid);
}

fetchTranscript();
Response

Copy response
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "service_sid": "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sid": "GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "date_created": "2010-08-31T20:36:28Z",
  "date_updated": "2010-08-31T20:36:28Z",
  "status": "queued",
  "channel": {},
  "data_logging": false,
  "language_code": "en-US",
  "media_start_time": null,
  "duration": 0,
  "customer_key": null,
  "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "redaction": true,
  "links": {
    "sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences",
    "encrypted_sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences/Encrypted",
    "media": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media",
    "operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults",
    "encrypted_operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults/Encrypted"
  }
}
Fetch multiple Conversational Intelligence Transcript resources


GET https://intelligence.twilio.com/v2/Transcripts

Query parameters


Property nameTypeRequiredPIIDescription
serviceSid
SID<GA>
Optional
Not PII
The unique SID identifier of the Service.

Pattern:
^GA[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
beforeStartTime
string
Optional
Not PII
Filter by before StartTime.

afterStartTime
string
Optional
Not PII
Filter by after StartTime.

beforeDateCreated
string
Optional
Not PII
Filter by before DateCreated.

afterDateCreated
string
Optional
Not PII
Filter by after DateCreated.

status
string
Optional
Not PII
Filter by status.

languageCode
string
Optional
Not PII
Filter by Language Code.

sourceSid
string
Optional
Not PII
Filter by SourceSid.

pageSize
integer<int64>
Optional
Not PII
How many resources to return in each list page. The default is 50, and the maximum is 1000.

Minimum:
1
Maximum:
1000
page
integer
Optional
Not PII
The page index. This value is simply for client state.

Minimum:
0
pageToken
string
Optional
Not PII
The page token. This is provided by the API.

List multiple Transcripts

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

async function listTranscript() {
  const transcripts = await client.intelligence.v2.transcripts.list({
    limit: 20,
  });

  transcripts.forEach((t) => console.log(t.accountSid));
}

listTranscript();
Response

Copy response
{
  "transcripts": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "service_sid": "GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sid": "GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "date_created": "2010-08-31T20:36:28Z",
      "date_updated": "2010-08-31T20:36:28Z",
      "status": "queued",
      "channel": {},
      "data_logging": false,
      "language_code": "en-US",
      "media_start_time": null,
      "duration": 0,
      "customer_key": null,
      "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "redaction": true,
      "links": {
        "sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences",
        "encrypted_sentences": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences/Encrypted",
        "media": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Media",
        "operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults",
        "encrypted_operator_results": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/OperatorResults/Encrypted"
      }
    }
  ],
  "meta": {
    "key": "transcripts",
    "page": 0,
    "page_size": 50,
    "first_page_url": "https://intelligence.twilio.com/v2/Transcripts?LanguageCode=en-US&SourceSid=REaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&ServiceSid=GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&AfterDateCreated=2019-11-22T23%3A46%3A00Z&PageSize=50&Page=0",
    "next_page_url": null,
    "previous_page_url": null,
    "url": "https://intelligence.twilio.com/v2/Transcripts?LanguageCode=en-US&SourceSid=REaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&ServiceSid=GAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&AfterDateCreated=2019-11-22T23%3A46%3A00Z&PageSize=50&Page=0"
  }
}
Delete a Conversational Intelligence Transcript resource


DELETE https://intelligence.twilio.com/v2/Transcripts/{Sid}

Path parameters


Property nameTypeRequiredPIIDescription
sid
SID<GT>
required
Not PII
A 34 character string that uniquely identifies this Transcript.

Pattern:
^GT[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
Delete a Transcript

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

async function deleteTranscript() {
  await client.intelligence.v2
    .transcripts("GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    .remove();
}

deleteTranscript();