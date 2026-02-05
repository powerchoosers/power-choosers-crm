#!/usr/bin/env node
/**
 * Backfill Embeddings Script
 * 
 * Generates embeddings for all accounts, contacts, and emails that don't have them yet.
 * Uses the same embedding generation function as the API.
 * 
 * Usage: node scripts/backfill-embeddings.js [--table=accounts|contacts|emails|all]
 */

import { generateEmbedding } from '../api/utils/embeddings.js';
import { supabaseAdmin } from '../api/_supabase.js';

const args = process.argv.slice(2);
const tableArg = args.find(arg => arg.startsWith('--table='));
const targetTable = tableArg ? tableArg.split('=')[1] : 'all';

// Progress tracking
let processed = 0;
let succeeded = 0;
let failed = 0;
let skipped = 0;

// Rate limiting (to avoid hitting API limits)
const BATCH_SIZE = 5; // Process 5 at a time
const DELAY_MS = 500; // 500ms delay between batches

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateAccountEmbedding(account) {
  const text = [
    'Account Name: ' + (account.name || ''),
    'Industry: ' + (account.industry || ''),
    'Description: ' + (account.description || ''),
    'Location: ' + (account.city || '') + ', ' + (account.state || '')
  ].join('\n');
  
  return generateEmbedding(text);
}

async function generateContactEmbedding(contact) {
  const text = [
    'Contact Name: ' + (contact.firstName || '') + ' ' + (contact.lastName || ''),
    'Title: ' + (contact.title || ''),
    'Email: ' + (contact.email || ''),
    'Location: ' + (contact.city || '') + ', ' + (contact.state || '')
  ].join('\n');
  
  return generateEmbedding(text);
}

async function generateEmailEmbedding(email) {
  const text = [
    'Subject: ' + (email.subject || ''),
    'From: ' + (email.from || ''),
    'Body: ' + (email.text || '').substring(0, 2000)
  ].join('\n');
  
  return generateEmbedding(text);
}

async function backfillTable(tableName, embeddingFn, columns = '*') {
  console.log(`\n🔍 Fetching ${tableName} without embeddings...`);
  
  const { data: records, error } = await supabaseAdmin
    .from(tableName)
    .select(columns)
    .is('embedding', null);
  
  if (error) {
    console.error(`❌ Error fetching ${tableName}:`, error);
    return;
  }
  
  if (!records || records.length === 0) {
    console.log(`✅ All ${tableName} already have embeddings!`);
    return;
  }
  
  console.log(`📦 Found ${records.length} ${tableName} to process`);
  
  // Process in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (record) => {
      try {
        const embedding = await embeddingFn(record);
        
        if (!embedding) {
          console.log(`⚠️  Skipped ${tableName} ${record.id} - no embedding generated`);
          skipped++;
          return;
        }
        
        const { error: updateError } = await supabaseAdmin
          .from(tableName)
          .update({ embedding })
          .eq('id', record.id);
        
        if (updateError) {
          console.error(`❌ Failed to update ${tableName} ${record.id}:`, updateError);
          failed++;
        } else {
          succeeded++;
          if (succeeded % 10 === 0) {
            console.log(`✅ Progress: ${succeeded}/${records.length} ${tableName}`);
          }
        }
      } catch (err) {
        console.error(`❌ Error processing ${tableName} ${record.id}:`, err.message);
        failed++;
      }
      
      processed++;
    }));
    
    // Rate limit between batches
    if (i + BATCH_SIZE < records.length) {
      await sleep(DELAY_MS);
    }
  }
  
  console.log(`\n✅ Completed ${tableName}:`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
}

async function main() {
  console.log('🚀 Starting embedding backfill...\n');
  console.log(`Target: ${targetTable}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay: ${DELAY_MS}ms between batches\n`);
  
  const startTime = Date.now();
  
  if (targetTable === 'accounts' || targetTable === 'all') {
    await backfillTable('accounts', generateAccountEmbedding);
  }
  
  if (targetTable === 'contacts' || targetTable === 'all') {
    // Reset counters
    processed = 0; succeeded = 0; failed = 0; skipped = 0;
    await backfillTable('contacts', generateContactEmbedding);
  }
  
  if (targetTable === 'emails' || targetTable === 'all') {
    // Reset counters
    processed = 0; succeeded = 0; failed = 0; skipped = 0;
    await backfillTable('emails', generateEmailEmbedding);
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n🎉 Backfill complete in ${duration}s!`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
