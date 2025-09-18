(function(){
  'use strict';

  // Simple normalizer to compare names (company vs contact)
  function norm(s){
    return String(s||'')
      .toLowerCase()
      .replace(/&/g,'and')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\b(inc|incorporated|llc|l\.?l\.?c\.?|llp|l\.?l\.?p\.?|ltd|co|corp|corporation|company|limited|the)\b/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function makeFavicon(domain){
    if(!domain) return '';
    const d = String(domain).replace(/^https?:\/\//,'');
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(d)}`;
  }

  function ensureWidgetOpen(){
    try{ if (window.Widgets && typeof window.Widgets.openPhone === 'function') window.Widgets.openPhone(); } catch(_) {}
  }

  function applyContactDisplayFromContext(number, ctx){
    try{
      ensureWidgetOpen();
      const card = document.getElementById('phone-widget');
      if (!card) return;
      const body = card.querySelector('.phone-body');
      if (!body) return;

      // Build display values preferring explicit context
      const contactName = (ctx && ctx.contactName) || '';
      const company = (ctx && (ctx.accountName || ctx.company)) || '';
      const nameLine = contactName && norm(contactName) !== norm(company) ? contactName : (company || '');
      const subLine = company && norm(contactName) !== norm(company) ? `${company} • ${number}` : number;

      // Create/replace small contact box (reuses styles from existing phone widget)
      let box = body.querySelector('.phone-contact');
      if (!box){
        box = document.createElement('div');
        box.className = 'phone-contact --show';
        box.innerHTML = `
          <div class="contact-row">
            <div class="contact-avatar"></div>
            <div class="contact-text">
              <div class="contact-name"></div>
              <div class="contact-sub"></div>
            </div>
          </div>`;
        body.insertBefore(box, body.firstChild);
      }
      const nameEl = box.querySelector('.contact-name');
      const subEl = box.querySelector('.contact-sub');
      if (nameEl) nameEl.textContent = nameLine || number || 'On call';
      if (subEl) subEl.textContent = subLine || '';

      // Avatar favicon for company
      const fav = makeFavicon(ctx && (ctx.domain || ctx.website || ctx.accountDomain || ''));
      const avatarWrap = box.querySelector('.contact-avatar');
      if (avatarWrap){
        if (company && fav){
          avatarWrap.innerHTML = `<img class="company-favicon" src="${fav}" alt="" referrerpolicy="no-referrer">`;
        } else {
          const initials = (nameLine || number || '').split(/\s+/).map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
          avatarWrap.innerHTML = `<span class="avatar-initials" aria-hidden="true">${initials || '•'}</span>`;
        }
      }

      // Hide raw input while in-call
      const input = body.querySelector('.phone-display');
      if (input){ input.style.display = 'none'; }

      // Keep header title clean
      const title = card.querySelector('.widget-title');
      if (title) title.textContent = 'Phone';
    }catch(_){}
  }

  function installContextGuards(){
    if (!window.Widgets) window.Widgets = {};

    // Track latest explicit context provided by the app
    const originalSet = window.Widgets.setCallContext;
    window.Widgets.setCallContext = function(ctx){
      try { window.__pcLatestContext = Object.assign({}, ctx || {}); } catch(_) {}
      try { return originalSet && originalSet.apply(this, arguments); } catch(e) { return undefined; }
    };

    // Wrap callNumber to apply our context to UI immediately and prefer it over lookups
    const originalCall = window.Widgets.callNumber;
    window.Widgets.callNumber = function(number){
      try{
        const ctx = window.__pcLatestContext || {};
        applyContactDisplayFromContext(number, ctx);
      }catch(_){}
      try { return originalCall && originalCall.apply(this, arguments); } catch(e) { throw e; }
    };

    // Intercept fetch to enforce context on /api/calls POSTs and sanitize /api/calls GET results
    const origFetch = window.fetch;
    window.fetch = async function(input, init){
      try{
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && (init.method || 'GET')) || 'GET';
        // Sanitize POST bodies to /api/calls so calls.js receives correct account/contact
        if (/\/api\/calls(\?|$)/.test(url) && String(method).toUpperCase() === 'POST' && init && init.body){
          const ctx = window.__pcLatestContext || {};
          const bodyText = typeof init.body === 'string' ? init.body : '';
          if (bodyText.trim().startsWith('{')){
            const data = JSON.parse(bodyText);
            if (ctx.accountId || ctx.accountName || ctx.company){
              if (data.accountId == null) data.accountId = ctx.accountId || null;
              if (!data.accountName) data.accountName = ctx.accountName || ctx.company || '';
            }
            if (ctx.contactId) data.contactId = ctx.contactId;
            // Prefer explicit contactName only if it isn't the company
            const cName = data.contactName || ctx.contactName || '';
            const aName = data.accountName || ctx.accountName || ctx.company || '';
            if (cName && norm(cName) === norm(aName)){
              data.contactName = '';
            } else if (!data.contactName && ctx.contactName) {
              data.contactName = ctx.contactName;
            }
            init.body = JSON.stringify(data);
          }
        }

        // For GET /api/calls, normalize server data so UI won’t duplicate company as contact
        if (/\/api\/calls(\?|$)/.test(url) && String(method).toUpperCase() === 'GET'){
          const res = await origFetch.apply(this, arguments);
          try{
            const clone = res.clone();
            const j = await clone.json();
            if (j && Array.isArray(j.calls)){
              j.calls.forEach(c => {
                const a = c.accountName || '';
                const n = c.contactName || '';
                if (n && a && norm(n) === norm(a)) c.contactName = '';
              });
              const headers = new Headers(res.headers);
              if (!headers.has('Content-Type')) headers.set('Content-Type','application/json');
              return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers });
            }
          }catch(_){ /* fall through */ }
          return res;
        }
      }catch(_){ /* ignore */ }
      return origFetch.apply(this, arguments);
    };
  }

  function onReady(){ installContextGuards(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
