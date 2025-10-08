// Use default import because _cors exports CommonJS (module.exports = cors)
import cors from './_cors';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if we should refresh the data
    const refresh = req.query.refresh === '1';
    
    // For now, return static Texas electricity pricing data
    // In the future, this could be enhanced to fetch real-time data
    const texasPricingData = {
      price: 0.125, // $0.125 per kWh (12.5 cents)
      lastUpdated: new Date().toISOString(),
      source: 'EIA 2023 Texas Average',
      region: 'Texas',
      currency: 'USD',
      unit: 'kWh'
    };

    console.log(`[TX Price] Returning pricing data${refresh ? ' (refreshed)' : ''}:`, texasPricingData);

    return res.status(200).json(texasPricingData);
    
  } catch (error) {
    console.error('[TX Price] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch Texas electricity pricing', 
      message: error.message 
    });
  }
}
