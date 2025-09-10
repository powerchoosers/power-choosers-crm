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
      if (h < 12) return 'morning';
      if (h < 17) return 'afternoon';
      return 'evening';
    } catch(_) { return 'day'; }
  }
  function getPhoneWidgetContext(){
    try {
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
      return { name, company, number, isActive: inCall };
    } catch(_) {}
    return { name:'', company:'', number:'', isActive:false };
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
      const d = new Date(v);
      if (isNaN(d.getTime())) return String(v); // keep raw if unparsable
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
    obj.phone = obj.phone || obj.mobile || obj.mobile_phone || obj.workDirectPhone || obj.otherPhone || '';
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
    const byNum = people.find(p=> normPhone(p.phone||p.mobile) === n10);
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
    try {
      contact = findContactByNumberOrName(ctx.number, ctx.name) || {};
    } catch(_) { contact = {}; }
    // Fallback to context if fields empty
    if (!contact.firstName && (ctx.name||'')) {
      const sp = splitName(ctx.name);
      contact.firstName = sp.first; contact.lastName = sp.last; contact.fullName = sp.full;
    }
    if (!contact.company && ctx.company) contact.company = ctx.company;
    // If user has manually selected a contact in the Call Scripts search, prefer that
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
    // Normalize selected/derived contact fields so variables populate reliably
    try { contact = normalizeContact(contact); } catch(_) {}
    try { account = findAccountForContact(contact) || {}; } catch(_) { account = {}; }
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
    // mode: 'chips' for placeholders as chips, 'text' to substitute plain text
    if (!str) return '';
    const dp = dayPart();
    const data = getLiveData();
    const values = {
      'day.part': dp,
      'contact.first_name': data.contact.firstName || data.contact.first || splitName(data.contact.name).first || splitName(data.ctx.name).first || '',
      'contact.last_name': data.contact.lastName || data.contact.last || splitName(data.contact.name).last || splitName(data.ctx.name).last || '',
      'contact.full_name': data.contact.fullName || data.contact.name || data.ctx.name || '',
      'contact.phone': data.contact.phone || data.contact.mobile || data.ctx.number || '',
      'contact.mobile': data.contact.mobile || '',
      'contact.email': data.contact.email || '',
      'contact.title': data.contact.title || data.contact.jobTitle || '',
      'account.name': data.account.accountName || data.account.name || data.contact.company || data.ctx.company || '',
      'account.industry': data.account.industry || data.contact.industry || '',
      'account.city': data.account.city || data.account.billingCity || data.account.locationCity || data.contact.city || '',
      'account.state': data.account.state || data.account.region || data.account.billingState || data.contact.state || '',
      'account.website': data.account.website || data.account.domain || normDomain(data.contact.email) || '',
      'account.supplier': data.account.supplier || data.account.currentSupplier || data.contact.supplier || data.contact.currentSupplier || '',
      'account.contract_end': formatDateMDY(data.account.contractEnd || data.account.contract_end || data.account.renewalDate || data.contact.contract_end || data.contact.contractEnd || '')
    };
    // Replace known tokens; render chips for contact/account if mode='chips'
    return String(str).replace(/\{\{\s*(day\.part|contact\.[a-z_]+|account\.[a-z_]+)\s*\}\}/gi, (m, key) => {
      const k = key.toLowerCase();
      const v = values[k] || '';
      if (mode === 'text') return escapeHtml(v || '');
      // chips mode
      if (k === 'day.part') return escapeHtml(dp);
      const [scope, sub] = k.split('.');
      return chip(scope, sub);
    });
  }
  function isLiveCall(){
    try {
      const ctx = getPhoneWidgetContext();
      return !!ctx.isActive;
    } catch(_) { return false; }
  }

  // Simple decision-tree for Call Scripts page (now supports dynamic placeholders)
  const FLOW = {
    start: {
      text: "Click 'Dial' to begin the call.",
      responses: []
    },
    dialing: {
      text: 'Dialing... Ringing...',
      responses: [
        { label: 'Call connected', next: 'hook' },
        { label: 'Transferred - decision maker answers', next: 'main_script_start' },
        { label: 'No answer', next: 'voicemail_or_hangup' }
      ]
    },

    // === Scheduling / Follow-up / Wrap nodes ===
    schedule_health_check: {
      text: "Perfect — I’ll set up a quick energy health check. What works best for you, {{contact.first_name}} — a 10-minute call today or tomorrow? I’ll bring ERCOT forward pricing so you can see it live for {{account.name}}.",
      responses: [
        { label: 'Book on calendar', next: 'closeForAppointment' },
        { label: 'Text me times', next: 'handleHesitation' },
        { label: 'Back', next: 'pathA_not_renewed' }
      ]
    },
    send_details_email: {
      text: "No problem — I’ll send a quick overview with ERCOT forward pricing and next steps for {{account.name}}. Do you want me to send it to {{contact.full_name}} at {{contact.email}} or is there a better address?",
      responses: [
        { label: 'Send now', next: 'discovery' },
        { label: 'Use a different email', next: 'discovery' },
        { label: 'Back', next: 'pathA_not_renewed' }
      ]
    },
    wrap_notes: {
      text: "Got it — thanks for the time today. I’ll note that {{account.name}} isn’t interested right now. If anything shifts with your contracts or pricing in {{account.city}}, I can circle back with a quick update.",
      responses: [
        { label: 'Log & end call', next: 'start' },
        { label: 'Back', next: 'pathA_not_renewed' }
      ]
    },
    voicemail_or_hangup: {
      text: 'No answer. What would you like to do?',
      responses: [
        { label: 'Leave voicemail', next: 'voicemail' },
        { label: 'Hang up / start new call', next: 'start' }
      ]
    },
    hook: {
      text: 'Good {{day.part}}, is this {{contact.first_name}}?',
      responses: [
        { label: 'Yes, this is', next: 'main_script_start' },
        { label: 'Speaking', next: 'main_script_start' },
        { label: "Who's calling?", next: 'main_script_start' },
        { label: 'Gatekeeper / not the right person', next: 'gatekeeper_intro' }
      ]
    },
    main_script_start: {
      text: "Perfect — So, my name is Lewis with PowerChoosers.com, and — I understand you're responsible for electricity agreements and contracts for {{account.name}}. Is that still accurate?",
      responses: [
        { label: "Yes, that's me / I handle that", next: 'pathA' },
        { label: 'That would be someone else / not the right person', next: 'gatekeeper_intro' },
        { label: 'We both handle it / team decision', next: 'pathA' },
        { label: 'Unsure or hesitant', next: 'pathD' } // pathD not explicitly defined in source; route to discovery instead
      ]
    },
    gatekeeper_intro: {
      text: 'Good {{day.part}}. I am looking to speak with someone over electricity agreements and contracts for {{account.name}} — do you know who would be responsible for that?',
      responses: [
        { label: "What's this about?", next: 'gatekeeper_whats_about' },
        { label: "I'll connect you", next: 'transfer_dialing' },
        { label: "They're not available / take a message", next: 'voicemail' }
      ]
    },
    gatekeeper_whats_about: {
      text: 'My name is Lewis with PowerChoosers.com and I am looking to speak with someone about the future electricity agreements for {{account.name}}. Who would be the best person for that?',
      responses: [
        { label: "I'll connect you", next: 'transfer_dialing' },
        { label: "They're not available / take a message", next: 'voicemail' },
        { label: 'I can help you', next: 'pathA' }
      ]
    },
    voicemail: {
      text: 'Good {{day.part}}, this is Lewis. Please call me back at 817-409-4215. I also sent a short email explaining why I am reaching out today. Thank you and have a great day.',
      responses: [
        { label: 'End call / start new call', next: 'start' }
      ]
    },
    pathA: {
      text: "Got it. now {{contact.first_name}}, we've been working with other {{account.industry}}'s in {{account.city}}, and my main job here — is to make sure account holders like yourself aren't — blind sided by next years' rate increases.. <br><br><span class=\"script-highlight\">How are <em>you</em> guys handling these — sharp increases for your future renewals?</span>",
      responses: [
        { label: "It's tough / struggling", next: 'pathA_struggling' },
        { label: 'Have not renewed / contract not up yet', next: 'pathA_not_renewed' },
        { label: 'Locked in / just renewed', next: 'pathA_locked_in' },
        { label: 'Shopping around / looking at options', next: 'pathA_shopping' },
        { label: 'Have someone handling it / work with broker', next: 'pathA_broker' },
        { label: "Haven't thought about it / what rate increase?", next: 'pathA_unaware' }
      ]
    },
    // === Branches from pathA ===
    pathA_struggling: {
      text: "Totally get it — {{contact.first_name}}. A lot of {{account.industry}} companies in {{account.city}} are dealing with high electricity bills and shady business practices. Do you know when your contract expires? <br><br>My job is to time the market and keep you informed so you're not caught off-guard by your supplier. Would it help if I offer you a free energy health check so you can get a better understanding where you're at — that way you can see what your options are?",
      responses: [
        { label: 'Yes, quick snapshot is helpful', next: 'discovery' },
        { label: 'What do you need from me?', next: 'discovery' },
        { label: 'Not now / later', next: 'voicemail_or_hangup' }
      ]
    },
    pathA_not_renewed: {
      text: "Makes sense — when it comes to getting the best price, it's pretty easy to renew at the wrong time and end up overpaying. When does your contract expire? Do you know who your supplier is? <br><br>Awesome — we work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take. <br><br><span class=\"script-highlight\">Would you be open to a quick, free energy health check so you can see how this would work?</span>",
      responses: [
        { label: 'Yes — schedule health check', next: 'schedule_health_check' },
        { label: 'Send me details by email', next: 'send_details_email' },
        { label: 'Not interested', next: 'wrap_notes' }
      ]
    },
    pathA_locked_in: {
      text: "Good to hear you’re covered. Quick sanity check — did you lock pre-increase or after the jump? If after, there may be a chance to re-rate or layer a future-start at a better position if the market relaxes. Want me to take a quick look at what’s possible for {{account.name}}?",
      responses: [
        { label: 'Sure, take a look', next: 'discovery' },
        { label: 'We’re fine as-is', next: 'voicemail_or_hangup' },
        { label: 'Tell me more on re-rating', next: 'discovery' }
      ]
    },
    pathA_shopping: {
      text: "Great — then let’s make sure you have leverage. Other {{account.industry}} accounts in {{account.city}} are comparing fixed vs. hybrid structures and watching forward curves. I can send a clean apples-to-apples view for {{account.name}} so you’re not guessing. Want me to spin that up?",
      responses: [
        { label: 'Yes, send apples-to-apples', next: 'discovery' },
        { label: 'Already have options', next: 'discovery' },
        { label: 'Circle back next week', next: 'voicemail_or_hangup' }
      ]
    },
    pathA_broker: {
      text: "All good — we work alongside existing brokers often. My angle is purely market timing and contract mechanics so {{account.name}} doesn’t overpay. If I spot a price window that beats what you’re seeing, I’ll flag it. Want me to keep an eye out and share any meaningful dips?",
      responses: [
        { label: 'Yes, keep me posted', next: 'discovery' },
        { label: 'We’re set with our broker', next: 'voicemail_or_hangup' },
        { label: 'What would you need?', next: 'discovery' }
      ]
    },
    pathA_unaware: {
      text: "Fair question — rates stepped up across most markets this year, and many {{account.industry}} accounts in {{account.city}} only feel it at renewal. My role is to get ahead of that so {{account.name}} isn’t surprised. Quick baseline: when roughly is your next expiration, and do you prefer fixed or a blended approach?",
      responses: [
        { label: 'Share expiration month', next: 'discovery' },
        { label: 'Not sure / need to check', next: 'discovery' },
        { label: 'We’ll deal with it later', next: 'voicemail_or_hangup' }
      ]
    },
    discovery: {
      text: 'Got it. Just so I understand your situation a little better — What is your current approach to renewing your electricity agreements: do you handle it internally or work with a consultant?',
      responses: [
        { label: 'Prospect is engaged / ready for appointment', next: 'closeForAppointment' },
        { label: 'Prospect is hesitant / needs more info', next: 'handleHesitation' },
        { label: 'Objection: happy with current provider', next: 'objHappy' },
        { label: 'Objection: no time', next: 'objNoTime' }
      ]
    },
    closeForAppointment: {
      text: "Awesome — I believe you'll benefit from a more strategic procurement approach so you don't pay more than necessary. Our process is simple: we start with an energy health check to review usage and contract terms, then discuss options for your company.",
      responses: [
        { label: 'Schedule Friday 11 AM', next: 'callSuccess' },
        { label: 'Schedule Monday 2 PM', next: 'callSuccess' },
        { label: 'Still hesitant', next: 'handleHesitation' }
      ]
    },
    handleHesitation: {
      text: 'I understand — I called you out of the blue and now might not be the best time. How about I put together a quick case study specific to companies like yours in your area?',
      responses: [
        { label: 'Yes, send analysis', next: 'callSuccess' },
        { label: 'No, not interested', next: 'softClose' }
      ]
    },
    objHappy: {
      text: "That's great to hear, and I'm not suggesting you need to switch providers today. Is it the customer service you value most, or are you getting a rate that's difficult to beat?",
      responses: [
        { label: 'Yes, worth understanding', next: 'closeForAppointment' },
        { label: 'No, not interested', next: 'softClose' }
      ]
    },
    objNoTime: {
      text: "I completely understand — that's exactly why many businesses end up overpaying. Energy is a complex market that requires ongoing attention that internal teams often do not have time for.",
      responses: [
        { label: 'Schedule 10-minute assessment', next: 'callSuccess' },
        { label: 'Still no time', next: 'softClose' }
      ]
    },
    softClose: {
      text: "No problem — energy strategy rarely feels urgent until it becomes critical. I'll add you to quarterly market updates.",
      responses: [
        { label: 'That sounds reasonable', next: 'callSuccess' },
        { label: 'No thanks', next: 'callEnd' }
      ]
    },
    callSuccess: {
      text: 'Call completed successfully. Remember to track: decision maker level; current contract status; pain points identified; interest level; next action committed.',
      responses: [
        { label: 'Start new call', next: 'start' }
      ]
    },
    callEnd: {
      text: 'Thanks for your time. Have a great day!',
      responses: [
        { label: 'Start new call', next: 'start' }
      ]
    },
    transfer_dialing: {
      text: 'Connecting... Ringing...',
      responses: [
        { label: 'Call connected', next: 'hook' },
        { label: 'Not connected', next: 'voicemail' }
      ]
    },
    // Fallback for pathD in original flow: route to discovery
    pathD: {
      text: 'Understood. Let me ask a quick question to make sure this is relevant — What is your current approach to renewals: handled internally or with a consultant?',
      responses: [
        { label: 'Continue', next: 'discovery' }
      ]
    }
  };

  let state = {
    current: 'start',
    history: [],
    overrideContactId: null
  };

  // Elements
  function els(){
    return {
      display: document.getElementById('call-scripts-display'),
      responses: document.getElementById('call-scripts-responses'),
      backBtn: document.getElementById('call-scripts-back'),
      restartBtn: document.getElementById('call-scripts-restart'),
      toolbar: document.getElementById('call-scripts-toolbar')
    };
  }

  function buildNodeText(key, node){
    // Default returns node.text. Some nodes get conditional text.
    const data = getLiveData();

    if (key === 'pathA_not_renewed') {
      const hasContractEnd = !!(data.account.contractEnd || data.account.contract_end || data.account.renewalDate);
      const hasSupplier = !!(data.account.supplier || data.account.currentSupplier);
      const intro = "Makes sense — when it comes to energy, it's pretty easy to renew at the wrong time and end up overpaying.";
      let middle = '';
      if (hasSupplier && !hasContractEnd) {
        middle = " So I understand you guys are using {{account.supplier}} — when does your contract expire?";
      } else if (!hasSupplier && hasContractEnd) {
        middle = " So I understand your contract expires in {{account.contract_end}} — who is your current supplier?";
      } else if (hasSupplier && hasContractEnd) {
        middle = " So I understand you guys are using {{account.supplier}} till {{account.contract_end}}.";
      } else {
        middle = " When does your contract expire? Do you know who your supplier is?";
      }
      const part2 = (hasSupplier && hasContractEnd)
        ? " <br><br>We work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take."
        : " <br><br>Awesome — we work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take.";
      const part3 = " <br><br><span class=\"script-highlight\">Would you be open to a quick, free energy health check so you can see how this would work?</span>";
      return intro + middle + part2 + part3;
    }

    if (key === 'pathA_struggling') {
      const hasContractEnd = !!(data.account.contractEnd || data.account.contract_end || data.account.renewalDate);
      const hasSupplier = !!(data.account.supplier || data.account.currentSupplier);
      const intro = "Totally get it — {{contact.first_name}}. A lot of {{account.industry}} companies in {{account.city}} are dealing with high electricity bills and shady business practices.";
      let middle = '';
      if (hasSupplier && !hasContractEnd) {
        middle = " So I understand you guys are using {{account.supplier}} — when does your contract expire?";
      } else if (!hasSupplier && hasContractEnd) {
        middle = " So I understand your contract expires in {{account.contract_end}} — who is your current supplier?";
      } else if (hasSupplier && hasContractEnd) {
        middle = " So I understand you guys are using {{account.supplier}} till {{account.contract_end}}.";
      } else {
        middle = " Who's your current supplier? Do you know when your contract expires?";
      }
      const closing = " <br><br>My job is to time the market and keep you informed so you're not caught off-guard by your supplier. Would it help if I offer you a free energy health check so you can get a better understanding where you're at — that way you can see what your options are?";
      return intro + middle + closing;
    }

    return node.text || '';
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

  function render(){
    const { display, responses, backBtn } = els();
    const node = FLOW[state.current] || FLOW.start;

    if (display){
      const live = isLiveCall();
      const hasOverride = !!(typeof state !== 'undefined' && state && state.overrideContactId);
      const baseText = buildNodeText(state.current, node);
      const mode = (live || hasOverride) ? 'text' : 'chips';
      const html = renderTemplate(baseText, mode);

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
          btn.addEventListener('click', () => go('dialing'));
          responses.appendChild(btn);
          responses.classList.add('full-width');
        } else {
          (node.responses || []).forEach(r => {
            const b = document.createElement('button');
            b.className = 'response-btn';
            b.type = 'button';
            b.textContent = r.label;
            b.addEventListener('click', () => go(r.next));
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

  function go(next){
    if (!next || !FLOW[next]) return;
    state.history.push(state.current);
    state.current = next;
    render();
  }

  function back(){
    if (state.history.length === 0) return;
    state.current = state.history.pop();
    render();
  }

  function restart(){
    state.current = 'start';
    state.history = [];
    render();
  }

  function bind(){
    const { backBtn, restartBtn, toolbar } = els();
    if (backBtn && !backBtn._bound){ backBtn.addEventListener('click', back); backBtn._bound = true; }
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
    top = top.slice(0, 10);

    if (top.length === 0) {
      panel.innerHTML = '<div class="suggestion-empty">No matches</div>';
      panel.hidden = false;
      input.setAttribute('aria-expanded','true');
      return;
    }

    panel.innerHTML = top.map(({p, name, email, company}) => {
      const cid = String(p.id || p.contactId || p._id || '');
      const label = escapeHtml(name || '(No name)');
      const sub = escapeHtml([company, email].filter(Boolean).join(' • '));
      return `<div class="suggestion-item" role="option" data-contact-id="${escapeHtml(cid)}">
        <div class="sugg-name">${label}</div>
        <div class="sugg-sub">${sub || '&nbsp;'}</div>
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
    // Auto-fill name when calling a contact directly
    const liveName = (contact && (contact.name || ((contact.firstName||'') + ' ' + (contact.lastName||''))).trim()) || '';
    if (liveName) input.value = liveName;
    // If calling a company number (no live contact id but have account), pre-open suggestions with that account's contacts
    const hasContactId = !!(contact && contact.id);
    const hasAccount = !!(account && (account.accountName||account.name||account.companyName));
    if (!hasContactId && hasAccount) {
      // Open suggestions with same-company list
      buildSuggestions('');
    }
  }

  function wireSearchHandlers(){
    const input = document.getElementById('call-scripts-contact-search');
    const panel = document.getElementById('call-scripts-search-suggestions');
    if (!input || !panel) return;

    // Open on focus with company contacts if available
    input.addEventListener('focus', () => buildSuggestions(''));
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
    // Reset state when the page is shown
    restart();
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

  // Expose module
  if (!window.callScriptsModule) window.callScriptsModule = {};
  window.callScriptsModule.init = init;

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
