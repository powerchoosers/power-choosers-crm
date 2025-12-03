import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file (for localhost)
dotenv.config();

// Simple logging function for Cloud Run cost optimization
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = logLevels[process.env.LOG_LEVEL || 'info'];

const logger = {
  info: (message, context, data) => {
    if (currentLogLevel >= logLevels.info && process.env.VERBOSE_LOGS === 'true') {
      console.log(`[${context}] ${message}`, data || '');
    }
  },
  error: (message, context, data) => {
    console.error(`[${context}] ${message}`, data || '');
  },
  debug: (message, context, data) => {
    if (currentLogLevel >= logLevels.debug && process.env.VERBOSE_LOGS === 'true') {
      console.log(`[${context}] ${message}`, data || '');
    }
  },
  warn: (message, context, data) => {
    if (currentLogLevel >= logLevels.warn) {
      console.warn(`[${context}] ${message}`, data || '');
    }
  }
};

// Define __filename and __dirname equivalent once at the top level
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define getContentType function
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

// Import API handlers to avoid infinite loop
import callStatusHandler from './api/call-status.js';
import accountCallsHandler from './api/calls/account/[accountId].js';
import contactCallsHandler from './api/calls/contact/[contactId].js';
import twilioTokenHandler from './api/twilio/token.js';
import twilioCallHandler from './api/twilio/call.js';
import twilioVoiceHandler from './api/twilio/voice.js';
import searchHandler from './api/search.js';
import callsHandler from './api/calls.js';

// NEW IMPORTS FOR REMAINING ENDPOINTS
import perplexityEmailHandler from './api/perplexity-email.js';
import twilioRecordingHandler from './api/twilio/recording.js';
import twilioConversationalIntelligenceHandler from './api/twilio/conversational-intelligence.js';
import twilioCiRequestHandler from './api/twilio/ci-request.js';
import twilioConversationalIntelligenceWebhookHandler from './api/twilio/conversational-intelligence-webhook.js';
import twilioLanguageWebhookHandler from './api/twilio/language-webhook.js';
import twilioVoiceIntelligenceHandler from './api/twilio/voice-intelligence.js';
import twilioAiInsightsHandler from './api/twilio/ai-insights.js';
import txPriceHandler from './api/tx-price.js';
import twilioPollCiAnalysisHandler from './api/twilio/poll-ci-analysis.js';
import twilioCallerLookupHandler from './api/twilio/caller-lookup.js';
import sendgridSendHandler from './api/email/sendgrid-send.js';
import inboundEmailHandler from './api/email/inbound-email.js';
import generateScheduledEmailsHandler from './api/generate-scheduled-emails.js';
import sendScheduledEmailsHandler from './api/send-scheduled-emails.js';
import processSequenceActivationsHandler from './api/process-sequence-activations.js';
import completeSequenceTaskHandler from './api/complete-sequence-task.js';
import backfillSequenceTasksHandler from './api/backfill-sequence-tasks.js';
import createBookingHandler from './api/create-booking.js';

// ADDITIONAL IMPORTS FOR REMAINING PROXY FUNCTIONS
import emailBackfillThreadsHandler from './api/email/backfill-threads.js';
import emailUnsubscribeHandler from './api/email/unsubscribe.js';
import processCallHandler from './api/process-call.js';
import trackEmailPerformanceHandler from './api/track-email-performance.js';
import apolloCompanyHandler from './api/apollo/company.js';
import apolloContactsHandler from './api/apollo/contacts.js';
import apolloEnrichHandler from './api/apollo/enrich.js';
import apolloUsageHandler from './api/apollo/usage.js';
import apolloHealthHandler from './api/apollo/health.js';
import uploadHostGoogleAvatarHandler from './api/upload/host-google-avatar.js';
import uploadSignatureImageHandler from './api/upload/signature-image.js';
import generateStaticPostHandler from './api/posts/generate-static.js';
import generateAiPostHandler from './api/posts/generate-ai.js';
import postsListHandler from './api/posts/list.js';
import sitemapHandler from './api/sitemap.js';
import algoliaReindexHandler from './api/algolia/reindex.js';
import mapsConfigHandler from './api/maps/config.js';
import debugCallHandler from './api/debug/call.js';
import debugHealthHandler from './api/debug/health.js';
import twilioStatusHandler from './api/twilio/status.js';
import twilioDialStatusHandler from './api/twilio/dial-status.js';
import twilioHangupHandler from './api/twilio/hangup.js';
import twilioCallerIdHandler from './api/twilio/caller-id.js';
import twilioCheckTranscriptStatusHandler from './api/twilio/check-transcript-status.js';
import twilioTranscribeHandler from './api/twilio/transcribe.js';
import twilioDialCompleteHandler from './api/twilio/dial-complete.js';
import twilioProcessExistingTranscriptsHandler from './api/twilio/process-existing-transcripts.js';
import energyNewsHandler from './api/energy-news.js';
import twilioBridgeHandler from './api/twilio/bridge.js';
import twilioOperatorWebhookHandler from './api/twilio/operator-webhook.js';
import twilio from 'twilio';
import { admin } from './api/_firebase.js';

// Import body parsers
import { readFormUrlEncodedBody } from './api/_form-parser.js';

// Load environment variables from .env file for localhost development
try {
  await import('dotenv/config');
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] dotenv loaded successfully');
  }
} catch (error) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] dotenv not available or failed to load:', error.message);
  }
  // Continue with system environment variables
}

// Essential startup logging only
logger.info('Power Choosers CRM server starting', 'Server');
logger.info('Server configuration loaded', 'Server', {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
});

// Development-only detailed logging
if (process.env.NODE_ENV !== 'production') {
  console.log('[Server] Environment check:', {
    hasTwilioAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
    hasTwilioAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasPerplexityApiKey: !!process.env.PERPLEXITY_API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000
  });
  console.log('[Server] PORT environment variable:', process.env.PORT);
  console.log('[Server] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Server] API_BASE_URL:', process.env.API_BASE_URL);
  console.log('[Server] PUBLIC_BASE_URL:', process.env.PUBLIC_BASE_URL);
  console.log('[Server] dotenv processing complete.');
  console.log('[Server] Initializing Firebase connection...');
  console.log('[Server] Setting up Twilio client...');
  console.log('[Server] Loading API handlers...');
}

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// Configuration
const PORT = process.env.PORT || 3000;
const LOCAL_DEV_MODE = process.env.NODE_ENV !== 'production';
const API_BASE_URL = process.env.API_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
// Only used for external webhooks, not internal API routing
// Email sending now handled by Gmail API via frontend

