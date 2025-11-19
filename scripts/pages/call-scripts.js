(function(){
  'use strict';

  // ===== Dynamic variables helpers (chips + live-call substitution) =====
  function escapeHtml(str){
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }
  function dayPart(){
    try {
      const h = new Date().getHours();
      if (h >= 5 && h < 12) return 'Good morning';
      if (h >= 12 && h < 17) return 'Good afternoon';
      if (h >= 17 && h <= 20) return 'Good evening';
      return 'Hello';
    } catch(_) { return 'Hello'; }
  }
  function getPhoneWidgetContext(){
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
    } catch(_) {}
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
      const number = (parts[1] || '').replace(/[^+\d]/g,'');
      return { name, company, number, isActive: inCall, contactId: null, accountId: null };
    } catch(_) {}
    return { name:'', company:'', number:'', isActive:false, contactId: null, accountId: null };
  }
  function splitName(full){
    const s = String(full||'').trim();
    if (!s) return { first:'', last:'', full:'' };
    const parts = s.split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || '', full: s };
  }
  function normName(s){
    return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  }
  function normalizeAccount(a){
    const obj = a ? {...a} : {};
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
  function formatDateMDY(v){
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
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch(_) { return String(v||''); }
  }
  
  function toMDY(v){
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
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch(_) { return String(v||''); }
  }
  function normalizeContact(c){
    const obj = c ? {...c} : {};
    const nameGuess = obj.name || ((obj.firstName||obj.first_name||'') + ' ' + (obj.lastName||obj.last_name||'')).trim();
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
    } catch(_) {
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
  function normPhone(p){ return String(p||'').replace(/\D/g,'').slice(-10); }
  function normDomain(email){ return String(email||'').split('@')[1]?.toLowerCase() || ''; }
  function getPeopleCache(){ try { return (typeof window.getPeopleData==='function' ? (window.getPeopleData()||[]) : []); } catch(_) { return []; } }
  function getAccountsCache(){ try { return (typeof window.getAccountsData==='function' ? (window.getAccountsData()||[]) : []); } catch(_) { return []; } }
  function findContactByNumberOrName(number, name){
    const people = getPeopleCache();
    const n10 = normPhone(number);
    const nm = String(name||'').toLowerCase();
    const norm = (p) => String(p||'').toLowerCase().replace(/\s+/g,' ').trim();
    const byNum = people.find(p=> {
      const candidates = [p.workDirectPhone, p.mobile, p.otherPhone, p.phone];
      return candidates.some(ph => normPhone(ph) === n10);
    });
    if (byNum) return byNum;
    if (nm) {
      return people.find(p => norm(`${p.firstName||''} ${p.lastName||''}`) === norm(name) || norm(p.name||p.fullName||'') === norm(name));
    }
    return null;
  }
  function findAccountForContact(contact){
    if (!contact) return null;
    const accounts = getAccountsCache();
    // 1) Direct accountId linkage if present
    try {
      const accId = contact.accountId || contact.account_id || contact.account || contact.companyId;
      if (accId) {
        const hitById = accounts.find(a => String(a.id || a.accountId || a._id) === String(accId));
        if (hitById) return hitById;
      }
    } catch(_) {}
    const clean = (s)=> String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
    const comp = clean(contact.company||contact.companyName||'');
    if (comp) {
      const hit = accounts.find(a=> {
        const an = clean(a.accountName||a.name||a.companyName||'');
        return an && (an===comp || an.includes(comp) || comp.includes(an));
      });
      if (hit) return hit;
    }
    const domain = normDomain(contact.email||'');
    if (domain) {
      const match = accounts.find(a=> {
        const d = String(a.domain||a.website||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
        return d && (domain.endsWith(d) || d.endsWith(domain));
      });
      if (match) return match;
    }
    return null;
  }

  function getLiveData(){
    const ctx = getPhoneWidgetContext();
    const nameParts = splitName(ctx.name || '');
    let contact = null; let account = null;
    
    // Priority 1: If user has manually selected a contact in the Call Scripts search, use that
    try {
      if (typeof state !== 'undefined' && state && state.overrideContactId) {
        const people = getPeopleCache();
        const sel = people.find(p => {
          const pid = String(p.id||'');
          const alt1 = String(p.contactId||'');
          const alt2 = String(p._id||'');
          const target = String(state.overrideContactId||'');
          return pid===target || alt1===target || alt2===target;
        });
        if (sel) contact = sel;
      }
    } catch(_) {}
    
    // Priority 2: If phone widget has contactId in context, use that (direct contact call)
    if (!contact && ctx.contactId) {
      try {
        const people = getPeopleCache();
        const found = people.find(p => {
          const pid = String(p.id||'');
          const alt1 = String(p.contactId||'');
          const alt2 = String(p._id||'');
          const target = String(ctx.contactId||'');
          return pid===target || alt1===target || alt2===target;
        });
        if (found) contact = found;
      } catch(_) {}
    }
    
    // Priority 3: Try to find contact by number or name
    if (!contact) {
      try {
        contact = findContactByNumberOrName(ctx.number, ctx.name) || {};
      } catch(_) { contact = {}; }
    }
    
    // Fallback to context if fields empty
    if (!contact.firstName && (ctx.name||'')) {
      const sp = splitName(ctx.name);
      contact.firstName = sp.first; contact.lastName = sp.last; contact.fullName = sp.full;
    }
    if (!contact.company && ctx.company) contact.company = ctx.company;
    // Normalize selected/derived contact fields so variables populate reliably
    try { contact = normalizeContact(contact); } catch(_) {}
    
    // Try to find account - prefer accountId from context, then from contact
    if (ctx.accountId) {
      try {
        const accounts = getAccountsCache();
        const found = accounts.find(a => {
          const aid = String(a.id||'');
          const alt1 = String(a.accountId||'');
          const alt2 = String(a._id||'');
          const target = String(ctx.accountId||'');
          return aid===target || alt1===target || alt2===target;
        });
        if (found) account = found;
      } catch(_) {}
    }
    
    // If no account found via accountId, try finding from contact
    if (!account) {
      try { account = findAccountForContact(contact) || {}; } catch(_) { account = {}; }
    }
    
    try { account = normalizeAccount(account); } catch(_) {}
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
  function chip(scope, key){
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
      'website': 'website'
    }[key] || String(key).replace(/_/g,' ').toLowerCase();
    const token = `{{${scope}.${key}}}`;
    return `<span class="var-chip" data-var="${scope}.${key}" data-token="${token}" contenteditable="false">${friendly}</span>`;
  }
  function renderTemplate(str, mode){
    if (!str) return '';
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
    
    // Get your name from settings (first name only from general settings)
    let yourName = '';
    try {
      const settings = SettingsPage.getSettings();
      if (settings && settings.general) {
        yourName = settings.general.firstName || '';
      }
    } catch (_) {
      // Fallback if settings not available
      yourName = '';
    }
    
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
  function isLiveCall(){
    try {
      const ctx = getPhoneWidgetContext();
      return !!ctx.isActive;
    } catch(_) { return false; }
  }

  // Improved Call Flow (Based on 2025 Best Practices + Gap Analysis)
  const FLOW = {
    start: {
      stage: 'Ready',
      text: "Click 'Dial' to begin the call.",
      responses: []
    },
    pre_call_qualification: {
      stage: 'Pre-Call Prep',
      text: "<strong>Before we dial... let's qualify this prospect.</strong><br><br><em>Think through these questions:</em><br><br>• Who are you calling? (Decision maker / Gatekeeper / Unknown)<br>• What's their industry?<br>• What research do you have on their situation?<br>• What's your FIRST OBJECTIVE? (Get meeting / Understand situation / Reserve price before rates rise / Build relationship)<br><br><strong>Key Insight:</strong> We work with ALL suppliers. Our value is reserving competitive rates BEFORE market prices increase, and running competitive events across 100+ suppliers.",
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
      text: '{{day.part}}, is this (contact name)?',
      responses: [
        { label: 'Yes, speaking', next: null }, // Will be set dynamically to currentOpener
        { label: "Who's calling?", next: null }, // Will be set dynamically to currentOpener
        { label: 'Gatekeeper', next: 'gatekeeper_intro' }
      ]
    },
    pattern_interrupt_opening: {
      stage: 'Opening',
      text: "Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> Real quick though - I'm noticing a pattern with most companies I talk to, they don't have a real strategy around electricity. <span class=\"pause-indicator\"></span> And honestly, they're leaving money on the table. <span class=\"pause-indicator\"></span> Do you feel like you have a solid handle on your electricity costs?",
      responses: [
        { label: "Yeah, we're on top of it", next: 'ack_confident_handle' },
        { label: "Not really, it's chaotic", next: 'ack_struggling' },
        { label: "No idea / not sure", next: 'ack_no_idea' },
        { label: "We have a vendor handling it", next: 'ack_vendor_handling' },
        { label: "Why do you ask? / What's this for?", next: 'ack_defensive' },
        { label: "We just renewed/locked in", next: 'ack_just_renewed' }
      ]
    },
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
      text: "<span class=\"tone-marker curious\">respectful, curious tone</span> <span class=\"pause-indicator\"></span> Okay, so you've got someone handling it - that's actually pretty smart. <span class=\"pause-indicator\"></span> Let me ask though, do you know roughly how much you're spending monthly? <span class=\"pause-indicator\"></span> Just want to see if there's any opportunity we might be missing.",
      responses: [] // Special handling - will render input field in render() function
    },
    ack_defensive: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker friendly\">honest, disarming tone</span> <span class=\"pause-indicator\"></span> Yeah, totally fair question. <span class=\"pause-indicator\"></span> I'm just trying to understand your situation before I spend your time with something that might not be relevant. <span class=\"pause-indicator\"></span> Most companies I talk to don't have a strategy around this, and it's costing them. <span class=\"pause-indicator\"></span> So I wanted to see if that's even something worth exploring with you. <span class=\"pause-indicator\"></span> Is that fair?",
      responses: [
        { label: "Fair enough, go ahead", next: 'situation_discovery' },
        { label: "I hear you, but what exactly?", next: 'value_proposition' },
        { label: "Now's not a good time", next: 'objection_bad_timing' },
        { label: "We're not interested", next: 'objection_not_interested' }
      ]
    },
    ack_just_renewed: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker curious\">curious, informative tone</span> <span class=\"pause-indicator\"></span> Okay, so you're locked in - when did you guys renew? <span class=\"pause-indicator\"></span> And just out of curiosity, roughly how much are you paying? <span class=\"pause-indicator\"></span> Might be worth knowing what the market is offering, just for reference down the road.",
      responses: [
        { label: "Renewed 3 months ago / amount known", next: 'future_opportunity' },
        { label: "Just locked in / locked until 2027+", next: 'future_opportunity' },
        { label: "Not sure exactly when", next: 'future_opportunity' },
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
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Sure, happy to explain. <span class=\"pause-indicator\"></span> Most companies I talk to don't have a strategy around electricity renewals - they wait until 60-90 days before contract expiry to start shopping. <span class=\"pause-indicator\"></span><br><br>The problem is that's peak season when suppliers are busy, rates are less negotiable, and you've got limited time. <span class=\"pause-indicator\"></span><br><br>What we do is help you shop 6-12 months ahead when suppliers are competing for business, so you lock in the best rates available. <span class=\"pause-indicator\"></span> Does that make sense?",
      responses: [
        { label: 'Yes, that makes sense', next: 'situation_discovery' },
        { label: 'Tell me more about the process', next: 'solution_faq_process' },
        { label: "Still not sure what this is about", next: 'value_justification' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    objection_bad_timing: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> Totally get it. <span class=\"pause-indicator\"></span> When would be a better time to chat? <span class=\"pause-indicator\"></span> Or would you prefer I just send you some information first so you can look it over when it's convenient?",
      responses: [
        { label: 'Send me information', next: 'email_first' },
        { label: 'What\'s the market context?', next: 'market_context' },
        { label: 'Try later today', next: 'schedule_followup' },
        { label: 'Try next week', next: 'schedule_followup' },
        { label: "Just forget it", next: 'respect_decision' }
      ]
    },
    objection_locked_in: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> I totally understand - you're locked in, so this isn't relevant right now. <span class=\"pause-indicator\"></span> Here's what I'd suggest though: when you're about 6 months out from your next renewal, that's when it makes sense to start shopping competitively. <span class=\"pause-indicator\"></span><br><br>Would it be okay if I reach out around that time? <span class=\"pause-indicator\"></span> Or would you prefer I just send some information now for reference down the road?",
      responses: [
        { label: 'Yes, reach out in 6 months', next: 'schedule_followup' },
        { label: 'Send information for later', next: 'email_first' },
        { label: "Not interested", next: 'respect_decision' }
      ]
    },
    opener_direct_question: {
      stage: 'Opening',
      text: "<span class=\"tone-marker confident\">confident, conversational tone</span> <span class=\"pause-indicator\"></span> Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> Real quick - I'm calling because most companies I talk to are either overpaying on their electricity or don't really have visibility into what they're spending. <span class=\"pause-indicator\"></span><br><br>Can I ask - how is {{account.name}} actually managing that right now?",
      responses: [
        { label: "Yeah, we're on top of it", next: 'ack_dq_confident' },
        { label: "Not really, it's kind of a mess", next: 'ack_dq_struggling' },
        { label: "We have someone handling it", next: 'ack_dq_delegated' },
        { label: "Why are you calling? / What's this about?", next: 'ack_dq_defensive' },
        { label: "Not interested / we're fine", next: 'ack_dq_not_interested' },
        { label: "We just locked in a contract", next: 'ack_dq_just_renewed' }
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
      text: "<span class=\"tone-marker curious\">curious tone</span> <span class=\"pause-indicator\"></span> Got it - so you've delegated it. <span class=\"pause-indicator\"></span> That's smart. <span class=\"pause-indicator\"></span> Just curious though - do you know what you're actually spending annually? <span class=\"pause-indicator\"></span> And who's your vendor right now?",
      responses: [
        { label: 'Know spending / vendor is known', next: 'situation_contract_expiry' },
        { label: 'Know spending / vendor unknown', next: 'situation_supplier_name' },
        { label: "Don't know spending or vendor", next: 'situation_monthly_spend' }
      ]
    },
    ack_dq_defensive: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker friendly\">honest, disarming tone</span> <span class=\"pause-indicator\"></span> Yeah, fair question. <span class=\"pause-indicator\"></span> I basically saw that most companies in your industry are overpaying without knowing it. <span class=\"pause-indicator\"></span> Thought it was worth exploring. <span class=\"pause-indicator\"></span> You opposed to a quick conversation?",
      responses: [
        { label: "Fair enough, let's talk", next: 'situation_discovery' },
        { label: "I hear you, but what exactly?", next: 'value_proposition' },
        { label: "Not interested", next: 'objection_not_interested' }
      ]
    },
    ack_dq_not_interested: {
      stage: 'Discovery - Transition',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> <span class=\"pause-indicator\"></span> No worries at all. <span class=\"pause-indicator\"></span> Quick thing though - when does your contract actually expire? <span class=\"pause-indicator\"></span> Just want to plant it on my radar for down the road.",
      responses: [
        { label: 'Know expiration date', next: 'schedule_followup' },
        { label: "Not sure", next: 'respect_decision' },
        { label: "Don't want to discuss", next: 'respect_decision' }
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
      text: "Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> I know this is random, but I'm calling about electricity costs. <span class=\"pause-indicator\"></span> Full transparency - this is a sales call. I know I'm calling you out of the blue. <span class=\"pause-indicator\"></span> Is now actually a bad time for a quick chat?",
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
        { label: 'Yes, I handle it well', next: 'situation_discovery' },
        { label: "Not really / I'm not sure", next: 'situation_discovery' },
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
      text: "Hi {{contact.first_name}}, this is (your name) from Power Choosers. <span class=\"pause-indicator\"></span> I've been working with several companies in {{account.city}}, and honestly, they're all dealing with rising electricity costs. <span class=\"pause-indicator\"></span> That's actually why I'm calling - wanted to see if you're experiencing something similar?",
      responses: [
        { label: 'Yes, costs have been going up', next: 'situation_discovery' },
        { label: "Not really an issue", next: 'opener_social_proof_skeptical' },
        { label: 'Tell me more', next: 'situation_discovery' },
        { label: 'Not interested', next: 'objection_not_interested' }
      ]
    },
    opener_social_proof_skeptical: {
      stage: 'Opening',
      text: "<span class=\"tone-marker curious\">curious tone</span> I totally get that, you know? <span class=\"pause-indicator\"></span> So let me ask you this though - are you aware of how much electricity rates have gone up in the last 4 years? <span class=\"pause-indicator\"></span> Like, the market has moved a LOT.",
      responses: [
        { label: 'I\'ve heard about rate increases', next: 'market_context' },
        { label: 'Not really aware', next: 'market_context' },
        { label: 'Still not interested', next: 'objection_not_interested' }
      ]
    },
    opener_quick_check: {
      stage: 'Opening',
      text: "Real quick—did I catch you in the middle of something, or do you have 30 seconds?<br><br><span class=\"pause-indicator\"></span> Got it. <span class=\"pause-indicator\"></span> So I'm basically the glue between electricity suppliers and account holders like you here in Texas. <span class=\"pause-indicator\"></span> The writing's kind of on the wall for next year—energy expenses are trending up, and a lot of companies are addressing it now instead of waiting until it hits their budget.<br><br>Have you already extended your energy agreements past 2026, or is that still open?",
      responses: [
        { label: "We've extended / locked in past 2026", next: 'ack_just_renewed' },
        { label: "Still open / contract expires before 2027", next: 'situation_discovery' },
        { label: "Not sure / need to check", next: 'situation_contract_expiry' },
        { label: "What's this about?", next: 'ack_defensive' },
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
      text: "<span class=\"tone-marker serious\">pause, then real tone</span> <span class=\"pause-indicator\"></span> Look - most companies wait until 90 days before renewal to shop. <span class=\"pause-indicator\"></span> That's a bad play. Rates have typically gone up, and suppliers know you don't have much time before your contract expires, so they'll give you a higher quote. <span class=\"pause-indicator\"></span><br><br>It's almost like booking a plane ticket <span class=\"pause-indicator\"></span> - when you go on a flight, do you reserve that flight months in advance or the week before? <span class=\"pause-indicator\"></span><br><br>Exactly. The more seats available on the plane, the cheaper the ticket. <span class=\"pause-indicator\"></span><br><br>Electricity works the same way but on a massive scale. <span class=\"pause-indicator\"></span> The earlier you reserve your price, the more supply is actually available. And with electricity prices rising right now, that gap is huge - we're seeing companies forced to pay 30%, 50%, sometimes 100% more. <span class=\"pause-indicator\"></span><br><br>Companies are being forced to pay that premium just because of timing. <span class=\"pause-indicator\"></span><br><br>What do you think?",
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
      text: "<span class=\"tone-marker confident\">calm, peer-to-peer tone</span> <span class=\"pause-indicator\"></span> Okay, so here's what makes sense. <span class=\"pause-indicator\"></span> We've identified that timing is your leverage. <span class=\"pause-indicator\"></span> The earlier you lock something in, the better rates you get. <span class=\"pause-indicator\"></span><br><br>So here's what I'm thinking - we could do a quick 15-minute video walkthrough right now where I show you exactly how the process works. <span class=\"pause-indicator\"></span> Then you'll KNOW what you're getting into before we schedule the full analysis. <span class=\"pause-indicator\"></span> Or we can set up a quick 30-minute call where I walk you through exactly what we pulled from the market right now. <span class=\"pause-indicator\"></span><br><br>No pressure, no commitment - just data so you can make an informed decision. <span class=\"pause-indicator\"></span><br><br>What works better - video walkthrough now or scheduled call?",
      responses: [
        { label: 'Video walkthrough now', next: 'video_walkthrough' },
        { label: 'Friday works for call', next: 'close_meeting_scheduled' },
        { label: 'Tomorrow works for call', next: 'close_meeting_scheduled' },
        { label: 'I need to check with my team first', next: 'close_meeting_team_involved' },
        { label: 'Let me think about it', next: 'close_meeting_think_about_it' },
        { label: 'Send me something first', next: 'email_first' }
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
      text: "<span class=\"tone-marker curious\">non-threatening, validation tone</span> <span class=\"pause-indicator\"></span> So here's what I propose - let me run a quick rate analysis. <span class=\"pause-indicator\"></span> I'll pull what the market's actually quoting right now, compare it to what you're paying, and show you if there's a gap. <span class=\"pause-indicator\"></span><br><br>No obligation, no strings. <span class=\"pause-indicator\"></span> Just data. <span class=\"pause-indicator\"></span> If you're actually getting a good deal, I'll tell you that too. <span class=\"pause-indicator\"></span><br><br>We could do a quick 15-minute video walkthrough right now where I show you exactly how the analysis works. <span class=\"pause-indicator\"></span> Then you'll KNOW what you're getting into. <span class=\"pause-indicator\"></span> Or takes me about 3 days to pull everything, then we hop on a quick call and I show you what I found. <span class=\"pause-indicator\"></span><br><br>What works better - video walkthrough now or Thursday afternoon call?",
      responses: [
        { label: 'Video walkthrough now', next: 'video_walkthrough' },
        { label: 'Thursday works', next: 'close_meeting_scheduled' },
        { label: 'Thursday afternoon works', next: 'close_meeting_scheduled' },
        { label: 'What\'s this going to cost me?', next: 'close_meeting_cost_question' },
        { label: 'Seems like a lot of work', next: 'close_meeting_work_concern' },
        { label: 'Send me something first', next: 'email_first' }
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
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. <span class=\"pause-indicator\"></span> I'll send you a calendar invite right now so we block it in. <span class=\"pause-indicator\"></span> This way I can have your numbers pulled and ready to go. <span class=\"pause-indicator\"></span><br><br>Looking forward to showing you what we found.",
      responses: [
        { label: 'Great, looking forward to it', next: 'meeting_scheduled' },
        { label: 'Sounds good', next: 'meeting_scheduled' }
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
    close_meeting: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> <span class=\"pause-indicator\"></span> Perfect. So what you're really looking for is [REFLECT THEIR ANSWER - competitive rates / budget certainty / handling complexity]. <span class=\"pause-indicator\"></span> Here's what I'm thinking - we schedule a quick 15-minute call where I show you exactly what's available in the market right now versus what you're paying. <span class=\"pause-indicator\"></span> This helps you lock in competitive rates before the market moves, you know? <span class=\"pause-indicator\"></span> No pressure, no obligation - just so you have all the information to make the best decision.<br><br>What works better for you - Tuesday or Wednesday?",
      responses: [
        { label: 'Tuesday works', next: 'meeting_scheduled' },
        { label: 'Wednesday works', next: 'meeting_scheduled' },
        { label: 'Send me something first', next: 'email_first' },
        { label: 'What would you prepare?', next: 'close_prep_question' }
      ]
    },
    close_prep_question: {
      stage: 'Closing',
      text: "<span class=\"tone-marker confident\">confident tone</span> Great question. <span class=\"pause-indicator\"></span> So what I'd do is pull competitive rates from 100+ suppliers in your market, compare them to what you're paying now, and show you exactly what you could save by locking those rates in before the market moves. <span class=\"pause-indicator\"></span><br><br>Plus I'd walk you through how our process works - basically, we handle everything, you just approve whichever option works best. <span class=\"pause-indicator\"></span> Make sense? <span class=\"pause-indicator\"></span> So Tuesday or Wednesday?",
      responses: [
        { label: 'Tuesday works', next: 'meeting_scheduled' },
        { label: 'Wednesday works', next: 'meeting_scheduled' },
        { label: 'Send email first', next: 'email_first' }
      ]
    },
    meeting_scheduled: {
      stage: 'Success',
      text: '✅ <strong>Meeting Scheduled!</strong><br><br>Great job! You successfully:<br>• Opened with pattern interrupt<br>• Led them through discovery<br>• Built emotional connection around consequences<br>• Closed for a meeting<br><br>Key wins: You stayed curious, asked follow-ups, and let THEM discover the pain.',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    email_first: {
      stage: 'Solution - Email First',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> Totally get it - no pressure. <span class=\"pause-indicator\"></span><br><br>Let me do this... I'll shoot you an email with a quick summary of what we talked about and what the next step would look like. <span class=\"pause-indicator\"></span> That way you've got it in writing and you can think it over. <span class=\"pause-indicator\"></span><br><br>If it makes sense after you think about it, just reply to that email and we'll get the quotes pulled. <span class=\"pause-indicator\"></span> If not, no worries at all. <span class=\"pause-indicator\"></span><br><br>Fair? <span class=\"pause-indicator\"></span><br><br>What's the best email to send that to?",
      responses: [
        { label: "Sure, it's [email]", next: 'email_captured' },
        { label: "Just send it to my work email", next: 'email_captured' },
        { label: "Actually, let's just do it now", next: 'close_meeting' },
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
    objection_not_interested: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> I totally understand. <span class=\"pause-indicator\"></span> Can I ask though <span class=\"pause-indicator\"></span> is it because you've already got a solution that's working great <span class=\"pause-indicator\"></span> or is it more that this just isn't a priority right now?",
      responses: [
        { label: 'Already have solution', next: 'objection_happy_supplier' },
        { label: 'Not a priority', next: 'objection_not_priority' },
        { label: 'What\'s the market context?', next: 'market_context' },
        { label: 'Just not interested', next: 'respect_decision' }
      ]
    },
    objection_happy_supplier: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker confident\">confident tone</span> That's fair. <span class=\"pause-indicator\"></span> And just so you know, we work with ALL suppliers - I'm not trying to switch you or anything like that. <span class=\"pause-indicator\"></span><br><br>What we do is run competitive events across 100+ suppliers so you can lock in the best rate available before the market moves. <span class=\"pause-indicator\"></span><br><br>So I gotta ask - have you shopped the market in the last 12 months to make sure you're getting the best rate available?",
      responses: [
        { label: 'Yes, recently shopped', next: 'probe_deeper' },
        { label: 'Not recently', next: 'consequence_variant_happy' },
        { label: "No, we haven't", next: 'consequence_variant_happy' }
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
    probe_deeper: {
      stage: 'Discovery',
      text: "<span class=\"tone-marker curious\">curious tone</span> Interesting. <span class=\"pause-indicator\"></span> And were the rates you're paying now better or worse than what's available in the market right now?",
      responses: [
        { label: "We're competitive", next: 'respect_decision' },
        { label: 'Rates went up', next: 'close_meeting' }
      ]
    },
    objection_not_priority: {
      stage: 'Objection Handling',
      text: "<span class=\"tone-marker understanding\">understanding tone</span> I get it. <span class=\"pause-indicator\"></span> Here's what I'd suggest: <span class=\"pause-indicator\"></span> when your contract comes up for renewal in the next 6-12 months, that's when we should talk. <span class=\"pause-indicator\"></span><br><br>Do you know roughly when that is?",
      responses: [
        { label: 'Yes, I know the date', next: 'schedule_followup' },
        { label: 'What\'s the market context?', next: 'market_context' },
        { label: 'Not sure', next: 'respect_decision' }
      ]
    },
    schedule_followup: {
      stage: 'Follow-up',
      text: "Perfect. <span class=\"pause-indicator\"></span> Let me put that on my calendar and I'll reach out 60 days before, you know? <span class=\"pause-indicator\"></span> Sound good?",
      responses: [
        { label: 'Yes, that works', next: 'followup_scheduled' },
        { label: 'Just forget it', next: 'respect_decision' }
      ]
    },
    followup_scheduled: {
      stage: 'Success',
      text: '✅ <strong>Follow-up Scheduled!</strong><br><br>Excellent! You:<br>• Respected their timeline<br>• Got specific renewal date<br>• Positioned for future outreach<br>• Left door open (not pushy)<br><br>This is often how deals close!',
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    respect_decision: {
      stage: 'Closing',
      text: "<span class=\"tone-marker professional\">professional tone</span> Fair enough. <span class=\"pause-indicator\"></span> I appreciate the time. <span class=\"pause-indicator\"></span> If anything changes or you want to explore options <span class=\"pause-indicator\"></span> you know how to reach me. <span class=\"pause-indicator\"></span> Have a great day!",
      responses: [
        { label: 'End Call', next: 'call_success' }
      ]
    },
    gatekeeper_intro: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker friendly\">friendly, confident tone</span> {{day.part}}, this is Lewis. <span class=\"pause-indicator\"></span> Just a quick question — how does your company typically handle energy contract renewals? <span class=\"pause-indicator\"></span> Is that something (CFO/Operations Manager/{{contact.first_name}}) handles?",
      responses: [
        { label: "Who should I connect you with?", next: 'gatekeeper_connect_request' },
        { label: "What is this about?", next: 'gatekeeper_what_about' },
        { label: "They're busy / Can I take a message?", next: 'gatekeeper_busy' },
        { label: "They transferred me", next: 'gatekeeper_transferred' },
        { label: "They decline / block", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_connect_request: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker friendly\">appreciative tone</span> Great, I appreciate that. <span class=\"pause-indicator\"></span> Could you please connect me with the person responsible for utilities or energy contracts?",
      responses: [
        { label: "They transferred me", next: 'gatekeeper_transferred' },
        { label: "They need more info", next: 'gatekeeper_what_about' },
        { label: "They said they're busy", next: 'gatekeeper_busy' },
        { label: "They declined", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_what_about: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker confident\">confident, value-focused tone</span> Question for you—when do electricity contract renewals typically happen for your company? Locking in early often saves companies 15-20% on their energy costs. <span class=\"pause-indicator\"></span> Would it be best to speak with the person managing those contracts?",
      responses: [
        { label: "They'll connect me", next: 'gatekeeper_transferred' },
        { label: "They need the person's name", next: 'gatekeeper_connect_request' },
        { label: "They're still busy", next: 'gatekeeper_busy' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_busy: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker understanding\">understanding, respectful tone</span> I understand. <span class=\"pause-indicator\"></span> When's usually a good time to reach them to discuss this time-sensitive window?",
      responses: [
        { label: "They give a time", next: 'gatekeeper_followup_time' },
        { label: "They prefer voicemail", next: 'gatekeeper_voicemail_offer' },
        { label: "They want to respect their time", next: 'gatekeeper_respect_time' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_voicemail_offer: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker helpful\">helpful tone</span> I can leave a quick voicemail if you'd like; that way they have the details and can call me back if it's relevant.",
      responses: [
        { label: "Yes, leave voicemail", next: 'voicemail' },
        { label: "They give a time instead", next: 'gatekeeper_followup_time' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_respect_time: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker understanding\">respectful tone</span> Thanks for letting me know. <span class=\"pause-indicator\"></span> I want to respect their time but also make sure they don't miss this. <span class=\"pause-indicator\"></span> When works best?",
      responses: [
        { label: "They give a time", next: 'gatekeeper_followup_time' },
        { label: "They prefer voicemail", next: 'gatekeeper_voicemail_offer' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_followup_time: {
      stage: 'Gatekeeper',
      text: "<span class=\"tone-marker professional\">professional tone</span> Perfect. <span class=\"pause-indicator\"></span> I'll reach out at that time. <span class=\"pause-indicator\"></span> Should I also leave a brief voicemail now so they have context, or just wait until the time you mentioned?",
      responses: [
        { label: "Leave voicemail now", next: 'voicemail' },
        { label: "Just wait until that time", next: 'gatekeeper_scheduled' },
        { label: "They decline", next: 'gatekeeper_decline' }
      ]
    },
    gatekeeper_scheduled: {
      stage: 'Gatekeeper - Scheduled',
      text: "✅ <strong>Follow-up scheduled!</strong><br><br>You've successfully scheduled a call back time. <span class=\"pause-indicator\"></span> Make sure to follow up when you said you would.",
      responses: [
        { label: 'Start New Call', next: 'start' }
      ]
    },
    gatekeeper_transferred: {
      stage: 'Gatekeeper - Transfer',
      text: "<span class=\"tone-marker professional\">professional tone</span> <strong>HOLD FOR TRANSFER...</strong><br><br><em>Once connected, immediately transition to your decision maker script.</em>",
      responses: [
        { label: 'Connected to decision maker', next: null }, // Will be set dynamically to currentOpener
        { label: 'Still gatekeeper / wrong person', next: 'gatekeeper_intro' },
        { label: 'Transfer failed / hung up', next: 'no_answer' }
      ]
    },
    gatekeeper_decline: {
      stage: 'Gatekeeper - Decline',
      text: "<span class=\"tone-marker professional\">professional, respectful tone</span> Thanks for your time. <span class=\"pause-indicator\"></span> I'll try again later. <span class=\"pause-indicator\"></span><br><br><em>Note: Consider noting the best time to call back or any alternative contacts if possible.</em>",
      responses: [
        { label: 'Try again later', next: 'start' },
        { label: 'Leave voicemail instead', next: 'voicemail' },
        { label: 'Start New Call', next: 'start' }
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
      text: "<span class=\"tone-marker professional\">professional tone</span> Voicemail detected. What would you say?<br><br><em>Tip: Keep it brief (20 seconds), mention specific reason for call, and give them permission to not call back.</em>",
      responses: [
        { label: 'Generic voicemail', next: 'vm_feedback1' },
        { label: 'Specific value voicemail', next: 'vm_feedback2' },
        { label: 'Start over', next: 'start' }
      ]
    },
    vm_feedback1: {
      stage: 'Feedback',
      text: "⚠️ <strong>That voicemail was too generic.</strong><br><br>It didn't include:<br>• Why you called specifically<br>• What you help with<br>• Permission for them to ignore it<br><br>Better approach: Be specific about their situation or market opportunity.",
      responses: [
        { label: 'Try again', next: 'voicemail' },
        { label: 'Next scenario', next: 'start' }
      ]
    },
    vm_feedback2: {
      stage: 'Feedback',
      text: "✅ <strong>Good voicemail!</strong><br><br>You mentioned:<br>• Specific reason for call<br>• Relevant market context<br>• Permission for them to not call back<br><br>That increases callback rate by 30%+",
      responses: [
        { label: 'Next scenario', next: 'start' },
        { label: 'Review call flow', next: 'start' }
      ]
    },
    no_answer: {
      stage: 'No Answer',
      text: "No one answered. What's your next move?",
      responses: [
        { label: 'Leave voicemail', next: 'voicemail' },
        { label: 'Hang up & call back later', next: 'start' },
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
    monthlySpend: null  // Store entered monthly spend value
  };

  // Phase definitions with entry points
  const PHASES = [
    { name: 'Pre-Call', stagePattern: 'Pre-Call Prep', entryPoint: 'pre_call_qualification' },
    { name: 'Opening', stagePattern: 'Opening', entryPoint: 'hook' },
    { name: 'Situation', stagePattern: 'Discovery - Situation', entryPoint: 'situation_discovery' },
    { name: 'Problem', stagePattern: 'Discovery - Problem', entryPoint: 'problem_discovery' },
    { name: 'Consequence', stagePattern: 'Discovery - Consequence', entryPoint: 'consequence_discovery' },
    { name: 'Solution', stagePattern: 'Discovery - Solution', entryPoint: 'solution_discovery' },
    { name: 'Closing', stagePattern: 'Closing', entryPoint: 'trial_close_1' },
    { name: 'Objections', stagePattern: 'Objection Handling', entryPoint: 'objection_not_interested' },
    { name: 'Success', stagePattern: 'Success', entryPoint: 'meeting_scheduled' }
  ];

  // Track completed phases
  let completedPhases = new Set();
  let lastPhase = null;

  // Opener management
  const OPENER_CONFIGS = {
    default: {
      key: 'pattern_interrupt_opening',
      label: 'Bold Direct (Default)',
      state: 'pattern_interrupt_opening'
    },
    direct_question: {
      key: 'opener_direct_question',
      label: 'Direct Question',
      state: 'opener_direct_question'
    },
    transparent: {
      key: 'opener_transparent',
      label: 'Transparent',
      state: 'opener_transparent'
    },
    social_proof: {
      key: 'opener_social_proof',
      label: 'Social Proof',
      state: 'opener_social_proof'
    },
    quick_check: {
      key: 'opener_quick_check',
      label: 'Quick Check',
      state: 'opener_quick_check'
    }
  };

  let currentOpener = OPENER_CONFIGS.default;
  let availableOpeners = [
    OPENER_CONFIGS.direct_question,
    OPENER_CONFIGS.transparent,
    OPENER_CONFIGS.social_proof,
    OPENER_CONFIGS.quick_check
  ];

  // Expose opener state for phone widget to sync (will be set up later when module is fully initialized)

  // Elements
  function els(){
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
          el.addEventListener('transitionend', function handler(ev){
            if (ev.propertyName === 'height') {
              clearTimeout(timer);
              cleanup();
            }
          }, { once: true });
        });
      });
    } catch(_) {
      try { applyChangesFn(); } catch(e) {}
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
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const getCurrentUserId = () => {
        try {
          if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
            return window.firebase.auth().currentUser.uid;
          }
        } catch(_) {}
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
    } catch(err) {
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
        } catch(_) {
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
    } catch(err) {
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
      const isActive = currentPhaseName === phase.name;
      let classes = 'action-btn'; // Use existing .action-btn class
      if (isActive) classes += ' active';
      // Removed completed state - don't mark previous phases as completed
      return `<button class="${classes}" data-phase="${phase.name}" data-entry="${phase.entryPoint}">${phase.name}</button>`;
    }).join('');

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

  function render(){
    const { display, responses, backBtn } = els();
    const node = FLOW[state.current] || FLOW.start;

    // Update hook to use current opener
    updateHookOpener();

    // Build phase navigation
    buildPhaseNavigation();

    // Build opener selector
    buildOpenerSelector();

    if (display){
      const html = renderTemplate(node.text || '', 'text');

      // Animate script display height change after initial render
      if (state._didInitialRender) {
        animateContainerResize(display, () => { display.innerHTML = html; }, 260);
      } else {
        display.innerHTML = html;
      }
    }

    if (responses){
      // Rebuild response buttons with an animated resize
      const buildResponses = () => {
        responses.innerHTML = '';
        responses.classList.remove('full-width');

        if (state.current === 'start'){
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

    if (backBtn){
      backBtn.disabled = state.history.length === 0;
    }

    // Mark initial render completed so subsequent renders animate
    state._didInitialRender = true;
  }

  function go(next, responseLabel){
    if (!next || !FLOW[next]) return;
    state.history.push({
      current: state.current,
      responseLabel: responseLabel || ''
    });
    state.current = next;
    render();
  }

  function back(){
    if (state.history.length === 0) return;
    const prev = state.history.pop();
    state.current = typeof prev === 'object' ? prev.current : prev;
    render();
  }

  function restart(){
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

  function handleBackToPrevious(){
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

  function bind(){
    const { backBtn, backToPreviousBtn, restartBtn, toolbar } = els();
    if (backBtn && !backBtn._bound){ backBtn.addEventListener('click', back); backBtn._bound = true; }
    if (backToPreviousBtn && !backToPreviousBtn._bound){ 
      backToPreviousBtn.addEventListener('click', handleBackToPrevious); 
      backToPreviousBtn._bound = true; 
    }
    if (restartBtn && !restartBtn._bound){ restartBtn.addEventListener('click', restart); restartBtn._bound = true; }

    // Ensure the contact search UI exists under the title
    try { ensureContactSearchUI(); } catch(_) {}

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
              if (which === 'health') { try { window.Widgets?.openHealth && window.Widgets.openHealth(contactId); } catch(_) {} }
              else if (which === 'deal') { try { window.Widgets?.openDeal && window.Widgets.openDeal(contactId); } catch(_) {} }
              else if (which === 'notes') { try { window.Widgets?.openNotes && window.Widgets.openNotes(contactId); } catch(_) {} }
              else if (which === 'maps') { try { window.Widgets?.openMaps && window.Widgets.openMaps(contactId); } catch(_) {} }
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
  function ensureContactSearchUI(){
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

  function getAccountKeyForMatch(a){
    return String((a && (a.accountName||a.name||a.companyName||''))||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  }

  function buildSuggestions(query){
    const input = document.getElementById('call-scripts-contact-search');
    const panel = document.getElementById('call-scripts-search-suggestions');
    if (!input || !panel) return;
    const q = String(query||'').trim().toLowerCase();
    const people = getPeopleCache();
    const { account, contact: liveContact } = getLiveData();
    const accKey = getAccountKeyForMatch(account);
    const isLive = !!(getPhoneWidgetContext()?.isActive);

    // Score contacts
    const scored = people.map(p => {
      const name = String(p.name || (p.firstName||'') + ' ' + (p.lastName||'')).trim();
      const email = String(p.email||'').toLowerCase();
      const phone = String(p.workDirectPhone||p.mobile||p.otherPhone||p.phone||'');
      const company = String(p.companyName||p.company||p.accountName||'');
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
        if (String(phone).replace(/\D/g,'').includes(qq.replace(/\D/g,''))) score += 15;
      }
      return { p, score, name, email, phone, company };
    }).filter(x => x.score > 0 || !q); // when query, require matches; temporary for no-query handling below

    scored.sort((a,b) => b.score - a.score);
    let top = scored;
    // Exact/prefix match preference when NOT in a live call
    if (q && !isLive) {
      const qn = normName(q);
      const exact = scored.filter(({name}) => normName(name) === qn);
      if (exact.length) {
        top = exact;
      } else {
        const prefix = scored.filter(({name}) => normName(name).startsWith(qn));
        if (prefix.length) top = prefix;
      }
    }
    // If no query and we have an account context, prefer ONLY same-company contacts
    if (!q && accKey) {
      const sameCo = scored.filter(({company}) => {
        const ck = getAccountKeyForMatch({ accountName: company });
        return ck && (ck === accKey || ck.includes(accKey) || accKey.includes(ck));
      });
      if (sameCo.length) top = sameCo; // restrict to same-company when available
    }
    top = top.slice(0, 5);

    if (top.length === 0) {
      panel.innerHTML = '<div class="suggestion-empty">No matches</div>';
      panel.hidden = false;
      input.setAttribute('aria-expanded','true');
      return;
    }

    panel.innerHTML = top.map(({p, name, email, company}) => {
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
    input.setAttribute('aria-expanded','true');
  }

  function closeSuggestions(){
    const panel = document.getElementById('call-scripts-search-suggestions');
    const input = document.getElementById('call-scripts-contact-search');
    if (!panel) return;
    panel.hidden = true;
    if (input) input.setAttribute('aria-expanded','false');
  }

  function setSelectedContact(contactId){
    state.overrideContactId = contactId ? String(contactId) : null;
    // Update input value
    try {
      const input = document.getElementById('call-scripts-contact-search');
      if (input) {
        const people = getPeopleCache();
        const sel = people.find(p => {
          const pid = String(p.id||'');
          const alt1 = String(p.contactId||'');
          const alt2 = String(p._id||'');
          const target = String(contactId||'');
          return pid===target || alt1===target || alt2===target;
        });
        const nm = sel ? (sel.name || ((sel.firstName||'') + ' ' + (sel.lastName||''))).trim() : '';
        input.value = nm || '';
      }
    } catch(_) {}
    // Close suggestions if open
    try { closeSuggestions(); } catch(_) {}
    // Re-render scripts with new context
    render();
  }

  function updateSearchFromContext(){
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
    const hasAccount = !!(account && (account.accountName||account.name||account.companyName));
    if (!hasContactId && hasAccount) {
      // Don't auto-open suggestions - let user type to search
      // buildSuggestions('');
    }
  }

  function wireSearchHandlers(){
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
        const exactMatches = people.filter(p => normName(p.name || ((p.firstName||'') + ' ' + (p.lastName||''))) === qVal);
        if (exactMatches.length === 1) {
          setSelectedContact(exactMatches[0].id || exactMatches[0].contactId || exactMatches[0]._id);
        }
      } catch(_) {}
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
        const match = people.find(p => normName(p.name || ((p.firstName||'') + ' ' + (p.lastName||''))) === qVal);
        if (match) {
          setSelectedContact(match.id);
        }
      } catch(_) {}
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

  function init(){
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
          try { render(); updateSearchFromContext(); } catch(_) {}
        });
        obs.observe(card, { attributes: true, attributeFilter: ['class'] });
      }
    } catch(_){ }
  }

  // Eager-load opener preference on module load (so phone widget can use it)
  // This ensures opener is loaded even if user never visits call-scripts page
  (async () => {
    try {
      await loadSavedOpener();
      updateHookOpener();
    } catch(_) {
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
