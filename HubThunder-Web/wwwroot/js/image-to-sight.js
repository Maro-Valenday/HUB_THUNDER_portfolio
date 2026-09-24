(() => {
  const root = document.querySelector('[data-image-tool]');
  if (!root) return;

  const source = root.querySelector('[data-source]');
  const result = root.querySelector('[data-result]');
  const sctx = source.getContext('2d');
  const rctx = result.getContext('2d');
  const status = root.querySelector('[data-image-status]');
  const generationUsage = root.querySelector('[data-generation-usage]');
  const metrics = root.querySelector('[data-metrics]');
  const benchmark = root.querySelector('[data-benchmark]');
  const resolution = root.querySelector('[data-resolution]');
  const generateButton = root.querySelector('[data-generate]');
  const premiumButton = root.querySelector('[data-image-premium]');
  const saveButton = root.querySelector('[data-save-json]');
  const blkButton = root.querySelector('[data-save-blk]');
  const blkStats = root.querySelector('[data-blk-optimization-stats]');
  const drawerButton = root.querySelector('[data-open-drawer]');
  const texts = window.hubTools || {};
  const imageTexts = window.hubImageTexts || {};
  const text = (key, fallback) => imageTexts[key] || window.hubTools?.[key] || texts[key] || fallback;
  const processingText = document.documentElement.lang?.startsWith('ru') ? 'Обработка...' : 'Processing...';
  const modeLabel = mode => document.documentElement.lang?.startsWith('ru') ? ({ 'line-art': 'КОНТУРЫ', stencil: 'ТРАФАРЕТ', silhouette: 'СИЛУЭТ' }[mode] || mode) : mode.toUpperCase();
  const busyControls = new Map();
  const setBusy = active => {
    root.setAttribute('aria-busy', String(active));
    if (active) {
      root.querySelectorAll('input,select,button').forEach(control => { busyControls.set(control, control.disabled); control.disabled = true; });
      generateButton.textContent = processingText;
      show(processingText);
    } else {
      busyControls.forEach((disabled,control) => { control.disabled = disabled; }); busyControls.clear();
      generateButton.disabled = !image;
      saveButton.disabled = drawerButton.disabled = !documentModel;
      blkButton.disabled = !finalBlk;
      generateButton.textContent = text('Generate','GENERATE');
    }
  };
  const imageSizeMessage = () => document.documentElement.lang?.toLowerCase().startsWith('ru') ? 'Размер изображения не должен превышать 10 MiB.' : 'Image exceeds the maximum size of 10 MiB.';
  const format = (key, values, fallback) => { let result = text(key, fallback); values.forEach((value, index) => { result = result.replace(`{${index}}`, value); }); return result; };

  const refreshUsage = async () => {
    if (!generationUsage) return;
    try {
      const response = await fetch('/tools/image-to-sight/usage', { credentials: 'same-origin' });
      if (!response.ok) return;
      const usage = await response.json();
      const template = usage.tier === 'premium'
        ? generationUsage.dataset.premiumTemplate
        : usage.tier === 'member'
          ? generationUsage.dataset.memberTemplate
          : generationUsage.dataset.guestTemplate;
      generationUsage.textContent = String(template || '').replace('{0}', usage.used);
      if (premiumButton) premiumButton.hidden = usage.tier === 'premium';
    } catch (_) { /* The server remains authoritative when status cannot be refreshed. */ }
  };
  refreshUsage();

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 100000000;
  const MAX_PROCESSING_PIXELS = 50000000;
  const MAX_SERVER_OBJECTS = 100000;
  const RECOMMENDED_SEGMENTS = 5000;
  const RECOMMENDED_OBJECTS = 250;
  const SETTINGS_KEY = 'hub-thunder-image-settings';
  let generatorState = null;

  let image = null;
  let sourceFile = null;
  let sourceName = 'image-sight';
  let sourceWidth = 0;
  let sourceHeight = 0;
  let documentModel = null;
  let documentJson = null;
  let finalBlk = null;
  let generation = 0;
  let previewRevision = 0;

  [source, result].forEach(canvas => {
    canvas.width = 640;
    canvas.height = 420;
    canvas.style.aspectRatio = '1.52';
  });

  const show = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };

  const controls = {
    scale: root.querySelector('[data-scale]'),
    mode: root.querySelector('[data-mode]'),
    thresholdMode: root.querySelector('[data-threshold-mode]'),
    threshold: root.querySelector('[data-threshold]'),
    detail: root.querySelector('[data-detail]'),
    weight: root.querySelector('[data-weight]'),
    maxLines: root.querySelector('[data-max-lines]'),
    segments: root.querySelector('[data-n-segments]'),
    maxObjects: root.querySelector('[data-max-objects]'),
    optimizeBlk: root.querySelector('[data-optimize-blk]'),
    optimizationMode: root.querySelector('[data-optimization-mode]'),
    quadFitting: root.querySelector('[data-quad-fitting]'),
    quadTolerance: root.querySelector('[data-quad-tolerance]'),
    invert: root.querySelector('[data-invert]'),
    inversion: root.querySelector('[data-inversion]'),
    background: root.querySelector('[data-background]')
  };

  const restoreSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      // Older settings used `invert` for colour inversion. Migrate that shape
      // once the new geometric mirror/intensity fields are available.
      if (Object.prototype.hasOwnProperty.call(saved, 'invert') && !Object.prototype.hasOwnProperty.call(saved, 'inversion')) { saved.inversion = saved.invert; saved.invert = false; }
      const aliases = { processingScale: 'scale', mode: 'mode', thresholdMode: 'thresholdMode', threshold: 'threshold', detail: 'detail', lineWeight: 'weight', maxLines: 'maxLines', nSegments: 'segments', maxObjects: 'maxObjects', quadFitting: 'quadFitting', quadTolerance: 'quadTolerance', invert: 'invert', inversion: 'inversion', background: 'background' };
      Object.entries(saved).forEach(([key, value]) => {
        const control = controls[aliases[key] || key];
        if (control && (control.type === 'checkbox' || control.tagName === 'SELECT' || control.type === 'number' || control.type === 'range')) {
          if (control.type === 'checkbox') control.checked = value === true || value === 'true';
          else control.value = value;
        }
      });
    } catch { /* Ignore stale browser settings. */ }
  };
  const saveSettings = () => {
    if (generatorState) localStorage.setItem(SETTINGS_KEY, JSON.stringify(generatorState));
  };
  restoreSettings();
  if (!controls.segments || !Number.isInteger(Number(controls.segments.value)) || Number(controls.segments.value) < 2 || Number(controls.segments.value) > 256) {
    if (controls.segments) controls.segments.value = '12';
  }
  generatorState = {
    processingScale: Number(controls.scale?.value || 100),
    mode: controls.mode?.value || 'line-art',
    thresholdMode: controls.thresholdMode?.value || 'auto',
    threshold: Number(controls.threshold?.value || 128),
    detail: Number(controls.detail?.value || 100),
    lineWeight: Number(controls.weight?.value || 1),
    maxLines: Number(controls.maxLines?.value || 5000),
    nSegments: Number(controls.segments?.value || 12),
    maxObjects: Number(controls.maxObjects?.value || 250),
    optimizeBlk: Boolean(controls.optimizeBlk?.checked),
    optimizationMode: controls.optimizationMode?.value || 'balanced',
    quadFitting: Boolean(controls.quadFitting?.checked),
    quadTolerance: Number(controls.quadTolerance?.value || 15),
    invert: Boolean(controls.invert?.checked),
    inversion: Boolean(controls.inversion?.checked),
    background: controls.background?.value || 'auto'
  };
  const stateKeyFor = control => control === controls.optimizeBlk ? 'optimizeBlk' : control === controls.optimizationMode ? 'optimizationMode' : control === controls.scale ? 'processingScale' : control === controls.mode ? 'mode' : control === controls.thresholdMode ? 'thresholdMode' : control === controls.threshold ? 'threshold' : control === controls.detail ? 'detail' : control === controls.weight ? 'lineWeight' : control === controls.maxLines ? 'maxLines' : control === controls.segments ? 'nSegments' : control === controls.maxObjects ? 'maxObjects' : control === controls.quadFitting ? 'quadFitting' : control === controls.quadTolerance ? 'quadTolerance' : control === controls.invert ? 'invert' : control === controls.inversion ? 'inversion' : control === controls.background ? 'background' : null;
  const syncControlLabels = () => {
    const labels = [['threshold', '[data-threshold-value]'], ['detail', '[data-detail-value]'], ['lineWeight', '[data-weight-value]'], ['quadTolerance', '[data-quad-tolerance-value]']];
    labels.forEach(([key, selector]) => { const output = root.querySelector(selector); if (output) output.textContent = generatorState[key]; });
    const segmentWarning = root.querySelector('[data-max-lines-warning]');
    const objectWarning = root.querySelector('[data-max-objects-warning]');
    if (segmentWarning) segmentWarning.hidden = generatorState.maxLines <= RECOMMENDED_SEGMENTS;
    if (objectWarning) objectWarning.hidden = generatorState.maxObjects <= RECOMMENDED_OBJECTS;
    root.querySelector('[data-optimization-level]').hidden = !generatorState.optimizeBlk;
    const segmentInput = controls.segments;
    const densityWarning = root.querySelector('[data-segment-density-warning]');
    if (densityWarning && segmentInput) {
      const raw = segmentInput.value.trim(); const value = Number(raw);
      densityWarning.hidden = raw !== '' && Number.isInteger(value) && value >= 2 && value <= 256;
    }
    const modeDescription = root.querySelector('[data-mode-description]');
    if (modeDescription) modeDescription.textContent = generatorState.mode === 'line-art' ? (imageTexts.lineArt || text('LineArtDescription', 'Preserves internal lines and details.')) : generatorState.mode === 'stencil' ? (imageTexts.stencil || text('StencilDescription', 'Creates simplified filled shapes.')) : (imageTexts.silhouette || text('SilhouetteDescription', 'Creates the main outer silhouette.'));
    const modeWarning = root.querySelector('[data-mode-warning]');
    if (modeWarning) {
      modeWarning.hidden = true;
      modeWarning.querySelector('[data-mode-warning-text]')?.replaceChildren(document.createTextNode(text('DevelopmentWarning', 'This mode is currently in development.')));
    }
  };
  const syncStateFromControls = () => {
    Object.values(controls).forEach(control => {
      if (!control) return;
      const key = stateKeyFor(control); if (!key) return;
      generatorState[key] = control.type === 'checkbox' ? control.checked : control.tagName === 'SELECT' ? control.value : Number(control.value);
    });
    syncControlLabels();
    root.querySelectorAll('[data-line-art-only]').forEach(element => { element.hidden = generatorState.mode !== 'line-art'; });
  };
  syncStateFromControls();

  const drawSource = () => {
    if (!image) return;
    const factor = Math.min(source.width / sourceWidth, source.height / sourceHeight);
    sctx.fillStyle = '#f4f4f4';
    sctx.fillRect(0, 0, source.width, source.height);
    sctx.save();
    const dx = (source.width - sourceWidth * factor) / 2, dy = (source.height - sourceHeight * factor) / 2, dw = sourceWidth * factor, dh = sourceHeight * factor;
    sctx.filter = generatorState.inversion ? 'invert(1)' : 'none';
    if (generatorState.invert) {
      sctx.translate(dx + dw / 2, 0);
      sctx.scale(-1, 1);
      sctx.drawImage(image, -dw / 2, dy, dw, dh);
    } else {
      sctx.drawImage(image, dx, dy, dw, dh);
    }
    sctx.restore();
  };

  const rebuildSourcePreview = reason => {
    previewRevision += 1;
    if (image) drawSource();
    if (window.hubAccess?.debugEnabled === true) console.debug('[ImageToSight] preview rebuilt', { reason, invert: generatorState.invert, inversion: generatorState.inversion, revision: previewRevision });
  };

  const inspectImageFile = async file => {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    const isPng = bytes.length >= 8 && hex.startsWith('89504E470D0A1A0A');
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    return { firstBytesHex: hex, signature: isPng ? 'PNG' : isJpeg ? 'JPEG' : isWebp ? 'WEBP' : 'UNKNOWN' };
  };

  root.querySelector('[data-image-file]').onchange = event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      show(imageSizeMessage(), true);
      event.target.value = '';
      return;
    }
    setBusy(true);
    const inspectionPromise = inspectImageFile(file);
    const clientTraceId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const url = URL.createObjectURL(file);
    const loaded = new Image();
    loaded.onload = async () => {
      try {
      let inspection;
      try { inspection = await inspectionPromise; }
      catch (error) {
        URL.revokeObjectURL(url);
        console.error('[ImageToSight] upload inspection failed', { name: file.name, contentType: file.type || '', declaredSize: file.size, errorType: error?.name || 'Error', errorMessage: error?.message || String(error) });
        show(text('ImageUploadRejected', 'The image upload could not be inspected.'), true);
        return;
      }
      const diagnostics = { traceId: clientTraceId, name: file.name, contentType: file.type || '', declaredSize: file.size, actualSize: file.size, firstBytesHex: inspection.firstBytesHex, signature: inspection.signature, decoder: 'HTMLImageElement/native browser decoder' };
      if (inspection.signature === 'UNKNOWN') {
        URL.revokeObjectURL(url);
        console.warn('[ImageToSight] unsupported upload', diagnostics);
        show(text('ImageUnsupportedError', 'Unsupported image format.'), true);
        return;
      }
      const pixels = loaded.naturalWidth * loaded.naturalHeight;
      if (!Number.isSafeInteger(pixels) || pixels > MAX_SOURCE_PIXELS) {
        image = null;
        generateButton.disabled = true;
        URL.revokeObjectURL(url);
        show(text('PixelSizeError', 'Image contains more than 100 megapixels. Choose a smaller source image.'), true);
        return;
      }
    image = loaded;
      documentModel = null; documentJson = null; finalBlk = null;
      metrics.textContent = ''; benchmark.textContent = ''; blkStats.hidden = true;
      rctx.clearRect(0, 0, result.width, result.height);
      sourceFile = file;
      sourceName = file.name.replace(/\.[^.]+$/, '') || sourceName;
      sourceWidth = loaded.naturalWidth;
      sourceHeight = loaded.naturalHeight;
      drawSource();
      resolution.textContent = format('SourceMetrics', [sourceWidth, sourceHeight, sourceWidth, sourceHeight, sourceWidth, sourceHeight, '1.000'], `Source: ${sourceWidth} x ${sourceHeight} px`);
      generateButton.disabled = false;
      show(text('ImageLoaded', 'Image loaded. Configure the tracing profile and generate.'));
      URL.revokeObjectURL(url);
      } finally { setBusy(false); }
    };
    loaded.onerror = async event => {
      URL.revokeObjectURL(url);
      const inspection = await inspectionPromise.catch(() => ({ firstBytesHex: '', signature: 'UNKNOWN' }));
      console.error('[ImageToSight] image decoder failure', { traceId: clientTraceId, name: file.name, contentType: file.type || '', declaredSize: file.size, actualSize: file.size, firstBytesHex: inspection.firstBytesHex, signature: inspection.signature, decoder: 'HTMLImageElement/native browser decoder', eventType: event?.type || 'error', naturalWidth: loaded.naturalWidth, naturalHeight: loaded.naturalHeight });
      show(inspection.signature === 'UNKNOWN' ? text('ImageUnsupportedError', 'Unsupported image format.') : text('ImageDecoderFailure', 'The image decoder could not read this file.'), true);
      setBusy(false);
    };
    loaded.src = url;
  };

  const documentDiagnostics = document => {
    const elements = Array.isArray(document?.elements) ? document.elements : [];
    const types = elements.reduce((counts, element) => { counts[element.type] = (counts[element.type] || 0) + 1; return counts; }, {});
    // Stable, dependency-free fingerprint for development request/preview tracing.
    const canonical = JSON.stringify(elements);
    let hash = 2166136261;
    for (let i = 0; i < canonical.length; i++) { hash ^= canonical.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return { elements: elements.length, types, hash: (hash >>> 0).toString(16).padStart(8, '0') };
  };
  // Development-only bridge used by browser E2E diagnostics; production has no
  // dependency on the internal document model.
  const enableDebug = () => {
    if (window.hubAccess?.debugEnabled === true)
      window.__imageToSightDebug = () => ({ state: { ...generatorState }, document: documentModel, diagnostics: documentDiagnostics(documentModel || { elements: [] }) });
  };
  window.addEventListener('hub-access-ready', enableDebug, { once: true });
  enableDebug();
  const renderResult = document => {
    rctx.fillStyle = '#050505'; rctx.fillRect(0, 0, result.width, result.height);
    const factor = Math.min(result.width, result.height) / 70; const sx = point => result.width / 2 + point.x * factor; const sy = point => result.height / 2 - point.y * factor;
    const development = window.hubAccess?.debugEnabled === true;
    rctx.strokeStyle = '#c7ff4c'; rctx.fillStyle = '#c7ff4c'; rctx.lineWidth = 1.4;
    const trace = points => points.forEach((point, index) => index ? rctx.lineTo(sx(point), sy(point)) : rctx.moveTo(sx(point), sy(point)));
    document.elements.forEach(element => {
      rctx.beginPath();
      if (element.type === 'polyline') { trace(element.points); rctx.stroke(); }
      else if (element.type === 'fill') {
        element.regions.forEach(region => { trace(region); rctx.closePath(); });
        rctx.fill(element.fillRule === 'nonzero' ? 'nonzero' : 'evenodd');
      } else if (element.type === 'quad') {
        trace([element.topLeft, element.topRight, element.bottomRight, element.bottomLeft]); rctx.closePath(); rctx.fill();
      }
    });
    if (development) console.debug('[ImageToSight] preview document', documentDiagnostics(document));
  };
  const readLimit = (control, label, minimum, maximum) => {
    const value = Number(control.value);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      show(format(label === 'N segments' ? 'SegmentDensityWarning' : 'MaxExceeded', [minimum.toLocaleString(), maximum.toLocaleString()], `${label} must be an integer between ${minimum.toLocaleString()} and ${maximum.toLocaleString()}.`), true);
      return null;
    }
    return value;
  };

  const generateCore = async () => {
    if (!image) return;
    documentModel = null; documentJson = null; finalBlk = null;
    metrics.textContent = ''; benchmark.textContent = ''; blkStats.hidden = true;
    const id = ++generation; const started = performance.now();
    syncStateFromControls();
    const requestedScale = generatorState.processingScale / 100;
    const requestedWidth = Math.max(1, Math.round(sourceWidth * requestedScale)); const requestedHeight = Math.max(1, Math.round(sourceHeight * requestedScale));
    const requestedPixels = requestedWidth * requestedHeight;
    if (requestedPixels > MAX_PROCESSING_PIXELS) { show(`${text('ProcessingScale', 'Processing scale')} ${Math.ceil(requestedPixels / 1000000)} MP. ${text('ProcessingScaleLimit', 'Choose a lower scale; the safety limit is 50 MP.')}`, true); return; }
    const width = requestedWidth; const height = requestedHeight;
    const maxObjects = readLimit({ value: generatorState.maxObjects }, 'Max elements', 1, MAX_SERVER_OBJECTS);
    const lineLimit = readLimit({ value: generatorState.maxLines }, 'Max segments', 100, MAX_SERVER_OBJECTS);
    const segmentLimit = readLimit({ value: generatorState.nSegments }, 'N segments', 2, 256);
    if (maxObjects === null || lineLimit === null || segmentLimit === null) return;
    const threshold = generatorState.threshold; const detail = generatorState.detail; const mode = generatorState.mode; const invert = generatorState.invert; const inversion = generatorState.inversion; const background = generatorState.background; const thresholdMode = generatorState.thresholdMode;
    // All modes are processed by the server worker. A second browser
    // vectorizer could bypass the real mode-specific pipeline.
    if (mode === 'line-art' || mode === 'stencil' || mode === 'silhouette') {
      show(processingText);
      const form = new FormData();
      // Preserve the real extension: VTracer uses the input suffix to select its decoder.
      form.append('image', sourceFile, sourceFile.name);
      form.append('scale', String(Math.round(requestedScale * 100)));
      form.append('detail', String(detail));
      form.append('maxObjects', String(maxObjects));
      form.append('maxLines', String(lineLimit));
      form.append('mode', mode);
      form.append('thresholdMode', thresholdMode);
      form.append('threshold', String(threshold));
      form.append('invert', String(invert));
      form.append('inversion', String(inversion));
      form.append('background', background);
      form.append('lineWeight', String(generatorState.lineWeight));
      form.append('nSegments', String(segmentLimit));
      form.append('optimizeBlk', String(generatorState.optimizeBlk));
      form.append('optimizationMode', generatorState.optimizationMode);
      let response;
      if (window.hubAccess?.debugEnabled === true) console.debug('[ImageToSight] request mode', form.get('mode'));
      try { response = await fetch('/tools/image-to-sight/process', { method: 'POST', body: form }); }
      catch (error) { show(text('ProcessingFailed', 'Image processing failed. Check the server connection and try again.'), true); return; }
      if (generatorState.optimizeBlk) window.hubOptimizationResult?.(response, response.ok ? {} : await response.clone().json().catch(() => ({})));
      if (response.ok) {
        documentJson = await response.text();
        documentModel = JSON.parse(documentJson);
        if (id !== generation) return;
        if (window.hubAccess?.debugEnabled === true) console.debug('[ImageToSight] raw response document', { requestedMode: documentModel.requestedMode, processedMode: documentModel.processedMode, ...documentDiagnostics(documentModel) });
        // The editable result and its export policy are the same document sent to DRAW.
        finalBlk = null;
        const exported = await fetch('/tools/converter/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: documentJson }) });
        if (!exported.ok) throw new Error((await exported.json().catch(() => ({}))).error || text('UnableExport', 'Unable to export BLK.'));
        finalBlk = await exported.blob();
        const stats = documentModel.stats || {}; const elapsed = ((performance.now() - started) / 1000).toFixed(2);
        const resultMode = String(stats.mode || documentModel.generatorSettings?.mode || mode);
        if (resultMode !== mode || (stats.processor && !String(stats.processor).toLowerCase().includes(mode === 'line-art' ? 'line-art' : mode))) {
          documentModel = null;
          documentJson = null;
          finalBlk = null;
          show(format('ModeMismatch', [mode.toUpperCase(), resultMode.toUpperCase()], `Processing mode mismatch: requested ${mode.toUpperCase()}, received ${resultMode.toUpperCase()}.`), true);
          return;
        }
        renderResult(documentModel);
        metrics.textContent = format('GeneratedMetrics', [resultMode.toUpperCase(), (stats.objects || documentModel.elements.length).toLocaleString(), (stats.segments || 0).toLocaleString(), lineLimit.toLocaleString(), stats.processing_width || width, stats.processing_height || height, elapsed], `Generated ${resultMode.toUpperCase()} | Elements: ${documentModel.elements.length} | Time: ${elapsed}s`);
        if (window.hubAccess?.debugEnabled === true) console.debug('[ImageToSight] response modes', { requestMode: mode, workerMode: stats.mode, resultMode });
        const optimization = stats.optimization;
        const extra = stats.blk_optimization;
        const final = extra?.after || optimization?.after;
        benchmark.textContent = optimization ? format('GeometryOptimizationMetrics', [optimization.before.points.toLocaleString(), final.points.toLocaleString(), final.contours.toLocaleString(), (final.json_bytes / 1024).toFixed(1), (final.blk_bytes / 1024).toFixed(1)], 'Vertices: {0} -> {1} | Contours: {2} | JSON: {3} KB | BLK: {4} KB') : '';
        blkStats.hidden = !extra;
        blkStats.textContent = extra ? format('GeneratorOptimizationStats', [extra.before.objects, extra.before.segments, (extra.before.json_bytes / 1024).toFixed(1), (extra.before.blk_bytes / 1024).toFixed(1), extra.after.objects, extra.after.segments, (extra.after.json_bytes / 1024).toFixed(1), (extra.after.blk_bytes / 1024).toFixed(1), extra.blk_primitives_before, extra.blk_primitives_after], '') : '';
        resolution.textContent = format('SourceMetrics', [sourceWidth, sourceHeight, stats.processing_width || width, stats.processing_height || height, stats.sight_host_width || width, stats.sight_host_height || height, (stats.aspect_ratio || width / height).toFixed(3)], `Source: ${sourceWidth} x ${sourceHeight} px`);
        saveButton.disabled = false; drawerButton.disabled = false; saveSettings(); show(format('GeneratedStatus', [modeLabel(resultMode)], `Generated ${resultMode.toUpperCase()} result. Open in the Drawer to edit.`)); refreshUsage();
        return;
      }
      const error = await response.json().catch(() => ({})); const requestId = error.requestId || response.headers.get('X-ImageToSight-RequestId'); show(`${error.error || text('VTracerFailed', 'Image processing failed.')}${requestId ? ` Request ID: ${requestId}` : ''}`, true); refreshUsage(); return;
    }
  };

  const generate = async () => {
    if (generateButton.disabled) return;
    setBusy(true);
    try { await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve,0))); await generateCore(); }
    catch (error) { show(error.message || text('ProcessingFailed', 'Image processing failed.'), true); }
    finally { setBusy(false); }
  };
  generateButton.onclick = generate;
  Object.values(controls).forEach(control => control?.addEventListener('input', () => {
    syncStateFromControls();
    if (control !== controls.invert && control !== controls.inversion) saveSettings();
  }));
  Object.values(controls).forEach(control => control?.addEventListener('change', () => {
    syncStateFromControls();
    if (control === controls.mode) {
      generation += 1;
      documentModel = null;
      documentJson = null;
      finalBlk = null;
      rctx.fillStyle = '#050505'; rctx.fillRect(0, 0, result.width, result.height);
      metrics.textContent = ''; benchmark.textContent = '';
      blkStats.hidden = true; blkStats.textContent = ''; blkButton.disabled = true;
      saveButton.disabled = true; drawerButton.disabled = true;
    }
    if (control === controls.invert || control === controls.inversion) rebuildSourcePreview(control === controls.invert ? 'invert' : 'inversion');
    saveSettings();
  }));
  const download = (blob, filename) => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); };
  saveButton.onclick = () => documentModel && download(new Blob([documentJson], { type: 'application/json' }), `${sourceName}.json`);
  blkButton.onclick = () => finalBlk && download(finalBlk, `${sourceName}.blk`);
  drawerButton.onclick = () => { if (documentModel) { sessionStorage.setItem('hubThunderSightDocument', JSON.stringify(documentModel)); location.href = '/tools/draw'; } };
})();
