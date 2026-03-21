Calendars API
The Calendars API is used to perform actions on a particular calendar or a list of calendars. Using the Calendars API, you can make changes to an existing calendar or add/delete calendars. Each calendar is identified using a unique ID.

Based on the permission and the origin, Calendars are categorized as:

My Calendars: These are personal calendars that are created and managed only by you.

App Calendars: Calendars that are subscribed from other applications like Zoho CRM, Google Calendar etc.

Group Calendars: Calendars that are created for groups within the organization. 

Other Calendars: Any other calendar available in public to be added is listed under Other Calendars. Eg. Holiday calendars, Shared calendars, Subscribed public calendars, Birthday calendars.

The /calendar/* endpoint is used to make changes to your calendars. The list of methods that are supported by the Calendar are GET, POST, PUT and DELETE.

Methods:
GET - Get calendar list
Gets the list of all calendars.

GET - Get calendar details
Gets the information of a particular calendar.

POST - Create new calendar
Creates a new calendar.

PUT - Update calendar
Updates an existing calendar.

DELETE - Delete calendar
Deletes an existing calendar.

POST - Create a New Calendar
Purpose
This API is used to create a new personal calendar.

Request URL
https://calendar.zoho.com/api/v1/calendars

OAuth Scope
scope=ZohoCalendar.calendar.ALL

(or)

scope=ZohoCalendar.calendar.CREATE

​

ALL - Grants full access to calendars

CREATE - Grants access to create a calendar

Request Parameters
calendarData JSONobject, mandatory 
The calendarData JSONobject can be passed to create a new personal calendar using the following keys.

Input JSON keys
namestring, mandatory
Specifies the name of the calendar. 
The maximum length of the word can be 50.
colorstring, mandatory
Specifies the Hex code of the preferred color.
Format :  #RRGGBB. Example: #000000 for black, #FFFFFF for white.
include_infreebusyboolean
Specifies whether this calendar should be considered for your Free/Busy. 
Allowed values
true - All events in this calendar will be considered "Busy".
false - All events in this calendar will be considered "Free".
privatestring
Specifies whether the calendar can have a private URL or not. When a Calendar is made publicly viewable, it can still be accessible from a private URL for the other users with whom the calendar is shared with other permissions.
Allowed values :
enable- Calendar can be accessed through a private URL.
disable- Calendar cannot be accessed through a private URL.
timezonestring
Specifies the timezone information for the calendar that should be created.
Example: Asia/Kolkata
publicstring
Specifies the visibility level of the calendar and its accessibility to public users.
Allowed values :
disable - The calendar is not accessible via a public URL. Events in this calendar will not be visible to shared users.
freebusy - The public URL is accessible. Events in this calendar will be shown as Busy to shared users.
view - The public URL is accessible, and all event details are visible to shared users.
descriptionstring
Specifies the description of the calendar.
The maximum length of the description can be 1000.
textcolorstring
Specifies the Hex code of the preferred text color.
remindersJSONArray
Specifies the type of reminders to be set for the event. 
This JSON Array includes below params as JSONObject:
action string 
Allowed values: email or notification or popup
minutes integer, mandatory 
This should contain either positive(after) or negative(before) value. 
This parameter is mandatory only if reminders parameter is specified in calendarData JSON object.
Example: [{"action":"email|popup|notification","minutes":+15}]

statusboolean
Determines whether all events in the calendar should be visible.
Allowed values : 
true- enabled . This setting displays all events in the calendar (default).
false- disabled. This setting hides all events in the calendar.
 

Sample Request
https://calendar.zoho.com/api/v1/calendars?calendarData={"name":"New Calendar","color":"#101010","textcolor":"#FFFFFF","include_infreebusy":"true","timezone":"Asia/calcutta","description":"New Calendar","private":"enable","visibility":"true","public":"freebusy","reminders":[{"action":"email","minutes":15}]}
Sample Response
{
    "calendars": [
        {
            "owner": "58875431",
            "reminders": [
                {
                    "minutes": "+15",
                    "action": "email"
                }
            ],
            "color": "#101010",
            "visibility": true,
            "timezone": "Asia/calcutta",
            "textcolor": "#FFFFFF",
            "include_infreebusy": true,
            "description": "New Calendar",
            "type": 0,
            "uid": "2468c1df20934b42829fe429343d8c3b",
            "calendar_createdtime": 1612457951646,
            "name": "New Calendar",
            "alarm": [
                {
                    "action": "email",
                    "trigger": "+900000"
                }
            ],
            "ctag": 0,
            "isdefault": false,
            "calendar_modifiedtime": 1612457951646,
            "id": "2231390000003017005",
            "category": "own",
            "status": true,
            "order": 7,
            "caltype": "own",
            "lastmodifiedtime": "19700101T000000Z"
        }
    ]
}
© 2026, Zoho Corporation Pvt. Ltd. All Rights Reserved.


PUT - Update calendar
Purpose
This API is used to update an existing calendar.

Request URL
https://calendar.zoho.com/api/v1/calendars/<CALENDAR_UID>

OAuth Scope
scope=ZohoCalendar.calendar.ALL

(or)

scope=ZohoCalendar.calendar.UPDATE

ALL - Grants full access to calendars.

UPDATE - Grants access to update a calendar.

Path parameter
calendaruid string, mandatory
This represents the unique identifier for the calendar whose details needs to be updated.
This can be retrieved from Get Calendar List API.
Request Parameters
calendarData JSONobject, mandatory (mention atleast one parameter)
The calendarData JSONobject can be passed to update the given calendar using the following keys.

Input JSON keys
namestring
Specifies the name of the calendar.
The maximum length of the word can be 50.
colorstring
Specifies the Hex code of the preferred color.
Format :  #RRGGBB. Example: #000000 for black, #FFFFFF for white.
include_infreebusyboolean
Specifies whether this calendar should be considered for your Free/Busy.
Allowed values
true - All events in this calendar will be considered "Busy".
false - All events in this calendar will be considered "Free".
privatestring
Specifies whether the calendar can have a private URL or not. When a Calendar is made publicly viewable, it can still be accessible from a private URL for the other users with whom the calendar is shared with other permissions.
Allowed values :
enable- Calendar can be accessed through a private URL.
disable- Calendar cannot be accessed through a private URL.
timezonestring
Specifies the timezone information for the calendar that should be created.
Example: Asia/Kolkata
publicstring
Specifies the visibility level of the calendar and its accessibility to public users.
Allowed values :
disable - The calendar is not accessible via a public URL. Events in this calendar will not be visible to shared users.
freebusy - The public URL is accessible. Events in this calendar will be shown as Busy to shared users.
view - The public URL is accessible, and all event details are visible to shared users.
descriptionstring
Specifies the description of the calendar.
The maximum length of the description can be 1000.
textcolorstring
Specifies the Hex code of the preferred text color.
remindersJSONArray
Specifies the type of reminders to be set for the event.
This JSON Array includes below params as JSONObject:
action string
Allowed values: email or notification or popup
minutes integer, mandatory
This should contain either positive(after) or negative(before) value.
This parameter is mandatory only if reminders parameter is specified in calendarData JSON object.
Example: [{"action":"email|popup|notification","minutes":+15}]

statusboolean
Determines whether all events in the calendar should be visible.
Allowed values :
true- enabled . This setting displays all events in the calendar (default).
false- disabled. This setting hides all events in the calendar.
 

Sample Request
http://calendar.zoho.com/api/v1/calendars/2f0b2930f1e5428c8efba349d4c467d6?calendarData={"name": "visible calendar","include_infreebusy": false,"reminders":[{"action": "email", "minutes": 30}]}
Sample Response
{
    "calendars": [
        {
            "reminders": [
                {
                    "minutes": "+30",
                    "action": "email"
                }
            ],
            "color": "#8CBF40",
            "timezone": "Asia/Kolkata",
            "textcolor": "#000000",
            "description": "Add a new calendar",
            "privilege": "owner",
            "type": 0,
            "uid": "2f0b2930f1e5428c8efba349d4c467d6",
            "canSendMail": true,
            "modifiedtime": 1679290527402,
            "alarm": [
                {
                    "action": "email",
                    "trigger": "+1800000"
                }
            ],
            "allowed_conference": "zmeeting",
            "isdefault": false,
            "calendar_modifiedtime": 1679290527402,
            "id": "310935000000138001",
            "order": 6,
            "lastmodifiedtime": "20230218T053004Z",
            "owner": "70421274",
            "visibility": true,
            "include_infreebusy": false,
            "createdtime": 1679290202193,
            "calendar_createdtime": 1679290202193,
            "name": "visible calendar",
            "ctag": 1676698204278,
            "category": "own",
            "status": true,
            "caltype": "own"
        }
    ]
}   
© 2026, Zoho Corporation Pvt. Ltd. All Rights Reserved.

DELETE - Delete calendar
Purpose
This API is used to delete a calendar using the calendar identifier.

Request URL
https://calendar.zoho.com/api/v1/calendars/<calendaruid>

OAuth Scope
scope=ZohoCalendar.calendar.ALL

(or)

scope=ZohoCalendar.calendar.DELETE

 

ALL - Full access to calendars

DELETE - Deletes a calendar

Request Parameters
Parameter	Type	Description
calendaruid*	string	Calendar Identifier - Deletes the calendar based on the calendar identifier. The list of calendar identifiers can be retrieved using the "Get Calendars API".
* - Mandatory parameter

Sample Request
http://calendar.zoho.com/api/v1/calendars/rRjhA3SbTlC3kH1GZRq4hA==
Sample Response
{
  calendars: [
    {
      uid : rRjhA3SbTlC3kH1GZRq4hA==
      calstatus : deleted
    }
  ]
}