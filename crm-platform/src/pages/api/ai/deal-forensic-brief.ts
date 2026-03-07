import type { NextApiRequest, NextApiResponse } from 'next'
import { requireUser } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const openRouterKey = process.env.OPEN_ROUTER_API_KEY
  if (!openRouterKey) {
    return res.status(503).json({ error: 'Missing OPEN_ROUTER_API_KEY' })
  }

  try {
    await requireUser(req)
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { deal, account } = req.body

  if (!deal?.id) {
    return res.status(400).json({ error: 'deal required' })
  }

  // Derived metrics computed server-side for prompt context
  const rateInCents = deal.mills != null ? (deal.mills / 10).toFixed(2) : null
  const annualUsageMWh = deal.annualUsage != null ? (deal.annualUsage / 1000).toFixed(0) : null
  const impliedSpend =
    deal.annualUsage != null && deal.mills != null
      ? ((deal.annualUsage * deal.mills) / 1000).toFixed(0)
      : null
  const commissionPct =
    deal.yearlyCommission != null && deal.amount != null && deal.amount > 0
      ? ((deal.yearlyCommission / deal.amount) * 100).toFixed(2)
      : null

  const fmtMoney = (n: number | undefined | null) =>
    n != null ? `$${Number(n).toLocaleString()}` : 'not set'

  const prompt = `You are a forensic energy intelligence analyst at Nodal Point, a commercial energy audit firm specializing in ERCOT tariff analysis. You are reviewing a deal file like a detective reviewing case evidence. Every number is a clue to whether this contract is structured correctly or leaking money.

DEAL FILE:
- Contract Title: ${deal.title}
- Account: ${account?.name || 'Unknown'}
- Stage: ${deal.stage}
- Annual Contract Value: ${fmtMoney(deal.amount)}
- Annual Usage: ${annualUsageMWh ? `${annualUsageMWh} MWh/yr (${Number(deal.annualUsage).toLocaleString()} kWh)` : 'not set'}
- Rate: ${rateInCents ? `${rateInCents}¢/kWh (${deal.mills} mills)` : 'not set'}
- Implied Annual Spend (usage × rate check): ${impliedSpend ? fmtMoney(Number(impliedSpend)) : 'N/A — missing usage or rate'}
- Contract Term: ${deal.contractLength ? `${deal.contractLength} months` : 'not set'}
- Close Date: ${deal.closeDate || 'not set'}
- Probability: ${deal.probability != null ? `${deal.probability}%` : 'not set'}
- Yearly Commission: ${fmtMoney(deal.yearlyCommission)}
- Commission %: ${commissionPct ? `${commissionPct}% of contract value` : 'N/A'}

Return exactly 6 sections with these headers. No preamble. No closing remarks.

## RATE ASSESSMENT
Evaluate the ${rateInCents ? `${rateInCents}¢/kWh` : 'unknown'} rate against typical ERCOT market rates for a ${annualUsageMWh ? `${annualUsageMWh} MWh/yr` : 'unknown usage'} commercial C&I load. Is this rate competitive, above market, or below market? What load zone benchmark is most relevant (LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST)? If usage or rate data is missing, state exactly what is needed and why it changes the analysis.

## 4CP EXPOSURE
Based on annual usage of ${annualUsageMWh ? `${annualUsageMWh} MWh` : 'unknown'}, estimate the coincident peak (4CP) demand. Assume a load factor of 55–65% for typical C&I loads to derive a peak demand estimate in kW. What is the approximate annual transmission cost liability at current ERCOT TCRF rates? Flag whether this is a HIGH, MEDIUM, or LOW exposure account based on load size.

## RATCHET RISK
Assess demand ratchet vulnerability for this account. If a ${deal.contractLength ? `${deal.contractLength}-month` : 'multi-year'} fixed-rate contract locks in demand at peak levels, what is the minimum monthly demand charge floor the client faces? What seasonal demand spike risk exists during ERCOT summer peaks that could set a ratchet baseline for 11 subsequent months? Rate the ratchet risk: HIGH, MEDIUM, or LOW.

## STAGE RISK
The deal is at stage ${deal.stage} with ${deal.probability != null ? `${deal.probability}%` : 'unknown'} close probability${deal.closeDate ? ` and close target of ${deal.closeDate}` : ' and no close date set'}. What is the most likely friction point blocking this deal from advancing to the next stage? Be specific: what does ${deal.stage} mean in a broker's commercial energy sales cycle, and what objection or missing element typically stalls deals here?

## NEXT ACTION
Name one specific, high-leverage action the broker must take within 48 hours to advance this deal. Be direct. Specify the action type (discovery call, forensic audit delivery, rate comparison brief, 4CP exposure presentation, signature follow-up, etc.) and why it is the highest-leverage move at stage ${deal.stage}.

## COMMISSION NOTE
With ${fmtMoney(deal.yearlyCommission)}/yr commission against ${fmtMoney(deal.amount)} contract value${commissionPct ? ` (${commissionPct}%)` : ''}, assess whether this commission structure is standard for ERCOT commercial broker agreements at ${annualUsageMWh ? `${annualUsageMWh} MWh/yr` : 'this'} usage. Flag if the margin appears thin (below 1.5%), strong (above 3%), or if commission data is missing and needs to be set before deal advancement.

Tone: Forensic, unhurried, precise. Energy industry vocabulary throughout: demand ratchet, 4CP coincident peak, TDSP, scarcity adder, load zone basis risk, TCRF, ERCOT settlement interval. Write like a senior analyst briefing a field operative. No filler. No disclaimers. No bullet points — flowing analytical prose per section.`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://nodalpoint.io',
        'X-Title': 'Nodal Point CRM',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    })

    const orData = await response.json()
    const brief = orData.choices?.[0]?.message?.content ?? ''

    if (!brief) {
      return res.status(502).json({ error: 'AI returned empty response' })
    }

    return res.status(200).json({ brief: brief.trim() })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Brief generation failed', detail: msg })
  }
}
