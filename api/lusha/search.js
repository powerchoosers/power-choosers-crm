const cors = require('../_cors');

// Lusha API configuration
const LUSHA_API_KEY = '1e97bb11-eac3-4b20-8491-02f9b7d783b7';
const LUSHA_BASE_URL = 'https://api.lusha.com';

module.exports = async (req, res) => {
  // Handle CORS
  cors(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { companyName, firstName, lastName, email } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Prepare search parameters for Lusha API
    const searchParams = {
      companyName: companyName
    };

    // Add optional parameters if provided
    if (firstName) searchParams.firstName = firstName;
    if (lastName) searchParams.lastName = lastName;
    if (email) searchParams.email = email;

    // Use POST /v2/person for searching multiple contacts by company
    // According to Lusha docs, we need firstName AND lastName AND companyName
    // We'll create a few sample contacts to search for at the company
    const contactsToSearch = [];
    
    if (firstName && lastName) {
      // If we have specific contact name, search for that person
      contactsToSearch.push({
        contactId: `search_${Date.now()}_1`,
        firstName: firstName,
        lastName: lastName,
        companies: [{
          name: companyName,
          isCurrent: true
        }]
      });
    } else {
      // If no specific name, create some common names to search for
      // This is a workaround since we can't search by company alone
      const commonNames = [
        { first: 'John', last: 'Smith' },
        { first: 'Jane', last: 'Doe' },
        { first: 'Mike', last: 'Johnson' },
        { first: 'Sarah', last: 'Williams' },
        { first: 'David', last: 'Brown' }
      ];
      
      commonNames.forEach((name, index) => {
        contactsToSearch.push({
          contactId: `search_${Date.now()}_${index + 1}`,
          firstName: name.first,
          lastName: name.last,
          companies: [{
            name: companyName,
            isCurrent: true
          }]
        });
      });
    }

    const searchBody = {
      contacts: contactsToSearch
    };

    // Make request to Lusha Person API (POST version)
    const response = await fetch(`${LUSHA_BASE_URL}/v2/person`, {
      method: 'POST',
      headers: {
        'api_key': LUSHA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lusha API error:', response.status, errorText);
      
      // Handle specific error cases
      if (response.status === 401) {
        return res.status(401).json({ error: 'Invalid Lusha API key' });
      } else if (response.status === 403) {
        return res.status(403).json({ error: 'Lusha API access forbidden - check account status' });
      } else if (response.status === 429) {
        return res.status(429).json({ error: 'Lusha API rate limit exceeded' });
      } else if (response.status === 404) {
        return res.status(404).json({ error: 'No contacts found for this search' });
      } else {
        return res.status(response.status).json({ 
          error: 'Lusha API error', 
          details: errorText 
        });
      }
    }

    const data = await response.json();
    
    // Transform Lusha /v2/person POST response to our format
    const contacts = [];
    
    if (data && data.contacts) {
      // Parse the contacts object (keyed by contactId)
      Object.values(data.contacts).forEach(contact => {
        if (contact.name && (contact.name.first || contact.name.last)) {
          // Get company info from companies object using companyId
          let companyInfo = companyName; // fallback
          if (contact.companyId && data.companies && data.companies[contact.companyId]) {
            companyInfo = data.companies[contact.companyId].name || companyName;
          }
          
          // Get email (first one from array)
          let email = '';
          if (contact.emailAddresses && contact.emailAddresses.length > 0) {
            email = contact.emailAddresses[0].email || '';
          }
          
          // Get phone (first one from array)
          let phone = '';
          if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            phone = contact.phoneNumbers[0].phone || '';
          }
          
          contacts.push({
            firstName: contact.name.first || '',
            lastName: contact.name.last || '',
            fullName: contact.name.full || `${contact.name.first || ''} ${contact.name.last || ''}`.trim(),
            email: email,
            phone: phone,
            title: contact.jobTitle || '',
            company: companyInfo,
            location: contact.location || contact.city || '',
            linkedin: contact.linkedin || ''
          });
        }
      });
    }

    // Return standardized response
    res.status(200).json({
      success: true,
      contacts: contacts,
      total: contacts.length,
      searchParams: searchParams
    });

  } catch (error) {
    console.error('Lusha search error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};
