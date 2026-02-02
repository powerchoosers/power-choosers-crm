ERCOT ESR API Client/Developer Documentation

API definition
Changelog
Client/Developer RESTFul web services documentation for ERCOT Public Data products.


All available Data Products
Retrieve all available (active) products in the current Data registry having public accessibility.

Data Products
Request
https://api.ercot.com/api/public-data/
Request headers
Name
Required
Type
Description
Ocp-Apim-Subscription-Key
true
string
The subscription key assigned to your ERCOT Public API account.

Response: 200 OK
OK The operation completed successfully.


application/json
Product
Represents a Data Product, which includes its metadata along with all Artifact information.




Name
Required
Type
Description
productId
false
string
name
false
string
description
false
string
reportTypeId
false
integer (int64)
status
false
string
audience
false
string
generationFrequency
false
string
securityClassification
false
string
lastUpdated
false
string (date-time)
firstRun
false
string (date-time)
eceii
false
string
channel
false
string
userGuide
false
string
postingType
false
string
market
false
string
extractSubscriber
false
string
xsdName
false
string
misPostingLocation
false
string
certificateRole
false
string
fileType
false
string
ddlName
false
string
misDisplayDuration
false
integer (int32)
archiveDuration
false
integer (int32)
notificationType
false
string
contentType
false
string
downloadLimit
false
integer (int32)
lastPostDatetime
false
string (date-time)
bundle
false
integer (int32)
protocolRules
false
object
links
false
Link[]
artifacts
false
Artifact[]
default
default - json
 Copy
{
    "productId": "string",
    "name": "string",
    "description": "string",
    "reportTypeId": 0,
    "status": "string",
    "audience": "string",
    "generationFrequency": "string",
    "securityClassification": "string",
    "lastUpdated": "string",
    "firstRun": "string",
    "eceii": "string",
    "channel": "string",
    "userGuide": "string",
    "postingType": "string",
    "market": "string",
    "extractSubscriber": "string",
    "xsdName": "string",
    "misPostingLocation": "string",
    "certificateRole": "string",
    "fileType": "string",
    "ddlName": "string",
    "misDisplayDuration": 0,
    "archiveDuration": 0,
    "notificationType": "string",
    "contentType": "DATA",
    "downloadLimit": 0,
    "lastPostDatetime": "string",
    "bundle": 0,
    "protocolRules": {},
    "links": [{
        "rel": "string",
        "href": "string",
        "hreflang": "string",
        "media": "string",
        "title": "string",
        "type": "string",
        "deprecation": "string",
        "profile": "string",
        "name": "string"
    }],
    "artifacts": [{
        "reportTypeId": 0,
        "displayName": "string",
        "links": [{
            "rel": "string",
            "href": "string",
            "hreflang": "string",
            "media": "string",
            "title": "string",
            "type": "string",
            "deprecation": "string",
            "profile": "string",
            "name": "string"
        }]
    }]
}
Response: 400 Bad Request
The request operation failed. The request and/or one or more of its parameters are invalid.


application/json
Exception
Represents any exception encountered while access API endpoints.




Name
Required
Type
Description
timestamp
false
string (date-time)
code
false
integer (int32)
status
false
string
message
false
string
data
false
object
default
default - json
 Copy
{
    "timestamp": "string",
    "code": 0,
    "status": "string",
    "message": "string",
    "data": {}
}
Response: 403 Forbidden
The request operation failed. You do not have access to the requested resource.


application/json
Exception
Represents any exception encountered while access API endpoints.




Name
Required
Type
Description
timestamp
false
string (date-time)
code
false
integer (int32)
status
false
string
message
false
string
data
false
object
default
default - json
 Copy
{
    "timestamp": "string",
    "code": 0,
    "status": "string",
    "message": "string",
    "data": {}
}
Response: 404 Not Found
The request operation failed. The requested resource does not exist.


application/json
Exception
Represents any exception encountered while access API endpoints.




Name
Required
Type
Description
timestamp
false
string (date-time)
code
false
integer (int32)
status
false
string
message
false
string
data
false
object
default
default - json
 Copy
{
    "timestamp": "string",
    "code": 0,
    "status": "string",
    "message": "string",
    "data": {}
}
Definitions
Name
Description
Artifact
Each artifact represents a single report for the given time period designated by the Data Product metadata.

Exception
Represents any exception encountered while access API endpoints.

Link
Product
Represents a Data Product, which includes its metadata along with all Artifact information.

Artifact
Each artifact represents a single report for the given time period designated by the Data Product metadata.




Name
Required
Type
Description
reportTypeId
false
integer (int64)
displayName
true
string
links
false
Link[]
Exception
Represents any exception encountered while access API endpoints.




Name
Required
Type
Description
timestamp
false
string (date-time)
code
false
integer (int32)
status
false
string
message
false
string
data
false
object
Link


Name
Required
Type
Description
rel
false
string
href
false
string
hreflang
false
string
media
false
string
title
false
string
type
false
string
deprecation
false
string
profile
false
string
name
false
string
Product
Represents a Data Product, which includes its metadata along with all Artifact information.




Name
Required
Type
Description
productId
false
string
name
false
string
description
false
string
reportTypeId
false
integer (int64)
status
false
string
audience
false
string
generationFrequency
false
string
securityClassification
false
string
lastUpdated
false
string (date-time)
firstRun
false
string (date-time)
eceii
false
string
channel
false
string
userGuide
false
string
postingType
false
string
market
false
string
extractSubscriber
false
string
xsdName
false
string
misPostingLocation
false
string
certificateRole
false
string
fileType
false
string
ddlName
false
string
misDisplayDuration
false
integer (int32)
archiveDuration
false
integer (int32)
notificationType
false
string
contentType
false
string
downloadLimit
false
integer (int32)
lastPostDatetime
false
string (date-time)
bundle
false
integer (int32)
protocolRules
false
object
links
false
Link[]
artifacts
false
Artifact[]