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

export default async function handler(req, res) {
  cors(req, res);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const phoneNumber = urlObj.searchParams.get('phone');
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    const searchDigits = norm10(phoneNumber);
    
    if (!searchDigits || searchDigits.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    // Search in Firestore if available
    if (db) {
      let contactResult = null;
      let accountResult = null;
      
      // Search contacts
      try {
        const contactsSnap = await db.collection('people').get();
        
        for (const doc of contactsSnap.docs) {
          const data = doc.data();
          const mobile = norm10(data.mobile || data.mobilePhone || '');
          const work = norm10(data.workDirectPhone || data.workPhone || '');
          const other = norm10(data.otherPhone || '');
          
          if (mobile === searchDigits || work === searchDigits || other === searchDigits) {
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
      } catch (e) {
        console.error('[Search] Error searching contacts:', e.message);
      }
      
      // Search accounts (company phones)
      try {
        const accountsSnap = await db.collection('accounts').get();
        
        for (const doc of accountsSnap.docs) {
          const data = doc.data();
          const companyPhone = norm10(data.companyPhone || data.phone || '');
          
          if (companyPhone === searchDigits) {
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
      } catch (e) {
        console.error('[Search] Error searching accounts:', e.message);
      }
      
      // Return results
      if (contactResult) {
        return res.status(200).json({
          success: true,
          contact: contactResult,
          account: accountResult || null
        });
      }
      
      if (accountResult) {
        return res.status(200).json({
          success: true,
          contact: null,
          account: accountResult
        });
      }
      
      return res.status(404).json({
        success: false,
        error: 'Phone number not found in CRM'
      });
    }
    
    // No Firestore - return not found
    return res.status(404).json({
      success: false,
      error: 'Phone number not found in CRM'
    });
    
  } catch (error) {
    console.error('[Search] Error:', error);
    return res.status(500).json({ 
      error: 'Search failed',
      details: error.message 
    });
  }
}

