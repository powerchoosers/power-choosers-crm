(() => {
  const isDebug = () => {
    try { return window.PC_DEBUG === true; } catch (_) { return false; }
  };

  const log = (msg, data) => {
    if (!isDebug()) return;
    try { console.log(msg, data || ''); } catch (_) { }
  };

  const now = () => {
    try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); }
  };

  const measure = (label, fn) => {
    const t0 = now();
    let out;
    try { out = fn(); } finally {
      const t1 = now();
      log(`[Perf] ${label}`, { ms: Math.round((t1 - t0) * 100) / 100 });
    }
    return out;
  };

  const renderActivityLoadingState = (count = 4) => {
    const n = Math.max(1, Math.min(12, parseInt(count || 4, 10) || 4));
    return `
      <div class="activity-skeletons">
        ${Array(n).fill(0).map(() => `
          <div class="activity-item premium-borderline" style="border: 1px solid rgba(255,255,255,0.08); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02); margin-bottom: 10px; opacity: 1; pointer-events: none; display: flex; align-items: center; gap: 12px; padding: 12px 16px; min-height: 85px;">
            <div class="activity-entity-avatar">
              <div class="skeleton-shimmer" style="width: 36px; height: 36px; border-radius: 50%;"></div>
            </div>
            <div class="activity-content" style="flex: 1;">
              <div class="skeleton-text medium skeleton-shimmer" style="margin-bottom: 8px; height: 16px;"></div>
              <div class="skeleton-text skeleton-shimmer" style="margin-bottom: 6px; height: 12px; width: 90%;"></div>
              <div class="skeleton-text short skeleton-shimmer" style="height: 10px;"></div>
            </div>
            <div class="activity-icon">
              <div class="skeleton-shimmer" style="width: 24px; height: 24px; border-radius: 4px;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  const renderRecentCallsLoadingState = (count = 4) => {
    const n = Math.max(1, Math.min(12, parseInt(count || 4, 10) || 4));
    return `
      <div class="rc-skeletons">
        ${Array(n).fill(0).map(() => `
          <div class="rc-item premium-borderline" style="opacity: 1; pointer-events: none; margin-bottom: 8px;">
            <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
              <div class="skeleton-shape" style="width: 58%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skeleton-shape" style="width: 86%; height: 12px; border-radius: 4px;"></div>
            </div>
            <div class="rc-actions" style="flex-shrink: 0;">
              <span class="rc-outcome" style="border-color: transparent;">
                <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                  <span class="skeleton-shape" style="width: 70px; height: 18px; border-radius: 999px;"></span>
                </span>
              </span>
              <button type="button" class="rc-icon-btn" disabled>
                <span class="skeleton-shimmer-modern" style="display: inline-block;">
                  <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                </span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  const mountListSkeleton = (container, opts = {}) => {
    if (!container) return;
    const count = opts.count;
    const normalizedCount = Math.max(1, Math.min(12, parseInt(count || 4, 10) || 4));
    let variant = opts.variant;
    if (!variant) {
      try {
        const id = String(container.id || '').toLowerCase();
        if (container.classList && container.classList.contains('rc-list')) variant = 'recentCalls';
        else if (id.includes('recent-calls')) variant = 'recentCalls';
        else variant = 'activity';
      } catch (_) {
        variant = 'activity';
      }
    }
    const sig = `${variant}:${normalizedCount}`;
    try {
      if (
        container.dataset &&
        container.dataset.pcSkeleton === '1' &&
        container.dataset.pcSkeletonVariant === variant &&
        container.dataset.pcSkeletonSig === sig
      ) {
        return;
      }
    } catch (_) { }

    const html = measure(
      variant === 'recentCalls' ? 'PCSkeletons.renderRecentCallsLoadingState' : 'PCSkeletons.renderActivityLoadingState',
      () => (variant === 'recentCalls' ? renderRecentCallsLoadingState(normalizedCount) : renderActivityLoadingState(normalizedCount))
    );
    try {
      container.innerHTML = html;
      if (container.dataset) {
        container.dataset.pcSkeleton = '1';
        container.dataset.pcSkeletonVariant = variant;
        container.dataset.pcSkeletonSig = sig;
      }
    } catch (_) { }
  };

  window.PCSkeletons = window.PCSkeletons || {};
  window.PCSkeletons.renderActivityLoadingState = renderActivityLoadingState;
  window.PCSkeletons.renderRecentCallsLoadingState = renderRecentCallsLoadingState;
  window.PCSkeletons.mountListSkeleton = mountListSkeleton;
  window.PCSkeletons.measure = measure;
})();
