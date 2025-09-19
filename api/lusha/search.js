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

    // Make request to Lusha API
    const response = await fetch(`${LUSHA_BASE_URL}/v2/person`, {
      method: 'GET',
      headers: {
        'api_key': LUSHA_API_KEY,
        'Content-Type': 'application/json'
      },
      // Convert params to URL search params for GET request
      // Note: Lusha API expects GET with query parameters
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
    
    // Transform Lusha response to our format
    const contacts = [];
    
    if (data && data.data) {
      // Handle single contact response
      if (data.data.firstName || data.data.lastName) {
        contacts.push({
          firstName: data.data.firstName || '',
          lastName: data.data.lastName || '',
          fullName: `${data.data.firstName || ''} ${data.data.lastName || ''}`.trim(),
          email: data.data.email || '',
          phone: data.data.phone || data.data.phoneNumber || '',
          title: data.data.title || data.data.jobTitle || '',
          company: data.data.company || data.data.companyName || companyName,
          location: data.data.location || data.data.city || '',
          linkedin: data.data.linkedin || ''
        });
      }
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
