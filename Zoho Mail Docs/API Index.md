API Guide Index
 
Table of Contents
Organization API
Domain API
Groups API
Users API
Mail Policy API
Accounts API
Folders API
Labels API
Email Messages API
Signatures API
Threads API
Tasks API
Bookmarks API
Notes API
Logs API
Organization API
Method Name	Method Type	URL	OAuth Scope	Operation
Add child organization	POST	/api/organization/	ZohoMail.partner.organization	CREATE
Add allowed IPs	POST	/api/organization/{zoid}/allowedIps	ZohoMail.organization.accounts	CREATE
Get organization details 	GET	/api/organization/{zoid}	ZohoMail.partner.organization	READ
Get org subscription details	GET	/api/organization/{zoid}/storage	ZohoMail.organization.subscriptions	READ
Get user storage details	GET	/api/organization/{zoid}/storage/{zuid}	ZohoMail.organization.subscriptions	READ
Get org spam listing	GET	/api/organization/{zoid}/antispam/data	ZohoMail.organization.spam	READ
Get allowed IPs list	GET	/api/organization/{zoid}/allowedIps	ZohoMail.organization.accounts	READ
Update user storage	PUT	/api/organization/{zoid}/storage/{zuid}	ZohoMail.organization.subscriptions	UPDATE
Update org spam process type	PUT	/api/organization/{zoid}	ZohoMail.partner.organization	UPDATE
Update org spam listing	PUT	/api/organization/{zoid}/antispam/data	ZohoMail.organization.spam	UPDATE
Remove org spam listing	DELETE	/api/organization/{zoid}/antispam/data	ZohoMail.organization.spam	DELETE
Delete allowed IPs	DELETE	/api/organization/{zoid}/allowedIps	ZohoMail.organization.accounts	DELETE
Domain API
Method Name	Method Type	URL	OAuth Scope	Operation
Add a domain to an organization 	POST	/api/organization/{zoid}/domains	 	 
Fetch all domain details 	GET	/api/organization/{zoid}/domains	ZohoMail.organization.domains	READ
Fetch a specific domain details	GET	/api/organization/{zoid}/domains/{domainname}	READ
Verify a domain in the organization 	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Set as primary domain	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Enable email hosting for a domain 	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Add domain alias	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Remove domain alias	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Verify MX record	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Verify SPF record	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Add DKIM details	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Set a DKIM details as default	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Regenerate DKIM Public Key	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Verify DKIM public key	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Delete a DKIM details	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Enable subdomain stripping	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Disable subdomain stripping	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Add catch-all address	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Delete catch-all address	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Add notification address	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Delete notification address	PUT	/api/organization/{zoid}/domains/{domainname}	UPDATE
Delete a Domain from the organization 	DELETE	/api/organization/{zoid}/domains/{domainname}	DELETE
Groups API
Method Name	Method Type	URL	OAuth Scope	Operation
Create a group	POST	/api/organization/{zoid}/groups	ZohoMail.organization.groups	CREATE
Get all group details	GET	/api/organization/{zoid}/groups	READ
Get specific group details	GET	/api/organization/{zoid}/groups/{zgid}	READ
Get all emails held for moderation	GET	/api/organization/{zoid}/groups/{zgid}/messages	READ
Get moderation email content	GET	/api/organization/{zoid}/groups/{zgid}/messages/{messageId}	READ
Moderate emails in a group	PUT	/api/organization/{zoid}/groups/{zgid}/messages	UPDATE
Update group name	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Enable streams for a group	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Add group members	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Delete group members	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Update member status	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Update member role	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Update member settings	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Update threshold limit	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Update advanced admin settings	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Add group email alias	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Remove group email alias	PUT	/api/organization/{zoid}/groups/{zgid}	UPDATE
Delete group	DELETE	/api/organization/{zoid}/groups/{zgid} or 
/api/organization/{zoid}/groups	DELETE
Users API
Method Name	Method Type	URL	OAuth Scope	Operation
Add User to Organization	POST	/api/organization/{zoid}/accounts/	ZohoMail.organization.accounts	CREATE
Fetch All Org Users Details	GET	/api/organization/{zoid}/accounts/	READ
Fetch Single User Details	GET	/api/organization/{zoid}/accounts/{zuid}	READ
/api/organization/{zoid}/accounts/{emailAddress}
Change the Role of a User	PUT	/api/organization/{zoid}/accounts	UPDATE
Reset the Password of a User	PUT	/api/organization/{zoid}/accounts/{zuid}	UPDATE
Change TFA Preference	PUT	/api/organization/{zoid}/accounts/{zuid}	 
Add an Email Alias	PUT	/api/organization/{zoid}/accounts/{zuid}	UPDATE
Remove an Email Alias	PUT	/api/organization/{zoid}/accounts/{zuid}	UPDATE
Enable the User's Mail Account	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Disable the User's Mail Account	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Enable User	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Disable User	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Change Incoming Status	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Change Outgoing Status	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Change IMAP Status	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Change POP Status	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Change ActiveSync Status	PUT	/api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
Delete User Account	DELETE	/api/organization/{zoid}/accounts	ZohoMail.organization.accounts	DELETE
Mail Policy API
Method Name	Method Type	URL	OAuth Scope	Operation
Create Org Policy	POST	/api/organization/{zoid}/policy	ZohoMail.organization.policy	CREATE
Create Email Restriction	POST	/api/organization/{zoid}/policy	CREATE
Create Account Restriction	POST	/api/organization/{zoid}/policy	CREATE
Create Access Restriction	POST	/api/organization/{zoid}/policy	CREATE
Create Forward Restriction	POST	/api/organization/{zoid}/policy	CREATE
Get All Policies	GET	/api/organization/{zoid}/policy	READ
Get All Email Restrictions	GET	/api/organization/{zoid}/policy/mailRestriction	READ
Get All Account Restrictions	GET	/api/organization/{zoid}/policy/accountRestriction	READ
Get All Access Restrictions	GET	/api/organization/{zoid}/policy/accessRestriction	READ
Get All Forward Restrictions	GET	/api/organization/{zoid}/policy/mailForwardPolicy	READ
Get Policy Users	GET	/api/organization/{zoid}/policy/{policyId}/getUsers	READ
Get Policy Groups	GET	/api/organization/{zoid}/policy/{policyId}/getGroups	READ
Apply Policy to Users/Groups	PUT	/api/organization/{zoid}/policy/{policyId}	UPDATE
Assign Email Restriction to Policy	PUT	/api/organization/{zoid}/policy/{policyId}	UPDATE
Assign Account Restriction to Policy	PUT	/api/organization/{zoid}/policy/{policyId}	UPDATE
Assign Access Restriction to Policy	PUT	/api/organization/{zoid}/policy/{policyId}	UPDATE
Assign Forward Restriction to Policy	PUT	/api/organization/{zoid}/policy/{policyId}	UPDATE
Accounts API
Method Name	Method Type	URL	OAuth Scope	Operation
Get All Accounts of a User	GET	/api/accounts	ZohoMail.accounts	READ
Get a Specific Account Details	GET	/api/accounts/{accountId}	ZohoMail.accounts	READ
Update Mail Account Sequence	 PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Update Reply To Address	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Resend Verification for Reply To Address	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Add Send Mail Details	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Update Display Name	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Update Email Address	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Update Display Name and Email Address	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Add Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Verify Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Resend Verification for Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Enable Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Disable Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Delete Zoho Mail copy in Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Remove Email Forwarding	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Add Vacation Reply	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Update Vacation Reply	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication: 
/api/accounts/{accountId}	ZohoMail.accounts
Remove Vacation Reply	PUT	Admin Authentication: /api/organization/{zoid}/accounts/{accountId}	ZohoMail.organization.accounts	UPDATE
User Authentication:
 /api/accounts/{accountId}	ZohoMail.accounts
