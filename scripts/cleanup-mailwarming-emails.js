/**
 * Cleanup Mailwarming Emails Script
 * 
 * Removes Apollo mailwarming and other automated warmup emails from Supabase
 * Run: node scripts/cleanup-mailwarming-emails.js
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

const MAILWARMING_PATTERNS = [
  { field: 'subject', pattern: '%mailwarming%' },
  { field: 'subject', pattern: '%mail warming%' },
  { field: 'subject', pattern: '%test email%' },
  { field: 'from', pattern: '%apollo.io%' },
  { field: 'from', pattern: '%mailwarm%' },
  { field: 'from', pattern: '%lemwarm%' },
  { field: 'from', pattern: '%warmup%' },
];

async function cleanupMailwarmingEmails() {
  console.log('🧹 Cleaning up mailwarming emails from Supabase\n');

  let totalDeleted = 0;

  for (const { field, pattern } of MAILWARMING_PATTERNS) {
    console.log(`🔍 Searching for emails where ${field} matches "${pattern}"...`);

    // First, count how many match
    const { count, error: countError } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .ilike(field, pattern);

    if (countError) {
      console.error(`   ❌ Error counting: ${countError.message}`);
      continue;
    }

    if (count === 0) {
      console.log(`   ✓ No matches found\n`);
      continue;
    }

    console.log(`   Found ${count} emails to delete`);

    // Delete them
    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .ilike(field, pattern);

    if (deleteError) {
      console.error(`   ❌ Error deleting: ${deleteError.message}\n`);
      continue;
    }

    console.log(`   ✅ Deleted ${count} emails\n`);
    totalDeleted += count;
  }

  console.log(`\n✅ Cleanup complete! Removed ${totalDeleted} mailwarming emails total.`);
  
  // Show remaining email count
  const { count: remainingCount } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true });

  console.log(`📊 Remaining emails in database: ${remainingCount}`);
}

// Add dry-run mode
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No emails will be deleted\n');
  
  (async () => {
    let totalFound = 0;
    
    for (const { field, pattern } of MAILWARMING_PATTERNS) {
      const { count, data } = await supabase
        .from('emails')
        .select('id, subject, from')
        .ilike(field, pattern)
        .limit(5);

      if (count > 0) {
        console.log(`\n📧 Found ${count} emails matching ${field} "${pattern}":`);
        data.slice(0, 3).forEach(email => {
          console.log(`   - ${email.subject} (from: ${email.from})`);
        });
        totalFound += count;
      }
    }
    
    console.log(`\n📊 Total mailwarming emails found: ${totalFound}`);
    console.log('\n💡 Run without --dry-run to delete these emails.');
  })();
} else {
  cleanupMailwarmingEmails().catch(err => {
    console.error('❌ Cleanup failed:', err.message);
    process.exit(1);
  });
}
