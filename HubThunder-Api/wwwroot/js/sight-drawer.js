(() => {
  const root = document.querySelector('[data-drawer]');
  if (!root) return;
  const adaptiveStandalone = root.dataset.adaptiveStandalone === 'true';
  const draftKey = adaptiveStandalone ? 'adaptive' : 'latest';
  const draftFallbackKey = adaptiveStandalone ? 'hubThunderAdaptiveDraft' : 'hubThunderDrawDraft';
  let adaptivePreview = null;
  const canvas = root.querySelector('[data-canvas]');
  const ctx = canvas.getContext('2d');
  const elementsEl = root.querySelector('[data-elements]');
  const props = root.querySelector('[data-properties]');
  const coords = root.querySelector('[data-coordinates]');
  const zoomLabel = root.querySelector('[data-zoom]');
  const toolLabel = root.querySelector('[data-current-tool]');
  const hatchSettings = root.querySelector('[data-hatch-settings]');
  const hatchSpacingInput = root.querySelector('[data-hatch="spacing"]');
  const hatchSpacingRange = (() => {
    if (!hatchSettings || !hatchSpacingInput) return null;
    hatchSpacingInput.value = '0.5'; hatchSpacingInput.min = '0.001'; hatchSpacingInput.max = '100'; hatchSpacingInput.step = '0.01';
    const range = document.createElement('input'); range.type = 'range'; range.min = '0.01'; range.max = '5'; range.step = '0.01'; range.value = hatchSpacingInput.value; range.dataset.hatchSpacingRange = '';
    hatchSpacingInput.closest('label')?.append(range);
    const warning = document.createElement('p'); warning.className = 'property-note'; warning.dataset.hatchWarning = ''; warning.hidden = true; warning.textContent = 'Dense hatch: maximum 10,000 primitives per object. Increase spacing if export exceeds the budget.'; hatchSettings.append(warning);
    const sync = value => { hatchSpacingInput.value = value; range.value = Math.max(.01, Math.min(5, Number(value) || .5)); warning.hidden = Number(value) >= .01; render(); };
    range.addEventListener('input', () => { sync(range.value); hatchSpacingInput.dispatchEvent(new Event('input')); }); hatchSpacingInput.addEventListener('input', () => sync(hatchSpacingInput.value));
    return range;
  })();
  const referencePreview = document.createElement('img');
  referencePreview.hidden = true;
  referencePreview.alt = '';
  referencePreview.draggable = false;
  referencePreview.style.cssText = 'position:absolute;left:50%;top:50%;max-width:70%;max-height:70%;transform-origin:center;pointer-events:none;opacity:.5;z-index:3';
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.append(referencePreview);
  canvas.style.position = 'relative';
  canvas.style.zIndex = '2';
  const texts = window.hubTools || {};
  const text = (key, fallback) => texts[key] || fallback;
  const isRu = (document.documentElement.lang || '').toLowerCase().startsWith('ru');
  const localized = (en, ru) => isRu ? ru : en;
  const paintFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const imageSizeMessage = () => document.documentElement.lang?.toLowerCase().startsWith('ru') ? 'Размер изображения не должен превышать 10 MiB.' : 'Image exceeds the maximum size of 10 MiB.';
  const MAX_ZOOM = 50;
  const cp = p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 });
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  let elements = [];
  let blkMetrics = null;
  let documentEnvelope = {};
  let referenceWorldSize = null;
  let documentSettings = { thousandth: true, thousandthType: 'ussr', lineSizeMult: 1, fontSizeMult: 1 };
  let importedBlk = null;
  let generatorSettings = { invert: false, inversion: false };
  let selection = new Set();
  let tool = 'select';
  let drawing = null;
  let drag = null;
  let pointer = { x: 0, y: 0 };
  let pointerInside = false;
  let selectionHandles = [];
  let snapTarget = null;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let space = false;
  let history = [];
  let historyIndex = -1;
  let draftTouched = false;
  let clipboard = [];
  let importedDocument = false;
  let jsonImportLimit = window.hubToolLimits.maxJsonBytes;
  let blkImportLimit = window.hubToolLimits.maxBlkBytes;
  let refDrag = null;
  let referenceFile = null;
  let previewMode = false;
  let normalizedReticle = null;
  let processing = false;
  const gamePreview = new Image();
  gamePreview.onload = () => { if (previewMode) render(); };
  gamePreview.src = '/img/game-preview.jpg';
  let geometryBudgetExceeded = false;
  const transformState = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  const toolButtons = [...root.querySelectorAll('[data-tool]')];
  const localizeDrawText = () => {
    if (!(document.documentElement.lang || '').toLowerCase().startsWith('ru')) return;
    const replacements = new Map([['Select','Выбрать'],['Polyline','Полилиния'],['Brush','Кисть'],['Curve','Кривая'],['Hatch','Штриховка'],['Fill','Заливка'],['Shapes','Фигуры'],['Text','Текст'],['Object properties','Свойства объекта'],['Tool options','Параметры инструмента'],['Region','Область'],['Document','Документ'],['Preview','Предпросмотр'],['Edit','Редактор'],['Search shapes','Поиск фигур'],['All categories','Все категории'],['Smoothing','Сглаживание'],['Simplification','Упрощение'],['Shapes','Фигуры'],['Shape','Фигура'],['Brush size','Размер кисти'],['Angle ','Угол '],['Spacing ','Интервал '],['Line width ','Толщина линии '],['Offset ','Смещение '],['Direction ','Направление '],['Crosshatch','Перекрёстная штриховка'],['Mode ','Режим '],['Forward','Вперёд'],['Reverse','Назад'],['Lines','Линии'],['Ribbons','Полосы'],['Custom name','Пользовательское имя'],['Left','Слева'],['Center','По центру'],['Right','Справа'],['Effects','Эффекты'],['All','Все'],['Editor font','Шрифт редактора'],['Font size','Размер шрифта'],['Align','Выравнивание'],['Move with range','Двигать с дальностью'],['Highlight','Подсветка'],['Game font: War Thunder. Font family and rotation below are editor-only; size is a game multiplier.','Игровой шрифт: War Thunder. Семейство и поворот ниже используются только в редакторе; размер задаётся множителем игры.'],['Units','Единицы'],['Thousandth coordinates','Координаты в тысячных'],['Line multiplier','Множитель линий'],['Font multiplier','Множитель шрифта'],['Edit vertices','Редактировать вершины'],['Rectangle','Прямоугольник'],['Lasso','Лассо']]);
    Object.entries({
      'DRAW':'Рисование','OBJECTS':'Объекты','Line':'Линия','Quad':'Четырёхугольник',
      'Hatch settings':'Параметры штриховки','Object properties':'Свойства объекта',
      'No selection':'Ничего не выбрано','Restore draft':'Восстановить черновик',
      'Combine regions':'Объединить области','Mirror horizontal':'Отразить по горизонтали','Mirror vertical':'Отразить по вертикали',
      'Game size':'Размер в игре','Game font: War Thunder':'Игровой шрифт: War Thunder','Editor rotation':'Поворот в редакторе',
      'Diameter':'Диаметр','Circle thickness':'Толщина окружности','Segment start':'Начало дуги','Segment end':'Конец дуги',
      'Ribbon width':'Ширина полосы','Cross offset':'Поперечное смещение','Endpoint order':'Порядок концов',
      'Fill rule':'Правило заливки','evenodd':'Чётность','nonzero':'Ненулевое заполнение','Editor opacity':'Прозрачность в редакторе',
      'Thousandth units':'Единицы в тысячных','Radial movement':'Радиальное движение','Move radial':'Двигать радиально',
      'Radial angle':'Радиальный угол','Radial speed':'Радиальная скорость','Radial center X':'Радиальный центр X',
      'Radial center Y':'Радиальный центр Y','Pivot X':'Центр вращения X','Pivot Y':'Центр вращения Y','Vertex':'Вершина',
      'Saved':'Сохранено','Saving':'Сохраняется','Save failed':'Не удалось сохранить',
      'Shape category':'Категория фигур','Custom font name':'Название шрифта','Sight':'Прицел',
      'USSR 6000':'СССР 6000','NATO 6400':'НАТО 6400','Real 6283':'Радианы 6283',
      'Basic':'Основные','Symbols':'Символы','Markers':'Метки','Crosshair':'Перекрестие','Military':'Военные','Country':'Опознавательные знаки',
      'Square':'Квадрат','Triangle':'Треугольник','Circle':'Круг','Diamond':'Ромб','Pentagon':'Пятиугольник','Hexagon':'Шестиугольник','Octagon':'Восьмиугольник',
      'Star':'Звезда','Anime Star':'Аниме-звезда','Heart':'Сердце','Checkmark':'Галочка','Cross':'Крест','Plus':'Плюс','Minus':'Минус','Bracket':'Скобка',
      'Arrow':'Стрелка','Chevron':'Шеврон','Direction':'Направление','Distance marks':'Метки дистанции','Impact marker':'Метка попадания',
      'Target':'Мишень','Dot':'Точка','Ring':'Кольцо','Ring crosshair':'Кольцевое перекрестие','Open target':'Открытая мишень',
      'Armour symbol':'Бронетехника','Infantry symbol':'Пехота','Aircraft symbol':'Авиация','Air defence':'ПВО','Waypoint':'Путевая точка',
      'Roundel outline':'Круглый знак','Star roundel':'Звезда в круге','Star and bars':'Звезда с полосами','Flag outline':'Контур флага','Tricolour outline':'Контур триколора',
      'Explosion':'Взрыв','Impact':'Попадание','Spark':'Искра','Flash':'Вспышка','Smoke contour':'Контур дыма','Burst':'Разлёт лучей',
      'Starburst':'Лучистая звезда','Hit marker':'Метка попадания','Damage marker':'Метка повреждения','Shockwave':'Ударная волна',
      'Radial burst':'Радиальные лучи','Warning':'Предупреждение','Attention':'Внимание','Arrow burst':'Веер стрелок','Free shape':'Свободная фигура',
      'Arrows / Shift / Ctrl':'Стрелки / Shift / Ctrl','Move 0.1 / 1 / 0.01':'Сдвиг 0.1 / 1 / 0.01','Fit / Zoom':'Вписать / Масштаб',
      'Save JSON':'Сохранить JSON','Space + drag':'Пробел + перетаскивание','Mouse wheel':'Колесо мыши','VECTORIZE REFERENCE':'Векторизовать изображение',
      'Dense hatch: maximum 10,000 primitives per object. Increase spacing if export exceeds the budget.':'Плотная штриховка: максимум 10 000 примитивов на объект. Увеличьте интервал при превышении лимита экспорта.'
    }).forEach(([from,to]) => replacements.set(from,to));
    const labels = new Map([...replacements].map(([from,to]) => [from.trim().toLowerCase(),to.trim()]));
    const translate = value => {
      const trimmed = value.trim(), direct = labels.get(trimmed.toLowerCase());
      if (direct) return value.replace(trimmed, direct);
      const item = trimmed.match(/^(line|polyline|quad|circle|brush|curve|hatch|fill|shape|text) (\d+)$/i);
      if (item) return `${labels.get(item[1].toLowerCase())} ${item[2]}`;
      return value.replace(/^Vertices \((\d+)\)$/, 'Вершины ($1)').replace(/^(\d+) objects$/, 'Объектов: $1');
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest('[data-import-warnings], textarea, script')) node.nodeValue = translate(node.nodeValue || '');
    }
    root.querySelectorAll('[title], [aria-label], [placeholder], optgroup[label]').forEach(node => {
      for (const attr of ['title','aria-label','placeholder','label']) if (node.hasAttribute(attr)) node.setAttribute(attr,translate(node.getAttribute(attr)));
    });
  };
  localizeDrawText();
  // Circle remains a supported legacy element, but Shapes/Circle is the only
  // user-facing way to create circles in the editor.
  toolButtons.find(button => button.dataset.tool === 'circle')?.remove();
  const toolShortcutMap = { '1': 'select', '2': 'polyline', '3': 'brush', '4': 'curve', '5': 'hatch', '6': 'fill', '7': 'shape', '8': 'text' };
  const shortcutGrid = root.querySelector('.shortcut-grid');
  if (shortcutGrid) { const cells = shortcutGrid.children; if (cells.length >= 2) { cells[0].textContent = '1..8'; cells[1].textContent = (document.documentElement.lang || '').toLowerCase().startsWith('ru') ? 'Выбрать / Полилиния / Кисть / Кривая / Штриховка / Заливка / Фигуры / Текст' : 'Select / Polyline / Brush / Curve / Hatch / Fill / Shapes / Text'; } }
  toolButtons.forEach(button => {
    const label = document.createElement('span'); label.className = 'tool-name';
    const name = button.textContent.trim().toLocaleLowerCase(isRu ? 'ru' : 'en');
    label.textContent = name.charAt(0).toLocaleUpperCase(isRu ? 'ru' : 'en') + name.slice(1); button.replaceChildren(label);
    const shortcut = Object.entries(toolShortcutMap).find(([, value]) => value === button.dataset.tool)?.[0];
    if (shortcut) {
      button.dataset.shortcut = shortcut; button.setAttribute('aria-keyshortcuts', shortcut);
      const key = document.createElement('kbd'); key.textContent = shortcut; button.append(key); button.title = `${label.textContent} [${shortcut}]`;
    }
  });
  const toolGroups = [['SELECT', ['select']], ['DRAW', ['line', 'polyline', 'quad', 'brush', 'curve', 'hatch', 'fill']], ['OBJECTS', ['shape', 'text', 'manual']]];
  const toolAside = root.querySelector('.drawer-tools');
  if (toolAside) { const fragment = document.createDocumentFragment(); toolGroups.forEach(([label, names]) => { const group = document.createElement('div'); group.className = 'tool-group'; const heading = document.createElement('h2'); heading.textContent = label; group.append(heading); names.map(name => toolButtons.find(button => button.dataset.tool === name)).filter(Boolean).forEach(button => group.append(button)); fragment.append(group); }); toolAside.prepend(fragment); }
  const previewButton = document.createElement('button'); previewButton.type = 'button'; previewButton.className = 'secondary-button'; previewButton.textContent = (document.documentElement.lang || '').toLowerCase().startsWith('ru') ? 'Просмотр' : 'Preview'; previewButton.dataset.action = 'preview'; root.querySelector('.drawer-footer')?.querySelector('div')?.prepend(previewButton);
  const previewHome = previewButton.parentElement;
  const previewToolbar = document.createElement('div'); previewToolbar.className = 'drawer-preview-toolbar'; previewToolbar.hidden = true;
  root.querySelector('.drawer-layout').before(previewToolbar);
  const setPreviewMode = enabled => {
    previewMode = Boolean(enabled);
    root.classList.toggle('drawer-preview-mode', previewMode);
    previewButton.textContent = previewMode
      ? ((document.documentElement.lang || '').toLowerCase().startsWith('ru') ? 'Назад к редактору' : 'Back to editor')
      : ((document.documentElement.lang || '').toLowerCase().startsWith('ru') ? 'Просмотр' : 'Preview');
    // Preview is a presentation surface. Keep the document in memory, but make
    // every editor control inert while it is visible.
    root.querySelectorAll('input, select, textarea, button').forEach(control => {
      if (control === previewButton) return;
      if (previewMode) { control.dataset.previewDisabled = control.disabled ? 'true' : 'false'; control.disabled = true; }
      else if (control.dataset.previewDisabled) { control.disabled = control.dataset.previewDisabled === 'true'; delete control.dataset.previewDisabled; }
    });
    canvas.style.pointerEvents = previewMode ? 'none' : '';
    previewToolbar.hidden = !previewMode;
    (previewMode ? previewToolbar : previewHome).prepend(previewButton);
    if (previewMode) { drawing = null; drag = null; refDrag = null; space = false; }
    renderAll();
    root.querySelectorAll('.drawer-tools, .drawer-inspector, .transform-panel, .reference-panel, .drawer-footer').forEach(panel => { panel.inert = previewMode; });
    previewButton.focus({ preventScroll: true });
    if (previewMode) previewToolbar.scrollIntoView({ block: 'nearest' });
  };
  previewButton.onclick = async () => {
    if (previewMode) { setPreviewMode(false); return; }
    setProcessing(true);
    try {
      await paintFrame();
      await gamePreview.decode();
      root.style.setProperty('--preview-ratio', String(gamePreview.naturalWidth / gamePreview.naturalHeight));
      normalizedReticle = renderNormalizedReticle();
      setProcessing(false);
      setPreviewMode(true);
    } catch {
      alert(localized('Unable to generate the preview. Check the image and geometry budget.', 'Не удалось создать предпросмотр. Проверьте изображение и лимит геометрии.'));
    } finally { if (processing) setProcessing(false); }
  };
  const brushSettings = root.querySelector('[data-brush-settings]');
  const shapeSettings = root.querySelector('[data-shape-settings]');
  const shapeKind = root.querySelector('[data-shape-kind]');
  const shapeLibrary = window.hubSightShapes;
  if (shapeKind && shapeLibrary) {
    const categories = [...new Set(shapeLibrary.definitions.map(d => d.category))];
    shapeKind.replaceChildren(...categories.map(category => {
      const group = document.createElement('optgroup'); group.label = category;
      shapeLibrary.definitions.filter(d => d.category === category).forEach(d => group.append(new Option(d.name, d.id)));
      return group;
    }));
    shapeKind.value = 'square';
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search shapes'; search.dataset.shapeSearch = '';
    const category = document.createElement('select'); category.dataset.shapeCategory = ''; category.setAttribute('aria-label', 'Shape category');
    category.append(new Option('All categories',''), ...categories.map(c => new Option(c,c)));
    const gallery = document.createElement('div'); gallery.className = 'shape-gallery'; gallery.dataset.shapeGallery = '';
    const populate = () => {
      gallery.replaceChildren();
      shapeLibrary.definitions.filter(d => (!category.value || d.category === category.value) && [...shapeKind.options].find(option => option.value === d.id)?.text.toLowerCase().includes(search.value.toLowerCase())).forEach(d => {
        const button = document.createElement('button'); button.type = 'button'; button.title = d.name; button.setAttribute('aria-label',d.name); button.dataset.shapePreset = d.id; button.classList.toggle('active',shapeKind.value === d.id);
        const icon = document.createElement('canvas'); icon.width=56; icon.height=44; icon.setAttribute('aria-hidden','true'); const c=icon.getContext('2d'); c.strokeStyle='#dedede'; c.fillStyle='#dedede'; c.lineWidth=1.3;
        const trace = p => { p.points.forEach((v,i) => { const x=28+v.x*15,y=22-v.y*15; i?c.lineTo(x,y):c.moveTo(x,y); }); if(p.closed)c.closePath(); };
        c.beginPath();d.paths.filter(p=>p.filled).forEach(trace);c.fill('evenodd');
        d.paths.filter(p=>!p.filled).forEach(p=>{c.beginPath();trace(p);c.stroke();});
        button.append(icon); button.onclick=()=>{shapeKind.value=d.id;populate();render();};gallery.append(button);
      });
    };
    search.oninput=()=>{populate();localizeDrawText();};category.onchange=()=>{populate();localizeDrawText();};shapeKind.addEventListener('change',()=>{populate();localizeDrawText();});
    shapeSettings.append(search,category,gallery);populate();
  }
  const brushSize = root.querySelector('[data-brush="size"]');
  const brushSizeNumber = root.querySelector('[data-brush="size-number"]');
  const textSettings = (() => {
    if (!toolAside) return null;
    const section = document.createElement('section');
    section.className = 'text-settings';
    section.dataset.textSettings = '';
    section.hidden = true;
    section.innerHTML = '<h3>Text</h3><label>Text <textarea data-text="value" rows="2" placeholder="Sight"></textarea></label><label>Editor font <select data-text="font"><option>Arial</option><option>Times New Roman</option><option>Roboto</option><option>monospace</option><option value="custom">Custom name</option></select></label><input type="text" data-text="custom-font" placeholder="Custom font name" hidden><label>Font size <input type="number" data-text="size" value="1" min="0.001" step="0.1"></label><label>Align <select data-text="align"><option value="left">Left</option><option value="center" selected>Center</option><option value="right">Right</option></select></label><label><input type="checkbox" data-text="move"> Move with range</label><label><input type="checkbox" data-text="highlight"> Highlight</label><p class="property-note">Game font: War Thunder. Font family and rotation below are editor-only; size is a game multiplier.</p>';
    toolAside.append(section);
    return section;
  })();
  if (brushSize && brushSizeNumber) { brushSize.addEventListener('input', () => brushSizeNumber.value = brushSize.value); brushSizeNumber.addEventListener('input', () => brushSize.value = brushSizeNumber.value); }
  root.querySelectorAll('[data-brush]').forEach(control => control.addEventListener('input', () => render()));
  const textControl = key => textSettings?.querySelector(`[data-text="${key}"]`);
  textControl('font')?.addEventListener('change', () => { const custom = textControl('custom-font'); if (custom) custom.hidden = textControl('font').value !== 'custom'; });

  const options = document.createElement('div');options.className='tool-options';
  const optionsTitle=document.createElement('h2');optionsTitle.textContent='Tool options';options.append(optionsTitle);
  [hatchSettings,brushSettings,shapeSettings,textSettings].filter(Boolean).forEach(section=>options.append(section));toolAside.append(options);
  const documentPanel=document.createElement('details');documentPanel.className='document-settings';
  documentPanel.innerHTML='<summary>Document</summary><label>Units <select data-document="thousandthType"><option value="ussr">USSR 6000</option><option value="nato">NATO 6400</option><option value="real">Real 6283</option></select></label><label><input type="checkbox" data-document="thousandth" checked> Thousandth coordinates</label><label>Line multiplier <input data-document="lineSizeMult" type="number" min=".01" max="100" step=".1" value="1"></label><label>Font multiplier <input data-document="fontSizeMult" type="number" min=".01" max="100" step=".1" value="1"></label>';
  const gridLabel=root.querySelector('[data-grid]').closest('label'),gridSize=root.querySelector('[data-grid-size]').closest('label'),snap=root.querySelector('[data-snap]').closest('label');
  documentPanel.append(gridLabel,gridSize,snap);toolAside.append(documentPanel);
  root.querySelectorAll('[data-document]').forEach(input=>input.addEventListener('change',()=>{documentSettings[input.dataset.document]=input.type==='checkbox'?input.checked:input.type==='number'?Math.max(.01,Math.min(100,finite(input.value,1))):input.value;saveHistory();render();}));
  const draftButton=document.createElement('button');draftButton.type='button';draftButton.textContent='Restore draft';draftButton.dataset.action='restore-draft';draftButton.onclick=async()=>{try{const draft=await readDraft() || localStorage.getItem('hubThunderDrawDraft');if(draft){restore(draft);saveHistory();}}catch{}};documentPanel.append(draftButton);
  const status=document.createElement('p');status.dataset.geometryStatus='';status.className='geometry-error';status.hidden=true;status.setAttribute('role','status');root.querySelector('.drawer-footer').append(status);
  const selectionOptions=document.createElement('section');selectionOptions.dataset.selectSettings='';selectionOptions.innerHTML='<h3>Select</h3><label>Region <select data-selection-mode><option value="rectangle">Rectangle</option><option value="lasso">Lasso</option></select></label><label><input type="checkbox" data-vertex-edit> Edit vertices</label>';options.append(selectionOptions);
  // Text, document and selection controls are created dynamically above the
  // initial markup pass; translate them together with the rest of the drawer.
  localizeDrawText();
  fetch('/tools/converter/usage', { credentials: 'same-origin' }).then(async response => {
    if (response.ok) {
      const access = await response.json(); jsonImportLimit = access.maxJsonBytes; blkImportLimit = access.maxBlkBytes;
      if (access.isPremium)
      root.querySelector('.tool-heading [data-access-type="PREMIUM"]')?.setAttribute('hidden', 'hidden');
    }
  }).catch(() => {});

  // Pointer coordinates are always expressed in CSS pixels. The backing
  // bitmap is scaled separately for devicePixelRatio rendering.
  let viewportState = { left: 0, top: 0, width: 1, height: 1, dpr: 1 };
  const refreshViewport = () => {
    const rect = canvas.getBoundingClientRect();
    viewportState = { left: rect.left, top: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.max(.1, window.devicePixelRatio || 1) };
    return viewportState;
  };
  const viewport = () => viewportState.width > 1 ? viewportState : refreshViewport();
  const scale = () => zoom * 2;
  const referenceControl = key => root.querySelector(`[data-reference="${key}"]`);
  const updateReference = () => {
    if (!referencePreview.src) return;
    const get = key => finite(referenceControl(key)?.value, key === 'sx' || key === 'sy' ? 1 : key === 'opacity' ? 100 : 0);
    referencePreview.hidden = true;
    referencePreview.style.opacity = Math.max(0, Math.min(1, get('opacity') / 100));
    const mirror = generatorSettings?.invert ? -1 : 1;
    referencePreview.style.transform = `translate(-50%,-50%) translate(${pan.x + get('x') * scale()}px,${pan.y - get('y') * scale()}px) rotate(${-get('r')}deg) scale(${get('sx') * zoom * mirror},${get('sy') * zoom})`;
  };
  const vectorizeReferenceButton = root.querySelector('[data-action="vectorize-reference"]');
  if (vectorizeReferenceButton) vectorizeReferenceButton.disabled = true;
  root.querySelector('[data-reference-file]')?.addEventListener('change', ev => {
    const file = ev.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert(imageSizeMessage()); ev.target.value = ''; return; }
    referenceFile = file; referenceWorldSize = null; vectorizeReferenceButton.disabled = true;
    setProcessing(true);
    if (referencePreview.src.startsWith('blob:')) URL.revokeObjectURL(referencePreview.src);
    referencePreview.onload = () => {
      const v=refreshViewport(),fit=Math.min(v.width*.7/referencePreview.naturalWidth,v.height*.7/referencePreview.naturalHeight)/2;
      referenceWorldSize={width:referencePreview.naturalWidth*fit,height:referencePreview.naturalHeight*fit};
      setProcessing(false); vectorizeReferenceButton.disabled = false; render();
    };
    referencePreview.onerror = () => { setProcessing(false); referenceFile = null; referenceWorldSize = null; alert(localized('Unable to decode this image.','Не удалось прочитать изображение.')); render(); };
    referencePreview.src = URL.createObjectURL(file);
  });
  root.querySelectorAll('[data-reference]').forEach(control => control.addEventListener('input', () => render()));
  root.querySelector('[data-action="reset-reference"]')?.addEventListener('click', () => { [['x', 0], ['y', 0], ['sx', 1], ['sy', 1], ['r', 0], ['opacity', 100]].forEach(([key, value]) => { const control = referenceControl(key); if (control) control.value = value; }); render(); });
  referencePreview.addEventListener('pointerdown', ev => { if (ev.button !== 0 || !referencePreview.src) return; ev.preventDefault(); refDrag = { x: ev.clientX, y: ev.clientY, startX: finite(referenceControl('x')?.value, 0), startY: finite(referenceControl('y')?.value, 0) }; referencePreview.setPointerCapture(ev.pointerId); });
  referencePreview.addEventListener('pointermove', ev => { if (!refDrag) return; const x = referenceControl('x'), y = referenceControl('y'); if (x) x.value = (refDrag.startX + (ev.clientX - refDrag.x) / scale()).toFixed(2); if (y) y.value = (refDrag.startY - (ev.clientY - refDrag.y) / scale()).toFixed(2); updateReference(); });
  referencePreview.addEventListener('pointerup', ev => { refDrag = null; if (referencePreview.hasPointerCapture(ev.pointerId)) referencePreview.releasePointerCapture(ev.pointerId); });
  const qpts = e => [e.topLeft, e.topRight, e.bottomRight, e.bottomLeft];
  const points = e => {
    if (!e) return [];
    if (e.type === 'line') return [e.start, e.end];
    if (e.type === 'polyline' || e.type === 'curve') return e.points || [];
    if (e.type === 'circle') return [e.center];
    if (e.type === 'hatch' || e.type === 'fill') return (e.regions || []).flat();
    if (e.type === 'shape') return e.paths ? e.paths.flatMap(p => p.points) : e.points || [];
    if (e.type === 'brush') return e.points || [];
    if (e.type === 'text') return [e.position];
    return qpts(e);
  };
  const normalizeGeometry = e => {
    if (!e || typeof e !== 'object') return null;
    if (e.type === 'quad' && !e.topLeft && e.pos1) return { ...e, topLeft: e.pos1, topRight: e.pos2, bottomRight: e.pos3, bottomLeft: e.pos4 };
    if (e.type === 'hatch') return { type: 'hatch', regions: (e.regions || e.bounds || []).map(region => region.map(cp)).filter(region => region.length >= 3), angle: finite(e.angle, 45), spacing: Math.max(.001, finite(e.spacing ?? e.density, .5)), lineWidth: Math.max(.0001, finite(e.lineWidth ?? e.thickness, .005)), offset: finite(e.offset ?? e.phase, 0), ...(e.crossOffset!=null?{crossOffset:finite(e.crossOffset,0)}:{}), direction: e.direction === 'reverse' ? 'reverse' : 'forward', crosshatch: Boolean(e.crosshatch), mode: e.mode === 'ribbons' ? 'ribbons' : 'lines' };
    if (e.type === 'fill') return { type: 'fill', regions: (e.regions || e.bounds || []).map(region => region.map(cp)).filter(region => region.length >= 3), fillRule: e.fillRule === 'nonzero' ? 'nonzero' : 'evenodd', opacity: Math.max(0, Math.min(1, finite(e.opacity, 1))) };
    if (e.type === 'shape') return { ...e, type: 'shape', kind: String(e.kind || 'square'), points: (e.points || []).map(cp), ...(e.paths ? { paths: e.paths.map(p => ({ points: p.points.map(cp), closed: p.closed !== false, filled: Boolean(p.filled) })) } : {}) };
    if (e.type === 'brush') return { type: 'brush', points: (e.points || []).map(cp).filter(Boolean), size: Math.max(.001, finite(e.size, 1)), smoothing: Math.max(0, finite(e.smoothing, 6)), simplify: Math.max(0, finite(e.simplify, 2)) };
    if (e.type === 'curve') return { type: 'curve', points: (e.points || []).map(cp).filter(Boolean), smoothing: Math.max(0, finite(e.smoothing, 6)), simplify: Math.max(0, finite(e.simplify, 2)) };
    if (e.type === 'text') return { type: 'text', position: cp(e.position || { x: 0, y: 0 }), text: String(e.text || e.value || ''), fontSize: Math.max(.001, finite(e.fontSize, 1)), fontFamily: String(e.fontFamily || 'Arial'), filled: e.filled !== false, rotation: finite(e.rotation, 0), align: ['left', 'center', 'right'].includes(e.align) ? e.align : 'left' };
    return e;
  };
  const normalize = e => { const result = normalizeGeometry(e); return result ? {...clone(e), ...result} : null; };
  const importNotice = document.createElement('div'); importNotice.className = 'converter-note'; importNotice.dataset.importWarnings = ''; importNotice.hidden = true; root.querySelector('.drawer-layout').after(importNotice);
  const restoreLegacyBlkScale = (list, value) => {
    if (!value.blk || value.blkGeometryScaled !== true) return;
    // Migrate only drafts/JSON explicitly marked by the retired import transform.
    // Fresh BLK imports and ordinary Draw JSON already use native document units.
    const factor = 1 / 500;
    list.forEach(element => {
      const vertices = element.type === 'shape' ? [...(element.points || []), ...(element.paths || []).flatMap(path => path.points)] : points(element);
      vertices.forEach(point => { point.x *= factor; point.y *= factor; });
      if (element.type === 'circle') element.radius *= factor;
      if (element.type === 'brush') element.size *= factor;
      if (element.type === 'text') element.fontSize *= factor;
      if (element.type === 'hatch') { element.spacing *= factor; element.lineWidth *= factor; element.offset *= factor; if (element.crossOffset != null) element.crossOffset *= factor; }
      if (element.game?.center) { element.game.center.x *= factor; element.game.center.y *= factor; }
      if (element.game?.radialCenter) { element.game.radialCenter.x *= factor; element.game.radialCenter.y *= factor; }
    });
  };
  const processingNotice = document.createElement('p'); processingNotice.className = 'drawer-processing'; processingNotice.hidden = true;
  processingNotice.setAttribute('role', 'status'); processingNotice.textContent = localized('Processing...', 'Обработка...');
  root.querySelector('.tool-heading').after(processingNotice);
  const processingControls = new Map();
  const setProcessing = (active, operation = '') => {
    if (processing === active) return;
    processing = active;
    root.classList.toggle('is-processing', active);
    root.setAttribute('aria-busy', active ? 'true' : 'false');
    processingNotice.hidden = !active;
    if (active) root.querySelectorAll('button, input, select, textarea').forEach(control => { processingControls.set(control, control.disabled); control.disabled = true; });
    else { processingControls.forEach((disabled, control) => { control.disabled = disabled; }); processingControls.clear(); }
  };
  const loadDocument = value => {
    documentEnvelope = clone(value);
    delete documentEnvelope.blkGeometryScaled;
    elements = (value.elements || []).map(normalize).filter(Boolean);
    generatorSettings = value.generatorSettings || value.metadata?.generatorSettings || {invert:false,inversion:false};
    documentSettings = {thousandth:true,thousandthType:'ussr',lineSizeMult:1,fontSizeMult:1,...value.settings};
    importedBlk = value.blk || null;
    const warningList = [...new Set((value.warnings || []).map(String).filter(Boolean))];
    restoreLegacyBlkScale(elements, value);
    importNotice.replaceChildren();
    if (warningList.length) {
      const unmappedCount = warningList.reduce((sum, warning) => {
        const match = warning.match(/(?:Unmapped|Не отображено)[^:]*:\s*(\d+)\s+(?:objects|объект)/i);
        return sum + (match ? Number(match[1]) : (/^Unmapped\s/i.test(warning) ? 1 : 0));
      }, 0);
      const hasUnmapped = warningList.some(warning => /^(?:Unmapped|Не отображено)/i.test(warning));
      const ru = (document.documentElement.lang || '').toLowerCase().startsWith('ru');
      const summary = document.createElement('strong');
      summary.textContent = ru
        ? `Импорт завершён. Объектов восстановлено: ${elements.length}.${hasUnmapped ? ` Некоторые элементы прицела не удалось отобразить в редакторе. Не отображено: ${unmappedCount || 1} объектов.` : ` Предупреждений: ${warningList.length}.`}`
        : `Import complete. Objects restored: ${elements.length}.${hasUnmapped ? ` Some sight elements could not be displayed in the editor. Not displayed: ${unmappedCount || 1} objects.` : ` Warnings: ${warningList.length}.`}`;
      const details = document.createElement('details'); const caption = document.createElement('summary'); caption.textContent = ru ? 'Подробности' : 'Details';
      const list = document.createElement('ul'); warningList.forEach(w => { const item = document.createElement('li'); item.textContent = w; list.append(item); }); details.append(caption, list); importNotice.append(summary, details);
    }
    importNotice.hidden = warningList.length === 0;
    importNotice.dataset.hasWarnings = warningList.length ? 'true' : '';
    root.dispatchEvent(new Event('sight-document-changed'));
  };
  const model = () => ({ ...clone(documentEnvelope), metadata: clone(documentEnvelope.metadata || {name:'drawn-sight',version:1}), generatorSettings: clone(generatorSettings), settings: clone(documentSettings), ...(importedBlk ? {blk: importedBlk, rebuildGeometry: true} : {}), elements: clone(elements) });
  blkMetrics = window.createSightBlkMetrics(root, model, document => { loadDocument(document); saveHistory(); renderAll(); }, setProcessing);
  const saveIndicator = document.createElement('span'); saveIndicator.dataset.saveStatus = ''; saveIndicator.className = 'save-status'; saveIndicator.textContent = localized('Saved','Сохранено'); root.querySelector('.drawer-footer > div')?.prepend(saveIndicator);
  let draftDb = null;
  const draftDbReady = new Promise(resolve => {
    try {
      if (!window.indexedDB) return resolve(null);
      const request = indexedDB.open('hub-thunder-draw', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onerror = () => resolve(null);
      request.onsuccess = () => { draftDb = request.result; draftDb.onversionchange = () => { draftDb.close(); draftDb = null; }; resolve(draftDb); };
    } catch { resolve(null); }
  });
  const persistDraft = serialized => {
    draftTouched = true;
    saveIndicator.textContent = localized('Saving', 'Сохраняется');
    let fallbackSaved = false;
    try { if (serialized.length <= 32768) { localStorage.setItem(draftFallbackKey, serialized); fallbackSaved = true; } else localStorage.removeItem(draftFallbackKey); } catch {}
    const failed = () => { saveIndicator.textContent = fallbackSaved ? localized('Saved','Сохранено') : localized('Save failed','Не удалось сохранить'); };
    const write = db => {
      if (!db) { failed(); return; }
      try {
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(serialized, draftKey);
        tx.oncomplete = () => { saveIndicator.textContent = localized('Saved','Сохранено'); };
        tx.onerror = tx.onabort = failed;
      } catch { failed(); }
    };
    // Queue the transaction immediately on pagehide; opening a new database then can be cancelled by navigation.
    if (draftDb) write(draftDb); else draftDbReady.then(write);
  };
  const readDraft = async () => {
    const db = await draftDbReady;
    if (!db) return null;
    return new Promise(resolve => {
      try { const get = db.transaction('documents', 'readonly').objectStore('documents').get(draftKey); get.onsuccess = () => resolve(typeof get.result === 'string' ? get.result : null); get.onerror = () => resolve(null); }
      catch { resolve(null); }
    });
  };
  const saveHistory = () => { const serialized = JSON.stringify(model()); if (history[historyIndex] === serialized) return; history = history.slice(0, historyIndex + 1); history.push(serialized); historyIndex = history.length - 1; persistDraft(serialized); blkMetrics?.schedule(); };
  const flushDraft = () => { if (draftTouched || importedDocument) persistDraft(JSON.stringify(model())); };
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
  const restore = serialized => { loadDocument(JSON.parse(serialized)); selection.clear(); drawing = drag = snapTarget = null; renderAll(); persistDraft(JSON.stringify(model())); };
  const world = ev => { const view = refreshViewport(); return { x: (ev.clientX - view.left - view.width / 2 - pan.x) / scale(), y: (view.height / 2 + pan.y - (ev.clientY - view.top)) / scale() }; };
  const screen = p => { const view = viewport(); return { x: view.width / 2 + pan.x + p.x * scale(), y: view.height / 2 + pan.y - p.y * scale() }; };
  const gridSnap = p => { if (!root.querySelector('[data-snap]')?.checked) return cp(p); const size = Math.max(.1, finite(root.querySelector('[data-grid-size]')?.value, 1)); return { x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size }; };
  const nearest = (p, excluded) => { let result = null; const maxDistance = 12 / scale(); elements.forEach((e, ei) => points(e).forEach((v, vi) => { if (excluded && excluded.ei === ei && excluded.vi === vi) return; const distance = Math.hypot(p.x - v.x, p.y - v.y); if (distance <= maxDistance && (!result || distance < result.distance)) result = { p: v, distance, ei, vi }; })); return result; };
  const interaction = (p, shift, excluded) => { const snappedGrid = gridSnap(p); snapTarget = shift ? nearest(snappedGrid, excluded) : null; return snapTarget ? cp(snapTarget.p) : snappedGrid; };
  const drawGrid = (width, height) => { if (!root.querySelector('[data-grid]')?.checked) return; const step = Math.max(8, finite(root.querySelector('[data-grid-size]')?.value, 1) * scale()); ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1; for (let x = ((width / 2 + pan.x) % step + step) % step; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); } for (let y = ((height / 2 + pan.y) % step + step) % step; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); } };
  const path = (list, close = false, frame = null) => {
    const context = frame?.context || ctx, project = frame?.project || screen;
    list.forEach((p, i) => { const s = project(p); i ? context.lineTo(s.x, s.y) : context.moveTo(s.x, s.y); });
    if (close) context.closePath();
  };
  const smoothPath = (list, amount) => { const pointsIn = (list || []).map(cp); const radius = Math.max(0, Math.min(20, Math.round(Number(amount) || 0))); if (radius < 1 || pointsIn.length < 3) return pointsIn; return pointsIn.map((point, index) => { if (index === 0 || index === pointsIn.length - 1) return point; const from = Math.max(0, index - radius), to = Math.min(pointsIn.length - 1, index + radius); let x = 0, y = 0; for (let i = from; i <= to; i++) { x += pointsIn[i].x; y += pointsIn[i].y; } const count = to - from + 1; return { x: x / count, y: y / count }; }); };
  const polygonContains = (p, polygon) => { let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i], b = polygon[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; } return inside; };
  const hatchLines = hatch => {
    const regions=(hatch.regions||[]).filter(r=>r.length>=3), spacing=Number(hatch.spacing);
    if(!regions.length || !Number.isFinite(spacing) || spacing<=0) return [];
    const t=hatch.angle*Math.PI/180,dx=Math.cos(t),dy=Math.sin(t),offset=Number(hatch.offset)||0;
    const values=regions.flat().map(p=>-p.x*dy+p.y*dx), min=Math.floor((Math.min(...values)-offset)/spacing)-1,max=Math.ceil((Math.max(...values)-offset)/spacing)+1;
    if(max-min>10000 || (max-min+1)*values.length>4000000) return null;
    const output=[];
    for(let k=min;k<=max;k++) {
      const target=offset+k*spacing,cuts=[];
      regions.forEach(region=>region.forEach((p,i)=>{const q=region[(i+1)%region.length],pa=-p.x*dy+p.y*dx,pb=-q.x*dy+q.y*dx;if((pa>target)===(pb>target))return;const f=(target-pa)/(pb-pa);cuts.push((p.x+f*(q.x-p.x))*dx+(p.y+f*(q.y-p.y))*dy);}));
      cuts.sort((x,y)=>x-y);
      for(let i=1;i<cuts.length;i+=2){if(cuts[i]-cuts[i-1]<1e-9)continue;if(output.length>=10000)return null;const point=x=>({x:x*dx-target*dy,y:x*dy+target*dx});output.push(hatch.direction==='reverse'?{start:point(cuts[i]),end:point(cuts[i-1])}:{start:point(cuts[i-1]),end:point(cuts[i])});}
    }
    return output;
  };
  const hatchRenderLines = hatch => { const lines=hatchLines(hatch),cross=hatch.crosshatch?hatchLines({...hatch,angle:hatch.angle+90,offset:hatch.crossOffset??hatch.offset}):[];return !lines||!cross||lines.length+cross.length>10000?null:lines.concat(cross); };
  const editorRenderFrame = () => ({ context: ctx, project: screen, unitScale: scale(), pixelScale: 1, textScale: zoom, settings: documentSettings, preview: false });
  const drawHatch = (e,selected,transient,frame = editorRenderFrame()) => {
    const ctx = frame.context, trace = (list, close = false) => path(list, close, frame);
    const regions=(e.regions||[]).filter(r=>r.length>=3); if(!regions.length)return;
    const color=transient?'#86c8ff':selected?'#c7ff4c':'#e7e7e7';ctx.save();
    ctx.beginPath();regions.forEach(r=>trace(r,true));ctx.clip('evenodd');ctx.fillStyle=color;ctx.strokeStyle=color;
    let overBudget=false;
    if(e.mode==='ribbons'){
      for(const [angle,phase] of e.crosshatch?[[e.angle,e.offset],[e.angle+90,e.crossOffset??e.offset]]:[[e.angle,e.offset]]){
        const t=angle*Math.PI/180,dx=Math.cos(t),dy=Math.sin(t),all=regions.flat(),normal=all.map(p=>-p.x*dy+p.y*dx),along=all.map(p=>p.x*dx+p.y*dy);
        const min=Math.floor((Math.min(...normal)-phase-e.lineWidth/2)/e.spacing),max=Math.ceil((Math.max(...normal)-phase+e.lineWidth/2)/e.spacing);
        if(max-min>10000||(max-min+1)*all.length>4000000){overBudget=true;break;}
        const lo=Math.min(...along)-1,hi=Math.max(...along)+1,point=(x,y)=>({x:x*dx-y*dy,y:x*dy+y*dx});
        ctx.beginPath();
        for(let k=min;k<=max;k++){const o=phase+k*e.spacing,h=e.lineWidth/2;trace([point(lo,o-h),point(hi,o-h),point(hi,o+h),point(lo,o+h)],true);}
        ctx.fill();
      }
    }else{
      const lines=hatchRenderLines(e);overBudget=!lines;ctx.lineWidth=(frame.settings.lineSizeMult||1)*frame.pixelScale;
      if(lines){ctx.beginPath();lines.forEach(l=>trace([l.start,l.end]));ctx.stroke();}
    }
    ctx.restore();
    if((selected||transient)&&!frame.preview){ctx.save();ctx.strokeStyle=overBudget?'#f87171':color;ctx.lineWidth=1;ctx.setLineDash([4,4]);regions.forEach(r=>{ctx.beginPath();trace(r,true);ctx.stroke();});ctx.restore();}
    if(overBudget && frame.preview) throw new Error('Hatch geometry budget exceeded.');
    if(overBudget) geometryBudgetExceeded=true;
  };
  const createShape = (kind,a,b) => shapeLibrary.create(kind,a,b);
  const drawElement = (e, index, transient = false, frame = editorRenderFrame()) => {
    if (!e) return;
    if (adaptivePreview && !transient) {
      if (!adaptiveStandalone && !frame.preview && (e.game?.move || e.game?.moveRadial)) {
        frame.context.save(); frame.context.globalAlpha = .35;
        drawElement(e, index, true, frame);
        frame.context.restore();
      }
      e = adaptivePreview(e);
    }
    const ctx = frame.context, trace = (list, close = false) => path(list, close, frame);
    const selected = !frame.preview && selection.has(index);
    const color = transient ? '#86c8ff' : selected ? '#c7ff4c' : '#e7e7e7';
    const lineWidth = frame.settings.lineSizeMult * frame.pixelScale;
    if (e.type === 'hatch') return drawHatch(e, selected, transient, frame);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    if (e.type === 'fill') {
      ctx.globalAlpha = frame.preview ? 1 : e.opacity ?? 1;
      ctx.fillStyle = transient ? 'rgba(134,200,255,.25)' : color;
      ctx.strokeStyle = transient ? '#86c8ff' : selected ? '#c7ff4c' : '#86c8ff';
      ctx.lineWidth = selected ? 3 : 1;
      ctx.beginPath();
      (e.regions || []).forEach(region => trace(region, true));
      ctx.fill(e.fillRule === 'nonzero' ? 'nonzero' : 'evenodd');
      if (!frame.preview) ctx.stroke();
    } else if (e.type === 'shape' && e.paths) {
      ctx.beginPath();
      e.paths.filter(p => p.filled).forEach(p => trace(p.points, p.closed));
      ctx.fill('evenodd');
      e.paths.filter(p => !p.filled).forEach(p => { ctx.beginPath(); trace(p.points, p.closed); ctx.stroke(); });
    } else if (e.type === 'text') {
      const s = frame.project(e.position);
      ctx.translate(s.x, s.y);
      if (!frame.preview) ctx.rotate(-e.rotation * Math.PI / 180);
      ctx.font = `${Math.max(.1, e.fontSize * 8 * frame.textScale * frame.settings.fontSizeMult)}px ${frame.preview ? 'Arial' : e.fontFamily || 'Arial'}`;
      ctx.textAlign = e.align || 'left';
      ctx.textBaseline = 'top';
      if (frame.preview || e.filled !== false) ctx.fillText(e.text, 0, 0);
      else ctx.strokeText(e.text, 0, 0);
    } else {
      ctx.fillStyle = transient ? 'rgba(134,200,255,.18)' : color;
      ctx.setLineDash(transient ? [5, 5] : []);
      ctx.beginPath();
      if (e.type === 'line') trace([e.start, e.end]);
      else if (['polyline', 'curve', 'brush'].includes(e.type)) {
        trace(e.points || []);
        if (e.type === 'brush') { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = e.size * frame.unitScale; ctx.setLineDash([]); }
      } else if (e.type === 'circle') {
        const center = frame.project(e.center);
        ctx.lineWidth = (e.thickness || 1) * lineWidth;
        ctx.arc(center.x, center.y, e.radius * frame.unitScale, -(e.segment?.y ?? 360) * Math.PI / 180, -(e.segment?.x ?? 0) * Math.PI / 180);
      } else {
        trace(e.type === 'quad' ? qpts(e) : e.points || [], true);
        if (e.type === 'quad') ctx.fill();
      }
      if (!frame.preview || e.type !== 'quad') ctx.stroke();
    }
    ctx.restore();
  };
  const renderNormalizedReticle = () => {
    const result = document.createElement('canvas');
    result.width = gamePreview.naturalWidth;
    result.height = gamePreview.naturalHeight;
    // Fixed reference projection: 2 pixels per document unit at 1080p, Y-up,
    // origin at the image centre. No editor viewport or temporary transform.
    const pixelScale = result.height / 1080, unitScale = 2 * pixelScale;
    const frame = {
      context: result.getContext('2d'), preview: true, settings: clone(documentSettings),
      pixelScale, unitScale, textScale: pixelScale,
      project: p => ({ x: result.width / 2 + p.x * unitScale, y: result.height / 2 - p.y * unitScale })
    };
    elements.map(clone).forEach(element => drawElement(element, -1, false, frame));
    return result;
  };
  const render = () => {
    geometryBudgetExceeded=false;
    const view = refreshViewport(), width = view.width, height = view.height;
    if (zoomLabel) zoomLabel.textContent = `ZOOM ${Math.round(zoom * 100)}%`;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, width, height);
    if (previewMode) {
      if (normalizedReticle) {
        const fit = Math.min(width / normalizedReticle.width, height / normalizedReticle.height);
        const iw = normalizedReticle.width * fit, ih = normalizedReticle.height * fit;
        ctx.drawImage(gamePreview, (width - iw) / 2, (height - ih) / 2, iw, ih);
        ctx.drawImage(normalizedReticle, (width - iw) / 2, (height - ih) / 2, iw, ih);
      }
      return;
    }
    if (!previewMode) drawGrid(width, height);
    if (!previewMode) { ctx.strokeStyle = '#3c3c3c'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(width / 2 + pan.x, 0); ctx.lineTo(width / 2 + pan.x, height);
      ctx.moveTo(0, height / 2 + pan.y); ctx.lineTo(width, height / 2 + pan.y); ctx.stroke(); }
    if(!previewMode && referencePreview.complete && referencePreview.naturalWidth){
      const get=(key,fallback)=>finite(referenceControl(key)?.value,fallback),w=(referenceWorldSize?.width||64)*scale(),h=(referenceWorldSize?.height||64)*scale(),center=screen({x:get('x',0),y:get('y',0)});
      ctx.save();ctx.globalAlpha=get('opacity',100)/100;ctx.translate(center.x,center.y);ctx.rotate(-get('r',0)*Math.PI/180);ctx.scale(get('sx',1)*(generatorSettings.invert?-1:1),get('sy',1));ctx.drawImage(referencePreview,-w/2,-h/2,w,h);ctx.restore();
    }
    displayElements().forEach((element, index) => drawElement(element, index));
    if (drawing) {
      if (drawing.type === 'hatch') drawHatch({ ...drawing, regions: [drawing.points.concat([pointer])] }, false, true);
      else if (drawing.type === 'fill') drawElement({ ...drawing, regions: [drawing.points.concat([pointer])] }, -1, true);
      else if (drawing.type === 'shape') { const kind = shapeKind?.value || 'square'; drawElement(kind === 'free' ? { type: 'shape', kind, points: [...drawing.points, pointer] } : createShape(kind, drawing.start, drawing.end), -1, true); }
      else if (drawing.type === 'brush') { const pointsPreview = processedStroke([...drawing.points, pointer]); drawElement({ type: 'brush', points: pointsPreview, size: Math.max(.01, finite(brushSizeNumber?.value, 8)) }, -1, true); }
      else if (drawing.type === 'curve') { const pointsPreview = processedStroke([...drawing.points, pointer]); drawElement({ type: 'curve', points: pointsPreview }, -1, true); }
      else if (drawing.type === 'polyline') drawElement({ type: 'polyline', points: [...drawing.points, pointer] }, -1, true);
      else if (drawing.type === 'quad') drawElement({ type: 'quad', topLeft: drawing.points[0] || pointer, topRight: drawing.points[1] || pointer, bottomRight: drawing.points[2] || pointer, bottomLeft: drawing.points[3] || pointer }, -1, true);
      else drawElement(drawing, -1, true);
    }
    selectionHandles=[];
    if (!previewMode && selection.size) {
      const selectedPoints = [...selection].flatMap(index => extentPoints(elements[index]));
      if (selectedPoints.length) {
        const xs = selectedPoints.map(point => point.x), ys = selectedPoints.map(point => point.y);
        const topLeft = screen({ x: Math.min(...xs), y: Math.max(...ys) }), bottomRight = screen({ x: Math.max(...xs), y: Math.min(...ys) });
        ctx.save(); ctx.strokeStyle = '#c7ff4c'; ctx.setLineDash([6, 4]); ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y); ctx.restore();
        if(tool==='select'){
          const corners=[topLeft,{x:bottomRight.x,y:topLeft.y},bottomRight,{x:topLeft.x,y:bottomRight.y}];
          selectionHandles=corners.map(p=>({...p,mode:'scale'})).concat([{x:(topLeft.x+bottomRight.x)/2,y:topLeft.y-22,mode:'rotate'}]);
          ctx.save();ctx.fillStyle='#86c8ff';selectionHandles.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();});ctx.restore();
        }
      }
      if (selection.size === 1 && tool === 'select' && root.querySelector('[data-vertex-edit]')?.checked) points(elements[[...selection][0]]).forEach(point => { const screenPoint = screen(point); ctx.fillStyle = '#c7ff4c'; ctx.fillRect(screenPoint.x - 3, screenPoint.y - 3, 6, 6); });
    }
    if (!previewMode && drag?.mode === 'select-rect') {
      const start = screen(drag.start), end = screen(pointer); ctx.save(); ctx.strokeStyle = '#86c8ff'; ctx.fillStyle = 'rgba(134,200,255,.1)'; ctx.setLineDash([5, 5]);
      if(drag.lasso){ctx.beginPath();path(drag.lasso,true);ctx.fill();ctx.stroke();}else {ctx.fillRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y)); ctx.strokeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y)); } ctx.restore();
    }
    if (!previewMode && snapTarget) { const screenPoint = screen(snapTarget.p); ctx.save(); ctx.strokeStyle = '#86c8ff'; ctx.beginPath(); ctx.arc(screenPoint.x, screenPoint.y, 7, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (!previewMode && pointerInside && tool === 'brush') { const cursor = screen(pointer); const radius = Math.max(.001, finite(brushSizeNumber?.value, 8) * scale() / 2); ctx.save(); ctx.strokeStyle = '#c7ff4c'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    canvas.dataset.geometryBudget=geometryBudgetExceeded?'exceeded':'ok';
    const status=root.querySelector('[data-geometry-status]');if(status){status.hidden=!geometryBudgetExceeded;status.textContent='Hatch geometry budget exceeded. Increase spacing.';}
    updateReference();
  };
  const transformPoint = (point, state) => { const radians = state.r * Math.PI / 180, x = point.x * Math.cos(radians) - point.y * Math.sin(radians), y = point.x * Math.sin(radians) + point.y * Math.cos(radians); return { x: x * state.sx + state.x, y: y * state.sy + state.y }; };
  const applyTransform = (element, state) => { const output = clone(element); if (output.type === 'circle') { output.center = transformPoint(output.center, state); output.radius *= Math.sqrt(Math.abs(state.sx * state.sy)); } else if (output.type === 'hatch') { output.regions = output.regions.map(region => region.map(point => transformPoint(point, state))); const angle=(output.angle+state.r)*Math.PI/180,nx=-Math.sin(angle)/state.sx,ny=Math.cos(angle)/state.sy,length=Math.hypot(nx,ny);if(output.crosshatch){const cx=-Math.cos(angle)/state.sx,cy=-Math.sin(angle)/state.sy,cl=Math.hypot(cx,cy);output.crossOffset=(output.crossOffset??output.offset)/cl+(cx*state.x+cy*state.y)/cl;}output.spacing/=length;output.lineWidth/=length;output.offset=output.offset/length+(nx*state.x+ny*state.y)/length;output.angle=Math.atan2(-nx,ny)*180/Math.PI; } else if (output.type === 'text') { output.position = transformPoint(output.position, state); output.fontSize *= (Math.abs(state.sx) + Math.abs(state.sy)) / 2; output.rotation += state.r; } else points(output).forEach(point => { const transformed = transformPoint(point, state); point.x = transformed.x; point.y = transformed.y; }); if(output.type === 'brush') output.size *= Math.sqrt(Math.abs(state.sx*state.sy)); if(output.game?.center)output.game.center=transformPoint(output.game.center,state); if(output.game?.radialCenter)output.game.radialCenter=transformPoint(output.game.radialCenter,state); return output; };
  const readTransform = () => { Object.keys(transformState).forEach(key => transformState[key] = finite(root.querySelector(`[data-transform="${key}"]`)?.value, transformState[key])); return Number.isFinite(transformState.x) && Number.isFinite(transformState.y) && Number.isFinite(transformState.r) && Number.isFinite(transformState.sx) && Number.isFinite(transformState.sy) && transformState.sx !== 0 && transformState.sy !== 0; };
  const resetTransformInputs = () => { [['x', 0], ['y', 0], ['r', 0], ['sx', 1], ['sy', 1]].forEach(([key, value]) => { const control = root.querySelector(`[data-transform="${key}"]`); if (control) control.value = value; }); readTransform(); render(); };
  const displayElements = () => { if (!readTransform()) return elements; const active = transformState.x || transformState.y || transformState.r || transformState.sx !== 1 || transformState.sy !== 1; if (!active) return elements; const indexes = selection.size ? [...selection] : elements.map((_, index) => index); const transformed = elements.map(clone); indexes.forEach(index => { transformed[index] = applyTransform(elements[index], transformState); }); return transformed; };
  root.querySelectorAll('[data-transform]').forEach(input => input.addEventListener('input', () => { readTransform(); render(); }));
  root.querySelector('[data-action="apply-transform"]')?.addEventListener('click', () => { if (!readTransform()) return; const indexes = selection.size ? [...selection] : elements.map((_, index) => index); indexes.forEach(index => { elements[index] = applyTransform(elements[index], transformState); }); saveHistory(); resetTransformInputs(); renderAll(); });
  root.querySelector('[data-action="reset-transform"]')?.addEventListener('click', resetTransformInputs);
  const segmentDistance = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const objectDistance = (p, e) => { if (e.type === 'line') return segmentDistance(p, e.start, e.end); if (e.type === 'polyline' || e.type === 'curve' || e.type === 'brush') return Math.max(0, Math.min(...(e.points || []).slice(1).map((v, i) => segmentDistance(p, e.points[i], v)), Infinity) - (e.type === 'brush' ? e.size/2 : 0)); if (e.type === 'circle') return Math.abs(Math.hypot(p.x - e.center.x, p.y - e.center.y) - e.radius); if (e.type === 'text') return textHitDistance(p, e); if (e.type === 'hatch' || e.type === 'fill') { const regions = e.regions || []; const inside = e.fillRule === 'nonzero' ? regions.reduce((total,region)=>total+region.reduce((n,a,i)=>{const b=region[(i+1)%region.length],cross=(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y);return n+(a.y<=p.y&&b.y>p.y&&cross>0?1:a.y>p.y&&b.y<=p.y&&cross<0?-1:0);},0),0)!==0 : regions.reduce((count, region) => count + (polygonContains(p, region) ? 1 : 0), 0) % 2 === 1; if (inside) return 0; return Math.min(...regions.flatMap(region => region.map((v, i) => segmentDistance(p, v, region[(i + 1) % region.length]))), Infinity); } if(e.type === 'shape' && e.paths){if(e.paths.filter(p=>p.filled).reduce((n,r)=>n+(polygonContains(p,r.points)?1:0),0)%2)return 0;return Math.min(...e.paths.flatMap(r=>r.points.slice(r.closed?0:1).map((v,i)=>segmentDistance(p,r.points[i],r.points[(i+1)%r.points.length]))),Infinity);} const vertices = e.type === 'shape' ? e.points : qpts(e); if (!vertices?.length) return Infinity; if (polygonContains(p, vertices)) return 0; return Math.min(...vertices.map((v, i) => segmentDistance(p, v, vertices[(i + 1) % vertices.length]))); };
  const textBox = e => {
    ctx.save();ctx.font=`${Math.max(.1,e.fontSize*8*zoom*documentSettings.fontSizeMult)}px ${e.fontFamily||'Arial'}`;
    const width=Math.max(1,ctx.measureText(e.text).width)/scale(),height=e.fontSize*4*documentSettings.fontSizeMult;ctx.restore();
    const left=e.align==='center'?-width/2:e.align==='right'?-width:0;
    return {left,right:left+width,top:0,bottom:-height};
  };
  const textHitDistance = (p,e) => {
    const t=e.rotation*Math.PI/180,dx=p.x-e.position.x,dy=p.y-e.position.y,x=dx*Math.cos(t)+dy*Math.sin(t),y=-dx*Math.sin(t)+dy*Math.cos(t),b=textBox(e);
    return Math.hypot(Math.max(b.left-x,0,x-b.right),Math.max(b.bottom-y,0,y-b.top));
  };
  const extentPoints = e => {
    if(e.type==='circle')return [{x:e.center.x-e.radius,y:e.center.y-e.radius},{x:e.center.x+e.radius,y:e.center.y+e.radius}];
    if(e.type==='brush')return e.points.flatMap(p=>[{x:p.x-e.size/2,y:p.y-e.size/2},{x:p.x+e.size/2,y:p.y+e.size/2}]);
    if(e.type==='text'){const b=textBox(e),t=e.rotation*Math.PI/180;return [[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>({x:e.position.x+x*Math.cos(t)-y*Math.sin(t),y:e.position.y+x*Math.sin(t)+y*Math.cos(t)}));}
    return points(e);
  };
  const hit = p => { let best = { index: -1, distance: 10 / scale() }; elements.forEach((e, index) => { const distance = objectDistance(p, e); if (distance <= best.distance) best = { index, distance }; }); return best.index; };
  const vertexHit = p => { let result = null; elements.forEach((e, ei) => { if (e.type === 'text') return; points(e).forEach((v, vi) => { const distance = Math.hypot(p.x - v.x, p.y - v.y); if (distance < 10 / scale() && (!result || distance < result.distance)) result = { ei, vi, distance }; }); }); return result; };
  const setVertex = (e, vi, value) => { if (e.type === 'line') e[vi ? 'end' : 'start'] = cp(value); else if (['polyline', 'curve', 'brush', 'shape'].includes(e.type)) { const point=points(e)[vi];point.x=value.x;point.y=value.y; } else if (e.type === 'circle') e.center = cp(value); else if (e.type === 'hatch' || e.type === 'fill') { let offset = 0; for (const region of e.regions) { if (vi < offset + region.length) { region[vi - offset] = cp(value); return; } offset += region.length; } } else if (e.type === 'quad') e[['topLeft', 'topRight', 'bottomRight', 'bottomLeft'][vi]] = cp(value); };
  const editableEdgeHit = p => { if (selection.size !== 1) return null; const ei = [...selection][0], e = elements[ei]; const threshold = 10 / scale(); let best = null; const test = (list, region, closed) => { const end = closed ? list.length : list.length - 1; for (let index = 0; index < end; index++) { const distance = segmentDistance(p, list[index], list[(index + 1) % list.length]); if (distance < threshold && (!best || distance < best.distance)) best = { ei, region, index, distance }; } }; if (e.type === 'polyline') test(e.points || [], -1, false); if (e.type === 'hatch' || e.type === 'fill') (e.regions || []).forEach((region, index) => test(region, index, true)); return best; };
  const insertVertex = (edge, value) => { const e = elements[edge.ei]; if (e.type === 'polyline') e.points.splice(edge.index + 1, 0, cp(value)); else if (e.type === 'hatch' || e.type === 'fill') e.regions[edge.region].splice(edge.index + 1, 0, cp(value)); };
  const removeVertex = vertex => { const e = elements[vertex.ei]; if (e.type === 'polyline' && e.points.length > 2) { e.points.splice(vertex.vi, 1); return true; } if (e.type === 'hatch' || e.type === 'fill') { let offset = 0; for (const region of e.regions) { if (vertex.vi < offset + region.length) { if (region.length <= 3) return false; region.splice(vertex.vi - offset, 1); return true; } offset += region.length; } } return false; };
  const move = (e,dx,dy) => {
    points(e).forEach(p=>{p.x+=dx;p.y+=dy;});
    if(e.type==='hatch'){const t=e.angle*Math.PI/180;if(e.crosshatch)e.crossOffset=(e.crossOffset??e.offset)-Math.cos(t)*dx-Math.sin(t)*dy;e.offset+=-Math.sin(t)*dx+Math.cos(t)*dy;}
    if(e.game?.center){e.game.center.x+=dx;e.game.center.y+=dy;}
    if(e.game?.radialCenter){e.game.radialCenter.x+=dx;e.game.radialCenter.y+=dy;}
  };
  const bounds = indexes => { const all = indexes.flatMap(index => extentPoints(elements[index])); if (!all.length) return null; return { minX: Math.min(...all.map(p => p.x)), maxX: Math.max(...all.map(p => p.x)), minY: Math.min(...all.map(p => p.y)), maxY: Math.max(...all.map(p => p.y)) }; };
  const fitImportedView = () => { const box = bounds(elements.map((_, index) => index)); if (!box) return; const width = Math.max(.1, box.maxX - box.minX), height = Math.max(.1, box.maxY - box.minY), view = viewport(); zoom = Math.max(.25, Math.min(MAX_ZOOM, Math.min(view.width * .72 / (width * 2), view.height * .72 / (height * 2)))); pan = { x: -((box.minX + box.maxX) / 2) * scale(), y: ((box.minY + box.maxY) / 2) * scale() }; };
  const renderList = () => { elementsEl.innerHTML = ''; elements.forEach((e, index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = `${e.type.toUpperCase()} ${index + 1}`; button.className = selection.has(index) ? 'active' : ''; button.onclick = ev => { if (!(ev.shiftKey || ev.ctrlKey || ev.metaKey)) selection.clear(); selection.has(index) ? selection.delete(index) : selection.add(index); renderAll(); }; elementsEl.append(button); }); };
  const num = (label, value, setter, step = '.1') => { const labelEl = document.createElement('label'); labelEl.textContent = label; const input = document.createElement('input'); input.type = 'number'; input.step = step; input.value = value; input.onchange = () => { const number = Number(input.value); if (Number.isFinite(number)) { setter(number); saveHistory(); renderAll(); } }; labelEl.append(input); props.append(labelEl); };
  const renderExtendedProps = () => {
    props.replaceChildren();
    const note=value=>{const p=document.createElement('p');p.textContent=value;props.append(p);};
    if(!selection.size){note('No selection');return;}
    const choice=(name,value,values,setter)=>{const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');values.forEach(v=>select.append(new Option(v,v)));select.value=value;select.onchange=()=>{setter(select.value);saveHistory();renderAll();};label.append(select);props.append(label);};
    const check=(name,value,setter)=>{const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=value;input.onchange=()=>{setter(input.checked);saveHistory();renderAll();};label.append(input,document.createTextNode(name));props.append(label);};
    const command=(name,fn)=>{const button=document.createElement('button');button.type='button';button.textContent=name;button.onclick=()=>{fn();saveHistory();renderAll();};props.append(button);};
    note(selection.size>1?`${selection.size} objects`:elements[[...selection][0]].type.toUpperCase());
    if(selection.size>1){
      const indexes=[...selection],chosen=indexes.map(i=>elements[i]);
      if(chosen.every(e=>e.type===chosen[0].type) && ['hatch','fill'].includes(chosen[0].type)){
        command('Combine regions',()=>{const joined={...clone(chosen[0]),regions:chosen.flatMap(e=>clone(e.regions))};elements=elements.filter((_,i)=>!selection.has(i));elements.push(joined);selection=new Set([elements.length-1]);});
      }
      command('Mirror horizontal',()=>transformSelection({x:0,y:0,r:0,sx:-1,sy:1}));
      command('Mirror vertical',()=>transformSelection({x:0,y:0,r:0,sx:1,sy:-1}));return;
    }
    const e=elements[[...selection][0]],box=bounds([...selection]);
    command('Mirror horizontal',()=>transformSelection({x:0,y:0,r:0,sx:-1,sy:1}));
    if(e.type==='text'){
      const area=document.createElement('textarea');area.value=e.text;area.rows=3;area.setAttribute('aria-label','Text');area.onchange=()=>{e.text=area.value;saveHistory();renderAll();};props.append(area);
      num('X',e.position.x,v=>e.position.x=v);num('Y',e.position.y,v=>e.position.y=v);num('Game size',e.fontSize,v=>e.fontSize=Math.max(.001,v));
      choice('Align',e.align,['left','center','right'],v=>e.align=v);
      note('Game font: War Thunder');
      choice('Editor font',e.fontFamily,['Arial','Times New Roman','Roboto','monospace',e.fontFamily].filter((v,i,l)=>l.indexOf(v)===i),v=>e.fontFamily=v);
      num('Editor rotation',e.rotation,v=>e.rotation=v,'1');
    }else if(e.type==='circle'){
      num('X',e.center.x,v=>e.center.x=v);num('Y',e.center.y,v=>e.center.y=v);num('Diameter',e.radius*2,v=>e.radius=Math.max(.001,v/2));
      num('Circle thickness',e.thickness??1,v=>e.thickness=Math.max(.01,v));
      num('Segment start',e.segment?.x??0,v=>e.segment={x:v,y:e.segment?.y??360},'1');num('Segment end',e.segment?.y??360,v=>e.segment={x:e.segment?.x??0,y:v},'1');
    }else{
      num('X',box?.minX||0,v=>move(e,v-(box?.minX||0),0));num('Y',box?.minY||0,v=>move(e,0,v-(box?.minY||0)));
    }
    if(e.type==='brush')num('Brush size',e.size,v=>e.size=Math.max(.001,v));
    if(e.type==='hatch'){
      num('Angle',e.angle,v=>e.angle=v,'1');num('Spacing',e.spacing,v=>e.spacing=Math.max(.001,v),'.01');
      choice('Mode',e.mode,['lines','ribbons'],v=>e.mode=v);
      if(e.mode==='ribbons')num('Ribbon width',e.lineWidth,v=>e.lineWidth=Math.max(.0001,v),'.01');
      num('Offset',e.offset,v=>e.offset=v);if(e.crosshatch)num('Cross offset',e.crossOffset??e.offset,v=>e.crossOffset=v);
      if(e.mode==='lines')choice('Endpoint order',e.direction,['forward','reverse'],v=>e.direction=v);
      check('Crosshatch',e.crosshatch,v=>e.crosshatch=v);
    }
    if(e.type==='fill'){choice('Fill rule',e.fillRule,['evenodd','nonzero'],v=>e.fillRule=v);num('Editor opacity',e.opacity,v=>e.opacity=Math.max(0,Math.min(1,v)),'.01');}
    const game=e.game||{},set=(key,value)=>{e.game={...game,[key]:value};};
    if(['line','polyline','curve','text','circle'].includes(e.type)||e.type==='hatch'&&e.mode==='lines')check('Move with range',game.move,v=>set('move',v));
    if(e.type==='text')check('Highlight',game.highlight,v=>set('highlight',v));
    check('Thousandth units',game.thousandth??documentSettings.thousandth,v=>set('thousandth',v));
    const radial=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Radial movement';radial.append(summary);props.append(radial);
    const before=props.childNodes.length;
    check('Move radial',game.moveRadial,v=>set('moveRadial',v));
    num('Radial angle',game.radialAngle||0,v=>set('radialAngle',v),'1');num('Radial speed',game.radialMoveSpeed??1,v=>set('radialMoveSpeed',v));
    num('Radial center X',game.radialCenter?.x||0,v=>set('radialCenter',{x:v,y:game.radialCenter?.y||0}));
    num('Radial center Y',game.radialCenter?.y||0,v=>set('radialCenter',{x:game.radialCenter?.x||0,y:v}));
    if(['quad','brush','fill','shape'].includes(e.type)||e.type==='hatch'&&e.mode==='ribbons'){
      num('Pivot X',game.center?.x??(box.minX+box.maxX)/2,v=>set('center',{x:v,y:game.center?.y??(box.minY+box.maxY)/2}));
      num('Pivot Y',game.center?.y??(box.minY+box.maxY)/2,v=>set('center',{x:game.center?.x??(box.minX+box.maxX)/2,y:v}));
    }
    [...props.childNodes].slice(before).forEach(node=>radial.append(node));
    if(e.type!=='text'&&e.type!=='circle'){
      const detail=document.createElement('details'),title=document.createElement('summary');title.textContent=`Vertices (${points(e).length})`;detail.append(title);props.append(detail);
      const vertexSelect=document.createElement('select');vertexSelect.setAttribute('aria-label','Vertex');points(e).forEach((_,i)=>vertexSelect.append(new Option(String(i+1),String(i))));detail.append(vertexSelect);
      const inputs=document.createElement('div');detail.append(inputs);
      const show=()=>{inputs.replaceChildren();const p=points(e)[Number(vertexSelect.value)];if(!p)return;for(const axis of ['x','y']){const input=document.createElement('input');input.type='number';input.step='.1';input.value=p[axis];input.setAttribute('aria-label',axis.toUpperCase());input.onchange=()=>{if(Number.isFinite(Number(input.value))){p[axis]=Number(input.value);saveHistory();render();}};inputs.append(input);}};
      vertexSelect.onchange=show;show();
    }
  };
  const renderAll = () => { render(); renderList(); renderExtendedProps(); root.querySelectorAll('[data-document]').forEach(input => { const value=documentSettings[input.dataset.document]; if(input.type==='checkbox') input.checked=value; else input.value=value; }); localizeDrawText(); blkMetrics?.schedule(); };
  const finish = () => { if (!drawing) return; let element = null; if (drawing.type === 'polyline' && drawing.points.length > 1) element = { type: 'polyline', points: drawing.points.map(cp) }; if ((drawing.type === 'brush' || drawing.type === 'curve') && drawing.points.length > 1) { const smoothing = finite(root.querySelector('[data-brush="smooth"]')?.value, 6); const simplify = finite(root.querySelector('[data-brush="simplify"]')?.value, 2); const pointsOut = processedStroke(drawing.points); element = drawing.type === 'brush' ? { type: 'brush', points: pointsOut, size: Math.max(.01, finite(brushSizeNumber?.value, 8)), smoothing, simplify } : { type: 'curve', points: pointsOut, smoothing, simplify }; } if (drawing.type === 'quad' && drawing.points.length === 4) element = { type: 'quad', topLeft: cp(drawing.points[0]), topRight: cp(drawing.points[1]), bottomRight: cp(drawing.points[2]), bottomLeft: cp(drawing.points[3]) }; if (drawing.type === 'hatch') { const vertices = drawing.points.slice(); while (vertices.length > 3 && Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) < .05) vertices.pop(); if (vertices.length >= 3) element = { type: 'hatch', regions: [vertices.map(cp)], angle: drawing.angle, spacing: drawing.spacing, lineWidth: drawing.lineWidth, offset: drawing.offset, direction: drawing.direction, crosshatch: drawing.crosshatch, mode: drawing.mode }; } if (drawing.type === 'fill') { const vertices = drawing.points.slice(); while (vertices.length > 3 && Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) < .05) vertices.pop(); if (vertices.length >= 3) element = { type: 'fill', regions: [vertices.map(cp)], fillRule: 'evenodd', opacity: 1 }; } drawing = null; snapTarget = null; if (element && (element.paths || !element.points || element.points.length > 1)) { elements.push(element); selection = new Set([elements.length - 1]); saveHistory(); } renderAll(); };
  const cancel = () => { drawing = drag = null; snapTarget = null; renderAll(); };
  const setTool = next => { if (drawing) finish(); tool = adaptiveStandalone ? 'manual' : next; if (tool === 'brush') blkMetrics?.brushSelected(); toolButtons.forEach(button => button.classList.toggle('active', button.dataset.tool === tool)); if (toolLabel) toolLabel.textContent = toolButtons.find(button => button.dataset.tool === tool)?.querySelector('.tool-name')?.textContent || tool; if (hatchSettings) { hatchSettings.hidden = tool !== 'hatch'; hatchSettings.querySelector('[data-hatch="lineWidth"]').closest('label').hidden=readHatchSettings().mode!=='ribbons'; hatchSettings.querySelector('[data-hatch="direction"]').closest('label').hidden=readHatchSettings().mode==='ribbons'; } if (brushSettings) { brushSettings.hidden = !['brush', 'curve'].includes(tool); const sizeControl = brushSettings.querySelector('[data-brush="size"]')?.closest('label'); if (sizeControl) sizeControl.hidden = tool !== 'brush'; const title = brushSettings.querySelector('h3'); if (title) title.textContent = tool === 'curve' ? localized('Curve','Кривая') : localized('Brush','Кисть'); } if (shapeSettings) shapeSettings.hidden = tool !== 'shape'; if (textSettings) textSettings.hidden = tool !== 'text'; selectionOptions.hidden=tool!=='select'; if (tool !== 'manual' && !adaptiveStandalone) adaptivePreview = null; root.dispatchEvent(new Event('sight-tool-changed')); render(); };
  const readHatchSettings = () => ({ angle: finite(root.querySelector('[data-hatch="angle"]')?.value, 45), spacing: Math.max(.001, finite(root.querySelector('[data-hatch="spacing"]')?.value, .5)), lineWidth: Math.max(.0001, finite(root.querySelector('[data-hatch="lineWidth"]')?.value, .1)), offset: finite(root.querySelector('[data-hatch="offset"]')?.value, 0), direction: root.querySelector('[data-hatch="direction"]')?.value === 'reverse' ? 'reverse' : 'forward', crosshatch: Boolean(root.querySelector('[data-hatch="crosshatch"]')?.checked), mode: root.querySelector('[data-hatch="mode"]')?.value === 'ribbons' ? 'ribbons' : 'lines' });
  root.querySelectorAll('[data-hatch]').forEach(control => control.addEventListener('input', () => { if(drawing?.type === 'hatch') Object.assign(drawing,readHatchSettings()); const width=root.querySelector('[data-hatch="lineWidth"]'); if(width) width.closest('label').hidden=readHatchSettings().mode!=='ribbons'; root.querySelector('[data-hatch="direction"]').closest('label').hidden=readHatchSettings().mode==='ribbons'; render(); }));
  toolButtons.forEach(button => button.onclick = () => { setTool(button.dataset.tool); localizeDrawText(); });
  root.querySelector('[data-action="delete"]').onclick = () => { if (drawing) return cancel(); if (!selection.size) return; elements = elements.filter((_, index) => !selection.has(index)); selection.clear(); saveHistory(); renderAll(); };
  root.querySelector('[data-action="undo"]').onclick = () => { if (historyIndex > 0) { historyIndex--; restore(history[historyIndex]); } };
  root.querySelector('[data-action="redo"]').onclick = () => { if (historyIndex < history.length - 1) { historyIndex++; restore(history[historyIndex]); } };
  root.querySelector('[data-action="reset"]').onclick = () => { zoom = 1; pan = { x: 0, y: 0 }; render(); };
  root.querySelector('[data-action="fit-view"]')?.addEventListener('click', () => { const box = bounds(elements.map((_, index) => index)); if (!box) { zoom = 1; pan = { x: 0, y: 0 }; } else { const width = Math.max(.1, box.maxX - box.minX), height = Math.max(.1, box.maxY - box.minY); zoom = Math.max(.25, Math.min(MAX_ZOOM, Math.min(canvas.clientWidth * .72 / (width * 2), canvas.clientHeight * .72 / (height * 2)))); pan = { x: -((box.minX + box.maxX) / 2) * scale(), y: ((box.minY + box.maxY) / 2) * scale() }; } render(); });
  [root.querySelector('[data-grid]'), root.querySelector('[data-grid-size]'), root.querySelector('[data-snap]')].filter(Boolean).forEach(control => control.addEventListener('change', render));
  canvas.addEventListener('pointerdown', ev => { if (ev.button === 1) ev.preventDefault(); }, { capture: true });
  canvas.addEventListener('pointermove', ev => { if (drag?.mode === 'pan') ev.preventDefault(); }, { capture: true });
  canvas.addEventListener('pointerup', ev => { if (ev.button === 1) ev.preventDefault(); }, { capture: true });
  canvas.addEventListener('pointercancel', ev => { if(drag && ['move','vertex','transform'].includes(drag.mode) && history[historyIndex]){elements=JSON.parse(history[historyIndex]).elements.map(normalize);} drawing = null; drag = null; refDrag=null; snapTarget = null; if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); ev.preventDefault(); renderAll(); }, { capture: true });
  canvas.addEventListener('pointerdown', ev => { if (previewMode || processing) return; canvas.focus({ preventScroll: true }); if (ev.altKey && ev.button === 0 && referencePreview.src) { refDrag = { x: ev.clientX, y: ev.clientY, startX: finite(referenceControl('x')?.value, 0), startY: finite(referenceControl('y')?.value, 0) }; canvas.setPointerCapture(ev.pointerId); return; } pointer = interaction(world(ev), tool !== 'select' && ev.shiftKey); if (space || ev.button === 1) { ev.preventDefault(); drag = { mode: 'pan', x: ev.clientX, y: ev.clientY }; canvas.setPointerCapture(ev.pointerId); return; } if (tool === 'select') {
      const local=screen(pointer),handle=ev.button===0&&!ev.ctrlKey&&!ev.shiftKey?selectionHandles.find(h=>Math.hypot(h.x-local.x,h.y-local.y)<7):null;
      if(handle){const box=bounds([...selection]);drag={mode:'transform',kind:handle.mode,start:cp(pointer),center:{x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2},originals:[...selection].map(i=>[i,clone(elements[i])])};canvas.setPointerCapture(ev.pointerId);return;}
      const vertex = selection.size === 1 && !ev.ctrlKey && !ev.shiftKey && root.querySelector('[data-vertex-edit]')?.checked ? vertexHit(pointer) : null; if (ev.button === 2 && vertex && selection.has(vertex.ei)) { if (removeVertex(vertex)) { saveHistory(); renderAll(); } ev.preventDefault(); return; } if(ev.button!==0)return; if (vertex && selection.has(vertex.ei)) drag = { mode: 'vertex', ei: vertex.ei, vi: vertex.vi }; else { const hitIndex = hit(pointer); if (hitIndex >= 0) { if (ev.shiftKey || ev.ctrlKey || ev.metaKey) selection.has(hitIndex) ? selection.delete(hitIndex) : selection.add(hitIndex); else if (!selection.has(hitIndex)) { selection.clear(); selection.add(hitIndex); } drag = { mode: 'move', last: cp(pointer), indexes: [...selection] }; } else { const mode = ev.ctrlKey || ev.metaKey ? 'toggle' : ev.shiftKey ? 'add' : 'replace'; drag = { mode: 'select-rect', start: cp(pointer), lasso: root.querySelector('[data-selection-mode]').value==='lasso'?[cp(pointer)]:null, baseSelection: new Set(selection), selectionMode: mode }; if (mode === 'replace') selection.clear(); } } canvas.setPointerCapture(ev.pointerId); renderAll(); return; } if (ev.button !== 0) return; if (tool === 'line') { drawing = { type: 'line', start: cp(pointer), end: cp(pointer) }; canvas.setPointerCapture(ev.pointerId); } else if (tool === 'circle') { drawing = { type: 'circle', center: cp(pointer), radius: 0 }; canvas.setPointerCapture(ev.pointerId); } else if (tool === 'polyline') { if (!drawing) drawing = { type: 'polyline', points: [cp(pointer)] }; else if (ev.detail < 2) drawing.points.push(cp(pointer)); if (ev.detail >= 2) finish(); } else if (tool === 'quad') { if (!drawing) drawing = { type: 'quad', points: [] }; drawing.points.push(cp(pointer)); if (drawing.points.length === 4) finish(); } else if (tool === 'hatch') { if (!drawing) drawing = { type: 'hatch', points: [cp(pointer)], ...readHatchSettings() }; else if (ev.detail < 2) drawing.points.push(cp(pointer)); if (ev.detail >= 2) finish(); } render(); });
  canvas.addEventListener('pointermove', ev => { if (previewMode || processing) return; if (refDrag) { const x = referenceControl('x'), y = referenceControl('y'); if (x) x.value = (refDrag.startX + (ev.clientX - refDrag.x) / scale()).toFixed(2); if (y) y.value = (refDrag.startY - (ev.clientY - refDrag.y) / scale()).toFixed(2); render(); return; } pointer = interaction(world(ev), ev.shiftKey, drag?.mode === 'vertex' ? { ei: drag.ei, vi: drag.vi } : null); if (coords) coords.textContent = `X ${pointer.x.toFixed(2)} / Y ${pointer.y.toFixed(2)} | ${Math.round(zoom * 100)}%`; if (drag?.mode === 'pan') { ev.preventDefault(); pan.x += ev.clientX - drag.x; pan.y += ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; } else if (drag?.mode === 'transform') {
      const center=drag.center,a={x:drag.start.x-center.x,y:drag.start.y-center.y},b={x:pointer.x-center.x,y:pointer.y-center.y};
      const ratio=drag.kind==='scale'?Math.max(.01,Math.hypot(b.x,b.y)/Math.max(.001,Math.hypot(a.x,a.y))):1;
      const rotation=drag.kind==='rotate'?(Math.atan2(b.y,b.x)-Math.atan2(a.y,a.x))*180/Math.PI:0;
      drag.originals.forEach(([i,original])=>{const local=clone(original);move(local,-center.x,-center.y);elements[i]=applyTransform(local,{x:center.x,y:center.y,r:rotation,sx:ratio,sy:ratio});});
    } else if (drag?.mode === 'vertex') setVertex(elements[drag.ei], drag.vi, pointer); else if (drag?.mode === 'move') { drag.indexes.forEach(index => move(elements[index], pointer.x - drag.last.x, pointer.y - drag.last.y)); drag.last = cp(pointer); } else if (drag?.mode === 'select-rect') { const minX = Math.min(drag.start.x, pointer.x), maxX = Math.max(drag.start.x, pointer.x), minY = Math.min(drag.start.y, pointer.y), maxY = Math.max(drag.start.y, pointer.y); if(drag.lasso)drag.lasso.push(cp(pointer)); const next = new Set(drag.selectionMode === 'replace' ? [] : drag.baseSelection); elements.forEach((e, index) => { const box = bounds([index]); const intersects = drag.lasso ? extentPoints(e).some(p=>polygonContains(p,drag.lasso)) : box && box.maxX >= minX && box.minX <= maxX && box.maxY >= minY && box.minY <= maxY; if (!intersects) return; if (drag.selectionMode === 'toggle') { if (next.has(index)) next.delete(index); else next.add(index); } else next.add(index); }); selection = next; } else if (drawing?.type === 'line') drawing.end = cp(pointer); else if (drawing?.type === 'circle') drawing.radius = Math.hypot(pointer.x - drawing.center.x, pointer.y - drawing.center.y); render(); });
  canvas.addEventListener('pointerup', ev => { if (previewMode || processing) return; if (refDrag) { refDrag = null; if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); return; } if (drag) { const changed = drag.mode !== 'pan' && (drag.mode !== 'select-rect' || Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > .001); drag = null; snapTarget = null; if (changed) saveHistory(); renderAll(); } else if (drawing?.type === 'line' || drawing?.type === 'circle') { const valid = drawing.type === 'line' ? Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y) > .1 : drawing.radius > .1; if (valid) { elements.push(clone(drawing)); selection = new Set([elements.length - 1]); saveHistory(); } drawing = null; renderAll(); } if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); });
  canvas.addEventListener('dblclick', () => { if (previewMode || processing) return; if (drawing?.type === 'polyline' || drawing?.type === 'hatch' || drawing?.type === 'fill') finish(); });
  canvas.addEventListener('dblclick', ev => { if (previewMode || processing || tool !== 'select' || drawing) return; const edge = editableEdgeHit(world(ev)); if (edge) { insertVertex(edge, interaction(world(ev), false)); saveHistory(); renderAll(); } });
  canvas.addEventListener('wheel', ev => { if (previewMode || processing) return; ev.preventDefault(); const before = world(ev); zoom = Math.max(.25, Math.min(MAX_ZOOM, zoom * (ev.deltaY < 0 ? 1.1 : .9))); const after = world(ev); pan.x += (after.x - before.x) * scale(); pan.y -= (after.y - before.y) * scale(); render(); }, { passive: false });
  canvas.addEventListener('auxclick',ev=>{if(ev.button===1)ev.preventDefault();});
  canvas.addEventListener('contextmenu', ev => ev.preventDefault());
  canvas.addEventListener('pointerenter', () => { pointerInside = true; render(); });
  canvas.addEventListener('pointerleave', () => { if (!drag && !drawing) { pointerInside = false; render(); } });
  canvas.addEventListener('lostpointercapture', () => { if (drag?.mode === 'pan') { drag = null; snapTarget = null; renderAll(); } });
  canvas.addEventListener('pointerdown', ev => { if (previewMode || processing || tool !== 'fill' || space || refDrag || ev.button !== 0) return; const point = interaction(world(ev), ev.shiftKey); if (!drawing) drawing = { type: 'fill', points: [cp(point)] }; else if (ev.detail < 2) drawing.points.push(cp(point)); render(); });
  canvas.addEventListener('pointermove', ev => { if (previewMode || processing) return; if (drawing?.type === 'fill') { pointer = interaction(world(ev), ev.shiftKey); render(); } });
  canvas.addEventListener('pointerup', ev => { if (!previewMode && !processing && drawing?.type === 'fill' && ev.detail >= 2) finish(); });
  const simplifyPath = (list,tolerance) => {
    if(list.length<3||tolerance<=0)return list.map(cp);
    const keep=new Set([0,list.length-1]),stack=[[0,list.length-1]];
    while(stack.length){const [a,b]=stack.pop();let max=tolerance,index=-1;for(let i=a+1;i<b;i++){const distance=segmentDistance(list[i],list[a],list[b]);if(distance>max){max=distance;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
    return [...keep].sort((a,b)=>a-b).map(i=>cp(list[i]));
  };
  const processedStroke = list => simplifyPath(smoothPath(list.filter((p,i)=>!i||Math.hypot(p.x-list[i-1].x,p.y-list[i-1].y)>1e-9),finite(root.querySelector('[data-brush="smooth"]')?.value,6)),finite(root.querySelector('[data-brush="simplify"]')?.value,2)/100);
  canvas.addEventListener('pointerdown', ev => { if (previewMode || processing || !['brush', 'curve', 'shape', 'text'].includes(tool) || space || refDrag || ev.button !== 0) return; const p = interaction(world(ev), ev.shiftKey); if (tool === 'text') { const configured = String(textControl('value')?.value || '').trim(); const value = configured || window.prompt(localized('Text','Текст'), localized('Sight','Прицел')); if (value?.trim()) { const fontChoice = textControl('font')?.value || 'Arial'; const customFont = textControl('custom-font')?.value || ''; elements.push({ type: 'text', position: cp(p), text: value.trim(), fontSize: Math.max(.001, finite(textControl('size')?.value, 1)), fontFamily: fontChoice === 'custom' ? (customFont || 'Arial') : fontChoice, filled: true, rotation: 0, align: textControl('align')?.value || 'center', game: {move: Boolean(textControl('move')?.checked), highlight: Boolean(textControl('highlight')?.checked)} }); selection = new Set([elements.length - 1]); saveHistory(); renderAll(); } return; } drawing = { type: tool, points: [cp(p)], start: cp(p), end: cp(p) }; canvas.setPointerCapture(ev.pointerId); render(); });
  canvas.addEventListener('pointermove', ev => { if (previewMode || processing || !drawing || !['brush', 'curve', 'shape'].includes(drawing.type)) return; const p = interaction(world(ev), ev.shiftKey); pointer = p; if (drawing.type === 'shape' && shapeKind?.value !== 'free') drawing.end = cp(p); else { const step=drawing.type==='brush'?Math.max(.002,Math.min(.5,finite(brushSizeNumber?.value,8)*.025)):.02; if (Math.hypot(p.x-drawing.points.at(-1).x,p.y-drawing.points.at(-1).y)>step && drawing.points.length<10000) drawing.points.push(cp(p)); } render(); });
  canvas.addEventListener('pointerup', ev => { if (previewMode || processing || !drawing || !['brush', 'curve', 'shape'].includes(drawing.type)) return; const d = drawing; if(d.type!=='shape' && Math.hypot(pointer.x-d.points.at(-1).x,pointer.y-d.points.at(-1).y)>1e-9)d.points.push(cp(pointer)); drawing = null; let element = null; if (d.type === 'shape') { const kind = shapeKind?.value || 'square'; element = kind === 'free' ? { type: 'shape', kind, points: simplifyPath(d.points, .01) } : createShape(kind, d.start, d.end); } else { const smoothing = finite(root.querySelector('[data-brush="smooth"]')?.value, 6); const simplify = finite(root.querySelector('[data-brush="simplify"]')?.value, 2); const tolerance = Math.max(.001, simplify / 100); const pointsOut = processedStroke(d.points); if (pointsOut.length > 1) element = d.type === 'brush' ? { type: 'brush', points: pointsOut, size: Math.max(.01, finite(brushSizeNumber?.value, 8)), smoothing, simplify } : { type: 'curve', points: pointsOut, smoothing, simplify }; } if (element && (element.paths || !element.points || element.points.length > 1)) { elements.push(element); selection = new Set([elements.length - 1]); saveHistory(); } if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); renderAll(); });
  const download = (blob, name) => {
    const metadata = documentEnvelope.metadata || {};
    const tankId = metadata.adaptiveSight?.tankId || metadata.manualSight?.activeTankId;
    if (tankId && (name === 'sight.blk' || name === 'sight.json')) {
      const base = metadata.adaptiveSight ? `${tankId}_${metadata.name}` : `${metadata.name || 'sight'}_${tankId}`;
      name = `${String(base || tankId).replace(/[^a-zA-Z0-9_-]/g, '_')}.${name.split('.').pop()}`;
    }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  };
  root.querySelector('[data-action="save-json"]').onclick = () => download(new Blob([JSON.stringify(model())], { type: 'application/json' }), 'sight.json');
  root.querySelector('[data-drawer-file]').onchange = async ev => { const file = ev.target.files[0]; if (!file) return; if (file.size > jsonImportLimit) return alert(localized('JSON file exceeds the allowed size.','Размер JSON превышает допустимый лимит.')); setProcessing(true, 'JSON'); try { await paintFrame(); const response = await fetch('/tools/draw/import-json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: await file.text() }) }); const data = await response.json(); if (!response.ok) throw new Error((data.errors || [data.error || 'Unable to open this sight JSON.']).join(' ')); loadDocument(data); selection.clear(); history = []; historyIndex = -1; saveHistory(); importedDocument = true; renderAll(); } catch (error) { alert(error.message); } finally { setProcessing(false); ev.target.value = ''; } };
  root.querySelector('[data-drawer-blk-file]')?.addEventListener('change', async ev => { const file = ev.target.files[0]; if (!file) return; if (file.size > blkImportLimit) return alert(localized('BLK file exceeds the allowed size.','Размер BLK превышает допустимый лимит.')); setProcessing(true, 'BLK'); try { await paintFrame(); const response = await fetch('/tools/converter/import-blk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blk: await file.text() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to open this BLK.'); loadDocument(data); fitImportedView(); selection.clear(); drawing = drag = null; history = []; historyIndex = -1; saveHistory(); importedDocument = true; renderAll(); } catch (error) { alert(error.message); } finally { setProcessing(false); ev.target.value = ''; } });
  root.querySelector('[data-action="vectorize-reference"]')?.addEventListener('click', async () => { if (!referenceFile) return alert(localized('Load a reference image first.','Сначала загрузите изображение.')); const button = root.querySelector('[data-action="vectorize-reference"]'); const original = button.textContent; button.disabled = true; button.textContent = localized('Processing...', 'Обработка...'); setProcessing(true, 'Vectorizing'); try { await paintFrame(); const placement={x:finite(referenceControl('x')?.value,0),y:finite(referenceControl('y')?.value,0),sx:finite(referenceControl('sx')?.value,1),sy:finite(referenceControl('sy')?.value,1),r:finite(referenceControl('r')?.value,0)},size={...referenceWorldSize};const form = new FormData(); form.append('image', referenceFile, referenceFile.name); form.append('scale', '100'); form.append('detail', '75'); form.append('maxObjects', '5000'); form.append('maxLines', '35000'); form.append('mode', 'line-art'); form.append('thresholdMode', 'auto'); form.append('threshold', '128'); form.append('lineWeight', '1'); form.append('nSegments', '12'); form.append('invert', String(Boolean(generatorSettings.invert))); form.append('inversion', String(Boolean(generatorSettings.inversion))); const response = await fetch('/tools/image-to-sight/process', { method: 'POST', body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Vectorization failed.'); const generated = (data.elements || []).map(normalize).filter(Boolean); if (!generated.length) throw new Error('Vectorization returned no editable geometry.'); const factor=Math.max(size.width,size.height)/64,angle=placement.r*Math.PI/180; generated.forEach(e=>points(e).forEach(p=>{const x=p.x*factor*placement.sx,y=p.y*factor*placement.sy;p.x=placement.x+x*Math.cos(angle)-y*Math.sin(angle);p.y=placement.y+x*Math.sin(angle)+y*Math.cos(angle);})); const start = elements.length; elements = elements.concat(generated); selection = new Set(generated.map((_, index) => start + index)); saveHistory(); renderAll(); } catch (error) { alert(error.message); } finally { setProcessing(false); button.disabled = false; button.textContent = original; } });
  root.querySelector('[data-action="export-blk"]').onclick = async () => { const button = root.querySelector('[data-action="export-blk"]'), original = button.textContent; button.disabled = true; button.textContent = (document.documentElement.lang || '').toLowerCase().startsWith('ru') ? 'Экспорт...' : 'Exporting...'; setProcessing(true, 'BLK export'); try { const response = await fetch('/tools/converter/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: JSON.stringify(model()) }) }); if (!response.ok) { const error=await response.json().catch(()=>({})); alert(error.error || (error.errors||[]).join(' ') || 'Unable to export this sight.'); return; } const exactCount = Number(response.headers.get('X-BLK-Object-Count')); if (Number.isInteger(exactCount)) blkMetrics.acceptCount(exactCount); download(await response.blob(), 'sight.blk'); } finally { setProcessing(false); button.disabled = false; button.textContent = original; } };
  const editorIsTyping = () => ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const duplicate = source => {const start=elements.length;source.forEach(e=>{const copy=clone(e);move(copy,1,-1);elements.push(copy);});selection=new Set(source.map((_,i)=>start+i));saveHistory();renderAll();};
  document.addEventListener('keydown', ev => {
    if (previewMode || processing) return;
    if(editorIsTyping())return;const key=ev.key.toLowerCase(),mod=ev.ctrlKey||ev.metaKey;
    const action=name=>root.querySelector(`[data-action="${name}"]`)?.click();
    let handled=true;
    if(ev.code==='Space'){space=true;}
    else if(key==='escape'){cancel();selection.clear();renderAll();}
    else if(key==='delete'||key==='backspace')action('delete');
    else if(mod&&key==='z')action(ev.shiftKey?'redo':'undo');
    else if(mod&&key==='y')action('redo');
    else if(mod&&key==='s')action('save-json');
    else if(mod&&key==='a'){selection=new Set(elements.map((_,i)=>i));renderAll();}
    else if(mod&&key==='c'){clipboard=[...selection].map(i=>clone(elements[i]));}
    else if(mod&&key==='v'){if(clipboard.length)duplicate(clipboard);}
    else if(mod&&key==='d'){if(selection.size)duplicate([...selection].map(i=>elements[i]));}
    else if(!ev.altKey&&selection.size&&['arrowleft','arrowright','arrowup','arrowdown'].includes(key)){
      const step=ev.shiftKey?1:mod?.01:.1,dx=key==='arrowleft'?-step:key==='arrowright'?step:0,dy=key==='arrowdown'?-step:key==='arrowup'?step:0;
      [...selection].forEach(i=>move(elements[i],dx,dy));saveHistory();renderAll();
    }else if(!mod&&!ev.altKey){
      if(toolShortcutMap[key])setTool(toolShortcutMap[key]);
      else if(['b','h','f','l','s','c'].includes(key))setTool({b:'brush',h:'hatch',f:'fill',l:'polyline',s:'select',c:'curve'}[key]);
      else if((key==='['||key===']')&&tool==='brush'){brushSizeNumber.value=Math.max(.01,Math.min(100,finite(brushSizeNumber.value,8)+(key===']'?1:-1)));brushSizeNumber.dispatchEvent(new Event('input'));}
      else if(key==='+'||key==='='||key==='-'){zoom=Math.max(.25,Math.min(MAX_ZOOM,zoom*(key==='-'?.9:1.1)));render();}
      else if(key==='home')action('fit-view');
      else if((key==='q'||key==='e')&&selection.size){transformSelection({x:0,y:0,r:key==='q'?-5:5,sx:1,sy:1});saveHistory();renderAll();}
      else handled=false;
    }else handled=false;
    if(handled){ev.preventDefault();localizeDrawText();}
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') space = false; });
  window.addEventListener('blur', () => { space=false; });
  const transformSelection = state => {
    const indexes=selection.size?[...selection]:elements.map((_,i)=>i),b=bounds(indexes);if(!b)return;
    const cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
    indexes.forEach(i=>{const local=clone(elements[i]);move(local,-cx,-cy);elements[i]=applyTransform(local,state);move(elements[i],cx,cy);});
  };
  const resize = () => { const view = refreshViewport(); canvas.width = Math.round(view.width * view.dpr); canvas.height = Math.round(view.height * view.dpr); ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); render(); };
  let pending = null; try { if (!adaptiveStandalone) pending = sessionStorage.getItem('hubThunderSightDocument'); } catch {}
  if (pending) { try { loadDocument(JSON.parse(pending)); importedDocument = elements.length > 0; } catch(error) { importNotice.textContent=error.message;importNotice.hidden=false; } try { sessionStorage.removeItem('hubThunderSightDocument'); } catch {} }
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', refreshViewport, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  const icons={select:'mouse-pointer-2',line:'minus',polyline:'waypoints',quad:'rectangle-horizontal',brush:'paintbrush',curve:'spline',shape:'shapes',text:'type',hatch:'align-justify',fill:'paint-bucket',manual:'crosshair'};
  toolButtons.forEach(button=>{const icon=document.createElement('i');icon.dataset.lucide=icons[button.dataset.tool]||'circle';button.prepend(icon);});
  for(const [action,iconName] of Object.entries({undo:'undo-2',redo:'redo-2','fit-view':'scan',reset:'focus',delete:'trash-2'})){
    const button=root.querySelector(`[data-action="${action}"]`);if(!button)continue;
    const label=button.textContent;button.title=label;button.setAttribute('aria-label',label);button.innerHTML=`<i data-lucide="${iconName}"></i>`;button.classList.add('drawer-icon-button');
  }
  localizeDrawText();
  window.lucide?.createIcons();
  root.sightEditor = {
    read: model,
    selected: () => [...selection],
    commit: value => { adaptivePreview = null; loadDocument(value); saveHistory(); renderAll(); root.dispatchEvent(new Event('sight-document-changed')); },
    preview: transform => { adaptivePreview = transform; if (previewMode) normalizedReticle = renderNormalizedReticle(); render(); },
    tool: () => tool,
    fit: () => root.querySelector('[data-action="fit-view"]').click()
  };
  root.querySelectorAll('[data-action="undo"], [data-action="redo"]').forEach(button => button.addEventListener('click', () => { adaptivePreview = null; root.dispatchEvent(new Event('sight-document-changed')); }));
  resize(); setTool('select'); history=[JSON.stringify(model())];historyIndex=0;renderAll();
  if (pending) persistDraft(JSON.stringify(model()));
  else readDraft().then(serialized => { if (elements.length) return; try { serialized ||= localStorage.getItem(draftFallbackKey); if (!serialized) return; restore(serialized); history=[JSON.stringify(model())]; historyIndex=0; saveIndicator.textContent=localized('Saved', 'Сохранено'); root.dispatchEvent(new Event('sight-document-changed')); } catch {} });
})();
