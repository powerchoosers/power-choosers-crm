import { SupabaseClient } from '@supabase/supabase-js'

export interface FoundryContext {
    contact: {
        name: string
        firstName: string
        lastName: string
        title: string
        email: string
        phone: string
    }
    company: {
        name: string
        domain: string
        industry: string
        description: string
        city: string
        state: string
        website: string
    }
    energy: {
        currentRate: string
        contractEnd: string
        annualUsage: string
        supplier: string
        loadZone: string
        serviceAddress: string
    }
    intelligence: {
        transcripts: string[]
        summary: string
    }
}

/**
 * Fetches deep context for a contact/account to power the Foundry AI.
 * Includes transcripts, contract details, and enriched metadata.
 */
export async function buildFoundryContext(
    supabase: SupabaseClient,
    contactId?: string | null,
    accountId?: string | null
): Promise<FoundryContext> {
    const context: FoundryContext = {
        contact: { name: '', firstName: '', lastName: '', title: '', email: '', phone: '' },
        company: { name: '', domain: '', industry: '', description: '', city: '', state: '', website: '' },
        energy: { currentRate: '', contractEnd: '', annualUsage: '', supplier: '', loadZone: '', serviceAddress: '' },
        intelligence: { transcripts: [], summary: '' }
    }

    try {
        let contactData: any = null
        let accountData: any = null

        if (contactId) {
            const { data, error } = await supabase
                .from('contacts')
                .select(`
          *,
          accounts (
            id, name, domain, industry, description, city, state, website,
            current_rate, contract_end_date, annual_usage, electricity_supplier,
            service_addresses
          )
        `)
                .eq('id', contactId)
                .single()

            if (!error && data) {
                contactData = data
                accountData = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts
            }
        } else if (accountId) {
            const { data, error } = await supabase
                .from('accounts')
                .select('*')
                .eq('id', accountId)
                .single()

            if (!error && data) {
                accountData = data
            }
        }

        if (contactData) {
            const fullName = contactData.name || ''
            const nameParts = fullName.trim().split(/\s+/)
            context.contact = {
                name: fullName,
                firstName: contactData.firstName || contactData.first_name || nameParts[0] || '',
                lastName: contactData.lastName || contactData.last_name || nameParts.slice(1).join(' ') || '',
                title: contactData.title || '',
                email: contactData.email || '',
                phone: contactData.phone || ''
            }
            context.intelligence.summary = contactData.notes || ''
            console.log('[FoundryPrompt] Built contact context:', context.contact.firstName)
        }

        if (accountData) {
            context.company = {
                name: accountData.name || '',
                domain: accountData.domain || '',
                industry: accountData.industry || '',
                description: accountData.description || '',
                city: accountData.city || '',
                state: accountData.state || '',
                website: accountData.website || accountData.domain || ''
            }
            context.energy = {
                currentRate: accountData.current_rate || '',
                contractEnd: accountData.contract_end_date || '',
                annualUsage: accountData.annual_usage || '',
                supplier: accountData.electricity_supplier || '',
                loadZone: (accountData as any).load_zone || '',
                serviceAddress: (accountData.service_addresses?.[0] as any)?.address || ''
            }
            console.log('[FoundryPrompt] Built company context:', context.company.name)
        }

        // Fetch Transcripts from 'calls' table
        const targetAccountId = accountId || contactData?.accountId || accountData?.id
        const targetContactId = contactId || contactData?.id

        // We want calls related to this contact OR this account
        if (targetContactId || targetAccountId) {
            let query = supabase
                .from('calls')
                .select('transcript, summary, timestamp')
                .not('transcript', 'is', null)
                .order('timestamp', { ascending: false })
                .limit(3)

            // Priority: Contact calls first, then Account calls
            // For simplicity in this specialized context builder, we'll try to match exact contact first
            if (targetContactId) {
                query = query.eq('contactId', targetContactId)
            } else if (targetAccountId) {
                query = query.eq('accountId', targetAccountId)
            }

            const { data: calls } = await query
            if (calls) {
                context.intelligence.transcripts = calls.map((c: any) =>
                    `[${new Date(c.timestamp).toLocaleDateString()}] Summary: ${c.summary || 'N/A'}\nTranscript Snippet: ${(c.transcript || '').slice(0, 500)}...`
                )
            }
        }

    } catch (err) {
        console.error('Error building Foundry context:', err)
    }

    return context
}

