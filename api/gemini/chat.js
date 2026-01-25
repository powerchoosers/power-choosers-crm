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

  const apiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
    return;
  }

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid messages format' }));
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools,
    });

    // Filter history to ensure it starts with a 'user' role as required by Gemini
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    // Find the first 'user' message index
    const firstUserIndex = history.findIndex(m => m.role === 'user');
    const validHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];

    const chat = model.startChat({
      history: validHistory,
    });

    const lastMessage = messages[messages.length - 1].content;
    let result = await chat.sendMessage(lastMessage);
    let response = result.response;
    
    // Handle function calls
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

      result = await chat.sendMessage(toolResponses);
      response = result.response;
    }

    const text = response.text();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: text }));

  } catch (error) {
    logger.error('[Gemini Chat] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
  }
}
