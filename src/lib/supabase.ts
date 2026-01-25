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
