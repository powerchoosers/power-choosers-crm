(function() {
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'coresignal-widget';

  function getBase() {
    let base = (window.API_BASE_URL || '').replace(/\/$/, '');
    if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';
    return base;
  }

  function open(contactId, accountId) {
    close();
    const card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget-card coresignal-card';
    card.innerHTML = `
      <div class="widget-header">
        <h3 class="widget-title">Coresignal Prospect</h3>
        <button class="cs-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="cs-body">
        <div class="cs-search">
          <input id="cs-company" class="cs-input" placeholder="Company domain (example.com)">
          <input id="cs-title" class="cs-input" placeholder="Title (e.g., IT Director)">
          <input id="cs-location" class="cs-input" placeholder="Location (e.g., United States)">
          <input id="cs-skills" class="cs-input" placeholder="Skills (comma-separated)">
          <button id="cs-run" class="action-btn">Search</button>
        </div>
        <div id="cs-status" class="cs-status" style="display:none;"></div>
        <div id="cs-results" class="cs-results"></div>
      </div>
    `;
    document.body.appendChild(card);
    card.querySelector('.cs-close').addEventListener('click', close);
    card.querySelector('#cs-run').addEventListener('click', runSearch);
  }

  function close() {
    const el = document.getElementById(WIDGET_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
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
    const base = getBase();
    const company = document.getElementById('cs-company').value.trim();
    const title = document.getElementById('cs-title').value.trim();
    const location = document.getElementById('cs-location').value.trim();
    const skills = document.getElementById('cs-skills').value.trim();

    const must = [];
    if (company) must.push({ query_string: { query: company, default_field: 'active_experience_company_website.domain_only' } });
    if (title) must.push({ query_string: { query: title, default_field: 'active_experience_title' } });
    if (location) must.push({ query_string: { query: location, default_field: 'location_country' } });
    if (skills) must.push({ query_string: { query: skills.split(/\s*,\s*/).join(' AND '), default_field: 'inferred_skills' } });

    const esdsl = { query: { bool: { must } }, size: 20 };
    const status = document.getElementById('cs-status');
    const results = document.getElementById('cs-results');
    status.style.display = 'block';
    status.textContent = 'Searching…';
    results.innerHTML = '';
    try {
      const r = await fetch(`${base}/api/coresignal/employees-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(esdsl) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const arr = Array.isArray(data?.data?.data) ? data.data.data : (Array.isArray(data?.data?.results) ? data.data.results : []);
      if (!arr.length) { status.textContent = 'No results.'; return; }
      status.textContent = `Found ${arr.length} (remaining credits: ${data.remaining ?? 'n/a'})`;
      results.innerHTML = arr.map(mapEmployeeToCard).join('');
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    }
  }

  function mapEmployeeToCard(x) {
    const name = x.full_name || [x.first_name, x.last_name].filter(Boolean).join(' ');
    const title = x.active_experience_title || x.headline || '';
    const company = x.active_experience_company_name || '';
    const email = x.primary_professional_email || '';
    const linkedin = x.professional_network_url || '';
    return `
      <div class="cs-row">
        <div class="name-cell__wrap">
          <div class="avatar" aria-hidden="true">${(name || '?').trim().split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div>
          <div>
            <div class="cs-name">${escapeHtml(name)}</div>
            <div class="cs-sub">${escapeHtml(title)} ${company ? '· ' + escapeHtml(company) : ''}</div>
          </div>
        </div>
        <div class="cs-actions">
          ${email ? `<span class="email-link">${escapeHtml(email)}</span>` : ''}
          ${linkedin ? `<a class="interactive-text" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
        </div>
      </div>
    `;
  }

  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function escapeAttr(s) { return String(s||'').replace(/"/g, '&quot;'); }

  window.Widgets.openCoresignal = openCoresignal;
  window.Widgets.openCoresignalForAccount = openCoresignalForAccount;
  window.Widgets.closeCoresignal = closeCoresignal;
  window.Widgets.isCoresignalOpen = isCoresignalOpen;
})();


