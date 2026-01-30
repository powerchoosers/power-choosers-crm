import { supabaseAdmin } from '../api/_supabase.js';
import { generateEmbedding } from '../api/utils/embeddings.js';
import logger from '../api/_logger.js';

async function backfillTable(tableName, textFields) {
  logger.log(`[Backfill] Starting backfill for table: ${tableName}`);
  
  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch rows with null embedding
    const { data: rows, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .is('embedding', null)
      .limit(50); // Smaller batches for better reliability

    if (error) {
      logger.error(`[Backfill] Error fetching ${tableName}:`, error);
      break;
    }

    if (!rows || rows.length === 0) {
      hasMore = false;
      continue;
    }

    logger.log(`[Backfill] Processing batch of ${rows.length} rows for ${tableName} (Total so far: ${totalProcessed})`);

    for (const row of rows) {
      // Construct text representation
      let textParts = textFields.map(field => {
          return row[field] || '';
      });
      
      // Special handling for JSON fields or metadata
      if (tableName === 'accounts' && row.metadata) {
          if (row.metadata.industry) textParts.push(row.metadata.industry);
          if (row.metadata.description) textParts.push(row.metadata.description);
          if (row.metadata.general?.description) textParts.push(row.metadata.general.description);
      }

      if (tableName === 'contacts' && row.metadata) {
          if (row.metadata.notes) textParts.push(row.metadata.notes);
          if (row.metadata.general?.notes) textParts.push(row.metadata.general.notes);
          if (row.metadata.title) textParts.push(row.metadata.title);
      }

      if (tableName === 'calls') {
          if (row.transcript) textParts.push(row.transcript);
          if (row.summary) textParts.push(row.summary);
      }

      if (tableName === 'call_details') {
          if (row.transcript) textParts.push(row.transcript);
          if (row.formattedTranscript) textParts.push(row.formattedTranscript);
      }
      
      if (tableName === 'emails') {
          // Fallback to HTML if text is empty, but strip tags roughly
          if (!row.text && row.html) {
             const stripped = row.html.replace(/<[^>]*>?/gm, ' ');
             textParts.push(stripped);
          }
      }

      const textToEmbed = textParts.join(' ').replace(/\s+/g, ' ').trim();
      
      if (!textToEmbed || textToEmbed.length < 2) {
        logger.warn(`[Backfill] No text content for ${tableName} ID ${row.id}. Marking with zero vector.`);
        const zeroVector = Array(768).fill(0);
        await supabaseAdmin.from(tableName).update({ embedding: zeroVector }).eq('id', row.id);
        continue; 
      }

      try {
        const embedding = await generateEmbedding(textToEmbed);
        
        if (embedding) {
          const { error: updateError } = await supabaseAdmin
            .from(tableName)
            .update({ embedding })
            .eq('id', row.id);
            
          if (updateError) {
            logger.error(`[Backfill] Failed to update ${tableName} ID ${row.id}:`, updateError);
          } else {
            totalProcessed++;
          }
        } else {
            // If generation failed but text existed, mark with zero vector to avoid infinite loop
            logger.warn(`[Backfill] Embedding generation failed for ${tableName} ID ${row.id}. Marking with zero vector.`);
            const zeroVector = Array(768).fill(0);
            await supabaseAdmin.from(tableName).update({ embedding: zeroVector }).eq('id', row.id);
        }
      } catch (e) {
        logger.error(`[Backfill] Critical error processing ${tableName} ID ${row.id}:`, e);
      }

      // Rate limit kindness
      await new Promise(resolve => setTimeout(resolve, 100)); 
    }
  }

  logger.log(`[Backfill] Completed ${tableName}: ${totalProcessed} rows updated.`);
}

async function run() {
  await backfillTable('accounts', ['name', 'industry', 'description', 'city', 'state']);
  await backfillTable('contacts', ['first_name', 'last_name', 'name', 'email', 'title', 'notes', 'city', 'state']);
  await backfillTable('emails', ['subject', 'text', 'from']); 
  await backfillTable('calls', ['transcript', 'summary']);
  await backfillTable('call_details', ['transcript', 'formattedTranscript']);
  
  logger.log('[Backfill] Full process finished.');
}

run();
