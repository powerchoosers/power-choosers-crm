// Production-safe logging utility
// Only logs errors in production, full logs in development

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const logger = {
  // Always log errors
  error: (...args) => {
    console.error(...args);
  },
  
  // Only log warnings in development
  warn: (...args) => {
    if (!IS_PRODUCTION) {
      console.warn(...args);
    }
  },
  
  // Only log info in development
  info: (...args) => {
    if (!IS_PRODUCTION) {
      console.log(...args);
    }
  },
  
  // Only log debug in development
  debug: (...args) => {
    if (!IS_PRODUCTION) {
      console.log(...args);
    }
  }
};
