Make an outbound call
This code snippet makes an outbound call and plays a text-to-speech message when the call is answered.

Example
Replace the following variables in the example code:

Key	Description
VONAGE_VIRTUAL_NUMBER	
Your Vonage Number. E.g. 447700900000

VOICE_TO_NUMBER	
The recipient number to call, e.g. 447700900002.

VOICE_ANSWER_URL	
The answer URL. For example https://raw.githubusercontent.com/nexmo-community/ncco-examples/gh-pages/text-to-speech.json.

Prerequisites

Generate your JWT
Execute the following command at your terminal prompt to create the JWT for authentication:


export JWT=$(nexmo jwt:generate $PATH_TO_PRIVATE_KEY application_id=$NEXMO_APPLICATION_ID)
Write the code
Add the following to make-an-outbound-call.sh:


curl -X POST https://api.nexmo.com/v1/calls\
  -H "Authorization: Bearer $JWT"\
  -H "Content-Type: application/json"\
  -d '{"to":[{"type": "phone","number": "'$VOICE_TO_NUMBER'"}],
      "from": {"type": "phone","number": "'$VONAGE_VIRTUAL_NUMBER'"},
      "answer_url":["'"$VOICE_ANSWER_URL"'"]}'
View full source

Run your code
Save this file to your machine and run it:

bash make-an-outbound-call.sh
Try it out
When you run the code the TO_NUMBER will be called and a text-to-speech message will be heard if the call is answered.

Further Reading
Voice Notifications - In this guide, you will learn how to contact a list of people by phone, convey a message, and see who confirmed that they had received the message. These voice-based critical alerts are more persistent than a text message, making your message more likely to be noticed. Additionally, with the recipient confirmation, you can be sure that your message made it through.
Conference Calling - This guide explains the two concepts Vonage associates with a call, a leg and a conversation.
Voice Bot with Google Dialogflow - This guide will help you to start with an example Dialogflow bot and interact with it from phone calls using provided sample reference codes using Vonage Voice API.