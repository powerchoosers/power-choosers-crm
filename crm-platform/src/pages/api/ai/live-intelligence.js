import { cors } from '../_cors.js';
import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ASSEMBLY_AI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'No AssemblyAI API key configured' });
    }

    const { transcript, accountId, reason, lastProspect } = req.body;

    if (!transcript || transcript.length < 20) {
        return res.status(200).json({ insight: null });
    }

    const safeJsonParse = (value) => {
        if (typeof value !== 'string') return null;
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    };

    const extractFirstJsonObject = (text) => {
        if (typeof text !== 'string') return null;
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        return safeJsonParse(text.slice(start, end + 1));
    };

    try {
        let accountContext = 'Unknown prospect';
        let industry = 'your industry';

        if (accountId) {
            const { data: account } = await supabaseAdmin
                .from('accounts')
                .select('name, industry, location, description, notes')
                .eq('id', accountId)
                .single();

            if (account) {
                industry = account.industry || 'your industry';
                const parts = [
                    `Account: ${account.name}`,
                    `Industry: ${industry}`,
                    `Location: ${account.location || 'Unknown'}`,
                    account.description && `Description: ${account.description.trim()}`,
                    account.notes && `Notes: ${account.notes.trim()}`
                ].filter(Boolean);
                accountContext = parts.join(' | ');

                // Try grabbing the most recent call summary to add context
                const { data: lastCall } = await supabaseAdmin
                    .from('calls')
                    .select('summary')
                    .eq('accountId', accountId)
                    .order('timestamp', { ascending: false })
                    .limit(1)
                    .single();

                if (lastCall?.summary) {
                    accountContext += ` | Previous Call Context: ${lastCall.summary}`;
                }

                // Recent email context (last 2 subjects)
                const { data: recentEmails } = await supabaseAdmin
                    .from('emails')
                    .select('subject')
                    .eq('accountId', accountId)
                    .order('sentAt', { ascending: false })
                    .limit(2);
                if (recentEmails?.length) {
                    const subjects = recentEmails.map(e => e.subject).filter(Boolean).join('; ');
                    accountContext += ` | Recent Emails: ${subjects}`;
                }

                // If a contactId is available via call metadata, enrich with contact fields
                // NOTE: Adjust payload key if you pass contactId differently
                const { contactId } = req.body;
                if (contactId) {
                    const { data: contact } = await supabaseAdmin
                        .from('contacts')
                        .select('title, role, notes')
                        .eq('id', contactId)
                        .single();
                    if (contact) {
                        const contactParts = [
                            contact.title && `Title: ${contact.title.trim()}`,
                            contact.role && `Role: ${contact.role.trim()}`,
                            contact.notes && `Notes: ${contact.notes.trim()}`
                        ].filter(Boolean);
                        if (contactParts.length) {
                            accountContext += ` | Contact: ${contactParts.join(' | ')}`;
                        }
                    }
                }
            }
        }

        const systemPrompt = `You are a Forensic Energy Advisor executing the Nodal Point NEPQ playbook. You feed the live sales agent exactly what to say next based on the prospect's real-time words.

ACCOUNT CONTEXT (Use this to customize the script):
${accountContext}

REQUEST CONTEXT:
- Trigger reason: ${reason || 'unknown'}
- Last Prospect final line (may be empty): ${lastProspect || ''}

NEPQ PLAYBOOK RULES & PSYCHOLOGY:
1. GATEKEEPERS & OPENERS:
   - Gatekeeper: Assumptive tone. "I'm calling for [Name] about the energy structural audit, are they around?" Or "Can you pass me to who handles operations/energy?"
   - Decision Maker Opener: "Hey, I'm calling about the ${industry} side of your business. When ${industry} teams renew contracts, they often see hidden demand ratchet liabilities. Is this something you guys are currently experiencing?"
2. SELL THE INEFFICIENCY: Never say "save money". Use forensic terms: "structural inefficiency", "demand ratchet liability", "4CP peak exposure".
3. DISARM OBJECTIONS: 
   - "Not interested": "When you say not interested, is it that you're locked in, or just not looking at energy spend right now?"
   - "Locked in": "Perfect. When you do renew, will you have a benchmark to know if you're getting a fair deal, or just go back to your current provider?"
   - "We use a broker": "Got it. Did they do a structural analysis of your demand profile, or just get you pricing?"
   - "Plenty of time": "That's great timing. But what happens if you wait until month 11 to start? You'll have no baseline."
   - "Send an email": "I can do that, but in 3 weeks you won't remember this. What if we just grab a 12-min audit next week so you get specific data?"
4. TONE & CURIOSITY: Calm, diagnostic. Always end with a question (e.g. "Does that make sense?", "Fair?").

INSTRUCTIONS:
1. The transcript contains a two-channel dialogue labeled with 'Agent:' and 'Prospect:'. Analyze the flow of the conversation.
2. Focus primarily on what the 'Prospect' most recently said, but you may use the prior 2-3 turns for context.
3. You MUST first classify what is happening into a MOMENT label.
4. You MUST return a single JSON object ONLY (no markdown, no prose) with this exact schema:
   {
     "moment": "GATEKEEPER|OPENER|DISCOVERY|OBJECTION|EMAIL_REQUEST|LOCKED_IN|BROKER|NOT_INTERESTED|TIMING|PRICING|COMPLIANCE|SILENCE|UNKNOWN",
     "confidence": 0.0,
     "next_line": "Exact sentence(s) the agent should say now.",
     "follow_up": "One short question to advance diagnosis.",
     "if_pushback": "One fallback line if they resist.",
     "watch_for": "What phrase/intent to listen for next (short)."
   }
5. Constraints:
   - Keep next_line <= 35 words.
   - follow_up <= 18 words.
   - if_pushback <= 25 words.
   - Use forensic energy language (structural inefficiency, demand ratchet liability, 4CP exposure).
   - If Prospect hasn't said anything substantive recently, set moment=SILENCE and provide a control-regain discovery question.
6. Never return "Monitoring signal...". Always return valid JSON.`;

        // AssemblyAI LLM Gateway — gemini-2.5-flash for low-latency live inference
        const response = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `LIVE TRANSCRIPT SNIPPET:\n\n"${transcript}"` }
                ],
                max_tokens: 220,
                temperature: 0.3,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[LLM Gateway] AssemblyAI API Error:', data);
            throw new Error(data.error?.message || 'LLM Gateway Error');
        }

        const raw = data.choices?.[0]?.message?.content ?? null;
        const parsed = safeJsonParse(raw) ?? extractFirstJsonObject(raw);
        if (parsed && typeof parsed === 'object') {
            const moment = typeof parsed.moment === 'string' ? parsed.moment : 'UNKNOWN';
            const nextLine = typeof parsed.next_line === 'string' ? parsed.next_line.trim() : '';
            const followUp = typeof parsed.follow_up === 'string' ? parsed.follow_up.trim() : '';
            const ifPushback = typeof parsed.if_pushback === 'string' ? parsed.if_pushback.trim() : '';
            const watchFor = typeof parsed.watch_for === 'string' ? parsed.watch_for.trim() : '';
            const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;

            const messageParts = [
                `[${moment}${confidence !== null ? ` ${Math.round(confidence * 100)}%` : ''}]`,
                nextLine ? `NEXT: ${nextLine}` : null,
                followUp ? `Q: ${followUp}` : null,
                ifPushback ? `IF PUSHBACK: ${ifPushback}` : null,
                watchFor ? `LISTEN FOR: ${watchFor}` : null,
            ].filter(Boolean);

            return res.status(200).json({
                insight: messageParts.join(' '),
                insight_json: parsed,
            });
        }

        return res.status(200).json({ insight: typeof raw === 'string' ? raw.trim() : null });
    } catch (err) {
        console.error('Live Intelligence Error:', err);
        return res.status(500).json({ error: 'Failed to generate live insight' });
    }
}
