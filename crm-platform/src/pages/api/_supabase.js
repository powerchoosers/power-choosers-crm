import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[Supabase Admin] Missing environment variables!', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseServiceRoleKey,
    env: process.env.NODE_ENV
  });
} else {
  console.log('[Supabase Admin] Initialized with URL:', supabaseUrl.slice(0, 20) + '...');
}

export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Common helper to verify Supabase user from legacy API routes
 * @param {import('next').NextApiRequest} req 
 * @returns {Promise<{email: string|null, user: any}>}
 */
export async function requireUser(req) {
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (user && !error) {
          return { email: user.email, user };
        }
      } catch (err) {
        console.error('[Supabase Auth] JWT Verification Error:', err);
      }
    }
  }

  // Dev bypass (matches AuthContext logic)
  const isDev = process.env.NODE_ENV === 'development';
  const cookie = typeof req.headers?.cookie === 'string' ? req.headers.cookie : '';
  if (isDev && cookie.includes('np_session=1')) {
    return { email: 'dev@nodalpoint.io', user: { email: 'dev@nodalpoint.io', id: 'dev-bypass-uid' } };
  }

  return { email: null, user: null };
}
