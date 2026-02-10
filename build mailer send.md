Generate a new API token and save it (see .env for the API key)
Install our official MailerSend Node.js SDK
Copy and paste the following code into a Node.js file

import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const mailerSend = new MailerSend({
    apiKey: process.env.API_KEY,
});

const sentFrom = new Sender("info@domain.com", "Your name");

const recipients = [
    new Recipient("recipient@email.com", "Your Client")
];

const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setReplyTo(sentFrom)
    .setSubject("This is a Subject")
    .setHtml("Greetings from the team, you got this message through MailerSend.")
    .setText("Greetings from the team, you got this message through MailerSend.");

await mailerSend.email.send(emailParams);

Sending an Email
This endpoint allows you to start sending emails through the MailerSend Email API.

Send an email
This endpoint allows you to send an asynchronous email. It returns the status of the email sent with an x-message-id that can be used to continuously query for the status using the Email API.

Send an email using this POST request:

POST https://api.mailersend.com/v1/email
Request Body
JSON
PHP
NodeJS
Python
Go
Java
Ruby
{
    "from": {
      "email": "hello@mailersend.com",
      "name": "MailerSend"
    },
    "to": [
      {
        "email": "john@mailersend.com",
        "name": "John Mailer"
      }
    ],
    "subject": "Hello from {{company}}!",
    "text": "This is just a friendly hello from your friends at {{company}}.",
    "html": "<b>This is just a friendly hello from your friends at {{company}}.</b>",
    "personalization": [
      {
        "email": "john@mailersend.com",
        "data": {
          "company": "MailerSend"
        }
      }
    ]
  }
Request parameters
JSON parameters are provided in dot notation

JSON parameter	Type	Required	Limitations	Details
from	object	yes *		Not required if template_id is present and template has default sender set.
from.email	string	yes *	Must be a verified domain or a subdomain from a verified domain .	Not required if template_id is present and template has default sender set. Valid email address as per RFC 2821.
from.name	string	no		from.email will be used if not provided or, if template_id is present with default values, the default subject from that will be used.
to	object[]	yes	Min 1, max 50	
to.*.email	string	yes		Valid email address as per RFC 2821.
to.*.name	string	no		The name of the recipient. May not contain ; or ,.
cc	object[]	no	Max 10	
cc.*.email	string	yes		Valid email address as per RFC 2821.
cc.*.name	string	no		The name of the CC recipient. May not contain ; or ,.
bcc	object[]	no	Max 10	
bcc.*.email	string	yes		Valid email address as per RFC 2821.
bcc.*.name	string	no		The name of the BCC recipient. May not contain ; or ,.
reply_to.email	string	no		Valid email address as per RFC 2821.
reply_to.name	string	no		
subject	string	yes *	Max 998	Not required if template_id is present and template has default subject set.
text	string	yes *	Max size of 2 MB.	Email represented in a text (text/plain) format. * Only required if there's no html or template_id present.
html	string	yes *	Max size of 2 MB.	Email represented in HTML (text/html) format. * Only required if there's no text or template_id present.
attachments	object[]	no		
attachments.*.content	string	yes	Max size of 25MB. After decoding Base64	Base64 encoded content of the attachment.
attachments.*.disposition	string	yes	Must be one of the attachment types: inline, attachment	Use inline to make it accessible for content. use attachment to normal attachments
attachments.*.filename	string	yes		
attachments.*.id	string	no		Can be used in content as <img src="cid:*"/>. Must also set attachments.*.disposition as inline.
template_id	string	yes *		* Only required if there's no text or html present.
tags	string[]	no		Limit is max 5 tags. If the template used already has tags, then the request will override them.
personalization	object[]	no		Allows using personalization in {{var}} syntax. Can be used in the subject, html, text fields. Read more about advanced personalization.
personalization.*.email	string	yes		Email address that personalization will be applied to. Valid email address as per RFC 2821.
personalization.*.data	object[]	yes		Object with key: value pairs. Values will be added to your template using {{key}} syntax.
precedence_bulk	boolean	no		This parameter will override domain's advanced settings
send_at	integer	no	min: now, max: now + 72hours	Has to be a Unix timestamp. Please note that this timestamp is a minimal guarantee and that the email could be delayed due to server load.
in_reply_to	string	no		Valid email address as per RFC 2821.
references	string[]	no		List of Message-ID's that the current email is referencing. Read more about creating email threads.
settings	object	no		
settings.*	boolean	yes		Can only contain the keys: track_clicks, track_opens and track_content and a boolean value of true or false.
headers	object[]	no		Please note that this feature is available to Professional and Enterprise accounts only
headers.*.name	string	yes	Must be alphanumeric which can contain -	
headers.*.value	string	yes		
list_unsubscribe	string	no	Accepts a single value that complies with RFC 8058.	Please note that this feature is available to Professional and Enterprise accounts only
Supported file types
File type	Extensions
Text files	.txt, .csv, .log, .css, .ics .xml
Image files	.jpg, .jpe, .jpeg, .gif, .png, .bmp, .psd, .tif, .tiff, .svg, .indd, .ai, .eps
Document files	.doc, .docx, .rtf, .odt, .ott, .pdf, .pub, .pages, .mobi, .epub
Audio files	.mp3, .m4a, .m4v, .wma, .ogg, .flac, .wav, .aif, .aifc, .aiff
Video files	.mp4, .mov, .avi, .mkv, .mpeg, .mpg, .wmv
Spreadsheet files	.xls, .xlsx, .ods, .numbers
Presentation files	.odp, .ppt, .pptx, .pps, .key
Archive files	.zip, .vcf
Email files	.eml
Cryptographic files	.p7c, .p7m, .p7s, .pgp, .asc, .sig
Supported HTML tags and attributes in personalization data
We allow limited HTML in personalization data to enhance content formatting. Only the following tags and attributes are supported, unsupported elements will be removed for security reasons.

