const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const email = 'daguilar@maryimmaculatechurch.org';
    const orCondition = `from.ilike.%${email}%,to.cs.["${email}"]`
    const { data } = await supabase
        .from('emails')
        .select('id,from,to,ownerId,metadata')
        .or(orCondition);
    console.log(JSON.stringify(data, null, 2));
}

test();
