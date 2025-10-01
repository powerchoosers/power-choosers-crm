const cors = require('./_cors');
const { initializeFirebase } = require('./_firebase');

export default async function handler(req, res) {
    cors(req, res);
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone number required' });
        }
        
        // Normalize phone number (digits only)
        const normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.length < 10) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }
        
        const { db } = await initializeFirebase();
        
        // Search contacts by phone number
        const contactsSnapshot = await db.collection('contacts')
            .where('phone', '==', normalizedPhone)
            .limit(1)
            .get();
        
        let contact = null;
        if (!contactsSnapshot.empty) {
            const doc = contactsSnapshot.docs[0];
            contact = { id: doc.id, ...doc.data() };
        }
        
        // If no contact found, try other phone fields
        if (!contact) {
            const contactsSnapshot2 = await db.collection('contacts')
                .where('mobile', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (!contactsSnapshot2.empty) {
                const doc = contactsSnapshot2.docs[0];
                contact = { id: doc.id, ...doc.data() };
            }
        }
        
        if (!contact) {
            const contactsSnapshot3 = await db.collection('contacts')
                .where('workDirectPhone', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (!contactsSnapshot3.empty) {
                const doc = contactsSnapshot3.docs[0];
                contact = { id: doc.id, ...doc.data() };
            }
        }
        
        if (!contact) {
            const contactsSnapshot4 = await db.collection('contacts')
                .where('otherPhone', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (!contactsSnapshot4.empty) {
                const doc = contactsSnapshot4.docs[0];
                contact = { id: doc.id, ...doc.data() };
            }
        }
        
        // Search accounts by company phone
        let account = null;
        if (!contact) {
            const accountsSnapshot = await db.collection('accounts')
                .where('companyPhone', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (!accountsSnapshot.empty) {
                const doc = accountsSnapshot.docs[0];
                account = { id: doc.id, ...doc.data() };
            }
        }
        
        if (!account) {
            const accountsSnapshot2 = await db.collection('accounts')
                .where('phone', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (!accountsSnapshot2.empty) {
                const doc = accountsSnapshot2.docs[0];
                account = { id: doc.id, ...doc.data() };
            }
        }
        
        // If we found a contact, try to get their associated account
        if (contact && !account && contact.accountId) {
            try {
                const accountDoc = await db.collection('accounts').doc(contact.accountId).get();
                if (accountDoc.exists) {
                    account = { id: accountDoc.id, ...accountDoc.data() };
                }
            } catch (error) {
                console.warn('[Search] Failed to fetch associated account:', error);
            }
        }
        
        // Return the found data
        const result = {
            found: !!(contact || account),
            contact: contact ? {
                id: contact.id,
                name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '',
                title: contact.title || '',
                company: contact.companyName || contact.company || contact.account || '',
                city: contact.city || contact.locationCity || '',
                state: contact.state || contact.locationState || '',
                domain: contact.accountDomain || contact.accountWebsite || contact.website || '',
                logoUrl: contact.accountLogoUrl || ''
            } : null,
            account: account ? {
                id: account.id,
                name: account.accountName || account.name || account.companyName || '',
                city: account.city || account.locationCity || '',
                state: account.state || account.locationState || '',
                domain: account.domain || account.website || account.site || '',
                logoUrl: account.logoUrl || ''
            } : null
        };
        
        res.status(200).json(result);
        
    } catch (error) {
        console.error('[Search] Error:', error);
        res.status(500).json({ 
            error: 'Failed to search CRM', 
            details: error.message 
        });
    }
}
