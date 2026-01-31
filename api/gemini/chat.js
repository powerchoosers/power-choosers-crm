import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from '../utils/embeddings.js';
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
        description: 'Get a list of accounts (companies) from the CRM. Can be filtered by search term, industry, or contract expiration year.',
        parameters: {
          type: 'OBJECT',
          properties: {
            search: { type: 'STRING', description: 'Search term for account name, domain, or industry' },
            industry: { type: 'STRING', description: 'Filter by industry (e.g. "Manufacturing", "Healthcare")' },
            expiration_year: { type: 'NUMBER', description: 'Filter accounts by contract expiration year (e.g. 2026)' },
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
        name: 'search_emails',
        description: 'Search across ALL emails in the CRM by keyword (subject, content, sender). Use this to find emails when you do not know the specific contact.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search term for subject, body, or sender' },
            limit: { type: 'NUMBER', description: 'Max results (default 10)' }
          },
          required: ['query']
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
      },
      {
        name: 'get_account_details',
        description: 'Get full details for a specific account (company) by ID, including energy metrics and documents.',
        parameters: {
          type: 'OBJECT',
          properties: {
            account_id: { type: 'STRING', description: 'The unique ID of the account' }
          },
          required: ['account_id']
        }
      },
      {
        name: 'list_account_documents',
        description: 'Get a list of documents (bills, contracts, etc.) for a specific account.',
        parameters: {
          type: 'OBJECT',
          properties: {
            account_id: { type: 'STRING', description: 'The unique ID of the account' }
          },
          required: ['account_id']
        }
      },
      {
        name: 'search_interactions',
        description: 'Global Semantic Search. Search through past call transcripts, email history, accounts, and contacts. Use this to find ANY information across the entire CRM by keyword or topic.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Keyword or topic to search for (e.g. "pricing", "contract renewal")' },
            contact_id: { type: 'STRING', description: 'Optional: filter by contact ID' },
            account_id: { type: 'STRING', description: 'Optional: filter by account ID' },
            limit: { type: 'NUMBER', description: 'Max results per type (default 5)' }
          }
        }
      },
      {
        name: 'list_deals',
        description: 'Get a list of sales deals/opportunities.',
        parameters: {
          type: 'OBJECT',
          properties: {
            account_id: { type: 'STRING' },
            status: { type: 'STRING', enum: ['interested', 'proposal', 'won', 'lost', 'all'] }
          }
        }
      },
      {
        name: 'list_all_documents',
        description: 'Get a list of all documents (bills, contracts, etc.) across all accounts, sorted by newest first.',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: { type: 'NUMBER', description: 'Maximum number of documents to return (default 10)' }
          }
        }
      }
    ]
  }
];

