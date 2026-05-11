import algoliasearch from 'algoliasearch';
import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { appId, apiKey, type } = req.body;

    if (!appId || !apiKey || !type) {
      res.status(400).json({ error: 'Missing required parameters: appId, apiKey, and type' });
      return;
    }

    if (!['accounts', 'contacts'].includes(type)) {
      res.status(400).json({ error: 'Type must be either "accounts" or "contacts"' });
      return;
    }

    // Initialize Algolia client (server-side)
    const client = algoliasearch(appId, apiKey);
    const index = client.initIndex(type);

    // Get data from Supabase
    const { data: records, error: fetchError } = await supabaseAdmin
      .from(type)
      .select('*');

    if (fetchError) {
      logger.error(`[Algolia Reindex] Failed to fetch ${type} from Supabase:`, fetchError);
      res.status(500).json({ error: 'Failed to fetch data from database', details: fetchError.message });
      return;
    }

    if (!records || records.length === 0) {
      res.status(200).json({
        success: true,
        processed: 0,
        total: 0,
        message: `No ${type} found in Supabase`
      });
      return;
    }

    // Prepare records for Algolia
    const algoliaRecords = records.map(record => {
      return {
        objectID: record.id,
        ...record,
        updatedAt: new Date().toISOString()
      };
    });

    // Batch upload to Algolia
    const batchSize = 100;
    let processed = 0;
    let errors = 0;
    const batches = [];

    // Create batches
    for (let i = 0; i < algoliaRecords.length; i += batchSize) {
      batches.push(algoliaRecords.slice(i, i + batchSize));
    }

    // Process batches
    for (let i = 0; i < batches.length; i++) {
      try {
        const batch = batches[i];
        const response = await index.saveObjects(batch);
        processed += batch.length;
        logger.log(`Batch ${i + 1}/${batches.length} complete: ${response.objectIDs.length} records indexed`);
      } catch (batchError) {
        logger.error(`Error processing batch ${i + 1}:`, batchError);
        errors += batches[i].length;
      }
    }

    // Verify the index was updated
    let verificationCount = 0;
    try {
      const searchResponse = await index.search('');
      verificationCount = searchResponse.nbHits;
    } catch (verifyError) {
      logger.warn('Could not verify index count:', verifyError.message);
    }

    res.status(200).json({
      success: true,
      processed,
      errors,
      total: algoliaRecords.length,
      verificationCount,
      message: `Reindex complete! Processed ${processed} ${type}, ${errors} errors`
    });

  } catch (error) {
    logger.error('Reindex error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
}
