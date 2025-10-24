import { parse } from 'querystring';

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
        console.error('Error parsing form-urlencoded body:', e);
        reject(new Error('Invalid form-urlencoded data'));
      }
    });
    req.on('error', err => {
      console.error('Request stream error:', err);
      reject(err);
    });
  });
}