// Helper function to generate correlation IDs for request tracing
function getCorrelationId(req) {
  return req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ---------------- Perplexity API endpoint for localhost development ----------------

async function handleApiPerplexityEmail(req, res) {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://powerchoosers.com',
      'https://www.powerchoosers.com',
      'https://power-choosers-crm-792458658491.us-south1.run.app'
    ];

    const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Ensure body is parsed for POST requests so downstream handler receives req.body
  try {
    req.body = await parseRequestBody(req);
  } catch (error) {
    console.error('[Server] Perplexity API - Body Parse Error:', error.message);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request body' }));
    return;
  }

  try {
    // Import the Vercel function logic
    const { default: perplexityHandler } = await import('./api/perplexity-email.js');

    // Create a mock request/response that matches Vercel's format
    const mockReq = {
      method: req.method,
      headers: req.headers,
      body: req.body
    };

    const mockRes = {
      writeHead: (code, headers = {}) => {
        // Mirror headers and status to the actual response
        try { Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v)); } catch (_) { }
        res.statusCode = code;
      },
      status: (code) => ({
        json: (data) => {
          const origin = req.headers.origin;
          const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://powerchoosers.com',
            'https://www.powerchoosers.com',
            'https://power-choosers-crm-792458658491.us-south1.run.app'
          ];

          const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

          res.writeHead(code, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Allow-Credentials': 'true',
            'Vary': 'Origin'
          });
          res.end(JSON.stringify(data));
        }
      }),
      setHeader: (key, value) => {
        res.setHeader(key, value);
      },
      end: (data) => {
        // If handler didn't set status, default to 200
        res.end(data);
      }
    };

    // Call the Vercel function
    await perplexityHandler(mockReq, mockRes);

  } catch (error) {
    console.error('[Server] Perplexity API error:', error);
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
  }
}

// ---------------- Gemini API endpoints now proxied to Vercel ----------------

// Helper to read raw request body without JSON parsing (for Twilio webhooks)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5e6) { // 5MB guard for webhooks
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Twilio Voice webhook (returns TwiML XML)
async function handleApiTwilioVoice(req, res, parsedUrl) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Voice webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      logger.error('Twilio Voice webhook parse error', 'TwilioWebhook', { correlationId, error: error.message });
      res.writeHead(400, { 'Content-Type': 'text/xml' });
      res.end('<Response><Say>Invalid request body</Say></Response>');
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const ok = ct.includes('application/json') ? validateTwilioJson(req) : validateTwilioForm(req);
    if (!ok) {
      res.writeHead(403, { 'Content-Type': 'text/xml' });
      res.end('<Response><Say>Forbidden</Say></Response>');
      return;
    }
  }

  // Add query parameters to req.query for handler
  req.query = { ...parsedUrl.query };

  try {
    await twilioVoiceHandler(req, res);
  } catch (error) {
    logger.error('Twilio Voice handler unhandled error', 'TwilioWebhook', { correlationId, error: error.message });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/xml' });
      res.end('<Response><Say>Internal server error</Say></Response>');
    }
  }
}

// Twilio Recording status webhook
async function handleApiTwilioRecording(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Recording webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Recording webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
      if (!validateTwilioForm(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Twilio signature validation failed');
        return;
      }
    }
  }

  try {
    await twilioRecordingHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Recording handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

// Twilio Conversational Intelligence processing endpoint
async function handleApiTwilioConversationalIntelligence(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await twilioConversationalIntelligenceHandler(req, res);
}

// Twilio CI request (starts transcript processing)
async function handleApiTwilioCIRequest(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await twilioCiRequestHandler(req, res);
}

// Twilio Conversational Intelligence webhook (Twilio -> our API)
async function handleApiTwilioConversationalIntelligenceWebhook(req, res) {
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Twilio CI webhook - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const ok = ct.includes('application/json') ? validateTwilioJson(req) : validateTwilioForm(req);
    if (!ok) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Twilio signature validation failed' }));
      return;
    }
  }
  return await twilioConversationalIntelligenceWebhookHandler(req, res);
}

async function handleApiTwilioLanguageWebhook(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  const parsedUrl = url.parse(req.url, true);
  req.query = { ...parsedUrl.query };
  if (req.method === 'POST') {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const ok = ct.includes('application/json') ? validateTwilioJson(req) : validateTwilioForm(req);
    if (!ok) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Twilio signature validation failed' }));
      return;
    }
  }
  return await twilioLanguageWebhookHandler(req, res);
}

async function handleApiTwilioVoiceIntelligence(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  const parsedUrl = url.parse(req.url, true);
  req.query = { ...parsedUrl.query };
  return await twilioVoiceIntelligenceHandler(req, res);
}

// Helper function for reading request body
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Increased to 10MB to support featured image uploads (base64 encoded images can be large)
      if (data.length > 10e6) { // 10MB guard
        req.connection.destroy();
        reject(new Error('Payload too large (max 10MB)'));
      }
    });
    req.on('end', () => {
      try {
        try { req.rawBody = data; } catch (_) { }
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        logger.error('JSON parse error', 'Server', {
          error: e.message,
          url: req.url,
          method: req.method,
          contentType: req.headers['content-type'],
          dataLength: data ? data.length : 0
        });
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Centralized body parser with content-type detection
async function parseRequestBody(req) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return readJsonBody(req);
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    return readFormUrlEncodedBody(req);
  } else {
    // Default to form-urlencoded for Twilio webhooks that may not specify content-type
    // Only log in development to reduce production logging costs
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`Unspecified or unknown Content-Type: ${contentType} for URL: ${req.url} - attempting form-urlencoded parse`, 'Server');
    }
    return readFormUrlEncodedBody(req);
  }
}

function getExternalUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}${req.url}`;
}

function validateTwilioForm(req) {
  const sig = req.headers['x-twilio-signature'];
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!sig || !token) return true;
  const urlFull = getExternalUrl(req);
  const params = (req && req.body && typeof req.body === 'object') ? req.body : {};
  try { return !!twilio.validateRequest(token, sig, urlFull, params); } catch (_) { return false; }
}

function validateTwilioJson(req) {
  const sig = req.headers['x-twilio-signature'];
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!sig || !token) return true;
  const urlFull = getExternalUrl(req);
  const raw = typeof req.rawBody === 'string' ? req.rawBody : '';
  try { return !!twilio.validateRequestBody(token, sig, urlFull, raw); } catch (_) { return false; }
}

// Twilio API endpoints (proxy to Vercel for production APIs)
async function handleApiTwilioToken(req, res, parsedUrl) {
  // Call handler directly (no proxy)
  return await twilioTokenHandler(req, res);
}

async function handleApiTwilioCall(req, res) {
  // Parse body for POST requests
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Twilio Call API - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }

  // Call handler directly (no proxy)
  return await twilioCallHandler(req, res);
}

async function handleApiTwilioAIInsights(req, res) {
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Twilio AI Insights API - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }
  return await twilioAiInsightsHandler(req, res);
}

async function handleApiCalls(req, res) {
  // Parse body for POST requests
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Calls API - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }

  // Add query parameters to req.query for handler
  const parsed = url.parse(req.url, true);
  req.query = { ...parsed.query };

  // Call handler directly (no proxy)
  return await callsHandler(req, res);
}

async function handleApiCallsAccount(req, res, parsedUrl) {
  // Extract accountId from URL path: /api/calls/account/[accountId]
  const pathParts = parsedUrl.pathname.split('/');
  const accountId = pathParts[pathParts.length - 1];

  // Add accountId to req.query for handler
  req.query = { accountId, ...parsedUrl.query };

  // Call handler directly (no proxy)
  return await accountCallsHandler(req, res);
}

async function handleApiCallStatus(req, res, parsedUrl) {
  // Parse body for POST requests
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Call Status API - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }

  // Call handler directly (no proxy)
  return await callStatusHandler(req, res);
}

// ---------------- Gemini API endpoints now proxied to Vercel ----------------

async function handleApiTxPrice(req, res, parsedUrl) {
  req.query = { ...parsedUrl.query };
  return await txPriceHandler(req, res);
}

// Twilio Poll CI Analysis (background analyzer)
async function handleApiTwilioPollCIAnalysis(req, res) {
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Twilio Poll CI Analysis API - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }
  return await twilioPollCiAnalysisHandler(req, res);
}

// Create HTTP server
logger.debug('Creating HTTP server', 'Server');
const server = http.createServer(async (req, res) => {
  // CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com'
  ];

  if (allowedOrigins.includes(origin) || LOCAL_DEV_MODE) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  // Parse the URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Preflight for API routes
  if (req.method === 'OPTIONS' && (
    pathname === '/api/twilio/token' ||
    pathname === '/api/twilio/call' ||
    pathname === '/api/twilio/voice' ||
    pathname === '/api/twilio/caller-lookup' ||
    pathname === '/api/twilio/status' ||
    pathname === '/api/twilio/dial-status' ||
    pathname === '/api/twilio/hangup' ||
    pathname === '/api/twilio/caller-id' ||
    pathname === '/api/twilio/check-transcript-status' ||
    pathname === '/api/twilio/dial-complete' ||
    pathname === '/api/twilio/process-existing-transcripts' ||
    pathname === '/api/twilio/transcribe' ||
    pathname === '/api/twilio/bridge' ||
    pathname === '/api/twilio/operator-webhook' ||
    pathname === '/api/calls' ||
    pathname.startsWith('/api/calls/account/') ||
    pathname.startsWith('/api/calls/contact/') ||
    pathname === '/api/call-status' ||
    pathname === '/api/twilio/language-webhook' ||
    pathname === '/api/twilio/conversational-intelligence' ||
    pathname === '/api/twilio/conversational-intelligence-webhook' ||
    pathname === '/api/twilio/ci-request' ||
    pathname === '/api/twilio/poll-ci-analysis' ||
    pathname === '/api/twilio/recording' ||
    pathname === '/api/twilio/ai-insights' ||
    pathname === '/api/energy-news' ||
    pathname === '/api/search' ||
    pathname === '/api/tx-price' ||
    pathname === '/api/perplexity-email' ||
    pathname === '/api/process-call' ||
    pathname === '/api/track-email-performance' ||
    pathname === '/api/apollo/company' ||
    pathname === '/api/apollo/contacts' ||
    pathname === '/api/apollo/enrich' ||
    pathname === '/api/apollo/usage' ||
    pathname === '/api/apollo/health' ||
    pathname === '/api/upload/host-google-avatar' ||
    pathname === '/api/upload/signature-image' ||
    pathname === '/api/posts/generate-ai' ||
    pathname === '/api/posts/list' ||
    pathname === '/api/algolia/reindex' ||
    pathname === '/api/maps/config' ||
    pathname === '/api/debug/call' ||
    pathname === '/api/debug/health' ||
    pathname === '/api/email/sendgrid-send' ||
    pathname.startsWith('/api/email/track/') ||
    pathname.startsWith('/api/email/click/') ||
    pathname === '/api/email/webhook' ||
    pathname === '/api/email/inbound-email' ||
    pathname === '/api/email/stats' ||
    pathname === '/api/email/backfill-threads' ||
    pathname === '/api/email/unsubscribe' ||
    pathname === '/api/recording' ||
    // New: allow generic preflight for any API path (covers phone lookup/search variants)
    pathname.startsWith('/api/')
  )) {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes (Twilio integration - proxy to Vercel)
  if (pathname === '/api/twilio/token') {
    return handleApiTwilioToken(req, res, parsedUrl);
  }
  if (pathname === '/api/twilio/call') {
    return handleApiTwilioCall(req, res);
  }
  if (pathname === '/api/twilio/voice') {
    return handleApiTwilioVoice(req, res, parsedUrl);
  }
  if (pathname === '/api/twilio/caller-lookup') {
    return handleApiTwilioCallerLookup(req, res);
  }
  if (pathname === '/api/twilio/language-webhook') {
    return handleApiTwilioLanguageWebhook(req, res);
  }
  if (pathname === '/api/twilio/voice-intelligence') {
    return handleApiTwilioVoiceIntelligence(req, res);
  }
  if (pathname === '/api/twilio/conversational-intelligence') {
    return handleApiTwilioConversationalIntelligence(req, res);
  }
  if (pathname === '/api/twilio/ci-request') {
    return handleApiTwilioCIRequest(req, res);
  }
  if (pathname === '/api/twilio/conversational-intelligence-webhook') {
    return handleApiTwilioConversationalIntelligenceWebhook(req, res);
  }
  if (pathname === '/api/twilio/poll-ci-analysis') {
    return handleApiTwilioPollCIAnalysis(req, res);
  }
  if (pathname === '/api/twilio/recording') {
    return handleApiTwilioRecording(req, res);
  }
  if (pathname === '/api/twilio/ai-insights') {
    return handleApiTwilioAIInsights(req, res);
  }
  if (pathname === '/api/calls') {
    return handleApiCalls(req, res);
  }
  if (pathname.startsWith('/api/calls/account/')) {
    return handleApiCallsAccount(req, res, parsedUrl);
  }
  if (pathname === '/api/call-status') {
    return handleApiCallStatus(req, res, parsedUrl);
  }
  if (pathname === '/api/recording') {
    return handleApiRecording(req, res, parsedUrl);
  }
  if (pathname === '/api/energy-news') {
    return handleApiEnergyNews(req, res);
  }
  if (pathname === '/api/search') {
    return handleApiSearch(req, res, parsedUrl);
  }
  // Aliases for phone metadata lookups used by the softphone widget
  if (pathname === '/api/contacts/search' || pathname === '/api/v1/search' || pathname === '/api/lookup/phone' || pathname === '/api/contacts/lookup') {
    return handleApiSearch(req, res, parsedUrl);
  }
  if (pathname === '/api/tx-price') {
    return handleApiTxPrice(req, res, parsedUrl);
  }
  if (pathname === '/api/perplexity-email') {
    return handleApiPerplexityEmail(req, res);
  }

  // Email tracking routes
  if (pathname === '/api/email/sendgrid-send') {
    // Parse request body before calling handler (handler expects req.body to be parsed)
    if (req.method === 'POST') {
      try {
        req.body = await parseRequestBody(req);
      } catch (error) {
        console.error('[Server] Gmail Send - Body Parse Error:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }
    }
    // Route directly to sendgrid-send.js handler (has all proper field extraction and logging)
    return await sendgridSendHandler(req, res);
  }
  if (pathname.startsWith('/api/email/track/')) {
    return handleApiEmailTrack(req, res, parsedUrl);
  }
  if (pathname.startsWith('/api/email/click/')) {
    return handleApiEmailClick(req, res, parsedUrl);
  }
  if (pathname === '/api/email/update-tracking') {
    return handleApiEmailUpdateTracking(req, res);
  }
  if (pathname === '/api/email/tracking-events') {
    return handleApiEmailTrackingEvents(req, res);
  }
  if (pathname === '/api/email/webhook') {
    return handleApiEmailWebhook(req, res);
  }
  if (pathname === '/api/email/inbound-email') {
    return handleApiInboundEmail(req, res);
  }
  if (pathname === '/api/email/stats') {
    return handleApiEmailStats(req, res, parsedUrl);
  }
  if (pathname === '/api/email/backfill-threads') {
    return handleApiEmailBackfillThreads(req, res);
  }
  if (pathname === '/api/email/unsubscribe') {
    return handleApiEmailUnsubscribe(req, res);
  }
  if (pathname === '/api/generate-scheduled-emails') {
    return handleApiGenerateScheduledEmails(req, res);
  }
  if (pathname === '/api/send-scheduled-emails') {
    return handleApiSendScheduledEmails(req, res);
  }
  if (pathname === '/api/process-sequence-activations') {
    return handleApiProcessSequenceActivations(req, res);
  }
  if (pathname === '/api/complete-sequence-task') {
    return handleApiCompleteSequenceTask(req, res);
  }
  if (pathname === '/api/backfill-sequence-tasks') {
    return handleApiBackfillSequenceTasks(req, res);
  }
  if (pathname === '/api/process-call') {
    return handleApiProcessCall(req, res);
  }
  if (pathname === '/api/track-email-performance') {
    return handleApiTrackEmailPerformance(req, res);
  }
  if (pathname === '/api/create-booking') {
    return handleApiCreateBooking(req, res);
  }
  if (pathname === '/api/apollo/company') {
    return handleApiApolloCompany(req, res, parsedUrl);
  }
  if (pathname === '/api/apollo/contacts') {
    return handleApiApolloContacts(req, res, parsedUrl);
  }
  if (pathname === '/api/apollo/enrich') {
    return handleApiApolloEnrich(req, res, parsedUrl);
  }
  if (pathname === '/api/apollo/usage') {
    return handleApiApolloUsage(req, res, parsedUrl);
  }
  if (pathname === '/api/apollo/health') {
    return handleApiApolloHealth(req, res, parsedUrl);
  }
  if (pathname === '/api/upload/host-google-avatar') {
    return handleApiUploadHostGoogleAvatar(req, res);
  }
  if (pathname === '/api/upload/signature-image') {
    return handleApiUploadSignatureImage(req, res);
  }
  if (pathname === '/api/posts/generate-static') {
    return handleApiGenerateStaticPost(req, res);
  }
  if (pathname === '/api/posts/generate-ai') {
    return handleApiGenerateAiPost(req, res);
  }
  if (pathname === '/api/posts/list') {
    return handleApiPostsList(req, res);
  }
  if (pathname === '/api/algolia/reindex') {
    return handleApiAlgoliaReindex(req, res);
  }
  if (pathname === '/api/maps/config') {
    return handleApiMapsConfig(req, res);
  }
  if (pathname === '/api/debug/call') {
    return handleApiDebugCall(req, res);
  }
  if (pathname === '/api/debug/health') {
    return handleApiDebugHealth(req, res);
  }
  if (pathname === '/api/debug/firestore') {
    return handleApiDebugFirestore(req, res);
  }
  if (pathname.startsWith('/api/calls/contact/')) {
    return handleApiCallsContact(req, res, parsedUrl);
  }
  if (pathname === '/api/twilio/status') {
    return handleApiTwilioStatus(req, res);
  }
  if (pathname === '/api/twilio/dial-status') {
    return handleApiTwilioDialStatus(req, res);
  }
  if (pathname === '/api/twilio/hangup') {
    return handleApiTwilioHangup(req, res);
  }
  if (pathname === '/api/twilio/caller-id') {
    return handleApiTwilioCallerId(req, res);
  }
  if (pathname === '/api/twilio/check-transcript-status') {
    return handleApiTwilioCheckTranscriptStatus(req, res);
  }
  if (pathname === '/api/twilio/dial-complete') {
    return handleApiTwilioDialComplete(req, res);
  }
  if (pathname === '/api/twilio/process-existing-transcripts') {
    return handleApiTwilioProcessExistingTranscripts(req, res);
  }
  if (pathname === '/api/twilio/transcribe') {
    return handleApiTwilioTranscribe(req, res);
  }
  if (pathname === '/api/twilio/bridge') {
    return handleApiTwilioBridge(req, res);
  }
  if (pathname === '/api/twilio/operator-webhook') {
    return handleApiTwilioOperatorWebhook(req, res);
  }

  // Handle sitemap.xml route
  if (pathname === '/sitemap.xml') {
    return await sitemapHandler(req, res);
  }

  // Handle blog post routes: /posts/:slug
  if (pathname.startsWith('/posts/')) {
    // Extract slug from pathname (remove /posts/ prefix and .html suffix if present)
    let slug = pathname.replace('/posts/', '').replace(/\.html$/, '').trim();
    // Remove trailing slash if present
    slug = slug.replace(/\/$/, '');
    // Only proceed if slug is not empty
    if (slug) {
      return await handlePostRoute(req, res, slug);
    }
  }

  // Default to index.html for root requests (public landing page)
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Construct file path using the robust __dirname equivalent
  let filePath = path.join(__dirname, pathname);

  logger.debug('Attempting to serve static file', 'Server', { filePath });

  // Check if file exists first
  if (!fs.existsSync(filePath)) {
    // If file doesn't exist and pathname doesn't have an extension, try adding .html
    // This allows clean URLs like /resources instead of /resources.html
    const ext = path.extname(pathname);
    if (!ext && pathname !== '/') {
      const htmlPath = pathname + '.html';
      const htmlFilePath = path.join(__dirname, htmlPath);
      if (fs.existsSync(htmlFilePath)) {
        filePath = htmlFilePath;
        pathname = htmlPath; // Update pathname for logging
        logger.debug('Found file with .html extension', 'Server', { original: pathname, found: htmlPath });
      } else {
        console.error(`[Server] File not found at constructed path: ${filePath} or ${htmlFilePath}`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>404 - File Not Found</title>
              <style>
                  body { font-family: Arial, sans-serif; background-color: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                  .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: center; }
                  h1 { color: #ff5722; font-size: 2.5em; margin-bottom: 10px; }
                  p { color: #555; font-size: 1.1em; margin-bottom: 20px; }
                  a { color: #ff5722; text-decoration: none; font-weight: bold; }
                  a:hover { text-decoration: underline; }
              </style>
          </head>
          <body>
              <div class="container">
                  <h1>404 - File Not Found</h1>
                  <p>The requested file ${pathname} was not found.</p>
                  <p><a href="/">Back to Power Choosers CRM</a></p>
              </div>
          </body>
          </html>
        `);
        return;
      }
    } else {
      console.error(`[Server] File not found at constructed path: ${filePath}`);
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - File Not Found</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: center; }
                h1 { color: #ff5722; font-size: 2.5em; margin-bottom: 10px; }
                p { color: #555; font-size: 1.1em; margin-bottom: 20px; }
                a { color: #ff5722; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404 - File Not Found</h1>
                <p>The requested file ${pathname} was not found.</p>
                <p><a href="/">Back to Power Choosers CRM</a></p>
            </div>
        </body>
        </html>
      `);
      return;
    }
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const contentType = getContentType(filePath);
    logger.debug('Successfully served static file', 'Server', { filePath, contentType });
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    logger.error('Error reading file', 'Server', { filePath, error: error.message });
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>500 - Internal Server Error</title>
      </head>
      <body>
          <h1>500 - Internal Server Error</h1>
          <p>An unexpected error occurred while reading the file.</p>
          <p>Error details: ${error.message}</p>
      </body>
      </html>
    `);
  }
});

