OAuth 2.0 User Guide
Table of Contents
OAuth 2.0 overview
How does OAuth 2.0 work?
Step-by-step guide to obtaining a Zoho-oauthtoken
Step 1 : Registering the client application
Step 2 : Requesting authorization code
Step 3 : User authorization prompt
Step 4 : Granting authorization
Step 5: Exchanging authorization code for access token
Step 6 : Zoho server response
Step 7 : Accessing Zoho Mail resources
Renew access token
Revoke refresh token
OAuth 2.0 overview
Zoho Mail REST API uses OAuth 2.0 for secure authentication and authorization. OAuth 2.0 enables third-party applications to access resources without requiring the end user to repeatedly authenticate. By obtaining user consent, OAuth 2.0 allows applications to perform predefined API calls securely, ensuring data protection while enhancing user convenience.

If you're developing a custom application or customizing Zoho Mail features for specific business needs, OAuth 2.0 ensures secure access to Zoho Mail data through API integration. 

Note:

In the context of this page, the client application refers to the third-party application that the user tries to access through the Zoho account and the End user refers to the user utilizing the client application.

How does OAuth 2.0 work?
The following steps will help you understand the OAuth 2.0 authentication process:

The end user accesses the client application.
The client application initiates authorization by sending a request for authorization code, mentioning the required scopes.
The Zoho server prompts the end user to authorise the client application to access the end user's data within the mentioned scopes.
The end user authorizes the client application.
The Zoho server sends the authorization code to the client application.
The client application requests the Zoho server for an access token, for the mentioned scopes, in exchange for the authorization code.
The Zoho server sends an access token ( and a refresh token, if requested).
The client application uses the access token to access resources on behalf of the end user from the Zoho server. If the access token expires, the refresh token is used to obtain a new access token, allowing the client application to continue accessing resources seamlessly. This process repeats every time the access token expires, ensuring that the refresh token is consistently used to obtain a new access token. This cycle continues until access is explicitly revoked.

Step-by-step guide to obtaining a Zoho-oauthtoken
The following steps outline the OAuth 2.0 authentication flow for accessing Zoho Mail REST APIs:

Step 1 : Registering the client application
In this step, you (the end-user) need to register your client application in the Zoho Developer Console. You'll be required to provide a unique client name, a homepage URL, and a redirect URI. Once the registration is complete, a unique client ID and client secret will be generated for your application.

Follow the below steps for registering your client application:

Go to https://accounts.zoho.com/developerconsole.
Click on GET STARTED.
Choose the type of third-party client application that is being registered:
Client-based Applications: Applications that run exclusively on a browser and are independent of a web server.
Server-Based Applications: Applications that are clients running on a dedicated HTTP server.
Mobile-based Applications: Applications that are installed on smartphones and tablets.
Non-browser Mobile Applications: Applications for devices without browser provisioning such as smart TVs and printers.
Self Client: Stand-alone applications that perform only back-end jobs (without any manual intervention) like data sync. 
Enter the following requested details in the Zoho API Console's Create New Client page:

Client Name: The name in which you register the client application with Zoho.
Homepage URL: The URL of this client application's web page.
Authorized Redirect URIs: A valid URL of the client application to which the Zoho authentication server responds to you with an authorization code after successful authentication.


Click CREATE. After successful registration, a unique Client ID and Client Secret specific to your application will be displayed in the Zoho API Console.

Step 2 : Requesting authorization code
You (the end-user) or your client application should initiate the authorization process by requesting an authorization code through a GET request to the Zoho authentication server via a web browser. The request must include the required scopes, client_id, response_type, and redirect_uri.

 

Method:

GET

Sample request format of the URL to be called via a web browser:

https://accounts.zoho.com/oauth/v2/auth?client_id={client_id}&response_type=code&redirect_uri={redirect_uri}&scope={scope}&access_type={offline or online}

Example request:

https://accounts.zoho.com/oauth/v2/auth?client_id=1000.*****5&response_type=code&redirect_uri=https://zylker.com/redirect&scope=ZohoMail.accounts.READ&access_type=offline

 

Query Parameters Details :

Parameter	Type	Value	Description
*client_id	Unique Identifier	-	The ID that was assigned to the client application when registered.
*response_type	string	"code"	The type of response expected. In this case, "code" indicates an authorization code will be returned.
*redirect_uri	URI	-	The callback URI that was mentioned during the client application's registration.
*scope	string	Syntax: Servicename.scopename.Operation
Example: ZohoMail.accounts.READ,ZohoMail.folders.UPDATE	Specifies the scope allowed for the client application. Has to be separated by commas. For detailed information on Scopes, click here.
access_type	string	"offline/online" (Default : "online")	Specifies whether a refresh token is required. "online" provides an access token only; "offline" provides both an access token and a refresh token.
prompt	string	"consent"	Add this parameter to reauthorize the user at each login, showing the consent screen every time. Use this parameter only when necessary.
state	string	-	A generated value that correlates the callback with its associated authorization request.
 * denotes mandatory parameter.

Step 3 : User authorization prompt
In response, the Zoho authentication server will prompt you (the end-user) to authorize the client application to access their data based on the specified scopes.



Step 4 : Granting authorization
If you (the end-user) click "Accept" in the prompt window,  you authorize the client application to access your Zoho account's resources within the specified scope. Upon acceptance, the Zoho authentication server redirects you to the specified redirect_uri, including the requested authorization code "code" embedded in the URL.

 

Sample response format of the URL in which authorization code is received:

https://{redirect_uri}?code={authorization_code}&location={domain}&accounts-server={accounts_url}

