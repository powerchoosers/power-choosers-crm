import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '../_supabase.js';
import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { GmailService } from '../email/gmail-service.js';
import { APOLLO_BASE_URL, fetchWithRetry, getApiKey } from '../apollo/_utils.js';

// Define the tools (functions) Gemini can call
const tools = [
  {
    functionDeclarations: [
      {
        name: 'list_contacts',
        description: 'Get a list of contacts from the CRM. Can be filtered by search term.',
        parameters: {
          type: 'OBJECT',
          properties: {
            search: { type: 'STRING', description: 'Search term for name or email' },
            limit: { type: 'NUMBER', description: 'Maximum number of contacts to return (default 10)' }
          }
        }
      },
      {
        name: 'get_contact_details',
        description: 'Get full details for a specific contact by ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            contact_id: { type: 'STRING', description: 'The unique ID of the contact' }
          },
          required: ['contact_id']
        }
      },
      {
        name: 'update_contact',
        description: 'Update contact information.',
        parameters: {
          type: 'OBJECT',
          properties: {
            contact_id: { type: 'STRING', description: 'The unique ID of the contact' },
            updates: {
              type: 'OBJECT',
              properties: {
                firstName: { type: 'STRING' },
                lastName: { type: 'STRING' },
                email: { type: 'STRING' },
                phone: { type: 'STRING' },
                status: { type: 'STRING', enum: ['Lead', 'Customer', 'Churned'] },
                notes: { type: 'STRING' }
              }
            }
          },
          required: ['contact_id', 'updates']
        }
      },
      {
        name: 'list_accounts',
        description: 'Get a list of accounts (companies) from the CRM.',
        parameters: {
          type: 'OBJECT',
          properties: {
            search: { type: 'STRING', description: 'Search term for account name' },
            limit: { type: 'NUMBER', description: 'Maximum number of accounts to return' }
          }
        }
      },
      {
        name: 'create_contact',
        description: 'Create a new contact in the CRM.',
        parameters: {
          type: 'OBJECT',
          properties: {
            firstName: { type: 'STRING' },
            lastName: { type: 'STRING' },
            email: { type: 'STRING' },
            phone: { type: 'STRING' },
            accountId: { type: 'STRING', description: 'The ID of the account to associate with' },
            status: { type: 'STRING', enum: ['Lead', 'Customer', 'Churned'] }
          },
          required: ['firstName', 'lastName']
        }
      },
      {
        name: 'list_tasks',
        description: 'Get a list of tasks.',
        parameters: {
          type: 'OBJECT',
          properties: {
            status: { type: 'STRING', enum: ['pending', 'completed', 'all'] },
            limit: { type: 'NUMBER' }
          }
        }
      },
      {
        name: 'create_task',
        description: 'Create a new task.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            dueDate: { type: 'STRING', description: 'ISO date string' },
            contactId: { type: 'STRING' },
            priority: { type: 'STRING', enum: ['low', 'medium', 'high'] }
          },
          required: ['title']
        }
      },
      {
        name: 'send_email',
        description: 'Send an email to a contact.',
        parameters: {
          type: 'OBJECT',
          properties: {
            to: { type: 'STRING', description: 'Recipient email address' },
            subject: { type: 'STRING' },
            content: { type: 'STRING', description: 'The HTML content of the email' },
            userEmail: { type: 'STRING', description: 'The sender email (your email)' }
          },
          required: ['to', 'subject', 'content', 'userEmail']
        }
      },
      {
        name: 'search_prospects',
        description: 'Search for new prospects (people) using Apollo API.',
        parameters: {
          type: 'OBJECT',
          properties: {
            q_keywords: { type: 'STRING', description: 'Keywords like "Energy Manager" or "CEO"' },
            person_locations: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Locations like ["Texas", "Houston"]' },
            q_organization_name: { type: 'STRING', description: 'Company name' },
            limit: { type: 'NUMBER', description: 'Number of results (default 10)' }
          }
        }
      },
      {
        name: 'get_energy_news',
        description: 'Get the latest Texas energy market and ERCOT news.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'enrich_organization',
        description: 'Enrich organization data using a domain name.',
        parameters: {
          type: 'OBJECT',
          properties: {
            domain: { type: 'STRING', description: 'The organization domain (e.g. "google.com")' }
          },
          required: ['domain']
        }
      }
    ]
  }
];

