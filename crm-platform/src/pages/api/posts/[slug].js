import { supabaseAdmin } from '../_supabase.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
    const { slug } = req.query;

    if (!slug) {
        res.status(400).json({ error: 'Slug is required' });
        return;
    }

    try {
        if (req.method !== 'GET') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        if (!supabaseAdmin) {
            logger.error('[PostRoute] Supabase Admin not initialized');
            res.status(500).send('Database not available');
            return;
        }

        // Fetch post from Supabase
        const { data: post, error } = await supabaseAdmin
            .from('posts')
            .select('*')
            .or(`slug.eq."${slug}",id.eq."${slug}"`)
            .eq('status', 'published')
            .maybeSingle();

        if (error) {
            logger.error('[PostRoute] Supabase error:', error);
            throw error;
        }

        if (!post) {
            res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - Post Not Found</title>
            <style>
                body { font-family: Inter, sans-serif; background-color: #0a0a0a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background-color: #111; border: 1px solid #222; padding: 40px; border-radius: 12px; text-align: center; }
                h1 { color: #002FA7; font-size: 2.5em; margin-bottom: 10px; }
                p { color: #888; font-size: 1.1em; margin-bottom: 20px; }
                a { color: #002FA7; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404 - Post Not Found</h1>
                <p>The blog post "${slug}" was not found.</p>
                <p><a href="/">Back to Nodal Point</a></p>
            </div>
        </body>
        </html>
      `);
            return;
        }

        // Use content from DB (HTML formatted)
        const htmlContent = post.content || post.body || '';
        const updatedAt = post.updated_at || post.updatedAt || new Date().toISOString();
        const etag = `"${updatedAt}"`;

        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
            res.status(304)
                .setHeader('ETag', etag)
                .setHeader('Cache-Control', 'public, max-age=300, must-revalidate')
                .end();
            return;
        }

        res.status(200)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .setHeader('Cache-Control', 'public, max-age=300, must-revalidate')
            .setHeader('ETag', etag)
            .setHeader('X-Content-Type-Options', 'nosniff')
            .send(htmlContent);

    } catch (error) {
        logger.error('Error serving post', 'PostRoute', { slug, error: error.message });
        res.status(500).send('<h1>500 - Server Error</h1>');
    }
}
