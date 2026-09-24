(() => {
  const root = document.querySelector('[data-converter]');
  if (!root) return;

  const grid = root.querySelector('.converter-grid');
  const inputPanel = root.querySelector('[data-converter-input-panel]');
  const directionIndicator = root.querySelector('[data-direction-indicator]');
  const switchDirection = root.querySelector('[data-switch-direction]');
  const inputTitle = root.querySelector('[data-input-title]');
  const outputTitle = root.querySelector('[data-output-title]');
  const fileLabel = root.querySelector('[data-file-label]');
  const inputFile = root.querySelector('[data-converter-file]');
  const dropHint = root.querySelector('[data-drop-hint]');
  const input = root.querySelector('[data-converter-input]');
  const output = root.querySelector('[data-converter-output]');
  const validate = root.querySelector('[data-validate]');
  const convert = root.querySelector('[data-convert]');
  const downloadOutput = root.querySelector('[data-download-output]');
  const exportNote = root.querySelector('[data-export-note]');
  const status = root.querySelector('[data-status]');
  if (!grid || !inputPanel || !directionIndicator || !switchDirection || !inputTitle || !outputTitle || !fileLabel || !inputFile || !dropHint || !input || !output || !validate || !convert || !downloadOutput || !exportNote || !status) return;

  const tools = window.hubTools || {};
  const copy = window.hubConverter || {};
  const MB = 1024 * 1024;
  const initialLimits = window.hubToolLimits;
  const state = {
    jsonInput: '',
    blkInput: '',
    blkOutput: '',
    jsonOutput: '',
    blkBlob: null,
    jsonBlob: null
  };
  const revision = { json: 0, blk: 0 };
  let importWarnings = [];
  const openDraw = document.createElement('button'); openDraw.type = 'button'; openDraw.className = 'secondary-button'; openDraw.dataset.openDraw = ''; openDraw.textContent = document.documentElement.lang === 'ru' ? 'ОТКРЫТЬ В DRAW' : 'OPEN IN DRAW'; openDraw.disabled = true; downloadOutput.after(openDraw);
  openDraw.onclick = () => { if(state.jsonOutput){sessionStorage.setItem('hubThunderSightDocument',state.jsonOutput);location.href='/tools/draw';} };
  const processing = { json: false, blk: false };
  let direction = 'json-to-blk';
  let maxJsonBytes = initialLimits.maxJsonBytes;
  let maxBlkBytes = initialLimits.maxBlkBytes;
  let hasPremiumBlkLimit = false;

  const localized = (key, fallback) => tools[key] || fallback;
  const message = (key, fallback) => copy[key] || localized(key, fallback);
  const isJsonToBlk = () => direction === 'json-to-blk';
  const show = (value, error = false) => {
    status.textContent = value;
    status.classList.toggle('error', error);
  };
  const api = (path, body) => fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const responseJson = async response => {
    try { return await response.json(); } catch (_) { return {}; }
  };
  const download = (blob, name) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const limitError = () => maxJsonBytes === MB
    ? message('jsonLimitStandard', 'JSON is limited to 1 MB. Premium members can use up to 5 MiB.')
    : message('jsonLimitPremium', 'Premium JSON limit: 5 MiB.');
  const blkLimitError = () => hasPremiumBlkLimit
    ? message('blkLimitPremium', 'BLK file is too large. Maximum size: 3 MiB.')
    : message('blkLimitStandard', 'BLK file is too large. Maximum size: 500 KiB.');
  const byteLength = value => new TextEncoder().encode(value).byteLength;
  const inputKey = mode => mode === 'json-to-blk' ? 'jsonInput' : 'blkInput';
  const outputKey = mode => mode === 'json-to-blk' ? 'blkOutput' : 'jsonOutput';
  const blobKey = mode => mode === 'json-to-blk' ? 'blkBlob' : 'jsonBlob';
  const revisionKey = mode => mode === 'json-to-blk' ? 'json' : 'blk';

  const invalidateOutput = mode => {
    if(mode==='blk-to-json'){openDraw.disabled=true;importWarnings=[];}
    state[outputKey(mode)] = '';
    state[blobKey(mode)] = null;
    if (direction === mode) {
      output.value = '';
      downloadOutput.disabled = true;
    }
  };
  const updateInput = (mode, value) => {
    state[inputKey(mode)] = value;
    revision[revisionKey(mode)] += 1;
    invalidateOutput(mode);
  };
  const render = () => {
    const jsonToBlk = isJsonToBlk();
    const mode = direction;
    const hasOutput = Boolean(state[blobKey(mode)]);

    root.dataset.direction = mode;
    grid.dataset.direction = mode;
    directionIndicator.textContent = jsonToBlk
      ? message('jsonToBlk', 'JSON -> BLK')
      : message('blkToJsonDirection', 'BLK -> JSON');
    inputTitle.textContent = jsonToBlk
      ? message('inputJson', 'INPUT JSON')
      : message('inputBlk', 'INPUT BLK');
    outputTitle.textContent = jsonToBlk
      ? message('outputBlk', 'OUTPUT BLK')
      : message('outputJson', 'OUTPUT JSON');
    fileLabel.textContent = jsonToBlk
      ? message('openJson', 'OPEN JSON')
      : message('openBlk', 'OPEN BLK');
    inputFile.accept = jsonToBlk ? 'application/json,.json' : '.blk,text/plain';
    inputFile.value = '';
    dropHint.textContent = jsonToBlk
      ? message('dropJson', 'Drop a JSON file here or choose one.')
      : message('dropBlk', 'Drop a BLK file here or choose one.');
    input.value = state[inputKey(mode)];
    input.setAttribute('aria-label', inputTitle.textContent);
    input.placeholder = jsonToBlk
      ? '{"metadata":{"name":"my-sight","version":1},"settings":{"thousandth":true},"elements":[]}'
      : '';
    output.value = state[outputKey(mode)];
    output.setAttribute('aria-label', outputTitle.textContent);
    validate.hidden = !jsonToBlk;
    validate.disabled = processing.json;
    convert.textContent = jsonToBlk
      ? message('convertToBlk', 'CONVERT TO BLK')
      : message('blkToJson', 'BLK TO JSON');
    convert.disabled = processing[revisionKey(mode)];
    downloadOutput.textContent = jsonToBlk
      ? message('downloadBlk', 'DOWNLOAD BLK')
      : message('saveJson', 'SAVE JSON');
    downloadOutput.disabled = !hasOutput;
    openDraw.hidden = jsonToBlk;
    openDraw.disabled = jsonToBlk || !state.jsonOutput;
    exportNote.hidden = !jsonToBlk;
    inputPanel.classList.remove('is-drop-target');
  };

  const loadFile = async (file, mode) => {
    if (!file) return false;
    if (mode === 'blk-to-json') await converterUsage;
    if (mode === 'json-to-blk' && file.size > maxJsonBytes) {
      if (direction === mode) show(limitError(), true);
      return false;
    }
    if (mode === 'blk-to-json' && file.size > maxBlkBytes) {
      if (direction === mode) show(blkLimitError(), true);
      return false;
    }

    const content = await file.text();
    updateInput(mode, content);
    if (direction === mode) {
      render();
      show(message('loaded', 'Loaded {0}.').replace('{0}', file.name));
    }
    return true;
  };

  ['dragenter', 'dragover'].forEach(name => inputPanel.addEventListener(name, event => {
    event.preventDefault();
    inputPanel.classList.add('is-drop-target');
  }));
  ['dragleave', 'drop'].forEach(name => inputPanel.addEventListener(name, event => {
    event.preventDefault();
    inputPanel.classList.remove('is-drop-target');
  }));
  inputPanel.addEventListener('drop', event => loadFile(event.dataTransfer?.files?.[0], direction));
  inputFile.addEventListener('change', event => {
    const mode = direction;
    loadFile(event.target.files?.[0], mode).finally(() => { inputFile.value = ''; });
  });
  input.addEventListener('input', () => {
    updateInput(direction, input.value);
    show('');
  });

  switchDirection.addEventListener('click', () => {
    direction = isJsonToBlk() ? 'blk-to-json' : 'json-to-blk';
    show('');
    render();
  });
  validate.addEventListener('click', async () => {
    const mode = 'json-to-blk';
    const currentRevision = revision.json;
    const json = state.jsonInput;
    processing.json = true;
    render();
    try {
      const response = await api('/tools/converter/validate', { json });
      const data = await responseJson(response);
      if (direction !== mode || revision.json !== currentRevision) return;
      show(response.ok
        ? localized('ValidJson', 'JSON is valid.')
        : (data.errors || [data.error || localized('ValidationFailed', 'Validation failed.')]).join(' '), !response.ok);
    } finally {
      processing.json = false;
      if (direction === mode) render();
    }
  });
  convert.addEventListener('click', async () => {
    const mode = direction;
    if (mode === 'blk-to-json') await converterUsage;
    const revisionName = revisionKey(mode);
    const currentRevision = revision[revisionName];
    const source = state[inputKey(mode)];
    if (mode === 'blk-to-json' && !source.trim()) {
      show(message('unsupportedBlk', 'Unsupported or malformed BLK.'), true);
      return;
    }
    if (mode === 'blk-to-json' && byteLength(source) > maxBlkBytes) {
      show(blkLimitError(), true);
      return;
    }

    processing[revisionName] = true;
    render();
    try {
      const response = await api(
        mode === 'json-to-blk' ? '/tools/converter/export' : '/tools/converter/import-blk',
        mode === 'json-to-blk' ? { json: source } : { blk: source });
      if (!response.ok) {
        const data = await responseJson(response);
        if (direction === mode && revision[revisionName] === currentRevision) {
          const fallback = mode === 'json-to-blk'
            ? localized('ConversionFailed', 'Conversion failed.')
            : message('unsupportedBlk', 'Unsupported or malformed BLK.');
          show((data.errors || [data.error || fallback]).join(' '), true);
        }
        return;
      }

      if (mode === 'json-to-blk') {
        const blob = await response.blob();
        const text = await blob.text();
        if (revision.json !== currentRevision) return;
        state.blkBlob = blob;
        state.blkOutput = text;
      } else {
        const data = await responseJson(response);
        if (revision.blk !== currentRevision) return;
        importWarnings = data.warnings || [];
        openDraw.disabled = false;
        state.jsonOutput = JSON.stringify(data, null, 2);
        state.jsonBlob = new Blob([state.jsonOutput], { type: 'application/json' });
      }

      if (direction === mode) {
        render();
        show(mode === 'json-to-blk'
          ? localized('BlkReady', 'BLK generated. Download is ready.')
          : [message('blkImported', 'BLK imported. JSON is ready for editing.'), ...importWarnings].join(' '));
      }
    } finally {
      processing[revisionName] = false;
      if (direction === mode) render();
    }
  });
  downloadOutput.addEventListener('click', () => {
    if (isJsonToBlk()) download(state.blkBlob, 'sight.blk');
    else download(state.jsonBlob, 'sight.json');
  });

  const converterUsage = fetch('/tools/converter/usage', { credentials: 'same-origin' }).then(async response => {
    if (!response.ok) return;
    const usage = await response.json();
    maxJsonBytes = usage.maxJsonBytes;
    hasPremiumBlkLimit = usage.isPremium === true;
    maxBlkBytes = Number.isInteger(usage.maxBlkBytes)
      ? usage.maxBlkBytes
      : initialLimits.maxBlkBytes;
    const note = root.querySelector('[data-converter-limit]');
    if (note && usage.isPremium) note.textContent = note.dataset.premiumLimit;
    if (usage.isPremium) root.querySelector('[data-converter-premium]')?.setAttribute('hidden', 'hidden');
  }).catch(() => {});

  render();
})();