Category	Supported
Container tags	p b i strong em a li ul q blockquote abbr address cite bdo strike u h1 h2 h3
Self-closing tags	br img
Attributes	id class style href src width height alt lang title dir cite target
Note

If a scheduled email is sent with a template, and that template is deleted before the sending is triggered, the scheduled email will not be sent.

Responses
Sending queued
Response Code: 202 Accepted
Response Headers:
	content-type: text/plain; charset=utf-8
	x-message-id: 5e42957d51f1d94a1070a733
Response Body: [EMPTY]
Sending paused
Response Code: 202 Accepted
Response Headers:
	content-type: text/plain; charset=utf-8
	x-message-id: 5e42957d51f1d94a1070a733
  x-send-paused: true
Response Body: [EMPTY]
Validation error
Response Code: 422 Unprocessable Entity
Response Headers:
	content-type: application/json
{
  "message": "The given data was invalid.",
  "errors": {
    "from.email": [
      "The from.email domain must be verified in your account to send emails. #MS42207"
    ]
  }
}
See - Validation errors

Validation warning
Response Code: 202 Accepted
Response Headers:
	content-type: application/json
	x-message-id: 5e42957d51f1d94a1070a733
{
  "message": "There are some warnings for your request.",
  "warnings": [
  	{
  		"type": "SOME_SUPPRESSED",
        "warning": "Some of the recipients have been suppressed.",
  		"recipients": [
    		{
      		"email": "suppressed@recipient.com",
      		"name": "Suppressed Recipient",
      		"reasons": ["blocklisted"]
    		}
  		]
  	}
  ]
}
Send encrypted emails
You can use MailerSend to send encrypted messages using S/MIME or PGP. The sender encrypts messages that use these protocols. Their contents can only be viewed by recipients with the private keys required to decrypt the messages.

MailerSend supports the following MIME types, which you can use to send S/MIME encrypted emails:

application/pkcs7-mime
application/pkcs7-signature
application/x-pkcs7-mime
application/x-pkcs7-signature
MailerSend also supports the following MIME types, which you can use to send PGP-encrypted emails:

