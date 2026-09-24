window.createSightBlkMetrics = (root, getDocument, applyDocument, setBusy) => {
  const panel = root.querySelector('[data-blk-metrics]');
  const count = panel.querySelector('[data-blk-object-count]');
  const elements = panel.querySelector('[data-editor-elements-count]');
  const warning = panel.querySelector('[data-blk-limit-warning]');
  const result = panel.querySelector('[data-blk-result]');
  const brushWarning = root.querySelector('[data-brush-object-warning]');
  const dialog = root.querySelector('[data-optimization-dialog]');
  const detailsButton = root.querySelector('[data-optimization-details]');
  const diagnostics = root.querySelector('[data-blk-diagnostics]');
  const diagnosticMode = new URLSearchParams(location.search).get('blkDiagnostics') === '1';
  detailsButton.addEventListener('click', () => dialog.showModal());
  root.querySelector('[data-close-optimization]').addEventListener('click', () => dialog.close());
  root.querySelector('[data-brush-settings]').append(brushWarning);
  let lastJson = '', pendingJson = '', timer, inFlight = false, disposed = false, brushShown = false, hasResult = false;
  const acceptCount = value => {
    count.textContent = value.toLocaleString(document.documentElement.lang);
    count.dataset.value = String(value);
    panel.dataset.limitState = value >= 2500 ? 'reached' : value >= 2200 ? 'near' : 'normal';
    warning.hidden = value < 2200;
    warning.textContent = value >= 2500 ? panel.dataset.reached : panel.dataset.near;
    count.removeAttribute('aria-busy');
  };
  const requestCount = async () => {
    if (inFlight || disposed || !pendingJson) return;
    const json = pendingJson;
    inFlight = true;
    try {
      const response = await fetch('/tools/draw/blk-metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json })
      });
      const metrics = await response.json();
      if (!response.ok || !Number.isInteger(metrics.blkObjects)) throw new Error('BLK metrics unavailable');
      if (!disposed && json === pendingJson) {
        acceptCount(metrics.blkObjects);
        if (diagnosticMode) { diagnostics.hidden = false; diagnostics.textContent = JSON.stringify(metrics, null, 2); }
      }
    } catch {
      if (!disposed && json === pendingJson) {
        count.textContent = '?'; count.removeAttribute('data-value'); count.removeAttribute('aria-busy');
        warning.hidden = false; warning.textContent = panel.dataset.countError;
      }
    } finally {
      inFlight = false;
      if (!disposed && json !== pendingJson) timer = setTimeout(requestCount, 250);
    }
  };
  const schedule = () => {
    const model = getDocument();
    elements.textContent = model.elements.length.toLocaleString(document.documentElement.lang);
    const json = JSON.stringify(model);
    if (json === lastJson) return;
    lastJson = pendingJson = json;
    clearTimeout(timer);
    count.setAttribute('aria-busy', 'true');
    count.textContent = '...';
    count.removeAttribute('data-value');
    timer = setTimeout(requestCount, 250);
  };
  root.querySelector('[data-action="optimize-blk"]').addEventListener('click', async () => {
    setBusy(true);
    result.hidden = true;
    try {
      const response = await fetch('/tools/draw/optimize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: JSON.stringify(getDocument()), mode: root.querySelector('[data-optimize-mode]').value })
      });
      const data = await response.json();
      const quotaError = window.hubOptimizationResult?.(response, data);
      if (quotaError) { result.textContent = quotaError; return; }
      if (!response.ok) throw new Error('Optimization failed');
      if (data.after < data.before) {
        applyDocument(data.document);
        result.textContent = panel.dataset.optimized.replace('{0}', data.before.toLocaleString()).replace('{1}', data.after.toLocaleString())
          .replace('{2}', ((1 - data.after / data.before) * 100).toFixed(1));
        result.textContent += ' ' + panel.dataset.visualDifference.replace('{0}', data.visualDifferencePercent.toFixed(2));
      } else result.textContent = panel.dataset.noReduction;
      root.querySelector('[data-opt-before]').textContent = data.before.toLocaleString();
      root.querySelector('[data-opt-after]').textContent = data.after.toLocaleString();
      root.querySelector('[data-opt-reduction]').textContent = (data.before ? (1 - data.after / data.before) * 100 : 0).toFixed(1) + '%';
      root.querySelector('[data-opt-difference]').textContent = data.visualDifferencePercent.toFixed(2) + '%';
      const target = root.querySelector('[data-opt-target]');
      target.hidden = data.targetReached; target.textContent = panel.dataset.targetUnreached;
      root.querySelector('[data-opt-skipped]').hidden = !data.skippedTypes?.length;
      hasResult = true;
      if (diagnosticMode) { diagnostics.hidden = false; diagnostics.textContent = JSON.stringify({ before: data.before, after: data.after, passes: data.passes, skippedTypes: data.skippedTypes }, null, 2); }
      acceptCount(data.after);
    } catch { result.textContent = panel.dataset.optimizeError; }
    finally { result.hidden = false; setBusy(false); detailsButton.disabled = !hasResult; }
  });
  root.querySelector('[data-dismiss-brush-warning]').addEventListener('click', () => { brushWarning.hidden = true; });
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); });
  window.addEventListener('pageshow', () => { disposed = false; });
  return { schedule, acceptCount, brushSelected: () => {
    if (!brushShown) { brushShown = true; brushWarning.hidden = false; }
  } };
};
