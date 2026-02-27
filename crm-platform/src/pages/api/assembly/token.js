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
        const response = await fetch('https://api.assemblyai.com/v2/realtime/token', {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expires_in: 3600 })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch AssemblyAI token');
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('AssemblyAI Token Error:', error);
        return res.status(500).json({ error: 'Failed to generate real-time token', details: error.message });
    }
}