application/pgp-encrypted
application/pgp-keys
application/pgp-signature
Send bulk emails
This endpoint allows you to send multiple asynchronous emails. It returns the status of the request sent with a bulk_email_id that can be used to continuously query for the status using the Email API.

To prevent long waiting periods for a response, each email validation is done after the request and then the result is stored. If there is any validation error, you can query it using the bulk_email_id provided.

Send a bulk email using this POST request:

POST https://api.mailersend.com/v1/bulk-email
Request Body
JSON
PHP
NodeJS
Python
Go
Java
Ruby
[
    {
      "from": {
        "email": "hello@mailersend.com",
        "name": "MailerSend"
      },
      "to": [
        {
          "email": "john@mailersend.com",
          "name": "John Mailer"
        }
      ],
      "subject": "Hello from {{company}}!",
      "text": "This is just a friendly hello from your friends at {{company}}.",
      "html": "<b>This is just a friendly hello from your friends at {{company}}.</b>",
      "personalization": [
        {
          "email": "john@mailersend.com",
          "data": {
            "company": "MailerSend"
          }
        }
      ]
    },
    {
      "from": {
        "email": "hello@mailersend.com",
        "name": "MailerSend"
      },
      "to": [
        {
          "email": "jane@mailersend.com",
          "name": "Jane Mailer"
        }
      ],
      "subject": "Welcome to {{company}}!",
      "text": "This is a welcoming message from your friends at {{company}}.",
      "html": "<b>This is a welcoming message from your friends at {{company}}.</b>",
      "personalization": [
        {
          "email": "jane@mailersend.com",
          "data": {
            "company": "MailerSend"
          }
        }
      ]
    }
  ]
Request parameters
JSON parameters are provided in dot notation

JSON parameter	Type	Required	Limitations	Details
*	object[]	yes	Must be an array.	Array of email objects.
*.*	object	yes	Must be an email object.	See email object for detailed options available.
Limitations
Description	Limit
Total size of the JSON payload	50MB
Number of individual email objects in a single request	5 for Trial plan accounts.
500 for Hobby, Starter, Professional or Enterprise plan accounts.
Number of recipients per email object.	See Email endpoint.
API requests per minute	10 for Trial and Hobby plan accounts.
15 for Starter plan accounts.
30 for Professional plan accounts.
60 for Enterprise plan accounts.
If not mentioned, the limits are the same as for the generic Email API endpoint.

Responses
Response Code: 202 Accepted
Response Headers:
    content-type: application/json
{
  "message": "The bulk email is being processed. Read the Email API to know how you can check the status.",
  "bulk_email_id": "614470d1588b866d0454f3e2"
}
Errors
Validation errors
Validation errors, as well as any other issues like failed emails, are stored in the database. You can check them by calling the 'Get bulk email' endpoint.

Validation errors are indexed by the order they are sent: message.{order_index}.

Suppression errors
If one or more recipients specified in the messages are suppressed, similarly to the validation errors, they are stored and can be checked with the 'Get bulk email' endpoint.

The suppression errors are indexed by x-message-id.

Get bulk email status
Get the bulk email information like validation errors, failed emails and more.

Check the bulk email status using this GET request:

GET https://api.mailersend.com/v1/bulk-email/{bulk_email_id}
Request parameters
URL parameter	Type	Required	Limitations	Details
bulk_email_id	string	yes		
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\MailerSend;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->bulkEmail->getStatus('bulk_email_id');
More examples

Responses
Valid
Response Code: 200 OK
Response Headers:
	content-type: application/json
{
  "data": {
    "id": "614470d1588b866d0454f3e2",
    "state": "completed",
    "total_recipients_count": 1,
    "suppressed_recipients_count": 0,
    "suppressed_recipients": null,
    "validation_errors_count": 0,
    "validation_errors": null,
    "messages_id": "['61487a14608b1d0b4d506633']",
    "created_at": "2021-09-17T10:41:21.892000Z",
    "updated_at": "2021-09-17T10:41:23.684000Z"
  }
}
Invalid
Response Code: 404 Not Found
Last Updated: 12/16/2025, 9:42:49 AM