// ---------------- Blog Post Route Handler ----------------

// Get Firebase Storage bucket (same logic as generate-static.js)
function getStorageBucket() {
  if (!admin.apps || admin.apps.length === 0) {
    throw new Error('Firebase Admin not initialized');
  }
  
  const projectId = process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm';
  
  // Check for _NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET first (Cloud Run env var)
  // Then FIREBASE_STORAGE_BUCKET, then default
  let storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    process.env.FIREBASE_STORAGE_BUCKET;
  
  // Remove gs:// prefix if present
  if (storageBucket && storageBucket.startsWith('gs://')) {
    storageBucket = storageBucket.replace('gs://', '');
  }
  
  // If no bucket specified, use the project's default bucket name
  if (!storageBucket || (!storageBucket.includes('.') && !storageBucket.includes('gs://'))) {
    storageBucket = `${projectId}.firebasestorage.app`;
  }
  
  // Use default bucket (no name = uses project default)
  try {
    return admin.storage().bucket();
  } catch (error) {
    if (storageBucket) {
      return admin.storage().bucket(storageBucket);
    }
    throw error;
  }
}

// Handle blog post route: /posts/:slug
async function handlePostRoute(req, res, slug) {
  try {
    // Only handle GET requests
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // Get Firebase Storage bucket
    const bucket = getStorageBucket();
    
    // Construct file path in Firebase Storage
    const filename = `${slug}.html`;
    const filePath = `posts/${filename}`;
    
    logger.debug('Fetching post from Firebase Storage', 'PostRoute', { slug, filePath });
    
    // Get the file from Firebase Storage
    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      logger.warn('Post not found in Firebase Storage', 'PostRoute', { slug, filePath });
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - Post Not Found</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: center; }
                h1 { color: #ff5722; font-size: 2.5em; margin-bottom: 10px; }
                p { color: #555; font-size: 1.1em; margin-bottom: 20px; }
                a { color: #ff5722; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404 - Post Not Found</h1>
                <p>The blog post "${slug}" was not found.</p>
                <p><a href="/">Back to Power Choosers</a></p>
            </div>
        </body>
        </html>
      `);
      return;
    }
    
    // Get file metadata for cache control
    const [metadata] = await file.getMetadata();
    const updatedTime = metadata.updated ? new Date(metadata.updated).getTime() : Date.now();
    const etag = `"${metadata.etag || updatedTime}"`;
    
    // Check if client has cached version (If-None-Match header)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      logger.debug('Post not modified, returning 304', 'PostRoute', { slug });
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': 'public, max-age=300, must-revalidate', // 5 minutes, must revalidate
        'Last-Modified': new Date(updatedTime).toUTCString()
      });
      res.end();
      return;
    }
    
    // Download the file content
    const [fileContent] = await file.download();
    const htmlContent = fileContent.toString('utf8');
    
    logger.debug('Post fetched successfully', 'PostRoute', { slug, contentLength: htmlContent.length });
    
    // Serve the HTML with proper headers
    // Reduced cache time to 5 minutes with must-revalidate for faster updates
    // Load balancer will respect these headers
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate', // 5 minutes, must revalidate
      'ETag': etag,
      'Last-Modified': new Date(updatedTime).toUTCString(),
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(htmlContent);
    
  } catch (error) {
    logger.error('Error serving post', 'PostRoute', { slug, error: error.message });
    console.error('[PostRoute] Error details:', error);
    
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>500 - Server Error</title>
          <style>
              body { font-family: Arial, sans-serif; background-color: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); text-align: center; }
              h1 { color: #ff5722; font-size: 2.5em; margin-bottom: 10px; }
              p { color: #555; font-size: 1.1em; margin-bottom: 20px; }
              a { color: #ff5722; text-decoration: none; font-weight: bold; }
              a:hover { text-decoration: underline; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>500 - Server Error</h1>
              <p>An error occurred while loading the blog post.</p>
              <p><a href="/">Back to Power Choosers</a></p>
          </div>
      </body>
      </html>
    `);
  }
}

// ---------------- Additional API Handler Functions ----------------

// Email automation handlers
async function handleApiEmailBackfillThreads(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await emailBackfillThreadsHandler(req, res);
}

async function handleApiEmailUnsubscribe(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await emailUnsubscribeHandler(req, res);
}

async function handleApiGenerateScheduledEmails(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await generateScheduledEmailsHandler(req, res);
}

async function handleApiSendScheduledEmails(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await sendScheduledEmailsHandler(req, res);
}

async function handleApiProcessSequenceActivations(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await processSequenceActivationsHandler(req, res);
}

async function handleApiCompleteSequenceTask(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await completeSequenceTaskHandler(req, res);
}

async function handleApiBackfillSequenceTasks(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await backfillSequenceTasksHandler(req, res);
}

// Process call and track email performance
async function handleApiProcessCall(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await processCallHandler(req, res);
}

async function handleApiTrackEmailPerformance(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await trackEmailPerformanceHandler(req, res);
}

// Create booking handler (for public website forms)
async function handleApiCreateBooking(req, res) {
  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error('[Server] Create Booking - Body Parse Error:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }
  }
  return await createBookingHandler(req, res);
}

// Apollo API handlers
async function handleApiApolloCompany(req, res, parsedUrl) {
  req.query = { ...parsedUrl.query };
  return await apolloCompanyHandler(req, res);
}

async function handleApiApolloContacts(req, res, parsedUrl) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  req.query = { ...parsedUrl.query };
  return await apolloContactsHandler(req, res);
}

