import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../.cursor/debug.log');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const logData = req.body;
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...logData
    };

    // Ensure directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to debug.log
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error('[Debug Log] Error writing log:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to write log' }));
  }
}