// Tool implementation handlers
const toolHandlers = {
  list_contacts: async ({ search, limit = 10 }) => {
    let data = [];
    let usedVector = false;

    if (search) {
      try {
        const embedding = await generateEmbedding(search);
        if (embedding) {
          const { data: vectorResults, error } = await supabaseAdmin.rpc('match_contacts', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });
          if (!error && vectorResults) {
            data = vectorResults;
            usedVector = true;
          }
        }
      } catch (e) {
        console.error('[list_contacts] Vector error:', e);
      }
    }

    if (!usedVector) {
      let query = supabaseAdmin.from('contacts').select('*').limit(limit);
      if (search) {
        // Broaden keyword search to include title and city
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,title.ilike.%${search}%,city.ilike.%${search}%,metadata->>title.ilike.%${search}%,metadata->>city.ilike.%${search}%`);
      }
      const { data: keywordData, error } = await query;
      if (error) throw error;
      data = keywordData;
    }
    return data;
  },
  list_deals: async ({ account_id, status = 'all' }) => {
    let query = supabaseAdmin.from('deals').select('*, accounts(name)');
    if (account_id) query = query.eq('accountId', account_id);
    if (status !== 'all') query = query.eq('stage', status);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  search_interactions: async ({ query, contact_id, account_id, limit = 5 }) => {
    const results = {
      calls: [],
      emails: []
    };

    // If we have a query, try vector search first
    if (query) {
      try {
        const embedding = await generateEmbedding(query);
        if (embedding) {
          // 1. Search Calls
          const { data: callResults } = await supabaseAdmin.rpc('match_calls', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });
          
          if (callResults && callResults.length > 0) {
             const callIds = callResults.map(c => c.id);
             const { data: fullCalls } = await supabaseAdmin
                .from('calls')
                .select('*, contacts(first_name, last_name, email), accounts(name)')
                .in('id', callIds);
             
             if (fullCalls) {
                results.calls = fullCalls;
             }
          }

          // 1.1 Search Call Details (Transcripts)
          const { data: detailResults } = await supabaseAdmin.rpc('match_call_details', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });

          if (detailResults && detailResults.length > 0) {
            const detailIds = detailResults.map(d => d.id);
            const { data: fullDetails } = await supabaseAdmin
                .from('call_details')
                .select('*, calls(*, contacts(first_name, last_name, email), accounts(name))')
                .in('id', detailIds);

            if (fullDetails) {
              results.transcripts = fullDetails;
            }
          }

          // 1.2 Search Accounts (Semantic)
          const { data: accountResults } = await supabaseAdmin.rpc('match_accounts', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });
          if (accountResults && accountResults.length > 0) {
            results.accounts = accountResults;
          }

          // 1.3 Search Contacts (Semantic)
          const { data: contactResults } = await supabaseAdmin.rpc('match_contacts', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });
          if (contactResults && contactResults.length > 0) {
            results.contacts = contactResults;
          }

          // 2. Search Emails
          const { data: emailResults } = await supabaseAdmin.rpc('match_emails', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });

          if (emailResults) {
            results.emails = emailResults;
          }
          
          // If we have filters, apply them to the vector results
          if (contact_id) {
            results.calls = results.calls.filter(c => c.contactId === contact_id);
            results.emails = results.emails.filter(e => e.contactId === contact_id);
            if (results.transcripts) {
              results.transcripts = results.transcripts.filter(t => t.calls?.contactId === contact_id);
            }
            if (results.contacts) {
              results.contacts = results.contacts.filter(c => c.id === contact_id);
            }
          } else if (account_id) {
            results.calls = results.calls.filter(c => c.accountId === account_id);
            results.emails = results.emails.filter(e => e.accountId === account_id);
            if (results.transcripts) {
              results.transcripts = results.transcripts.filter(t => t.calls?.accountId === account_id);
            }
            if (results.accounts) {
              results.accounts = results.accounts.filter(a => a.id === account_id);
            }
          }

          // If we have enough results after filtering, return them
          if (results.calls.length > 0 || results.emails.length > 0 || (results.transcripts && results.transcripts.length > 0) || results.accounts?.length > 0 || results.contacts?.length > 0) {
            return results;
          }
        }
      } catch (e) {
        console.error('[search_interactions] Vector error:', e);
      }
    }

    // Fallback: If vector search found nothing or filters were too restrictive, do keyword/ID search
    if (contact_id) {
      const [calls, emails] = await Promise.all([
        supabaseAdmin.from('calls').select('*').eq('contactId', contact_id).order('timestamp', { ascending: false }).limit(limit),
        supabaseAdmin.from('emails').select('*').eq('contactId', contact_id).order('timestamp', { ascending: false }).limit(limit)
      ]);
      
      // If we already had vector results, we might want to merge or prioritize? 
      // For simplicity, if IDs are provided, we prioritize those records.
      results.calls = calls.data || [];
      results.emails = emails.data || [];
    } else if (account_id) {
      const [calls, emails] = await Promise.all([
        supabaseAdmin.from('calls').select('*').eq('accountId', account_id).order('timestamp', { ascending: false }).limit(limit),
        supabaseAdmin.from('emails').select('*').eq('accountId', account_id).order('timestamp', { ascending: false }).limit(limit)
      ]);
      results.calls = calls.data || [];
      results.emails = emails.data || [];
    }

    return results;
  },
  get_contact_details: async ({ contact_id }) => {
    const { data, error } = await supabaseAdmin.from('contacts').select('*, accounts(*)').eq('id', contact_id).single();
    if (error) throw error;

    // Normalization Logic to match frontend and fix legacy data gaps
    const metadata = data.metadata || {};
    
    // 1. Name Resolution
    if (!data.firstName) data.firstName = metadata.firstName || metadata.first_name || metadata.general?.firstName;
    if (!data.lastName) data.lastName = metadata.lastName || metadata.last_name || metadata.general?.lastName;
    
    // 2. Company/Account Resolution
    if (!data.accounts) {
       const companyName = metadata.company || metadata.companyName || metadata.general?.company || metadata.general?.companyName;
       if (companyName) {
         // Try to find account by name to fill the gap
         const { data: account } = await supabaseAdmin.from('accounts').select('*').ilike('name', companyName).limit(1).maybeSingle();
         if (account) {
           data.accounts = account;
           // We don't save back to DB here (read-only tool), but we present it as linked
         } else {
           // Stub account data from metadata if real account not found
           data.accounts = {
             name: companyName,
             domain: metadata.domain || metadata.general?.domain,
             description: 'Legacy Record - No linked account'
           };
         }
       }
    }

    // 3. Contract Data Promotion
    if (data.accounts) {
      const accountMetadata = data.accounts.metadata || {};
      // Ensure contract_end_date is promoted for the AI to see easily
      let contract_end_date = data.accounts.contract_end_date || 
                             accountMetadata.contract_end_date || 
                             accountMetadata.contractEndDate || 
                             accountMetadata.general?.contractEndDate;

      // Handle common date formats like MM/DD/YYYY to YYYY-MM-DD
      if (contract_end_date && contract_end_date.includes('/')) {
        const parts = contract_end_date.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
          contract_end_date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
      }
      
      data.contract_end_date = contract_end_date;
      data.electricity_supplier = data.accounts.electricity_supplier || accountMetadata.electricity_supplier;
      data.annual_usage = data.accounts.annual_usage || accountMetadata.annual_usage;
      data.current_rate = data.accounts.current_rate || accountMetadata.current_rate;
      data.service_addresses = data.accounts.service_addresses || [];
    }

    // 4. Apollo/Metadata Field Promotion
    data.title = data.title || metadata.title || metadata.general?.title;
    data.linkedin_url = data.linkedinUrl || metadata.linkedinUrl || metadata.general?.linkedinUrl;
    data.mobile = data.mobile || metadata.mobile || metadata.general?.mobile;
    data.work_phone = data.workPhone || metadata.workPhone || metadata.general?.workPhone || metadata.workDirectPhone;

    // 5. Activity & Location Promotion
    data.lastActivityAt = data.lastActivityAt || metadata.lastActivityAt || metadata.last_activity_date;
    data.lastContactedAt = data.lastContactedAt || metadata.lastContactedAt || metadata.last_contacted_date;
    data.notes = data.notes || metadata.notes || metadata.general?.notes;
    data.city = data.city || metadata.city || metadata.general?.city || data.accounts?.city;
    data.state = data.state || metadata.state || metadata.general?.state || data.accounts?.state;

    return data;
  },
  get_account_details: async ({ account_id }) => {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*, contacts(*)')
      .eq('id', account_id)
      .single();
    
    if (error) throw error;

    // Promote energy metrics and corporate data from metadata if missing in top-level
    const metadata = data.metadata || {};
    
    // Robust date resolution
    data.contract_end_date = data.contract_end_date || 
                            metadata.contract_end_date || 
                            metadata.contractEndDate || 
                            metadata.general?.contractEndDate;

    // Handle common date formats like MM/DD/YYYY to YYYY-MM-DD
    if (data.contract_end_date && data.contract_end_date.includes('/')) {
      const parts = data.contract_end_date.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        data.contract_end_date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }

    data.electricity_supplier = data.electricity_supplier || metadata.electricity_supplier;
    data.annual_usage = data.annual_usage || metadata.annual_usage;
    data.current_rate = data.current_rate || metadata.current_rate;
    data.revenue = data.revenue || metadata.revenue || metadata.annual_revenue;
    data.employees = data.employees || metadata.employees || metadata.employee_count;
    data.industry = data.industry || metadata.industry;
    
    // Promote location and description
    data.description = data.description || metadata.description || metadata.general?.description;
    data.address = data.address || metadata.address || metadata.billing_address || metadata.general?.address;
    data.city = data.city || metadata.city || metadata.billing_city || metadata.general?.city;
    data.state = data.state || metadata.state || metadata.billing_state || metadata.general?.state;
    data.zip = data.zip || metadata.zip || metadata.billing_zip || metadata.general?.zip;
    data.service_addresses = data.service_addresses || metadata.service_addresses || [];

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
  list_accounts: async ({ search, industry, expiration_year, limit = 10 }) => {
    let data = [];
    let usedVector = false;

    // Use Vector Search if we have a search term OR an expiration year (semantic search for dates)
    if (search || expiration_year) {
      try {
        const query = search ? search : `accounts expiring in ${expiration_year}`;
        const embedding = await generateEmbedding(query);
        if (embedding) {
          console.log(`[list_accounts] Using vector search for: "${query}"`);
          const { data: vectorResults, error } = await supabaseAdmin.rpc('match_accounts', {
            query_embedding: embedding,
            match_threshold: search ? 0.3 : 0.1, // Lower threshold for year-only semantic search
            match_count: limit * 5 // Fetch more to filter precisely
          });
          if (!error && vectorResults) {
            data = vectorResults;
            usedVector = true;
          } else if (error) {
            console.error('[list_accounts] Vector search error:', error);
          }
        }
      } catch (e) {
        console.error('[list_accounts] Vector generation error:', e);
      }
    }

    // Fallback to Keyword Search if Vector failed or wasn't used
    if (!usedVector) {
        // Fetch a larger set for in-memory precision filtering
        let query = supabaseAdmin.from('accounts').select('*').limit(1000); 
        
        if (industry) {
          query = query.or(`industry.ilike.%${industry}%,metadata->>industry.ilike.%${industry}%`);
        }
        if (search) {
          query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%,industry.ilike.%${search}%,metadata->>industry.ilike.%${search}%`);
        }
        
        const { data: keywordData, error } = await query;
        if (error) {
            console.error('[list_accounts] Keyword fetch error:', error);
        }
        data = keywordData || [];
    }
    
    // ALWAYS apply filters in-memory for precision, especially for expiration_year
    if (industry) {
        const indLower = industry.toLowerCase();
        data = data.filter(r => 
            (r.industry && r.industry.toLowerCase().includes(indLower)) || 
            (r.metadata?.industry && r.metadata.industry.toLowerCase().includes(indLower))
        );
    }
    if (expiration_year) {
        const yearStr = String(expiration_year);
        data = data.filter(r => {
            const metadata = r.metadata || {};
            const d = r.contract_end_date || 
                      metadata.contract_end_date || 
                      metadata.contractEndDate || 
                      metadata.general?.contractEndDate;
            if (!d) return false;
            const dateStr = String(d).toLowerCase();
            // Match 2026, Jan 1st 2026, /26, etc.
            return dateStr.includes(yearStr) || 
                   dateStr.includes(yearStr.slice(2)) ||
                   dateStr.includes(`${yearStr.slice(2)}`) ||
                   (yearStr === '2026' && dateStr.includes('26'));
        });
    }

    // Final slice to limit
    data = data.slice(0, limit);
    
    console.log(`[list_accounts] Found ${data?.length || 0} precision records (Vector: ${usedVector}, Search: "${search}", Year: ${expiration_year})`);

    // Normalize results to ensure promoted fields are available
    return data.map(record => {
      const metadata = record.metadata || {};
      
      // Robust date resolution
      let contract_end_date = record.contract_end_date || 
                             metadata.contract_end_date || 
                             metadata.contractEndDate || 
                             metadata.general?.contractEndDate;

      // Handle common date formats like MM/DD/YYYY to YYYY-MM-DD
      if (contract_end_date && contract_end_date.includes('/')) {
        const parts = contract_end_date.split('/');
        if (parts.length === 3) {
          // Check if it's MM/DD/YYYY
          if (parts[2].length === 4) {
            contract_end_date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
      }

      return {
        ...record,
        contract_end_date,
        industry: record.industry || metadata.industry || metadata.general?.industry,
        electricity_supplier: record.electricity_supplier || metadata.electricity_supplier || metadata.general?.electricity_supplier,
        annual_usage: record.annual_usage || metadata.annual_usage || metadata.general?.annual_usage
      };
    });
  },
  list_account_documents: async ({ account_id }) => {
    const { data, error } = await supabaseAdmin.from('documents').select('*').eq('account_id', account_id).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  list_all_documents: async ({ limit = 10 }) => {
    const { data, error } = await supabaseAdmin.from('documents').select('*, accounts(name)').order('created_at', { ascending: false }).limit(limit);
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
  search_emails: async ({ query, limit = 10 }) => {
    // Global email search with Vector Support
    let data = [];
    let usedVector = false;

    if (query) {
      try {
        const embedding = await generateEmbedding(query);
        if (embedding) {
          const { data: vectorResults, error } = await supabaseAdmin.rpc('match_emails', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit
          });
          
          if (!error && vectorResults) {
            // Need to join contacts/accounts manually since RPC only returns emails table
            const emailIds = vectorResults.map(e => e.id);
            if (emailIds.length > 0) {
                 const { data: fullData, error: joinError } = await supabaseAdmin
                    .from('emails')
                    .select('*, contacts(first_name, last_name, email), accounts(name)')
                    .in('id', emailIds);
                 
                 if (!joinError) {
                     // Sort by similarity order (which is lost in the IN query, so we might lose relevance sorting)
                     // Or just return fullData sorted by date?
                     // Let's sort by date for now as standard email search expectation, but filter by relevance
                     data = fullData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                     usedVector = true;
                 }
            }
          }
        }
      } catch (e) {
         console.error('[search_emails] Vector error:', e);
      }
    }

    if (!usedVector) {
        const { data: keywordData, error } = await supabaseAdmin
        .from('emails')
        .select('*, contacts(first_name, last_name, email), accounts(name)')
        .or(`subject.ilike.%${query}%,text.ilike.%${query}%,from.ilike.%${query}%`)
        .order('timestamp', { ascending: false })
        .limit(limit);
        
        if (error) throw error;
        data = keywordData;
    }

    return data;
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

    // Enhanced message cleaning to preserve tool calls and handle non-string content
    const cleanedMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'model' || m.role === 'tool' || m.role === 'system'))
      .map((m) => {
        let content = m.content;
        if (content && typeof content !== 'string') {
          content = JSON.stringify(content);
        }
        return { 
          role: m.role === 'model' ? 'assistant' : m.role, // Normalize model to assistant for internal consistency
          content: (content || '').trim(),
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name
        };
      })
      .filter((m) => (m.content && m.content.length > 0) || m.tool_calls || m.role === 'tool');

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
        - TODAY'S DATE: ${new Date().toISOString().split('T')[0]} (Year: ${new Date().getFullYear()})
        - CURRENT CONTEXT: "This year" means ${new Date().getFullYear()}.

        ANTI_HALLUCINATION_PROTOCOL:
        - CRITICAL: NEVER invent names, companies, email addresses, phone numbers, or energy metrics (kWh, strike price, contract dates).
        - If a search (e.g., for "manufacturers", "expiring accounts", "outreach list") returns zero results from a tool, you MUST say: "Trey, I searched the database but found no records matching that criteria."
        - DO NOT invent "Contract End Dates" if the tool returns null or undefined. If a date is missing, you MUST say "Unknown" or "Not in CRM".
        - DO NOT change dates of existing accounts to match the user's query (e.g., if an account expires in 2028, do not say it expires in 2026 just because the user asked for 2026 expirations).
        - If the user asks for "accounts expiring this year" and you find none, do not invent them.
        - DO NOT provide "examples" or "demonstration data" unless explicitly asked for a demo.
        - The "Data Locker" (forensic_documents) must ONLY contain real documents returned by tools.
        - DO NOT use names like "Pacific Energy Solutions", "Global Manufacturing Inc.", "Apex Manufacturing", "Vertex Energy", "Summit Industrial", "Horizon Power Systems", or "Pinnacle Energy Group". These are hallucinations.
        - If the user asks for "outreach this week" and you find no data, do not create a fake list. Say: "Trey, I don't see any accounts scheduled for outreach this week in the CRM."
        - Accuracy is the ONLY priority for CRM data. If you are 99% sure but haven't run a tool, you are 0% sure. RUN THE TOOL.

        INDUSTRY_INTELLIGENCE:
        - "Manufacturing" is a broad sector. If the user asks for "Manufacturing" or "Manufacturers", you MUST search for these related industries:
          - "Manufacturing"
          - "Building Materials"
          - "Electrical"
          - "Electronic"
          - "Industrial"
          - "Production"
          - "Assembly"
          - "Fabrication"
        - The \`list_accounts\` tool now supports an \`industry\` parameter and checks the industry column in searches.
        - DO NOT just call \`list_accounts({ industry: "Manufacturing" })\`. This will miss many relevant records.
        - INSTEAD: Call \`list_accounts({ search: "Manufacturing" })\` or use multiple searches for the terms listed above to ensure you find all relevant "nodes".
        - If the user asks "how many", perform a search and count the actual results returned by the tool.
        - ALWAYS report the actual industry name found in the CRM record.

        CRM_CAPABILITIES:
        - You have direct access to the CRM database via tools.
        - When asked about accounts, contacts, or deals, ALWAYS use the provided tools (list_accounts, list_contacts, etc.) instead of assuming or hallucinating data.
        - To find accounts expiring in a specific year, use list_accounts with the expiration_year parameter (e.g., list_accounts({ expiration_year: 2026 })).
        - DO NOT ignore the expiration_year parameter when searching for expirations. It is the most accurate way to filter.
        - If a tool returns no results, inform the user clearly without making up data.

        HYBRID_RESPONSE_MODE:
        - You are capable of providing BOTH narrative analysis AND forensic components in a single response.
        - MANDATORY: Every response MUST begin with a concise, high-agency narrative (2-4 sentences) addressing ${firstName} directly.
        - DO NOT skip the narrative. DO NOT start with JSON.
        - DO NOT use Markdown tables for CRM data. Use JSON_DATA blocks with the appropriate component type (forensic_grid, contact_dossier, etc.).
        - FOLLOW the narrative with a single JSON_DATA block if technical details or UI components are required.
        - FORMAT: "[Narrative text...] JSON_DATA:{...}END_JSON"
        - Example: "Trey, I've analyzed the current market volatility. We're seeing a spike in LZ_HOUSTON due to generation outages. JSON_DATA:{\"type\": \"news_ticker\", \"data\": {...}}END_JSON"
        - If the user asks a simple question, still provide a brief narrative before any data.

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
        - When providing document/bill lists (Data Locker), use:
          JSON_DATA:{"type": "forensic_documents", "data": {"accountName": "...", "documents": [{"id": "...", "name": "...", "type": "...", "size": "...", "url": "...", "created_at": "..."}]}}END_JSON
        - If data is missing for a critical field (like contract expiration), explicitly return:
          JSON_DATA:{"type": "data_void", "data": {"field": "Contract Expiration", "action": "REQUIRE_BILL_UPLOAD"}}END_JSON

        CONFIDENCE GATING:
        - If you are presenting a real database record, ensure id and name match.
        - If you are presenting a theoretical scenario or a guess, set "isSimulation": true in the component data and label it as a "SIMULATION MODEL".

        CONTEXTUAL AWARENESS:
        The user is currently viewing: ${JSON.stringify(req.body.context || { type: 'general' })}
        - If the user's query applies to this context (e.g., "who is the decision maker?", "draft an email to him"), PRIORITY ONE is to use this context.
        - If the user's query is unrelated (e.g., "general market trends", "new search"), IGNORE the current screen context and answer broadly.
        - Use this to offer proactive, zero-click insights ONLY when relevant.
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

    const convertToolsToOpenAI = (geminiTools) => {
      return geminiTools.flatMap(t => t.functionDeclarations).map(fn => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }
      }));
    };

    const callOpenRouter = async (modelName) => {
      const apiKey = process.env.OPEN_ROUTER_API_KEY;
      if (!apiKey) throw new Error('OpenRouter API key not configured');

      const model = modelName || 'openai/gpt-oss-120b';
      const openAiTools = convertToolsToOpenAI(tools);
      
      let currentMessages = [
        { role: 'system', content: buildSystemPrompt().trim() },
        ...cleanedMessages.slice(-15).map(m => {
          const msg = {
            role: m.role === 'tool' ? 'tool' : (m.role === 'user' ? 'user' : 'assistant'),
            content: m.content || null,
          };
          if (m.tool_calls) msg.tool_calls = m.tool_calls;
          if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
          if (m.name) msg.name = m.name;
          return msg;
        })
      ];
      
      // Ensure the last message is from the user if it's not already
      if (currentMessages[currentMessages.length - 1].role !== 'user') {
        currentMessages.push({ role: 'user', content: prompt });
      }

      console.log(`[AI Router] Calling OpenRouter with model: ${model}`);

      // Loop for tool calls (max 10 turns)
      let turnCount = 0;
      const MAX_TURNS = 10;

      while (turnCount < MAX_TURNS) {
        turnCount++;
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://nodalpoint.io',
            'X-Title': 'Nodal Point CRM',
          },
          body: JSON.stringify({
            model: model,
            messages: currentMessages,
            tools: openAiTools,
            temperature: 0.7,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`OpenRouter error: ${response.status} ${response.statusText}${errText ? ` - ${errText}` : ''}`);
        }

        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        
        if (!message) {
          throw new Error('OpenRouter returned an empty response');
        }

        // Add assistant's response to history
        currentMessages.push(message);

        // Check for tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          routingDiagnostics.push({
            model: model,
            status: 'tool_call',
            tools: message.tool_calls.map(c => c.function.name)
          });

          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name;
            let functionArgs = {};
            try {
              functionArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
              console.warn(`[OpenRouter Tool] Failed to parse arguments for ${functionName}:`, toolCall.function.arguments);
              // Fallback for some models that might send malformed JSON
            }
            
            console.log(`[OpenRouter Tool] Executing ${functionName} with args:`, functionArgs);
            
            const handler = toolHandlers[functionName];
            let result;
            
            if (handler) {
              try {
                result = await handler(functionArgs);
                // Ensure result is not undefined/null before stringifying
                if (result === undefined) result = null;
                console.log(`[OpenRouter Tool] ${functionName} returned ${Array.isArray(result) ? result.length : '1'} results`);
              } catch (error) {
                console.error(`[OpenRouter Tool] Error in ${functionName}:`, error);
                result = { error: error.message };
              }
            } else {
              result = { error: 'Tool not found' };
            }

            // Add tool response to history
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify(result) // OpenAI expects string content for tool messages
            });
          }
          // Continue loop to send tool results back to model
        } else {
          // No tool calls, return final content
          return message.content || '';
        }
      }
      
      throw new Error('Max tool recursion depth reached');
    };

    const callPerplexity = async (modelName, diagnostics = []) => {
      if (!perplexityApiKey) {
        throw new Error('Perplexity API key not configured');
      }

      const model = modelName || perplexityModel;
      
      const lastFailure = diagnostics.findLast(d => d.status === 'failed');
      const failureContext = lastFailure ? `(Reason: Previous attempt with ${lastFailure.model} failed: ${lastFailure.error})` : '';

      // Perplexity is extremely strict: must alternate User/Assistant and NO tool messages
      // AND must start with a User message
      const normalized = [];
      let lastRole = null;

      // Slice the last 10 messages but ensure we don't break mid-conversation if possible
      const candidates = cleanedMessages.slice(-10);
      
      for (const m of candidates) {
        const role = m.role === 'user' ? 'user' : 'assistant';
        
        // Skip if it's the same role as last one (Perplexity requires alternation)
        if (role === lastRole) continue;
        
        // Skip if first message is not user (Perplexity requires starting with user)
        if (normalized.length === 0 && role !== 'user') continue;

        normalized.push({
          role: role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        });
        lastRole = role;
      }

      // Clearer system prompt for Perplexity to prevent tool hallucinations
      const perplexitySystemPrompt = `
        ${buildSystemPrompt().trim()}
        
        CRITICAL_NOTICE: You are currently running in SEARCH_ONLY mode via Perplexity because the primary CRM model failed ${failureContext}. 
        You DO NOT have direct access to the CRM database tools (list_accounts, list_contacts, etc.) in this session.
        Do NOT attempt to use them or tell the user you have access to them.
        Instead, provide the best answer possible using your internal knowledge and web search.
        If the user asks for CRM data, explain that the primary model encountered an error and suggest they retry their request in a few moments or switch to a different Gemini model.
      `.trim();

      const perplexityMessages = [
        { role: 'system', content: perplexitySystemPrompt },
        ...normalized,
      ];

      // Ensure last message is from user
      if (perplexityMessages.length === 0 || perplexityMessages[perplexityMessages.length - 1].role !== 'user') {
        perplexityMessages.push({ role: 'user', content: prompt || 'Continue' });
      }

      console.log(`[AI Router] Calling Perplexity with model: ${model}`);

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${perplexityApiKey}`,
        },
        body: JSON.stringify({
          model: model,
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

    const routingDiagnostics = [];
    let lastErr = null;
    const bodyModel = (req.body.model || '').trim();
    console.log(`[AI Router] Incoming request - bodyModel: "${bodyModel}"`);

    // 1. Determine target model and provider
    let targetModel = bodyModel;
    let provider = 'gemini'; // Default fallback

    if (!bodyModel || bodyModel === 'default') {
      targetModel = 'openai/gpt-oss-120b:free';
      provider = 'openrouter';
    } else if (bodyModel.startsWith('sonar')) {
      provider = 'perplexity';
    } else if (bodyModel.startsWith('openai/') || bodyModel.startsWith('anthropic/') || bodyModel.startsWith('google/') || bodyModel.startsWith('meta-llama/') || bodyModel.startsWith('mistralai/') || bodyModel.startsWith('perplexity/') || bodyModel.startsWith('nvidia/')) {
      provider = 'openrouter';
    }

    console.log(`[AI Router] Routing decision - targetModel: ${targetModel}, provider: ${provider}`);

    // 2. Execute Routing
    if (provider === 'openrouter') {
      if (process.env.OPEN_ROUTER_API_KEY) {
        try {
          routingDiagnostics.push({
            model: targetModel,
            provider: 'openrouter',
            status: 'attempting',
            timestamp: new Date().toISOString()
          });

          const content = await callOpenRouter(targetModel);
          routingDiagnostics.push({
            model: targetModel,
            provider: 'openrouter',
            status: 'success',
            timestamp: new Date().toISOString()
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            content,
            provider: 'openrouter',
            model: targetModel,
            diagnostics: routingDiagnostics
          }));
          return;
        } catch (error) {
          console.error('[OpenRouter Chat] Error:', error);
          routingDiagnostics.push({
            model: targetModel,
            provider: 'openrouter',
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
          });
          lastErr = error;
          // Continue to fallback if OpenRouter fails
        }
      }
    } else if (provider === 'perplexity') {
      try {
        routingDiagnostics.push({
          model: targetModel,
          provider: 'perplexity',
          status: 'attempting',
          timestamp: new Date().toISOString()
        });

        const content = await callPerplexity(targetModel);
        routingDiagnostics.push({
          model: targetModel,
          provider: 'perplexity',
          status: 'success',
          timestamp: new Date().toISOString()
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          content,
          provider: 'perplexity',
          model: targetModel,
          diagnostics: routingDiagnostics
        }));
        return;
      } catch (error) {
        console.error('[Perplexity Chat] Error:', error);
        routingDiagnostics.push({
          model: targetModel,
          provider: 'perplexity',
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        lastErr = error;
        // Continue to fallback if Perplexity fails
      }
    }

    // 3. Default legacy fallback loop if no specific model was requested or if it failed
    // If no bodyModel or it's a gemini model, we proceed to the gemini loop
    if (!bodyModel || bodyModel.includes('gemini')) {
      // (This part already exists in the code below)
    } else if (process.env.OPEN_ROUTER_API_KEY && !routingDiagnostics.some(d => d.model === 'openai/gpt-oss-120b')) {
       // If a non-gemini model was requested but failed, try the default OpenRouter model as a fallback
       try {
         const orModel = 'openai/gpt-oss-120b';
         routingDiagnostics.push({
           model: orModel,
           provider: 'openrouter',
           status: 'attempting',
           reason: 'FALLBACK_TO_DEFAULT',
           timestamp: new Date().toISOString()
         });
         const content = await callOpenRouter();
         routingDiagnostics.push({ model: orModel, provider: 'openrouter', status: 'success', timestamp: new Date().toISOString() });
         res.writeHead(200, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ content, provider: 'openrouter', model: orModel, diagnostics: routingDiagnostics }));
         return;
       } catch (e) {
         routingDiagnostics.push({ model: 'openai/gpt-oss-120b', provider: 'openrouter', status: 'failed', error: e.message });
       }
    }

    if (!geminiApiKey) {
      const content = await callPerplexity(null, routingDiagnostics);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, provider: 'perplexity', model: perplexityModel, diagnostics: routingDiagnostics }));
      return;
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const envPreferredModel = (process.env.GEMINI_MODEL || '').trim();
    const preferredModel = (bodyModel && !bodyModel.includes('/') && !bodyModel.startsWith('sonar')) ? bodyModel : (envPreferredModel || 'gemini-1.5-flash');
    const modelCandidates = Array.from(
      new Set(
        [
          preferredModel,
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-1.5-pro'
        ].filter(m => m && typeof m === 'string' && (m.startsWith('gemini-') || m.includes('flash') || m.includes('pro')))
      )
    );

    const isModelNotFoundError = (error) => {
      const msg = String(error?.message || '').toLowerCase();
      return msg.includes('not found for api version') || (msg.includes('models/') && msg.includes('404'));
    };

    // Build Gemini-specific history with proper role alternation and tool support
    const validHistory = [];
    let nextExpectedRole = 'user';

    const historyToProcess = historyCandidates.slice(-10);
    let startIndex = 0;
    const firstUserInHistory = historyToProcess.findIndex((m) => m.role === 'user');
    if (firstUserInHistory > 0) startIndex = firstUserInHistory;

    for (const m of historyToProcess.slice(startIndex)) {
      // Gemini roles are 'user' and 'model'
      const role = m.role === 'user' ? 'user' : 'model';
      
      // Basic role alternation check for non-tool messages
      if (m.role !== 'tool' && role !== nextExpectedRole) continue;

      const parts = [];
      if (m.content) {
        parts.push({ text: m.content });
      }

      // Handle tool calls in history (if any)
      if (m.tool_calls && Array.isArray(m.tool_calls)) {
        for (const call of m.tool_calls) {
          parts.push({
            functionCall: {
              name: call.function.name,
              args: JSON.parse(call.function.arguments)
            }
          });
        }
      }

      // Handle tool responses in history
      if (m.role === 'tool') {
        validHistory.push({
          role: 'model', // Tool responses are part of the model's side of the conversation in some SDK versions, 
                         // but Gemini actually uses a separate role usually. 
                         // However, Node SDK startChat history often requires alternation.
          parts: [{
            functionResponse: {
              name: m.name,
              response: { content: m.content }
            }
          }]
        });
        // After a tool response, we still expect the model to finish its thought (another 'model' role)
        // or the user to respond. This is tricky. 
        continue; 
      }

      validHistory.push({ role, parts });
      nextExpectedRole = nextExpectedRole === 'user' ? 'model' : 'user';
    }

    for (const modelName of modelCandidates) {
      try {
        routingDiagnostics.push({
          model: modelName,
          provider: 'gemini',
          status: 'attempting',
          timestamp: new Date().toISOString()
        });

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
                routingDiagnostics.push({
                  model: modelName,
                  status: 'retry',
                  reason: 'overloaded',
                  attempt: i + 1
                });
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
          routingDiagnostics.push({
            model: modelName,
            status: 'tool_call',
            tools: calls.map(c => c.name)
          });

          const toolResponses = await Promise.all(calls.map(async (call) => {
            const handler = toolHandlers[call.name];
            console.log(`[Gemini Tool] Executing ${call.name} with args:`, call.args);
            if (handler) {
              try {
                const result = await handler(call.args);
                console.log(`[Gemini Tool] ${call.name} returned ${Array.isArray(result) ? result.length : '1'} results`);
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
        console.log(`[Gemini Chat] Final response text from ${modelName}:`, text);
        
        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from model');
        }

        const currentDiagnostic = routingDiagnostics.find(d => d.model === modelName && d.status === 'attempting');
        if (currentDiagnostic) currentDiagnostic.status = 'success';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          content: text, 
          provider: 'gemini', 
          model: modelName,
          diagnostics: routingDiagnostics
        }));
        return;
      } catch (error) {
        lastErr = error;
        const errorType = isGeminiQuotaOrBillingError(error) ? 'quota_billing' : 
                         isModelNotFoundError(error) ? 'not_found' : 'general_error';
        
        const currentDiagnostic = routingDiagnostics.find(d => d.model === modelName && d.status === 'attempting');
        if (currentDiagnostic) {
          currentDiagnostic.status = 'failed';
          currentDiagnostic.error = error.message;
          currentDiagnostic.errorType = errorType;
        }

        // If quota/billing error, continue to next Gemini model instead of breaking
        if (isGeminiQuotaOrBillingError(error)) {
          console.log(`[Gemini Chat] Quota/Billing error on ${modelName}: ${error.message}. Trying next candidate...`);
          continue; // Try next Gemini model as requested by Trey
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
      routingDiagnostics.push({
        provider: 'perplexity',
        model: perplexityModel,
        status: 'attempting',
        reason: 'gemini_exhausted'
      });
      console.log('[Gemini Chat] Falling back to Perplexity...');
      const content = await callPerplexity(null, routingDiagnostics);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        content, 
        provider: 'perplexity', 
        model: perplexityModel,
        diagnostics: routingDiagnostics
      }));
      return;
    }
    throw lastErr || new Error('No Gemini model candidates succeeded');

  } catch (error) {
    logger.error('[Gemini Chat] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      message: error.message,
      diagnostics: typeof routingDiagnostics !== 'undefined' ? routingDiagnostics : []
    }));
  }
}
