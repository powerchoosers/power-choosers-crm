import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../.cursor/debug.log');

// Shared logger for all API files
// Respects production settings to reduce Cloud Run costs
const isProduction = process.env.NODE_ENV === 'production';
const verboseLogs = process.env.VERBOSE_LOGS === 'true';
const logLevel = process.env.LOG_LEVEL || 'info';

// Log level hierarchy
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = logLevels[logLevel] ?? logLevels.info;

function writeToDebugLog(type, args) {
  try {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch(e) { return '[Object]'; }
      }
      return String(arg);
    }).join(' ');

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type,
      message: message,
      source: 'backend'
    };

    // Ensure directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch (e) {
    // Fail silently to avoid crashing the app due to logging issues
  }
}

export const logger = {
  log: (...args) => {
    if (!isProduction || verboseLogs) {
      if (currentLogLevel >= logLevels.info) {
        console.log(...args);
        writeToDebugLog('log', args);
      }
    }
  },
  info: (...args) => {
    if (!isProduction || verboseLogs) {
      if (currentLogLevel >= logLevels.info) {
        console.log(...args);
        writeToDebugLog('info', args);
      }
    }
  },
  warn: (...args) => {
    // Always show warnings (important for production debugging)
    if (currentLogLevel >= logLevels.warn) {
      console.warn(...args);
      writeToDebugLog('warn', args);
    }
  },
  error: (...args) => {
    // Always show errors (critical for production debugging)
    if (currentLogLevel >= logLevels.error) {
      console.error(...args);
      writeToDebugLog('error', args);
    }
  },
  debug: (...args) => {
    // Only in development
    if (!isProduction) {
      if (currentLogLevel >= logLevels.debug) {
        console.log(...args);
        writeToDebugLog('debug', args);
      }
    }
  }
};

export default logger;

