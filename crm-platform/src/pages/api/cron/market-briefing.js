import { createClient } from '@supabase/supabase-js';

/**
 * CRON: Generate Market Briefing
 * 
 * Runs twice daily (7 AM and 5 PM CT) via Supabase pg_cron + pg_net.
 * Pulls current ERCOT data + latest market telemetry, sends to Gemini 3 Flash
 * via OpenRouter, and stores a jargon-free market overview in Supabase.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // Verify cron secret (matches pg_cron x-cron-secret header pattern)
  const cronSecret = req.headers['x-cron-secret'];
  const isAuthorized =
    cronSecret === 'nodal-cron-2026' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
  if (!openRouterKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ── Step 1: Gather current market data ──
    const [telemetryResult, ercotPrices, ercotGrid] = await Promise.allSettled([
      supabase
        .from('market_telemetry')
        .select('prices, grid, timestamp, metadata')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      fetchWithTimeout(`${getBaseUrl(req)}/api/market/ercot?type=prices`, 12000).then(r => r.ok ? r.json() : null),
      fetchWithTimeout(`${getBaseUrl(req)}/api/market/ercot?type=grid`, 12000).then(r => r.ok ? r.json() : null),
    ]);

    const telemetry = telemetryResult.status === 'fulfilled' ? telemetryResult.value.data : null;
    const livePrices = ercotPrices.status === 'fulfilled' ? ercotPrices.value : null;
    const liveGrid = ercotGrid.status === 'fulfilled' ? ercotGrid.value : null;

    // Merge live + telemetry for best available data
    const prices = livePrices?.prices || telemetry?.prices || {};
    const grid = liveGrid?.metrics || telemetry?.grid || {};

    const currentPrice = prices.hub_avg || prices.north || prices.houston || null;
    const systemLoad = grid.actual_load ? (grid.actual_load / 1000).toFixed(1) : null;
    const reserves = grid.reserves ? (grid.reserves / 1000).toFixed(1) : null;
    const windGen = grid.wind_gen ? (grid.wind_gen / 1000).toFixed(1) : null;
    const solarGen = grid.pv_gen ? (grid.pv_gen / 1000).toFixed(1) : null;

    // ── Step 2: Fetch EIA news if available ──
    let eiaContext = '';
    try {
      const eiaRes = await fetchWithTimeout(`${getBaseUrl(req)}/api/market/eia-news`, 8000);
      if (eiaRes.ok) {
        const eiaData = await eiaRes.json();
        if (eiaData?.articles?.length) {
          eiaContext = eiaData.articles
            .slice(0, 5)
            .map(a => `- ${a.title}: ${a.summary || a.description || ''}`)
            .join('\n');
        }
      }
    } catch {
      // EIA news is optional enrichment
    }

    // ── Step 3: Determine market conditions for context ──
    const now = new Date();
    const month = now.getMonth() + 1; // 1-indexed
    const hour = now.getHours();
    const is4cpSeason = month >= 6 && month <= 9;
    const isPeakHours = hour >= 14 && hour <= 18;

    const reservesMW = grid.reserves || 0;
    let gridStress = 'calm';
    if (reservesMW < 2500) gridStress = 'critical';
    else if (reservesMW < 4500) gridStress = 'tight';
    else if (reservesMW < 7000) gridStress = 'moderate';

    const priceLevel = currentPrice != null
      ? (currentPrice > 200 ? 'very high' : currentPrice > 80 ? 'elevated' : currentPrice > 40 ? 'normal' : 'low')
      : 'unknown';

    // ── Step 4: Build the Gemini prompt ──
    const marketSnapshot = {
      price_hub_avg: currentPrice,
      price_north: prices.north || null,
      price_houston: prices.houston || null,
      price_south: prices.south || null,
      price_west: prices.west || null,
      system_load_gw: systemLoad,
      reserves_gw: reserves,
      wind_gen_gw: windGen,
      solar_gen_gw: solarGen,
      grid_stress: gridStress,
      price_level: priceLevel,
      is_4cp_season: is4cpSeason,
      is_peak_hours: isPeakHours,
      timestamp: now.toISOString(),
    };

    const systemPrompt = `You are a market analyst writing a plain-English energy market briefing for business owners and facility managers in Texas. These are NOT energy experts — they run warehouses, restaurants, offices, and factories. Your job is to translate what is happening on the ERCOT grid into language that a non-technical business owner would understand and find useful.

RULES:
1. NO jargon. Do not use terms like "ERCOT", "ORDC", "LMP", "SCED", "basis differential", "ancillary services", "DAM/RTM", "capacity", "resource adequacy", or any grid operator terminology without immediately explaining it in plain English.
2. Use analogies when helpful: "Think of reserves like a buffer — the lower the buffer, the more likely prices spike."
3. Write in short paragraphs. No bullet points. No headers with colons. Keep it conversational.
4. Focus on what it MEANS for someone paying a commercial electricity bill, not what it means for grid operators.
5. Be direct about risk: "If you're on a variable rate plan, today is expensive" or "Fixed-rate customers are unaffected right now."
6. Reference the time of day and season when relevant to help readers understand why conditions look the way they do.
7. If 4CP season (June–September) is active, explain what that means in plain terms: the four highest-demand hours in summer set transmission costs for the entire next year.
8. Keep the total briefing between 250-400 words.
9. Do NOT mention that this briefing is AI-generated, computer-generated, or automated.
10. Write as if you are a human analyst at Nodal Point delivering a market update.

OUTPUT FORMAT (strict JSON):
{
  "headline": "A short, plain-English headline (8-12 words)",
  "summary": "A 2-sentence summary of market conditions right now",
  "sections": [
    {
      "title": "What's happening on the grid right now",
      "content": "2-3 paragraphs explaining current conditions in plain English"
    },
    {
      "title": "What this means for your electricity bill",
      "content": "1-2 paragraphs connecting grid conditions to actual business costs"
    },
    {
      "title": "What to watch this week",
      "content": "1-2 paragraphs on upcoming factors (weather, season, demand patterns)"
    }
  ]
}`;

    const userPrompt = `Write today's Texas energy market briefing based on these current conditions:

CURRENT MARKET DATA:
- Average wholesale electricity price: ${currentPrice != null ? `$${currentPrice.toFixed(2)}/MWh` : 'unavailable'}
  - North Texas (DFW): ${prices.north ? `$${prices.north.toFixed(2)}` : 'N/A'}
  - Houston: ${prices.houston ? `$${prices.houston.toFixed(2)}` : 'N/A'}
  - South Texas: ${prices.south ? `$${prices.south.toFixed(2)}` : 'N/A'}
  - West Texas: ${prices.west ? `$${prices.west.toFixed(2)}` : 'N/A'}
- System demand: ${systemLoad ? `${systemLoad} GW` : 'unavailable'} (normal summer range: 50-75 GW, normal winter: 30-50 GW, all-time record ~85 GW)
- Grid reserves (safety buffer): ${reserves ? `${reserves} GW` : 'unavailable'} (comfortable: above 7 GW, moderate: 4.5-7 GW, tight: 2.5-4.5 GW, critical/emergency: below 2.5 GW)
- Wind generation: ${windGen ? `${windGen} GW` : 'unavailable'}
- Solar generation: ${solarGen ? `${solarGen} GW` : 'unavailable'}
- Grid stress level: ${gridStress}
- Price level: ${priceLevel} (normal wholesale range: $20-60/MWh, elevated: $80-200/MWh, spike: above $200/MWh)
- Current time: ${now.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
- 4CP season active: ${is4cpSeason ? 'YES — June through September. Transmission costs for next year are being set NOW.' : 'No — 4CP season runs June through September.'}
- Peak hours active: ${isPeakHours ? 'YES — currently in afternoon peak demand window (2-6 PM)' : 'No'}

${eiaContext ? `RECENT ENERGY NEWS:\n${eiaContext}` : ''}

Remember: write for a warehouse manager or restaurant owner, not a power trader.`;

    // ── Step 5: Call Gemini 3 Flash via OpenRouter ──
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.API_BASE_URL || 'https://nodalpoint.io',
        'X-Title': 'Nodal Point Market Briefing',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[Market Briefing] Gemini error:', errText);
      return res.status(502).json({ error: 'AI generation failed', details: errText });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    // Parse the JSON response
    let briefing;
    try {
      briefing = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        briefing = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    // ── Step 6: Store in Supabase ──
    const { data: insertedRow, error: insertError } = await supabase
      .from('market_briefings')
      .insert({
        briefing_type: 'daily_overview',
        headline: briefing.headline || 'Market Update',
        summary: briefing.summary || '',
        sections: briefing.sections || [],
        market_snapshot: marketSnapshot,
        generated_at: now.toISOString(),
      })
      .select('id, generated_at')
      .single();

    if (insertError) {
      console.error('[Market Briefing] Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to store briefing', details: insertError.message });
    }

    console.log(`[Market Briefing] Generated and stored briefing ${insertedRow.id} at ${insertedRow.generated_at}`);

    return res.status(200).json({
      success: true,
      briefing_id: insertedRow.id,
      headline: briefing.headline,
      generated_at: insertedRow.generated_at,
    });

  } catch (error) {
    console.error('[Market Briefing] Error:', error);
    return res.status(500).json({ error: 'Internal error generating briefing', details: error.message });
  }
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}