Example response URL in which authorization code is received:

https://zylker.com/redirect?code=1000.*******77&location=us&accounts-server=https%3A%2F%2Faccounts.zoho.com

 

The client application retrieves the authorization code from the above URL.

If the end user clicks Deny, the server will return an error.
Step 5: Exchanging authorization code for access token
The client application should request an access token from the Zoho authentication server by sending a POST request in any API platform like Postman, embedding the authorization code received in the previous step in the URL, along with other necessary details.

 

Method:

POST

Sample request format in any API platform:

https://accounts.zoho.com/oauth/v2/token?code={authorization_code}&grant_type=authorization_code&client_id={client_id}&client_secret={client_secret}&redirect_uri={redirect_uri}&scope={Servicename.Scopename.Operation}

Example request:

https://accounts.zoho.com/oauth/v2/token?code=1000.****160&grant_type=authorization_code&client_id=1000.R2Z0W****Q5EN&client_secret=39c***921b&redirect_uri=https://zylker.com/redirect &scope=ZohoMail.accounts.READ

 

Query Parameter Details :

Parameter	Type	Value	Description
*code	string	-	The authorization code was obtained from the previous step.
*grant_type	string	"authorization_code"	Defines the type of grant being used. In this case, it's the authorization code grant type.
*client_id	Unique Identifier	-	The ID that was assigned to the client application when registered.
*client_secret	string	-	The client application's secret, which was assigned when it was registered.
*redirect_uri	URI	-	The callback URI that was mentioned during the client application's registration.
*scope	string	Syntax: Servicename.scopename.Operation
Example: ZohoMail.accounts.READ	Specifies the scope allowed for the registered client application. Has to be separated by commas. For detailed information on Scopes, click here.
state	string	-	It has to be maintained the same during the entire process of authorization.
denotes mandatory parameter.
Step 6 : Zoho server response
The Zoho server responds with an access token (and a refresh token if requested).

 

Sample Response Format:

 { 
  "access_token": "{access_token}", 
  "refresh_token": "{refresh_token}", 
  "api_domain": "https://www.zohoapis.com", 
  "token_type": "Bearer", 
  "expires_in": 3600
 }

Example Response:

{
   "access_token": "1000.24a566***********6d276b472.86a1******883491c79a042af",
   "refresh_token": "1000.f113ece**********82d02fb25e9.cc0**********8c57693baea39f",
   "scope": "ZohoMail.accounts.READ",
   "api_domain": "https://www.zohoapis.com",
   "token_type": "Bearer",
   "expires_in": 3600
}

 

You can store this data so that there is no need for authorization each time the end user accesses the registered client application. This completes the authentication.

Step 7 : Accessing Zoho Mail resources
Once your client application obtains the access token, it can access Zoho's protected resources through Zoho Mail's APIs. When the access token is provided to the Zoho's resource server, your client application will be granted access based on the scopes specified in the request. Zoho's OAuth implementation uses the Bearer authentication scheme. Therefore, the access token must be included in the Authorization header, prefixed with Zoho-oauthtoken, in every API request.

Renew Access Token
Access tokens have limited validity. In most cases, they expire in an hour. Once they expire, your client application will have to use the refresh token to request a new access token for further use. This process repeats every time the access token expires, ensuring that the refresh token is consistently used to obtain a new access token. This cycle continues until access is explicitly revoked.

The client application requests that the Zoho authentication server renew the access token by sending a POST request to the API platform, embedding the refresh token received in Step 6 in the URL, along with other necessary details.

 

Method:

POST

Sample Request format of URL:

https://accounts.zoho.com/oauth/v2/token?refresh_token={refresh_token}&grant_type=refresh_token&client_id={client_id}&client_secret={client_secret}

Example URL :

https://accounts.zoho.com/oauth/v2/token?refresh_token=1000.4069dacb56*****36&grant_type=refresh_token&client_id=1000.R2Z0W***Q5EN&client_secret=39c****921b

 

Query Parameter Details:

Parameter	Type	Value	Description
*refresh_token	string	-	The authorization code was obtained from the previous step.
*grant_type	string	"refresh_token"	Defines the type of grant being used. In this case, it's the refresh token grant type.
*client_id	Unique Identifier	-	The ID that was assigned to the client application when registered.
*client_secret	string	-	The client application's secret, which was assigned when it was registered.
scope	string	Syntax: Servicename.scopename.Operation
Example: ZohoMail.accounts.READ, ZohoMail.folders.UPDATE	Specifies the scope allowed for the registered client application. Has to be separated by commas. For detailed information on Scopes, click here.
state	string	-	It has to be maintained the same during the entire process of authorization.
denotes mandatory parameter.
If the request is successful, you will receive the following response:

 

Sample response format:

 {
  "access_token": "{new_access_token}",
  "expires_in": 3600,
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer"
 }

 

In response, you have received a new Access Token. This new Access Token will also have an hour of time validity.

Revoke Refresh Token 
Access tokens are revoked on logout, expiration, security updates, suspicious activity, or account changes to maintain security.

The client application requests that the Zoho authentication server revoke the refresh token by sending a POST request to the API platform, embedding the refresh token received in step 6 in the URL, along with other necessary details.

 

Method:

POST

Sample Request format of URL:

https://accounts.zoho.com/oauth/v2/token/revoke?token={refresh_token}

Example URL:

https://accounts.zoho.com/oauth/v2/token/revoke?token=1000.4069dacb56*****3677

 

Note:

Some APIs require Admin authentication for execution, while others can be executed with user authentication. Certain APIs are designed to be executed by both Admins and Users. However, the request URLs will differ based on the user's role.