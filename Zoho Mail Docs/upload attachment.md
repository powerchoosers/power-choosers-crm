Upload Attachment
Purpose
This API enables you to upload attachments before using them in an email. There are two methods to upload attachments: 

MULTIPART_FORM_DATA
RAW file  
Refer here to check the API for sending an email with attachments. 

OAuth Scope
Use the scope

ZohoMail.messages.ALL (or) ZohoMail.messages.CREATE

to generate the Authtoken.

ALL - Grants full access to messages.

CREATE - Grants access to upload attachments to messages.

Request URL
Method: POST

https://mail.zoho.com/api/accounts/{accountId}/messages/attachments

Path Parameters
accountId* long
This parameter is used to identify the account from which the email has to be sent. It is generated during account addition.
This parameter can be fetched from Get All User Accounts API.
1. Uploading via MULTIPART_FORM_DATA
Use this method when uploading multiple attachments.

Query Parameters
uploadType* string
Must be set to multipart when sending multiple files.
isInline boolean
Specifies whether to show the attachment inline in the email body.
Allowed values:
true – Show inline
false (default) – Attach normally
Body Parameters (--form)
attach* file
Represents the actual file you want to upload.
To upload multiple files, repeat this field in the multipart body.
2. Uploading via Raw file 
Use this method to upload a single attachment.

Query Parameters
fileName* string
Provide the name of the file being uploaded. Do not include file path here.
isInline boolean
Specifies whether to show the attachment inline in the email body.
Allowed values:
true – Show inline
false (default) – Attach normally
 

Note: 

When uploading using the RAW file method, ensure that the binary raw file is sent in the request body.

 

* - Mandatory parameter

Response Codes
Refer here for the response codes and their meaning.

Sample Request (Using "MULTIPART_FORM_DATA")(when "isInline" = true)
curl "https://mail.zoho.com/api/accounts/123456789/messages/attachments?uploadType=multipart&isInline=true" \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
--form 'attach=@"/home/User/Downloads/image1.jpeg"'
--form 'attach=@"/home/User/Documents/image2.jpg"'
--form 'attach=@"/home/User/Pictures/image3.jpg"'

Show full

Sample Response
{
  "status": {
    "code": 200,
    "description": "success"
  },
  "data": [
    {
      "attachmentSize": "9465",
      "storeName": "52882865",
      "attachmentName": "1642399004735000_125628183.jpeg",
      "attachmentPath": "/compose/1642399004735000_125628183.jpeg",
      "url": "/zm/ImageSignature?fileName=1642399004735000_125628183.jpeg&accountId=5883000000005001&storeName=52882865&frm=c"
    },
    {
      "attachmentSize": "347581",
      "storeName": "52882865",
      "attachmentName": "1642399004794000_125628183.jpg",
      "attachmentPath": "/compose/1642399004794000_125628183.jpg",
      "url": "/zm/ImageSignature?fileName=1642399004794000_125628183.jpg&accountId=5883000000005001&storeName=52882865&frm=c"
    },
    {
      "attachmentSize": "347581",
      "storeName": "52882865",
      "attachmentName": "1642399004839000_125628183.jpg",
      "attachmentPath": "/compose/1642399004839000_125628183.jpg",
      "url": "/zm/ImageSignature?fileName=1642399004839000_125628183.jpg&accountId=5883000000005001&storeName=52882865&frm=c"
    }
  ]
}
Show full

Sample Request (Using "MULTIPART_FORM_DATA") (when "isInline" = false)
curl "https://mail.zoho.com/api/accounts/123456789/messages/attachments?uploadType=multipart&isInline=false" \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
--form 'attach=@"/home/User/Downloads/image1.jpeg"'
--form 'attach=@"/home/User/Documents/image2.jpg"'
--form 'attach=@"/home/User/Pictures/image3.jpg"'

Show full

Sample Response
   {
       "status": {
           "code": 200,
           "description": "success"
       },
       "data": [
           {
               "attachmentSize": "9465",
               "storeName": "52882865",
               "attachmentName": "image1.jpeg",
               "attachmentPath": "/Mail/7db8a3aa5d5c12681bb51-image1.jpeg"
           },
           {
               "attachmentSize": "347581",
               "storeName": "52882865",
               "attachmentName": "image2.jpg",
               "attachmentPath": "/Mail/5ea951795d5c126825b7a-image2.jpg"
           },
           {
               "attachmentSize": "347581",
               "storeName": "52882865",
               "attachmentName": "image3.jpg",
               "attachmentPath": "/Mail/70b575dc5d5c12682ad84-image3.jpg"
           }
       ]
   }
  
Show full

Sample Request ( Using "RAW file") (when "isInline"=true)
curl "https://mail.zoho.com/api/accounts/123456789/messages/attachments?fileName=filename.jpeg&isInline=true' \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
--data-binary '@/home/User/Downloads/image1.jpeg'
Sample Response
    {
    "status": {
        "code": 200,
        "description": "success"
    },
    "data": {
        "storeName": "53862395",
        "attachmentName": "1661333346116000_1282150461.jpeg",
        "attachmentPath": "/compose/1661333346116000_1282150461.jpeg",
        "url": "/zm/ImageSignature?fileName=1661333346116000_1282150461.jpeg&accountId=29254000000005001&storeName=53862395&frm=c"
    }
}
Show full

Sample Request ( Using "RAW file") (when "isInline"=false)
curl "https://mail.zoho.com/api/accounts/123456789/messages/attachments?fileName=filename.jpeg&isInline=false' \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "Authorization:Zoho-oauthtoken *****" \
--data-binary '@/home/User/Downloads/image1.jpeg'
Sample Response
   {
       "status": {
           "code": 200,
           "description": "success"
       },
       "data": {
           "storeName": "53862395",
           "attachmentName": "image1.jpeg",
           "attachmentPath": "/Mail/4f7e6dfd5e6f952bccf41-image1.jpeg"
       }