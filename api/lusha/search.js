import { cors } from './_utils.js';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    return; // CORS preflight already handled
  }
  // Deprecated endpoint: use /api/lusha/company + /api/lusha/contacts + /api/lusha/enrich
  return res.status(410).json({
    error: 'Deprecated endpoint',
    message: 'Use GET /api/lusha/company to resolve domain, then POST /api/lusha/contacts to search by company, and POST /api/lusha/enrich to fetch emails/phones.'
  });
};
