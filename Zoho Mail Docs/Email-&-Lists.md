Email Lists and Details
The Message APIs help you to retrieve messages from the user account and access them.

While using any Emails Message related API, make use of the OAuth Scope ZohoMail.messages.

Method Name	URL	Method Type	OAuth Scope	Purpose
Send an email	/api/accounts/{accountId}/messages	POST	ZohoMail.messages	To send an email specifying the From, To, Cc, Bcc, Subject, Encoding and Email format. 
Send an email with attachments	/api/accounts/{accountId}/messages	POST	To send an email with attachments.
Upload attachments	/api/accounts/{accountId}/messages/attachments	POST	To upload an file before attaching it with the email.
Save draft / template	/api/accounts/{accountId}/messages	POST	To save content as a draft or as a template.
Reply to an email	/api/accounts/{accountId}/messages/{messageId}	POST	The API is used to send a reply to an email received. 
Get all emails in a folder 	/api/accounts/{accountId}/messages/view	GET	To get the details of all or specific set of emails in a folder based on view options.
Get emails based on search conditions	/api/accounts/{accountId}/messages/search	GET	To get the list of emails, from the account based on custom search conditions.
Get email headers	/api/accounts/{accountId}/folders/folderId/
messages/{messageId}/header	GET	To get the email headers of a particular email message, based on the message id. 
Get email content	/api/accounts/{accountId}/folders/folderId/
messages/{messageId}/content	GET	To get the content of a particular email message, based on the message id. 
Get original message	/api/accounts/{accountid}/messages/{messageId}/originalmessage	 	To get the MIME representation of an email message.
Get meta data of a particular email	/api/accounts/{accountId}/folders/{folderId}/
messages/{messageId}/details	GET	To get the meta data details of a particular email message in the account, based on the message id.
Get attachment info	/api/accounts/{accountId}/folders/{folderId}/
messages/{messageId}/attachmentinfo	GET	To get the attachment information of a particular email message in the account, based on the message id. 
Get email attachment content	/api/accounts/{accountId}/folders/{folderId}
/messages/{messageId}/attachments/{attachmentId}	GET	To get the content stream of attachments in an email.
Mark emails as read	/api/accounts/{accountId}/updatemessage	PUT	To mark single/ multiple emails as read, based on the list of message ids passed as parameters.
Mark emails as unread	/api/accounts/{accountId}/updatemessage	PUT	To mark single/ multiple emails as unread, based on the list of message ids passed as parameters.
Move email	/api/accounts/{accountId}/updatemessage	PUT	To move a particular email or a group of emails from the existing folder to a different folder. 
Flag emails	/api/accounts/{accountId}/updatemessage	PUT	To set one among the four available flags to a particular email or a group of emails.
Apply labels to emails	/api/accounts/{accountId}/updatemessage	PUT	To apply a tag to a particular email or a group of emails. 
Remove labels from an emails	/api/accounts/{accountId}/updatemessage	PUT	To remove a tag from a particular email or a group of emails. 
Remove all labels from emails	/api/accounts/{accountId}/updatemessage	PUT	To remove all tags from a particular email or a group of emails.
Archive an email	/api/accounts/{accountId}/updatemessage	PUT	To archive an email or multiple emails based on the message ids passed as parameters.
Unarchive an email	/api/accounts/{accountId}/updatemessage	PUT	To unarchive an email or multiple emails based on the message ids passed as parameters.
Mark email as spam	/api/accounts/{accountId}/updatemessage	PUT	To mark a particular email or a group of emails as spam.
Mark email as not spam	/api/accounts/{accountId}/updatemessage	PUT	To mark a particular email or a group of emails as not spam.
Delete email	/api/accounts/{accountId}/folders/{folderId}/messages/{messageId}	DELETE	To delete a particular email or a group of emails.
