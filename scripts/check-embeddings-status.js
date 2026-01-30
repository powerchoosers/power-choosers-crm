import { supabaseAdmin } from '../api/_supabase.js';

async function checkStatus() {
  const tables = ['accounts', 'contacts', 'emails', 'calls', 'call_details'];
  
  console.log('--- Embedding Status Report ---');
  
  for (const table of tables) {
    try {
      // Get total count
      const { count: total, error: totalError } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true });
        
      if (totalError) throw totalError;

      // Get count of null embeddings
      const { count: missing, error: missingError } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .is('embedding', null);
        
      if (missingError) throw missingError;

      const processed = total - missing;
      const percentage = total > 0 ? ((processed / total) * 100).toFixed(2) : '100.00';
      
      console.log(`${table.padEnd(15)}: Total: ${String(total).padStart(5)} | Missing: ${String(missing).padStart(5)} | Processed: ${percentage}%`);
    } catch (err) {
      console.log(`${table.padEnd(15)}: Error - ${err.message}`);
    }
  }
}

checkStatus();
