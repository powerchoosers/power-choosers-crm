
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Using URL:', SUPABASE_URL);
// console.log('Using Key:', SUPABASE_SERVICE_KEY); // Don't log key

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function diagnoseBadContacts() {
  console.log('Fetching contacts...');
  // Fetch all contacts (up to 1000)
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .limit(1000);

  if (error) {
    console.log('Error fetching contacts:', error);
    return;
  }

  console.log(`Fetched ${data.length} contacts.`);

  const badContacts = data.filter(item => {
    const hasName = !!item.name;
    const hasFirstName = !!item.firstName;
    const hasLastName = !!item.lastName;
    
    // Condition for "Unknown": All are missing
    return !hasName && !hasFirstName && !hasLastName;
  });

  console.log(`Found ${badContacts.length} contacts that would result in "Unknown".`);

  if (badContacts.length > 0) {
    console.log('Sample bad contacts:');
    badContacts.slice(0, 5).forEach(c => {
      console.log({
        id: c.id,
        ownerId: c.ownerId,
        email: c.email,
        created_at: c.created_at,
        metadata: c.metadata
      });
    });
  } else {
    console.log('No bad contacts found in the first 1000 records.');
    // Check if there are contacts with only firstName/lastName but no name (which my fix handles)
    const fixedByLogic = data.filter(item => {
       const hasName = !!item.name;
       const hasFirstOrLast = !!item.firstName || !!item.lastName;
       return !hasName && hasFirstOrLast;
    });
    console.log(`Found ${fixedByLogic.length} contacts that rely on firstName/lastName logic.`);
    if (fixedByLogic.length > 0) {
        console.log('Sample fixed contact:', fixedByLogic[0]);
    }
  }
}

diagnoseBadContacts();
