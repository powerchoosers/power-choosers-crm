
import { supabaseAdmin } from '../api/_supabase.js';

async function linkContactsToAccounts() {
  console.log('Starting migration: Linking Contacts to Accounts...');

  try {
    // 1. Fetch all contacts with no accountId
    // We fetch in batches to avoid memory issues if there are many
    let page = 0;
    const pageSize = 100;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: contacts, error } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .is('accountId', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching contacts:', error);
        break;
      }

      if (!contacts || contacts.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch ${page + 1} (${contacts.length} contacts)...`);

      for (const contact of contacts) {
        totalProcessed++;
        const metadata = contact.metadata || {};
        
        // Extract company name candidates
        const companyName = 
          metadata.company || 
          metadata.companyName || 
          metadata.general?.company || 
          metadata.general?.companyName;

        if (companyName) {
          // Search for a matching account
          // Using ilike for case-insensitive matching
          const { data: account, error: accountError } = await supabaseAdmin
            .from('accounts')
            .select('id, name')
            .ilike('name', companyName)
            .limit(1)
            .maybeSingle();

          if (accountError) {
            console.error(`Error searching account for contact ${contact.id} (${companyName}):`, accountError.message);
            continue;
          }

          if (account) {
            console.log(`Match found: "${companyName}" -> Account: "${account.name}" (${account.id})`);
            
            // Update the contact
            const { error: updateError } = await supabaseAdmin
              .from('contacts')
              .update({ accountId: account.id })
              .eq('id', contact.id);

            if (updateError) {
              console.error(`Failed to update contact ${contact.id}:`, updateError.message);
            } else {
              totalUpdated++;
              console.log(`Updated contact ${contact.id} linked to account ${account.id}`);
            }
          } else {
             // Optional: Try fuzzy matching or domain matching here if needed in future
             // For now, we stick to the requested logic
             // console.log(`No account found for company: "${companyName}"`);
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
linkContactsToAccounts();