export function generateSystemPrompt(
    blockType: string,
    userPrompt: string,
    context: FoundryContext,
    extraContext: string = '',
    numBullets: number = 0
): string {
    const { contact, company, energy, intelligence } = context

    const targetStr = `${contact.name}${contact.title ? ` (${contact.title})` : ''}${company.name ? ` @ ${company.name}` : ''}`
    const locStr = [company.city, company.state].filter(Boolean).join(', ')
    const energyStr = [
        energy.currentRate ? `Rate ${energy.currentRate}/kWh` : '',
        energy.contractEnd ? `Exp ${energy.contractEnd}` : '',
        energy.annualUsage ? `Usage ${energy.annualUsage}` : '',
        energy.supplier ? `Supplier ${energy.supplier}` : ''
    ].filter(Boolean).join(', ') || 'No energy data available'

    const contextBlock = `
    CONTEXT DOSSIER:
    - Target: ${targetStr}
    - Industry: ${company.industry || 'Unknown'}
    - Company Description: ${(company.description || '').slice(0, 200)}
    - Location: ${locStr}
    - Energy Profile: ${energyStr}
    - Intelligence Notes: ${intelligence.summary || 'None'}
    ${intelligence.transcripts.length ? `\n    RECENT CALL TRANSCRIPTS:\n    ${intelligence.transcripts.join('\n    ')}` : ''}
    ${extraContext ? `\n    PAGE CONTEXT:\n    ${extraContext}` : ''}
  `

    const coreRules = `
    CORE RULES (STRICT COMPLIANCE REQUIRED):
    1. TONE: Peer-to-Peer. Professional but accessible. Speak like a knowledgeable industry colleague (Energy Broker/Analyst).
    2. NO JARGON: Do not use marketing buzzwords like "delve", "optimize", "streamline", "synergy". Use plain English.
    3. CONCISENESS: Sentences must be punchy and direct. No fluff.
    4. NO BRACKETS: Do not use [1], [2] citations.
    5. FORMATTING: Return ONLY a valid JSON object: { "text": "...", "bullets": [...] }.
  `

    const firstName = contact.firstName || 'Partner'
    const greeting = firstName + ','

    if (blockType === 'TEXT_MODULE' && (userPrompt.toLowerCase().includes('intro') || !userPrompt)) {
        return `
        You are writing the introduction for an energy intelligence email to a peer.
        
        STRUCTURE:
        1. Greeting: "${greeting}"
        2. Double Newline
        3. Paragraph 1: One concise sentence acknowledging recent context (e.g., "Good speaking with you," or "Reviewing your profile...").
        4. Double Newline
        5. Paragraph 2: Two sentences stating the value proposition or signal clearly.

        ${contextBlock}
        ${coreRules}
        
        USER INSTRUCTION: ${userPrompt || 'Introduce the signals.'}
        
        ${numBullets > 0 ? `FORCED STRUCTURE: In your JSON response, you MUST populate the "bullets" array with exactly ${numBullets} items based on the context.` : 'NOTE: If the user requests bullet points in their instruction, populate the "bullets" array in your JSON response. Otherwise, leave it empty.'}
      `
    }

    if (blockType === 'TEXT_MODULE') {
        return `
        You are writing a body paragraph or list for an energy intelligence email.
        
        STRUCTURE:
        - 2-3 concise sentences for the narrative text.
        - ${numBullets > 0 ? `You MUST populate the "bullets" array with exactly ${numBullets} punchy, data-driven items.` : 'If bullet points are requested or appropriate, populate the "bullets" array with punchy, data-driven items.'}
        - Integrate data points (rates, dates) naturally.

        ${contextBlock}
        ${coreRules}
        
        USER INSTRUCTION: ${userPrompt}
      `
    }

    if (blockType === 'TACTICAL_BUTTON') {
        return `
        Write a single, 2-3 word tactical CTA label. Uppercase.
        Examples: "VIEW_LEDGER", "INITIATE_PROTOCOL", "AUDIT_RATE".
        
        ${coreRules}
        USER INSTRUCTION: ${userPrompt || 'Create a tactical button label.'}
      `
    }

    if (blockType === 'LIABILITY_GAUGE') {
        return `
        Rewrite as a one-sentence risk diagnosis. Focus on structural inefficiency and grid physics. Minimalist and forensic.
        ${contextBlock}
        ${coreRules}
        USER INSTRUCTION: ${userPrompt}
        ${numBullets > 0 ? `FORCED STRUCTURE: In your JSON response, you MUST populate the "bullets" array with exactly ${numBullets} supporting data points.` : ''}
     `
    }

    if (blockType === 'MARKET_BREADCRUMB') {
        return `
        Rewrite this market news into a 2-sentence impact assessment for a client in ${energy.loadZone || 'their zone'}. Focus on 'Liability' or 'Cost Leakage'.
        ${contextBlock}
        ${coreRules}
        USER INSTRUCTION: ${userPrompt}
        ${numBullets > 0 ? `FORCED STRUCTURE: In your JSON response, you MUST populate the "bullets" array with exactly ${numBullets} impact signals.` : ''}
     `
    }

    return `
    Write a concise professional paragraph.
    ${contextBlock}
    ${coreRules}
    USER INSTRUCTION: ${userPrompt}
  `
}
