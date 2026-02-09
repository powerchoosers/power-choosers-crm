Webhooks
Webhooks allow you to subscribe to real-time notifications about various events that occur in MailerSend.

You can create a webhook directly from your MailerSend account and listen for events so your integration can automatically trigger reactions.

Webhooks overview
Setup
Currently, you can create a webhook using the API endpoints listed below or directly from your account. Read more about webhooks.

Webhook Failure Warning

If your webhook fails 10 times within 24 hours, you will receive a notification. If the failures reach 20 within the same period, the webhook will be paused automatically, and no further notifications will be sent until the webhook is re-enabled.

Available events
These are all the events you can listen to and send a notification for.

Event	Description
activity.sent	Fired when your email is sent from our sending servers. We are now waiting for a response from the receiving servers.
activity.delivered	Fired when your email is successfully delivered with no errors.
activity.soft_bounced	Fired when your email is not delivered because it soft bounced.
activity.hard_bounced	Fired when your email is not delivered.
activity.deferred	Fired when your email is temporarily delayed. Please note that this is available to Paid plans only
activity.opened	Fired when the recipient receives your email and opens it.
activity.opened_unique	Fired when the recipient receives your email and opens it only for the first time.
activity.clicked	Fired when the recipient clicks a link in your email.
activity.clicked_unique	Fired when the recipient clicks a link in your email only for the first time.
activity.unsubscribed	Fired when the recipient unsubscribes from your emails.
activity.spam_complaint	Fired when the recipient marks your emails as spam or junk.
activity.survey_opened	Fired when the recipient opens an email containting a survey for the first time.
activity.survey_submitted	Fired when the recipient answers all available questions in a survey based email or after an idle time of 30 minutes.
sender_identity.verified	Fired when the sender identity has been successfully verified.
maintenance.start	Fired when the maintenance period begins. (More info in Handling Maintenance Modes).
maintenance.end	Fired when the maintenance period ends. (More info in Handling Maintenance Modes).
inbound_forward.failed	Fired when an inbound message fail to forward.
email_single.verified	Fired when single email has been successfully verified.
email_list.verified	Fired when email verification list has been successfully verified.
bulk_email.completed	Fired when bulk email sending has been successfully completed.
Payload example
An example of activity.sent event:

{
   "type":"activity.sent",
   "created_at":"2025-08-05T21:23:54.000000Z",
   "data":{
      "id":"6892766a5b66e2daf3dc9155",
      "domain_id": "yv69oxl5kl785kw2",
      "message_id":"6892766ae78995a317577aa1",
      "email_id":"6892766a8d52ba62543d5e71",
      "type":"sent",
      "subject": "Test email",
      "email": "test@mailersend.com",
      "tags":[
         "test",
         "test2"
      ],
      "meta": []
   }
}
An example of activity.survey_submitted event:

{
    "type": "activity.survey_submitted",
    "created_at": "2025-08-06T00:20:36.589903Z",
    "data": {
        "id": "68929fd47f916891ef12eba9",
        "domain_id": "7nxe3yjmeq28vp0k",
        "message_id": "68929fd402fd7079a02cf858",
        "email_id": "68929fd47f916891ef12eba9",
        "type": "survey_submitted",
        "subject": "Test email",
        "email": "test@mailersend.com",
        "tags": [
            "test2",
            "test3"
        ],
        "meta": {
            "surveys": [
                {
                    "question_id": 1,
                    "survey_id": 1,
                    "answer": "test",
                    "is_last_question": true
                }
            ]
        }
    }
}
An example of sender_identity.verified event:

{
    "type": "sender_identity.verified",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "object": "sender_identity",
        "id": "w942pzo81qnvm651",
        "email": "miller.erin@example.net",
        "name": "Prof. Luella Greenholt",
        "reply_to_email": "wdietrich@example.net",
        "reply_to_name": "Narciso Smitham",
        "is_verified": true,
        "resends": 0,
        "add_note": true,
        "personal_note": "porro doloribus quidem"
    }
}
An example of `maintenance.start` event:

```json
{
    "type": "maintenance.start",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "domain_id": "7nxe3yjmeq28vp0k",
    }
}
An example of maintenance.end event:

{
    "type": "maintenance.end",
    "created_at": "2025-08-05 22:27:31",
    "data": {
        "domain_id": "7nxe3yjmeq28vp0k",
    }
}
An example of inbound_forward.failed event:

{
    "type": "inbound_forward.failed",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "domain_id": "7nxe3yjmeq28vp0k",
        "inbound_id": "7nxe3yjmeq28vp0k",
        "inbound_message_id": "68929bf482496e1365e9bd71"
    }
}
An example of email_single.verified event:

{
    "object": "email_single.verified",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "id": "68928a46a23f15a8bcbbafb6",
        "address": "aurore20@senger.net",
        "status": "completed",
        "result": "valid",
        "error": null
    }
}
An example of email_list.verified event:

{
    "type": "email_list.verified",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "id": "lx1p78jk1o53rzn4",
        "name": "verify-test - Sheet1.csv",
        "total": 1,
        "verification_started": "2025-08-05T22:50:31.000000Z",
        "verification_ended": null,
        "updated_at": "2025-08-05T22:50:41.000000Z",
        "status": {
            "name": "verified",
            "count": 0
        },
        "source": "api",
        "statistics": {
          "valid": 0,
          "catch_all": 0,
          "mailbox_full": 0,
          "role_based": 0,
          "unknown": 1,
          "syntax_error": 0,
          "typo": 0,
          "mailbox_not_found": 0,
          "disposable": 0,
          "mailbox_blocked": 0,
          "failed": 0,
          "not_verified": 0
        }
    }
}
An example of bulk_email.completed event:

{
    "type": "bulk_email.completed",
    "created_at": "2025-08-05 22:27:14",
    "data": {
        "id": "689286b1cf375b31ffa45498",
        "state": "completed",
        "total_recipients_count": 11,
        "suppressed_recipients_count": 0,
        "suppressed_recipients": null,
        "validation_errors_count": 0,
        "validation_errors": null,
        "messages_id": null
    }
}
Security
Webhook requests made by MailerSend include a Signature header. It contains a string generated by hashing the data sent to your webhook endpoint with an individual Signing Secret. A signing secret is a random string that is generated when you create a webhook.

Verifying a signature:

PHP
NodeJS
Go
// $signature - a header sent by MailerSend, please refer to your framework
// or PHP manual on how to read the Signature header

// $requestContent - please refer to your framework or PHP manual on how to read the request content

$computedSignature = hash_hmac('sha256', $requestContent, $signingSecret);
return hash_equals($signature, $computedSignature);
Retrying failed webhooks
When your webhook receives a response other than a 2xx code from your endpoint URL, or if the endpoint doesn’t respond within 3 seconds, it will show up as a failed attempt in the log section of your webhook. If it receives a 2xx, then it will show as a success.

If a webhook call fails, MailerSend will retry the call a couple of times, waiting 10 seconds between the first and second attempt and 100 seconds between the second and the third attempt. This is to avoid hammering the application you want to send the information to.

Recommendations
To ensure reliable handling of webhooks, we recommend that you:

Send a 2xx response as soon as possible to confirm receipt of the webhook.
Move any further processing logic to an asynchronous (async) background job. This allows your endpoint to respond quickly and avoids potential timeouts or repeated attempts.
Useful tools
Webhook.site or Pipedream.com: These allow you to see the contents of a webhook and inspect what's being sent.
Reqbin.com: A versatile tool for testing webhooks and making HTTP requests in real time.
FAQs
How do I track the Message I've sent via SMTP relay back to a webhook?
If the message was sent successfully, our SMTP relay will send you back a 250 Message queued as XXXXXX response. This can be parsed to an ID used in our Messages endpoints, and in webhooks that Message ID can be found at data.email.message.id.

If you want full interoperability, we encourage you to use our Email API for the best results.

Get a list of webhooks
If you want to retrieve information about webhooks, use this GET request:

GET https://api.mailersend.com/v1/webhooks
Request parameters
Query Parameter	Type	Required	Limitations	Details
domain_id	string	yes		
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\MailerSend;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->webhooks->get('domain_id');
More examples

Get a webhook
To retrieve information about a single webhook, use this GET request:

GET https://api.mailersend.com/v1/webhooks/{webhook_id}
Request parameters
URL Parameter	Type	Required	Limitations	Details
webhook_id	string	yes		
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\MailerSend;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->webhooks->find('webhook_id');
More examples

Create a webhook
Create a webhook using this POST request:

POST https://api.mailersend.com/v1/webhooks/
Request parameters
JSON parameters are provided in dot notation

JSON Parameter	Type	Required	Limitations	Details
url	url	yes	Max: 191	
name	string	yes	Max: 191	
events	array	yes		
enabled	boolean	optional		
version	boolean	optional	1, 2	1 Recommended, 2 Legacy
domain_id	string	yes		Existing hashed domain ID.
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\Helpers\Builder\WebhookParams;
use MailerSend\MailerSend;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->webhooks->create(
    new WebhookParams('https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, 'domain_id')
);

// Version 2 webhook

$mailersend->webhooks->create(
    new WebhookParams('https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, 'domain_id', true, 2)
);

// Or a disabled webhook

$mailersend->webhooks->create(
    new WebhookParams('https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, 'domain_id', false)
);
More examples

Update a webhook
Update a webhook using this PUT request:

PUT https://api.mailersend.com/v1/webhooks/{webhook_id}
Request parameters
URL Parameter	Type	Required	Limitations	Details
webhook_id	string	yes		
JSON parameters are provided in dot notation

JSON Parameter	Type	Required	Limitations	Details
url	url	optional		
name	string	optional	Max: 191	
events	array	optional		
enabled	boolean	optional		
version	boolean	optional	1, 2	
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\MailerSend;
use MailerSend\Helpers\Builder\WebhookParams;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->webhooks->update('webhook_id', 'https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES);

// Update webhook to version 2
$mailersend->webhooks->update('webhook_id', 'https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, true, 2);

// Enable webhook
$mailersend->webhooks->update('webhook_id', 'https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, true);

// Disable webhook
$mailersend->webhooks->update('webhook_id', 'https://webhook_url', 'Webhook name', WebhookParams::ALL_ACTIVITIES, false);
More examples

Delete a webhook
Delete a webhook using this DELETE request:

DELETE https://api.mailersend.com/v1/webhooks/{webhook_id}
Request parameters
URL Parameter	Type	Required	Limitations	Details
webhook_id	string	yes		
PHP
NodeJS
Python
Go
Java
Ruby
use MailerSend\MailerSend;

$mailersend = new MailerSend(['api_key' => 'key']);

$mailersend->webhooks->delete('webhook_id');
More examples

Last Updated: 12/16/2025, 9:42:49 AM
 Templates