Folders API
Method Name	Method Type	URL	OAuth Scope	Operation
Create a new folder	POST	/api/accounts/{accountId}/folders	ZohoMail.folders	CREATE
Get all Folders	GET	/api/accounts/{accountId}/folders	READ
Get specific folder	GET	/api/accounts/{accountId}/folders/{folderId}	READ
Rename folder	PUT	/api/accounts/{accountId}/folders/{folderId}	UPDATE
Move folder	PUT	/api/accounts/{accountId}/folders/{folderId}	UPDATE
Enable IMAP view for folder	PUT	 /api/accounts/{accountId}/folders/{folderId}	UPDATE
Disable IMAP view for folder	PUT	/api/accounts/{accountId}/folders/{folderId}	UPDATE
Mark folder as read	PUT	/api/accounts/{accountId}/folders/{folderId}	UPDATE
Empty folder	PUT	/api/accounts/{accountId}/folders/{folderId}	UPDATE
Delete folder	DELETE	/api/accounts/{accountId}/folders/{folderId}	DELETE
Labels API
Method Name	Method Type	URL	OAuth Scope	Operation
Create a New Label	POST	/api/accounts/{accountId}/labels	ZohoMail.tags	CREATE
Get All Label Details	GET	/api/accounts/{accountId}/labels	READ
Get a Specific Label Details	GET	/api/accounts/{accountId}/labels/{labelid}	READ
Update a Label	PUT	/api/accounts/{accountId}/labels/{labelid}	UPDATE
Delete a Label	DELETE	/api/accounts/{accountId}/labels/{labelid}	DELETE
Email Messages API
Method Name	Method Type	URL	OAuth Scope	Operation
Send an email	POST	/api/accounts/{accountId}/messages	ZohoMail.messages	CREATE
Send an email with attachment	POST	/api/accounts/{accountId}/messages	CREATE
Upload attachments	POST	/api/accounts/{accountId}/messages/attachments	CREATE
Save draft/template	POST	/api/accounts/{accountId}/messages	CREATE
Reply to an email	POST	/api/accounts/{accountId}/messages/{messageId}	CREATE
Get list of emails in a folder	GET	/api/accounts/{accountId}/messages/view	READ
Get list of search results 	GET	/api/accounts/{accountId}/messages/search	READ
Get email headers	GET	/api/accounts/{accountId}/folders/folderId/messages/{messageId}/header	READ
Get email content	GET	/api/accounts/{accountId}/folders/folderId/messages/{messageId}/content	READ
Get original message	GET	/api/accounts/{accountId}/messages/{messageId}/originalmessage	READ
Get meta data of an email	GET	/api/accounts/{accountId}/folders/folderid/messages/{messageId}/details	READ
Get attachment info	GET	/api/accounts/{accountId}/folders/folderId/messages/{messageId}/attachmentinfo	READ
Get attachment content	GET	/api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/attachments/{attachmentId}	READ
Download Inline Image	GET	/api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/inline	READ
Mark emails as read	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Mark emails as unread	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Move emails	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Flag emails	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Apply labels to emails	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Remove labels from an emails	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Remove all labels from emails	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Archive email	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Unarchive email	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Mark email as spam	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Mark email as not spam	PUT	/api/accounts/{accountId}/updatemessage	UPDATE
Delete email	DELETE	/api/accounts/{accountId}/folders/{folderId}/messages/{messageId}	DELETE
Signatures API
Method Name	Method Type	URL	OAuth Scope	Operation
Add user signature	POST	/api/accounts/signature	ZohoMail.accounts	CREATE
Get user signature	GET	/api/accounts/signature	READ
Update user signature	PUT	/api/accounts/signature	UPDATE
Delete user signature	DELETE	/api/accounts/signature	DELETE
Threads API
Method Name	Method Type	URL	OAuth Scope	Operation
Flag thread	PUT	/api/accounts/{accountId}/updatethread	ZohoMail.messages	UPDATE
Move thread	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Apply Label to thread 	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Remove label from thread 	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Remove all labels from thread 	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Mark thread as read	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Mark thread as unread	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Mark thread as spam	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Mark thread as not spam	PUT	/api/accounts/{accountId}/updatethread	UPDATE
Tasks API
Method Name	Method Type	URL	OAuth Scope	Operation
Add a new group or personal task	POST	Group tasks:
/api/tasks/groups/{zgid}	ZohoMail.tasks	
CREATE

 

