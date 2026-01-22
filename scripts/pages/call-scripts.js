(function () {
  'use strict';

  // ===== Dynamic variables helpers (chips + live-call substitution) =====
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Size-based gatekeeper opener (5b - Smart Adaptation)
  function getSizedGateKeeperOpener(accountEmployees) {
    if (!accountEmployees || accountEmployees < 20) {
      // Small business - use "power bills"
      return 'Yeah, your power bills.';
    } else if (accountEmployees >= 20 && accountEmployees < 200) {
      // Mid-market - use "electricity bills"
      return 'Yeah, your electricity bills.';
    }
    // Enterprise - use "electric service"
    return 'Yeah, your electric service.';
  }
  function dayPart() {
    try {
      const h = new Date().getHours();
      if (h >= 5 && h < 12) return 'Good morning';
      if (h >= 12 && h < 17) return 'Good afternoon';
      if (h >= 17 && h <= 20) return 'Good evening';
      return 'Hello';
    } catch (_) { return 'Hello'; }
  }
  function getPhoneWidgetContext() {
    try {
      // Try to get context from phone widget's global currentCallContext
      if (window.currentCallContext) {
        return {
          name: window.currentCallContext.name || window.currentCallContext.contactName || '',
          company: window.currentCallContext.company || window.currentCallContext.accountName || '',
          number: window.currentCallContext.number || '',
          isActive: window.currentCallContext.isActive || false,
          contactId: window.currentCallContext.contactId || null,
          accountId: window.currentCallContext.accountId || null
        };
      }
      // Fallback: try PhoneWidget.getContext if available
      if (window.PhoneWidget && typeof window.PhoneWidget.getContext === 'function') {
        return window.PhoneWidget.getContext() || {};
      }
    } catch (_) { }
    // Fallback: infer from DOM
    try {
      const card = document.getElementById('phone-widget');
      const inCall = !!(card && card.classList.contains('in-call'));
      const nameEl = card?.querySelector('.phone-contact .contact-name');
      const subEl = card?.querySelector('.phone-contact .contact-sub');
      const name = nameEl?.textContent?.trim() || '';
      const sub = subEl?.textContent?.trim() || '';
      let company = '';
      const parts = sub.split('•').map(s => s.trim());
      if (parts.length >= 1) company = parts[0];
      const number = (parts[1] || '').replace(/[^+\d]/g, '');
      return { name, company, number, isActive: inCall, contactId: null, accountId: null };
    } catch (_) { }
    return { name: '', company: '', number: '', isActive: false, contactId: null, accountId: null };
  }
  function splitName(full) {
    const s = String(full || '').trim();
    if (!s) return { first: '', last: '', full: '' };
    const parts = s.split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || '', full: s };
  }
  function normName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function normalizeAccount(a) {
    const obj = a ? { ...a } : {};
    // Normalize supplier aliases
    obj.supplier = obj.supplier || obj.currentSupplier || obj.current_supplier || obj.energySupplier || obj.electricitySupplier || obj.supplierName || '';
    // Normalize contract end aliases
    const end = obj.contractEnd || obj.contract_end || obj.renewalDate || obj.renewal_date || obj.contractEndDate || obj.contract_end_date || obj.contractExpiry || obj.expiration || obj.expirationDate || obj.expiresOn || '';
    obj.contract_end = end || '';
    obj.contractEnd = end || obj.contractEnd || '';
    // Normalize basic fields
    obj.name = obj.name || obj.accountName || obj.companyName || '';
    obj.industry = obj.industry || '';
    obj.city = obj.city || obj.billingCity || obj.locationCity || '';
    obj.state = obj.state || obj.region || obj.billingState || '';
    obj.website = obj.website || obj.domain || '';
    return obj;
  }
  function formatDateMDY(v) {
    try {
      if (!v) return '';

      // Use the same robust date parsing logic as account-detail.js
      const str = String(v).trim();
      let d;

      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        // For ISO dates, parse components to avoid timezone issues
        const parts = str.split('-');
        d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (mdy) {
          // Parse MM/DD/YYYY format directly to avoid timezone issues
          d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
        } else {
          // Fallback Date parse - use local timezone to avoid offset issues
          d = new Date(str + 'T00:00:00');
        }
      }

      if (isNaN(d.getTime())) return String(v); // keep raw if unparsable
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch (_) { return String(v || ''); }
  }

  function toMDY(v) {
    try {
      if (!v) return '';

      // Use the same robust date parsing logic as account-detail.js
      const str = String(v).trim();
      let d;

      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        // For ISO dates, parse components to avoid timezone issues
        const parts = str.split('-');
        d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (mdy) {
          // Parse MM/DD/YYYY format directly to avoid timezone issues
          d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
        } else {
          // Fallback Date parse - use local timezone to avoid offset issues
          d = new Date(str + 'T00:00:00');
        }
      }

      if (isNaN(d.getTime())) return String(v);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch (_) { return String(v || ''); }
  }
  function normalizeContact(c) {
    const obj = c ? { ...c } : {};
    const nameGuess = obj.name || ((obj.firstName || obj.first_name || '') + ' ' + (obj.lastName || obj.last_name || '')).trim();
    const sp = splitName(nameGuess);
    obj.firstName = obj.firstName || obj.first_name || sp.first;
    obj.lastName = obj.lastName || obj.last_name || sp.last;
    obj.fullName = obj.fullName || obj.full_name || nameGuess;
    obj.company = obj.company || obj.companyName || obj.accountName || obj.account_name || '';
    // Derive a primary phone honoring user's preferredPhoneField when available
    try {
      const pref = (obj.preferredPhoneField || '').trim();
      if (pref && obj[pref]) {
        obj.phone = obj[pref];
      } else {
        // Prefer direct work, then mobile, then other, then any legacy phone
        obj.phone = obj.phone || obj.workDirectPhone || obj.mobile || obj.otherPhone || obj.mobile_phone || '';
      }
    } catch (_) {
      obj.phone = obj.phone || obj.workDirectPhone || obj.mobile || obj.otherPhone || obj.mobile_phone || '';
    }
    obj.mobile = obj.mobile || obj.mobile_phone || '';
    obj.email = obj.email || obj.work_email || obj.personal_email || '';
    obj.title = obj.title || obj.jobTitle || obj.job_title || '';
    // Supplier/contract fields that may exist on contact
    obj.supplier = obj.supplier || obj.currentSupplier || obj.current_supplier || '';
    const cEnd = obj.contractEnd || obj.contract_end || obj.renewalDate || obj.renewal_date || '';
    obj.contract_end = obj.contract_end || cEnd || '';
    obj.industry = obj.industry || '';
    obj.city = obj.city || obj.locationCity || obj.billingCity || '';
    obj.state = obj.state || obj.region || obj.billingState || '';
    obj.accountId = obj.accountId || obj.account_id || obj.account || obj.companyId || '';
    return obj;
  }
  function normPhone(p) { return String(p || '').replace(/\D/g, '').slice(-10); }
  function normDomain(email) { return String(email || '').split('@')[1]?.toLowerCase() || ''; }
  function getPeopleCache() { try { return (typeof window.getPeopleData === 'function' ? (window.getPeopleData() || []) : []); } catch (_) { return []; } }
  function getAccountsCache() { try { return (typeof window.getAccountsData === 'function' ? (window.getAccountsData() || []) : []); } catch (_) { return []; } }
  function findContactByNumberOrName(number, name) {
    const people = getPeopleCache();
    const n10 = normPhone(number);
    const nm = String(name || '').toLowerCase();
    const norm = (p) => String(p || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const byNum = people.find(p => {
      const candidates = [p.workDirectPhone, p.mobile, p.otherPhone, p.phone];
      return candidates.some(ph => normPhone(ph) === n10);
    });
    if (byNum) return byNum;
    if (nm) {
      return people.find(p => norm(`${p.firstName || ''} ${p.lastName || ''}`) === norm(name) || norm(p.name || p.fullName || '') === norm(name));
    }
    return null;
  }
  function findAccountForContact(contact) {
    if (!contact) return null;
    const accounts = getAccountsCache();
    // 1) Direct accountId linkage if present
    try {
      const accId = contact.accountId || contact.account_id || contact.account || contact.companyId;
      if (accId) {
        const hitById = accounts.find(a => String(a.id || a.accountId || a._id) === String(accId));
        if (hitById) return hitById;
      }
    } catch (_) { }
    const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const comp = clean(contact.company || contact.companyName || '');
    if (comp) {
      const hit = accounts.find(a => {
        const an = clean(a.accountName || a.name || a.companyName || '');
        return an && (an === comp || an.includes(comp) || comp.includes(an));
      });
      if (hit) return hit;
    }
    const domain = normDomain(contact.email || '');
    if (domain) {
      const match = accounts.find(a => {
        const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        return d && (domain.endsWith(d) || d.endsWith(domain));
      });
      if (match) return match;
    }
    return null;
  }

  function getLiveData() {
    const ctx = getPhoneWidgetContext();
    const nameParts = splitName(ctx.name || '');
    let contact = null; let account = null;

    // Priority 1: If user has manually selected a contact in the Call Scripts search, use that
    try {
      if (typeof state !== 'undefined' && state && state.overrideContactId) {
        const people = getPeopleCache();
        const sel = people.find(p => {
          const pid = String(p.id || '');
          const alt1 = String(p.contactId || '');
          const alt2 = String(p._id || '');
          const target = String(state.overrideContactId || '');
          return pid === target || alt1 === target || alt2 === target;
        });
        if (sel) contact = sel;
      }
    } catch (_) { }

    // Priority 2: If phone widget has contactId in context, use that (direct contact call)
    if (!contact && ctx.contactId) {
      try {
        const people = getPeopleCache();
        const found = people.find(p => {
          const pid = String(p.id || '');
          const alt1 = String(p.contactId || '');
          const alt2 = String(p._id || '');
          const target = String(ctx.contactId || '');
          return pid === target || alt1 === target || alt2 === target;
        });
        if (found) contact = found;
      } catch (_) { }
    }

    // Priority 3: Try to find contact by number or name
    if (!contact) {
      try {
        contact = findContactByNumberOrName(ctx.number, ctx.name) || {};
      } catch (_) { contact = {}; }
    }

    // Fallback to context if fields empty
    if (!contact.firstName && (ctx.name || '')) {
      const sp = splitName(ctx.name);
      contact.firstName = sp.first; contact.lastName = sp.last; contact.fullName = sp.full;
    }
    if (!contact.company && ctx.company) contact.company = ctx.company;
    // Normalize selected/derived contact fields so variables populate reliably
    try { contact = normalizeContact(contact); } catch (_) { }

    // Try to find account - prefer accountId from context, then from contact
    if (ctx.accountId) {
      try {
        const accounts = getAccountsCache();
        const found = accounts.find(a => {
          const aid = String(a.id || '');
          const alt1 = String(a.accountId || '');
          const alt2 = String(a._id || '');
          const target = String(ctx.accountId || '');
          return aid === target || alt1 === target || alt2 === target;
        });
        if (found) account = found;
      } catch (_) { }
    }

    // If no account found via accountId, try finding from contact
    if (!account) {
      try { account = findAccountForContact(contact) || {}; } catch (_) { account = {}; }
    }

    try { account = normalizeAccount(account); } catch (_) { }
    // Borrow supplier/contract_end from contact if account missing them
    if (!account.supplier && contact.supplier) account.supplier = contact.supplier;
    if (!account.contract_end && contact.contract_end) account.contract_end = contact.contract_end;
    if (!account.contractEnd && contact.contract_end) account.contractEnd = contact.contract_end;

    // If no account found, fall back to using the selected contact's company for {{account.name}}
    if (!account.name && (contact.company || contact.companyName)) {
      account.name = contact.company || contact.companyName;
    }
    if (!account.name && ctx.company) account.name = ctx.company;
    return { ctx, contact, account };
  }
  function chip(scope, key) {
    const friendly = {
      'name': 'company name',
      'first_name': 'first name',
      'last_name': 'last name',
      'full_name': 'full name',
      'phone': 'phone',
      'supplier': 'supplier',
      'contract_end': 'contract end',
      'industry': 'industry',
      'city': 'city',
      'state': 'state',
      'website': 'website',
      'title': 'job title'
    }[key] || String(key).replace(/_/g, ' ').toLowerCase();
    const token = `{{${scope}.${key}}}`;
    return `<span class="var-chip" data-var="${scope}.${key}" data-token="${token}" contenteditable="false">${friendly}</span>`;
  }
  function renderTemplate(str, mode) {
    if (!str) return '';
    
    // Get agent name from settings (first name only from general settings)
    let agentFirstName = '';
    try {
      if (window.SettingsPage && typeof window.SettingsPage.getSettings === 'function') {
        const settings = window.SettingsPage.getSettings();
        if (settings && settings.general) {
          agentFirstName = settings.general.firstName || '';
        }
      }
    } catch (_) {
      // Fallback if settings not available
      agentFirstName = '';
    }
    
    const dp = dayPart();
    const data = getLiveData();

    // Calculate savings based on monthly spend from state
    let monthlySpend = 0;
    let annualSpend = 0;
    let potentialSavings = 0;

    // Use stored monthly spend value if available
    if (state.monthlySpend && state.monthlySpend > 0) {
      monthlySpend = state.monthlySpend;
    } else {
      // Fallback: Try to extract monthly spend from state history
      const currentState = state.current;
      const historyItem = Array.isArray(state.history)
        ? state.history.find(h => (typeof h === 'object' ? h.current === 'situation_discovery' : h === 'situation_discovery'))
        : null;
      if (historyItem) {
        const responseLabel = (typeof historyItem === 'object' ? historyItem.responseLabel : '') || '';
        // Try to parse dollar amount from response label (e.g., "Spending $5,000 monthly")
        const dollarMatch = responseLabel.match(/\$[\d,]+/);
        if (dollarMatch) {
          monthlySpend = parseFloat(dollarMatch[0].replace(/[$,]/g, '')) || 0;
        } else {
          // Parse ranges from response labels (fallback)
          if (responseLabel.includes('$1K - $5K')) {
            monthlySpend = 3000; // Middle of range
          } else if (responseLabel.includes('$5K - $20K')) {
            monthlySpend = 12500; // Middle of range
          } else if (responseLabel.includes('$20K+')) {
            monthlySpend = 30000; // Conservative estimate
          }
        }
      }
    }

    if (monthlySpend > 0) {
      annualSpend = monthlySpend * 12;
      potentialSavings = Math.round(annualSpend * 0.25); // 25% savings estimate
    }

    // Format numbers with commas
    const formatCurrency = (num) => {
      if (num === 0 || !num) return 'an estimated amount';
      return '$' + num.toLocaleString();
    };

    const values = {
      'day.part': dp,
      'agent.first_name': agentFirstName,
      'contact.first_name': data.contact.firstName || data.contact.first || splitName(data.contact.name).first || splitName(data.ctx.name).first || '',
      'contact.last_name': data.contact.lastName || data.contact.last || splitName(data.contact.name).last || splitName(data.ctx.name).last || '',
      'contact.full_name': data.contact.fullName || data.contact.name || data.ctx.name || '',
      'contact.phone': data.contact.workDirectPhone || data.contact.mobile || data.contact.otherPhone || data.contact.phone || data.ctx.number || '',
      'contact.mobile': data.contact.mobile || '',
      'contact.email': data.contact.email || '',
      'contact.title': data.contact.title || data.contact.jobTitle || '',
      'account.name': data.account.accountName || data.account.name || data.contact.company || data.ctx.company || '',
      'account.industry': data.account.industry || data.contact.industry || '',
      'account.city': data.account.city || data.account.billingCity || data.account.locationCity || data.contact.city || 'Texas',
      'account.state': data.account.state || data.account.region || data.account.billingState || data.contact.state || '',
      'account.website': data.account.website || data.account.domain || normDomain(data.contact.email) || '',
      'account.supplier': data.account.supplier || data.account.currentSupplier || data.contact.supplier || data.contact.currentSupplier || '',
      'account.contract_end': formatDateMDY(data.account.contractEnd || data.account.contract_end || data.account.renewalDate || data.contact.contract_end || data.contact.contractEnd || ''),
      'monthly_spend': formatCurrency(monthlySpend),
      'annual_spend': formatCurrency(annualSpend),
      'potential_savings': formatCurrency(potentialSavings)
    };

    let result = String(str);

    // Replace {{variable}} placeholders with actual values
    for (const [key, value] of Object.entries(values)) {
      const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
      result = result.replace(pattern, escapeHtml(value || ''));
    }

    // Handle badge placeholders - replace (contact name) etc. with actual data if available
    const contactName = values['contact.first_name'] || values['contact.full_name'] || '';
    const companyName = values['account.name'] || '';
    const yourName = agentFirstName; // Use agentFirstName from above

    // Replace badge placeholders with plain text (no badge classes)
    // Handle both HTML-wrapped and plain text versions
    if (contactName) {
      // HTML-wrapped versions
      result = result.replace(/<span class="badge contact">\(contact name\)<\/span>/gi, escapeHtml(contactName));
      result = result.replace(/<span class="name-badge">\(contact name\)<\/span>/gi, escapeHtml(contactName));
      // Plain text version (no HTML)
      result = result.replace(/\(contact name\)/gi, escapeHtml(contactName));
    }
    if (yourName) {
      // HTML-wrapped versions
      result = result.replace(/<span class="name-badge">\(your name\)<\/span>/gi, escapeHtml(yourName));
      // Plain text version (no HTML)
      result = result.replace(/\(your name\)/gi, escapeHtml(yourName));
    } else {
      // If your name not found, replace with empty string
      result = result.replace(/\(your name\)/gi, '');
    }
    if (companyName) {
      // HTML-wrapped versions
      result = result.replace(/<span class="badge company">\(company name\)<\/span>/gi, escapeHtml(companyName));
      // Plain text version (no HTML)
      result = result.replace(/\(company name\)/gi, escapeHtml(companyName));
    }

    // Tone markers and pause indicators are kept as-is (they're already properly formatted HTML)
    // No additional processing needed - they render correctly

    return result;
  }
  function isLiveCall() {
    try {
      const ctx = getPhoneWidgetContext();
      return !!ctx.isActive;
    } catch (_) { return false; }
  }

  // PEACE Framework Call Flow (Based on 2025 Research + Broker Audit Strategy)
  // PEACE = Permission, Empathy, Ask, Consequence, End
  const FLOW = {
    start: {
      stage: 'Ready',
      text: "Click 'Dial' to begin the call.",
      responses: []
    },
    pre_call_qualification: {
      stage: 'Pre-Call Prep',
      text: "<strong>Before we dial... qualify this prospect using PEACE framework.</strong><br><br><em>Think through these questions:</em><br><br>• Who are you calling? (Decision maker / Gatekeeper / Unknown)<br>• What's their industry and company size?<br>• What research do you have on their situation?<br>• What's your FIRST OBJECTIVE? (Run a broker audit / Get meeting / Understand situation)<br><br><strong>Remember:</strong> You're a broker competing against other brokers. Position as a \"second opinion\" and \"audit tool\" - not a replacement. We run competitive events across 100+ suppliers.<br><br><strong>Key Stats:</strong> 11-14 discovery questions = 70% higher success. Second opinion positioning = 43% better conversion.",
      responses: [
        { label: 'Ready - I have answers', next: 'dialing' },
        { label: 'I need more time', next: 'start' }
      ]
    },
    dialing: {
      stage: 'Connecting',
      text: 'Dialing... Ringing...',
      responses: [
        { label: 'Call connected', next: 'hook' },
        { label: 'Voicemail', next: 'voicemail' },
        { label: 'No answer', next: 'no_answer' }
      ]
    },
    hook: {
      stage: 'Opening',
      text: 'Who picked up?',
      responses: [
        { label: 'Decision Maker', next: 'opening_quick_intro' },
        { label: 'Gatekeeper', next: 'gatekeeper_intro' },
        { label: 'Voicemail', next: 'voicemail' }
      ]
    },
    // ===== SIX SCENARIOS NATURAL OPENING + TIMING QUALIFICATION =====
    opening_quick_intro: {
      stage: 'Opening - Quick Intro & Permission',
      text: "Hey {{contact.first_name}}! This is {{agent.first_name}}.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>Real quick... did I catch you at a bad time... or do you have about 30 seconds?",
      responses: [
        { label: 'Yeah, go ahead', next: 'opening_industry_context' },
        { label: 'I got 30 seconds', next: 'opening_industry_context' },
        { label: 'Actually, not a good time', next: 'reschedule_callback' },
        { label: 'What is this about?', next: 'opening_industry_context' }
      ]
    },
    opening_industry_context: {
      stage: 'Opening - Industry Context & Responsibility',
      text: "Perfect. So {{contact.first_name}}, I work with {{account.industry}} companies on electricity procurement.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>Are you responsible for electricity agreements and contract renewals?",
      responses: [
        { label: 'Yeah, that\'s me', next: 'urgency_building' },
        { label: 'I handle it', next: 'urgency_building' },
        { label: 'We have a corporate person', next: 'gatekeeper_route' },
        { label: "That's someone else", next: 'gatekeeper_route' },
        { label: 'Not really sure', next: 'clarify_involvement' }
      ]
    },
    urgency_building: {
      stage: 'Urgency - 2026 Warning & Confidence',
      text: "Okay great. So I'm not sure if you'd be affected by this but...<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>the writing's kind of on the wall for 2026.<br><br>Businesses I work with have been stressed because they know <span class=\"pause-indicator\"></span> rates are going up next year but don't really have a sound strategy around electricity.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>Do you feel like you have a solid handle on your energy costs? <span class=\"pause-indicator\"></span><br><br>Or do you feel like you're kind of just winging it?",
      responses: [
        { label: 'Winging it / somewhere in between', next: 'acknowledge_response' },
        { label: 'Solid handle', next: 'acknowledge_response' },
        { label: 'Not sure', next: 'acknowledge_response' },
        { label: 'We use a broker', next: 'objection_broker_intro' }
      ]
    },
    acknowledge_response: {
      stage: 'Discovery - Acknowledge',
      text: "<span class=\"tone-marker understanding\">Acknowledge without judgment</span><br><br>That's actually really common.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>Have you guys already extended your agreements past 2026... or is that still open?",
      responses: [
        { label: 'Still open / renew before 2026', next: 'renewal_timing' },
        { label: 'We renew in 2026', next: 'renewal_timing' },
        { label: 'Not sure when it expires', next: 'renewal_timing' },
        { label: 'We just renewed / locked in', next: 'locked_in_future' }
      ]
    },
    renewal_timing: {
      stage: 'Discovery - Renewal Timing',
      text: "Got it, still open.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1-2 seconds]</em><br><br>So walk me through it... when you go to renew... how many quotes do you typically get?",
      responses: [
        { label: '2 or 3 quotes', next: 'key_question_confidence' },
        { label: 'Just current supplier', next: 'key_question_confidence' },
        { label: '5 to 10 quotes', next: 'discovery_supplier_count' },
        { label: 'We have a broker handle it', next: 'objection_broker_intro' },
        { label: 'Never really counted', next: 'key_question_confidence' }
      ]
    },
    key_question_confidence: {
      stage: 'Discovery - Key Question',
      text: "So [however many they said]...<br><br><span class=\"pause-indicator\"></span><em>[PAUSE 2 seconds - let that sink in]</em><br><br>How confident are you that's actually enough to make sure you're getting competitive pricing?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE - silence is your friend here. Let them think.]</em>",
      responses: [
        { label: 'Pretty confident', next: 'probe_confidence' },
        { label: 'They work fine', next: 'probe_confidence' },
        { label: 'Not 100% sure', next: 'probe_confidence' },
        { label: 'Not very confident', next: 'gap_creator' },
        { label: 'We use a broker', next: 'objection_broker_intro' }
      ]
    },
    probe_confidence: {
      stage: 'Discovery - Probe Confidence',
      text: "And is that because you've actually compared your rates to what the rest of the market is quoting... or more just because you've been with them for a while and you trust them?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: "We haven't really compared", next: 'gap_creator' },
        { label: 'Just been with them forever', next: 'gap_creator' },
        { label: "We don't really know", next: 'gap_creator' },
        { label: "We've compared before", next: 'discovery_supplier_count' },
        { label: "That's what our broker does", next: 'objection_broker_intro' }
      ]
    },
    gap_creator: {
      stage: 'Discovery - Gap Creator',
      text: "So when you last renewed... did you get like 5-10 competitive quotes from different suppliers... or was it more like 2-3 options?",
      responses: [
        { label: '5-10 quotes', next: 'discovery_market_check' },
        { label: '2-3 options', next: 'discovery_market_check' },
        { label: 'Just renewed with same supplier', next: 'discovery_market_check' }
      ]
    },
    discovery_supplier_count: {
      stage: 'Discovery - Supplier Count',
      text: "Okay, so when you last renewed... did you end up getting like 5, 10 quotes from different suppliers... or more like 2 or 3 options?",
      responses: [
        { label: '5 to 10 quotes', next: 'discovery_market_check' },
        { label: '2 or 3 options', next: 'discovery_market_check' },
        { label: 'Just stuck with the same one', next: 'discovery_market_check' },
        { label: "Don't remember", next: 'discovery_market_check' }
      ]
    },
    discovery_market_check: {
      stage: 'Discovery - Market Check',
      text: "Alright, so like 2 or 3 quotes...<br><br>Here's what I'm curious about: Do you know roughly how many different suppliers are actually available in the {{account.industry}} market?<br><br>Like, are we talking 10 or 20 suppliers... or more like 100 plus?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE - they usually guess low]</em>",
      responses: [
        { label: '10 to 20 suppliers', next: 'gap_revealed' },
        { label: '50 suppliers', next: 'gap_revealed' },
        { label: '100 plus', next: 'consequence_quantify' },
        { label: 'I have no idea', next: 'gap_revealed' }
      ]
    },
    gap_revealed: {
      stage: 'Discovery - Gap Revealed',
      text: "Actually, there's like 100 plus suppliers out there.<br><br><span class=\"pause-indicator\"></span><em>[PAUSE 3 SECONDS - let this sink in]</em><br><br>So if there's a supplier quoting 15, 20 percent lower than your current rate... you probably wouldn't even know about them.<br><br><span class=\"pause-indicator\"></span><em>[PAUSE 2 SECONDS]</em><br><br>I mean, has that ever crossed your mind? That there could be better rates out there that you're just not seeing?",
      responses: [
        { label: 'Yeah, that bothers me', next: 'consequence_quantify' },
        { label: 'I guess I never thought about it', next: 'consequence_quantify' },
        { label: 'Not really', next: 'confidence_challenge' },
        { label: 'We trust our current supplier', next: 'confidence_challenge' }
      ]
    },
    confidence_challenge: {
      stage: 'Objection - Confidence Challenge',
      text: "I'm sure you are happy. They're probably good.<br><br>But quick question... have you ever had like a second opinion? Where someone actually compared your rates to what else is available just to make sure?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: 'No, we just trust them', next: 'gap_creator' },
        { label: "Actually that's a good point", next: 'gap_creator' },
        { label: 'Still not interested', next: 'close_respect_decision' }
      ]
    },
    consequence_quantify: {
      stage: 'Discovery - Consequence Quantified',
      text: "So here's what I'm thinking... you're spending {{monthly_spend}} a month on electricity right now, right?<br><br>And if there's a 15, 20 percent gap you don't know about, that's roughly {{potential_savings}} a year you could be leaving on the table.<br><br><span class=\"pause-indicator\"></span><em>[PAUSE - let that land]</em><br><br>Over like 3 years, that's... well, you do the math. That's a lot of money.<br><br><span class=\"pause-indicator\"></span><em>[PAUSE 2 SECONDS]</em><br><br>Are you really willing to just settle for that?",
      responses: [
        { label: 'No, definitely not', next: 'solution_audit_proposal' },
        { label: 'I should look into it', next: 'solution_audit_proposal' },
        { label: "That's a lot of money", next: 'solution_audit_proposal' },
        { label: "We're locked in anyway", next: 'locked_in_future' }
      ]
    },
    solution_audit_proposal: {
      stage: 'Solution - Audit Proposal',
      text: "Here's what I'd suggest we do:<br><br>I pull together a quick audit for you. Takes me like 2 or 3 days. I reach out to 100 plus suppliers, get competitive bids from ones you probably haven't even talked to.<br><br>Then we jump on a quick call... maybe 15 minutes. I show you what's out there, you compare, and you decide if it makes sense.<br><br>No pressure, no obligation. Just data so you can make a smart decision.<br><br>Fair?",
      responses: [
        { label: "Fair, let's do it", next: 'close_calendar_commitment' },
        { label: 'How would that actually work?', next: 'solution_explain_process' },
        { label: 'Send me something first', next: 'solution_email_first' },
        { label: 'When would we talk?', next: 'close_calendar_commitment' }
      ]
    },
    solution_explain_process: {
      stage: 'Solution - Explain Process',
      text: "Super simple. You give me like three things: your monthly spend, when your contract ends, and who your current supplier is. That's it.<br><br>I take a couple days, I coordinate with all these suppliers, pull competitive bids from the ones you haven't talked to.<br><br>We hop on a 15 minute call. I walk you through what everyone's quoting. You look at the numbers, you compare, you decide.<br><br>Simple as that.",
      responses: [
        { label: "Okay, let's do it", next: 'close_calendar_commitment' },
        { label: 'When would we talk?', next: 'close_calendar_commitment' },
        { label: 'Send me info first', next: 'solution_email_first' }
      ]
    },
    close_calendar_commitment: {
      stage: 'Close - Calendar Commitment',
      text: "Perfect. So here's what I need: Your monthly spend, when you renew, and your current supplier name if you know it.<br><br>That's it. I'll handle the rest.<br><br>When works this week for a quick call? Monday, Tuesday, or Wednesday?",
      responses: [
        { label: 'Monday afternoon', next: 'close_invite_sent' },
        { label: 'Tuesday morning', next: 'close_invite_sent' },
        { label: 'Wednesday anytime', next: 'close_invite_sent' },
        { label: 'Let me check', next: 'close_send_calendar_link' }
      ]
    },
    close_invite_sent: {
      stage: 'Close - Invite Sent',
      text: "Perfect. I'm sending you a calendar invite right now.<br><br>We'll go over your specs and I'll pull those quotes for you.<br><br>See you then.",
      responses: []
    },
    close_send_calendar_link: {
      stage: 'Close - Send Calendar Link',
      text: "No problem. I'll send you a calendar link so you can pick a time that works for you.<br><br>Sound good?",
      responses: [
        { label: 'Sounds good', next: 'close_invite_sent' },
        { label: 'Perfect', next: 'close_invite_sent' }
      ]
    },
    solution_email_first: {
      stage: 'Solution - Email First',
      text: "Sure thing. What's your email? I'll send you over a quick breakdown of how this works.",
      responses: []
    },
    locked_in_future: {
      stage: 'Objection - Locked In',
      text: "Got it. When does your contract actually expire?",
      responses: [
        { label: '18 months', next: 'locked_in_plant_seed' },
        { label: '12 months', next: 'locked_in_plant_seed' },
        { label: '6 months', next: 'locked_in_plant_seed' },
        { label: '[Any timeframe]', next: 'locked_in_plant_seed' }
      ]
    },
    locked_in_plant_seed: {
      stage: 'Objection - Plant Seed',
      text: "Perfect timing actually. Here's the thing... most companies start thinking about this like 6 months before it expires.<br><br>So you've still got some time to plan this right.<br><br>What I'd suggest... let me put on my calendar to reach back out to you in like [appropriate month]. That way, you're not scrambling at the last minute when rates are going up.<br><br>Sound good?",
      responses: [
        { label: 'Yeah, that works', next: 'locked_in_confirm_callback' },
        { label: 'Sure, reach out later', next: 'locked_in_confirm_callback' },
        { label: 'Actually send info now', next: 'solution_email_first' }
      ]
    },
    locked_in_confirm_callback: {
      stage: 'Objection - Callback Confirmed',
      text: "Perfect. I'm putting it on my calendar to reach out in [X months].<br><br>We'll get you a game plan sorted out before you're in a crunch.<br><br>Talk soon.",
      responses: []
    },
    reschedule_callback: {
      stage: 'Reschedule - Callback',
      text: "No problem at all. When's a better time this week... or next week?",
      responses: [
        { label: 'Tomorrow at 2', next: 'close_invite_sent' },
        { label: 'Next week Monday', next: 'close_invite_sent' },
        { label: '[Any time]', next: 'close_invite_sent' }
      ]
    },
    gatekeeper_route: {
      stage: 'Gatekeeper - Route',
      text: "Got it. Can you transfer me to {{contact.first_name}}... or should I just follow up with them directly?",
      responses: [
        { label: "I'll transfer you", next: 'gatekeeper_wait' },
        { label: "Here's their number", next: 'close_respect_decision' },
        { label: 'Let me take your info', next: 'gatekeeper_info' }
      ]
    },
    gatekeeper_wait: {
      stage: 'Gatekeeper - Hold',
      text: "Perfect. I'll hold.",
      responses: [
        { label: 'New person answers', next: 'transferred_person_warmup' }
      ]
    },
    transferred_person_warmup: {
      stage: 'Opening - Transferred Warmup',
      text: "Hey {{contact.first_name}}! Thanks for picking up. {{previousContact}} passed me over to you.<br><br>I know this is kind of random... but do you have about 30 seconds?",
      responses: [
        { label: 'Yeah, go ahead', next: 'opening_industry_context' },
        { label: 'What is this about?', next: 'opening_industry_context' },
        { label: 'Not a good time', next: 'reschedule_callback' }
      ]
    },
    gatekeeper_info: {
      stage: 'Gatekeeper - Info Capture',
      text: "Sure. What's the best way to reach them? Email or phone?",
      responses: [
        { label: 'Shared contact info', next: 'followup_scheduled' }
      ]
    },
    clarify_involvement: {
      stage: 'Clarify - Involvement',
      text: "No problem. Here's the thing... most {{account.industry}} companies are leaving like {{potential_savings}} on the table a year just from bad timing on their renewal.<br><br>Does that sound like something you'd be involved in... or is that more of a procurement team thing?",
      responses: [
        { label: "That's me", next: 'urgency_building' },
        { label: "That's [name]", next: 'gatekeeper_route' },
        { label: 'Both of us', next: 'urgency_building' }
      ]
    },
    // ===== NEPQ + PEACE INTEGRATED OPENER =====
    pattern_interrupt_opening: {
      stage: 'Opening - Quick Intro & Permission',
      text: "Hey {{contact.first_name}}! This is {{agent.first_name}}.<br><br><span class=\"pause-indicator\"></span> <em>[PAUSE 1 second]</em><br><br>Real quick... did I catch you at a bad time... or do you have about 30 seconds?",
      responses: [
        { label: 'Yeah, go ahead', next: 'opening_industry_context' },
        { label: 'I got 30 seconds', next: 'opening_industry_context' },
        { label: 'Actually, not a good time', next: 'reschedule_callback' },
        { label: 'What is this about?', next: 'opening_industry_context' }
      ]
    },
    nepq_empathy_bridge: {
      stage: 'Opening',
      text: "<span class=\"tone-marker concerned\">🎯 NEPQ EMPATHY BRIDGE</span><br><br><span class=\"tone-marker concerned\">CONCERNED TONE</span> (lower pitch, lean in, empathetic)<br><br>\"Perfect. <span class=\"pause-indicator\"></span> So look... <span class=\"pause-indicator\"></span> I know energy contracts probably aren't top of mind for most {{contact.title}}s... <span class=\"pause-indicator\"></span><br><br><em>[PAUSE - let that land]</em><br><br>That's actually the problem I'm calling about.\"<br><br><span class=\"tone-marker challenging\">CHALLENGING TONE</span> (direct, firm, confident)<br><br>\"Here's what I see with most {{account.industry}} companies your size... <span class=\"pause-indicator\"></span> they wait until 60-90 days before their contract expires to shop rates. <span class=\"pause-indicator\"></span> By that time, the market's already moved... <span class=\"pause-indicator\"></span> and they've lost all their negotiating leverage. <span class=\"pause-indicator\"></span> Rates are typically 10-15% higher because of timing alone.<br><br>For a company spending $50K+ monthly... <span class=\"pause-indicator\"></span> that timing gap could easily cost you $60K-$100K annually. <span class=\"pause-indicator\"></span><br><br>Real money, you know?\"<br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (binary qualification)<br><br>\"Have you already locked in your energy agreements past 2026... <span class=\"pause-indicator\"></span> or is that contract renewal window still open for you?\"",
      responses: [
        { label: "Locked in past 2026", next: 'ack_just_renewed' },
        { label: "Contract expires before 2027", next: 'nepq_situation_questions' },
        { label: "Not sure when it expires", next: 'nepq_situation_questions' },
        { label: "We use a broker", next: 'nepq_broker_clarify' },
        { label: "Not interested", next: 'nepq_objection_clarify' }
      ]
    },
    // ===== NEPQ 5-STAGE DISCOVERY SYSTEM =====
    nepq_situation_questions: {
      stage: 'NEPQ Discovery - Situation',
      text: "<span class=\"tone-marker curious\">🔍 STAGE 1: NEPQ SITUATION QUESTIONS</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (no judgment, just gathering data)<br><br>\"So what are you doing now for your electricity procurement... <span class=\"pause-indicator\"></span> just so I have more context?\"<br><br><em>⏸️ Wait for answer, then follow up:</em><br><br>\"And roughly how much are you spending monthly... <span class=\"pause-indicator\"></span> just so I understand the scope we're talking about?\"",
      responses: [
        { label: "$10K-25K monthly", next: 'nepq_situation_broker_check' },
        { label: "$25K-50K monthly", next: 'nepq_situation_broker_check' },
        { label: "$50K+ monthly", next: 'nepq_situation_broker_check' },
        { label: "Not sure exactly", next: 'nepq_situation_broker_check' }
      ]
    },
    nepq_situation_broker_check: {
      stage: 'NEPQ Discovery - Situation',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span> (trailing off to invite deeper answer)<br><br>\"And who handles the electricity decisions there... <span class=\"pause-indicator\"></span> is that something you own personally, or...?\"<br><br><em>⏸️ Let them fill in the blank</em>",
      responses: [
        { label: "I handle it myself", next: 'nepq_problem_awareness' },
        { label: "We have a broker", next: 'nepq_broker_clarify' },
        { label: "Someone else handles it", next: 'gatekeeper_intro' },
        { label: "It's a shared responsibility", next: 'nepq_problem_awareness' }
      ]
    },
    nepq_problem_awareness: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker confused\">🔍 STAGE 2: NEPQ PROBLEM AWARENESS</span><br><br><span class=\"tone-marker skeptical\">SKEPTICAL/CURIOUS TONE</span> (emphasis on \"LIKE\")<br><br>\"Okay, so you're spending ${{monthly_spend}} monthly... <span class=\"pause-indicator\"></span> your {{current_process}}... <span class=\"pause-indicator\"></span> Got it.<br><br><em>[PAUSE 2 seconds]</em><br><br>So you've been handling this for the last... <span class=\"pause-indicator\"></span> few years... <span class=\"pause-indicator\"></span><br><br>I mean, do you LIKE the results you've been getting?\"<br><br><em>⏸️ Wait for their answer - this opens the door to the confidence question</em>",
      responses: [
        { label: "Yeah, it's been fine", next: 'nepq_problem_probe_fine' },
        { label: "Not really / Could be better", next: 'nepq_problem_probe_impact' },
        { label: "It's complicated", next: 'nepq_problem_probe_complexity' },
        { label: "We use a broker for that", next: 'nepq_broker_clarify' }
      ]
    },
    nepq_problem_probe_fine: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker confused\">CONFUSED TONE</span> (furrowed brow, like you don't understand)<br><br>\"Oh... <span class=\"pause-indicator\"></span> so it's been fine... <span class=\"pause-indicator\"></span><br><br>When you say 'fine'... <span class=\"pause-indicator\"></span> what do you mean by that?\"<br><br><em>⏸️ Force them to define \"fine\" - most can't</em>",
      responses: [
        { label: "We renew on time, no issues", next: 'nepq_confidence_question' },
        { label: "Costs are stable", next: 'nepq_confidence_question' },
        { label: "Actually... there are some issues", next: 'nepq_problem_probe_impact' }
      ]
    },
    // ===== THE CONFIDENCE QUESTION (KEY INSERTION POINT) =====
    nepq_confidence_question: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker curious\">🔑 THE CONFIDENCE QUESTION - THIS IS THE PROBE</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (genuinely asking, lean in)<br><br>\"You don't sound so sure about it... <span class=\"pause-indicator\"></span><br><br>Can I ask... <span class=\"pause-indicator\"></span> how confident are you that your current rates are actually competitive?\"<br><br><em>💡 THIS IS THE KEY QUESTION</em><br><em>⏸️ Use curious tone - like you genuinely want to know</em><br><em>⏸️ Wait for their answer - don't fill the silence</em>",
      responses: [
        { label: "Pretty confident / They're fine", next: 'nepq_confidence_probe' },
        { label: "I'm not 100% sure / Could be better", next: 'nepq_confidence_probe' },
        { label: "Not very confident / Definitely concerned", next: 'nepq_problem_probe_impact' },
        { label: "We use a broker for that", next: 'nepq_broker_clarify' }
      ]
    },
    nepq_confidence_probe: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker confused\">CONFUSED TONE - PROBING DEEPER</span><br><br>\"Oh... <span class=\"pause-indicator\"></span> so they're pretty competitive... <span class=\"pause-indicator\"></span><br><br>And is that because you've actually COMPARED them to what the full market is quoting... <span class=\"pause-indicator\"></span><br><br>or more just because you've been with them a while?\"<br><br><em>⏸️ Wait for answer</em><br><br><em>If they can't articulate why they're confident...</em><br><br>\"I see... <span class=\"pause-indicator\"></span> so you don't really KNOW if they're competitive... <span class=\"pause-indicator\"></span> you just... <span class=\"pause-indicator\"></span> haven't looked?\"<br><br><em>⏸️ PAUSE - let that land</em>",
      responses: [
        { label: "We haven't really compared", next: 'nepq_problem_probe_comparison' },
        { label: "We just trust them / Been with them long", next: 'nepq_problem_probe_comparison' },
        { label: "We HAVE compared", next: 'nepq_problem_probe_comparison' },
        { label: "That's something our broker handles", next: 'nepq_broker_clarify' }
      ]
    },
    nepq_problem_probe_comparison: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker curious\">CURIOUS/SKEPTICAL TONE</span> (genuinely asking)<br><br>\"When you last renewed... <span class=\"pause-indicator\"></span> did you get like... <span class=\"pause-indicator\"></span> 5-10 competitive quotes from different suppliers... <span class=\"pause-indicator\"></span> or was it more like 2-3 options?\"<br><br><em>⏸️ This question creates the gap</em>",
      responses: [
        { label: "5-10 competitive quotes", next: 'nepq_problem_supplier_count' },
        { label: "Just 2-3 options", next: 'nepq_problem_supplier_count' },
        { label: "We just renewed with same supplier", next: 'nepq_problem_supplier_count' },
        { label: "Not sure / Don't remember", next: 'nepq_problem_supplier_count' }
      ]
    },
    nepq_problem_supplier_count: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker confused\">CONFUSED/CURIOUS TONE</span> (creating the gap)<br><br>\"Oh... <span class=\"pause-indicator\"></span> 2-3 quotes... <span class=\"pause-indicator\"></span><br><br>And do you know roughly how many suppliers are actually in the market? <span class=\"pause-indicator\"></span><br><br>Like, are we talking 10-20... <span class=\"pause-indicator\"></span> or more like 50... <span class=\"pause-indicator\"></span> or over 100?\"<br><br><em>💡 They'll usually guess low - this creates the gap</em><br><em>⏸️ Most say 10-20. Reality is 100+.</em>",
      responses: [
        { label: "10-20 suppliers", next: 'nepq_problem_reveal_gap' },
        { label: "50 suppliers", next: 'nepq_problem_reveal_gap' },
        { label: "100+ suppliers", next: 'nepq_problem_impact' },
        { label: "I have no idea", next: 'nepq_problem_reveal_gap' }
      ]
    },
    nepq_problem_reveal_gap: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker concerned\">CONCERNED TONE</span> (reveal the gap)<br><br>\"I see... <span class=\"pause-indicator\"></span> so there are actually 100+ suppliers in the market... <span class=\"pause-indicator\"></span><br><br>But your broker probably only works with 10-20... <span class=\"pause-indicator\"></span><br><br><em>[PAUSE 3 seconds - let that sink in]</em>\"",
      responses: [
        { label: "They continue listening", next: 'nepq_problem_impact' },
        { label: "They seem surprised", next: 'nepq_problem_impact' },
        { label: "They push back", next: 'nepq_broker_clarify' }
      ]
    },
    nepq_problem_impact: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker concerned\">CONCERNED TONE</span> (empathy, lean in)<br><br>\"Has that... <span class=\"pause-indicator\"></span> has that had an impact on you... <span class=\"pause-indicator\"></span> not knowing if you're getting the best rates?\"<br><br><em>💡 THEY START TO FEEL THE PROBLEM HERE</em><br><em>⏸️ Wait - let them process this</em>",
      responses: [
        { label: "Yeah, it bothers me", next: 'nepq_solution_awareness' },
        { label: "I guess I never thought about it", next: 'nepq_solution_awareness' },
        { label: "Not really / We trust our broker", next: 'nepq_broker_clarify' }
      ]
    },
    nepq_problem_probe_impact: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker concerned\">CONCERNED TONE</span> (empathetic)<br><br>\"Tell me more about that... <span class=\"pause-indicator\"></span> what specifically hasn't been working?\"<br><br><em>⏸️ Let them talk. Take notes.</em>",
      responses: [
        { label: "Costs keep going up", next: 'nepq_solution_awareness' },
        { label: "Too confusing to compare", next: 'nepq_solution_awareness' },
        { label: "Don't have time to shop", next: 'nepq_solution_awareness' },
        { label: "Not sure if we're getting good rates", next: 'nepq_solution_awareness' }
      ]
    },
    nepq_problem_probe_complexity: {
      stage: 'NEPQ Discovery - Problem Awareness',
      text: "<span class=\"tone-marker confused\">CONFUSED TONE</span> (probing deeper)<br><br>\"Oh... <span class=\"pause-indicator\"></span> how do you mean by 'complicated'?\"<br><br><em>⏸️ Don't fill the silence. Let them explain.</em>",
      responses: [
        { label: "Too many options to compare", next: 'nepq_solution_awareness' },
        { label: "Contracts are confusing", next: 'nepq_solution_awareness' },
        { label: "Don't have bandwidth", next: 'nepq_solution_awareness' }
      ]
    },
    nepq_solution_awareness: {
      stage: 'NEPQ Discovery - Solution Awareness',
      text: "<span class=\"tone-marker curious\">🎯 STAGE 3: NEPQ SOLUTION AWARENESS</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (painting the future)<br><br>\"So before we started talking today... <span class=\"pause-indicator\"></span> were you out there looking for a second opinion on your rates... <span class=\"pause-indicator\"></span> or what were you doing?\"<br><br><em>⏸️ Understand their starting point</em>",
      responses: [
        { label: "No, we just trust our current setup", next: 'nepq_solution_vision' },
        { label: "We've been meaning to look into it", next: 'nepq_solution_vision' },
        { label: "We hadn't really thought about it", next: 'nepq_solution_barriers' }
      ]
    },
    nepq_solution_barriers: {
      stage: 'NEPQ Discovery - Solution Awareness',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span> (no judgment)<br><br>\"What prevented you from doing that in the past?\"<br><br><em>⏸️ This reveals their real blockers</em>",
      responses: [
        { label: "Too busy / Not a priority", next: 'nepq_solution_vision' },
        { label: "Didn't know where to start", next: 'nepq_solution_vision' },
        { label: "Tried before, was a nightmare", next: 'nepq_solution_vision' },
        { label: "Happy with current setup", next: 'nepq_solution_vision' }
      ]
    },
    nepq_solution_vision: {
      stage: 'NEPQ Discovery - Solution Awareness',
      text: "<span class=\"tone-marker curious\">CURIOUS/COLLABORATIVE TONE</span><br><br>\"Let's say we could show you what competitive rates look like from 100+ suppliers... <span class=\"pause-indicator\"></span> not just the 10-20 your broker probably works with... <span class=\"pause-indicator\"></span><br><br>How do you see that benefiting you the most?\"<br><br><em>⏸️ Make them articulate the benefit themselves</em>",
      responses: [
        { label: "We'd know if we're getting a good deal", next: 'nepq_solution_personal' },
        { label: "Could save money", next: 'nepq_solution_personal' },
        { label: "More options to choose from", next: 'nepq_solution_personal' }
      ]
    },
    nepq_solution_personal: {
      stage: 'NEPQ Discovery - Solution Awareness',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span> (dig for emotional drivers)<br><br>\"Right... <span class=\"pause-indicator\"></span> and what would that do for you... <span class=\"pause-indicator\"></span> personally?\"<br><br><em>💡 \"Personally\" = gold. This is where they reveal their real motivation.</em>",
      responses: [
        { label: "Peace of mind", next: 'nepq_consequence_questions' },
        { label: "Less stress", next: 'nepq_consequence_questions' },
        { label: "Look good to leadership", next: 'nepq_consequence_questions' },
        { label: "Save time", next: 'nepq_consequence_questions' }
      ]
    },
    nepq_consequence_questions: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker challenging\">⚠️ STAGE 4: NEPQ CONSEQUENCE QUESTIONS (MOST POWERFUL)</span><br><br><span class=\"tone-marker concerned\">CHALLENGING TONE</span> (make inaction feel riskier than action)<br><br>\"So if this stays the same for the next 6-12 months... <span class=\"pause-indicator\"></span> and you're still overpaying without knowing it... <span class=\"pause-indicator\"></span><br><br>What do you think that could cost you?\"<br><br><em>⏸️ Wait. Let them calculate. They'll usually guess conservative.</em>",
      responses: [
        { label: "$10K-30K potentially", next: 'nepq_consequence_quantify' },
        { label: "$50K+ potentially", next: 'nepq_consequence_quantify' },
        { label: "I don't know, could be significant", next: 'nepq_consequence_quantify' },
        { label: "Not that much", next: 'nepq_consequence_challenge' }
      ]
    },
    nepq_consequence_quantify: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker challenging\">CHALLENGING TONE</span> (direct but not aggressive)<br><br>\"So let's say that's {{potential_savings}} per year... <span class=\"pause-indicator\"></span><br><br>Over 3 years that's triple that amount... <span class=\"pause-indicator\"></span><br><br><strong>Are you willing to settle for that?</strong>\"<br><br><em>💡 DIRECT CHALLENGE - they have to defend staying put</em><br><em>⏸️ Wait for their response. Don't soften it.</em>",
      responses: [
        { label: "No, definitely not", next: 'nepq_micro_commitment_1' },
        { label: "I should probably look into it", next: 'nepq_micro_commitment_1' },
        { label: "We're locked in anyway", next: 'nepq_consequence_lockedin' }
      ]
    },
    nepq_consequence_challenge: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker challenging\">CHALLENGING/PLAYFUL TONE</span> (reverse psychology)<br><br>\"I mean... <span class=\"pause-indicator\"></span> you've been doing it this way for years now... <span class=\"pause-indicator\"></span><br><br>Why look at getting a second opinion NOW... <span class=\"pause-indicator\"></span> why not just push it down the road like... <span class=\"pause-indicator\"></span> most companies who don't know they're overpaying?\"<br><br><em>⏸️ This makes them DEFEND why they need to change</em>",
      responses: [
        { label: "Because we need to know before renewal", next: 'nepq_qualifying_questions' },
        { label: "You're right, I should look at this", next: 'nepq_qualifying_questions' },
        { label: "Fair point, maybe I'll wait", next: 'nepq_final_consequence' }
      ]
    },
    nepq_consequence_lockedin: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"And when you signed that... <span class=\"pause-indicator\"></span> did your broker shop that competitively at the time... <span class=\"pause-indicator\"></span> or was it more just a renewal?\"<br><br><em>⏸️ Planting seeds for next time</em>",
      responses: [
        { label: "They shopped it / got a few quotes", next: 'nepq_lockedin_future' },
        { label: "It was just a renewal", next: 'nepq_lockedin_future' },
        { label: "I'm not sure", next: 'nepq_lockedin_future' }
      ]
    },
    nepq_lockedin_future: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker challenging\">CHALLENGING TONE</span><br><br>\"So 2-3 quotes... <span class=\"pause-indicator\"></span> out of 100+ suppliers in the market... <span class=\"pause-indicator\"></span><br><br>Has it crossed your mind that there might have been better rates available that you didn't see?\"<br><br><em>⏸️ Make them think about it</em>",
      responses: [
        { label: "I guess it's possible", next: 'nepq_future_planning' },
        { label: "Probably", next: 'nepq_future_planning' },
        { label: "We're happy with what we got", next: 'nepq_future_planning' }
      ]
    },
    nepq_future_planning: {
      stage: 'NEPQ Discovery - Future Planning',
      text: "<span class=\"tone-marker collaborative\">COLLABORATIVE TONE</span><br><br>\"So here's what I'd suggest... <span class=\"pause-indicator\"></span><br><br>Why don't we run an audit NOW for when your contract expires... <span class=\"pause-indicator\"></span> That way you have 6 months of lead time... <span class=\"pause-indicator\"></span> and you can see what competitive rates look like when you actually have leverage... <span class=\"pause-indicator\"></span><br><br>Does that make sense?\"",
      responses: [
        { label: "Yeah, that makes sense", next: 'nepq_micro_commitment_1' },
        { label: "When does my contract expire again?", next: 'schedule_followup' },
        { label: "Just reach out when it's closer", next: 'schedule_followup' }
      ]
    },
    nepq_final_consequence: {
      stage: 'NEPQ Discovery - Consequence',
      text: "<span class=\"tone-marker concerned\">CONCERNED TONE</span><br><br>\"What happens if you don't do anything about this... <span class=\"pause-indicator\"></span> and your contract renews at even HIGHER rates?\"<br><br><em>⏸️ Paint the worst case</em>",
      responses: [
        { label: "That would be bad", next: 'nepq_qualifying_questions' },
        { label: "I guess I should look at it", next: 'nepq_qualifying_questions' },
        { label: "We'll figure it out", next: 'respect_decision' }
      ]
    },
    nepq_qualifying_questions: {
      stage: 'NEPQ Discovery - Qualifying',
      text: "<span class=\"tone-marker curious\">QUALIFYING QUESTION (Optional)</span><br><br><span class=\"tone-marker curious\">CURIOUS/SKEPTICAL TONE</span><br><br>\"How important is it for you to find out if there's a gap... <span class=\"pause-indicator\"></span> versus just assuming your broker has you covered?\"<br><br><em>⏸️ This separates buyers from lookers</em><br><em>💡 Note: Can skip directly to Micro-Commitment #1 if momentum is strong</em>",
      responses: [
        { label: "Pretty important", next: 'nepq_micro_commitment_1' },
        { label: "Worth exploring", next: 'nepq_micro_commitment_1' },
        { label: "Not a priority right now", next: 'nepq_consequence_challenge' }
      ]
    },
    // ===== NEPQ BROKER OBJECTION HANDLING (Per NEPQ Document) =====
    objection_broker_intro: {
      stage: 'Objection - Broker (Clarify)',
      text: "Oh, you use a broker... So when you say that, do they handle like everything or just coordinate quotes for you?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: 'They handle everything', next: 'objection_broker_discuss' },
        { label: 'They shop rates', next: 'objection_broker_discuss' },
        { label: 'They get us quotes', next: 'objection_broker_discuss' },
        { label: 'They negotiate for us', next: 'objection_broker_discuss' }
      ]
    },
    objection_broker_discuss: {
      stage: 'Objection - Broker (Discuss)',
      text: "Got it. So when you last renewed, how many quotes did they actually bring you? Like 5, 10... or more like 2, 3?",
      responses: [
        { label: '2 or 3 quotes', next: 'objection_broker_gap' },
        { label: '5 to 10 quotes', next: 'objection_broker_gap' },
        { label: 'Just renewed with same supplier', next: 'objection_broker_gap' },
        { label: 'Not sure', next: 'objection_broker_gap' }
      ]
    },
    objection_broker_gap: {
      stage: 'Objection - Broker Gap Reveal',
      text: "Okay so like 2 or 3 quotes. And do you know how many suppliers your broker actually works with? Like 20, 30... or closer to 100 plus?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: '20 to 30', next: 'objection_broker_reveal_gap' },
        { label: '50 suppliers', next: 'objection_broker_reveal_gap' },
        { label: '100 plus', next: 'consequence_quantify' },
        { label: 'I have no idea', next: 'objection_broker_reveal_gap' }
      ]
    },
    objection_broker_reveal_gap: {
      stage: 'Objection - Broker Gap Revealed',
      text: "So there's actually 100 plus suppliers in the market... but your broker probably only works with like 20, 30, maybe 50.<br><br><span class=\"pause-indicator\"></span><em>[PAUSE 3 SECONDS]</em><br><br>That means like half the market... your broker doesn't even have access to.<br><br>Wouldn't it be worth seeing what that other half is quoting?",
      responses: [
        { label: 'Yeah, that makes sense', next: 'solution_audit_proposal' },
        { label: 'How would that work?', next: 'solution_explain_process' },
        { label: "We're happy with them", next: 'objection_broker_happy' }
      ]
    },
    objection_broker_happy: {
      stage: 'Objection - Broker Happy',
      text: "I get it. They're probably doing a good job.<br><br>But real quick... have you ever had like a second opinion? Where someone compared your broker's rates to the broader market just to see?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: 'No, we just trust them', next: 'gap_creator' },
        { label: "We've checked before", next: 'gap_creator' },
        { label: 'Why would we need to?', next: 'gap_creator' }
      ]
    },
    // ===== NEPQ 3-STEP OBJECTION FORMULA: BROKER HANDLING (Legacy - kept for backward compatibility) =====
    nepq_broker_clarify: {
      stage: 'NEPQ Objection - Broker',
      text: "<span class=\"tone-marker confused\">🔄 NEPQ 3-STEP: CLARIFY</span><br><br><span class=\"tone-marker confused\">CONFUSED TONE</span> (like you don't understand)<br><br>\"Oh... <span class=\"pause-indicator\"></span> you use a broker... <span class=\"pause-indicator\"></span><br><br>Can I ask... <span class=\"pause-indicator\"></span> what do you mean by that?\"<br><br><em>⏸️ Don't assume. Make them explain.</em>",
      responses: [
        { label: "They handle all our electricity", next: 'nepq_broker_discuss' },
        { label: "They shop rates for us", next: 'nepq_broker_discuss' },
        { label: "They get us quotes", next: 'nepq_broker_discuss' }
      ]
    },
    nepq_broker_discuss: {
      stage: 'NEPQ Objection - Broker',
      text: "<span class=\"tone-marker confused\">🔄 NEPQ 3-STEP: DISCUSS</span><br><br><span class=\"tone-marker confused\">CONFUSED TONE</span> (probing deeper)<br><br>\"Oh I see... <span class=\"pause-indicator\"></span> so they handle everything... <span class=\"pause-indicator\"></span><br><br>In what way, though?\"<br><br><em>⏸️ Wait for answer, then:</em><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"Aww okay... <span class=\"pause-indicator\"></span> and when you last renewed... <span class=\"pause-indicator\"></span> how many quotes did they bring you?\"",
      responses: [
        { label: "2-3 quotes", next: 'nepq_broker_supplier_count' },
        { label: "5-10 quotes", next: 'nepq_broker_supplier_count' },
        { label: "Just renewed with same supplier", next: 'nepq_broker_supplier_count' },
        { label: "Not sure", next: 'nepq_broker_supplier_count' }
      ]
    },
    nepq_broker_supplier_count: {
      stage: 'NEPQ Objection - Broker',
      text: "<span class=\"tone-marker confused\">CONFUSED/CURIOUS TONE</span><br><br>\"Oh... <span class=\"pause-indicator\"></span> 2-3 quotes... <span class=\"pause-indicator\"></span><br><br>And do you know roughly how many suppliers they work with?\"<br><br><em>⏸️ Creating the gap</em>",
      responses: [
        { label: "Maybe 10-20", next: 'nepq_broker_diffuse' },
        { label: "Not sure", next: 'nepq_broker_diffuse' },
        { label: "Probably a lot", next: 'nepq_broker_diffuse' }
      ]
    },
    nepq_broker_diffuse: {
      stage: 'NEPQ Objection - Broker',
      text: "<span class=\"tone-marker challenging\">🔄 NEPQ 3-STEP: DIFFUSE</span><br><br><span class=\"tone-marker challenging\">CHALLENGING TONE</span> (make THEM say it)<br><br>\"I see... <span class=\"pause-indicator\"></span> so here's what I'm curious about... <span class=\"pause-indicator\"></span><br><br>There are 100+ suppliers in the actual market... <span class=\"pause-indicator\"></span><br><br>If your broker only works with 10-20... <span class=\"pause-indicator\"></span> what do you think that means for the rates you're seeing?\"<br><br><em>⏸️ They'll say it themselves: \"We might be missing options\"</em>",
      responses: [
        { label: "We might not be seeing all options", next: 'nepq_broker_audit_offer' },
        { label: "I guess we could be missing out", next: 'nepq_broker_audit_offer' },
        { label: "They shop everything", next: 'nepq_broker_audit_offer' }
      ]
    },
    nepq_broker_audit_offer: {
      stage: 'NEPQ Objection - Broker',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"Right... <span class=\"pause-indicator\"></span> so would it make sense to at least SEE what that other 80% of the market is quoting... <span class=\"pause-indicator\"></span> just so you KNOW?\"<br><br><em>💡 Key: You never TOLD them they had a problem. You ASKED questions that made them REALIZE it.</em>",
      responses: [
        { label: "Yeah, that makes sense", next: 'nepq_micro_commitment_1' },
        { label: "How would that work?", next: 'broker_audit_close' },
        { label: "We're happy with our broker", next: 'nepq_broker_happy_clarify' }
      ]
    },
    nepq_broker_happy_clarify: {
      stage: 'NEPQ Objection - Happy Broker',
      text: "<span class=\"tone-marker confused\">🔄 NEPQ 3-STEP: CLARIFY</span><br><br><span class=\"tone-marker confused\">CONFUSED TONE</span><br><br>\"Oh... <span class=\"pause-indicator\"></span> you're happy with them... <span class=\"pause-indicator\"></span><br><br>What do you mean by that?\"<br><br><em>⏸️ Make them define \"happy\"</em>",
      responses: [
        { label: "Been with them for years, good service", next: 'nepq_broker_happy_discuss' },
        { label: "They handle everything for us", next: 'nepq_broker_happy_discuss' },
        { label: "No complaints", next: 'nepq_broker_happy_discuss' }
      ]
    },
    nepq_broker_happy_discuss: {
      stage: 'NEPQ Objection - Happy Broker',
      text: "<span class=\"tone-marker curious\">🔄 NEPQ 3-STEP: DISCUSS</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (not challenging, genuinely asking)<br><br>\"Aww okay... <span class=\"pause-indicator\"></span> and what is it about what they do that makes you feel they do a good job?\"<br><br><em>⏸️ Wait for answer, then:</em><br><br>\"I see... <span class=\"pause-indicator\"></span> so they make it easy for you... <span class=\"pause-indicator\"></span><br><br>Can I ask though... <span class=\"pause-indicator\"></span> have you ever had a second opinion on whether the rates they're getting you are competitive?\"",
      responses: [
        { label: "No, we just trust them", next: 'nepq_broker_happy_diffuse' },
        { label: "We've compared before", next: 'nepq_broker_happy_diffuse' },
        { label: "Why would we need to?", next: 'nepq_broker_happy_diffuse' }
      ]
    },
    nepq_broker_happy_diffuse: {
      stage: 'NEPQ Objection - Happy Broker',
      text: "<span class=\"tone-marker challenging\">🔄 NEPQ 3-STEP: DIFFUSE</span><br><br><span class=\"tone-marker challenging\">CHALLENGING TONE</span> (direct but not aggressive)<br><br>\"Okay... <span class=\"pause-indicator\"></span> and is that because you've compared them to what the full market quotes... <span class=\"pause-indicator\"></span> or more just because you've been with them a long time?\"<br><br><em>⏸️ Wait for answer</em><br><br>\"So here's what I'm curious about... <span class=\"pause-indicator\"></span><br><br>If you HAVEN'T compared... <span class=\"pause-indicator\"></span> how do you KNOW they're doing a good job?\"<br><br><em>💡 Make THEM question their assumption</em>",
      responses: [
        { label: "I guess we don't know for sure", next: 'nepq_micro_commitment_1' },
        { label: "Fair point", next: 'nepq_micro_commitment_1' },
        { label: "We trust the relationship", next: 'broker_audit_no_switch' }
      ]
    },
    // ===== NEPQ 3-STEP: NOT INTERESTED OBJECTION =====
    nepq_objection_clarify: {
      stage: 'NEPQ Objection - Not Interested',
      text: "<span class=\"tone-marker confused\">🔄 NEPQ 3-STEP: CLARIFY</span><br><br><span class=\"tone-marker confused\">CONFUSED TONE</span> (genuinely curious)<br><br>\"Oh... <span class=\"pause-indicator\"></span> not interested... <span class=\"pause-indicator\"></span><br><br>Can I ask... <span class=\"pause-indicator\"></span> not interested in what specifically?\"<br><br><em>⏸️ Most people can't articulate WHY they're not interested</em>",
      responses: [
        { label: "Not interested in changing suppliers", next: 'nepq_not_interested_discuss' },
        { label: "Too busy right now", next: 'nepq_timing_discuss' },
        { label: "We're happy with what we have", next: 'nepq_broker_happy_clarify' },
        { label: "Just not interested", next: 'nepq_not_interested_discuss' }
      ]
    },
    nepq_not_interested_discuss: {
      stage: 'NEPQ Objection - Not Interested',
      text: "<span class=\"tone-marker curious\">🔄 NEPQ 3-STEP: DISCUSS</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"Aww okay... <span class=\"pause-indicator\"></span> so you don't want to change suppliers... <span class=\"pause-indicator\"></span><br><br>And is that because your current rates are competitive... <span class=\"pause-indicator\"></span> or more just because changing is a hassle?\"<br><br><em>⏸️ Understand the real objection</em>",
      responses: [
        { label: "Changing is a hassle", next: 'nepq_not_interested_diffuse' },
        { label: "Our rates are fine", next: 'nepq_not_interested_diffuse' },
        { label: "Both", next: 'nepq_not_interested_diffuse' }
      ]
    },
    nepq_not_interested_diffuse: {
      stage: 'NEPQ Objection - Not Interested',
      text: "<span class=\"tone-marker understanding\">🔄 NEPQ 3-STEP: DIFFUSE</span><br><br><span class=\"tone-marker understanding\">UNDERSTANDING TONE</span><br><br>\"I totally get that... <span class=\"pause-indicator\"></span> and just to be clear... <span class=\"pause-indicator\"></span> I'm not asking you to change anything right now. <span class=\"pause-indicator\"></span><br><br>Here's the only question: <span class=\"pause-indicator\"></span> Would it be valuable to at least KNOW if you're leaving money on the table? <span class=\"pause-indicator\"></span><br><br>Because if your rates ARE competitive... <span class=\"pause-indicator\"></span> great, I'll tell you that. <span class=\"pause-indicator\"></span> If there's a gap... <span class=\"pause-indicator\"></span> at least you KNOW.\"",
      responses: [
        { label: "I guess that would be useful", next: 'nepq_micro_commitment_1' },
        { label: "How long would that take?", next: 'nepq_micro_commitment_1' },
        { label: "Still not interested", next: 'respect_decision' }
      ]
    },
    nepq_timing_discuss: {
      stage: 'NEPQ Objection - Bad Timing',
      text: "<span class=\"tone-marker curious\">🔄 NEPQ 3-STEP: DISCUSS</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"Aww okay... <span class=\"pause-indicator\"></span> so timing's tight right now... <span class=\"pause-indicator\"></span><br><br>I'm curious though... <span class=\"pause-indicator\"></span> when WOULD be a good time to look at this? <span class=\"pause-indicator\"></span><br><br>Because here's the thing... <span class=\"pause-indicator\"></span> rates are actually going UP right now. <span class=\"pause-indicator\"></span> So the longer you wait... <span class=\"pause-indicator\"></span> the worse the deal you'll get when you renew.\"",
      responses: [
        { label: "Maybe next month", next: 'schedule_followup' },
        { label: "I can spare 15 minutes now", next: 'nepq_micro_commitment_1' },
        { label: "Just email me something", next: 'email_first' }
      ]
    },
    // ===== ORIGINAL BROKER AUDIT STRATEGY =====
    broker_audit_intro: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker understanding\">Acknowledge (validate their relationship)</span><br><br><span class=\"pause-indicator\"></span><span class=\"pause-indicator\"></span> <em>(Wait 2 seconds, don't jump in immediately)</em><br><br>That's actually really smart. <span class=\"pause-indicator\"></span> A lot of companies use brokers because they don't have the bandwidth to manage this themselves. <span class=\"pause-indicator\"></span> That makes total sense.<br><br><span class=\"pause-indicator\"></span> <em>(Let that land)</em><br><br><span class=\"tone-marker curious\">Ask (dig deeper with strategic questions)</span><br><br>Quick question though— <span class=\"pause-indicator\"></span> when you last renewed, did your broker bring you 5-10 competitive quotes from different suppliers, <span class=\"pause-indicator\"></span> or was it more like 2-3 options?",
      responses: [
        { label: "5-10 competitive quotes", next: 'broker_performance_good' },
        { label: "Just 2-3 options", next: 'broker_performance_limited' },
        { label: "They mostly just renew what we have", next: 'broker_performance_limited' },
        { label: "Not sure / Don't remember", next: 'broker_probe_suppliers' }
      ]
    },
    broker_probe_suppliers: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> And roughly, how many different suppliers do you think your broker has relationships with? <span class=\"pause-indicator\"></span> Like, are we talking 50+ or more like 10-20?",
      responses: [
        { label: "50+ suppliers", next: 'broker_performance_good' },
        { label: "10-30 suppliers", next: 'broker_performance_limited' },
        { label: "Not sure", next: 'broker_rate_check' }
      ]
    },
    broker_rate_check: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Do you know what rate you're currently paying per kWh?",
      responses: [
        { label: "Know the rate", next: 'broker_audit_reframe' },
        { label: "Don't know it", next: 'broker_audit_reframe' }
      ]
    },
    broker_performance_limited: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker understanding\">empathetic, not attacking</span> <span class=\"pause-indicator\"></span> That's actually really common. <span class=\"pause-indicator\"></span> A lot of brokers focus on administration and renewals rather than true competitive shopping. <span class=\"pause-indicator\"></span> They've got their preferred suppliers, and it's easier to just go back to them.<br><br><span class=\"tone-marker confident\">Here's the thing though</span>— <span class=\"pause-indicator\"></span> when you run a REAL competitive event where 100+ suppliers are actually bidding against each other, <span class=\"pause-indicator\"></span> the quotes are typically 15-20% lower than renewal quotes from the same suppliers. <span class=\"pause-indicator\"></span> That's just how the market works.<br><br>Your broker probably doesn't have access to that full network. <span class=\"pause-indicator\"></span> Not their fault, that's just their model. <span class=\"pause-indicator\"></span> But that gap? <span class=\"pause-indicator\"></span> That's real money you might be leaving on the table.",
      responses: [
        { label: "That sounds like us", next: 'broker_audit_close' },
        { label: "How much money are we talking?", next: 'broker_audit_quantify' },
        { label: "We're happy with our broker", next: 'broker_performance_good' }
      ]
    },
    broker_performance_good: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">respectful tone</span> <span class=\"pause-indicator\"></span> That's awesome, and I respect that. <span class=\"pause-indicator\"></span> Real talk though—even the best brokers work with a limited supplier network. <span class=\"pause-indicator\"></span> They probably have relationships with maybe 30-50 suppliers, which is solid. <span class=\"pause-indicator\"></span> But there are 100+ in the actual market.<br><br><span class=\"tone-marker curious\">What if there's supply out there at better rates that your broker doesn't have access to?</span> <span class=\"pause-indicator\"></span> Not because they're bad at their job, but just because their network is finite.",
      responses: [
        { label: "That's possible", next: 'broker_audit_reframe' },
        { label: "They shop everything", next: 'broker_audit_reframe' },
        { label: "Not interested in switching", next: 'broker_audit_no_switch' }
      ]
    },
    broker_audit_no_switch: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> <span class=\"pause-indicator\"></span> I hear you—and just to be clear, I'm not asking you to switch brokers. <span class=\"pause-indicator\"></span><br><br>Think of this like getting a second medical opinion before major surgery. <span class=\"pause-indicator\"></span> Your current broker might be doing a solid job, <span class=\"pause-indicator\"></span> but wouldn't you want to KNOW if you're leaving $50K-$100K on the table just because you've only seen one side of the market?<br><br>We're not saying your broker is bad. <span class=\"pause-indicator\"></span> We're saying you probably don't have all the information you need to make the best decision.",
      responses: [
        { label: "That makes sense", next: 'broker_audit_close' },
        { label: "What would this look like?", next: 'broker_audit_close' },
        { label: "Still not interested", next: 'respect_decision' }
      ]
    },
    broker_audit_reframe: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">Reframe (position as Second Opinion)</span><br><br>Here's why I'm asking: <span class=\"pause-indicator\"></span> Most brokers work with a handful of preferred suppliers—maybe 10-20. <span class=\"pause-indicator\"></span> That's fine for administrative purposes, but it means you're only seeing 10-20% of what's actually available in the market.<br><br><span class=\"tone-marker understanding\">We call this a 'broker audit.'</span> <span class=\"pause-indicator\"></span> Here's what it is: <span class=\"pause-indicator\"></span> We pull quotes from our network of 100+ suppliers—completely different ones than your broker probably works with—and show you what that OTHER 80% of the market is quoting.<br><br>Think of it like getting a second medical opinion before major surgery. <span class=\"pause-indicator\"></span> Your current broker might be doing a solid job, <span class=\"pause-indicator\"></span> but wouldn't you want to KNOW if you're leaving $50K-$100K on the table just because you've only seen one side of the market?<br><br>We're not saying your broker is bad. <span class=\"pause-indicator\"></span> We're saying you probably don't have all the information you need to make the best decision.",
      responses: [
        { label: "That makes sense", next: 'broker_audit_close' },
        { label: "What would this cost?", next: 'broker_audit_cost' },
        { label: "We're happy with our broker", next: 'broker_strong_relationship' }
      ]
    },
    broker_audit_quantify: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">Let me put some numbers to it.</span> <span class=\"pause-indicator\"></span><br><br>If you're spending {{monthly_spend}} monthly, that's about {{annual_spend}} annually. <span class=\"pause-indicator\"></span><br><br>Competitive market rate from 100+ suppliers bidding is typically 15-20% lower than what most brokers can access. <span class=\"pause-indicator\"></span> That gap is about {{potential_savings}} per year. <span class=\"pause-indicator\"></span><br><br>Over 3 years? <span class=\"pause-indicator\"></span> That could be triple that amount you're overpaying—just because you've only seen one side of the market.<br><br>Your current broker might already be getting you those rates. <span class=\"pause-indicator\"></span> Or there might be a gap. <span class=\"pause-indicator\"></span> The only way to KNOW is to run an audit and see what the market actually quotes for your situation.<br><br>Wouldn't it be worth 15 minutes to find out?",
      responses: [
        { label: "Yes, that's worth knowing", next: 'broker_audit_close' },
        { label: "That's significant", next: 'broker_audit_close' },
        { label: "We're locked in anyway", next: 'broker_strong_relationship' }
      ]
    },
    broker_audit_cost: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">straightforward tone</span> <span class=\"pause-indicator\"></span> It's free. <span class=\"pause-indicator\"></span><br><br>We get paid by suppliers when you sign with them. <span class=\"pause-indicator\"></span> Just like your current broker does. <span class=\"pause-indicator\"></span><br><br>But here's the key—you pay the same rate whether you go direct or through any broker. <span class=\"pause-indicator\"></span> The supplier already builds in broker commission. <span class=\"pause-indicator\"></span> So you're not paying extra. <span class=\"pause-indicator\"></span> We just handle the shopping so you don't have to.<br><br>And honestly, if we're pulling better rates from 100+ suppliers, <span class=\"pause-indicator\"></span> you might save more than our commission anyway. <span class=\"pause-indicator\"></span> That's why the audit matters—you get to see the numbers.",
      responses: [
        { label: "That makes sense", next: 'broker_audit_close' },
        { label: "Let's do the audit", next: 'broker_audit_close' },
        { label: "I need to think about it", next: 'email_first' }
      ]
    },
    broker_strong_relationship: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker understanding\">understanding, not pushy</span> <span class=\"pause-indicator\"></span> I totally respect that. <span class=\"pause-indicator\"></span> Long-term relationships are valuable.<br><br>Here's what I'd suggest though: <span class=\"pause-indicator\"></span> When you're about 6 months out from your next renewal, that's when timing actually becomes your leverage.<br><br>Why don't we do this— <span class=\"pause-indicator\"></span> I'll run an audit 6 months before your contract expires. <span class=\"pause-indicator\"></span> That way you'll see what competitive rates look like when you actually have negotiating power. <span class=\"pause-indicator\"></span> Your broker might find better terms with their suppliers, <span class=\"pause-indicator\"></span> or you might have options to explore. <span class=\"pause-indicator\"></span> Either way, you go into that renewal armed with market intelligence.<br><br>When does your current contract expire?",
      responses: [
        { label: "I know the date", next: 'schedule_followup' },
        { label: "Not sure exactly", next: 'email_first' },
        { label: "Just contact me when it's time", next: 'followup_scheduled' }
      ]
    },
    broker_audit_close: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">Audit Close (Low-Pressure)</span><br><br>\"So here's what makes sense: <span class=\"pause-indicator\"></span> Let me run a quick audit. <span class=\"pause-indicator\"></span> Takes me 2-3 days. <span class=\"pause-indicator\"></span> I'll pull quotes from suppliers your broker probably isn't working with. <span class=\"pause-indicator\"></span><br><br>Then we hop on a 15-minute call and I show you what I found. <span class=\"pause-indicator\"></span><br><br>If your broker's rates are actually competitive, <span class=\"pause-indicator\"></span> I'll tell you that. <span class=\"pause-indicator\"></span> If there's a gap, at least you KNOW. <span class=\"pause-indicator\"></span><br><br>No obligation, no pressure. <span class=\"pause-indicator\"></span> Just data so you can make an informed decision. <span class=\"pause-indicator\"></span> Fair?\"",
      responses: [
        { label: "Fair - let's do it", next: 'close_step4_calendar' },
        { label: "What do you need from me?", next: 'audit_info_needed' },
        { label: "Send me information first", next: 'objection_send_something' },
        { label: "I need to think about it", next: 'close_think_about_it' },
        { label: "I'll talk to my broker first", next: 'objection_talk_to_broker' }
      ]
    },
    audit_info_needed: {
      stage: 'Broker Audit',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Really just a few things:<br><br>1. <span class=\"pause-indicator\"></span> Roughly what you're spending monthly (even a ballpark)<br>2. <span class=\"pause-indicator\"></span> When your contract expires<br>3. <span class=\"pause-indicator\"></span> Your current rate per kWh if you know it<br><br>That's it. <span class=\"pause-indicator\"></span> We handle everything else. <span class=\"pause-indicator\"></span> I'll pull the quotes, standardize them so you can compare apples to apples, <span class=\"pause-indicator\"></span> and then walk you through what the market is actually offering.<br><br>What's a good time for a 15-minute call later this week to review what I found?",
      responses: [
        { label: "Thursday works", next: 'close_meeting_scheduled' },
        { label: "Friday works", next: 'close_meeting_scheduled' },
        { label: "Let me check my calendar", next: 'close_meeting' }
      ]
    },
    // ===== STANDARD DISCOVERY TRANSITIONS =====
    ack_confident_handle: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker confident\">positive, respecting tone</span> <span class=\"pause-indicator\"></span> Okay, perfect. So you're on top of it - that's good to hear. <span class=\"pause-indicator\"></span> Let me ask though, roughly how much are you spending monthly on electricity? <span class=\"pause-indicator\"></span> Just want to see if there's any opportunity we might be missing.",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_struggling: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">empathetic, normalizing tone</span> <span class=\"pause-indicator\"></span> Okay, so it's been a challenge - I hear that a lot actually. <span class=\"pause-indicator\"></span> Most companies I talk to are in the same boat. <span class=\"pause-indicator\"></span> Help me understand, roughly how much are you spending monthly?",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_no_idea: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">non-judgmental, reassuring tone</span> <span class=\"pause-indicator\"></span> Fair enough - most people don't, to be honest. <span class=\"pause-indicator\"></span> You're not alone on that one. <span class=\"pause-indicator\"></span> So let me ask, roughly how much are you spending monthly? <span class=\"pause-indicator\"></span> Even a ballpark estimate is fine.",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_vendor_handling: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker curious\">respectful, curious tone</span> <span class=\"pause-indicator\"></span> Okay, so you've got someone handling it— <span class=\"pause-indicator\"></span> is that a broker or an internal team?",
      responses: [
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "Internal team handles it", next: 'situation_discovery' },
        { label: "Not sure exactly", next: 'situation_discovery' }
      ]
    },
    ack_defensive: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker friendly\">honest, disarming tone</span> <span class=\"pause-indicator\"></span> Yeah, totally fair question. <span class=\"pause-indicator\"></span> I'm just trying to understand your situation before I spend your time with something that might not be relevant. <span class=\"pause-indicator\"></span> Most companies I talk to don't have a strategy around this, and it's costing them. <span class=\"pause-indicator\"></span> So I wanted to see if that's even something worth exploring with you. <span class=\"pause-indicator\"></span> Is that fair?",
      responses: [
        { label: "Fair enough, go ahead", next: 'situation_discovery' },
        { label: "I hear you, but what exactly?", next: 'value_proposition' },
        { label: "Now's not a good time", next: 'objection_bad_timing' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "We're not interested", next: 'objection_not_interested' }
      ]
    },
    ack_just_renewed: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> That's actually good—you won't be paying out-of-contract rates. <span class=\"pause-indicator\"></span> That locks in certainty for now.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's what I'd suggest though: <span class=\"pause-indicator\"></span> 6 months before your NEXT renewal, that's when you actually have leverage. <span class=\"pause-indicator\"></span><br><br>Why don't we do this— <span class=\"pause-indicator\"></span> I'll put a calendar reminder for then? <span class=\"pause-indicator\"></span> When that 6-month window hits, I'll run an audit so you know what competitive rates look like when you have negotiating power.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> So when does your current contract expire?",
      responses: [
        { label: "I know the date", next: 'schedule_followup' },
        { label: "Not sure exactly when", next: 'future_opportunity' },
        { label: "We use a broker to handle that", next: 'broker_audit_intro' },
        { label: "Don't want to discuss now", next: 'objection_locked_in' }
      ]
    },
    future_opportunity: {
      stage: 'Discovery - Future Opportunity',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> So here's what I'd suggest - when you're about 6 months out from your next renewal, that's when we start getting competitive quotes. <span class=\"pause-indicator\"></span><br><br>That gives you real leverage because suppliers are competing for your business during off-peak periods. <span class=\"pause-indicator\"></span> Plus, you're not scrambling at the last minute.<br><br>Do you know roughly when your contract expires so we can mark a date to reconnect? <span class=\"pause-indicator\"></span> I can send you a calendar reminder or just reach out when it makes sense.",
      responses: [
        { label: 'Know expiration date', next: 'schedule_followup' },
        { label: 'Not sure, will check', next: 'email_first' },
        { label: "Just contact me when it's time", next: 'followup_scheduled' }
      ]
    },
    value_proposition: {
      stage: 'Value - Explanation',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Sure, happy to explain. <span class=\"pause-indicator\"></span> Most companies I talk to don't have a strategy around electricity renewals - they wait until 60-90 days before contract expiry to start shopping. <span class=\"pause-indicator\"></span><br><br>The problem is that's peak season when suppliers are busy, rates are less negotiable, and you've got limited time. <span class=\"pause-indicator\"></span><br><br>What we do is run what we call a \"broker audit\"— <span class=\"pause-indicator\"></span> we pull quotes from 100+ suppliers and show you what the full market is actually quoting. <span class=\"pause-indicator\"></span> Think of it like getting a second opinion. <span class=\"pause-indicator\"></span> Does that make sense?",
      responses: [
        { label: 'Yes, that makes sense', next: 'broker_audit_close' },
        { label: 'Tell me more about the process', next: 'solution_faq_process' },
        { label: "We use a broker already", next: 'broker_audit_intro' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    // ===== OBJECTION HANDLING (ARC Framework) =====
    objection_bad_timing: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> Makes sense. <span class=\"pause-indicator\"></span> You've got a ton on your plate.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's the thing though—while it's not a priority, rates are actually going UP right now. <span class=\"pause-indicator\"></span> So the longer you wait, the worse the deal you'll get when you renew. <span class=\"pause-indicator\"></span> Shopping 6-12 months early is how you actually get leverage.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> How long until your contract expires? <span class=\"pause-indicator\"></span> Let me just put a note on my side so I can reach out when the timing's right for you.",
      responses: [
        { label: 'I know the date', next: 'schedule_followup' },
        { label: 'Send me information', next: 'email_first' },
        { label: 'Try later today', next: 'schedule_followup' },
        { label: 'Try next week', next: 'schedule_followup' },
        { label: "Just forget it", next: 'respect_decision' }
      ]
    },
    objection_locked_in: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> That's actually good—you won't be paying out-of-contract rates. <span class=\"pause-indicator\"></span> That locks in certainty for now.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's what I'd suggest though: <span class=\"pause-indicator\"></span> 6 months before your NEXT renewal, that's when you actually have leverage. <span class=\"pause-indicator\"></span> Why not let me put a calendar reminder for then? <span class=\"pause-indicator\"></span> When that 6-month window hits, I'll run an audit so you know what competitive rates look like when you have negotiating power.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> So when does your current contract expire?",
      responses: [
        { label: 'I know the date', next: 'schedule_followup' },
        { label: 'Send information for later', next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    // ===== ALTERNATIVE OPENERS =====
    opener_direct_question: {
      stage: 'Opening',
      text: "<span class=\"tone-marker confident\">Direct Question (Second Opinion)</span><br><br>Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> Real quick— <span class=\"pause-indicator\"></span> most {{account.industry}} companies your size are either overpaying on electricity or don't have visibility into what the full market is quoting. <span class=\"pause-indicator\"></span><br><br>Can I ask— <span class=\"pause-indicator\"></span> have you had a second opinion on your current rates lately?",
      responses: [
        { label: "No, we haven't", next: 'broker_audit_reframe' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "What do you mean?", next: 'value_proposition' },
        { label: "We're happy with our rates", next: 'probe_deeper' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    ack_dq_confident: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Cool - that's good to hear. <span class=\"pause-indicator\"></span> So roughly, how much are you spending monthly just so I understand the scope?",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_dq_struggling: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">empathetic tone</span> <span class=\"pause-indicator\"></span> Yeah, I hear that all the time - you're not alone. <span class=\"pause-indicator\"></span> Help me understand though, roughly what are you spending monthly?",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_dq_delegated: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Got it - so you've delegated it. <span class=\"pause-indicator\"></span> That's smart. <span class=\"pause-indicator\"></span> Is that a broker handling it, or an internal team?",
      responses: [
        { label: 'We use a broker', next: 'broker_audit_intro' },
        { label: 'Internal team', next: 'situation_contract_expiry' },
        { label: "Not sure", next: 'situation_monthly_spend' }
      ]
    },
    ack_dq_defensive: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker friendly\">honest, disarming tone</span> <span class=\"pause-indicator\"></span> Yeah, fair question. <span class=\"pause-indicator\"></span> I basically saw that most companies in your industry are overpaying without knowing it. <span class=\"pause-indicator\"></span> Thought it was worth exploring. <span class=\"pause-indicator\"></span> You opposed to a quick conversation?",
      responses: [
        { label: "Fair enough, let's talk", next: 'situation_discovery' },
        { label: "I hear you, but what exactly?", next: 'value_proposition' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    ack_dq_not_interested: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> I totally understand. <span class=\"pause-indicator\"></span> You've got a solution that's working, and changing is risky.<br><br><span class=\"tone-marker curious\">Reframe</span> <span class=\"pause-indicator\"></span> Real quick question though— <span class=\"pause-indicator\"></span> have you had a second opinion on your current rates in the last 12-18 months? <span class=\"pause-indicator\"></span> Because we typically find that companies are overpaying 15-20% just because they haven't seen the full market.<br><br><span class=\"tone-marker confident\">Close</span> <span class=\"pause-indicator\"></span> What if we just ran an audit to see what the market's actually quoting right now? <span class=\"pause-indicator\"></span> No obligation. <span class=\"pause-indicator\"></span> If your current rates are competitive, I'll tell you that. <span class=\"pause-indicator\"></span> If there's a gap, now you know.",
      responses: [
        { label: "That sounds reasonable", next: 'broker_audit_close' },
        { label: 'I know when our contract expires', next: 'schedule_followup' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    ack_dq_just_renewed: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker curious\">curious, informative tone</span> <span class=\"pause-indicator\"></span> Okay, locked in - for how long? <span class=\"pause-indicator\"></span> Just want to know when we should revisit this conversation.",
      responses: [
        { label: "Renewed 3 months ago / locked until 2027+", next: 'future_opportunity' },
        { label: "Just locked in recently", next: 'future_opportunity' },
        { label: "Not sure exactly when", next: 'future_opportunity' },
        { label: "Don't want to discuss now", next: 'objection_locked_in' }
      ]
    },
    opener_transparent: {
      stage: 'Opening',
      text: "<span class=\"tone-marker friendly\">Transparent Opener</span><br><br>Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> I know this is random, but I'm calling about electricity costs. <span class=\"pause-indicator\"></span><br><br>Full transparency— <span class=\"pause-indicator\"></span> this is a sales call. <span class=\"pause-indicator\"></span> I know I'm calling you out of the blue. <span class=\"pause-indicator\"></span> Is now actually a bad time for a quick chat?",
      responses: [
        { label: 'Now is fine / I\'ve got a minute', next: 'opener_transparent_followup' },
        { label: 'What is this about?', next: 'opener_transparent_followup' },
        { label: 'Actually, now is bad', next: 'opener_transparent_bad_time' },
        { label: 'Not interested', next: 'objection_not_interested' }
      ]
    },
    opener_transparent_followup: {
      stage: 'Opening',
      text: "<span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So real talk - most companies I talk to, they don't have a strategy around electricity costs. <span class=\"pause-indicator\"></span> And it's costing them real money. Do you feel like you have a solid handle on your electricity costs?",
      responses: [
        { label: 'Yes, I handle it well', next: 'probe_deeper' },
        { label: "Not really / I'm not sure", next: 'consequence_variant_happy' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: "I don't handle that", next: 'gatekeeper_intro' }
      ]
    },
    opener_transparent_bad_time: {
      stage: 'Opening',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> Totally get it. <span class=\"pause-indicator\"></span> When would be a better time to chat? <span class=\"pause-indicator\"></span> Or would you prefer I just send you some information first?",
      responses: [
        { label: 'Send me information', next: 'email_first' },
        { label: 'Try later today', next: 'schedule_followup' },
        { label: 'Just forget it', next: 'respect_decision' }
      ]
    },
    opener_social_proof: {
      stage: 'Opening',
      text: "<span class=\"tone-marker confident\">Market Data Opener</span><br><br>Hey {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> I'm calling because we just ran analysis on {{account.industry}} companies in the Texas market, <span class=\"pause-indicator\"></span> and we're seeing that most are paying 15-20% more than market rates. <span class=\"pause-indicator\"></span><br><br>Wanted to see if {{account.name}} is experiencing something similar?",
      responses: [
        { label: 'Yes, costs have been going up', next: 'consequence_variant_rates' },
        { label: "Not really an issue", next: 'opener_social_proof_skeptical' },
        { label: "We use a broker", next: 'broker_audit_intro' },
        { label: 'Tell me more', next: 'broker_audit_reframe' },
        { label: 'Not interested', next: 'objection_not_interested' }
      ]
    },
    opener_social_proof_skeptical: {
      stage: 'Opening',
      text: "<span class=\"tone-marker curious\">curious tone</span> I totally get that, you know? <span class=\"pause-indicator\"></span> So let me ask you this though - are you aware of how much electricity rates have gone up in the last 4 years? <span class=\"pause-indicator\"></span> Like, the market has moved a LOT—mostly because data centers and AI are using crazy amounts of power.",
      responses: [
        { label: 'I\'ve heard about rate increases', next: 'market_context' },
        { label: 'Not really aware', next: 'market_context' },
        { label: 'Still not interested', next: 'objection_not_interested' }
      ]
    },
    opener_quick_check: {
      stage: 'Opening',
      text: "<span class=\"tone-marker confident\">Audit Positioning Opener</span><br><br>Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> What we do is run what we call broker audits— <span class=\"pause-indicator\"></span> basically a market check on your current energy rates. <span class=\"pause-indicator\"></span><br><br>We pull quotes from 100+ suppliers and show you what you're actually paying vs. market. <span class=\"pause-indicator\"></span><br><br>Have you ever had something like that run before?",
      responses: [
        { label: "No, never heard of that", next: 'broker_audit_reframe' },
        { label: "What exactly is that?", next: 'broker_audit_reframe' },
        { label: "We use a broker already", next: 'broker_audit_intro' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    situation_discovery: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> So help me understand - roughly how much are you spending monthly on electricity?",
      responses: [] // Special handling - will render input field in render() function
    },
    situation_monthly_spend: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Okay, that helps. <span class=\"pause-indicator\"></span> So let me calculate this real quick - if you're spending roughly {{monthly_spend}} monthly, that's about {{annual_spend}} annually. <span class=\"pause-indicator\"></span> With the way rates are moving and most companies overpaying by 20-30% on renewal, we could be talking {{potential_savings}} annually in potential savings. <span class=\"pause-indicator\"></span><br><br>Does that kind of impact matter to you?",
      responses: [
        { label: 'Yes, that matters', next: 'situation_rate_check' },
        { label: "That's too much to estimate", next: 'situation_rate_check' },
        { label: "Not really a priority", next: 'objection_not_priority' }
      ]
    },
    situation_rate_check: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Fair. <span class=\"pause-indicator\"></span> So do you know roughly what rate you're paying per kWh right now?",
      responses: [
        { label: 'Know the rate (X.X cents/kWh)', next: 'situation_decision_committee' },
        { label: "Don't know it", next: 'situation_decision_committee' }
      ]
    },
    situation_decision_committee: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> So before we go deeper - is this just you, or do other people need to be involved in electricity decisions? <span class=\"pause-indicator\"></span> Like your CFO or finance team?",
      responses: [
        { label: 'Just me', next: 'situation_supplier_name' },
        { label: 'CFO / Finance team involved', next: 'situation_team_decision' },
        { label: 'Multiple people involved', next: 'situation_team_decision' }
      ]
    },
    situation_team_decision: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Smart. <span class=\"pause-indicator\"></span> Should we loop them in on this conversation, or do you want to review first and then bring them in later?",
      responses: [
        { label: 'Let\'s loop them in now', next: 'situation_supplier_name' },
        { label: 'I\'ll review first', next: 'situation_supplier_name' },
        { label: 'We\'ll include them when ready', next: 'situation_supplier_name' }
      ]
    },
    situation_supplier_name: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> And who is your current electricity supplier?",
      responses: [
        { label: 'Named a supplier', next: 'situation_contract_expiry' },
        { label: "Not sure / Don't remember", next: 'situation_contract_expiry' }
      ]
    },
    situation_contract_expiry: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker curious\">curious tone</span> And do you happen to know when your contract expires? <span class=\"pause-indicator\"></span> Just helps me understand the timing for when we'd want to lock in competitive rates, you know?",
      responses: [
        { label: 'Within 3 months - HOT', next: 'situation_decision_process_urgent' },
        { label: '3-6 months out', next: 'problem_discovery' },
        { label: '6-12 months out', next: 'problem_discovery' },
        { label: 'Not sure / Don\'t know', next: 'problem_discovery' },
        { label: 'Just renewed recently', next: 'problem_discovery' }
      ]
    },
    situation_decision_process_urgent: {
      stage: 'Discovery - Situation',
      text: "<span class=\"tone-marker concerned\">concerned tone</span> That's really tight timing, you know? <span class=\"pause-indicator\"></span> But actually, that's perfect because we can help you lock in competitive rates NOW before the market moves.<br><br>So who else needs to be involved in the decision besides you?",
      responses: [
        { label: 'Just me / I decide', next: 'problem_discovery' },
        { label: 'Involves CFO / Finance', next: 'problem_discovery' },
        { label: 'Multiple stakeholders', next: 'problem_discovery' }
      ]
    },
    market_context: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker concerned\">concerned tone</span> That's perfect timing actually. <span class=\"pause-indicator\"></span> So here's something most people don't realize - electricity prices have doubled in the last 4 years because of data centers and AI. <span class=\"pause-indicator\"></span><br><br>So when you renew, you're shopping into that market, right? <span class=\"pause-indicator\"></span> What would it cost {{account.name}} if your rates go up another 15-20%?",
      responses: [
        { label: 'That would hurt our budget', next: 'consequence_variant_rates' },
        { label: "Not sure about the impact", next: 'consequence_variant_rates' },
        { label: "We're fine with current setup", next: 'objection_happy_supplier' }
      ]
    },
    problem_discovery: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker curious\">Curious, empathetic tone</span> <span class=\"pause-indicator\"></span> Okay, that's helpful. <span class=\"pause-indicator\"></span> So I'm curious - when it comes to electricity, what's been causing you the most stress? <span class=\"pause-indicator\"></span> Or is it even on your radar?",
      responses: [
        { label: 'Costs are too high', next: 'probe_problem_costs' },
        { label: 'Complexity / too many options', next: 'probe_problem_complexity' },
        { label: 'Budget uncertainty', next: 'probe_problem_budget' },
        { label: "We're happy / no problems", next: 'consequence_variant_happy' },
        { label: "We're locked in / just renewed", next: 'consequence_variant_lockedin' },
        { label: "Tried before / was a nightmare", next: 'consequence_variant_triedbefore' }
      ]
    },
    probe_problem_costs: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Tell me more about that... <span class=\"pause-indicator\"></span> When did you first notice the costs going up? <span class=\"pause-indicator\"></span> Like, was it recent or has it been going on for a while? <span class=\"pause-indicator\"></span> And how has that impacted your ability to plan your budget? <span class=\"pause-indicator\"></span> Has leadership noticed this too?",
      responses: [
        { label: 'Recent increase, significant budget impact', next: 'consequence_variant_rates' },
        { label: 'Ongoing issue, some impact on planning', next: 'consequence_variant_rates' },
        { label: 'Long-term problem, leadership is aware', next: 'consequence_variant_rates' }
      ]
    },
    probe_problem_complexity: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> I hear that a lot, you know? <span class=\"pause-indicator\"></span> So what specifically makes it complex for you? <span class=\"pause-indicator\"></span> Is it comparing all the options, or is it more about understanding the contracts?",
      responses: [
        { label: 'Too many options to compare', next: 'consequence_variant_complicated' },
        { label: 'Contracts are confusing', next: 'consequence_variant_complicated' },
        { label: 'Don\'t have time to research', next: 'consequence_variant_notime' }
      ]
    },
    probe_problem_budget: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Budget uncertainty is a real pain point, I know. <span class=\"pause-indicator\"></span> How long has that been an issue for you? <span class=\"pause-indicator\"></span> And what impact does that actually have on your planning?",
      responses: [
        { label: 'Makes planning difficult', next: 'consequence_variant_notime' },
        { label: 'Can\'t predict costs', next: 'consequence_variant_notime' },
        { label: 'Leadership wants more certainty', next: 'consequence_variant_notime' }
      ]
    },
    probe_problem_generic: {
      stage: 'Discovery - Problem',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Tell me more about what's challenging for you... <span class=\"pause-indicator\"></span> Is it the cost, the complexity, or something else?",
      responses: [
        { label: 'Cost is the issue', next: 'probe_problem_costs' },
        { label: 'Complexity is the issue', next: 'probe_problem_complexity' },
        { label: 'Budget uncertainty', next: 'probe_problem_budget' }
      ]
    },
    consequence_discovery: {
      stage: 'Discovery - Consequence (2-Layer)',
      text: "<span class=\"tone-marker serious\">pause, then real tone</span> <span class=\"pause-indicator\"></span> Look - most companies wait until 90 days before renewal to shop. <span class=\"pause-indicator\"></span> That's a bad play. <span class=\"pause-indicator\"></span> Rates have typically gone up, and suppliers know you don't have much time before your contract expires, so they'll give you a higher quote. <span class=\"pause-indicator\"></span><br><br>It's almost like booking a plane ticket <span class=\"pause-indicator\"></span> - when you go on a flight, do you reserve that flight months in advance or the week before? <span class=\"pause-indicator\"></span><br><br>Exactly. <span class=\"pause-indicator\"></span> The more seats available on the plane, the cheaper the ticket. <span class=\"pause-indicator\"></span><br><br>Electricity works the same way but on a massive scale. <span class=\"pause-indicator\"></span> The earlier you reserve your price, the more supply is actually available. <span class=\"pause-indicator\"></span> And with electricity prices rising right now, that gap is huge - we're seeing companies forced to pay 30%, 50%, sometimes 100% more. <span class=\"pause-indicator\"></span><br><br>Companies are being forced to pay that premium just because of timing. <span class=\"pause-indicator\"></span><br><br>What do you think?",
      responses: [
        { label: 'That would be significant / $20K-$40K', next: 'solution_variant_rates' },
        { label: "We always shop the market", next: 'probe_timing_strategy' },
        { label: "We're locked in another year", next: 'schedule_future_planning' },
        { label: 'Seems expensive / complicated', next: 'value_justification' }
      ]
    },
    consequence_variant_rates: {
      stage: 'Discovery - Consequence (Rates)',
      text: "<span class=\"tone-marker serious\">pause, then real tone</span> <span class=\"pause-indicator\"></span> Look - most {{account.industry}} companies wait until 90 days before renewal to shop. <span class=\"pause-indicator\"></span> That's a bad play. Rates have typically gone up, and suppliers know you don't have much time before your contract expires, so they'll give you a higher quote. <span class=\"pause-indicator\"></span><br><br>It's almost like booking a plane ticket <span class=\"pause-indicator\"></span> - when you go on a flight, do you reserve that flight months in advance or the week before? <span class=\"pause-indicator\"></span><br><br>Exactly. The more seats available on the plane, the cheaper the ticket. <span class=\"pause-indicator\"></span><br><br>Electricity works the same way but on a massive scale. <span class=\"pause-indicator\"></span> The earlier you reserve your price, the more supply is actually available. And with electricity prices rising right now, that gap is huge - we're seeing {{account.industry}} companies forced to pay 30%, 50%, sometimes 100% more. <span class=\"pause-indicator\"></span><br><br>Companies are being forced to pay that premium just because of timing. <span class=\"pause-indicator\"></span><br><br>What do you think, {{contact.first_name}}?",
      responses: [
        { label: "That's probably $20K-$40K", next: 'solution_variant_rates' },
        { label: "Could be $50K+ a year", next: 'solution_variant_rates' },
        { label: "Not sure but significant", next: 'solution_variant_rates' },
        { label: "We always shop the market", next: 'probe_timing_strategy' },
        { label: "We're locked in another year", next: 'schedule_future_planning' }
      ]
    },
    consequence_variant_complicated: {
      stage: 'Discovery - Consequence (Complexity)',
      text: "<span class=\"tone-marker confident\">real talk tone</span> <span class=\"pause-indicator\"></span> Real talk - suppliers make this confusing on purpose. <span class=\"pause-indicator\"></span> They know you won't spend 2 hours comparing quotes. So you pick whoever sounds most professional or calls the most. <span class=\"pause-indicator\"></span><br><br>But that confusion? <span class=\"pause-indicator\"></span> It's costing you. You're paying 20-30% more than market rate just because you can't see the gap. <span class=\"pause-indicator\"></span><br><br>Over the next 3 years, what's your guess on what that confusion costs you?",
      responses: [
        { label: 'Could be $30K-$50K over 3 years', next: 'solution_variant_complicated' },
        { label: 'Not sure, but definitely something', next: 'solution_variant_complicated' },
        { label: 'Seems high', next: 'value_justification' },
        { label: "We're locked in another year", next: 'schedule_future_planning' }
      ]
    },
    consequence_variant_notime: {
      stage: 'Discovery - Consequence (Time/Priority)',
      text: "<span class=\"tone-marker serious\">serious tone</span> <span class=\"pause-indicator\"></span> Here's the reality though - while you're handling everything else, your electricity costs are going up 15-20% in the background. <span class=\"pause-indicator\"></span> And because nobody's shopping, you're locked into rates 20-30% higher than what new customers pay. <span class=\"pause-indicator\"></span><br><br>So the consequence of not dealing with it now? <span class=\"pause-indicator\"></span> When renewal comes up in a couple years, it's a crisis. No leverage. Stuck. <span class=\"pause-indicator\"></span><br><br>What would you guess - is that costing you 25-30% more a year than you should?",
      responses: [
        { label: 'That would be $30K-$50K', next: 'solution_variant_notime' },
        { label: "That's significant cost", next: 'solution_variant_notime' },
        { label: 'More than I thought', next: 'solution_variant_notime' },
        { label: "We're locked in another year", next: 'schedule_future_planning' }
      ]
    },
    consequence_variant_happy: {
      stage: 'Discovery - Consequence (Hidden Cost)',
      text: "<span class=\"tone-marker curious\">curious but straight tone</span> <span class=\"pause-indicator\"></span> I get that you're happy. But here's the thing - are you happy because it's a solid deal, or just because you don't know what else is out there? <span class=\"pause-indicator\"></span><br><br>Real quick - when a NEW company comes to your supplier, they get quoted 20-30% lower than you do. <span class=\"pause-indicator\"></span><br><br>So you might be overpaying 20-30% annually without even knowing it. <span class=\"pause-indicator\"></span> Just no frame of reference. <span class=\"pause-indicator\"></span> Does that track?",
      responses: [
        { label: 'That could be $15K-$25K', next: 'solution_variant_happy' },
        { label: 'That seems high but possible', next: 'solution_variant_happy' },
        { label: 'I should check our rates', next: 'solution_variant_happy' },
        { label: "We're locked in another year", next: 'schedule_future_planning' }
      ]
    },
    consequence_variant_lockedin: {
      stage: 'Discovery - Consequence (Future Planning)',
      text: "<span class=\"tone-marker understanding\">understanding, not pushy</span> <span class=\"pause-indicator\"></span> I get it - you're locked in, so this isn't urgent right now. That's fair. <span class=\"pause-indicator\"></span><br><br>But real talk - when you locked in, did you actually shop around or just renew with who you had? <span class=\"pause-indicator\"></span><br><br>If you just renewed without shopping, you're probably paying rates that were locked in during peak season. <span class=\"pause-indicator\"></span> Could be $50K-$100K overpaid over the next few years. <span class=\"pause-indicator\"></span><br><br>Not asking you to do anything now. Just want you to think about approaching it differently next time renewal comes up. <span class=\"pause-indicator\"></span> Make sense?",
      responses: [
        { label: "That makes sense - reach out in 6 months", next: 'future_opportunity' },
        { label: "Yeah, I want to avoid that", next: 'solution_variant_lockedin' },
        { label: "Not really concerned right now", next: 'respect_decision' }
      ]
    },
    consequence_variant_triedbefore: {
      stage: 'Discovery - Consequence (Try Again)',
      text: "<span class=\"tone-marker understanding\">validating but forward-looking</span> <span class=\"pause-indicator\"></span> Yeah, I hear that. Most companies have tried and it wasn't worth it. <span class=\"pause-indicator\"></span><br><br>Here's why - every supplier quotes different. You can't compare. So you get frustrated, give up, and they win. You stay locked in at higher rates for 3 more years. <span class=\"pause-indicator\"></span><br><br>That probably cost you $30K-$60K. <span class=\"pause-indicator\"></span><br><br>The good news? <span class=\"pause-indicator\"></span> We run 100+ suppliers through a structured process. Standardized quotes, easy to compare. You don't have to figure it out yourself. <span class=\"pause-indicator\"></span> That better than trying on your own again?",
      responses: [
        { label: "That sounds like what happened to us", next: 'solution_variant_triedbefore' },
        { label: "Would be worth doing it right", next: 'solution_variant_triedbefore' },
        { label: "Still skeptical", next: 'value_justification' }
      ]
    },
    probe_timing_strategy: {
      stage: 'Discovery - Consequence',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> That's great, actually. <span class=\"pause-indicator\"></span> So you already get how important timing is. <span class=\"pause-indicator\"></span><br><br>So I gotta ask - when do you typically START shopping? <span class=\"pause-indicator\"></span> Like 90 days out? <span class=\"pause-indicator\"></span> Or are you thinking 6 months ahead?<br><br>Because what I'm seeing with the companies getting the best rates - they're shopping 6-12 months out. <span class=\"pause-indicator\"></span> And here's the key - they're not just comparing their current supplier's renewal offer, you know? They're getting quotes from 5-6 different competitors. That creates real pricing pressure. <span class=\"pause-indicator\"></span> You're making them compete.<br><br>So is that what you're doing, or do you think there's room to optimize that timing?",
      responses: [
        { label: 'We shop 6+ months ahead', next: 'solution_variant_rates' },
        { label: 'We shop 90 days out', next: 'solution_variant_rates' },
        { label: 'Not sure when we shop', next: 'solution_variant_rates' }
      ]
    },
    schedule_future_planning: {
      stage: 'Discovery - Consequence',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So we actually have TIME to do this right, you know? <span class=\"pause-indicator\"></span><br><br>Here's what I usually do with companies in your situation... <span class=\"pause-indicator\"></span> About 6 months before your contract expires, we start getting market quotes. That gives us real leverage, right? And we're not scrambling at the last minute.<br><br>Plus, we can check if your current supplier will give you early renewal incentives to lock you in now. <span class=\"pause-indicator\"></span> Sometimes that actually works out really well for you.<br><br>So when does your contract actually expire? <span class=\"pause-indicator\"></span> Let's get that date, and then mark 6 months before on the calendar. That's when we start this process.",
      responses: [
        { label: 'I know the expiration date', next: 'followup_scheduled' },
        { label: 'Not sure of exact date', next: 'solution_variant_lockedin' },
        { label: 'Let me check and get back to you', next: 'email_first' }
      ]
    },
    value_justification: {
      stage: 'Discovery - Consequence',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> <span class=\"pause-indicator\"></span> I totally get that, you know? <span class=\"pause-indicator\"></span> And honestly, here's why I think this is worth looking at...<br><br>Most companies THINK they're handling this well because they renew on time. <span class=\"pause-indicator\"></span> Here's what I've found though - they're still overpaying because of the timing piece. <span class=\"pause-indicator\"></span> It adds up.<br><br>So it's not about what you're paying NOW, right? <span class=\"pause-indicator\"></span> It's about what you COULD be paying if we planned this out properly. <span class=\"pause-indicator\"></span><br><br>We're talking $30K-$50K over 3 years. <span class=\"pause-indicator\"></span> That's not an expense - that's money you could be keeping. That's savings.<br><br>Would it be worth 15 minutes to see what that gap actually looks like for {{account.name}}? <span class=\"pause-indicator\"></span> No pressure, just so you know what's possible. Make sense?",
      responses: [
        { label: 'Yes, let\'s see the gap', next: 'close_meeting' },
        { label: 'Send me something first', next: 'email_first' },
        { label: 'Not interested', next: 'respect_decision' }
      ]
    },
    solution_variant_rates: {
      stage: 'Discovery - Solution (Rates)',
      text: "<span class=\"tone-marker confident\">direct, action-oriented tone</span> <span class=\"pause-indicator\"></span> Okay, so we've talked about the timing piece. <span class=\"pause-indicator\"></span> Here's what we do different. <span class=\"pause-indicator\"></span><br><br>We don't wait for your renewal deadline. <span class=\"pause-indicator\"></span> We actually START early - like 6 months before your contract ends. <span class=\"pause-indicator\"></span> Why? Suppliers give their BEST rates during off-peak seasons, not during crunch time when they're slammed. <span class=\"pause-indicator\"></span><br><br>We pull quotes from 100+ suppliers in that window when prices are actually competitive. <span class=\"pause-indicator\"></span> Then you lock in early before rates go higher. <span class=\"pause-indicator\"></span><br><br>That timing advantage alone is typically worth 15-25% savings compared to waiting till 90 days before. <span class=\"pause-indicator\"></span><br><br>Does getting ahead of rate increases matter to you?",
      responses: [
        { label: "Yeah, that matters", next: 'close_variant_rates' },
        { label: "How does your process actually work?", next: 'solution_faq_process' },
        { label: "Need to think about it", next: 'email_first' },
        { label: "Not interested right now", next: 'respect_decision' }
      ]
    },
    solution_variant_complicated: {
      stage: 'Discovery - Solution (Simplify)',
      text: "<span class=\"tone-marker confident\">confident, clarifying tone</span> <span class=\"pause-indicator\"></span> So we heard you on the confusion piece - that's actually why we do this. <span class=\"pause-indicator\"></span><br><br>What we do is pull quotes from multiple suppliers BUT we standardize them. <span class=\"pause-indicator\"></span> Same format, same terms, same fields. <span class=\"pause-indicator\"></span> So you're actually comparing apples to apples. <span class=\"pause-indicator\"></span><br><br>We send you like 3-5 options side by side where it's OBVIOUS which one's the best deal for what you need. <span class=\"pause-indicator\"></span> No decoding. No guessing. <span class=\"pause-indicator\"></span><br><br>You literally just look at three options and pick one. <span class=\"pause-indicator\"></span> That's your job. <span class=\"pause-indicator\"></span><br><br>Think that's easier than trying to figure it out yourself?",
      responses: [
        { label: "Yeah, that's way easier", next: 'close_variant_complicated' },
        { label: "How does your process actually work?", next: 'solution_faq_process' },
        { label: "Seems too good to be true", next: 'value_justification' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    solution_variant_notime: {
      stage: 'Discovery - Solution (Done For You)',
      text: "<span class=\"tone-marker understanding\">understanding, solution-focused tone</span> <span class=\"pause-indicator\"></span> Here's the good news - you don't have to make this a priority. <span class=\"pause-indicator\"></span> We do. <span class=\"pause-indicator\"></span><br><br>We handle the whole shopping process. <span class=\"pause-indicator\"></span> We pull quotes, we compare, we negotiate with suppliers, we manage the paperwork. <span class=\"pause-indicator\"></span> Everything. <span class=\"pause-indicator\"></span><br><br>Your part? <span class=\"pause-indicator\"></span> Literally just review 3-5 options and say yes to one of them. <span class=\"pause-indicator\"></span> That's 15 minutes of your time, not months of back and forth. <span class=\"pause-indicator\"></span><br><br>And by doing it NOW instead of later, you actually avoid the crisis situation when your renewal's in 90 days and rates are already up again. <span class=\"pause-indicator\"></span><br><br>Worth 15 minutes to avoid that headache?",
      responses: [
        { label: "Yeah, that's worth it", next: 'close_variant_notime' },
        { label: "How much time are we talking?", next: 'solution_faq_timeline' },
        { label: "Need to think about it", next: 'email_first' },
        { label: "Still too busy right now", next: 'respect_decision' }
      ]
    },
    solution_variant_happy: {
      stage: 'Discovery - Solution (Reality Check)',
      text: "<span class=\"tone-marker curious\">respectful, curious tone</span> <span class=\"pause-indicator\"></span> Look, I'm not here to convince you there's a problem if there isn't one. <span class=\"pause-indicator\"></span><br><br>But here's what I'd suggest - let us do a quick rate analysis. <span class=\"pause-indicator\"></span> We pull what you're currently paying versus what the market's actually quoting right now. <span class=\"pause-indicator\"></span><br><br>If you're genuinely getting a good deal, you'll KNOW it because you've seen the alternatives. <span class=\"pause-indicator\"></span> If there IS a gap, now you can do something about it. <span class=\"pause-indicator\"></span><br><br>Either way, you're not guessing anymore. <span class=\"pause-indicator\"></span> You've got real data. <span class=\"pause-indicator\"></span><br><br>Worth 15 minutes to actually KNOW where you stand?",
      responses: [
        { label: "Yeah, let's run the analysis", next: 'close_variant_happy' },
        { label: "What would that analysis include?", next: 'solution_faq_process' },
        { label: "I'm skeptical but curious", next: 'close_variant_happy' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    solution_variant_lockedin: {
      stage: 'Discovery - Solution (Future Proofing)',
      text: "<span class=\"tone-marker confident\">patient, strategic tone</span> <span class=\"pause-indicator\"></span> I hear you - you're locked in and that's fine. <span class=\"pause-indicator\"></span> This isn't about NOW. <span class=\"pause-indicator\"></span><br><br>But here's what smart companies do - mark your calendar for 6 months BEFORE your next renewal. <span class=\"pause-indicator\"></span> We start pulling quotes early when you actually have leverage. <span class=\"pause-indicator\"></span><br><br>That way you're not scrambling when renewal hits. <span class=\"pause-indicator\"></span> You already know what competitive rates look like. <span class=\"pause-indicator\"></span> You've got options queued up. <span class=\"pause-indicator\"></span><br><br>We literally just put it on the calendar now. <span class=\"pause-indicator\"></span> No urgency, no pressure. <span class=\"pause-indicator\"></span><br><br>So when does your contract actually expire?",
      responses: [
        { label: "I know the date - [date]", next: 'close_variant_lockedin' },
        { label: "Not sure, I'll check", next: 'email_first' },
        { label: "Sounds good, reach out in 6 months", next: 'close_variant_lockedin' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    solution_variant_triedbefore: {
      stage: 'Discovery - Solution (Do It Right)',
      text: "<span class=\"tone-marker confident\">empowering, different tone</span> <span class=\"pause-indicator\"></span> Okay, so here's where it's different this time. <span class=\"pause-indicator\"></span><br><br>Last time you probably reached out to random suppliers who each quote differently. <span class=\"pause-indicator\"></span> That's where it falls apart. <span class=\"pause-indicator\"></span> We coordinate across 100+ suppliers SIMULTANEOUSLY and standardize the quotes. <span class=\"pause-indicator\"></span><br><br>That's not DIY shopping anymore. <span class=\"pause-indicator\"></span> That's structured, competitive event. <span class=\"pause-indicator\"></span> Suppliers know they're competing, so they actually quote you REAL rates, not inflated stuff. <span class=\"pause-indicator\"></span><br><br>It's not a nightmare because we've eliminated the chaos. <span class=\"pause-indicator\"></span><br><br>Would it be worth trying again if we took out all the nightmare parts?",
      responses: [
        { label: "Yeah, let's try it right", next: 'close_variant_triedbefore' },
        { label: "How is this different from last time?", next: 'solution_faq_process' },
        { label: "Still skeptical", next: 'value_justification' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    solution_discovery: {
      stage: 'Discovery - Solution',
      text: "<span class=\"tone-marker hopeful\">hopeful tone</span> <span class=\"pause-indicator\"></span> Okay, that's significant. <span class=\"pause-indicator\"></span> So if we could solve this, what would matter most to you? <span class=\"pause-indicator\"></span><br><br>Like, is it competitive rates, budget certainty, or someone handling the complexity for you?",
      responses: [
        { label: 'Access to competitive rates', next: 'trial_close_1' },
        { label: 'Budget certainty', next: 'trial_close_1' },
        { label: 'Handle the complexity', next: 'trial_close_1' },
        { label: 'All of the above', next: 'trial_close_1' }
      ]
    },
    trial_close_1: {
      stage: 'Closing - Trial Close',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So if I'm hearing you right, the real issue is [reference their specific pain - high costs / complexity / budget uncertainty]. <span class=\"pause-indicator\"></span> And if there was a way to solve that by locking in competitive rates before market prices go up <span class=\"pause-indicator\"></span> that would be worth exploring, right?",
      responses: [
        { label: 'Yes, that would be worth exploring', next: 'trial_close_2' },
        { label: 'Maybe / I need to think', next: 'trial_close_hesitation' },
        { label: "Not really", next: 'objection_not_priority' }
      ]
    },
    trial_close_2: {
      stage: 'Closing - Confirm Value',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Great. <span class=\"pause-indicator\"></span> And the reason that matters is because if we don't act soon <span class=\"pause-indicator\"></span> [reference consequence they mentioned - rate increases / renewal risk / budget impact]. <span class=\"pause-indicator\"></span> That sound right?",
      responses: [
        { label: 'Yes, that\'s correct', next: 'close_meeting' },
        { label: 'Partially / Sort of', next: 'close_meeting' },
        { label: "Not sure", next: 'close_meeting' }
      ]
    },
    trial_close_hesitation: {
      stage: 'Closing - Handle Hesitation',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> <span class=\"pause-indicator\"></span> Totally fair, you know? <span class=\"pause-indicator\"></span> So what would you want me to have prepared so you can make a good decision? <span class=\"pause-indicator\"></span> Is it market rate comparison? <span class=\"pause-indicator\"></span> How our process works? <span class=\"pause-indicator\"></span> Or is it more about understanding what rates are actually available right now before the market moves?",
      responses: [
        { label: 'Market rate comparison', next: 'email_first' },
        { label: 'How your process works', next: 'email_first' },
        { label: 'See what rates are available now', next: 'close_meeting' }
      ]
    },
    close_variant_rates: {
      stage: 'Closing (Rates)',
      text: "<span class=\"tone-marker confident\">Alternative Choice Close</span><br><br>\"So I can either:<br><br><strong>OPTION 1:</strong> <span class=\"pause-indicator\"></span> Run the audit right now, have it done by Thursday, and we jump on a call Friday morning to review it.<br><br><strong>OPTION 2:</strong> <span class=\"pause-indicator\"></span> Or if you want to think about it first, I can send you the audit overview and we can reconnect next week to dig into the details.<br><br>Which would work better for you?\"<br><br><em>Either option = forward progress. No \"no\" available.</em>",
      responses: [
        { label: 'Option 1 - Audit now, call Friday', next: 'close_step4_calendar' },
        { label: 'Option 2 - Think about it first', next: 'close_step4_calendar' },
        { label: 'I need to check with my team first', next: 'objection_need_to_check' },
        { label: 'Let me think about it', next: 'close_think_about_it' },
        { label: 'Send me something first', next: 'objection_send_something' }
      ]
    },
    close_variant_complicated: {
      stage: 'Closing (Simplify)',
      text: "<span class=\"tone-marker confident\">confident, demystifying tone</span> <span class=\"pause-indicator\"></span> So what I'm going to do is pull quotes from our network - and I mean I'll standardize them so you see them all in the same format. <span class=\"pause-indicator\"></span> Same columns, same terms, same everything. <span class=\"pause-indicator\"></span><br><br>Then I'll show you like 3-5 options side by side. <span class=\"pause-indicator\"></span> You just look at them and pick which one looks best for you. <span class=\"pause-indicator\"></span><br><br>That's literally it. <span class=\"pause-indicator\"></span> No confusion, no comparing apples to oranges. <span class=\"pause-indicator\"></span><br><br>We could do a quick 15-minute video walkthrough right now where I show you exactly what that looks like. <span class=\"pause-indicator\"></span> Then you'll KNOW what you're getting into. <span class=\"pause-indicator\"></span> Or we can set up a call Thursday. <span class=\"pause-indicator\"></span><br><br>What works better - video walkthrough now or Thursday afternoon call?",
      responses: [
        { label: 'Video walkthrough now', next: 'video_walkthrough' },
        { label: 'Thursday 2 PM works', next: 'close_meeting_scheduled' },
        { label: 'Thursday afternoon works', next: 'close_meeting_scheduled' },
        { label: 'What if I don\'t like any of them?', next: 'close_meeting_scheduled' },
        { label: 'I don\'t want to waste your time', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_variant_notime: {
      stage: 'Closing (Done For You)',
      text: "<span class=\"tone-marker confident\">efficient, action-focused tone</span> <span class=\"pause-indicator\"></span> Here's what we do - we handle all of this. <span class=\"pause-indicator\"></span> You literally just review the options and pick one. <span class=\"pause-indicator\"></span><br><br>So here's the plan. <span class=\"pause-indicator\"></span> We could do a quick 15-minute video walkthrough right now where I show you exactly how the process works - then you'll KNOW what we're handling for you. <span class=\"pause-indicator\"></span> Or I'll pull quotes from our network - takes us 3-4 days. <span class=\"pause-indicator\"></span> Then I'll call you back with like 3 options I think are best for you. <span class=\"pause-indicator\"></span><br><br>That's your whole job. <span class=\"pause-indicator\"></span> 30 minutes, and you've got competitive quotes locked in while you focus on your actual business. <span class=\"pause-indicator\"></span><br><br>What works better - video walkthrough now or book Friday at 2 PM for me to show you those options?",
      responses: [
        { label: 'Video walkthrough now', next: 'video_walkthrough' },
        { label: 'Friday works', next: 'close_meeting_scheduled' },
        { label: 'Thursday works', next: 'close_meeting_scheduled' },
        { label: 'I need to talk to my finance team first', next: 'close_meeting_team_involved' },
        { label: 'Can you just send me options?', next: 'close_meeting_send_options' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_variant_happy: {
      stage: 'Closing (Reality Check)',
      text: "<span class=\"tone-marker understanding\">Soft/Collaborative Close</span><br><br>\"So it sounds like this is definitely worth exploring. <span class=\"pause-indicator\"></span><br><br>Before we end the call, <span class=\"pause-indicator\"></span> what would be most helpful for you at this point? <span class=\"pause-indicator\"></span><br><br>Do you want to schedule time to review the audit findings, <span class=\"pause-indicator\"></span> or would you rather I send something over first?\"<br><br><em>(Listen - they'll tell you the path. Puts them in control, removes pressure.)</em>",
      responses: [
        { label: 'Schedule time to review', next: 'close_step4_calendar' },
        { label: 'Send something first', next: 'objection_send_something' },
        { label: 'What would you recommend?', next: 'close_step3_assumptive' },
        { label: 'What\'s this going to cost me?', next: 'objection_commission' },
        { label: 'I need to think about it', next: 'close_think_about_it' }
      ]
    },
    close_variant_lockedin: {
      stage: 'Closing (Future Proofing)',
      text: "<span class=\"tone-marker confident\">patient, strategic tone</span> <span class=\"pause-indicator\"></span> I get it - you just renewed and you're not looking to do anything now. <span class=\"pause-indicator\"></span> That's fine. <span class=\"pause-indicator\"></span><br><br>But here's what I'm thinking. <span class=\"pause-indicator\"></span> Let's mark your calendar for 6 months BEFORE your next renewal. <span class=\"pause-indicator\"></span> That's when you actually have leverage with suppliers. <span class=\"pause-indicator\"></span><br><br>So what date is your contract up? <span class=\"pause-indicator\"></span> Let me just put a note on our side too so when that 6-month mark hits, I reach out and we start pulling quotes when you're in the best negotiating position. <span class=\"pause-indicator\"></span><br><br>When does your contract expire?",
      responses: [
        { label: 'I know the date - [date]', next: 'future_opportunity_marked' },
        { label: 'That seems far away', next: 'future_opportunity_marked' },
        { label: 'Just call me when it gets closer', next: 'future_opportunity_marked' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_variant_triedbefore: {
      stage: 'Closing (Redemption)',
      text: "<span class=\"tone-marker confident\">empowering, redemption tone</span> <span class=\"pause-indicator\"></span> So here's the deal - last time you probably reached out to a bunch of suppliers individually and they all quoted different. <span class=\"pause-indicator\"></span> We're different. <span class=\"pause-indicator\"></span><br><br>We pull 100+ suppliers at ONCE. <span class=\"pause-indicator\"></span> They all know they're competing so they quote real rates. <span class=\"pause-indicator\"></span> We standardize everything so you can actually compare. <span class=\"pause-indicator\"></span><br><br>It's not a nightmare because we eliminate the chaos. <span class=\"pause-indicator\"></span><br><br>We could do a quick 15-minute video walkthrough right now where I show you exactly how the process works this time. <span class=\"pause-indicator\"></span> You'll see it's way different. <span class=\"pause-indicator\"></span> Or we can set up a call Thursday. <span class=\"pause-indicator\"></span><br><br>What works better - video walkthrough now or Thursday 2 PM call?",
      responses: [
        { label: 'Video walkthrough now', next: 'video_walkthrough' },
        { label: 'Thursday 2 PM works', next: 'close_meeting_scheduled' },
        { label: 'Thursday works', next: 'close_meeting_scheduled' },
        { label: 'But last time it still didn\'t work out', next: 'close_meeting_scheduled' },
        { label: 'I\'m still skeptical', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_meeting_scheduled: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">Calendar Confirmation</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> I'm sending you the calendar invite right now... <span class=\"pause-indicator\"></span><br><br><em>(Send invite while on the phone)</em><br><br>\"Did you get it in your inbox?\"<br><br><em>⚠️ Stay on line until they confirm!</em>",
      responses: [
        { label: 'They confirmed - ask for invoice', next: 'close_invoice_soft_ask' },
        { label: 'They confirmed - wrap up', next: 'close_final_confirmation' },
        { label: "They didn't get it", next: 'close_send_invite_retry' }
      ]
    },
    video_walkthrough: {
      stage: 'Closing - Video Walkthrough',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So I'm going to share my screen right now and walk you through exactly how this works. <span class=\"pause-indicator\"></span> It's a quick 15-minute overview - you'll see the process, see what we pull from the market, and then you'll KNOW exactly what you're getting into before we schedule the full analysis. <span class=\"pause-indicator\"></span><br><br>After this walkthrough, if it makes sense, we can book time to actually pull your quotes. <span class=\"pause-indicator\"></span> If not, no worries at all. <span class=\"pause-indicator\"></span><br><br>Ready when you are - I'm sharing my screen now.",
      responses: [
        { label: 'Makes sense, let\'s pull quotes', next: 'close_meeting_scheduled' },
        { label: 'I have questions first', next: 'solution_faq_hub' },
        { label: 'Need to think about it', next: 'email_first' }
      ]
    },
    close_meeting_team_involved: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Totally fair. <span class=\"pause-indicator\"></span> This is actually a good conversation to include them in - we'll show both of you exactly what's available in the market. <span class=\"pause-indicator\"></span> Why don't we schedule for tomorrow afternoon and you loop them in? <span class=\"pause-indicator\"></span> That way everyone sees it together.",
      responses: [
        { label: 'Tomorrow afternoon works', next: 'close_meeting_scheduled' },
        { label: 'Friday works better', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_meeting_think_about_it: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> I get it. <span class=\"pause-indicator\"></span> But here's the thing - the earlier we pull those quotes, the better your position. <span class=\"pause-indicator\"></span> How about we lock in 30 minutes Friday and I just walk you through what's out there? <span class=\"pause-indicator\"></span> You might be surprised. <span class=\"pause-indicator\"></span> Then you have all the info to think about it.",
      responses: [
        { label: 'Friday works', next: 'close_meeting_scheduled' },
        { label: 'Thursday works', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_meeting_send_options: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> I could, but it's better if I walk you through them - I can explain the trade-offs. <span class=\"pause-indicator\"></span> Plus, if you have questions, I'm right there. <span class=\"pause-indicator\"></span> Trust me, 30 minutes on Friday is worth it. <span class=\"pause-indicator\"></span> 2 PM good?",
      responses: [
        { label: 'Friday 2 PM works', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_meeting_cost_question: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> It's free - that's the point. <span class=\"pause-indicator\"></span> We get paid by suppliers, not by you. <span class=\"pause-indicator\"></span> You get the analysis for free, and if you decide to move forward with someone we bring you, then they pay us. <span class=\"pause-indicator\"></span> No cost to you either way.",
      responses: [
        { label: 'Thursday works then', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    close_meeting_work_concern: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> It's not a lot of work for us - we literally do this 100+ times a month. <span class=\"pause-indicator\"></span> And for you it's just one 30-minute call. <span class=\"pause-indicator\"></span> Easiest way to actually know where you stand is to compare apples to apples. <span class=\"pause-indicator\"></span> Thursday 2 PM?",
      responses: [
        { label: 'Thursday 2 PM works', next: 'close_meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' }
      ]
    },
    future_opportunity_marked: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So November 2025 is when we start pulling quotes. <span class=\"pause-indicator\"></span> I'm putting that on my calendar right now, and I'll reach out then. <span class=\"pause-indicator\"></span><br><br>What's the best email to send you a calendar reminder 60 days before? <span class=\"pause-indicator\"></span> That way you don't have to remember - I'll ping you.",
      responses: [
        { label: '[Provides email]', next: 'email_captured' },
        { label: 'Just call me when it\'s time', next: 'future_opportunity_email_sent' }
      ]
    },
    future_opportunity_email_sent: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> I'll reach out November 2025. <span class=\"pause-indicator\"></span> In the meantime, let me send you a quick breakdown of what market rates are doing - just so you've got context for when we reconnect.",
      responses: [
        { label: 'Sounds good, thanks', next: 'email_captured' },
        { label: 'Looking forward to it', next: 'email_captured' }
      ]
    },
    // ===== NEPQ MICRO-COMMITMENT CLOSING SEQUENCE =====
    nepq_micro_commitment_1: {
      stage: 'NEPQ Closing - Micro-Commitment',
      text: "<span class=\"tone-marker curious\">🎯 STAGE 5: MICRO-COMMITMENT #1 - Worth Exploring?</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"So do you feel like running an audit... <span class=\"pause-indicator\"></span> to see what the full market is actually quoting... <span class=\"pause-indicator\"></span> is something worth exploring?\"<br><br><em>⏸️ WAIT FOR YES - if they hesitate, go back to consequence</em>",
      responses: [
        { label: "Yeah, I think so", next: 'nepq_micro_commitment_2' },
        { label: "Definitely", next: 'nepq_micro_commitment_2' },
        { label: "Maybe... tell me more", next: 'broker_audit_close' },
        { label: "I need to think about it", next: 'nepq_commitment_hesitation' }
      ]
    },
    nepq_micro_commitment_2: {
      stage: 'NEPQ Closing - Micro-Commitment',
      text: "<span class=\"tone-marker curious\">✅ MICRO-COMMITMENT #2 - Why Worth It?</span><br><br><span class=\"tone-marker curious\">CURIOUS TONE</span> (make them SELL IT TO THEMSELVES)<br><br>\"Perfect. <span class=\"pause-indicator\"></span> Why do you feel it's worth it, though?\"<br><br><em>💡 THIS IS GOLD - They're now convincing themselves</em><br><em>⏸️ Listen to their reason - this is their buying motivation</em>",
      responses: [
        { label: "Want to make sure we're not overpaying", next: 'nepq_micro_commitment_3' },
        { label: "Would be good to know where we stand", next: 'nepq_micro_commitment_3' },
        { label: "Could save us money", next: 'nepq_micro_commitment_3' },
        { label: "Peace of mind", next: 'nepq_micro_commitment_3' }
      ]
    },
    nepq_micro_commitment_3: {
      stage: 'NEPQ Closing - Micro-Commitment',
      text: "<span class=\"tone-marker curious\">✅ MICRO-COMMITMENT #3 - Calendar Lock</span><br><br><span class=\"tone-marker curious\">ASSUMPTIVE TONE</span> (you're not asking IF, you're asking WHEN)<br><br>\"Perfect. <span class=\"pause-indicator\"></span> So here's what makes sense... <span class=\"pause-indicator\"></span><br><br>I'll run that audit over the next 2-3 days... <span class=\"pause-indicator\"></span><br><br>I'll pull quotes from 100+ suppliers... <span class=\"pause-indicator\"></span><br><br>Then we'll hop on a 15-minute call and I'll show you what I found... <span class=\"pause-indicator\"></span><br><br>If your broker's rates are competitive, I'll tell you that... <span class=\"pause-indicator\"></span><br><br>If there's a gap, at least you KNOW... <span class=\"pause-indicator\"></span><br><br>No obligation, no pressure... <span class=\"pause-indicator\"></span> Just data so you can make an informed decision... <span class=\"pause-indicator\"></span><br><br><strong>Does Thursday at 2 PM work... <span class=\"pause-indicator\"></span> or would Friday morning be better?</strong>\"<br><br><em>💡 BINARY CHOICE - they're not choosing WHETHER, they're choosing WHEN</em>",
      responses: [
        { label: "Thursday works", next: 'nepq_micro_commitment_4' },
        { label: "Friday works", next: 'nepq_micro_commitment_4' },
        { label: "Let me check my calendar", next: 'nepq_micro_commitment_4' },
        { label: "What do you need from me?", next: 'audit_info_needed' }
      ]
    },
    nepq_micro_commitment_4: {
      stage: 'NEPQ Closing - Micro-Commitment',
      text: "<span class=\"tone-marker confident\">✅ MICRO-COMMITMENT #4 - Calendar Confirmation</span><br><br><span class=\"tone-marker confident\">CONFIDENT TONE</span><br><br>\"Great. <span class=\"pause-indicator\"></span> I'm sending you a calendar invite right now... <span class=\"pause-indicator\"></span>\"<br><br><em>⏸️ SEND WHILE ON PHONE</em><br><br>\"Did you get it?\"<br><br><em>⚠️ CRITICAL: STAY ON LINE until they confirm!</em><br><em>💡 This alone = 87% show-up rate vs 40% if sent after call</em><br><br><div style=\"background: rgba(34, 197, 94, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.3); margin-top: 12px;\"><strong style=\"color: #22c55e;\">🎯 4 MICRO-COMMITMENTS LOCKED:</strong><br>✅ 1. Yes to audit (worth exploring)<br>✅ 2. Defended WHY they want it<br>✅ 3. Committed to specific time<br>✅ 4. Accepted calendar invite</div>",
      responses: [
        { label: "Yeah, I see it", next: 'close_invoice_soft_ask' },
        { label: "Got it", next: 'close_invoice_soft_ask' },
        { label: "Didn't get it yet", next: 'close_send_invite_retry' }
      ]
    },
    nepq_commitment_hesitation: {
      stage: 'NEPQ Closing - Handle Hesitation',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span> (not pushy)<br><br>\"Fair enough... <span class=\"pause-indicator\"></span> what's holding you back?\"<br><br><em>⏸️ Listen to their real concern</em>",
      responses: [
        { label: "Need to think about it", next: 'close_think_about_it' },
        { label: "Need to check with someone", next: 'objection_need_to_check' },
        { label: "Not sure it's worth the time", next: 'nepq_time_concern' },
        { label: "We're happy with our setup", next: 'nepq_broker_happy_clarify' }
      ]
    },
    nepq_time_concern: {
      stage: 'NEPQ Closing - Time Concern',
      text: "<span class=\"tone-marker curious\">CURIOUS TONE</span><br><br>\"I hear you... <span class=\"pause-indicator\"></span> so let me ask... <span class=\"pause-indicator\"></span><br><br>If we could show you in 15 minutes whether you're leaving $50K+ on the table... <span class=\"pause-indicator\"></span> would that be worth the time?\"<br><br><em>⏸️ Reframe time vs value</em>",
      responses: [
        { label: "Yeah, that would be worth it", next: 'nepq_micro_commitment_3' },
        { label: "I guess so", next: 'nepq_micro_commitment_3' },
        { label: "Still not sure", next: 'email_first' }
      ]
    },
    // ===== 4-STEP PHONE CLOSE FRAMEWORK =====
    close_meeting: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">STEP 1: Recap (15 seconds)</span><br><br>\"Okay, so just to recap: <span class=\"pause-indicator\"></span> You're spending about {{monthly_spend}} monthly, <span class=\"pause-indicator\"></span> your contract expires {{contract_end}}, <span class=\"pause-indicator\"></span> and you're using {{account.supplier}} right now. <span class=\"pause-indicator\"></span> That about right?\"<br><br><em>(Wait for confirmation - builds \"yes momentum\")</em>",
      responses: [
        { label: 'Yes, that\'s right', next: 'close_step2_value' },
        { label: 'Let me correct something', next: 'close_step2_value' },
        { label: 'Actually, I need to think about this', next: 'close_think_about_it' },
        { label: 'I need to check with my team first', next: 'objection_need_to_check' }
      ]
    },
    close_step2_value: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">STEP 2: Reaffirm Value (20 seconds)</span><br><br>\"The reason I'm calling is because most companies in your situation— <span class=\"pause-indicator\"></span> spending that amount with that contract timeline— <span class=\"pause-indicator\"></span> are leaving 15-20% on the table without realizing it. <span class=\"pause-indicator\"></span><br><br>That's roughly {{potential_savings}} annually you might be overpaying. <span class=\"pause-indicator\"></span><br><br>An audit is how we find out if you're one of them.\"",
      responses: [
        { label: 'That would be significant', next: 'close_step3_assumptive' },
        { label: 'Makes sense', next: 'close_step3_assumptive' },
        { label: 'How do you know that?', next: 'close_step3_assumptive' },
        { label: "What's your commission?", next: 'objection_commission' }
      ]
    },
    close_step3_assumptive: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">STEP 3: The Assumptive Move (10 seconds)</span><br><br>\"So here's what makes sense: <span class=\"pause-indicator\"></span> I run this audit over the next 2-3 days, <span class=\"pause-indicator\"></span> then we jump on a quick call and I walk you through what I found.\"<br><br><em>(You're not asking permission. You're laying out the plan.)</em>",
      responses: [
        { label: 'Sounds good', next: 'close_step4_calendar' },
        { label: 'How long will the call take?', next: 'close_step4_calendar' },
        { label: 'What would you need from me?', next: 'close_invoice_soft_ask' },
        { label: 'Let me think about it', next: 'close_think_about_it' }
      ]
    },
    close_step4_calendar: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">STEP 4: Lock In Commitment (Binary Choice)</span><br><br>\"Thursday afternoon at 2 PM or Friday morning at 10 AM— <span class=\"pause-indicator\"></span> what works better?\"<br><br><em>(They're not deciding WHETHER to meet, they're choosing WHEN.)</em>",
      responses: [
        { label: 'Thursday at 2 PM', next: 'close_send_invite' },
        { label: 'Friday at 10 AM', next: 'close_send_invite' },
        { label: 'Another time works better', next: 'close_send_invite' },
        { label: 'I need to check my calendar', next: 'close_send_invite' }
      ]
    },
    close_send_invite: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">Send Calendar Invite NOW (Stay on Line!)</span><br><br>\"Perfect. <span class=\"pause-indicator\"></span> I'm going to send you a calendar invite right now. <span class=\"pause-indicator\"></span><br><br>Do you have your email with you? <span class=\"pause-indicator\"></span><br><br><em>(Get email, send invite immediately)</em><br><br>\"Sending it over right now... <span class=\"pause-indicator\"></span> did it come through?\"<br><br><em>⚠️ CRITICAL: DO NOT hang up until they confirm receipt!</em><br><em>This alone = 87% show-up rate vs 40% if sent after call.</em>",
      responses: [
        { label: 'They confirmed receipt', next: 'close_invoice_soft_ask' },
        { label: "They didn't get it", next: 'close_send_invite_retry' },
        { label: 'They want to check spam', next: 'close_send_invite' }
      ]
    },
    close_send_invite_retry: {
      stage: 'Closing',
      text: "<span class=\"tone-marker understanding\">Troubleshoot Calendar Invite</span><br><br>\"No worries, let me try again. <span class=\"pause-indicator\"></span> Can you spell your email for me? <span class=\"pause-indicator\"></span><br><br><em>(Confirm email, resend)</em><br><br>\"Sending again... <span class=\"pause-indicator\"></span> check your inbox now. <span class=\"pause-indicator\"></span> Also check spam or promotions folder.\"<br><br><em>Stay patient. This confirmation is worth the extra minute.</em>",
      responses: [
        { label: 'They got it now', next: 'close_invoice_soft_ask' },
        { label: 'Still not working - will call back', next: 'close_meeting_scheduled' }
      ]
    },
    close_invoice_soft_ask: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">Soft Invoice Ask (After Calendar Locked)</span><br><br>\"Perfect. <span class=\"pause-indicator\"></span> So I can run the audit with just the info we've talked about— <span class=\"pause-indicator\"></span> monthly spend, contract date, that kind of thing.<br><br>But honestly? <span class=\"pause-indicator\"></span> Having your actual invoice makes it even more accurate. <span class=\"pause-indicator\"></span> That way I can pull your exact rates, contract terms, everything.<br><br>Do you have your last bill handy, <span class=\"pause-indicator\"></span> or should I just work with what we discussed?\"<br><br><em>✅ Frames as helpful, not required<br>✅ Gives them an out<br>✅ Many will grab it rather than say no</em>",
      responses: [
        { label: 'I can send it over', next: 'close_invoice_confirmed' },
        { label: "I'll email it to you", next: 'close_invoice_confirmed' },
        { label: "Just work with what we discussed", next: 'close_final_confirmation' },
        { label: "I don't have it handy", next: 'close_invoice_alternative' }
      ]
    },
    close_invoice_alternative: {
      stage: 'Closing',
      text: "<span class=\"tone-marker understanding\">Invoice Alternative (No Pressure)</span><br><br>\"No problem at all. <span class=\"pause-indicator\"></span> If you don't have it handy, I can work with what we discussed.<br><br>But if you do find it later, <span class=\"pause-indicator\"></span> just reply to the calendar invite I sent and attach it. <span class=\"pause-indicator\"></span> That way I'll have it before Thursday.\"",
      responses: [
        { label: "I'll try to find it", next: 'close_final_confirmation' },
        { label: 'Sounds good', next: 'close_final_confirmation' }
      ]
    },
    close_invoice_confirmed: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">Invoice Commitment Locked!</span><br><br>\"Perfect. <span class=\"pause-indicator\"></span> Just email it to me—you can reply to the calendar invite I just sent. <span class=\"pause-indicator\"></span><br><br>That way I can show you the exact breakdown— <span class=\"pause-indicator\"></span> rates, contract terms, all of it—when we talk Thursday.\"",
      responses: [
        { label: 'Will do', next: 'close_final_confirmation' },
        { label: 'Sounds good', next: 'close_final_confirmation' }
      ]
    },
    close_final_confirmation: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">Final Wrap-Up</span><br><br>\"You're all set. <span class=\"pause-indicator\"></span> I'll have the audit done by Thursday morning, <span class=\"pause-indicator\"></span> so you'll have time to look at it before our call.<br><br>I'll give you a quick call Wednesday afternoon just to confirm we're still good. <span class=\"pause-indicator\"></span><br><br>Looking forward to showing you what I find, {{contact.first_name}}. <span class=\"pause-indicator\"></span> Talk soon!\"<br><br><em>✅ Calendar locked<br>✅ Invoice requested (soft)<br>✅ 24-hour reminder planned<br>✅ Professional close</em>",
      responses: [
        { label: 'End call - SUCCESS!', next: 'meeting_scheduled' }
      ]
    },
    close_think_about_it: {
      stage: 'Closing',
      text: "<span class=\"tone-marker understanding\">Handle \"Let Me Think About It\"</span><br><br>\"I totally understand. <span class=\"pause-indicator\"></span> Here's what makes sense— <span class=\"pause-indicator\"></span> let me run the audit anyway. <span class=\"pause-indicator\"></span><br><br>Then you'll have the data to think about instead of guessing. <span class=\"pause-indicator\"></span><br><br>I'll have it ready by Friday. <span class=\"pause-indicator\"></span> How about I call you Friday afternoon to walk through what I found? <span class=\"pause-indicator\"></span> That way you can make an informed decision.<br><br>That work better than tomorrow? <span class=\"pause-indicator\"></span> Less pressure, you've had time to think.\"<br><br><em>They said yes to thinking. Now you're giving them real data to think ABOUT.</em>",
      responses: [
        { label: 'Friday works', next: 'close_send_invite' },
        { label: 'That makes sense', next: 'close_send_invite' },
        { label: 'Just send me information first', next: 'objection_send_something' },
        { label: 'Not interested', next: 'respect_decision' }
      ]
    },
    close_prep_question: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Great question. <span class=\"pause-indicator\"></span> Here's what the audit is:<br><br>We pull quotes from our network of 100+ suppliers— <span class=\"pause-indicator\"></span> completely different ones than what most brokers work with. <span class=\"pause-indicator\"></span> We standardize everything so you can actually compare apples to apples.<br><br>Then I send you a 1-page summary showing:<br>1. <span class=\"pause-indicator\"></span> What your current rate is<br>2. <span class=\"pause-indicator\"></span> What competitive market rates are for your situation<br>3. <span class=\"pause-indicator\"></span> The annual gap (if there is one)<br><br>Takes us 2-3 days to pull. <span class=\"pause-indicator\"></span> Then we hop on a quick 15-minute call and I walk you through what we found.<br><br>If your current rates are solid, I'll tell you that. <span class=\"pause-indicator\"></span> If there's a gap, now you know exactly what you're leaving on the table. <span class=\"pause-indicator\"></span> Then YOU can decide what to do with that information.<br><br>So Thursday or Friday work for that review call?",
      responses: [
        { label: 'Thursday works', next: 'close_meeting_scheduled' },
        { label: 'Friday works', next: 'close_meeting_scheduled' },
        { label: 'Send email first', next: 'email_first' }
      ]
    },
    // ===== AUDIT PRESENTATION (Gap vs No Gap) =====
    audit_presentation_gap: {
      stage: 'Audit Presentation',
      text: "<span class=\"tone-marker confident\">presenting the gap</span> <span class=\"pause-indicator\"></span> Okay, so here's what I found. <span class=\"pause-indicator\"></span><br><br>You're currently paying [X.X¢ per kWh].<br><br>Competitive market rate for your situation from 100+ suppliers is [Y.Y¢ per kWh].<br><br>That's a [Z.Z¢] gap. <span class=\"pause-indicator\"></span> For {{account.name}} spending {{monthly_spend}} monthly, <span class=\"pause-indicator\"></span> that gap is about {{potential_savings}} per year.<br><br>Over 3 years, that's triple that amount.<br><br>Now, your current broker might not have access to those 100+ suppliers. <span class=\"pause-indicator\"></span> Or they might have access but chose not to shop as aggressively. <span class=\"pause-indicator\"></span> Either way, there's real money here.<br><br><span class=\"tone-marker understanding\">So here's what makes sense:</span> <span class=\"pause-indicator\"></span> We can either work with your current broker and present this data to them— <span class=\"pause-indicator\"></span> give them a chance to match or improve. <span class=\"pause-indicator\"></span> Or, if they can't help you close that gap, we can handle it directly.<br><br>But one way or another, you should be able to get access to these rates. <span class=\"pause-indicator\"></span> Sound fair?",
      responses: [
        { label: "Let's work with our current broker first", next: 'audit_work_with_broker' },
        { label: "Let's move forward with you", next: 'meeting_scheduled' },
        { label: "I need to think about it", next: 'email_first' }
      ]
    },
    audit_presentation_no_gap: {
      stage: 'Audit Presentation',
      text: "<span class=\"tone-marker honest\">honest, credibility-building</span> <span class=\"pause-indicator\"></span> Okay, so I ran the numbers and your broker actually did a really solid job. <span class=\"pause-indicator\"></span><br><br>You're getting market rates— <span class=\"pause-indicator\"></span> within 3-5% of what competitive suppliers are quoting.<br><br>That's actually rare. <span class=\"pause-indicator\"></span> So you can trust your broker. <span class=\"pause-indicator\"></span> They're doing right by you.<br><br><span class=\"tone-marker confident\">Here's what I'd suggest though:</span> <span class=\"pause-indicator\"></span> When you're 6 months out from renewal next time, let me run this audit again. <span class=\"pause-indicator\"></span> Markets change, and it's smart to have a second opinion every cycle. <span class=\"pause-indicator\"></span> Fair?",
      responses: [
        { label: "Good to know - reach out in 6 months", next: 'followup_scheduled' },
        { label: "Thanks for the honesty", next: 'respect_decision' }
      ]
    },
    audit_work_with_broker: {
      stage: 'Audit Presentation',
      text: "<span class=\"tone-marker professional\">professional, collaborative</span> <span class=\"pause-indicator\"></span> Totally fair. <span class=\"pause-indicator\"></span> Here's what I'd suggest— <span class=\"pause-indicator\"></span><br><br>Take these numbers to your broker. <span class=\"pause-indicator\"></span> Show them what competitive rates we found. <span class=\"pause-indicator\"></span> Give them a chance to match or improve.<br><br>If they can close the gap, great— <span class=\"pause-indicator\"></span> you win. <span class=\"pause-indicator\"></span> If they can't, you know where to find me.<br><br>Either way, you're making a decision based on complete data instead of partial data. <span class=\"pause-indicator\"></span> That's the whole point of the audit.<br><br>When should I follow up to see what they came back with?",
      responses: [
        { label: "Give me 2 weeks", next: 'schedule_followup' },
        { label: "I'll reach out when I hear back", next: 'email_first' },
        { label: "Actually, let's just work with you", next: 'meeting_scheduled' }
      ]
    },
    meeting_scheduled: {
      stage: 'Success',
      text: '✅ <strong>AUDIT SCHEDULED - NEPQ SUCCESS!</strong><br><br><strong>🎯 NEPQ Framework Complete!</strong><br><br><strong>You successfully used:</strong><br>• 🎤 <strong>5 Tonalities</strong> (Curious, Confused, Concerned, Challenging, Playful)<br>• 🔍 <strong>5 Question Types</strong> (Situation → Problem → Solution → Consequence → Qualifying)<br>• 🔄 <strong>3-Step Objection Formula</strong> (Clarify → Discuss → Diffuse)<br>• ✅ <strong>4 Micro-Commitments</strong> (Audit interest → Why → Calendar → Confirmed)<br><br><strong>Key NEPQ Principle:</strong><br>\"The prospect persuaded THEMSELVES. You just asked the right questions.\"<br><br><strong>No-Show Prevention:</strong><br>• 📅 Calendar invite sent while ON call (87% show-up rate)<br>• 📄 Invoice requested (soft ask)<br>• 📞 24-hour reminder call planned<br>• 📧 Morning-of confirmation email<br><br><strong>Next Steps:</strong><br>1. Run the broker audit (2-3 days)<br>2. Call Wednesday afternoon to confirm<br>3. Send morning-of email 2 hours before<br>4. Prepare 1-page summary<br><br><strong>Target:</strong> 35-45% audit request rate with NEPQ!',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    email_first: {
      stage: 'Solution - Email First',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> Totally get it - no pressure. <span class=\"pause-indicator\"></span><br><br>Let me do this... <span class=\"pause-indicator\"></span> I'll shoot you an email with a quick summary of what we talked about and what the next step would look like. <span class=\"pause-indicator\"></span> That way you've got it in writing and you can think it over. <span class=\"pause-indicator\"></span><br><br>If it makes sense after you think about it, just reply to that email and we'll get the quotes pulled. <span class=\"pause-indicator\"></span> If not, no worries at all. <span class=\"pause-indicator\"></span><br><br>Fair? <span class=\"pause-indicator\"></span><br><br>What's the best email to send that to?",
      responses: [
        { label: "Sure, it's [email]", next: 'email_captured' },
        { label: "Just send it to my work email", next: 'email_captured' },
        { label: "Actually, let's just schedule it now", next: 'close_meeting' },
        { label: "When will you follow up?", next: 'email_follow_up' },
        { label: "I don't want to give my email", next: 'respect_decision' }
      ]
    },
    email_captured: {
      stage: 'Solution - Email Captured',
      text: "<span class=\"tone-marker confident\">professional, upbeat tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> I'll send that over in the next hour. <span class=\"pause-indicator\"></span><br><br>Just so you know what to expect - it'll have a quick recap of what we talked about, the potential savings we discussed, and the next step if you want to move forward. <span class=\"pause-indicator\"></span><br><br>No spam, no constant follow-ups - just that one email. <span class=\"pause-indicator\"></span> If you want to move forward, reply. <span class=\"pause-indicator\"></span> If not, no worries. <span class=\"pause-indicator\"></span><br><br>Appreciate your time today, {{contact.first_name}}. <span class=\"pause-indicator\"></span> Anything else you want to ask before I let you go?",
      responses: [
        { label: "Nope, that's it", next: 'end_call_email_sent' },
        { label: "Actually, one more question...", next: 'solution_faq_hub' },
        { label: "Actually, let's just schedule it now", next: 'close_meeting' }
      ]
    },
    end_call_email_sent: {
      stage: 'End - Email Sent',
      text: "<span class=\"tone-marker friendly\">friendly tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> Email on the way. <span class=\"pause-indicator\"></span> Have a good one, {{contact.first_name}}!",
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    solution_faq_hub: {
      stage: 'Solution - FAQ Hub',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Sure, what do you want to know? <span class=\"pause-indicator\"></span><br><br>Is it about how the process works, how long it takes, what it costs, or something else?",
      responses: [
        { label: 'How does your process work?', next: 'solution_faq_process' },
        { label: 'How long does this take?', next: 'solution_faq_timeline' },
        { label: 'What does this cost?', next: 'solution_faq_cost' },
        { label: 'What if I don\'t like the options?', next: 'solution_faq_no_obligation' },
        { label: 'Something else', next: 'email_first' }
      ]
    },
    solution_faq_process: {
      stage: 'Solution - Process FAQ',
      text: "<span class=\"tone-marker confident\">confident, clear tone</span> <span class=\"pause-indicator\"></span> Yeah, it's pretty straightforward actually. <span class=\"pause-indicator\"></span><br><br>We pull quotes from 100+ suppliers across our network - all at once. <span class=\"pause-indicator\"></span> We tell them they're competing, so they give you actual competitive rates, not the jacked-up renewal quotes they usually send. <span class=\"pause-indicator\"></span><br><br>Then we standardize everything into the same format so you can actually compare apples to apples. <span class=\"pause-indicator\"></span> No confusing terms, no hidden fees. <span class=\"pause-indicator\"></span><br><br>We send you the top 3-5 options with our recommendation based on what you told us matters most - could be price, could be contract flexibility, whatever. <span class=\"pause-indicator\"></span><br><br>You pick which one you want, or you say no to all of them. <span class=\"pause-indicator\"></span> That's it. <span class=\"pause-indicator\"></span><br><br>We handle everything - the back and forth with suppliers, the paperwork, the onboarding. <span class=\"pause-indicator\"></span> Your job is literally just to say yes or no. <span class=\"pause-indicator\"></span><br><br>So it's not like you're doing the shopping yourself. <span class=\"pause-indicator\"></span> We're doing it FOR you. <span class=\"pause-indicator\"></span><br><br>Does that answer it, or you got other questions?",
      responses: [
        { label: "That makes sense, let's do it", next: 'close_meeting' },
        { label: "How long does this take?", next: 'solution_faq_timeline' },
        { label: "What's the catch?", next: 'solution_faq_cost' },
        { label: "Still need to think about it", next: 'email_first' }
      ]
    },
    solution_faq_timeline: {
      stage: 'Solution - Timeline FAQ',
      text: "<span class=\"tone-marker confident\">direct tone</span> <span class=\"pause-indicator\"></span> From start to finish? <span class=\"pause-indicator\"></span> About 2 weeks max. <span class=\"pause-indicator\"></span><br><br>Here's the breakdown - we pull quotes in 2-3 days. <span class=\"pause-indicator\"></span> You review them, pick one you like, takes you maybe 15 minutes. <span class=\"pause-indicator\"></span> Then we handle the onboarding and contract paperwork, which is another week or so. <span class=\"pause-indicator\"></span><br><br>But here's the thing - the actual TIME you spend on this is like 30 minutes total. <span class=\"pause-indicator\"></span> One call with me to go over options, you make a decision, done. <span class=\"pause-indicator\"></span><br><br>Everything else happens in the background while you're doing your actual job. <span class=\"pause-indicator\"></span><br><br>So yeah, 2 weeks calendar time, but 30 minutes of YOUR time. <span class=\"pause-indicator\"></span><br><br>That work for you?",
      responses: [
        { label: "Yeah, that's not bad", next: 'close_meeting' },
        { label: "What happens if I don't like any quotes?", next: 'solution_faq_no_obligation' },
        { label: "Still thinking about it", next: 'email_first' }
      ]
    },
    solution_faq_cost: {
      stage: 'Solution - Cost FAQ',
      text: "<span class=\"tone-marker confident\">straightforward tone</span> <span class=\"pause-indicator\"></span> No catch. <span class=\"pause-indicator\"></span> We get paid by the suppliers, not you. <span class=\"pause-indicator\"></span><br><br>When you sign with one of the suppliers we bring you, they pay us a referral fee. <span class=\"pause-indicator\"></span> You pay the same rate whether you go direct or through us - we just handle all the legwork. <span class=\"pause-indicator\"></span><br><br>So there's no fee to you, no hidden costs, nothing like that. <span class=\"pause-indicator\"></span> You're just getting the quotes and the service for free. <span class=\"pause-indicator\"></span><br><br>The only way we make money is if you actually pick one of the options we bring you. <span class=\"pause-indicator\"></span> If you don't, we don't get paid. <span class=\"pause-indicator\"></span> So we're motivated to bring you good options. <span class=\"pause-indicator\"></span><br><br>That's the whole model. <span class=\"pause-indicator\"></span><br><br>Clear?",
      responses: [
        { label: "Okay, that makes sense", next: 'close_meeting' },
        { label: "Sounds good, let's do it", next: 'close_meeting' },
        { label: "Still not sure", next: 'email_first' }
      ]
    },
    solution_faq_no_obligation: {
      stage: 'Solution - No Obligation FAQ',
      text: "<span class=\"tone-marker confident\">honest tone</span> <span class=\"pause-indicator\"></span> Then you say no. <span class=\"pause-indicator\"></span> That's it. <span class=\"pause-indicator\"></span><br><br>No obligation, no pressure, no long-term commitment. <span class=\"pause-indicator\"></span> We pull the quotes, you see what's out there, and if nothing makes sense, you stick with what you got. <span class=\"pause-indicator\"></span><br><br>The only thing that changes is now you KNOW what the market looks like. <span class=\"pause-indicator\"></span> So you're not flying blind anymore. <span class=\"pause-indicator\"></span><br><br>Most companies actually DO find something better because we're pulling from 100+ suppliers. <span class=\"pause-indicator\"></span> But if you're genuinely getting a good deal already, we'll tell you that too. <span class=\"pause-indicator\"></span><br><br>We're not here to force you into something worse just to make a sale. <span class=\"pause-indicator\"></span> That's not how this works. <span class=\"pause-indicator\"></span><br><br>Make sense?",
      responses: [
        { label: "Okay, let's see what you can pull", next: 'close_meeting' },
        { label: "What do you charge for this?", next: 'solution_faq_cost' },
        { label: "I'll think about it", next: 'email_first' }
      ]
    },
    email_follow_up: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker confident\">confident tone</span> Perfect. <span class=\"pause-indicator\"></span> And when you get that... <span class=\"pause-indicator\"></span> when should I follow up with you? <span class=\"pause-indicator\"></span> End of this week? <span class=\"pause-indicator\"></span> Or next week?",
      responses: [
        { label: 'End of this week', next: 'email_scheduled' },
        { label: 'Next week', next: 'email_scheduled' },
        { label: 'Don\'t follow up', next: 'respect_decision' }
      ]
    },
    email_scheduled: {
      stage: 'Follow-up Scheduled',
      text: '✅ <strong>Email Follow-up Scheduled!</strong><br><br>Excellent! You:<br>• Identified what they wanted to see<br>• Got commitment on follow-up timing<br>• Left door open for next conversation<br><br>This creates accountability and keeps the conversation moving forward.',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    // ===== OBJECTION HANDLING (ARC Framework: Acknowledge, Reframe, Close) =====
    objection_not_interested: {
      stage: 'Objection - Not Interested',
      text: "Fair enough. Can I ask why? Is it because you're happy with what you're paying right now... or more just not a priority at the moment?<br><br><span class=\"pause-indicator\"></span><em>[PAUSE]</em>",
      responses: [
        { label: 'Happy with rates', next: 'confidence_challenge' },
        { label: 'Just not a priority', next: 'consequence_challenge' },
        { label: 'Still not interested', next: 'close_respect_decision' }
      ]
    },
    consequence_challenge: {
      stage: 'Objection - Consequence Challenge',
      text: "I get it, not a priority right now. But here's the thing... while you're handling everything else, your electricity costs are going up in the background. And nobody's shopping, so you're locked in at rates way higher than new customers get.<br><br>When renewal hits... it's a crisis. No leverage, stuck.<br><br>What would that cost you? Maybe {{potential_savings}} over like 3 years?",
      responses: [
        { label: "Wow, didn't think about it like that", next: 'solution_audit_proposal' },
        { label: "That's a good point", next: 'solution_audit_proposal' },
        { label: 'Still not interested', next: 'close_respect_decision' }
      ]
    },
    objection_happy_supplier: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> That's fair. <span class=\"pause-indicator\"></span> And just so you know, we work with ALL suppliers - I'm not trying to switch you or anything like that.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's the thing though— <span class=\"pause-indicator\"></span> even if you're happy, have you actually seen what the REST of the market is quoting? <span class=\"pause-indicator\"></span> We typically find a 15-20% gap just because companies haven't shopped 100+ suppliers.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> So I gotta ask - have you shopped the market in the last 12 months to make sure you're getting the best rate available?",
      responses: [
        { label: 'Yes, recently shopped', next: 'probe_deeper' },
        { label: 'Not recently', next: 'consequence_variant_happy' },
        { label: "No, we haven't", next: 'consequence_variant_happy' },
        { label: 'We use a broker for that', next: 'broker_audit_intro' }
      ]
    },
    objection_market_moved: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker concerned\">concerned tone</span> So here's something important... <span class=\"pause-indicator\"></span> the market has moved A LOT in the last 12-24 months. <span class=\"pause-indicator\"></span><br><br>Between 2023-2024, electricity rates went up like 50% because data centers and AI are using crazy amounts of power. <span class=\"pause-indicator\"></span><br><br>So when your contract renews, that's the market you're shopping into, you know? <span class=\"pause-indicator\"></span> It's not really 'should we shop?' - it's more like 'when should we lock in competitive rates before prices go even higher?' <span class=\"pause-indicator\"></span><br><br>Does that make sense?",
      responses: [
        { label: 'Yes, that makes sense', next: 'close_meeting' },
        { label: 'We\'ll handle it ourselves', next: 'objection_not_priority' },
        { label: "Still not interested", next: 'respect_decision' }
      ]
    },
    objection_need_to_check: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> Totally fair. <span class=\"pause-indicator\"></span> This needs buy-in from the team.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's what I'd suggest— <span class=\"pause-indicator\"></span> why don't we loop them in on a quick call? <span class=\"pause-indicator\"></span> That way there's no game of telephone and everyone hears the audit results at the same time.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> What works better for you guys— <span class=\"pause-indicator\"></span> Thursday at 2 PM or Friday afternoon?",
      responses: [
        { label: "Thursday works", next: 'close_meeting_scheduled' },
        { label: "Friday works better", next: 'close_meeting_scheduled' },
        { label: "I'll talk to them first and get back to you", next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_commission: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> Fair question. <span class=\"pause-indicator\"></span> I appreciate the directness.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> We make money from suppliers when you sign with them. <span class=\"pause-indicator\"></span> Just like your current broker does. <span class=\"pause-indicator\"></span><br><br>But here's the key— <span class=\"pause-indicator\"></span> you pay the same rate whether you go direct or through any broker. <span class=\"pause-indicator\"></span> The supplier already builds in broker commission. <span class=\"pause-indicator\"></span> So you're not paying extra. <span class=\"pause-indicator\"></span> We just handle the shopping so you don't have to.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> And honestly, if we're pulling better rates from 100+ suppliers, <span class=\"pause-indicator\"></span> you might save more than our commission anyway. <span class=\"pause-indicator\"></span> That's why the audit matters— <span class=\"pause-indicator\"></span> you get to see the numbers.",
      responses: [
        { label: "That makes sense", next: 'close_meeting' },
        { label: "Let's see what you find", next: 'close_meeting_scheduled' },
        { label: "I need to think about it", next: 'email_first' }
      ]
    },
    objection_send_something: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> I can definitely do that. <span class=\"pause-indicator\"></span> But honestly, most of the time these emails end up in the wrong folder and nothing happens.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> How about this— <span class=\"pause-indicator\"></span> let's skip the email for now. <span class=\"pause-indicator\"></span> I'll run a quick audit for you over the next 2-3 days. <span class=\"pause-indicator\"></span> Takes me like 30 minutes of work. <span class=\"pause-indicator\"></span> Then when I call you back, I'll actually have data to show you instead of a generic brochure.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> That way you get something concrete to look at instead of just marketing material. <span class=\"pause-indicator\"></span> Fair? <span class=\"pause-indicator\"></span> What's a good day for a quick call Friday?",
      responses: [
        { label: "Friday works", next: 'close_meeting_scheduled' },
        { label: "Just send the email first", next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_talk_to_broker: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> That makes sense. <span class=\"pause-indicator\"></span> They should know what's up.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Actually, here's what I'd suggest— <span class=\"pause-indicator\"></span> let me run the audit first. <span class=\"pause-indicator\"></span> Then YOU have the data. <span class=\"pause-indicator\"></span> When you talk to your broker, you can show them what the actual market is quoting. <span class=\"pause-indicator\"></span> That way the conversation is way more productive. <span class=\"pause-indicator\"></span> You're not accusing them, you're just showing them the market data.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> I'll have the audit done by Thursday. <span class=\"pause-indicator\"></span> Then you can bring it to your broker conversation and see what they say. <span class=\"pause-indicator\"></span> Sound fair?",
      responses: [
        { label: "That makes sense", next: 'close_meeting_scheduled' },
        { label: "I'll still talk to them first", next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_mid_renewal: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker confident\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> Okay, so timing is actually crucial then. <span class=\"pause-indicator\"></span> This is EXACTLY when an audit matters most.<br><br><span class=\"tone-marker serious\">Reframe</span> <span class=\"pause-indicator\"></span> Here's why: <span class=\"pause-indicator\"></span> You're negotiating rates RIGHT NOW. <span class=\"pause-indicator\"></span> If we pull market quotes from 100+ suppliers TODAY, you can use that as leverage in your negotiations. <span class=\"pause-indicator\"></span> Your broker is probably negotiating with their network—maybe 10-20 suppliers. <span class=\"pause-indicator\"></span> We can show you what the FULL market is quoting.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> When do you need to finalize your contract? <span class=\"pause-indicator\"></span> I can turn around an audit by then so you have it before you lock in rates. <span class=\"pause-indicator\"></span> Could be worth significant money.",
      responses: [
        { label: "We need it by [date]", next: 'close_meeting_scheduled' },
        { label: "That could help", next: 'broker_audit_close' },
        { label: "We're too far along", next: 'future_opportunity' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_email_proposal: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> I can do that, but honestly, email proposals are kind of useless without context.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> What's more valuable: <span class=\"pause-indicator\"></span> I run an audit specific to YOUR situation with your actual spend, contract timing, and supplier mix. <span class=\"pause-indicator\"></span> Then I walk you through what I find on a call. <span class=\"pause-indicator\"></span> That way you're seeing YOUR numbers, not a generic proposal.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> Give me 2-3 days to pull the audit. <span class=\"pause-indicator\"></span> Then we can jump on a call and I show you exactly what this looks like for {{account.name}}. <span class=\"pause-indicator\"></span> That's way more useful than a PDF, right?",
      responses: [
        { label: "That's fair, let's do it", next: 'close_meeting_scheduled' },
        { label: "I still want the email first", next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_broker_friend: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> I totally get it. <span class=\"pause-indicator\"></span> Relationships matter, and they should.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> I'm not asking you to leave them. <span class=\"pause-indicator\"></span> I'm asking you to know what the full market is quoting. <span class=\"pause-indicator\"></span> Your friend would want you to have the best rates, right? <span class=\"pause-indicator\"></span><br><br>Think of me as a second opinion so you can go to your broker and say, <span class=\"pause-indicator\"></span> 'Hey, I ran an audit. <span class=\"pause-indicator\"></span> Here's what competitive rates look like. <span class=\"pause-indicator\"></span> Can you match this or beat this?'<br><br>Either your broker matches it and you stay with them— <span class=\"pause-indicator\"></span> and they know you were shopping. <span class=\"pause-indicator\"></span> Or they can't, and then you know what you need to do. <span class=\"pause-indicator\"></span> Either way, your friend wins because you have better information.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> Let me run the audit. <span class=\"pause-indicator\"></span> You can use it however you want with your broker. <span class=\"pause-indicator\"></span> Fair?",
      responses: [
        { label: "That makes sense", next: 'broker_audit_close' },
        { label: "I don't want to upset them", next: 'broker_audit_no_switch' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    probe_deeper: {
      stage: 'Discovery',
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Interesting. <span class=\"pause-indicator\"></span> So you're happy with what you're paying— <span class=\"pause-indicator\"></span> let me ask though, have you actually compared your rates to what's available in the market RIGHT NOW?<br><br>Because here's what I see— <span class=\"pause-indicator\"></span> even companies that shopped 12 months ago are finding the market has shifted. <span class=\"pause-indicator\"></span> New suppliers have entered, rates have moved 15-20%.<br><br>The only way to KNOW if you're getting a good deal is to see what else is out there. <span class=\"pause-indicator\"></span> That's what the audit does— <span class=\"pause-indicator\"></span> takes 2-3 days, no obligation, and you'll KNOW where you stand.<br><br>Worth 15 minutes to confirm you're getting the best rate?",
      responses: [
        { label: "Yeah, that makes sense", next: 'broker_audit_close' },
        { label: "How does that work?", next: 'solution_faq_process' },
        { label: "We just renewed", next: 'ack_just_renewed' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    objection_not_priority: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">ARC: Acknowledge</span> <span class=\"pause-indicator\"></span> Makes sense. <span class=\"pause-indicator\"></span> You've got a ton on your plate.<br><br><span class=\"tone-marker confident\">Reframe</span> <span class=\"pause-indicator\"></span> Here's the thing though— <span class=\"pause-indicator\"></span> while it's not a priority, rates are actually going UP right now. <span class=\"pause-indicator\"></span> So the longer you wait, the worse the deal you'll get when you renew. <span class=\"pause-indicator\"></span> Shopping 6-12 months early is how you actually get leverage.<br><br><span class=\"tone-marker curious\">Close</span> <span class=\"pause-indicator\"></span> How long until your contract expires? <span class=\"pause-indicator\"></span> Let me just put a note on my side so I can reach out when the timing's right for you.",
      responses: [
        { label: 'I know the date', next: 'schedule_followup' },
        { label: 'What\'s the market context?', next: 'market_context' },
        { label: 'Not sure', next: 'email_first' },
        { label: 'Not interested', next: 'respect_decision' }
      ]
    },
    schedule_followup: {
      stage: 'Follow-up',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> So I'm putting that on my calendar right now, and I'll reach out 6 months before that expires. <span class=\"pause-indicator\"></span><br><br>That's when you actually have leverage— <span class=\"pause-indicator\"></span> suppliers are competing for your business during off-peak periods.<br><br>What's the best email to send you a calendar reminder? <span class=\"pause-indicator\"></span> That way you don't have to remember - I'll ping you.",
      responses: [
        { label: 'Provides email', next: 'followup_scheduled' },
        { label: 'Just call me when it\'s time', next: 'followup_scheduled' },
        { label: 'Just forget it', next: 'respect_decision' }
      ]
    },
    followup_scheduled: {
      stage: 'Success',
      text: '✅ <strong>Follow-up Scheduled!</strong><br><br><strong>Key Stats:</strong> 80% of deals close after 5+ follow-ups. You just planted the seed.<br><br>You successfully:<br>• Respected their timeline<br>• Got specific renewal date<br>• Positioned for future outreach<br>• Left door open (not pushy)<br><br>This is often how deals close! Mark the 6-month reminder.',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    close_respect_decision: {
      stage: 'Close - Respected',
      text: "Totally fair. No pressure at all.<br><br>But hey, if anything changes or you ever want to just see what the market's doing, feel free to reach out.<br><br>Take care.",
      responses: []
    },
    respect_decision: {
      stage: 'Closing',
      text: "<span class=\"tone-marker professional\">professional, authentic tone</span> <span class=\"pause-indicator\"></span> Look, I'm not here to convince you that your broker is bad. <span class=\"pause-indicator\"></span> I'm here to help you see the full market. <span class=\"pause-indicator\"></span> You're a smart operator—you'll make the right call.<br><br>But I'd hate for you to find out 2 years from now that the market was way lower and you could've locked it in early. <span class=\"pause-indicator\"></span> That's money that could've stayed in your business.<br><br>Fair enough though. <span class=\"pause-indicator\"></span> I appreciate the time. <span class=\"pause-indicator\"></span> If anything changes or you want to explore options, <span class=\"pause-indicator\"></span> you know how to reach me. <span class=\"pause-indicator\"></span> Have a great day!",
      responses: [
        { label: 'End Call', next: 'call_success' }
      ]
    },
    gatekeeper_intro: {
      stage: 'Gatekeeper',
      text: "{{day.part}}, this is {{agent.first_name}}. I'm calling about {{account.name}}'s power bills. Who handles those there?",
      responses: [
        { label: "That's [name]", next: 'gatekeeper_request_transfer' },
        { label: 'Power bills?', next: 'gatekeeper_electricity_confusion' },
        { label: 'What is this about?', next: 'gatekeeper_clarify_purpose' },
        { label: 'Are you our supplier?', next: 'gatekeeper_clarify_purpose' }
      ]
    },
    gatekeeper_electricity_confusion: {
      stage: 'Gatekeeper - Clarify Bills',
      text: (function() {
        const data = getLiveData();
        const employees = data.account?.employees || 0;
        return getSizedGateKeeperOpener(employees) + ' Who handles those there?';
      })(),
      responses: [
        { label: "That's [name]", next: 'gatekeeper_request_transfer' },
        { label: 'What about the bills?', next: 'gatekeeper_clarify_purpose' },
        { label: 'We have electricity...', next: 'gatekeeper_clarify_purpose' },
        { label: 'Not sure', next: 'gatekeeper_fallback_clarity' }
      ]
    },
    gatekeeper_clarify_purpose: {
      stage: 'Gatekeeper - Clarify Purpose',
      text: "Someone who looks at the electricity bills and decides on suppliers or contracts. Who handles that there?",
      responses: [
        { label: "That's [name]", next: 'gatekeeper_request_transfer' },
        { label: 'Still not sure?', next: 'gatekeeper_fallback_clarity' },
        { label: 'They transferred me', next: 'gatekeeper_request_transfer' }
      ]
    },
    gatekeeper_request_transfer: {
      stage: 'Gatekeeper - Request Transfer',
      text: "Perfect. Can you connect me with them please?",
      responses: [
        { label: 'They transfer you', next: 'gatekeeper_transferred' },
        { label: 'They need more info', next: 'gatekeeper_clarify_purpose' },
        { label: "They're busy", next: 'gatekeeper_busy' },
        { label: 'They decline', next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_fallback_clarity: {
      stage: 'Gatekeeper - Nuclear Clarity',
      text: "The person who gets the electric bill each month and signs the energy contracts.",
      responses: [
        { label: "That's [name]", next: 'gatekeeper_request_transfer' },
        { label: 'I understand now', next: 'gatekeeper_request_transfer' },
        { label: "They're not available", next: 'gatekeeper_busy' },
        { label: "We don't have that person", next: 'gatekeeper_info_capture' }
      ]
    },
    gatekeeper_busy: {
      stage: 'Gatekeeper',
      text: "I understand. When's usually a good time to reach them?",
      responses: [
        { label: "They give a time", next: 'gatekeeper_followup_time' },
        { label: "They prefer voicemail", next: 'gatekeeper_voicemail_offer' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_voicemail_offer: {
      stage: 'Gatekeeper',
      text: "I can leave a quick voicemail if you'd like; that way they have the details and can call me back if it's relevant.",
      responses: [
        { label: "Yes, leave voicemail", next: 'voicemail' },
        { label: "They give a time instead", next: 'gatekeeper_followup_time' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_followup_time: {
      stage: 'Gatekeeper - Scheduled',
      text: "Perfect. I'll reach out at that time. Should I also leave a brief voicemail now so they have context, or just wait until the time you mentioned?",
      responses: [
        { label: "Leave voicemail now", next: 'voicemail' },
        { label: "Just wait until that time", next: 'gatekeeper_scheduled' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_scheduled: {
      stage: 'Gatekeeper - Scheduled',
      text: "✅ <strong>Follow-up scheduled!</strong><br><br>You've successfully scheduled a call back time. Make sure to follow up when you said you would.",
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    gatekeeper_transferred: {
      stage: 'Gatekeeper - Transfer Complete',
      text: "<strong>HOLD FOR TRANSFER</strong> - You're being connected to the decision maker.",
      responses: [
        { label: 'Connected to decision maker', next: 'opening_quick_intro' },
        { label: 'Wrong person / gatekeeper again', next: 'gatekeeper_intro' },
        { label: 'Transfer failed', next: 'no_answer' }
      ]
    },
    gatekeeper_decline: {
      stage: 'Gatekeeper - Decline',
      text: "Thanks for your time. I'll try again later.",
      responses: [
        { label: 'Try again later', next: 'start' },
        { label: 'Leave voicemail instead', next: 'voicemail' },
        { label: 'Start New Call', next: 'start' }
      ]
    },
    gatekeeper_info_capture: {
      stage: 'Gatekeeper - Info Capture',
      text: "Sure. What's the best way to reach them? Email or phone?",
      responses: [
        { label: 'Shared contact info', next: 'followup_scheduled' }
      ]
    },
    asked_to_speak: {
      stage: 'Transfer',
      text: "Great! Can I tell them who's calling and what it's about?<br><br><em>HOLD FOR TRANSFER...</em>",
      responses: [
        { label: 'They transferred me', next: 'hook' },
        { label: "They said no thanks", next: 'respect_decision' }
      ]
    },
    voicemail: {
      stage: 'Voicemail',
      text: "<span class=\"tone-marker professional\">Voicemail Script (30 seconds - Keep It Short)</span><br><br>\"Hi {{contact.first_name}}, this is (your name) from Power Choosers.<br><br><span class=\"pause-indicator\"></span> I'm calling because we ran analysis on companies in your industry, and most are paying 15-20% more on electricity than they should be.<br><br><span class=\"pause-indicator\"></span> I wanted to see if {{account.name}} might be experiencing the same thing. <span class=\"pause-indicator\"></span> It's literally just a 15-minute conversation.<br><br><span class=\"pause-indicator\"></span> You can reach me at (your number) or find me on LinkedIn.<br><br><span class=\"pause-indicator\"></span> Again, (your name). Thanks.\"<br><br><em>✅ Name stated twice (they might only catch end)<br>✅ Specific problem (overpaying 15-20%)<br>✅ Time commitment clear (15 minutes)<br>✅ Two ways to reach you (phone + LinkedIn)<br>✅ Under 30 seconds</em>",
      responses: [
        { label: 'Left voicemail - move on', next: 'voicemail_left' },
        { label: 'Start New Call', next: 'start' }
      ]
    },
    voicemail_left: {
      stage: 'Voicemail',
      text: "✅ <strong>Voicemail Left!</strong><br><br><strong>Next Steps:</strong><br>• Wait 3-5 days before second callback (not same day)<br>• Send LinkedIn connection request<br>• Move to next prospect<br><br><strong>Remember:</strong> Leave this voicemail ONCE. Don't sound needy on follow-ups.",
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    second_callback: {
      stage: 'Second Callback',
      text: "<span class=\"tone-marker confident\">Second Callback Script (More Direct)</span><br><br>\"Hey {{contact.first_name}}, (your name), Power Choosers— <span class=\"pause-indicator\"></span> calling back real quick.<br><br><span class=\"pause-indicator\"></span> Last time I tried to reach you, I mentioned we audit electricity costs. <span class=\"pause-indicator\"></span> Honestly, the reason I'm persistent is because we typically find that 60-70% of companies are overpaying just because they haven't had a second opinion in a while.<br><br><span class=\"pause-indicator\"></span> You might not be one of them— <span class=\"pause-indicator\"></span> your broker might have you dialed in perfectly. <span class=\"pause-indicator\"></span> But wouldn't it be worth 15 minutes to know for sure?<br><br><span class=\"pause-indicator\"></span> I'm going to stop by your LinkedIn, but reach out if you want to chat.\"<br><br><em>✅ Acknowledges previous attempt<br>✅ Explains WHY you're calling again<br>✅ Admits they might not need it (credibility)<br>✅ Quantifies gap (60-70% overpaying)<br>✅ Moves to LinkedIn (omnichannel)</em>",
      responses: [
        { label: 'They answered - proceed', next: 'hook' },
        { label: 'Left second voicemail', next: 'second_callback_sent' },
        { label: 'Start New Call', next: 'start' }
      ]
    },
    second_callback_sent: {
      stage: 'Second Callback',
      text: "✅ <strong>Second Callback Complete!</strong><br><br><strong>Next Steps:</strong><br>• Move to email outreach (Day 5)<br>• Send LinkedIn message (Day 10)<br>• One more call attempt (Day 15)<br>• Then respect the no<br><br><strong>Remember:</strong> 5+ follow-ups close 80% of deals. This is part of the process!",
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    no_answer: {
      stage: 'No Answer',
      text: "<span class=\"tone-marker professional\">No one answered. What's your next move?</span><br><br><em>Tip: If this is a first attempt, leave a voicemail. If you've called before, consider the second callback approach.</em>",
      responses: [
        { label: 'Leave voicemail (first attempt)', next: 'voicemail' },
        { label: 'Second callback (called before)', next: 'second_callback' },
        { label: 'Hang up & try later', next: 'start' },
        { label: 'Try different number', next: 'dialing' }
      ]
    },
    call_success: {
      stage: 'Complete',
      text: '📞 <strong>Call Ended</strong><br><br>Call Summary:<br>• Duration: ~4-6 minutes<br>• Outcome: Professional close<br>• Key Learning: Not every call closes, but professional respect opens doors for future opportunities.<br><br>Ready for the next prospect?',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    }
  };

  let state = {
    current: 'start',
    history: [],
    overrideContactId: null,
    problemPath: null,  // Track which problem path was taken for dynamic consequence routing
    monthlySpend: null,  // Store entered monthly spend value
    aiScript: null,      // Store AI-generated script
    isAIActive: false,   // Whether AI script view is active
    isAILoading: false   // Whether AI script is being generated
  };

  // Phase definitions with entry points (PEACE Framework aligned)
  const PHASES = [
    { name: 'Pre-Call', stagePattern: 'Pre-Call Prep', entryPoint: 'pre_call_qualification' },
    { name: 'Opening', stagePattern: 'Opening', entryPoint: 'hook' },
    { name: 'Broker Audit', stagePattern: 'Broker Audit', entryPoint: 'broker_audit_intro' },
    { name: 'Situation', stagePattern: 'Discovery - Situation', entryPoint: 'situation_discovery' },
    { name: 'Problem', stagePattern: 'Discovery - Problem', entryPoint: 'problem_discovery' },
    { name: 'Consequence', stagePattern: 'Discovery - Consequence', entryPoint: 'consequence_discovery' },
    { name: 'Solution', stagePattern: 'Discovery - Solution', entryPoint: 'solution_discovery' },
    { name: 'Audit Results', stagePattern: 'Audit Presentation', entryPoint: 'audit_presentation_gap' },
    { name: 'Closing', stagePattern: 'Closing', entryPoint: 'close_meeting' },
    { name: 'Objections', stagePattern: 'Objection Handling', entryPoint: 'objection_not_interested' },
    { name: 'Success', stagePattern: 'Success', entryPoint: 'meeting_scheduled' }
  ];

  // Track completed phases
  let completedPhases = new Set();
  let lastPhase = null;

  // Opener management (PEACE Framework - 5 Tested Openers)
  const OPENER_CONFIGS = {
    default: {
      key: 'pattern_interrupt_opening',
      label: 'Permission + Empathy (Primary)',
      state: 'pattern_interrupt_opening',
      description: 'PEACE-aligned. Best for: Decision-makers who value respect for their time. Highest conversion - permission-based reduces early hang-ups.'
    },
    direct_question: {
      key: 'opener_direct_question',
      label: 'Second Opinion',
      state: 'opener_direct_question',
      description: 'Best for: Prospects skeptical of their current broker. Non-threatening framing.'
    },
    social_proof: {
      key: 'opener_social_proof',
      label: 'Market Data',
      state: 'opener_social_proof',
      description: 'Best for: Building credibility with market intelligence. Third-party data is credible.'
    },
    quick_check: {
      key: 'opener_quick_check',
      label: 'Audit Positioning',
      state: 'opener_quick_check',
      description: 'Best for: Explaining your unique value upfront. Immediately clear what you do.'
    },
    transparent: {
      key: 'opener_transparent',
      label: 'Transparent',
      state: 'opener_transparent',
      description: 'Best for: Disarming skeptical prospects. Full transparency builds trust.'
    }
  };

  let currentOpener = OPENER_CONFIGS.default;
  let availableOpeners = [
    OPENER_CONFIGS.direct_question,
    OPENER_CONFIGS.social_proof,
    OPENER_CONFIGS.quick_check,
    OPENER_CONFIGS.transparent
  ];

  // Expose opener state for phone widget to sync (will be set up later when module is fully initialized)

  // Elements
  function els() {
    return {
      display: document.getElementById('call-scripts-display'),
      responses: document.getElementById('call-scripts-responses'),
      backBtn: document.getElementById('call-scripts-back'),
      backToPreviousBtn: document.getElementById('call-scripts-back-to-previous'),
      restartBtn: document.getElementById('call-scripts-restart'),
      toolbar: document.getElementById('call-scripts-toolbar')
    };
  }


  // Smoothly animate a container's height during content changes (FLIP)
  function animateContainerResize(el, applyChangesFn, duration = 320) {
    try {
      if (!el) return applyChangesFn();
      const startHeight = el.getBoundingClientRect().height;
      el.style.height = startHeight + 'px';
      el.style.overflow = 'hidden';
      el.style.transition = `height ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

      // Apply content changes
      applyChangesFn();

      // Double RAF for reliable layout after DOM mutations
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const endHeight = el.scrollHeight;
          if (Math.abs(endHeight - startHeight) > 1) {
            el.style.height = endHeight + 'px';
          } else {
            // No height change, just cleanup immediately
            el.style.height = '';
            el.style.transition = '';
            el.style.overflow = '';
            return;
          }

          const cleanup = () => {
            el.style.height = '';
            el.style.transition = '';
            el.style.overflow = '';
          };

          const timer = setTimeout(cleanup, duration + 50);
          el.addEventListener('transitionend', function handler(ev) {
            if (ev.propertyName === 'height') {
              clearTimeout(timer);
              cleanup();
            }
          }, { once: true });
        });
      });
    } catch (_) {
      try { applyChangesFn(); } catch (e) { }
    }
  }

  // Update hook responses to use current opener
  function updateHookOpener() {
    if (FLOW.hook && FLOW.hook.responses) {
      FLOW.hook.responses.forEach(response => {
        if (response.label === 'Yes, speaking' || response.label === "Who's calling?") {
          response.next = currentOpener.state;
        }
      });
    }
    // Also update gatekeeper transfer to point to current opener
    if (FLOW.gatekeeper_transferred && FLOW.gatekeeper_transferred.responses) {
      FLOW.gatekeeper_transferred.responses.forEach(response => {
        if (response.label === 'Connected to decision maker') {
          response.next = currentOpener.state;
        }
      });
    }
  }

  // Firebase persistence for opener selection
  async function saveOpenerSelection(openerKey) {
    try {
      if (!window.firebaseDB) return;
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const getCurrentUserId = () => {
        try {
          if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
            return window.firebase.auth().currentUser.uid;
          }
        } catch (_) { }
        return null;
      };

      const email = getUserEmail();
      const userId = getCurrentUserId();
      if (!email) return;

      // Use per-user document pattern from settings.js
      const docId = `call-scripts-${email}`;
      const docRef = window.firebaseDB.collection('settings').doc(docId);

      const updateData = {
        openerKey: openerKey,
        ownerId: email,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (userId) updateData.userId = userId;

      // Check if document exists
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.update(updateData);
      } else {
        // Create new document with proper ownerId
        await docRef.set({
          ...updateData,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (err) {
      console.warn('[Call Scripts] Could not save opener selection:', err);
    }
  }

  // Load saved opener preference on init
  async function loadSavedOpener() {
    try {
      if (!window.firebaseDB) return;
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const email = getUserEmail();
      if (!email) return;

      // Use per-user document like settings.js
      const docId = `call-scripts-${email}`;
      const doc = await window.firebaseDB.collection('settings').doc(docId).get();

      if (doc.exists) {
        const data = doc.data();
        if (data && data.openerKey) {
          const savedOpener = Object.values(OPENER_CONFIGS).find(o => o.key === data.openerKey);
          if (savedOpener) {
            // Reset to clean initial state first
            const allOpeners = [
              OPENER_CONFIGS.default,
              OPENER_CONFIGS.direct_question,
              OPENER_CONFIGS.transparent,
              OPENER_CONFIGS.social_proof,
              OPENER_CONFIGS.quick_check
            ];

            // Set current opener to saved one
            currentOpener = savedOpener;

            // Build availableOpeners: all openers except the saved one
            availableOpeners = allOpeners.filter(o => o.key !== savedOpener.key);

            updateHookOpener();
          }
        } else {
          // No saved opener - ensure clean initial state
          currentOpener = OPENER_CONFIGS.default;
          availableOpeners = [
            OPENER_CONFIGS.direct_question,
            OPENER_CONFIGS.transparent,
            OPENER_CONFIGS.social_proof,
            OPENER_CONFIGS.quick_check
          ];
        }
      } else {
        // No document - ensure clean initial state
        currentOpener = OPENER_CONFIGS.default;
        availableOpeners = [
          OPENER_CONFIGS.direct_question,
          OPENER_CONFIGS.transparent,
          OPENER_CONFIGS.social_proof,
          OPENER_CONFIGS.quick_check
        ];
      }
    } catch (err) {
      console.warn('[Call Scripts] Could not load saved opener:', err);
      // On error, reset to clean initial state
      currentOpener = OPENER_CONFIGS.default;
      availableOpeners = [
        OPENER_CONFIGS.direct_question,
        OPENER_CONFIGS.transparent,
        OPENER_CONFIGS.social_proof,
        OPENER_CONFIGS.quick_check
      ];
    }
  }

  // Build phase navigation
  function buildPhaseNavigation() {
    const page = document.getElementById('call-scripts-page');
    if (!page) return;

    const existingNav = document.getElementById('call-scripts-phase-nav');
    if (existingNav) existingNav.remove();

    const node = FLOW[state.current] || FLOW.start;
    const currentStage = node.stage || '';
    // Handle gatekeeper states as part of Opening phase
    let currentPhaseName = '';
    if (state.current && state.current.startsWith('gatekeeper_')) {
      currentPhaseName = 'Opening';
    } else {
      currentPhaseName = PHASES.find(p => currentStage.includes(p.stagePattern))?.name || '';
      // Also check for Opening or Gatekeeper stages
      if (!currentPhaseName && (currentStage === 'Opening' || currentStage.includes('Gatekeeper'))) {
        currentPhaseName = 'Opening';
      }
    }

    const nav = document.createElement('div');
    nav.id = 'call-scripts-phase-nav';
    nav.className = 'phase-navigation';
    nav.innerHTML = PHASES.map(phase => {
      const isActive = !state.isAIActive && currentPhaseName === phase.name;
      let classes = 'action-btn'; // Use existing .action-btn class
      if (isActive) classes += ' active';
      // Removed completed state - don't mark previous phases as completed
      return `<button class="${classes}" data-phase="${phase.name}" data-entry="${phase.entryPoint}">${phase.name}</button>`;
    }).join('');

    // Add AI Button
    const aiBtn = document.createElement('button');
    aiBtn.className = `action-btn ai-toggle-btn ${state.isAIActive ? 'active' : ''}`;
    aiBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
      AI Script
    `;
    aiBtn.addEventListener('click', () => {
      if (state.isAIActive) {
        state.isAIActive = false;
        render();
      } else {
        if (state.aiScript) {
          state.isAIActive = true;
          render();
        } else {
          fetchAIScript();
        }
      }
    });
    nav.appendChild(aiBtn);

    // Insert before script display
    const display = document.getElementById('call-scripts-display');
    if (display && display.parentElement) {
      display.parentElement.insertBefore(nav, display);
    }

    // Attach click handlers
    nav.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entryPoint = btn.getAttribute('data-entry');
        if (entryPoint && FLOW[entryPoint]) {
          state.isAIActive = false; // Deactivate AI view when switching phases
          go(entryPoint);
        }
      });
    });

    // Mark phase as completed when moving to next phase
    if (lastPhase && lastPhase !== currentPhaseName && lastPhase) {
      completedPhases.add(lastPhase);
    }
    lastPhase = currentPhaseName;
  }

  // Build opener selector
  function buildOpenerSelector() {
    const page = document.getElementById('call-scripts-page');
    if (!page) return;

    const existingSelector = document.getElementById('call-scripts-opener-selector');
    if (existingSelector) existingSelector.remove();

    // Only show when in opening phase or hook
    const node = FLOW[state.current] || FLOW.start;
    const showSelector = state.current === 'hook' || node.stage === 'Opening';
    if (!showSelector) return;

    const selector = document.createElement('div');
    selector.id = 'call-scripts-opener-selector';
    selector.className = 'opener-selector';

    // Build list of all openers, avoiding duplicates
    const seenKeys = new Set();
    const allOpeners = [];

    // Add current opener first
    if (currentOpener && !seenKeys.has(currentOpener.key)) {
      allOpeners.push(currentOpener);
      seenKeys.add(currentOpener.key);
    }

    // Add available openers (excluding current)
    availableOpeners.forEach(opener => {
      if (opener && opener.key && !seenKeys.has(opener.key) && opener.key !== currentOpener.key) {
        allOpeners.push(opener);
        seenKeys.add(opener.key);
      }
    });

    selector.innerHTML = `
      <div class="opener-selector-label">Choose Your Opener:</div>
      <div class="opener-buttons">
        ${allOpeners.map(opener => {
      const isActive = currentOpener.key === opener.key;
      return `<button class="opener-btn ${isActive ? 'active' : ''}" data-opener="${opener.key}">${opener.label}</button>`;
    }).join('')}
      </div>
    `;

    // Insert after phase navigation (or at top if no phase nav yet)
    const phaseNav = document.getElementById('call-scripts-phase-nav');
    const display = document.getElementById('call-scripts-display');
    if (phaseNav) {
      phaseNav.insertAdjacentElement('afterend', selector);
    } else if (display && display.parentElement) {
      display.parentElement.insertBefore(selector, display);
    }

    // Attach click handlers
    selector.querySelectorAll('.opener-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const openerKey = btn.getAttribute('data-opener');
        // Find opener in all openers list (current + available)
        const allOpenersList = [currentOpener, ...availableOpeners];
        const opener = allOpenersList.find(o => o.key === openerKey);
        if (opener && currentOpener.key !== opener.key) {
          // Swap: move current opener to available list, make selected the default
          const oldDefault = currentOpener;
          currentOpener = opener;
          availableOpeners = availableOpeners.filter(o => o.key !== opener.key);
          availableOpeners.push(oldDefault);

          updateHookOpener();
          buildOpenerSelector();

          // Save to Firebase immediately
          saveOpenerSelection(openerKey);

          // If we're at opening phase, jump to the new opener to update script display
          if (state.current === 'hook' || state.current === 'pattern_interrupt_opening' ||
            state.current.startsWith('opener_')) {
            state.history.push({
              current: state.current,
              responseLabel: `Switched to ${opener.label} opener`
            });
            state.current = opener.state;
            render();
          }
        }
      });
    });
  }

  // Update opener selector visibility
  function updateOpenerSelectorVisibility() {
    const selector = document.getElementById('call-scripts-opener-selector');
    if (!selector) return;

    const node = FLOW[state.current] || FLOW.start;
    const showSelector = state.current === 'hook' || node.stage === 'Opening';
    selector.style.display = showSelector ? 'block' : 'none';
  }

  // AI Script Generation
  async function fetchAIScript() {
    if (state.isAILoading) return;
    
    const { contact, account } = getLiveData();
    if (!contact && !account) {
      alert('Please select a contact or account first to generate a personalized script.');
      return;
    }

    state.isAILoading = true;
    state.isAIActive = true;
    render();

    try {
      const response = await fetch('/api/ai/generate-call-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact,
          account,
          context: {
            company: account?.name || contact?.company || ''
          }
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to generate script');
      }

      state.aiScript = data?.script || '';
    } catch (err) {
      console.error('[Call Scripts] AI Error:', err);
      state.aiScript = `<div class="error-msg">Failed to generate AI script. Please try again.</div>`;
    } finally {
      state.isAILoading = false;
      render();
    }
  }

  function render() {
    const { display, responses, backBtn } = els();
    const node = FLOW[state.current] || FLOW.start;

    // Update hook to use current opener
    updateHookOpener();

    // Build phase navigation
    buildPhaseNavigation();

    // Build opener selector
    buildOpenerSelector();

    if (display) {
      let html = '';
      
      if (state.isAIActive) {
        if (state.isAILoading) {
          html = `
            <div class="ai-skeleton-loader">
              <div class="skeleton-line shimmer" style="width: 40%; height: 24px; margin-bottom: 20px;"></div>
              <div class="skeleton-line shimmer" style="width: 90%; height: 16px; margin-bottom: 12px;"></div>
              <div class="skeleton-line shimmer" style="width: 85%; height: 16px; margin-bottom: 12px;"></div>
              <div class="skeleton-line shimmer" style="width: 95%; height: 16px; margin-bottom: 24px;"></div>
              <div class="skeleton-line shimmer" style="width: 30%; height: 20px; margin-bottom: 16px;"></div>
              <div class="skeleton-line shimmer" style="width: 80%; height: 16px; margin-bottom: 12px;"></div>
              <div class="skeleton-line shimmer" style="width: 88%; height: 16px;"></div>
            </div>
          `;
        } else if (state.aiScript) {
          // Convert markdown-style headers if present, or just wrap in div
          const formatted = state.aiScript
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/### (.*)/g, '<h3 class="ai-header">$1</h3>')
            .replace(/## (.*)/g, '<h2 class="ai-header">$1</h2>');
          
          html = `
            <div class="ai-script-container">
              <div class="ai-badge">AI PERSONALIZED SCRIPT</div>
              <div class="ai-content">${formatted}</div>
            </div>
          `;
        }
      } else {
        html = renderTemplate(node.text || '', 'text');
      }

      // Animate script display height change after initial render
      if (state._didInitialRender) {
        animateContainerResize(display, () => { display.innerHTML = html; }, 260);
      } else {
        display.innerHTML = html;
      }
    }

    if (responses) {
      // Rebuild response buttons with an animated resize
      const buildResponses = () => {
        responses.innerHTML = '';
        responses.classList.remove('full-width');

        if (state.current === 'start') {
          const btn = document.createElement('button');
          btn.className = 'dial-btn';
          btn.type = 'button';
          btn.textContent = 'Dial';
          btn.addEventListener('click', () => go('pre_call_qualification'));
          responses.appendChild(btn);
          responses.classList.add('full-width');
        } else if (state.current === 'situation_discovery' ||
          state.current === 'ack_confident_handle' ||
          state.current === 'ack_struggling' ||
          state.current === 'ack_no_idea' ||
          state.current === 'ack_dq_confident' ||
          state.current === 'ack_dq_struggling' ||
          state.current === 'ack_vendor_handling') {
          // Special handling for monthly spend input - all states that ask about monthly spending
          const inputWrap = document.createElement('div');
          inputWrap.className = 'monthly-spend-input-wrap';
          inputWrap.style.cssText = 'width: 100%; margin-bottom: 12px;';

          const label = document.createElement('label');
          label.textContent = 'Monthly Spend:';
          label.style.cssText = 'display: block; margin-bottom: 6px; color: var(--text-primary); font-size: 14px;';
          inputWrap.appendChild(label);

          const inputContainer = document.createElement('div');
          inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

          const dollarSign = document.createElement('span');
          dollarSign.textContent = '$';
          dollarSign.style.cssText = 'color: var(--text-primary); font-size: 16px; font-weight: 500;';
          inputContainer.appendChild(dollarSign);

          const input = document.createElement('input');
          input.type = 'number';
          input.placeholder = 'Enter amount (e.g., 5000)';
          input.min = '0';
          input.step = '100';
          input.className = 'monthly-spend-input';
          input.style.cssText = 'flex: 1; padding: 10px 12px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-main); color: var(--text-primary); font-size: 16px;';
          if (state.monthlySpend) {
            input.value = state.monthlySpend;
          }
          inputContainer.appendChild(input);
          inputWrap.appendChild(inputContainer);
          responses.appendChild(inputWrap);

          const nextBtn = document.createElement('button');
          nextBtn.className = 'response-btn';
          nextBtn.type = 'button';
          nextBtn.textContent = 'Continue';
          nextBtn.style.cssText = 'width: 100%; margin-bottom: 8px;';
          const handleContinue = () => {
            const value = parseFloat(input.value);
            if (value && value > 0) {
              state.monthlySpend = value;
              go('situation_monthly_spend', `Spending $${value.toLocaleString()} monthly`);
            } else {
              alert('Please enter a valid monthly spend amount.');
            }
          };
          nextBtn.addEventListener('click', handleContinue);
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              handleContinue();
            }
          });
          responses.appendChild(nextBtn);

          // Add "Don't know offhand" button (different labels based on state)
          const dontKnowLabel = state.current === 'ack_no_idea' ? "Honestly don't have a guess" :
            state.current === 'ack_confident_handle' || state.current === 'ack_dq_confident' || state.current === 'ack_dq_struggling' ? "Don't know exact amount" :
              "Don't know offhand";
          const dontKnowBtn = document.createElement('button');
          dontKnowBtn.className = 'response-btn';
          dontKnowBtn.type = 'button';
          dontKnowBtn.textContent = dontKnowLabel;
          dontKnowBtn.style.cssText = 'width: 100%;';
          dontKnowBtn.addEventListener('click', () => {
            state.monthlySpend = null;
            go('situation_monthly_spend', dontKnowLabel);
          });
          responses.appendChild(dontKnowBtn);
          responses.classList.add('full-width');
        } else {
          (node.responses || []).forEach(r => {
            const b = document.createElement('button');
            b.className = 'response-btn';
            b.type = 'button';
            b.textContent = r.label;
            const nextKey = r.next || '';
            if (nextKey) {
              b.addEventListener('click', () => go(nextKey, r.label));
            }
            responses.appendChild(b);
          });
          if ((node.responses || []).length === 1) responses.classList.add('full-width');
        }
      };

      if (state._didInitialRender) {
        animateContainerResize(responses, buildResponses, 200);
      } else {
        buildResponses();
      }
    }

    if (backBtn) {
      backBtn.disabled = state.history.length === 0;
    }

    // Mark initial render completed so subsequent renders animate
    state._didInitialRender = true;
  }

  function go(next, responseLabel) {
    if (!next || !FLOW[next]) return;
    state.history.push({
      current: state.current,
      responseLabel: responseLabel || ''
    });
    state.current = next;
    render();
  }

  function back() {
    if (state.history.length === 0) return;
    const prev = state.history.pop();
    state.current = typeof prev === 'object' ? prev.current : prev;
    render();
  }

  function restart() {
    state.current = 'start';
    state.history = [];
    state.monthlySpend = null;
    completedPhases.clear();
    lastPhase = null;
    // Don't reset currentOpener here - it should persist from loadSavedOpener()
    // Only reset if no opener has been loaded (first time)
    if (currentOpener === OPENER_CONFIGS.default || !currentOpener) {
      currentOpener = OPENER_CONFIGS.default;
      availableOpeners = [
        OPENER_CONFIGS.direct_question,
        OPENER_CONFIGS.transparent,
        OPENER_CONFIGS.social_proof,
        OPENER_CONFIGS.quick_check
      ];
    }
    render();
  }

  function handleBackToPrevious() {
    console.log('[Call Scripts] Back button clicked, checking navigation source...');

    // Check if we have a stored navigation source
    const navigationSource = window._callScriptsNavigationSource;
    const returnState = window._callScriptsReturn;

    console.log('[Call Scripts] Navigation source:', navigationSource, 'Return state:', returnState);

    if (navigationSource && returnState) {
      // Clear the navigation variables first
      window._callScriptsNavigationSource = null;
      window._callScriptsReturn = null;

      // Navigate back to the source page
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage(navigationSource);

        // Dispatch restore event after a short delay to ensure page is ready
        setTimeout(() => {
          const restoreEvent = new CustomEvent(`pc:${navigationSource}-restore`, {
            detail: returnState
          });
          document.dispatchEvent(restoreEvent);
          console.log(`[Call Scripts] Dispatched pc:${navigationSource}-restore event with state:`, returnState);
        }, 100);
      }
    } else {
      // Fallback: go to dashboard if no navigation source
      console.log('[Call Scripts] No navigation source found, going to dashboard');
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('dashboard');
      }
    }
  }

  function bind() {
    const { backBtn, backToPreviousBtn, restartBtn, toolbar } = els();
    if (backBtn && !backBtn._bound) { backBtn.addEventListener('click', back); backBtn._bound = true; }
    if (backToPreviousBtn && !backToPreviousBtn._bound) {
      backToPreviousBtn.addEventListener('click', handleBackToPrevious);
      backToPreviousBtn._bound = true;
    }
    if (restartBtn && !restartBtn._bound) { restartBtn.addEventListener('click', restart); restartBtn._bound = true; }

    // Ensure the contact search UI exists under the title
    try { ensureContactSearchUI(); } catch (_) { }

    // Inject Widgets control (square button + hoverable drawer) to the right of Restart
    if (toolbar && !toolbar._widgetsBound) {
      try {
        // Create divider
        const divider = document.createElement('span');
        divider.className = 'toolbar-divider';
        divider.setAttribute('aria-hidden', 'true');

        // Create wrap with button and drawer
        const wrap = document.createElement('div');
        wrap.className = 'widgets-wrap';
        wrap.id = 'call-scripts-widgets-wrap';
        wrap.innerHTML = `
          <button class="btn-primary widgets-btn" id="call-scripts-open-widgets" aria-label="Widgets" aria-haspopup="menu" aria-expanded="false" data-pc-title="Widgets">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="6" height="6"></rect>
              <rect x="15" y="3" width="6" height="6"></rect>
              <rect x="3" y="15" width="6" height="6"></rect>
              <rect x="15" y="15" width="6" height="6"></rect>
            </svg>
          </button>
          <div class="widgets-drawer" role="menu" aria-label="Widgets">
            <button type="button" class="widget-item" data-widget="health" title="Energy Health Check" aria-label="Energy Health Check" role="menuitem" tabindex="-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </button>
            <button type="button" class="widget-item" data-widget="deal" title="Deal Calculator" aria-label="Deal Calculator" role="menuitem" tabindex="-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </button>
            <button type="button" class="widget-item" data-widget="notes" title="Notes" aria-label="Notes" role="menuitem" tabindex="-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M4 4h12a2 2 0 0 1 2 2v10l-4 4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                <path d="M14 20v-4a2 2 0 0 1 2-2h4"/>
              </svg>
            </button>
          </div>`;

        // Insert after Restart
        if (restartBtn && restartBtn.parentElement === toolbar) {
          restartBtn.insertAdjacentElement('afterend', divider);
          divider.insertAdjacentElement('afterend', wrap);
        } else {
          toolbar.appendChild(divider);
          toolbar.appendChild(wrap);
        }

        // Open/close behavior mirrors Account Detail widgets
        const btn = wrap.querySelector('#call-scripts-open-widgets');
        const drawer = wrap.querySelector('.widgets-drawer');
        const openNow = () => {
          clearTimeout(wrap._closeTimer);
          if (!wrap.classList.contains('open')) {
            wrap.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
          }
        };
        const closeSoon = () => {
          clearTimeout(wrap._closeTimer);
          wrap._closeTimer = setTimeout(() => {
            wrap.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          }, 240);
        };
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); wrap.classList.toggle('open'); btn.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false'); });
        wrap.addEventListener('mouseenter', openNow);
        wrap.addEventListener('mouseleave', closeSoon);
        wrap.addEventListener('focusin', openNow);
        wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) closeSoon(); });

        // Item click -> open that widget only
        if (drawer && !drawer._bound) {
          drawer.addEventListener('click', (e) => {
            const item = e.target.closest && e.target.closest('.widget-item');
            if (!item) return;
            const which = item.getAttribute('data-widget');
            try {
              const { contact } = getLiveData();
              const contactId = contact && (contact.id || contact.contactId || contact._id);
              if (!contactId) { window.crm?.showToast && window.crm.showToast('No contact detected'); return; }
              if (which === 'health') { try { window.Widgets?.openHealth && window.Widgets.openHealth(contactId); } catch (_) { } }
              else if (which === 'deal') { try { window.Widgets?.openDeal && window.Widgets.openDeal(contactId); } catch (_) { } }
              else if (which === 'notes') { try { window.Widgets?.openNotes && window.Widgets.openNotes(contactId); } catch (_) { } }
              else if (which === 'maps') { try { window.Widgets?.openMaps && window.Widgets.openMaps(contactId); } catch (_) { } }
              closeSoon();
            } catch (err) { console.warn('Widget open failed', err); }
          });
          drawer._bound = true;
        }

        toolbar._widgetsBound = true;
      } catch (_) { /* noop */ }
    }
  }

  // ===== Contact search UI (autocomplete) =====
  function ensureContactSearchUI() {
    const page = document.getElementById('call-scripts-page');
    if (!page) return;
    const header = page.querySelector('.page-header .page-title-section');
    if (!header) return;
    if (header.querySelector('#call-scripts-search-wrap')) return; // already added

    const wrap = document.createElement('div');
    wrap.id = 'call-scripts-search-wrap';
    wrap.className = 'contact-search-wrap';
    wrap.innerHTML = `
      <div class="contact-search-inner">
        <input type="text" id="call-scripts-contact-search" class="search-input-small" placeholder="Search contact for this call…" aria-label="Search contact" autocomplete="off"/>
        <div id="call-scripts-search-suggestions" class="search-suggestions" role="listbox" aria-label="Contact suggestions" hidden></div>
      </div>
    `;
    // Insert directly below the title
    const title = header.querySelector('.page-title');
    if (title && title.parentElement === header) {
      title.insertAdjacentElement('afterend', wrap);
    } else {
      header.appendChild(wrap);
    }

    wireSearchHandlers();
    // Seed from current live context
    updateSearchFromContext();
  }

  function getAccountKeyForMatch(a) {
    return String((a && (a.accountName || a.name || a.companyName || '')) || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildSuggestions(query) {
    const input = document.getElementById('call-scripts-contact-search');
    const panel = document.getElementById('call-scripts-search-suggestions');
    if (!input || !panel) return;
    const q = String(query || '').trim().toLowerCase();
    const people = getPeopleCache();
    const { account, contact: liveContact } = getLiveData();
    const accKey = getAccountKeyForMatch(account);
    const isLive = !!(getPhoneWidgetContext()?.isActive);

    // Score contacts
    const scored = people.map(p => {
      const name = String(p.name || (p.firstName || '') + ' ' + (p.lastName || '')).trim();
      const email = String(p.email || '').toLowerCase();
      const phone = String(p.workDirectPhone || p.mobile || p.otherPhone || p.phone || '');
      const company = String(p.companyName || p.company || p.accountName || '');
      let score = 0;
      if (accKey) {
        const ck = getAccountKeyForMatch({ accountName: company });
        if (ck && (ck === accKey || ck.includes(accKey) || accKey.includes(ck))) score += 50; // strong boost for same company
      }
      if (!q) {
        // no query: prioritize same-company contacts and live contact
        if (liveContact && p.id === liveContact.id) score += 25;
      } else {
        const qq = q;
        if (name.toLowerCase().includes(qq)) score += 30;
        if (email.includes(qq)) score += 20;
        if (company.toLowerCase().includes(qq)) score += 10;
        if (String(phone).replace(/\D/g, '').includes(qq.replace(/\D/g, ''))) score += 15;
      }
      return { p, score, name, email, phone, company };
    }).filter(x => x.score > 0 || !q); // when query, require matches; temporary for no-query handling below

    scored.sort((a, b) => b.score - a.score);
    let top = scored;
    // Exact/prefix match preference when NOT in a live call
    if (q && !isLive) {
      const qn = normName(q);
      const exact = scored.filter(({ name }) => normName(name) === qn);
      if (exact.length) {
        top = exact;
      } else {
        const prefix = scored.filter(({ name }) => normName(name).startsWith(qn));
        if (prefix.length) top = prefix;
      }
    }
    // If no query and we have an account context, prefer ONLY same-company contacts
    if (!q && accKey) {
      const sameCo = scored.filter(({ company }) => {
        const ck = getAccountKeyForMatch({ accountName: company });
        return ck && (ck === accKey || ck.includes(accKey) || accKey.includes(ck));
      });
      if (sameCo.length) top = sameCo; // restrict to same-company when available
    }
    top = top.slice(0, 5);

    if (top.length === 0) {
      panel.innerHTML = '<div class="suggestion-empty">No matches</div>';
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    panel.innerHTML = top.map(({ p, name, email, company }) => {
      const cid = String(p.id || p.contactId || p._id || '');
      const label = escapeHtml(name || '(No name)');
      const title = escapeHtml(p.title || p.jobTitle || '');
      const companyName = escapeHtml(company || '');

      // Get first letter for glyph
      const firstLetter = (name || '?').charAt(0).toUpperCase();

      return `<div class="suggestion-item" role="option" data-contact-id="${escapeHtml(cid)}">
        <div class="sugg-glyph">${firstLetter}</div>
        <div class="sugg-content">
          <div class="sugg-name">${label}</div>
          <div class="sugg-company">${companyName || '&nbsp;'}</div>
          <div class="sugg-title">${title || '&nbsp;'}</div>
        </div>
      </div>`;
    }).join('');
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closeSuggestions() {
    const panel = document.getElementById('call-scripts-search-suggestions');
    const input = document.getElementById('call-scripts-contact-search');
    if (!panel) return;
    panel.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function setSelectedContact(contactId) {
    state.overrideContactId = contactId ? String(contactId) : null;
    // Update input value
    try {
      const input = document.getElementById('call-scripts-contact-search');
      if (input) {
        const people = getPeopleCache();
        const sel = people.find(p => {
          const pid = String(p.id || '');
          const alt1 = String(p.contactId || '');
          const alt2 = String(p._id || '');
          const target = String(contactId || '');
          return pid === target || alt1 === target || alt2 === target;
        });
        const nm = sel ? (sel.name || ((sel.firstName || '') + ' ' + (sel.lastName || ''))).trim() : '';
        input.value = nm || '';
      }
    } catch (_) { }
    // Close suggestions if open
    try { closeSuggestions(); } catch (_) { }
    // Re-render scripts with new context
    render();
  }

  function updateSearchFromContext() {
    const input = document.getElementById('call-scripts-contact-search');
    if (!input) return;
    // Do not override when user has explicitly selected a contact
    if (typeof state !== 'undefined' && state && state.overrideContactId) return;
    const { contact, account } = getLiveData();
    // Don't auto-fill name - keep search bar empty for user to type
    // const liveName = (contact && (contact.name || ((contact.firstName||'') + ' ' + (contact.lastName||''))).trim()) || '';
    // if (liveName) input.value = liveName;

    // If calling a company number (no live contact id but have account), pre-open suggestions with that account's contacts
    const hasContactId = !!(contact && contact.id);
    const hasAccount = !!(account && (account.accountName || account.name || account.companyName));
    if (!hasContactId && hasAccount) {
      // Don't auto-open suggestions - let user type to search
      // buildSuggestions('');
    }
  }

  function wireSearchHandlers() {
    const input = document.getElementById('call-scripts-contact-search');
    const panel = document.getElementById('call-scripts-search-suggestions');
    if (!input || !panel) return;

    // Don't auto-show suggestions on focus - only show when user types
    input.addEventListener('focus', () => {
      // Only show suggestions if there's already text in the input
      if (input.value.trim()) {
        buildSuggestions(input.value);
      }
    });
    input.addEventListener('input', () => {
      const val = input.value || '';
      buildSuggestions(val);
      if (!val.trim()) {
        // If user clears the input, drop override and fall back to live context
        state.overrideContactId = null;
        render();
        return;
      }
      // If the current input exactly matches one contact name, auto-select it
      try {
        const qVal = normName(val);
        if (!qVal) return;
        const people = getPeopleCache();
        const exactMatches = people.filter(p => normName(p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))) === qVal);
        if (exactMatches.length === 1) {
          setSelectedContact(exactMatches[0].id || exactMatches[0].contactId || exactMatches[0]._id);
        }
      } catch (_) { }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSuggestions(); return; }
      if (e.key === 'Enter') {
        // Prefer exact name match if present, otherwise choose first visible suggestion
        const items = Array.from(panel.querySelectorAll('.suggestion-item'));
        const qVal = normName(input.value || '');
        const exactItem = items.find(it => normName(it.querySelector('.sugg-name')?.textContent) === qVal);
        const pick = exactItem || items[0] || null;
        if (pick) {
          const id = pick.getAttribute('data-contact-id');
          if (id) setSelectedContact(id);
        }
        closeSuggestions();
        e.preventDefault();
      }
      if (e.key === 'Tab') {
        // On Tab, attempt an exact match selection so variables populate even without click
        const items = Array.from(panel.querySelectorAll('.suggestion-item'));
        const qVal = normName(input.value || '');
        const exactItem = items.find(it => normName(it.querySelector('.sugg-name')?.textContent) === qVal);
        if (exactItem) {
          const id = exactItem.getAttribute('data-contact-id');
          if (id) setSelectedContact(id);
        }
        closeSuggestions();
      }
    });

    // On blur, if the input exactly matches one contact name, auto-select it
    input.addEventListener('blur', () => {
      try {
        const people = getPeopleCache();
        const qVal = normName(input.value || '');
        if (!qVal) return;
        const match = people.find(p => normName(p.name || ((p.firstName || '') + ' ' + (p.lastName || ''))) === qVal);
        if (match) {
          setSelectedContact(match.id);
        }
      } catch (_) { }
    });

    // Click selection
    panel.addEventListener('click', (e) => {
      const item = e.target.closest && e.target.closest('.suggestion-item');
      if (!item) return;
      const id = item.getAttribute('data-contact-id');
      if (id) setSelectedContact(id);
      closeSuggestions();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('call-scripts-search-wrap');
      if (!wrap) return;
      if (!wrap.contains(e.target)) closeSuggestions();
    });
  }

  function init() {
    bind();
    // Load saved opener preference first, then restart
    loadSavedOpener().then(() => {
      // Reset state when the page is shown (after opener is loaded)
      // restart() will preserve the loaded opener
      restart();
    }).catch(() => {
      // If loading fails, still restart with defaults
      restart();
    });
    // Re-render when phone widget in-call state toggles and refresh the search context
    try {
      const card = document.getElementById('phone-widget');
      if (card) {
        const obs = new MutationObserver(() => {
          try { render(); updateSearchFromContext(); } catch (_) { }
        });
        obs.observe(card, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) { }
  }

  // Eager-load opener preference on module load (so phone widget can use it)
  // This ensures opener is loaded even if user never visits call-scripts page
  (async () => {
    try {
      await loadSavedOpener();
      updateHookOpener();
    } catch (_) {
      // Silently fail - opener will load when page is visited
    }
  })();

  // Expose module
  if (!window.callScriptsModule) window.callScriptsModule = {};
  window.callScriptsModule.init = init;
  window.callScriptsModule.FLOW = FLOW;
  window.callScriptsModule.loadSavedOpener = loadSavedOpener; // Export for phone widget
  // Expose opener state for phone widget to sync
  Object.defineProperty(window.callScriptsModule, 'currentOpener', {
    get: () => currentOpener,
    set: (val) => { currentOpener = val; }
  });
  Object.defineProperty(window.callScriptsModule, 'availableOpeners', {
    get: () => availableOpeners,
    set: (val) => { availableOpeners = val; }
  });
  Object.defineProperty(window.callScriptsModule, 'OPENER_CONFIGS', {
    get: () => OPENER_CONFIGS
  });

  // Eager init if user is already on the Call Scripts page at load
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const page = document.getElementById('call-scripts-page');
      if (page && page.classList.contains('active')) {
        init();
      }
    } catch (_) { /* noop */ }
  });

})();
