// CRM phone number search endpoint
// Searches contacts and accounts by phone number across multiple fields

import { db } from './_firebase.js';
import { cors } from './_cors.js';
import logger from './_logger.js';

// Normalize phone to last 10 digits for comparison
function norm10(v) {
  try { 
    return (v == null ? '' : String(v)).replace(/\D/g, '').slice(-10); 
  } catch(_) { 
    return ''; 
  }
}

export default async function handler(req, res) {
  cors(req, res);
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const phoneNumber = urlObj.searchParams.get('phone');
    
    logger.log('[Search] Incoming request for phone:', phoneNumber);
    
    if (!phoneNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Phone number required' }));
      return;
    }
    
    const searchDigits = norm10(phoneNumber);
    
    if (!searchDigits || searchDigits.length < 10) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid phone number' }));
      return;
    }
    
    logger.log('[Search] Normalized search digits:', searchDigits);
    
    // Search in Firestore if available
    if (!db) {
      logger.error('[Search] Firestore not initialized - check Firebase credentials');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Database not available',
        details: 'Firestore not initialized - check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY'
      }));
      return;
    }
    
    if (db) {
      let contactResult = null;
      let accountResult = null;
      
      // OPTIMIZED: Use direct Firestore queries instead of loading entire collections
      // This reduces Firestore reads from thousands to ~10-20 per search
      
      // Search contacts - query each phone field separately
      try {
        logger.log('[Search] Querying contacts by phone fields...');
        
        // Query all phone fields in parallel (Firestore doesn't support OR easily)
        const contactQueries = await Promise.allSettled([
          // Mobile phone variations
          db.collection('people').where('mobile', '==', searchDigits).limit(1).get(),
          db.collection('people').where('mobilePhone', '==', searchDigits).limit(1).get(),
          // Work phone variations
          db.collection('people').where('workDirectPhone', '==', searchDigits).limit(1).get(),
          db.collection('people').where('workPhone', '==', searchDigits).limit(1).get(),
          // Other phone
          db.collection('people').where('otherPhone', '==', searchDigits).limit(1).get()
        ]);
        
        // Check each query result and find first match
        for (const queryResult of contactQueries) {
          if (queryResult.status === 'fulfilled' && !queryResult.value.empty) {
            const doc = queryResult.value.docs[0];
            const data = doc.data();
            
            // Double-check with normalization (in case stored format differs)
            const mobile = norm10(data.mobile || data.mobilePhone || '');
            const work = norm10(data.workDirectPhone || data.workPhone || '');
            const other = norm10(data.otherPhone || '');
            
            if (mobile === searchDigits || work === searchDigits || other === searchDigits) {
              logger.log('[Search] Found matching contact:', doc.id, data.name);
              contactResult = {
                id: doc.id,
                contactId: doc.id,
                name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                title: data.title || data.jobTitle || '',
                email: data.email || '',
                mobile: data.mobile || data.mobilePhone || '',
                workDirectPhone: data.workDirectPhone || data.workPhone || '',
                otherPhone: data.otherPhone || '',
                account: data.account || data.accountName || data.companyName || data.company || '',
                accountId: data.accountId || data.account_id || '',
                city: data.city || '',
                state: data.state || '',
                domain: data.domain || data.website || ''
              };
              break;
            }
          }
        }
        
        if (!contactResult) {
          logger.log('[Search] No matching contact found');
        }
      } catch (e) {
        logger.error('[Search] Error searching contacts:', e.message);
      }
      
      // Search accounts - query each phone field separately
      try {
        logger.log('[Search] Querying accounts by phone fields...');
        
        // Query all account phone fields in parallel
        const accountQueries = await Promise.allSettled([
          db.collection('accounts').where('companyPhone', '==', searchDigits).limit(1).get(),
          db.collection('accounts').where('phone', '==', searchDigits).limit(1).get(),
          db.collection('accounts').where('primaryPhone', '==', searchDigits).limit(1).get(),
          db.collection('accounts').where('mainPhone', '==', searchDigits).limit(1).get()
        ]);
        
        // Check each query result and find first match
        for (const queryResult of accountQueries) {
          if (queryResult.status === 'fulfilled' && !queryResult.value.empty) {
            const doc = queryResult.value.docs[0];
            const data = doc.data();
            
            // Double-check with normalization
            const companyPhone = norm10(data.companyPhone || data.phone || data.primaryPhone || data.mainPhone || '');
            
            if (companyPhone === searchDigits) {
              logger.log('[Search] Found matching account:', doc.id, data.name);
              accountResult = {
                id: doc.id,
                accountId: doc.id,
                name: data.name || data.accountName || data.companyName || '',
                companyPhone: data.companyPhone || data.phone || data.primaryPhone || data.mainPhone || '',
                city: data.city || '',
                state: data.state || '',
                domain: data.domain || data.website || '',
                logoUrl: data.logoUrl || ''
              };
              break;
            }
          }
        }
        
        if (!accountResult) {
          logger.log('[Search] No matching account found');
        }
      } catch (e) {
        logger.error('[Search] Error searching accounts:', e.message);
      }
      
      // Return results
      if (contactResult) {
        logger.log('[Search] Returning contact result');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          contact: contactResult,
          account: accountResult || null
        }));
        return;
      }
      
      if (accountResult) {
        logger.log('[Search] Returning account result');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          contact: null,
          account: accountResult
        }));
        return;
      }
      
      logger.log('[Search] No results found - returning 404');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Phone number not found in CRM'
      }));
      return;
    }
    
    // No Firestore - return not found
    logger.log('[Search] Firestore not available - returning 404');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Phone number not found in CRM'
    }));
    return;
    
  } catch (error) {
    logger.error('[Search] Error:', error);
    logger.error('[Search] Error stack:', error.stack);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Search failed',
      details: error.message 
    }));
    return;
  }
}

