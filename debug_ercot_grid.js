const fetch = require('node-fetch');

async function checkGrid() {
    const URL = 'https://www.ercot.com/content/cdr/html/real_time_system_conditions.html';
    const response = await fetch(URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const html = await response.text();

    const metrics = {};

    const demandMatch = html.match(/Actual System Demand<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
    if (demandMatch) metrics.actual_load = parseFloat(demandMatch[1].replace(/,/g, ''));

    const capacityMatch = html.match(/Total System Capacity[^<]*<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
    if (capacityMatch) metrics.total_capacity = parseFloat(capacityMatch[1].replace(/,/g, ''));

    const windMatch = html.match(/Total Wind Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
    if (windMatch) metrics.wind_gen = parseFloat(windMatch[1].replace(/,/g, ''));

    const pvMatch = html.match(/Total PVGR Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
    if (pvMatch) metrics.pv_gen = parseFloat(pvMatch[1].replace(/,/g, ''));

    console.log('Metrics:', JSON.stringify(metrics, null, 2));
}

checkGrid();
