(function () {
  'use strict';

  // Phone Widget (Dialer)
  // Exposes: window.Widgets.openPhone(), window.Widgets.closePhone(), window.Widgets.isPhoneOpen()
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'phone-widget';

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closePhoneWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    void card.offsetHeight; // reflow
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

  const T9_MAP = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ'
  };

  function letterToDigit(ch) {
    const up = ch.toUpperCase();
    for (const [d, letters] of Object.entries(T9_MAP)) {
      if (letters.includes(up)) return d;
    }
    return '';
  }

  function formatT9Hint(number) {
    // Returns a compact hint like: 2(ABC) 3(DEF) for the last few digits
    if (!number) return 'T9: 2(ABC) 3(DEF) 4(GHI) 5(JKL) 6(MNO) 7(PQRS) 8(TUV) 9(WXYZ)';
    const tail = number.replace(/[^2-9]/g, '').slice(-6); // only show last up to 6 meaningful digits
    if (!tail) return 'T9: 2(ABC) 3(DEF) 4(GHI) 5(JKL) 6(MNO) 7(PQRS) 8(TUV) 9(WXYZ)';
    return tail.split('').map(d => `${d}(${T9_MAP[d] || ''})`).join('  ');
  }

  function makeCard() {
    const card = document.createElement('div');
    card.className = 'widget-card phone-card';
    card.id = WIDGET_ID;

    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">Phone</h4>
        <button type="button" class="btn-text notes-close phone-close" aria-label="Close" data-pc-title="Close" aria-describedby="pc-tooltip">×</button>
      </div>
      <div class="phone-body" style="display:flex; flex-direction:column; gap: 12px;">
        <input type="text" class="input-dark phone-display" placeholder="Enter number" inputmode="tel" autocomplete="off" style="font-size: 20px; text-align: center; padding: 10px; letter-spacing: 1px;" />
        <div class="t9-hint" style="font-size: 12px; color: var(--text-muted); text-align:center;">T9: 2(ABC) 3(DEF) 4(GHI) 5(JKL) 6(MNO) 7(PQRS) 8(TUV) 9(WXYZ)</div>
        <div class="dialpad" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          ${[
            {d:'1', l:''}, {d:'2', l:'ABC'}, {d:'3', l:'DEF'},
            {d:'4', l:'GHI'}, {d:'5', l:'JKL'}, {d:'6', l:'MNO'},
            {d:'7', l:'PQRS'}, {d:'8', l:'TUV'}, {d:'9', l:'WXYZ'},
            {d:'*', l:''}, {d:'0', l:'+'}, {d:'#', l:''}
          ].map(k => `
            <button type="button" class="dial-key" data-key="${k.d}" style="padding: 10px 0; border-radius: 10px; background: var(--grey-850); color: var(--text); border: 1px solid var(--grey-700); box-shadow: var(--shadow-sm);">
              <div style="font-size:18px; line-height:1;">${k.d}</div>
              <div style="font-size:10px; opacity:0.7;">${k.l}</div>
            </button>
          `).join('')}
        </div>
        <div class="dial-actions" style="display:flex; gap: 8px; justify-content:center;">
          <button type="button" class="btn-primary call-btn-start" title="Call" style="min-width:120px">Call</button>
          <button type="button" class="btn-secondary backspace-btn" title="Backspace">⌫</button>
          <button type="button" class="btn-text clear-btn" title="Clear">Clear</button>
        </div>
      </div>
    `;

    const input = card.querySelector('.phone-display');
    const t9HintEl = card.querySelector('.t9-hint');

    const updateHint = () => {
      if (t9HintEl) t9HintEl.textContent = formatT9Hint(input ? input.value : '');
    };

    // Focus ring preference
    if (input) {
      input.addEventListener('focus', () => input.classList.add('focus-orange'));
      input.addEventListener('blur', () => input.classList.remove('focus-orange'));
    }

    const appendChar = (ch) => {
      if (!input) return;
      input.value = (input.value || '') + ch;
      updateHint();
      try { input.focus(); } catch (_) {}
    };

    const backspace = () => {
      if (!input) return;
      const v = input.value || '';
      input.value = v.slice(0, -1);
      updateHint();
      try { input.focus(); } catch (_) {}
    };

    const clearAll = () => {
      if (!input) return;
      input.value = '';
      updateHint();
      try { input.focus(); } catch (_) {}
    };

    // Dialpad clicks
    card.querySelectorAll('.dial-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key') || '';
        appendChar(k);
      });
    });

    // Actions
    const callBtn = card.querySelector('.call-btn-start');
    if (callBtn) callBtn.addEventListener('click', async () => {
      const num = (input && input.value || '').trim();
      if (!num) {
        try { window.crm?.showToast && window.crm.showToast('Enter a number to call'); } catch (_) {}
        return;
      }
      try { window.crm?.showToast && window.crm.showToast(`Placing call to ${num}...`); } catch (_) {}

      try {
        const r = await fetch('/api/vonage/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: num })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
        try { window.crm?.showToast && window.crm.showToast('Call initiated. Your phone will ring.'); } catch (_) {}
      } catch (e) {
        try { window.crm?.showToast && window.crm.showToast(`Call failed: ${e?.message || 'Error'}`); } catch (_) {}
      }
    });
    const backspaceBtn = card.querySelector('.backspace-btn');
    if (backspaceBtn) backspaceBtn.addEventListener('click', backspace);
    const clearBtn = card.querySelector('.clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // Close button
    const closeBtn = card.querySelector('.phone-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closePhoneWidget());

    // Keyboard input support: digits, *, #, and letter->T9 digit mapping
    card.addEventListener('keydown', (e) => {
      const { key } = e;
      if (/^[0-9*#]$/.test(key)) {
        appendChar(key);
        e.preventDefault();
      } else if (key === 'Backspace') {
        backspace();
        e.preventDefault();
      } else if (/^[a-zA-Z]$/.test(key)) {
        const d = letterToDigit(key);
        if (d) {
          appendChar(d);
          e.preventDefault();
        }
      } else if (key === 'Enter') {
        if (callBtn) callBtn.click();
        e.preventDefault();
      }
    });

    // Make the whole card focusable to receive key events, but keep input primary
    card.setAttribute('tabindex', '-1');
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 0);

    return card;
  }

  function openPhone() {
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }

    removeExistingWidget();
    const card = makeCard();

    // Smooth expand-in animation
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
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    try { window.crm?.showToast && window.crm.showToast('Phone opened'); } catch (_) {}
  }

  window.Widgets.openPhone = openPhone;
  window.Widgets.closePhone = closePhoneWidget;
  window.Widgets.isPhoneOpen = function () { return !!document.getElementById(WIDGET_ID); };
})();
