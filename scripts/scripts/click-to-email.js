(function(){
  'use strict';

  function isValidEmail(text){
    if (!text || typeof text !== 'string') return false;
    const s = text.trim();
    // Basic but robust email regex
    const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    return re.test(s);
  }

  function extractEmail(text){
    try{
      const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
      const m = String(text||'').match(re);
      return m ? m[1] : '';
    }catch(_){ return ''; }
  }

  function findDisplayName(emailEl){
    // Prefer data-name attribute
    try{
      const direct = emailEl.getAttribute && emailEl.getAttribute('data-name');
      if (direct && String(direct).trim()) return String(direct).trim();
    } catch(_){}

    // Try to infer from row context
    const row = emailEl.closest('tr');
    if (row){
      const nameCell = row.querySelector('.name-text, .contact-name, td[data-col="name"], td:nth-child(2)');
      const txt = (nameCell && nameCell.textContent || '').trim();
      if (txt) return txt;
    }

    // Contact detail header name
    try{
      if (document.getElementById('contact-detail-view') && document.getElementById('contact-detail-header')){
        const n = document.getElementById('contact-name');
        const txt = (n && n.textContent || '').trim();
        if (txt) return txt;
      }
    }catch(_){ }

    // Account detail header name
    try{
      if (document.getElementById('account-detail-view') && document.getElementById('account-detail-header')){
        const n = document.querySelector('#account-detail-header .page-title.contact-page-title');
        const txt = (n && n.textContent || '').trim();
        if (txt) return txt;
      }
    }catch(_){ }

    return '';
  }

  function openInternalCompose(addr, name, onFail){
    // Try direct helper first
    if (window.EmailCompose && typeof window.EmailCompose.openTo === 'function'){
      try { window.EmailCompose.openTo(addr, name||''); return; } catch(_){}
    }
    // Navigate to Emails page and try to open compose
    try { if (window.crm && typeof window.crm.navigateToPage === 'function') window.crm.navigateToPage('emails'); } catch(_){ }
    const start = Date.now(); const giveUp = start + 4000;
    (function wait(){
      if (window.emailManager){
        try {
          if (typeof window.emailManager.openCompose === 'function'){
            window.emailManager.openCompose({ to: addr });
          } else {
            document.getElementById('compose-email-btn')?.click();
            setTimeout(()=>{ const to = document.getElementById('compose-to'); if (to) to.value = addr; }, 120);
          }
          setTimeout(()=>{ document.getElementById('compose-subject')?.focus(); }, 200);
        } catch(e){ console.warn('[ClickToEmail] compose open failed', e); }
        return;
      }
      if (Date.now() < giveUp) return setTimeout(wait, 120);
      if (typeof onFail === 'function') onFail();
    })();
  }

  function makeEmailClickable(emailEl, email, name){
    if (!emailEl || !email) return;

    // Visuals (identical to click-to-call: pointer + opacity hover; no underline)
    emailEl.style.cursor = 'pointer';
    emailEl.style.transition = 'opacity 0.2s ease';
    try { emailEl.style.textDecoration = 'none'; } catch(_){ }
    emailEl.title = `Email ${email}${name ? ` (${name})` : ''}`;

    // Hover
    emailEl.addEventListener('mouseenter', function(){ this.style.opacity = '0.7'; });
    emailEl.addEventListener('mouseleave', function(){ this.style.opacity = '1'; });

    // Click -> open compose
    emailEl.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      const addr = email || extractEmail(emailEl.textContent);
      if (!addr) return;
      const display = name || findDisplayName(emailEl);
      openInternalCompose(addr, display, () => {
        window.crm?.showToast && window.crm.showToast('Email composer not available');
      });
    });

    emailEl.classList.add('clickable-email');
  }

  function processSpecificEmailElements(){
    const selectors = [
      'a[href^="mailto:"]',
      '[data-email]',
      '.email-link',
      '#contact-detail-view .info-row[data-field="email"] .info-value-text',
      '#account-detail-view .info-value-wrap[data-field="email"] .info-value-text',
      // Task detail page email elements
      '#task-detail-page .email-text[data-email]',
      // Account contacts list
      '#account-contacts-list .contact-email',
      // People and Accounts tables generic cells (email-like text)
      '#people-page td',
      '#accounts-page td'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.classList.contains('clickable-email')) return;
        // Skip compose UI and inputs
        if (el.closest('#compose-window') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;

        const explicit = (el.getAttribute && (el.getAttribute('data-email')||'')) || '';
        const hrefMail = (el.getAttribute && (el.getAttribute('href')||'')).replace(/^mailto:/i,'');
        const textMail = extractEmail(el.textContent||'');
        let addr = explicit || hrefMail || textMail;
        // If we are scanning generic table cells, only convert when text contains an email
        if (!addr && (sel.endsWith(' td'))){
          const txt = (el.textContent||'').trim();
          if (isValidEmail(txt)) addr = extractEmail(txt);
        }
        if (addr && isValidEmail(addr)){
          const name = findDisplayName(el);
          makeEmailClickable(el, addr, name);
        }
      });
    });
  }

  function setupObserver(){
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(muts => {
      let should = false;
      for (const m of muts){ if (m.addedNodes && m.addedNodes.length){ should = true; break; } }
      if (should){ clearTimeout(window._emailHoverDebounce); window._emailHoverDebounce = setTimeout(processSpecificEmailElements, 100); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init(){ processSpecificEmailElements(); setupObserver(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.ClickToEmail = { init, processSpecificEmailElements };
})();
