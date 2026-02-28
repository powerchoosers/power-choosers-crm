require('dotenv').config({ path: ['.env.local', '.env'] });
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    console.log('Fetching accounts...');
    const { data: accounts, error: accErr } = await supabaseAdmin
        .from('accounts')
        .select('id, name, domain, industry, city, state, logo_url, contract_end_date, metadata')
        .limit(400)

    if (accErr) {
        console.error("accErr", accErr);
        return;
    }

    const accountIds = (accounts ?? []).map((a) => a.id)

    console.log(`Fetched ${accountIds.length} accounts. Fetching calls...`);

    const { data: callRows, error: callErr } = await supabaseAdmin
        .from('calls')
        .select('accountId, timestamp, outcome')
        .in('accountId', accountIds)
        .not('timestamp', 'is', null)
        .order('timestamp', { ascending: false })

    if (callErr) console.error("callErr", callErr.message);
    else console.log(`Fetched ${callRows?.length} calls`);

    console.log('Fetching emails...');
    const { data: emailRows, error: emailErr } = await supabaseAdmin
        .from('emails')
        .select('accountId, timestamp')
        .in('accountId', accountIds)
        .not('timestamp', 'is', null)
        .order('timestamp', { ascending: false })

    if (emailErr) console.error("emailErr", emailErr.message);
    else console.log(`Fetched ${emailRows?.length} emails`);

    console.log('Fetching tasks...');
    const now = new Date().toISOString()
    const { data: taskRows, error: taskErr } = await supabaseAdmin
        .from('tasks')
        .select('accountId, dueDate, status')
        .in('accountId', accountIds)
        .eq('status', 'pending')
        .lt('dueDate', now)

    if (taskErr) console.error("taskErr", taskErr.message);
    else console.log(`Fetched ${taskRows?.length} tasks`);

    console.log('Done.');
}
run();
