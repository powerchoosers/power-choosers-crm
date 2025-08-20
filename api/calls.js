const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  return await fn(req, res)
}

const handler = async function handler(req, res) {
  if (req.method === 'GET') {
    // Return mock call data for now
    return res.json({
      calls: [],
      total: 0,
      message: 'Calls endpoint working'
    });
  }
  
  if (req.method === 'POST') {
    // Handle call logging
    const { contact, duration, outcome, notes } = req.body;
    
    console.log('[Calls API] Call logged:', { contact, duration, outcome });
    
    return res.json({
      success: true,
      message: 'Call logged successfully'
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = allowCors(handler)
