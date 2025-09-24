// Vercel serverless function to provide Google Maps config without exposing secrets in source code
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read from environment variables configured in Vercel
    const apiKey = process.env.GOOGLE_MAPS_API || '';
    const mapId = process.env.GOOGLE_MAP_ID || '';

    if (!apiKey) {
      return res.status(200).json({ apiKey: '', mapId });
    }

    // Never cache API key in CDN/browser
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ apiKey, mapId });
  } catch (e) {
    return res.status(200).json({ apiKey: '', mapId: '' });
  }
}



