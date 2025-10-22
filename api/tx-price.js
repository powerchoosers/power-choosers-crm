import { cors } from './_cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(texasPricingData));
    return;
    
  } catch (error) {
    console.error('[TX Price] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to fetch Texas electricity pricing', 
      message: error.message 
    }));
    return;
  }
}
