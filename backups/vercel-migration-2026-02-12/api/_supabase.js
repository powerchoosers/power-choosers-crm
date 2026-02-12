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
