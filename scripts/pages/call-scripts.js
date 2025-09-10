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
    try { account = findAccountForContact(contact) || {}; } catch(_) { account = {}; }
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
      'contact.first_name': data.contact.firstName || data.contact.first || splitName(data.ctx.name).first || '',
      'contact.last_name': data.contact.lastName || data.contact.last || splitName(data.ctx.name).last || '',
      'contact.full_name': data.contact.fullName || data.contact.name || data.ctx.name || '',
      'contact.phone': data.contact.phone || data.contact.mobile || data.ctx.number || '',
      'account.name': data.account.accountName || data.account.name || data.contact.company || data.ctx.company || '',
      'account.industry': data.account.industry || '',
      'account.city': data.account.city || data.account.billingCity || data.account.locationCity || '',
      'account.state': data.account.state || data.account.region || data.account.billingState || '',
      'account.website': data.account.website || data.account.domain || '',
      'account.supplier': data.account.supplier || data.account.currentSupplier || '',
      'account.contract_end': data.account.contractEnd || data.account.contract_end || data.account.renewalDate || ''
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
      text: "Perfect -- So, my name is Lewis with PowerChoosers.com, and -- I understand you're responsible for electricity agreements and contracts for {{account.name}}. Is that still accurate?",
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
      text: "Got it. now {{contact.first_name}}, we've been working with other {{account.industry}}'s in {{account.city}}, and my main job here -- is to make sure account holders like yourself aren't -- blind sided by next years' rate increases.. <span class=\"script-highlight\">How are <em>you</em> guys handling these -- sharp increases for your future renewals?</span>",
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
      text: "Totally get it — {{contact.first_name}}. A lot of {{account.industry}} teams in {{account.city}} are seeing budgets tighten. My job is to time the market windows and structure terms so {{account.name}} isn't caught off-guard by spikes. Would it help if I pulled a quick forward-rate snapshot for {{account.name}} so you can see what's moving?",
      responses: [
        { label: 'Yes, quick snapshot is helpful', next: 'discovery' },
        { label: 'What do you need from me?', next: 'discovery' },
        { label: 'Not now / later', next: 'voicemail_or_hangup' }
      ]
    },
    pathA_not_renewed: {
      text: "Makes sense -- when it comes to getting the best price, it's pretty easy to renew at the wrong time and end up overpaying. When does your contract expire? Do you know who your supplier is? <br><br>Awesome — we work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take. <br><br><span class=\"script-highlight\">Would you be open to a quick, free energy health check so you can see how this would work?</span>",
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
    history: []
  };

  // Elements
  function els(){
    return {
      display: document.getElementById('call-scripts-display'),
      responses: document.getElementById('call-scripts-responses'),
      backBtn: document.getElementById('call-scripts-back'),
      restartBtn: document.getElementById('call-scripts-restart')
    };
  }

  function buildNodeText(key, node){
    // Default returns node.text. Some nodes get conditional text.
    if (key !== 'pathA_not_renewed') return node.text || '';
    const data = getLiveData();
    const hasContractEnd = !!(data.account.contractEnd || data.account.contract_end || data.account.renewalDate);
    const hasSupplier = !!(data.account.supplier || data.account.currentSupplier);
    const part1 = "Makes sense -- when it comes to energy, it's pretty easy to renew at the wrong time and end up overpaying.";
    const q1 = " When does your contract expire?";
    const q2 = " Do you know who your supplier is?";
    const part2 = " <br><br>Awesome — we work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take.";
    const part3 = " <br><br><span class=\"script-highlight\">Would you be open to a quick, free energy health check so you can see how this would work?</span>";
    let text = part1;
    if (!hasContractEnd) text += q1;
    if (!hasSupplier) text += q2;
    text += part2 + part3;
    return text;
  }

  function render(){
    const { display, responses, backBtn } = els();
    const node = FLOW[state.current] || FLOW.start;

    if (display){
      const live = isLiveCall();
      const baseText = buildNodeText(state.current, node);
      const html = renderTemplate(baseText, live ? 'text' : 'chips');
      display.innerHTML = html;
    }

    if (responses){
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
    }

    if (backBtn){
      backBtn.disabled = state.history.length === 0;
    }
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
    const { backBtn, restartBtn } = els();
    if (backBtn && !backBtn._bound){ backBtn.addEventListener('click', back); backBtn._bound = true; }
    if (restartBtn && !restartBtn._bound){ restartBtn.addEventListener('click', restart); restartBtn._bound = true; }
  }

  function init(){
    bind();
    // Reset state when the page is shown
    restart();
    // Re-render when phone widget in-call state toggles
    try {
      const card = document.getElementById('phone-widget');
      if (card) {
        const obs = new MutationObserver(() => { try { render(); } catch(_) {} });
        obs.observe(card, { attributes: true, attributeFilter: ['class'] });
      }
    } catch(_){}
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