Personal tasks:
/api/tasks/me
Add a new project	POST	/api/tasks/groups/{zgid}/projects	CREATE
Get all tasks in a group or all personal tasks	GET	Group tasks:
/api/tasks/groups/{zgid}	READ
Personal tasks:
/api/tasks/me
Get all tasks assigned to you	GET	/api/tasks	READ
Get all tasks created by you	GET	/api/tasks	READ
Get a specific task	GET	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	READ
Personal tasks:
/api/tasks/me/{taskId}
Get all subtasks under a task	GET	Group tasks:
/api/tasks/groups/{zgid}/{taskId}/subtasks	READ
Personal tasks:
/api/tasks/me/{taskId}/subtasks
Get all projects in a group	GET	/api/tasks/groups/{zgid}/projects	READ
Get all tasks in a project	GET	/api/tasks/groups/{zgid}/projects/{projectId}	READ
Get all tasks in a project with given status	GET	/api/tasks/groups/{zgid}/projects/{projectId}	READ
Get all groups	GET	/api/tasks/groups	READ
Get all tasks in a group with given status	GET	/api/tasks/groups/{zgid}	READ
Get member details in a group	GET	/api/tasks/groups/{zgid}/members	READ
Change task title	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Change task description	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Change task priority	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Change task status	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Change task project	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
/api/tasks/me/{taskId}
Change task assignee	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Set/ change task due date	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Set/ change task reminder	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Set/ change task reminder based on due date	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
 /api/tasks/me/{taskId}
