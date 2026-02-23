import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Warn in development if keys are missing
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    console.warn('⚠️ Supabase environment variables are missing! Check .env.local')
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// Admin client for backend operations (bypasses RLS)
// This will only work on the server side
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
)

const ADMIN_EMAILS = ['l.patterson@nodalpoint.io', 'admin@nodalpoint.io'];

/**
 * Helper to require a valid Supabase user in API routes
 * Used for server-side auth validation
 */
export async function requireUser(req: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return { email: null, user: null, isAdmin: false };

    const token = authHeader.replace('Bearer ', '');

    // Sanity check: prevent 'undefined' or 'null' strings from being treated as tokens
    if (!token || token === 'undefined' || token === 'null') {
      return { email: null, user: null, isAdmin: false };
    }

    // Dev Bypass Check
    if (process.env.NODE_ENV === 'development' && token === 'dev-bypass-token') {
      return {
        email: 'dev@nodalpoint.io',
        user: { id: 'dev-bypass-uid', email: 'dev@nodalpoint.io' } as any,
        id: 'dev-bypass-uid',
        isAdmin: true
      };
    }

    let { data: { user }, error } = await supabase.auth.getUser(token);

    // Fallback: Try with Admin Client if Anon Client fails (sometimes needed in server environments)
    if (!user || error) {
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.getUser(token);
      if (adminData?.user) {
        user = adminData.user;
        error = null;
      } else {
        console.warn('[requireUser] Token verification failure:', {
          anonError: error?.message,
          adminError: adminError?.message,
          tokenPrefix: token?.substring(0, 15)
        });
      }
    }

    if (error || !user) {
      return { email: null, user: null, isAdmin: false };
    }

    const isAdmin = user.email ? ADMIN_EMAILS.includes(user.email.toLowerCase()) : false;

    return {
      email: user.email,
      user: user,
      id: user.id,
      isAdmin
    };
  } catch (err) {
    return { email: null, user: null, isAdmin: false };
  }
}

/**
 * Check if a user ID is an admin
 */
export function isUserAdmin(email: string) {
  return email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;
}
