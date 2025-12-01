// Test Gmail API Connection
// Run this in Cloud Shell or locally to verify Gmail API works
// Usage: node test-gmail-connection.js

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testGmailConnection() {
  console.log('Testing Gmail API Connection...\n');

  try {
    // Try to get service account key from environment or file
    let keyJson;
    
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.log('✓ Found GOOGLE_SERVICE_ACCOUNT_KEY in environment');
      keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8');
    } else {
      console.log('⚠ GOOGLE_SERVICE_ACCOUNT_KEY not in environment, trying file...');
      const keyPath = join(__dirname, 'gmail-service-account.json');
      keyJson = readFileSync(keyPath, 'utf8');
      console.log('✓ Found service account key file');
    }

    const key = JSON.parse(keyJson);
    console.log(`✓ Service account: ${key.client_email}\n`);

    // Test email to impersonate (use your email)
    const testEmail = process.env.TEST_EMAIL || 'l.patterson@powerchoosers.com';
    console.log(`Testing with impersonation: ${testEmail}\n`);

    // Create JWT auth
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: testEmail
    });

    console.log('Initializing Gmail API...');
    const gmail = google.gmail({ version: 'v1', auth });

    // Test: Get user profile (this verifies authentication works)
    console.log('Testing authentication...');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    console.log('✓ Authentication successful!');
    console.log(`✓ Email address: ${profile.data.emailAddress}`);
    console.log(`✓ Messages total: ${profile.data.messagesTotal}`);
    console.log(`✓ Threads total: ${profile.data.threadsTotal}\n`);

    // Test: Try to send a test email (commented out to avoid sending)
    console.log('✓ Gmail API connection verified!');
    console.log('\nTo test sending, uncomment the send test section in this script.\n');

    // Uncomment below to actually send a test email:
    /*
    console.log('Sending test email...');
    const testMessage = [
      'From: ' + testEmail,
      'To: ' + testEmail, // Send to yourself
      'Subject: Gmail API Test',
      '',
      'This is a test email from Gmail API integration.'
    ].join('\r\n');

    const encoded = Buffer.from(testMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded }
    });

    console.log('✓ Test email sent!');
    console.log(`  Message ID: ${result.data.id}`);
    */

    console.log('✅ All tests passed! Gmail API is ready to use.');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('Error:', error.message);
    
    if (error.code === 403) {
      console.error('\nPossible issues:');
      console.error('1. Domain-Wide Delegation not configured in Google Workspace Admin');
      console.error('2. Wrong Client ID in Domain-Wide Delegation');
      console.error('3. Missing scope: https://www.googleapis.com/auth/gmail.send');
      console.error('4. Service account does not have permission');
    } else if (error.code === 401) {
      console.error('\nPossible issues:');
      console.error('1. Service account key is invalid or expired');
      console.error('2. Service account key not properly base64 encoded');
    }
    
    process.exit(1);
  }
}

testGmailConnection();

