import { parse } from 'querystring';
import logger from './_logger.js';

export async function readFormUrlEncodedBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString(); // convert Buffer to string
    });
    req.on('end', () => {
      try {
        resolve(parse(body)); // Parse form-urlencoded string
      } catch (e) {
        logger.error('Error parsing form-urlencoded body:', e);
        reject(new Error('Invalid form-urlencoded data'));
      }
    });
    req.on('error', err => {
      logger.error('Request stream error:', err);
      reject(err);
    });
  });
}