Set/ change recurring task	PUT	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	UPDATE
Personal tasks:
/api/tasks/me/{taskId}
Edit a project	PUT	/api/tasks/groups/{zgid}/projects/{projectId}	UPDATE
Delete a project	DELETE	/api/tasks/groups/{zgid}/projects/{projectId}	DELETE
Delete a group/personal task	DELETE	Group tasks:
/api/tasks/groups/{zgid}/{taskId}	DELETE
Personal tasks:
/api/tasks/me/{taskId}
Bookmarks API
Method Name	Method Type	URL	OAuth Scope	Operation
Create a bookmark	POST	Group Bookmarks:
/api/links/groups/{groupId}	ZohoMail.links	CREATE
Personal Bookmarks: 
/api/links/me
Create a collection	POST	Group Bookmarks: 
/api/links/groups/{groupId}/collections	CREATE
Personal Bookmarks: 
/api/links/me/collections
Get all groups	GET	/api/links/groups	READ
Get all bookmarks	GET	Group Bookmarks: 
/api/links/groups/{groupId}	READ
Personal Bookmarks: 
/api/links/me
Get all favourite bookmarks	GET	/api/links/favorites	READ
Get all shared bookmarks	GET	/api/links	READ
Get all bookmarks in trash	GET	Group Bookmarks: 
/api/links/groups/{groupId}/trash	READ
Personal Bookmarks: 
/api/links/me/trash
Get all collections	GET	Group Bookmarks: 
/api/links/groups/{groupId}/collections	READ
Personal Bookmarks: 
/api/links/me/collections
Get all collections in groups	GET	/api/links/groups/collections	READ
Get all bookmarks in a collection	GET	Group Bookmarks: 
/api/links/groups/{groupId}/collections/{collectionId}	READ
Personal Bookmarks: 
/api/links/me/collections/{collectionId}
Get a bookmark	GET	Group Bookmarks: 
/api/links/groups/{groupId}/{bookmarkId}	READ
Personal Bookmarks: 
/api/links/me/{bookmarkId}
Edit a bookmark	PUT	Group Bookmarks: 
/api/links/groups/{groupid}/{bookmarkId}	UPDATE
Personal Bookmarks: 
/api/links/me/{entityId}
Restore a bookmark	PUT	/api/links/groups/{groupId}/{bookmarkId}/restore	UPDATE
Edit a collection	PUT	Group Bookmarks: 
/api/links/groups/{groupId}/collections/{collectionId}	UPDATE
Personal Bookmarks: 
/api/links/me/collections/{collectionId}
Mark a bookmark as favorite	PUT	Group Bookmarks: 
/api/links/groups/{groupId}/{bookmarkId}/favorite	UPDATE
Personal Bookmarks: 
/api/links/me/{bookmarkId}/favorite
Unmark a bookmark as favorite	DELETE	Group Bookmarks: 
/api/links/groups/{groupId}/{bookmarkId}/favorite	DELETE
Personal Bookmarks: 
/api/links/me/{bookmarkId}/favorite
Delete a bookmark	DELETE	Group Bookmarks: 
/api/links/groups/{groupId}/{bookmarkId}	DELETE
Personal Bookmarks: 
/api/links/me/{bookmarkId}
Delete a collection	DELETE	Group Bookmarks: 
/api/links/groups/{groupId}/collections/{collectionId}	DELETE
Personal Bookmarks: 
/api/links/me/collections/{collectionId}
Notes API
Method Name	Method Type	URL	OAuth Scope	Operation
Create a note	POST	Group Notes:
/api/notes/groups/{groupId}	ZohoMail.notes	CREATE
Personal Note: 
/api/notes/me
Create a book	POST	Group Notes
/api/notes/groups/{groupId}/books	CREATE
Personal Notes: 
/api/notes/me/books
Add an attachment to a note	POST	Group Notes:
/api/notes/groups/{groupId}/{noteId}/attachments	CREATE
Personal Notes: 
/api/notes/me/{noteId}/attachments
Get all groups	GET	/api/notes/groups	READ
Get all notes	GET	Group Notes:
/api/notes/groups/{groupId}	READ
Personal Notes: 
/api/notes/me
Get all books	GET	Group Notes
/api/notes/groups/{groupId}/books	 
Personal Notes: 
/api/notes/me/books	READ
Get all favourite notes	GET	/api/notes/favorites	READ
Get all shared notes	GET	/api/notes/sharedtome	 
Get all notes in a book	GET	Group Notes: 
/api/notes/groups/{groupId}/books/{bookId}	READ
Personal Notes: 
/api/notes/me/books/{bookId}
Get all attachments in a note	GET	Group Notes:
/api/notes/groups/{groupId}/{noteId}/attachments	READ
Personal Notes: 
/api/notes/me/{noteId}/attachments
Get a note	GET	Group Notes: 
/api/notes/groups/{groupId}/{noteId}	READ
Personal Note: 
/api/notes/me/{noteId}
Get an attachment in a note	GET	Group Notes:
/api/notes/groups/{groupId}/{noteId}/attachments/{attachmentId}	READ
Personal Notes: 
/api/notes/me/{noteId}/attachments/{attachmentId}
Edit a note	PUT	Group Notes: 
/api/notes/groups/{groupId}/{noteId}	UPDATE
Personal note: 
/api/notes/me/{noteId}
Edit a book	PUT	Group Notes: 
/api/notes/groups/{groupId}/books/{bookId}	UPDATE
Personal note: 
/api/notes/me/books/{bookId}
Mark a note as favorite	PUT	Group Notes: 
/api/notes/groups/{groupId}/{noteId}/favorite	UPDATE
Personal Notes: 
/api/notes/me/{noteId}/favorite
Unmark a note as favorite	DELETE	Group Notes: 
/api/notes/groups/{groupId}/{noteId}/favorite	DELETE
Personal Notes: 
/api/notes/me/{noteId}/favorite
Delete an attachment in a note 	DELETE	Group notes;
/api/notes/groups/{groupId}/{noteId}/attachments/{attachmentId}	DELETE
Personal Notes
/api/notes/me/{noteId}/attachments/{attachmentId}
Delete a book	DELETE	Group Notes: 
/api/notes/groups/{groupId}/books/{bookId}	DELETE
Personal Notes: 
/api/notes/me/books/{bookId}
Delete a note	DELETE	Group Notes;
/api/notes/groups/{groupId}/{noteId}	DELETE
Personal Notes: 
/api/notes/me/{noteId}
Logs API
Method Name	Method Type	URL	OAuth Scope	Operation
Get login history	GET	Admin authentication:
/api/organization/{zoid}/accounts/reports/loginHistory	ZohoMail.organization.accounts	GET
Get audit records	GET	/api/organization/{zoid}/activity	ZohoMail.organization.audit	GET
Get SMTP logs	GET	/api/organization/{zoid}/smtplogs	ZohoMail.partner.organization	GET