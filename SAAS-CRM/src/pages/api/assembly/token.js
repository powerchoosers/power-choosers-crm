import { cors } from '../_cors.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ASSEMBLY_AI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'AssemblyAI API Key not configured' });
    }

    try {
        // v3 streaming token — GET request with query param (max 600 seconds)
        const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
            method: 'GET',
            headers: {
                'Authorization': apiKey,
            },
        });

        // Read raw text first — AssemblyAI returns empty body on 401/429
        const text = await response.text();
        if (!response.ok) {
            console.error(`AssemblyAI token failed: HTTP ${response.status}`, text);
            return res.status(response.status).json({
                error: `AssemblyAI returned ${response.status}`,
                details: text || '(empty response body)',
            });
        }

        const data = JSON.parse(text);
        return res.status(200).json(data);
    } catch (error) {
        console.error('AssemblyAI Token Error:', error);
        return res.status(500).json({ error: 'Failed to generate real-time token', details: error.message });
    }
}
