import { supabaseAdmin } from '../api/_supabase.js';

async function check() {
  const { data, error } = await supabaseAdmin.from('call_details').select('embedding').limit(1);
  if (error) {
    console.log('Error or missing column:', error.message);
  } else {
    console.log('Column exists!');
  }
}
check();
