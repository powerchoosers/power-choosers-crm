import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local to get credentials
const envLocalPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envLocalPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'would', 
  'about', 'their', 'them', 'then', 'there', 'these', 'they', 'here', 
  'have', 'been', 'announced', 'announces', 'plans', 'facility', 'plant', 
  'expansion', 'new', 'operations', 'components', 'production', 'support', 
  'investment', 'capital', 'capacity', 'project', 'texas', 'growth',
  'company', 'corporation', 'incorporated', 'limited', 'inc', 'llc', 'ltd', 'co',
  'announce', 'investing', 'invests', 'expanded', 'expands', 'expansion',
  'facilities', 'manufacturing', 'industry', 'business', 'report', 'update',
  'site', 'construction', 'breaking', 'ground', 'building', 'buildings',
  'commercial', 'industrial', 'enterprise', 'energy', 'electricity',
  'supplier', 'suppliers', 'consulting', 'advisory', 'services', 'management'
]);

function getTopicKeywords(headline, entityName) {
  const cleanEntity = entityName.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const entityWords = new Set(cleanEntity.split(' ').filter(w => w.length > 2));

  const words = headline.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);
  return words.filter(w => w.length > 3 && !STOPWORDS.has(w) && !entityWords.has(w));
}

async function verifySignal(row) {
  const { id, entity_name, headline, source_url } = row;
  if (!source_url) return { ok: false, reason: "No source URL", code: 0 };

  // Skip deep verification for SEC filings or EDGAR searches
  if (source_url.includes('sec.gov') || source_url.includes('edgar')) {
    return { ok: true, reason: "SEC EDGAR source", code: 200 };
  }

  let urlObj;
  try {
    urlObj = new URL(source_url);
  } catch (err) {
    return { ok: false, reason: `Invalid URL: ${err.message}`, code: 0 };
  }

  const isHomepage = urlObj.pathname === '/' || urlObj.pathname === '';
  const keywords = getTopicKeywords(headline, entity_name);

  let responseBody = '';
  let status = 0;
  
  try {
    const cleanUrl = source_url.replace(/^https?:\/\//i, '');
    const jinaRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' }
    });
    status = jinaRes.status;
    if (jinaRes.ok) {
      responseBody = await jinaRes.text();
    }
  } catch (err) {
    try {
      const res = await fetch(source_url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NodalPointBot/1.0)' }
      });
      status = res.status;
      if (res.ok) {
        responseBody = await res.text();
      }
    } catch (directErr) {
      return { ok: false, reason: `Network error: ${directErr.message}`, code: 0 };
    }
  }

  if (status === 404) {
    return { ok: false, reason: "404 Page Not Found", code: 404 };
  }

  const bodyLower = responseBody.toLowerCase();
  
  // Verify entity name
  const cleanName = entity_name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nameWords = cleanName.split(' ').filter(w => w.length > 2);
  let nameMatch = false;
  if (nameWords.length > 0) {
    const matchCount = nameWords.filter(w => bodyLower.includes(w)).length;
    nameMatch = (matchCount / nameWords.length) >= 0.7;
  }

  if (!nameMatch) {
    return { ok: false, reason: `Entity name '${entity_name}' not found on page`, code: status };
  }

  // Verify keywords if it's not a generic homepage
  if (!isHomepage && keywords.length > 0) {
    const matchedKeywords = keywords.filter(w => bodyLower.includes(w));
    if (matchedKeywords.length === 0) {
      return { 
        ok: false, 
        reason: `None of the headline keywords (${keywords.join(', ')}) found on page`, 
        code: status 
      };
    }
  }

  return { ok: true, code: status };
}

async function clean() {
  console.log("Fetching recent market intelligence rows to clean...");
  const { data: rows, error } = await supabase
    .from('market_intelligence')
    .select('id, entity_name, headline, source_url, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Scanning and cleaning ${rows.length} rows...`);
  
  for (const row of rows) {
    const { id, entity_name, headline, source_url } = row;
    console.log(`Checking [${entity_name}] - ${headline}`);
    const res = await verifySignal(row);
    
    if (!res.ok) {
      console.log(`❌ DELETING hallucinated signal: ${res.reason} (URL: ${source_url})`);
      const { error: delError } = await supabase
        .from('market_intelligence')
        .delete()
        .eq('id', id);
      if (delError) {
        console.error(`Error deleting row ${id}:`, delError.message);
      } else {
        console.log(`Successfully deleted row ${id}`);
      }
    } else {
      console.log(`✅ VERIFIED (Status ${res.code})`);
    }
  }

  console.log("Cleanup finished.");
}

clean();
