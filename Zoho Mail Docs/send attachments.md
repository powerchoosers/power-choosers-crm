Send an email with Attachments
Purpose
The API is used to send an email with attachments.  The attachments should be uploaded to the File Store using the 'Upload Attachments' API. The response values, storeName, attachmentName and attachmentPath from that API should be used in the Request Body of this API. 

OAuth Scope
Use the scope

ZohoMail.messages.ALL (or) ZohoMail.messages.CREATE

to generate the Authtoken.

ALL - Grants full access to messages.

CREATE - Grants access to create messages.

Request URL
Method: POST

https://mail.zoho.com/api/accounts/{accountId}/messages

Path Parameters
accountId* long
This key is used to identify the account from which the email has to be sent. It is generated during account addition.
This parameter can be fetched from Get All User Accounts API.
Request Body (JSON object)
fromAddress* string
Provide the sender's email address (associated to the authenticated account).
Allowed values: Valid email address corresponding to the authenticated account for the From field.
toAddress* string
Provide the recipient's email address.
Allowed values: Valid recipient email address for the To field.
ccAddress string
Provide the recipient's email address for the Cc field.
Allowed values: Valid recipient email address for the Cc field.
bccAddress string
Provide the recipient's email address for the Bcc field.
Allowed values: Valid recipient email address for the Bcc field.
subject string
Provide the subject of the email.
content string
Provide the content of the email.
mailFormat string
Specify the format in which the mail needs to be sent. The value can be
html
plaintext
The default value is html.
askReceipt string
Specifies whether Read receipt from the recipient is requested or not.
Allowed values:
yes - Requesting a read receipt.
no - Not requesting a read receipt
encoding string
Specifies the encoding that is to be used in the email content.
Allowed values:
Big5
EUC-JP
EUC-KR
GB2312
ISO-2022-JP
ISO-8859-1
KOI8-R
Shift_JIS
US-ASCII
UTF-8
WINDOWS-1251
X-WINDOWS-ISO2022JP
The default value is UTF-8.
attachments Array of JSON objects
This parameter is an array consisting of JSON objects.
Each object in this array contain a key-value pair formatted as:
attachmentName string
Specifies the name of the attachment.
This parameter can be fetched from Upload Attachments API.
attachmentPath string
Specifies the path in which the attachment is stored .
This parameter can be fetched from Upload Attachments API.
storeName string
Specifies the name of the store where the attachment is saved.
This parameter can be fetched from Upload Attachments API.
To Schedule an Email:
With this API you can also schedule when to send your email. To schedule an email, follow the same procedure as above along with the upcoming additional parameters.

isSchedule boolean
Depending on whether the mail has to be scheduled or not, the value can be
true - if the email should be scheduled.
false - if the email should be sent immediately.          
scheduleType int
Specifies the type of scheduling.
Allowed values:
1 - Schedules email to be sent after one hour from the time of the request.
2 - Schedules email to be sent after two hours from the time of the request.
3 - Schedules email to be sent after four hours from the time of the request.
4 - Schedules email to be sent by the morning of the next day from the time of the request.
5 - Schedules email to be sent by the afternoon of the next day from the time of the request.
6 - Schedules email to be sent on the custom date and time of your choice.
timeZone string
Specify the timezone to schedule your email.
This parameter is mandatory if scheduleType is set to value 6. For example: GMT 5:30 (India Standard Time - Asia/Calcutta).
scheduleTime string
Specify the date and time you want to schedule your email.
This parameter is mandatory if scheduleType is set to value 6. Format: MM/DD/YYYY HH:MM:SS. For example: 09/15/2023 14:30:28
 

* - Mandatory parameter

Response Codes
Refer here for the response codes and their meaning.

Sample Request
For Single attachment:
curl "https://mail.zoho.com/api/accounts/123456789/messages" \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
-d '{
   "fromAddress": "rebecca@zylker.com",
   "toAddress": "paula@zylker.com",
   "ccAddress": "colleagues@mywork.com",
   "bccAddress": "restadmin1@restapi.com",
   "subject": "abc",
   "content": "Email can never be dead. The most neutral and effective way, that can be used for one to many and two way communication.",
   "attachments": [
      {
         "storeName": "NN2:-167775813820412438",
         "attachmentPath": "/1425407266885_ourholidays",
         "attachmentName": "ourholidays.jpg"
      }
   ]
}'
For Multiple attachments:
curl "https://mail.zoho.com/api/accounts/123456789/messages" \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
-d ' {
   "fromAddress": "my@mydomain.com",
   "toAddress": "family@mydomain.com",
   "ccAddress": "colleagues@mywork.com",
   "bccAddress": "restadmin1@restapi.com",
   "subject": "abc",
   "content": "Email can never be dead. The most neutral and effective way, that can be used for one to many and two way communication.",
   "attachments": [
      {
         "storeName": "NN2:-167775813820412438",
         "attachmentPath": "/1425407266885_ourholidays",
         "attachmentName": "ourholidays.jpg"
      },
      {
         "storeName": "NN2:-1677758138204234566",
         "attachmentPath": "/1425407266885_ourvacation",
         "attachmentName": "ourvacation.jpg"
      }
   ]
}'
© 2026, Zoho Corporation Pvt. Ltd. All Rights Reserved.