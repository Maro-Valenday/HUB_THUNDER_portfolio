(() => {
  const panels = [...document.querySelectorAll('[data-optimization-quota]')];
  if (!panels.length) return;
  let pending;
  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetch('/tools/optimization/usage', {cache:'no-store'});
        if (!response.ok) return;
        const quota = await response.json();
        panels.forEach(panel => {
          panel.querySelector('[data-optimization-usage]').textContent = quota.limit === null ? panel.dataset.unlimited : panel.dataset.template.replace('{0}', quota.used).replace('{1}', quota.limit);
          panel.querySelector('[data-optimization-denied]').hidden = quota.remaining !== 0;
        });
      } finally { pending = null; }
    })().catch(() => {});
    return pending;
  }
  window.hubOptimizationResult = (response, data) => {
    const limited = data?.reason === 'optimization_daily_limit_reached';
    if (limited || response.ok) {
      try { window.umami?.track?.(limited ? 'blk_optimization_limit_reached' : 'blk_optimization_used'); } catch (_) { }
      refresh();
    }
    return limited ? panels[0].dataset.exhausted : null;
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  refresh();
})();
