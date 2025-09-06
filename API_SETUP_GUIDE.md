# API Setup Guide for Power Choosers CRM

## Required Environment Variables

To use real Twilio and Gemini APIs instead of demo data, you need to set up the following environment variables:

### 1. Google/Gemini API Setup

1. **Get your Gemini API key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key

2. **Set the environment variable:**
   ```bash
   # Windows PowerShell
   $env:GOOGLE_API_KEY="your_gemini_api_key_here"
   
   # Windows Command Prompt
   set GOOGLE_API_KEY=your_gemini_api_key_here
   
   # Linux/Mac
   export GOOGLE_API_KEY="your_gemini_api_key_here"
   ```

### 2. Twilio API Setup

1. **Get your Twilio credentials:**
   - Go to [Twilio Console](https://console.twilio.com/)
   - Find your Account SID and Auth Token
   - Get a phone number from Twilio

2. **Set the environment variables:**
   ```bash
   # Windows PowerShell
   $env:TWILIO_ACCOUNT_SID="your_twilio_account_sid"
   $env:TWILIO_AUTH_TOKEN="your_twilio_auth_token"
   $env:TWILIO_PHONE_NUMBER="your_twilio_phone_number"
   
   # Windows Command Prompt
   set TWILIO_ACCOUNT_SID=your_twilio_account_sid
   set TWILIO_AUTH_TOKEN=your_twilio_auth_token
   set TWILIO_PHONE_NUMBER=your_twilio_phone_number
   
   # Linux/Mac
   export TWILIO_ACCOUNT_SID="your_twilio_account_sid"
   export TWILIO_AUTH_TOKEN="your_twilio_auth_token"
   export TWILIO_PHONE_NUMBER="your_twilio_phone_number"
   ```

### 3. Restart Your Server

After setting the environment variables, restart your server:

```bash
node server.js --port 3000
```

## How It Works

1. **Call Recording**: When you make calls through Twilio, they get recorded
2. **Transcription**: Google Speech-to-Text converts recordings to text
3. **AI Analysis**: Gemini analyzes the transcript and generates insights
4. **Call Insights**: The insights appear in your CRM's call insights modal

## Testing

1. Make a test call through your Twilio integration
2. Check the browser console for logs like:
   - `[Calls] Loading real call data from: ...`
   - `[Calls] Found X real calls from API`
3. Open call insights to see AI-generated summaries and analysis

## Troubleshooting

- **No calls showing**: Check that your Twilio webhooks are configured
- **No AI insights**: Verify your Gemini API key is working
- **Still seeing demo data**: Check browser console for API connection errors

## Current Status

The system is now configured to:
- ✅ Prioritize real API data over demo data
- ✅ Show detailed logging in browser console
- ✅ Fall back to demo data only when APIs aren't available
- ✅ Display proper error messages when APIs fail