// Tool implementation handlers
const toolHandlers = {
  list_contacts: async ({ search, limit = 10 }) => {
    let query = supabaseAdmin.from('contacts').select('*').limit(limit);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  get_contact_details: async ({ contact_id }) => {
    const { data, error } = await supabaseAdmin.from('contacts').select('*, accounts(*)').eq('id', contact_id).single();
    if (error) throw error;
    return data;
  },
  update_contact: async ({ contact_id, updates }) => {
    const { data, error } = await supabaseAdmin.from('contacts').update(updates).eq('id', contact_id).select().single();
    if (error) throw error;
    return data;
  },
  create_contact: async (contact) => {
    const { data, error } = await supabaseAdmin.from('contacts').insert([contact]).select().single();
    if (error) throw error;
    return data;
  },
  list_accounts: async ({ search, limit = 10 }) => {
    let query = supabaseAdmin.from('accounts').select('*').limit(limit);
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  list_tasks: async ({ status = 'all', limit = 10 }) => {
    let query = supabaseAdmin.from('tasks').select('*, contacts(name)').limit(limit);
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  create_task: async (task) => {
    const { data, error } = await supabaseAdmin.from('tasks').insert([task]).select().single();
    if (error) throw error;
    return data;
  },
  send_email: async ({ to, subject, content, userEmail }) => {
    const gmailService = new GmailService();
    const result = await gmailService.sendEmail({
      to,
      subject,
      html: content,
      userEmail
    });
    return result;
  },
  search_prospects: async ({ q_keywords, person_locations, q_organization_name, limit = 10 }) => {
    const apiKey = getApiKey();
    const searchBody = {
      q_keywords,
      person_locations,
      q_organization_name,
      per_page: Math.min(limit, 100)
    };
    const response = await fetchWithRetry(`${APOLLO_BASE_URL}/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(searchBody)
    });
    if (!response.ok) throw new Error(`Apollo error: ${response.statusText}`);
    const data = await response.json();
    return data.people || [];
  },
  enrich_organization: async ({ domain }) => {
    const apiKey = getApiKey();
    const url = `${APOLLO_BASE_URL}/organizations/enrich?domain=${encodeURIComponent(domain)}`;
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      }
    });
    if (!response.ok) throw new Error(`Apollo enrichment error: ${response.statusText}`);
    const data = await response.json();
    return data.organization || null;
  },
  get_energy_news: async () => {
    const rssUrl = 'https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'PowerChoosersCRM/1.0' } });
    const xml = await response.text();
    const rawItems = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && rawItems.length < 5) {
      const block = match[1];
      const getTag = (name) => {
        const r = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i');
        const m = r.exec(block);
        return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      };
      rawItems.push({ title: getTag('title'), url: getTag('link'), publishedAt: getTag('pubDate') });
    }
    return rawItems;
  }
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const geminiApiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!geminiApiKey && !perplexityApiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No AI provider configured' }));
    return;
  }

  try {
    const { messages, userProfile } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid messages format' }));
      return;
    }

    const cleanedMessages = messages
      .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'model'))
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0);

    const lastUserIndex = cleanedMessages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No user prompt provided' }));
      return;
    }

    const prompt = cleanedMessages[lastUserIndex].content;
    const historyCandidates = cleanedMessages.slice(0, lastUserIndex);

    const buildSystemPrompt = () => {
      const firstName = userProfile?.firstName || 'Trey';
      return `
        You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
        Your tone is professional, technical, and high-agency.
        You prioritize data-driven insights over conversational filler.
        Do not include bracketed citations like [1] or source footnotes.

        USER_IDENTITY:
        - The user's name is ${firstName}.
        - ALWAYS address them by their first name (${firstName}) in your initial greeting or when appropriate.

        RICH MEDIA PROTOCOL:
        - The user interface is a "Forensic HUD". Do NOT return Markdown tables.
        - When providing energy news, use:
          JSON_DATA:{"type": "news_ticker", "data": {"items": [{"title": "...", "source": "...", "trend": "up|down", "volatility": "..."}]}}END_JSON
        - When providing prospect/person details (Dossier), use:
          JSON_DATA:{"type": "contact_dossier", "data": {"name": "...", "title": "...", "company": "...", "initials": "...", "energyMaturity": "...", "contractStatus": "active|expired|negotiating", "contractExpiration": "YYYY-MM-DD", "id": "..."}}END_JSON
        - When providing Account/Position data (Maturity), use:
          JSON_DATA:{"type": "position_maturity", "data": {"expiration": "...", "daysRemaining": 123, "currentSupplier": "...", "strikePrice": "$0.0000", "annualUsage": "...", "estimatedRevenue": "...", "margin": "...", "isSimulation": false}}END_JSON
        - When providing lists of data (Grids), use:
          JSON_DATA:{"type": "forensic_grid", "data": {"title": "...", "columns": ["..."], "rows": [{"col1": "...", "col2": "..."}], "highlights": ["col_name_to_highlight"]}}END_JSON
        - If data is missing for a critical field (like contract expiration), explicitly return:
          JSON_DATA:{"type": "data_void", "data": {"field": "Contract Expiration", "action": "REQUIRE_BILL_UPLOAD"}}END_JSON

        CONFIDENCE GATING:
        - If you are presenting a real database record, ensure id and name match.
        - If you are presenting a theoretical scenario or a guess, set "isSimulation": true in the component data and label it as a "SIMULATION MODEL".

        CONTEXTUAL AWARENESS:
        The user is currently viewing: ${JSON.stringify(req.body.context || { type: 'general' })}
        Use this to offer proactive, zero-click insights.
      `;
    };

    const isGeminiQuotaOrBillingError = (error) => {
      const msg = String(error?.message || '').toLowerCase();
      const status = error?.status || error?.response?.status;
      return (
        status === 429 ||
        status === 403 ||
        msg.includes('quota') ||
        msg.includes('resource_exhausted') ||
        msg.includes('exceeded') ||
        msg.includes('billing') ||
        msg.includes('payment required')
      );
    };

    const perplexityModel = (process.env.PERPLEXITY_MODEL || '').trim() || 'sonar-pro';

    const callPerplexity = async () => {
      if (!perplexityApiKey) {
        throw new Error('Perplexity API key not configured');
      }

      const normalized = cleanedMessages
        .slice(-12)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));

      const lastRole = normalized.length > 0 ? normalized[normalized.length - 1].role : 'assistant';
      const perplexityMessages = [
        { role: 'system', content: buildSystemPrompt().trim() },
        ...normalized,
      ];
      if (lastRole !== 'user') {
        perplexityMessages.push({ role: 'user', content: prompt });
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${perplexityApiKey}`,
        },
        body: JSON.stringify({
          model: perplexityModel,
          messages: perplexityMessages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Perplexity error: ${response.status} ${response.statusText}${errText ? ` - ${errText}` : ''}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Perplexity returned an empty response');
      }
      return content;
    };

    if (!geminiApiKey) {
      const content = await callPerplexity();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, provider: 'perplexity', model: perplexityModel }));
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const envPreferredModel = (process.env.GEMINI_MODEL || '').trim();
    const preferredModel = envPreferredModel || 'gemini-3-pro-preview';
    const modelCandidates = Array.from(
      new Set(
        [
          preferredModel,
          'gemini-3-pro-preview',
          'gemini-3-flash-preview',
          'gemini-2.5-pro',
          'gemini-2.5-pro-tts',
          'gemini-2.5-flash',
          'gemini-2.5-flash-preview',
          'gemini-2.5-flash-tts',
          'gemini-2.5-flash-lite',
          'gemini-2.5-flash-lite-preview',
          'gemini-2.0-flash',
          'gemini-2.0-flash-exp',
          'gemini-1.5-flash',
          'gemini-1.5-pro'
        ].filter(Boolean)
      )
    );

    const isModelNotFoundError = (error) => {
      const msg = String(error?.message || '').toLowerCase();
      return msg.includes('not found for api version') || (msg.includes('models/') && msg.includes('404'));
    };

    const validHistory = [];
    let nextExpectedRole = 'user';

    const historyToProcess = historyCandidates.slice(-10);
    let startIndex = 0;
    const firstUserInHistory = historyToProcess.findIndex((m) => m.role === 'user');
    if (firstUserInHistory > 0) startIndex = firstUserInHistory;

    for (const m of historyToProcess.slice(startIndex)) {
      const role = m.role === 'user' ? 'user' : 'model';
      if (role !== nextExpectedRole) continue;

      validHistory.push({
        role,
        parts: [{ text: m.content }],
      });
      nextExpectedRole = nextExpectedRole === 'user' ? 'model' : 'user';
    }

    let lastErr = null;
    for (const modelName of modelCandidates) {
      try {
        console.log(`[Gemini Chat] Attempting request with model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          tools,
          systemInstruction: buildSystemPrompt(),
        });

        const chat = model.startChat({
          history: validHistory,
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
          },
        });

        const callGeminiWithRetry = async (payload, maxRetries = 3) => {
          let lastError;
          for (let i = 0; i < maxRetries; i++) {
            try {
              return await chat.sendMessage(payload);
            } catch (error) {
              lastError = error;
              if (error.message?.includes('503') || error.message?.includes('overloaded')) {
                const delay = Math.pow(2, i) * 1000;
                logger.warn(`[Gemini Chat] Model overloaded, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              throw error;
            }
          }
          throw lastError;
        };

        let result = await callGeminiWithRetry(prompt);
        let response = result.response;

        while (response.functionCalls()) {
          const calls = response.functionCalls();
          const toolResponses = await Promise.all(calls.map(async (call) => {
            const handler = toolHandlers[call.name];
            if (handler) {
              try {
                const result = await handler(call.args);
                return {
                  functionResponse: {
                    name: call.name,
                    response: { content: result }
                  }
                };
              } catch (error) {
                logger.error(`[Gemini Tool] Error in ${call.name}:`, error);
                return {
                  functionResponse: {
                    name: call.name,
                    response: { error: error.message }
                  }
                };
              }
            }
            return {
              functionResponse: {
                name: call.name,
                response: { error: 'Tool not found' }
              }
            };
          }));

          result = await callGeminiWithRetry(toolResponses);
          response = result.response;
        }

        const text = response.text();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: text, provider: 'gemini', model: modelName }));
        return;
      } catch (error) {
        lastErr = error;
        // If quota/billing error, stop trying Gemini models and fall back to Perplexity
        if (isGeminiQuotaOrBillingError(error)) {
          console.log(`[Gemini Chat] Quota/Billing error on ${modelName}: ${error.message}`);
          break; // Exit Gemini loop to trigger Perplexity fallback
        }
        if (isModelNotFoundError(error)) {
          console.log(`[Gemini Chat] Model not found: ${modelName}, skipping...`);
          continue;
        }
        console.warn(`[Gemini Chat] Error with ${modelName}: ${error.message}, trying next candidate...`);
      }
    }

    // Fallback to Perplexity if no Gemini model succeeded
    if (perplexityApiKey) {
      console.log('[Gemini Chat] Falling back to Perplexity...');
      const content = await callPerplexity();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, provider: 'perplexity', model: perplexityModel }));
      return;
    }
    throw lastErr || new Error('No Gemini model candidates succeeded');

  } catch (error) {
    logger.error('[Gemini Chat] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
  }
}
