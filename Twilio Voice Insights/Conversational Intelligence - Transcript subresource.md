Conversational Intelligence - Transcript Sentence Subresource


A Transcript Sentence subresource represents a transcribed sentence from a given Conversational Intelligence Transcript.

Transcript Sentence properties


Property nameTypeRequiredDescriptionChild properties
mediaChannel
integer
Optional
Not PII
The channel number.

Default:
0
sentenceIndex
integer
Optional
Not PII
The index of the sentence in the transcript.

Default:
0
startTime
number
Optional
Not PII
Offset from the beginning of the transcript when this sentence starts.

endTime
number
Optional
Not PII
Offset from the beginning of the transcript when this sentence ends.

transcript
string
Optional
PII MTL: 30 days
Transcript text.

sid
SID<GX>
Optional
Not PII
A 34 character string that uniquely identifies this Sentence.

Pattern:
^GX[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
confidence
number
Optional
Not PII
words
array
Optional
Not PII
Detailed information for each of the words of the given Sentence.

Retrieve all Transcript Sentences for a given Transcript


GET https://intelligence.twilio.com/v2/Transcripts/{TranscriptSid}/Sentences

Path parameters


Property nameTypeRequiredPIIDescription
transcriptSid
SID<GT>
required
Not PII
The unique SID identifier of the Transcript.

Pattern:
^GT[0-9a-fA-F]{32}$
Min length:
34
Max length:
34
Query parameters


Property nameTypeRequiredPIIDescription
redacted
boolean
Optional
Not PII
Grant access to PII Redacted/Unredacted Sentences. If redaction is enabled, the default is true to access redacted sentences.

wordTimestamps
boolean
Optional
Not PII
Returns word level timestamps information, if word_timestamps is enabled. The default is false.

pageSize
integer<int64>
Optional
Not PII
How many resources to return in each list page. The default is 50, and the maximum is 5000.

Minimum:
1
Maximum:
5000
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

The GET request shown below returns a list of Transcript Sentences for a given Transcript, with the WordTimestamps query parameter set to true.

Retrieve all Transcript Sentences for a Transcript

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

async function listSentence() {
  const sentences = await client.intelligence.v2
    .transcripts("GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    .sentences.list({ limit: 20 });

  sentences.forEach((s) => console.log(s.mediaChannel));
}

listSentence();
Response

Copy response
{
  "sentences": [
    {
      "media_channel": 1,
      "sentence_index": 0,
      "start_time": null,
      "end_time": null,
      "transcript": "test test",
      "sid": "GXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "confidence": null,
      "words": [
        {
          "word": "test",
          "start_time": null,
          "end_time": null
        },
        {
          "word": "test",
          "start_time": null,
          "end_time": null
        }
      ]
    }
  ],
  "meta": {
    "key": "sentences",
    "page": 0,
    "page_size": 50,
    "first_page_url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences?PageSize=50&Page=0",
    "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences?PageSize=50&Page=0",
    "next_page_url": null,
    "previous_page_url": null
  }
}
Show redacted Transcript Sentences


If PII redaction was enabled at the time the associated Transcript was created, you can retrieve the redacted or unredacted Sentences.

If Redacted is true (the default value), the redacted Sentences are returned.

If Redacted is false , the original, unredacted Sentences are returned.

Retrieve unredacted Sentences for a Transcript

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

async function listSentence() {
  const sentences = await client.intelligence.v2
    .transcripts("GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    .sentences.list({
      redacted: false,
      limit: 20,
    });

  sentences.forEach((s) => console.log(s.mediaChannel));
}

listSentence();
Response

Copy response
{
  "sentences": [
    {
      "media_channel": 1,
      "sentence_index": 0,
      "start_time": null,
      "end_time": null,
      "transcript": "test test",
      "sid": "GXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "confidence": null,
      "words": [
        {
          "word": "test",
          "start_time": null,
          "end_time": null
        },
        {
          "word": "test",
          "start_time": null,
          "end_time": null
        }
      ]
    }
  ],
  "meta": {
    "key": "sentences",
    "page": 0,
    "page_size": 50,
    "first_page_url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences?PageSize=50&Page=0",
    "url": "https://intelligence.twilio.com/v2/Transcripts/GTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sentences?PageSize=50&Page=0",
    "next_page_url": null,
    "previous_page_url": null
  }
}
Need some help?