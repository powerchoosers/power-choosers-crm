(function() {
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'coresignal-widget';

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function getBase() {
    let base = (window.API_BASE_URL || '').replace(/\/$/, '');
    if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-central1.run.app';
    return base;
  }

  function open(contactId, accountId) {
    // Mount widget inside the widget panel like Notes/Health
    close();
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }

    const card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget-card coresignal-card';
    ensureStyles();
    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">Coresignal Prospect</h4>
        <button class="btn-text lusha-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="cs-body">
        <div id="cs-company-header" class="cs-company-header" style="display:none;"></div>
        <div id="cs-status" class="cs-status" style="display:none;"></div>
        <div id="cs-results" class="cs-results"></div>
      </div>
    `;

    // Prepare expand-in animation (same pattern as Notes)
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';
      requestAnimationFrame(() => {
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          // Cleanup inline styles
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
          card.style.opacity = '';
          card.style.transform = '';
          card.style.paddingTop = '';
          card.style.paddingBottom = '';
          try { delete card.dataset._pt; delete card.dataset._pb; } catch (_) {}
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    const closeBtn = card.querySelector('.lusha-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    // Prefill header from page context immediately, then auto-run search
    try { 
      const ctx = deriveContext(); 
      if (ctx.domain || ctx.company) {
        renderCompanyHeaderFromContext(ctx);
      }
    } catch(_) {}
    setTimeout(() => runSearchAuto(contactId, accountId), 0);
    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }
  }

  function close() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    const cs = window.getComputedStyle(card);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    void card.offsetHeight;
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      card.removeEventListener('transitionend', onEnd);
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    card.addEventListener('transitionend', onEnd);
  }

  function isOpen() {
    return !!document.getElementById(WIDGET_ID);
  }

  // Convenience wrappers expected by pages
  function openCoresignal(contactId) { open(contactId, null); }
  function openCoresignalForAccount(accountId) { open(null, accountId); }
  function closeCoresignal() { close(); }
  function isCoresignalOpen() { return isOpen(); }

  async function runSearch() {
    const ctx = deriveContext();
    return runSearchWithContext(ctx);
  }

  async function runSearchWithContext(ctx) {
    const base = getBase();
    const company = ctx.domain || ctx.company || '';
    const title = '';
    const location = '';
    const skills = '';

    const must = [];
    // Do not attempt domain search in employee index; domain is resolved to company id separately
    if (title) must.push({ match_phrase: { active_experience_title: title } });
    if (location) must.push({ query_string: { query: location, default_field: 'location_country' } });
    if (skills) must.push({ query_string: { query: skills.split(/\s*,\s*/).join(' AND '), default_field: 'inferred_skills' } });

    let esdsl = { query: { bool: { must } } };
    const status = document.getElementById('cs-status');
    const results = document.getElementById('cs-results');
    status.style.display = 'block';
    status.textContent = 'Searching…';
    results.innerHTML = '';
    try {
      // If company looks like a domain, resolve company id first for more precise search
      const looksLikeDomain = /\./.test(company) && !/\s/.test(company);
      if (company && looksLikeDomain) {
        status.textContent = 'Resolving company…';
        const compES = { query: { bool: { must: [{ query_string: { query: company, default_field: 'website.domain_only' } }] } } };
        const rc = await fetch(`${base}/api/coresignal/companies-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(compES) });
        if (rc.ok) {
          const compData = await rc.json();
          const compArr = Array.isArray(compData?.data?.data) ? compData.data.data : (Array.isArray(compData?.data?.results) ? compData.data.results : []);
          const cid = compArr && compArr[0] && compArr[0].id;
          if (cid) {
            // Add precise company filter by id
            esdsl = esdsl || { query: { bool: {} } };
            if (!esdsl.query) esdsl.query = { bool: {} };
            if (!esdsl.query.bool) esdsl.query.bool = {};
            if (!Array.isArray(esdsl.query.bool.filter)) esdsl.query.bool.filter = [];
            esdsl.query.bool.filter.push({ term: { active_experience_company_id: cid } });

            // Fetch and render company header (collect)
            try {
              const ccol = await fetch(`${base}/api/coresignal/companies-collect?id=${encodeURIComponent(cid)}`);
              if (ccol.ok) {
                const cj = await ccol.json();
                renderCompanyHeader(cj && cj.data ? cj.data : null);
              } else {
                // Fallback header from context if collect not available
                renderCompanyHeaderFromContext(ctx);
              }
            } catch (_) { 
              // Always show header from context if collect fails
              renderCompanyHeaderFromContext(ctx);
            }
          }
        }
      } else if (company) {
        // If we have company name but no domain, filter by company name and show header from context
        must.push({ query_string: { query: company, default_field: 'active_experience_company_name' } });
        renderCompanyHeaderFromContext(ctx);
      }

      // If we still don't have any company filter and no other criteria, show manual input
      if (!company && must.length === 0) {
        status.textContent = 'No company information found on this page.';
        results.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
            <p>No company information detected on this page.</p>
            <div style="margin-top: 15px;">
              <input id="manual-company" class="input-dark" placeholder="Enter company domain (e.g., example.com)" style="margin-right: 10px;">
              <button id="manual-search" class="btn-primary">Search</button>
            </div>
          </div>
        `;
        
        // Add manual search functionality
        const manualInput = document.getElementById('manual-company');
        const manualBtn = document.getElementById('manual-search');
        if (manualInput && manualBtn) {
          const doManualSearch = () => {
            const manualCompany = manualInput.value.trim();
            if (manualCompany) {
              // Update context and re-run search
              const ctx = { domain: manualCompany, company: manualCompany };
              runSearchWithContext(ctx);
            }
          };
          manualBtn.addEventListener('click', doManualSearch);
          manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doManualSearch();
          });
        }
        return;
      }

      let r = await fetch(`${base}/api/coresignal/employees-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(esdsl) });
      if (!r.ok && r.status === 422) {
        // Attempt fallback using company name field when 422 indicates field mismatch
        status.textContent = 'Retrying with company name…';
        const must2 = must.slice();
        if (company) must2.push({ query_string: { query: company, default_field: 'active_experience_company_name' } });
        const es2 = { query: { bool: { must: must2 } } };
        r = await fetch(`${base}/api/coresignal/employees-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(es2) });
      }
      if (!r.ok) {
        // Try to extract server details for debugging
        let msg = `HTTP ${r.status}`;
        try { const err = await r.json(); if (err && (err.details || err.error)) msg += ` — ${err.details || err.error}`; } catch(_) { /* noop */ }
        throw new Error(msg);
      }
      const data = await r.json();
      let arr = [];
      if (Array.isArray(data?.data?.data)) arr = data.data.data;
      else if (Array.isArray(data?.data?.results)) arr = data.data.results;
      else if (Array.isArray(data?.data) && data.data.every(x => typeof x === 'object')) arr = data.data;
      const idList = Array.isArray(data?.data) && data.data.every(x => typeof x === 'number') ? data.data : [];
      if (!arr.length && idList.length) {
        status.textContent = `Found ${idList.length} employees. Loading details…`;
        const take = idList.slice(0, 12);
        const details = await Promise.all(take.map(async (id) => {
          try {
            const cr = await fetch(`${base}/api/coresignal/employees-collect?id=${encodeURIComponent(id)}`);
            if (!cr.ok) return null;
            const cj = await cr.json();
            return cj && cj.data ? cj.data : null;
          } catch { return null; }
        }));
        const docs = details.filter(Boolean);
        if (!docs.length) { status.textContent = 'No results.'; return; }
        status.textContent = `Showing ${docs.length} of ${idList.length} (remaining credits: ${data.remaining ?? 'n/a'})`;
        results.innerHTML = docs.map(renderContactCardHTML).join('');
        return;
      }
      if (!arr.length) { status.textContent = 'No results.'; return; }
      status.textContent = `Found ${arr.length} (remaining credits: ${data.remaining ?? 'n/a'})`;
      results.innerHTML = arr.map(renderContactCardHTML).join('');
    } catch (e) {
      status.textContent = `Error: ${e.message}. Try company domain like example.com or fill Title.`;
    }
  }

  function deriveContext() {
    const out = { domain: '', company: '' };
    const norm = (s) => String(s||'').trim();
    const normDomain = (s) => norm(s).replace(/^https?:\/\//i,'').replace(/^www\./i,'').split('/')[0].toLowerCase();
    
    try {
      if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
        const a = window.AccountDetail.state.currentAccount;
        out.domain = normDomain(a.domain || a.website || a.site || a.webSite || a.website_url || '');
        out.company = norm(a.name || a.accountName || a.companyName || a.company_name || '');
        return out;
      }
    } catch(e) { }
    
    try {
      if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
        const c = window.ContactDetail.state.currentContact;
        out.company = norm(c.companyName || c.company || c.accountName || c.company_name || '');
        out.domain = normDomain(c.companyWebsite || c.website || c.company_website || '');
        // Try linked account for better domain
        const accId = window.ContactDetail.state._linkedAccountId;
        if (!out.domain && accId && typeof window.getAccountsData === 'function') {
          const accounts = window.getAccountsData() || [];
          const acc = accounts.find(x => String(x.id||'') === String(accId));
          if (acc) {
            out.domain = normDomain(acc.domain || acc.website || acc.site || acc.webSite || acc.website_url || '');
          }
        }
        return out;
      }
    } catch(e) { }
    
    // Try alternative methods to get account/contact data
    try {
      // Check for data attributes on the page
      const accountEl = document.querySelector('[data-account-id], [data-account-name], [data-company-name]');
      if (accountEl) {
        const accountId = accountEl.getAttribute('data-account-id');
        const accountName = accountEl.getAttribute('data-account-name') || accountEl.getAttribute('data-company-name');
        const domain = accountEl.getAttribute('data-domain') || accountEl.getAttribute('data-website');
        if (accountName) {
          out.company = norm(accountName);
          out.domain = normDomain(domain || '');
          return out;
        }
      }
    } catch(e) { }
    
    return out;
  }

  function renderCompanyHeader(companyDoc) {
    const wrap = document.getElementById('cs-company-header');
    if (!wrap) return;
    if (!companyDoc) { wrap.style.display='none'; return; }
    const domain = (companyDoc.website && typeof companyDoc.website === 'string') ? companyDoc.website.replace(/^https?:\/\//i,'').replace(/^www\./i,'').split('/')[0] : '';
    const name = companyDoc.company_name || companyDoc.name || companyDoc.name_clean || '';
    const website = companyDoc.website || (domain ? `https://${domain}` : '');
    const linkedin = companyDoc.linkedin_url || companyDoc.professional_network_url || '';
    const description = companyDoc.description || companyDoc.short_description || companyDoc.overview || '';
    const faviconHTML = (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateFaviconHTML==='function')
      ? window.__pcFaviconHelper.generateFaviconHTML(domain, 40)
      : '';
    wrap.innerHTML = `
      <div class="cs-company-wrap">
        <div class="company-favicon-container" aria-hidden="true">${faviconHTML}</div>
        <div class="cs-company-main">
          <div class="cs-company-name">${escapeHtml(name)}</div>
          <div class="cs-company-meta">${website ? `<a class="interactive-text" href="${escapeAttr(website)}" target="_blank" rel="noopener">${escapeHtml(domain||website)}</a>` : ''}
            ${linkedin ? ` · <a class="interactive-text" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
          </div>
        </div>
        <div class="cs-company-actions">
          <button type="button" class="btn-outline" id="cs-enrich-account">Enrich Account</button>
        </div>
      </div>
      ${description ? `<div class="cs-company-desc">${escapeHtml(description)}</div>` : ''}
    `;
    wrap.style.display = 'flex';
    const btn = document.getElementById('cs-enrich-account');
    if (btn) btn.addEventListener('click', () => { try { window.crm?.showToast && window.crm.showToast('Account enrichment coming soon'); } catch(_) {} });
  }

  function renderCompanyHeaderFromContext(ctx) {
    const wrap = document.getElementById('cs-company-header');
    if (!wrap) return;
    const domain = (ctx && ctx.domain) ? ctx.domain : '';
    const faviconHTML = (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateFaviconHTML==='function')
      ? window.__pcFaviconHelper.generateFaviconHTML(domain, 40)
      : '';
    const website = domain ? `https://${domain}` : '';
    const name = ctx && ctx.company ? ctx.company : (domain || '');
    wrap.innerHTML = `
      <div class="cs-company-wrap">
        <div class="company-favicon-container" aria-hidden="true">${faviconHTML}</div>
        <div class="cs-company-main">
          <div class="cs-company-name">${escapeHtml(name)}</div>
          <div class="cs-company-meta">${website ? `<a class="interactive-text" href="${escapeAttr(website)}" target="_blank" rel="noopener">${escapeHtml(domain)}</a>` : ''}</div>
        </div>
        <div class="cs-company-actions">
          <button type="button" class="btn-outline" id="cs-enrich-account">Enrich Account</button>
        </div>
      </div>`;
    wrap.style.display = 'flex';
  }

  function renderContactCardHTML(x) {
    const id = x.id || x.parent_id || '';
    const name = x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ');
    const title = x.active_experience_title || x.headline || '';
    const company = x.active_experience_company_name || '';
    const linkedin = x.professional_network_url || '';
    return `
      <div class="cs-card" data-id="${escapeAttr(id)}">
        <div class="cs-card-left" aria-hidden="true">${(name || '?').trim().split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div>
        <div class="cs-card-main">
          <div class="cs-card-header">
            <div class="cs-name">${escapeHtml(name)}</div>
            ${linkedin ? `<a class="interactive-text" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
          </div>
          <div class="cs-sub">${escapeHtml(title)} ${company ? '· ' + escapeHtml(company) : ''}</div>
          <div class="cs-data"></div>
        </div>
        <div class="cs-card-actions">
          <button type="button" class="btn-outline cs-reveal-email" data-id="${escapeAttr(id)}">Reveal Emails</button>
          <button type="button" class="btn-outline cs-reveal-phone" data-id="${escapeAttr(id)}">Reveal Phones</button>
        </div>
      </div>
    `;
  }

  // Bind reveal buttons after HTML injection
  document.addEventListener('click', async (e) => {
    const btnEmail = e.target && e.target.closest ? e.target.closest('.cs-reveal-email') : null;
    const btnPhone = !btnEmail && e.target && e.target.closest ? e.target.closest('.cs-reveal-phone') : null;
    if (!btnEmail && !btnPhone) return;
    const id = (btnEmail || btnPhone).getAttribute('data-id');
    if (!id) return;
    const base = getBase();
    try {
      const r = await fetch(`${base}/api/coresignal/employees-collect?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const d = j && j.data ? j.data : null;
      if (!d) return;
      const card = document.querySelector(`.cs-card[data-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const dataEl = card.querySelector('.cs-data');
      const emails = Array.isArray(d.professional_emails_collection) ? d.professional_emails_collection.map(e=>e.professional_email).filter(Boolean) : [];
      const phones = Array.isArray(d.phone_numbers_collection) ? d.phone_numbers_collection.map(p=>p.number||p.value).filter(Boolean) : [];
      if (btnEmail && emails.length) {
        const row = document.createElement('div');
        row.className = 'email-link';
        row.textContent = emails.join(', ');
        if (dataEl) {
          // avoid duplicate rows
          const has = Array.from(dataEl.querySelectorAll('.email-link')).some(n => n.textContent && n.textContent.includes(emails[0]));
          if (!has) dataEl.appendChild(row);
        }
        btnEmail.disabled = true; btnEmail.textContent = 'Emails Revealed';
      }
      if (btnPhone && phones.length) {
        const row = document.createElement('div');
        row.className = 'phone-link';
        row.textContent = phones.join(', ');
        if (dataEl) {
          const has = Array.from(dataEl.querySelectorAll('.phone-link')).some(n => n.textContent && n.textContent.includes(phones[0]));
          if (!has) dataEl.appendChild(row);
        }
        btnPhone.disabled = true; btnPhone.textContent = 'Phones Revealed';
      }
    } catch (err) {
      try { window.crm?.showToast && window.crm.showToast('Reveal failed'); } catch(_) {}
    }
  }, true);

  function runSearchAuto(contactId, accountId) {
    runSearch();
  }

  function ensureStyles() {
    if (document.getElementById('coresignal-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'coresignal-widget-styles';
    style.textContent = `
      .coresignal-card .cs-company-header { margin-bottom: 12px; }
      .coresignal-card .cs-company-wrap { display:flex; align-items:center; gap:10px; border:1px solid var(--border-light); background: var(--bg-item); border-radius: 10px; padding: 10px 12px; }
      .coresignal-card .cs-company-main { display:flex; flex-direction:column; gap:2px; }
      .coresignal-card .cs-company-name { color: var(--grey-400); font-weight: 400; }
      .coresignal-card .cs-company-meta { font-size: 12px; color: var(--grey-400); }
      .coresignal-card .cs-company-actions { margin-left:auto; display:flex; gap:8px; }
      .coresignal-card .cs-company-desc { margin-top:8px; font-size: 12px; color: var(--grey-400); line-height: 1.5; }

      .coresignal-card .cs-results { display:flex; flex-direction:column; gap: 12px; }
      .coresignal-card .cs-card { display:flex; gap:12px; align-items:flex-start; border:1px solid var(--border-light); background: var(--bg-item); border-radius: 10px; padding: 12px; }
      .coresignal-card .cs-card-left { width: 28px; height: 28px; border-radius: 50%; background: var(--orange-subtle); color: #fff; font-weight: 600; letter-spacing: .5px; display:flex; align-items:center; justify-content:center; font-size: 12px; }
      .coresignal-card .cs-card-main { flex:1; min-width:0; }
      .coresignal-card .cs-card-header { display:flex; align-items:center; gap:8px; }
      .coresignal-card .cs-name { color: var(--grey-400); font-weight: 400; }
      .coresignal-card .cs-sub { font-size: 12px; color: var(--grey-400); margin-top: 2px; }
      .coresignal-card .cs-data { margin-top:6px; display:flex; flex-direction:column; gap:4px; }
      .coresignal-card .cs-card-actions { display:flex; flex-direction:column; gap:6px; }
      .coresignal-card .btn-outline { background: transparent; color: var(--grey-400); border: 1px solid var(--border-light); padding: 6px 10px; border-radius: 6px; transition: var(--transition-fast); }
      .coresignal-card .btn-outline:hover { color: var(--text-inverse); border-color: var(--border); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function escapeAttr(s) { return String(s||'').replace(/"/g, '&quot;'); }

  window.Widgets.openCoresignal = openCoresignal;
  window.Widgets.openCoresignalForAccount = openCoresignalForAccount;
  window.Widgets.closeCoresignal = closeCoresignal;
  window.Widgets.isCoresignalOpen = isCoresignalOpen;
})();


