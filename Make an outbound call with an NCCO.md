Make an outbound call with an NCCO
This code snippet makes an outbound call and plays a text-to-speech message when the call is answered. You don't need to run a server hosting an answer_url to run this code snippet, as you provide your NCCO as part of the request

Example
Replace the following variables in the example code:

Key	Description
VONAGE_VIRTUAL_NUMBER	
Your Vonage Number. E.g. 447700900000

VOICE_TO_NUMBER	
The recipient number to call, e.g. 447700900002.

Prerequisites

Generate your JWT
Execute the following command at your terminal prompt to create the JWT for authentication:


export JWT=$(nexmo jwt:generate $PATH_TO_PRIVATE_KEY application_id=$NEXMO_APPLICATION_ID)
Write the code
Add the following to make-an-outbound-call-with-ncco.sh:


curl -X POST https://api.nexmo.com/v1/calls\
  -H "Authorization: Bearer $JWT"\
  -H "Content-Type: application/json"\
  -d '{"to":[{"type": "phone","number": "'$VOICE_TO_NUMBER'"}],
      "from": {"type": "phone","number": "'$VONAGE_VIRTUAL_NUMBER'"},
      "ncco": [
        {
          "action": "talk",
          "text": "This is a text to speech call from Vonage"
        }
      ]}'
View full source

Run your code
Save this file to your machine and run it:

sh make-an-outbound-call-with-ncco.sh
Try it out
When you run the code the VOICE_TO_NUMBER will be called and a text-to-speech message will be heard if the call is answered.

Further Reading
Voice Notifications - In this guide, you will learn how to contact a list of people by phone, convey a message, and see who confirmed that they had received the message. These voice-based critical alerts are more persistent than a text message, making your message more likely to be noticed. Additionally, with the recipient confirmation, you can be sure that your message made it through.
Conference Calling - This guide explains the two concepts Vonage associates with a call, a leg and a conversation.
Voice Bot with Google Dialogflow - This guide will help you to start with an example Dialogflow bot and interact with it from phone calls using provided sample reference codes using Vonage Voice API.