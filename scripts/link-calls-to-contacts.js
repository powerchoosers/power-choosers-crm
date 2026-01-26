
import { supabaseAdmin } from '../api/_supabase.js';

async function linkCallsToContacts() {
  console.log('Starting migration: Linking Calls to Contacts...');

  try {
    // 1. Fetch all calls with no contact_id
    let page = 0;
    const pageSize = 100;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: calls, error } = await supabaseAdmin
        .from('calls')
        .select('*')
        .is('contact_id', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching calls:', error);
        break;
      }

      if (!calls || calls.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch ${page + 1} (${calls.length} calls)...`);

      for (const call of calls) {
        totalProcessed++;
        
        // Candidates: to_phone and from_phone
        // We exclude numbers shorter than 7 digits to avoid system codes
        const candidates = [call.to_phone, call.from_phone].filter(p => p && p.length > 6);
        
        let match = null;
        let matchedPhone = null;

        for (const phone of candidates) {
           // Try exact match first
           const { data: contact } = await supabaseAdmin
             .from('contacts')
             .select('id, name')
             .or(`mobile.eq.${phone},workPhone.eq.${phone},phone.eq.${phone},otherPhone.eq.${phone}`)
             .limit(1)
             .maybeSingle();
           
           if (contact) {
             match = contact;
             matchedPhone = phone;
             break;
           }
        }

        if (match) {
          console.log(`Match found for call ${call.id}: Contact "${match.name}" (${match.id}) via ${matchedPhone}`);
          
          const { error: updateError } = await supabaseAdmin
            .from('calls')
            .update({ 
              contact_id: match.id,
              contact_name: match.name // Update denormalized name if exists
            })
            .eq('id', call.id);

          if (updateError) {
            console.error(`Failed to update call ${call.id}:`, updateError.message);
          } else {
            totalUpdated++;
          }
        }
      }

      page++;
    }

    console.log('Migration completed.');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total updated: ${totalUpdated}`);

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

// Run the function
linkCallsToContacts();
