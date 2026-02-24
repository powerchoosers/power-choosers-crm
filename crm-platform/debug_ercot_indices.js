const fetch = require('node-fetch');

async function checkHeaders() {
    const URL = 'https://www.ercot.com/content/cdr/html/real_time_spp.html';
    const response = await fetch(URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const html = await response.text();

    const headersRowMatch = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g)?.find(row => row.includes('Date') && row.includes('Hour Ending'));
    const headers = headersRowMatch ? headersRowMatch.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(td => td.replace(/<[^>]*>/g, '').trim()) : [];

    console.log('Headers:', JSON.stringify(headers, null, 2));

    const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
    const dataRows = rows.filter(row => row.includes('<td') && !row.includes('class="label"'));
    const lastRow = dataRows[dataRows.length - 1];
    const cells = lastRow.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(td => td.replace(/<[^>]*>/g, '').trim()) || [];

    console.log('Last Row Data:', JSON.stringify(cells, null, 2));

    headers.forEach((h, i) => {
        console.log(`${i}: ${h} = ${cells[i]}`);
    });
}

checkHeaders();
