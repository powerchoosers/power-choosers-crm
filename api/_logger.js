// Shared logger for all API files
// Respects production settings to reduce Cloud Run costs
const isProduction = process.env.NODE_ENV === 'production';
const verboseLogs = process.env.VERBOSE_LOGS === 'true';
const logLevel = process.env.LOG_LEVEL || 'info';

// Log level hierarchy
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = logLevels[logLevel] ?? logLevels.info;

export const logger = {
  log: (...args) => {
    if (!isProduction || verboseLogs) {
      if (currentLogLevel >= logLevels.info) {
        console.log(...args);
      }
    }
  },
  info: (...args) => {
    if (!isProduction || verboseLogs) {
      if (currentLogLevel >= logLevels.info) {
        console.log(...args);
      }
    }
  },
  warn: (...args) => {
    // Always show warnings (important for production debugging)
    if (currentLogLevel >= logLevels.warn) {
      console.warn(...args);
    }
  },
  error: (...args) => {
    // Always show errors (critical for production debugging)
    if (currentLogLevel >= logLevels.error) {
      console.error(...args);
    }
  },
  debug: (...args) => {
    // Only in development
    if (!isProduction) {
      if (currentLogLevel >= logLevels.debug) {
        console.log(...args);
      }
    }
  }
};

export default logger;

