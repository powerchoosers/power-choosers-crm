// CRM phone number search endpoint
// Searches contacts and accounts by phone number across multiple fields

const { db } = require('./_firebase');
const cors = require('./_cors');

// Normalize phone to last 10 digits for comparison
function norm10(v) {
  try { 
    return (v == null ? '' : String(v)).replace(/\D/g, '').slice(-10); 
  } catch(_) { 
    return ''; 
  }
}

module.exports = async function handler(req, res) {
  cors(req, res);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const phoneNumber = urlObj.searchParams.get('phone');
    
    console.log('[Search] Incoming request for phone:', phoneNumber);
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    const searchDigits = norm10(phoneNumber);
    
    if (!searchDigits || searchDigits.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    console.log('[Search] Normalized search digits:', searchDigits);
    
    // Search in Firestore if available
    if (!db) {
      console.error('[Search] Firestore not initialized - check Firebase credentials');
      return res.status(500).json({ 
        error: 'Database not available',
        details: 'Firestore not initialized - check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY'
      });
    }
    
    if (db) {
      let contactResult = null;
      let accountResult = null;
      
      // Search contacts
      try {
        console.log('[Search] Searching contacts collection...');
        const contactsSnap = await db.collection('people').get();
        console.log('[Search] Found', contactsSnap.docs.length, 'contacts to search');
        
        for (const doc of contactsSnap.docs) {
          const data = doc.data();
          const mobile = norm10(data.mobile || data.mobilePhone || '');
          const work = norm10(data.workDirectPhone || data.workPhone || '');
          const other = norm10(data.otherPhone || '');
          
          if (mobile === searchDigits || work === searchDigits || other === searchDigits) {
            console.log('[Search] Found matching contact:', doc.id, data.name);
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
        
        if (!contactResult) {
          console.log('[Search] No matching contact found');
        }
      } catch (e) {
        console.error('[Search] Error searching contacts:', e.message);
      }
      
      // Search accounts (company phones)
      try {
        console.log('[Search] Searching accounts collection...');
        const accountsSnap = await db.collection('accounts').get();
        console.log('[Search] Found', accountsSnap.docs.length, 'accounts to search');
        
        for (const doc of accountsSnap.docs) {
          const data = doc.data();
          const companyPhone = norm10(data.companyPhone || data.phone || '');
          
          if (companyPhone === searchDigits) {
            console.log('[Search] Found matching account:', doc.id, data.name);
            accountResult = {
              id: doc.id,
              accountId: doc.id,
              name: data.name || data.accountName || data.companyName || '',
              companyPhone: data.companyPhone || data.phone || '',
              city: data.city || '',
              state: data.state || '',
              domain: data.domain || data.website || '',
              logoUrl: data.logoUrl || ''
            };
            break;
          }
        }
        
        if (!accountResult) {
          console.log('[Search] No matching account found');
        }
      } catch (e) {
        console.error('[Search] Error searching accounts:', e.message);
      }
      
      // Return results
      if (contactResult) {
        console.log('[Search] Returning contact result');
        return res.status(200).json({
          success: true,
          contact: contactResult,
          account: accountResult || null
        });
      }
      
      if (accountResult) {
        console.log('[Search] Returning account result');
        return res.status(200).json({
          success: true,
          contact: null,
          account: accountResult
        });
      }
      
      console.log('[Search] No results found - returning 404');
      return res.status(404).json({
        success: false,
        error: 'Phone number not found in CRM'
      });
    }
    
    // No Firestore - return not found
    console.log('[Search] Firestore not available - returning 404');
    return res.status(404).json({
      success: false,
      error: 'Phone number not found in CRM'
    });
    
  } catch (error) {
    console.error('[Search] Error:', error);
    console.error('[Search] Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Search failed',
      details: error.message 
    });
  }
}

