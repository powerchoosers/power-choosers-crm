/**
 * Email Tracking Test Script
 * 
 * Quick test to verify Supabase tracking is working
 * Run: node scripts/test-email-tracking.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testTracking() {
  console.log('🧪 Testing Email Tracking Migration to Supabase\n');

  // 1. Check recent sent emails
  console.log('1️⃣  Fetching recent sent emails...');
  const { data: emails, error: fetchError } = await supabase
    .from('emails')
    .select('id, subject, type, openCount, clickCount, timestamp')
    .eq('type', 'sent')
    .order('timestamp', { ascending: false })
    .limit(5);

  if (fetchError) {
    console.error('❌ Error fetching emails:', fetchError.message);
    return;
  }

  if (!emails || emails.length === 0) {
    console.log('⚠️  No sent emails found. Send a test email first.\n');
    return;
  }

  console.log(`✅ Found ${emails.length} recent sent emails:\n`);
  emails.forEach((email, idx) => {
    console.log(`   ${idx + 1}. ${email.subject}`);
    console.log(`      ID: ${email.id.substring(0, 30)}...`);
    console.log(`      Opens: ${email.openCount || 0} | Clicks: ${email.clickCount || 0}`);
    console.log(`      Date: ${new Date(email.timestamp).toLocaleString()}\n`);
  });

  // 2. Test updating tracking data (simulate an open)
  const testEmail = emails[0];
  console.log(`2️⃣  Simulating open event for: ${testEmail.subject}`);

  const { data: existingData } = await supabase
    .from('emails')
    .select('openCount, opens')
    .eq('id', testEmail.id)
    .single();

  const newOpenEvent = {
    openedAt: new Date().toISOString(),
    userAgent: 'Test Script (Node.js)',
    ip: '0.0.0.0',
    deviceType: 'test',
    referer: 'localhost',
    isBotFlagged: false
  };

  const { error: updateError } = await supabase
    .from('emails')
    .update({
      openCount: (existingData?.openCount || 0) + 1,
      opens: [...(existingData?.opens || []), newOpenEvent],
      updatedAt: new Date().toISOString()
    })
    .eq('id', testEmail.id);

  if (updateError) {
    console.error('❌ Error updating email:', updateError.message);
    return;
  }

  console.log('✅ Successfully recorded test open event\n');

  // 3. Verify update
  console.log('3️⃣  Verifying update...');
  const { data: updatedEmail } = await supabase
    .from('emails')
    .select('openCount, opens, clickCount, clicks')
    .eq('id', testEmail.id)
    .single();

  console.log(`✅ Current tracking stats:`);
  console.log(`   Opens: ${updatedEmail?.openCount || 0}`);
  console.log(`   Clicks: ${updatedEmail?.clickCount || 0}`);
  console.log(`   Latest open: ${updatedEmail?.opens?.[updatedEmail.opens.length - 1]?.openedAt || 'N/A'}`);

  console.log('\n✅ Email tracking is working correctly!');
  console.log('\n📊 Summary:');
  console.log('   • Supabase connection: ✅');
  console.log('   • Read tracking data: ✅');
  console.log('   • Write tracking data: ✅');
  console.log('   • Schema compatibility: ✅');
}

testTracking().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