async function handleApiApolloEnrich(req, res, parsedUrl) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  req.query = { ...parsedUrl.query };
  return await apolloEnrichHandler(req, res);
}

async function handleApiApolloUsage(req, res, parsedUrl) {
  req.query = { ...parsedUrl.query };
  return await apolloUsageHandler(req, res);
}

async function handleApiApolloHealth(req, res, parsedUrl) {
  req.query = { ...parsedUrl.query };
  return await apolloHealthHandler(req, res);
}

// Upload handlers
async function handleApiUploadHostGoogleAvatar(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await uploadHostGoogleAvatarHandler(req, res);
}

async function handleApiUploadSignatureImage(req, res) {
  try {
    if (req.method === 'POST') {
      req.body = await parseRequestBody(req);
    }
    const result = await uploadSignatureImageHandler(req, res);
    return result;
  } catch (error) {
    console.error('[Server] Error in signature upload handler wrapper:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
  }
}

// Algolia and Maps handlers
async function handleApiGenerateStaticPost(req, res) {
  try {
    if (req.method === 'POST') {
      req.body = await parseRequestBody(req);
    }
    return await generateStaticPostHandler(req, res);
  } catch (error) {
    console.error('[Server] Error in generate static post handler wrapper:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
  }
}

async function handleApiGenerateAiPost(req, res) {
  try {
    if (req.method === 'POST') {
      req.body = await parseRequestBody(req);
    }
    return await generateAiPostHandler(req, res);
  } catch (error) {
    console.error('[Server] Error in generate AI post handler wrapper:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
  }
}

async function handleApiPostsList(req, res) {
  try {
    return await postsListHandler(req, res);
  } catch (error) {
    console.error('[Server] Error in posts list handler wrapper:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
  }
}

async function handleApiAlgoliaReindex(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await algoliaReindexHandler(req, res);
}

async function handleApiMapsConfig(req, res) {
  return await mapsConfigHandler(req, res);
}

// Debug handlers
async function handleApiDebugCall(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await debugCallHandler(req, res);
}

async function handleApiDebugHealth(req, res) {
  return await debugHealthHandler(req, res);
}

async function handleApiDebugFirestore(req, res) {
  try {
    // Test basic Firestore access
    const testDoc = await db.collection('debug').doc('test').get();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Firestore access working',
      timestamp: new Date().toISOString(),
      docExists: testDoc.exists
    }));
  } catch (error) {
    console.error('[Debug] Firestore error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
  }
}

// Calls contact handler
async function handleApiCallsContact(req, res, parsedUrl) {
  // Extract contactId from URL path: /api/calls/contact/[contactId]
  const pathParts = parsedUrl.pathname.split('/');
  const contactId = pathParts[pathParts.length - 1];

  // Add contactId to req.query for handler
  req.query = { contactId, ...parsedUrl.query };

  // Call handler directly (no proxy)
  return await contactCallsHandler(req, res);
}

// Additional Twilio handlers
async function handleApiTwilioStatus(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Status webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Status webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
      if (!validateTwilioForm(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Twilio signature validation failed');
        return;
      }
    }
  }

  try {
    await twilioStatusHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Status handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioDialStatus(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Dial Status webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Dial Status webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
      if (!validateTwilioForm(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Twilio signature validation failed');
        return;
      }
    }
  }

  try {
    await twilioDialStatusHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Dial Status handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioHangup(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Hangup webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Hangup webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const ok = ct.includes('application/json') ? validateTwilioJson(req) : validateTwilioForm(req);
    if (!ok) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Twilio signature validation failed');
      return;
    }
  }

  try {
    await twilioHangupHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Hangup handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioCallerId(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Caller ID webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Caller ID webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    const ok = ct.includes('application/json') ? validateTwilioJson(req) : validateTwilioForm(req);
    if (!ok) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Twilio signature validation failed');
      return;
    }
  }

  try {
    await twilioCallerIdHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Caller ID handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioCheckTranscriptStatus(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Check Transcript Status', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Check Transcript Status - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  try {
    await twilioCheckTranscriptStatusHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Check Transcript Status handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioDialComplete(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Dial Complete', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Dial Complete - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  try {
    await twilioDialCompleteHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Dial Complete handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioProcessExistingTranscripts(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Process Existing Transcripts', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Process Existing Transcripts - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  try {
    await twilioProcessExistingTranscriptsHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Process Existing Transcripts handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioTranscribe(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Transcribe', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Transcribe - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  try {
    await twilioTranscribeHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Transcribe handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioBridge(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Bridge webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Bridge - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  // Parse query parameters (req.query doesn't exist in raw Node.js HTTP)
  const parsed = url.parse(req.url, true);
  req.query = { ...parsed.query };

  try {
    await twilioBridgeHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Bridge handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

async function handleApiTwilioOperatorWebhook(req, res) {
  const correlationId = getCorrelationId(req);
  logger.debug('Processing Twilio Operator Webhook', 'TwilioWebhook', { correlationId, url: req.url });

  if (req.method === 'POST') {
    try {
      req.body = await parseRequestBody(req);
    } catch (error) {
      console.error(`[${correlationId}] [Server] Twilio Operator Webhook - Body Parse Error:`, error.message, error.stack);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid request body format',
        details: error.message,
        correlationId
      }));
      return;
    }
  }

  try {
    await twilioOperatorWebhookHandler(req, res);
  } catch (error) {
    console.error(`[${correlationId}] [Server] Twilio Operator Webhook handler unhandled error:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        correlationId
      }));
    }
  }
}

// Start the server with error handling
logger.debug('Starting server', 'Server', { port: PORT });
try {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info('Power Choosers CRM server running', 'Server', { port: PORT });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Server] Server successfully bound to 0.0.0.0:${PORT}`);
    }
  });
} catch (error) {
  logger.error('Failed to start server', 'Server', { error: error.message });
  console.error(`[Server] Error details:`, error);
  process.exit(1);
}

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use. Try a different port.`);
  } else {
    console.error('[Server] Server error:', err);
  }
});

// Add global error handlers for better debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
});

// Search endpoint: proxy to production for phone number lookups
async function handleApiSearch(req, res, parsedUrl) {
  // Add query parameters to req.query for handler
  req.query = { ...parsedUrl.query };

  // Call handler directly (no proxy)
  return await searchHandler(req, res);
}

// Twilio Caller ID lookup: accepts POST { phoneNumber }
async function handleApiTwilioCallerLookup(req, res) {
  if (req.method === 'POST') {
    req.body = await parseRequestBody(req);
  }
  return await twilioCallerLookupHandler(req, res);
}

// Energy News endpoint: fetch Google News RSS for Texas energy topics, parse minimal fields
async function handleApiEnergyNews(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const rssUrl = 'https://news.google.com/rss/search?q=%28Texas+energy%29+OR+ERCOT+OR+%22Texas+electricity%22&hl=en-US&gl=US&ceid=US:en';
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'PowerChoosersCRM/1.0' } });
    const xml = await response.text();

    // Basic XML parsing without external deps: extract <item> blocks and inner fields
    const rawItems = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) && rawItems.length < 4) {
      const block = match[1];
      const getTag = (name) => {
        const r = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i');
        const m = r.exec(block);
        return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      };
      const title = getTag('title');
      const link = getTag('link');
      const pubDate = getTag('pubDate');
      let publishedAt = '';
      try { publishedAt = new Date(pubDate).toISOString(); } catch (_) { publishedAt = ''; }
      // Skip if missing essentials
      if (!title || !link) continue;
      rawItems.push({ title, url: link, publishedAt });
    }

    // Reformat headlines using Gemini to fit exactly 3 lines
    const items = [];
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = process.env.GEMINI_API_KEY;

      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Process headlines in parallel for better performance
        const reformattedItems = await Promise.all(rawItems.map(async (item) => {
          try {
            const prompt = `Rewrite this energy news headline to be approximately 150-180 characters long (must fill exactly 3 lines in a widget display). Make it detailed and comprehensive while remaining clear and scannable. Include the key facts and context. Remove source attribution (like "- CBS News", "- The Hill", etc.) from the end. Return ONLY the rewritten headline with no quotes or extra text:

"${item.title}"`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const reformattedTitle = response.text().trim().replace(/^["']|["']$/g, ''); // Remove quotes if any

            return {
              ...item,
              title: reformattedTitle || item.title // Fallback to original if Gemini fails
            };
          } catch (err) {
            console.error('[Energy News] Gemini reformatting failed for headline:', err);
            return item; // Fallback to original headline
          }
        }));

        items.push(...reformattedItems);
      } else {
        // No Gemini key - use original headlines
        console.warn('[Energy News] GEMINI_API_KEY not set, using original headlines');
        items.push(...rawItems);
      }
    } catch (error) {
      // Gemini import or processing failed - use original headlines
      console.error('[Energy News] Gemini processing failed:', error);
      items.push(...rawItems);
    }

    const payload = {
      lastRefreshed: new Date().toISOString(),
      items
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch energy news', message: error.message }));
  }
}

// In-memory cache for tracking deduplication (prevents rapid duplicate opens)
// Key: trackingId_userKey, Value: timestamp of last open
const trackingDedupeCache = new Map();
const TRACKING_DEDUPE_WINDOW_MS = 60000; // 1 minute window for deduplication

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of trackingDedupeCache.entries()) {
    if (now - timestamp > TRACKING_DEDUPE_WINDOW_MS * 2) {
      trackingDedupeCache.delete(key);
    }
  }
}, 300000);

// Email tracking endpoints
async function handleApiEmailTrack(req, res, parsedUrl) {
  // 1x1 transparent PNG
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Extract tracking ID from URL path: /api/email/track/{trackingId}
    const pathParts = parsedUrl.pathname.split('/');
    const trackingId = pathParts[pathParts.length - 1] || '';

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Detect device type
    const deviceType = detectDeviceType(userAgent);

    // Best-effort: record open event in Firestore
    if (trackingId && trackingId.length > 0 && admin) {
      // CRITICAL FIX: In-memory deduplication to prevent rapid duplicate opens
      // This is especially important for Gmail threads where opening one email
      // may load/render all emails in the thread, triggering multiple pixels
      const userKey = `${userAgent}_${ip}`;
      const dedupeKey = `${trackingId}_${userKey}`;
      const now = Date.now();
      const lastOpen = trackingDedupeCache.get(dedupeKey);
      
      if (lastOpen && (now - lastOpen) < TRACKING_DEDUPE_WINDOW_MS) {
        // Duplicate open within window - skip recording but still return pixel
        logger.debug('[Email Track] Duplicate open ignored (in-memory cache)', 'Server', {
          trackingId: trackingId.substring(0, 20) + '...',
          timeSinceLastOpen: now - lastOpen
        });
      } else {
        // Update in-memory cache first (fast path)
        trackingDedupeCache.set(dedupeKey, now);
        
        try {
          const db = admin.firestore();
          const ref = db.collection('emails').doc(trackingId);
          const snap = await ref.get();

          if (snap.exists) {
            const openedAt = new Date().toISOString();
            const currentData = snap.data() || {};
            const existingOpens = currentData.opens || [];

            // Secondary deduplication: Check Firestore for recent opens from same user
            // This catches cases where in-memory cache was cleared (server restart)
            const recentOpen = existingOpens.find(open => {
              const openTime = new Date(open.openedAt).getTime();
              return `${open.userAgent}_${open.ip}` === userKey && (now - openTime) < TRACKING_DEDUPE_WINDOW_MS;
            });

            if (!recentOpen) {
              // Create open event object
              const openEvent = {
                openedAt,
                userAgent,
                ip: maskIpAddress(ip),
                deviceType,
                referer,
                isBotFlagged: deviceType === 'bot'
              };

              await ref.update({
                openCount: (currentData.openCount || 0) + 1,
                opens: existingOpens.concat([openEvent]),
                updatedAt: openedAt,
                lastOpened: openedAt
              });

              logger.debug('[Email Track] Recorded open', 'Server', {
                trackingId: trackingId.substring(0, 20) + '...',
                deviceType,
                openCount: (currentData.openCount || 0) + 1
              });
            } else {
              logger.debug('[Email Track] Duplicate open ignored (Firestore check)', 'Server', {
                trackingId: trackingId.substring(0, 20) + '...'
              });
            }
          }
        } catch (dbError) {
          logger.error('[Email Track] Firestore error', 'Server', { error: dbError.message });
        }
      }
    }

    // Always return pixel with no-cache headers
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': PIXEL.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(PIXEL);
  } catch (error) {
    logger.error('[Email Track] Error', 'Server', { error: error.message });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PIXEL);
  }
}

// Click tracking handler
async function handleApiEmailClick(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Extract tracking ID from URL path: /api/email/click/{trackingId}
    const pathParts = parsedUrl.pathname.split('/');
    const trackingId = pathParts[pathParts.length - 1] || '';

    // Get redirect URL from query params
    const searchParams = new URLSearchParams(parsedUrl.search || '');
    const originalUrl = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')) : null;
    const linkIndex = parseInt(searchParams.get('idx') || '0', 10);

    // Validate redirect URL
    if (!originalUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing redirect URL');
      return;
    }

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Detect device type
    const deviceType = detectDeviceType(userAgent);

    // Best-effort: record click event in Firestore
    if (trackingId && trackingId.length > 0 && admin) {
      try {
        const db = admin.firestore();
        const ref = db.collection('emails').doc(trackingId);
        const snap = await ref.get();

        if (snap.exists) {
          const clickedAt = new Date().toISOString();
          const currentData = snap.data() || {};

          // Create click event object
          const clickEvent = {
            clickedAt,
            url: originalUrl,
            linkIndex,
            userAgent,
            ip: maskIpAddress(ip),
            deviceType,
            referer
          };

          await ref.update({
            clickCount: (currentData.clickCount || 0) + 1,
            clicks: (currentData.clicks || []).concat([clickEvent]),
            updatedAt: clickedAt,
            lastClicked: clickedAt
          });

          logger.debug('[Email Click] Recorded click', 'Server', {
            trackingId: trackingId.substring(0, 20) + '...',
            url: originalUrl.substring(0, 50) + '...',
            deviceType
          });
        }
      } catch (dbError) {
        logger.error('[Email Click] Firestore error', 'Server', { error: dbError.message });
      }
    }

    // Always redirect to original URL (302 for repeat tracking)
    res.writeHead(302, {
      'Location': originalUrl,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end();
  } catch (error) {
    logger.error('[Email Click] Error', 'Server', { error: error.message });
    
    // Try to redirect even on error
    const searchParams = new URLSearchParams(parsedUrl?.search || '');
    const fallbackUrl = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')) : null;
    if (fallbackUrl) {
      res.writeHead(302, { 'Location': fallbackUrl });
      res.end();
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }
}

// Helper function to detect device type from user agent
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  
  if (/bot|crawler|spider|googleimageproxy|feedfetcher|slurp|yahoo|bing|baidu/i.test(ua)) {
    return 'bot';
  }
  if (/mobile|android|iphone|phone|webos|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  if (/tablet|ipad/i.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

// Helper function to mask IP address for privacy
function maskIpAddress(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  
  // IPv4: mask last 2 octets
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  }
  
  // IPv6: mask last half
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 4) {
      return parts.slice(0, 4).join(':') + ':****';
    }
  }
  
  return ip.substring(0, 10) + '***';
}

async function handleApiEmailUpdateTracking(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const { trackingId, type, data } = body;

    if (!trackingId || !type) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: trackingId, type' }));
      return;
    }


    // Store the tracking event in a simple in-memory store
    // In production, this would be stored in a database
    if (!global.emailTrackingEvents) {
      global.emailTrackingEvents = new Map();
    }

    const eventKey = `${trackingId}_${type}`;
    global.emailTrackingEvents.set(eventKey, {
      trackingId,
      type,
      data,
      timestamp: new Date().toISOString()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Tracking update stored',
      trackingId,
      type
    }));

  } catch (error) {
    console.error('[Email] Update tracking error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to update tracking', message: error.message }));
  }
}

async function handleApiEmailTrackingEvents(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const events = global.emailTrackingEvents ? Array.from(global.emailTrackingEvents.values()) : [];

    // Clear events after reading so they are not reprocessed next poll
    if (global.emailTrackingEvents) {
      global.emailTrackingEvents.clear();
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      events,
      count: events.length
    }));

  } catch (error) {
    console.error('[Email] Get tracking events error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to get tracking events', message: error.message }));
  }
}

async function handleApiEmailWebhook(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const { event, trackingId, data } = body;

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
        // TODO: Update database with open event
        break;
      case 'email_replied':
        // TODO: Update database with reply event
        break;
      case 'email_bounced':
        // TODO: Update database with bounce event
        break;
      default:
        // Unknown webhook event
        break;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));

  } catch (error) {
    console.error('[Email] Webhook error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook', message: error.message }));
  }
}

async function handleApiEmailStats(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const trackingId = parsedUrl.query.trackingId;

    if (!trackingId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing trackingId parameter' }));
      return;
    }

    // TODO: Fetch email stats from database
    // For now, return mock data
    const stats = {
      trackingId,
      openCount: 0,
      replyCount: 0,
      lastOpened: null,
      lastReplied: null,
      opens: [],
      replies: []
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));

  } catch (error) {
    console.error('[Email] Stats error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch email stats', message: error.message }));
  }
}

// Proxy Twilio recording audio to the browser
async function handleApiRecording(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const query = parsedUrl.query || {};
    const remoteUrl = query.url;
    if (!remoteUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Twilio credentials on server' }));
      return;
    }

    // Prefer dual-channel playback if not explicitly requested
    let fetchUrl = remoteUrl;
    try {
      const u = new URL(fetchUrl);
      if (!u.searchParams.has('RequestedChannels')) {
        u.searchParams.set('RequestedChannels', '2');
      }
      fetchUrl = u.toString();
    } catch (_) { }

    const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
    const upstream = await fetch(fetchUrl, { headers: { Authorization: authHeader } });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      res.writeHead(upstream.status, { 'Content-Type': 'text/plain' });
      res.end(txt || 'Failed to fetch recording');
      return;
    }

    // Stream audio back to the client
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Vary': 'Origin'
    });
    const reader = upstream.body.getReader();
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    });
    await pump();
  } catch (error) {
    console.error('[Server] /api/recording proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to proxy recording', message: error.message }));
  }
}

// Inbound email handler (for email parsing webhooks)
async function handleApiInboundEmail(req, res) {
  // Do NOT pre-parse the body, formidable in the handler needs the raw stream
  return await inboundEmailHandler(req, res);
}
