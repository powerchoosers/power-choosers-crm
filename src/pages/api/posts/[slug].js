import { admin } from '../_firebase.js';
import logger from '../_logger.js';

function getStorageBucket() {
    if (!admin.apps || admin.apps.length === 0) {
        throw new Error('Firebase Admin not initialized');
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || 'power-choosers-crm';
    let storageBucket = process.env._NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET;

    if (storageBucket && storageBucket.startsWith('gs://')) {
        storageBucket = storageBucket.replace('gs://', '');
    }

    if (!storageBucket || (!storageBucket.includes('.') && !storageBucket.includes('gs://'))) {
        storageBucket = `${projectId}.firebasestorage.app`;
    }

    try {
        return admin.storage().bucket();
    } catch (error) {
        if (storageBucket) {
            return admin.storage().bucket(storageBucket);
        }
        throw error;
    }
}

export default async function handler(req, res) {
    const { slug } = req.query;

    try {
        if (req.method !== 'GET') {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method Not Allowed');
            return;
        }

        const bucket = getStorageBucket();
        const filename = `${slug}.html`;
        const filePath = `posts/${filename}`;

        logger.debug('Fetching post from Firebase Storage', 'PostRoute', { slug, filePath });

        const file = bucket.file(filePath);
        const [exists] = await file.exists();

        if (!exists) {
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

        const [metadata] = await file.getMetadata();
        const updatedTime = metadata.updated ? new Date(metadata.updated).getTime() : Date.now();
        const etag = `"${metadata.etag || updatedTime}"`;

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
            res.writeHead(304, {
                'ETag': etag,
                'Cache-Control': 'public, max-age=300, must-revalidate',
                'Last-Modified': new Date(updatedTime).toUTCString()
            });
            res.end();
            return;
        }

        const [fileContent] = await file.download();
        const htmlContent = fileContent.toString('utf8');

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300, must-revalidate',
            'ETag': etag,
            'Last-Modified': new Date(updatedTime).toUTCString(),
            'X-Content-Type-Options': 'nosniff'
        });
        res.end(htmlContent);

    } catch (error) {
        logger.error('Error serving post', 'PostRoute', { slug, error: error.message });
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 - Server Error</h1>');
    }
}
