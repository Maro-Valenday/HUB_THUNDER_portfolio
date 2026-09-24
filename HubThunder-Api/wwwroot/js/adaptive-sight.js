(() => {
  'use strict';
  const root = document.querySelector('[data-drawer]'), panel = root?.querySelector('[data-adaptive-panel]');
  if (!panel || !root.sightEditor) return;
  const editor = root.sightEditor, core = window.hubAdaptiveSight, texts = window.hubAdaptiveTexts;
  const standalone = root.dataset.adaptiveStandalone === 'true';
  const t = key => texts['Adaptive' + key] || texts[key] || texts.AdaptiveRequestFailed;
  const $ = name => panel.querySelector(`[data-adaptive-${name}]`);
  const copy = value => JSON.parse(JSON.stringify(value));
  const currentVersion = $('version').options[0].value;
  let vehicles = [], tank = null, request = null, profile = null, revision = 0, syncing = false, loaded = false, loadingTank = false;
  const statuses = $('status');
  const status = (message, error = false) => { statuses.textContent = message; statuses.classList.toggle('error', error); };
  const errorMessage = error => texts['Adaptive' + error.message] || error.userMessage || t('IncompatibleConfiguration');
  (standalone ? root.querySelector('.drawer-tools') : root.querySelector('.drawer-inspector')).prepend(panel);
  const defaults = (vehicle, dataVersion) => ({ tankId: vehicle.id, dataVersion, ammunitionId: '', family: 'Tochka', mode: 'Base', language: document.documentElement.lang.startsWith('ru') ? 'ru' : 'en',
    settings: { sensitivity: .5, zoomIn: vehicle.zoomIn, zoomOut: vehicle.zoomOut, length: 6.5, height: 2.7, width: 3.2, targetSpeed: 10,
      lineSize: 1.5, fontSize: .75, distanceFactor: 1, innerDiameter: 5, pointThickness: 2, rangeMarks: true, outerLines: true,
      ballisticInfo: true, sightName: true, targetDimensions: true, targetLock: true, rangefinder: true, distance: true,
      rangefinderPosition: [250,.2], distancePosition: [70.5,47], allyPosition: [-345,.2], lightColor:'#ff0000', progressColor:'#00ff00', progressBackground:'#ffffff' } });
  const api = async (path, body) => {
    const response = await fetch('/tools/adaptive-sight/' + path, body ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) } : {});
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(value.code || 'RequestFailed'), { userMessage:value.error });
    return value;
  };
  const populateVehicles = () => {
    const query = $('search').value.trim().toLowerCase(), selected = request?.tankId || $('tank').value;
    const visible = vehicles.filter(v => v.id.toLowerCase().includes(query) || v.id === selected);
    $('tank').replaceChildren(...visible.map(v => new Option(v.id, v.id)));
    if (selected) $('tank').value = selected;
  };
  const saved = document => standalone ? document.metadata?.adaptiveWorkbench : document.metadata?.manualSight;
  const saveRequest = () => {
    if (syncing || !request) return;
    const document = editor.read();
    if (standalone) {
      document.metadata ||= {};
      const workbench = document.metadata.adaptiveWorkbench ||= { version:1, activeTankId:request.tankId, tanks:{} };
      workbench.activeTankId = request.tankId;
      workbench.tanks[request.tankId] = { request:copy(request), profile:copy(profile) };
    } else {
      const state = core.state(document);
      state.activeTankId = request.tankId;
      state.tanks[request.tankId] ||= { bindings:{} };
      state.tanks[request.tankId].request = copy(request);
      state.tanks[request.tankId].profile = copy(profile);
    }
    syncing = true; editor.commit(document); syncing = false;
    updateExport();
  };
  function updateExport() {
    const document = editor.read(), exported = standalone ? document.metadata?.adaptiveSight?.tankId : document.metadata?.manualSight?.activeTankId;
    $('export-tank').textContent = exported || request?.tankId || '';
    $('install-path').textContent = request ? `UserSights/all_tanks/` : '';
    $('package').disabled = loadingTank || !exported || !document.elements.length;
    if (standalone) {
      const matches = document.elements.length > 0 && JSON.stringify(document.metadata?.adaptiveSight) === JSON.stringify(request);
      root.querySelector('[data-action="export-blk"]').disabled = loadingTank || !matches;
      $('package').disabled = loadingTank || !matches;
    }
  }
  function modes() {
    if (!standalone) { request.mode = 'Base'; request.family = 'Tochka'; return; }
    const names = request.family === 'Tochka' ? ['Base','Double','Laser','Rocket','Howitzer'] : ['Luch','LuchLite','Sector'].includes(request.family) ? ['Base'] : ['Base','Rocket'];
    $('mode').replaceChildren(...names.map(mode => new Option(t(mode === 'Rocket' ? 'RocketMode' : mode), mode)));
    if (!names.includes(request.mode)) request.mode = 'Base';
    $('mode').value = request.mode;
    $('wheel-help').hidden = !['Tochka','Luch','Sector'].includes(request.family);
    if (request.mode === 'Howitzer') { request.settings.sensitivity = 1; $('sensitivity').value = 100; }
    $('sensitivity').disabled = request.mode === 'Howitzer';
    $('second-wrap').hidden = $('second-table').hidden = request.mode !== 'Double';
    $('rocket-wrap').hidden = !['Tochka','Luch'].includes(request.family) || ['Double','Rocket'].includes(request.mode);
    if ($('rocket-wrap').hidden) request.rocketId = null;
  }
  function fill() {
    if (!request || !tank) return;
    $('tank').value = request.tankId; if ($('family')) $('family').value = request.family;
    $('version').value = request.dataVersion || 'legacy';
    const available = vehicles.find(v => v.id === request.tankId)?.versions || [];
    [...$('version').options].forEach(option => { option.disabled = !available.includes(option.value); });
    const choices = tank.ammunition.filter(a => !['smoke','practice','shrapnel','rocket'].includes(a.type));
    $('ammunition').replaceChildren(...choices.map(a => new Option(`${a.name} (${a.id})`, a.id)));
    if (!choices.some(a => a.id === request.ammunitionId)) request.ammunitionId = choices.find(a => a.hasBallistics)?.id || choices[0]?.id || '';
    $('ammunition').value = request.ammunitionId;
    if (standalone) {
      $('second').replaceChildren(new Option(t('None'),''), ...choices.filter(a => !a.isRocket && a.id !== request.ammunitionId).map(a => new Option(a.name, a.id)));
      $('second').value = request.secondAmmunitionId || '';
      $('rocket').replaceChildren(new Option(t('None'),''), ...choices.filter(a => a.isRocket).map(a => new Option(a.name, a.id)));
      $('rocket').value = request.rocketId || '';
    }
    modes(); $('sensitivity').value = request.settings.sensitivity * 100;
    panel.querySelectorAll('[data-adaptive-setting]').forEach(input => {
      const value = request.settings[input.dataset.adaptiveSetting];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value ?? '';
    });
    panel.querySelectorAll('[data-adaptive-position]').forEach(input => { input.value = request.settings[input.dataset.adaptivePosition][Number(input.dataset.axis)]; });
    if (standalone) {
      const common = ['zoomIn','zoomOut','length','targetSpeed','lineSize','pointThickness','lightColor','progressColor','progressBackground'];
      const fields = request.family === 'Tochka' ? null : common.concat(['Luch','LuchLite'].includes(request.family)
        ? ['height','rangeMarks'] : ['width','fontSize','distanceFactor','innerDiameter','distance', ...(request.family === 'Duga2' ? ['outerLines'] : [])]);
      panel.querySelectorAll('[data-adaptive-setting]').forEach(input => { input.closest('label').hidden = fields !== null && !fields.includes(input.dataset.adaptiveSetting); });
      panel.querySelectorAll('[data-adaptive-position]').forEach(input => { input.closest('fieldset').hidden = ['Luch','LuchLite'].includes(request.family); });
    }
    $('table-status').textContent = t(request.ballisticTable ? 'UploadTable' : 'DefaultTable');
    updateExport();
  }
  function rangePreview() {
    const enabled = $('preview').checked && profile && (standalone || editor.tool() === 'manual');
    $('range').disabled = $('range-number').disabled = !enabled;
    if (!enabled) { editor.preview(null); return; }
    try {
      const distance = Number($('range-number').value);
      const sampled = standalone ? core.sample(profile.rows, distance, profile.step, Number($('range').max)) : null;
      const lift = sampled ? sampled.elevation : core.elevation(profile.rows, distance, profile.step);
      $('elevation').textContent = `${t('Elevation')}: ${lift.toFixed(4)}${sampled ? `; ${t('Range')}: ${sampled.distance.toFixed(1)}` : ''}`;
      editor.preview(element => core.preview(element, lift));
    } catch (error) { editor.preview(null); status(errorMessage(error), true); }
  }
  function useProfile(value) {
    if (!value || !Number.isFinite(value.step) || value.step <= 0 || !Array.isArray(value.rows) || value.rows.length < 3 ||
        value.rows.some((row, index) => !Number.isFinite(row.distance) || row.distance < 0 || index > 0 && row.distance <= value.rows[index - 1].distance)) throw new Error('IncompatibleConfiguration');
    profile = value;
    const max = Math.min(request?.family === 'Luch' ? 3400 : 4000, profile.rows.at(-1).distance), min = profile.rows[0].distance;
    for (const input of [$('range'),$('range-number')]) { input.min = min; input.max = max; input.value = Math.max(min, Math.min(max, Number(input.value))); }
    rangePreview();
  }
  async function chooseTank(id, restore = false, forcedVersion = null) {
    const version = ++revision;
    loadingTank = true;
    panel.querySelectorAll('input,select,button').forEach(input => { if (input !== $('tank') && input !== $('search')) input.disabled = true; });
    root.querySelector('[data-action="export-blk"]').disabled = true;
    status(t('Working')); $('generate').disabled = true;
    try {
      const vehicle = vehicles.find(v => v.id === id);
      if (!vehicle) throw new Error('UnknownTank');
      const document = editor.read(), stored = saved(document), previous = stored?.tanks?.[id];
      const savedRequest = previous?.request || (standalone && document.metadata?.adaptiveSight?.tankId === id ? document.metadata.adaptiveSight : null);
      const dataVersion = forcedVersion || (savedRequest ? savedRequest.dataVersion || 'legacy' : vehicle.versions.includes(currentVersion) ? currentVersion : 'legacy');
      const nextTank = await api('tank/' + encodeURIComponent(id) + '?dataVersion=' + encodeURIComponent(dataVersion));
      if (version !== revision) return;
      tank = nextTank;
      if (stored && stored.version !== 1) throw new Error('IncompatibleConfiguration');
      if (!standalone && stored) core.state(document);
      request = copy(!forcedVersion && savedRequest || defaults(nextTank, dataVersion));
      if (request.tankId !== id || !request.settings) throw new Error('IncompatibleConfiguration');
      request.language = window.document.documentElement.lang.startsWith('ru') ? 'ru' : 'en';
      profile = !forcedVersion && previous?.profile || null;
      fill();
      if (!restore) {
        syncing = true;
        if (standalone) {
          document.elements = []; delete document.blk; delete document.metadata?.adaptiveSight;
          editor.commit(document);
        } else editor.commit(core.switchTank(document, id, request));
        syncing = false;
        saveRequest();
      }
      if (profile) useProfile(profile); else rangePreview();
      updateExport(); status(t('Ready'));
    } catch (error) { profile = null; request = null; status(errorMessage(error), true); }
    finally {
      syncing = false;
      if (version === revision) {
        loadingTank = false;
        panel.querySelectorAll('input,select,button').forEach(input => { input.disabled = !request; });
        $('tank').disabled = $('search').disabled = false;
        if (request) modes();
        rangePreview(); updateExport();
        if (!standalone) root.querySelector('[data-action="export-blk"]').disabled = false;
      }
    }
  }
  function changed() {
    if (loadingTank) return;
    ++revision; profile = null; $('preview').checked = false; rangePreview();
    saveRequest(); $('generate').disabled = false;
  }
  $('search').addEventListener('input', populateVehicles);
  $('tank').addEventListener('change', () => chooseTank($('tank').value));
  $('version').addEventListener('change', () => chooseTank($('tank').value, false, $('version').value));
  $('package').onclick = async () => {
    $('package').disabled = true;
    try {
      const response = await fetch('/tools/converter/export?adaptivePackage=true', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({json:JSON.stringify(editor.read())}) });
      if (!response.ok) { const error = await response.json(); throw Object.assign(new Error(error.code || 'RequestFailed'), {userMessage:error.error}); }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = `UserSights_${request.tankId}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { status(errorMessage(error), true); }
    finally { updateExport(); }
  };
  $('ammunition').addEventListener('change', () => { request.ammunitionId = $('ammunition').value; request.ballisticTable = null; request.secondAmmunitionId = null; fill(); changed(); });
  $('family')?.addEventListener('change', () => {
    request.family = $('family').value;
    if (request.family === 'LuchLite') Object.assign(request.settings, { height:2.4, pointThickness:5 });
    else if (request.family === 'Luch') Object.assign(request.settings, { height:2.4, pointThickness:2 });
    else if (request.family !== 'Tochka') Object.assign(request.settings, { rangefinderPosition:[120,.01], distancePosition:[.05,.05], allyPosition:[120,-.01] });
    fill(); changed();
  });
  $('mode')?.addEventListener('change', () => { request.mode = $('mode').value; request.ballisticTable = request.secondBallisticTable = null; modes(); changed(); });
  $('second')?.addEventListener('change', () => { request.secondAmmunitionId = $('second').value || null; request.secondBallisticTable = null; changed(); });
  $('rocket')?.addEventListener('change', () => { request.rocketId = $('rocket').value || null; changed(); });
  $('sensitivity').addEventListener('change', () => { request.settings.sensitivity = Number($('sensitivity').value) / 100; request.ballisticTable = request.secondBallisticTable = null; changed(); });
  panel.querySelectorAll('[data-adaptive-setting], [data-adaptive-position]').forEach(input => input.addEventListener('change', () => {
    if (input.dataset.adaptivePosition) request.settings[input.dataset.adaptivePosition][Number(input.dataset.axis)] = Number(input.value);
    else request.settings[input.dataset.adaptiveSetting] = input.type === 'checkbox' ? input.checked : input.type === 'color' ? input.value : Number(input.value);
    changed();
  }));
  panel.querySelectorAll('[data-adaptive-table]').forEach(input => input.addEventListener('change', async () => {
    const file = input.files[0], version = revision;
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.txt')) throw new Error('InvalidBallistics');
      if (file.size > 1_000_000) throw new Error('TooLarge');
      const content = await file.text(); if (version !== revision) return;
      request[input.dataset.adaptiveTable] = content; changed(); fill();
    } catch (error) { status(errorMessage(error), true); }
    finally { input.value = ''; }
  }));
  $('reset-table').onclick = () => { request.ballisticTable = request.secondBallisticTable = null; changed(); fill(); };
  $('units')?.addEventListener('click', () => {
    const document = editor.read(); document.settings.thousandth = true; document.settings.thousandthType = 'real';
    syncing = true; editor.commit(document); syncing = false;
  });
  $('preview').onchange = rangePreview;
  $('range').oninput = () => { $('range-number').value = $('range').value; rangePreview(); };
  $('range-number').oninput = () => { $('range').value = $('range-number').value; rangePreview(); };
  $('generate').onclick = async () => {
    if (!request) return;
    const snapshot = JSON.stringify(editor.read()), selected = editor.selected(), version = ++revision;
    $('generate').disabled = true; status(t('Working'));
    try {
      if ([...panel.querySelectorAll('input[type=number]')].some(input => !input.disabled && !input.checkValidity())) throw new Error('InvalidSettings');
      if (!standalone && !editor.read().elements.length) throw new Error('EmptyDrawing');
      const result = await api(standalone ? 'generate' : 'profile', request);
      if (version !== revision || snapshot !== JSON.stringify(editor.read())) return;
      syncing = true;
      if (standalone) {
        const nextProfile = { rows:result.ballistic, step:result.step, radius:result.radius, angularStep:result.angularStep, radialSpeed:result.radialSpeed };
        result.document.metadata.adaptiveSight = copy(request);
        result.document.metadata.adaptiveWorkbench = editor.read().metadata?.adaptiveWorkbench || { version:1, tanks:{} };
        result.document.metadata.adaptiveWorkbench.activeTankId = request.tankId;
        result.document.metadata.adaptiveWorkbench.tanks[request.tankId] = { request:copy(request), profile:nextProfile };
        editor.commit(result.document);
        useProfile(nextProfile);
      } else {
        editor.commit(core.applyManual(editor.read(), request, result, selected, $('scope').value === 'all'));
        useProfile(result);
      }
      syncing = false;
      $('preview').checked = true; rangePreview(); updateExport();
      if (standalone) editor.fit();
      status(t(standalone ? 'Generated' : 'Applied'));
    } catch (error) { syncing = false; status(errorMessage(error), true); }
    finally { if (version === revision) $('generate').disabled = false; }
  };
  root.addEventListener('sight-tool-changed', () => {
    const active = standalone || editor.tool() === 'manual';
    panel.hidden = !active; root.classList.toggle('manual-active', !standalone && active);
    if (active && !loaded) init();
    rangePreview();
  });
  root.addEventListener('sight-document-changed', () => {
    if (syncing || !loaded) return;
    ++revision; editor.preview(null);
    const document = editor.read(), value = saved(document), id = value?.activeTankId || document.metadata?.adaptiveSight?.tankId;
    if (vehicles.length) chooseTank(id || 'cn_cm11', true);
  });
  async function init() {
    loaded = true;
    try {
      vehicles = await api('catalog'); populateVehicles();
      const document = editor.read(), id = saved(document)?.activeTankId || document.metadata?.adaptiveSight?.tankId || 'cn_cm11';
      await chooseTank(id, true);
    } catch (error) { loaded = false; status(errorMessage(error), true); }
  }
  if (standalone) { panel.hidden = false; init(); }
})();
