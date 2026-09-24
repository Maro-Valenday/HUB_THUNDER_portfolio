((scope) => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const fail = code => { throw new Error(code); };
  const compatible = element => ['line', 'polyline', 'curve', 'text', 'circle'].includes(element.type) || element.type === 'hatch' && element.mode === 'lines';
  const state = document => {
    document.metadata ||= { name: 'drawn-sight', version: 1 };
    const value = document.metadata.manualSight ||= { version: 1, activeTankId: null, tanks: {}, originals: {} };
    if (value.version !== 1 || !record(value.tanks) || !record(value.originals) ||
        Object.values(value.tanks).some(tank => !record(tank) || !record(tank.bindings))) fail('IncompatibleConfiguration');
    return value;
  };
  const applyBindings = document => {
    const value = state(document), bindings = value.tanks[value.activeTankId]?.bindings || {};
    for (const element of document.elements) {
      if (!Object.hasOwn(value.originals, element.id)) continue;
      const game = Object.hasOwn(bindings, element.id) ? bindings[element.id] : value.originals[element.id];
      if (game === null) delete element.game;
      else element.game = copy(game);
    }
    return document;
  };
  function switchTank(document, tankId, defaults) {
    const next = copy(document), value = state(next);
    if (!/^[a-zA-Z0-9_-]+$/.test(tankId) || ['__proto__', 'constructor', 'prototype'].includes(tankId)) fail('UnknownTank');
    const ids = new Set();
    for (const element of next.elements) {
      const previousId = element.id;
      if (!previousId || ids.has(previousId)) {
        element.id = scope.crypto?.randomUUID?.() || `manual-${Date.now()}-${ids.size}`;
        if (Object.hasOwn(value.originals, previousId)) {
          value.originals[element.id] = copy(value.originals[previousId]);
          for (const tank of Object.values(value.tanks)) if (Object.hasOwn(tank.bindings || {}, previousId)) tank.bindings[element.id] = copy(tank.bindings[previousId]);
        }
      }
      ids.add(element.id);
      const active = value.tanks[value.activeTankId];
      if (Object.hasOwn(active?.bindings || {}, element.id)) active.bindings[element.id] = element.game ? copy(element.game) : null;
    }
    if (!Object.hasOwn(value.tanks, tankId)) value.tanks[tankId] = { request: copy(defaults), bindings: {} };
    value.activeTankId = tankId;
    return applyBindings(next);
  }
  function applyManual(document, request, profile, selected, all) {
    if (!document.elements?.length) fail('EmptyDrawing');
    if (profile.tankId !== request.tankId || profile.ammunitionId !== request.ammunitionId || !Number.isFinite(profile.radialSpeed)) fail('IncompatibleConfiguration');
    const next = switchTank(document, request.tankId, request), value = state(next);
    const indices = all ? next.elements.map((_, index) => index).filter(index => compatible(next.elements[index])) : selected;
    if (!indices.length || indices.some(index => !next.elements[index] || !compatible(next.elements[index]))) fail('UnsupportedObjects');
    if (next.settings?.thousandth === false || !['real', undefined].includes(next.settings?.thousandthType)) fail('ManualUnits');
    const ids = new Set();
    next.elements.forEach(element => {
      if (!element.id || ids.has(element.id)) element.id = scope.crypto?.randomUUID?.() || `manual-${Date.now()}-${ids.size}`;
      ids.add(element.id);
    });
    const tank = value.tanks[request.tankId];
    tank.request = copy(request); tank.profile = copy(profile);
    for (const index of indices) {
      const element = next.elements[index];
      if (element.game?.thousandth === false) fail('ManualUnits');
      if (!Object.hasOwn(value.originals, element.id)) value.originals[element.id] = element.game ? copy(element.game) : null;
      // Original Tochka/Duga barrel-linked marks use native move. Radial speed
      // is only valid for the source's phased samples, not arbitrary artwork.
      tank.bindings[element.id] = { ...(value.originals[element.id] || {}), move: true, thousandth: true, moveRadial: false };
    }
    return applyBindings(next);
  }
  function elevation(rows, distance, step) {
    if (!rows?.length || !Number.isFinite(distance) || distance < rows[0].distance || distance > rows.at(-1).distance) fail('InvalidRange');
    const upper = rows.findIndex(row => row.distance >= distance);
    if (upper === 0) return 0;
    const first = rows[upper - 1].distance, last = rows[upper].distance;
    return (upper - 1 + (distance - first) / (last - first)) * step;
  }
  function sample(rows, distance, step, maximum = 4000) {
    elevation(rows, distance, step);
    let index = 0;
    for (let i = 1; i < rows.length && rows[i].distance <= maximum; i++) {
      if (Math.abs(rows[i].distance - distance) < Math.abs(rows[index].distance - distance)) index = i;
    }
    return { distance: rows[index].distance, elevation: index * step };
  }
  function preview(element, lift) {
    if (!element.game?.moveRadial && !element.game?.move) return element;
    const next = copy(element), game = next.game;
    const center = game.radialCenter || { x: 0, y: 0 }, radius = Math.hypot(center.x, center.y);
    // Invert the source's ScrollSpeed equation; DRAW Y is opposite to BLK Y.
    const angle = game.moveRadial && radius > 0 ? -(game.radialAngle * Math.PI / 180 - lift * game.radialMoveSpeed / radius) : 0;
    const transform = p => {
      const x = p.x - center.x, y = p.y - center.y;
      p.x = center.x + x * Math.cos(angle) - y * Math.sin(angle);
      p.y = center.y + x * Math.sin(angle) + y * Math.cos(angle) + (game.move ? lift : 0);
    };
    for (const key of ['start','end','center','position','topLeft','topRight','bottomRight','bottomLeft']) if (next[key]) transform(next[key]);
    next.points?.forEach(transform); next.regions?.forEach(region => region.forEach(transform)); next.paths?.forEach(path => path.points.forEach(transform));
    if (next.type === 'text') next.rotation = (next.rotation || 0) + angle * 180 / Math.PI;
    if (next.type === 'circle' && next.segment) { next.segment.x += angle * 180 / Math.PI; next.segment.y += angle * 180 / Math.PI; }
    return next;
  }
  const api = { compatible, switchTank, applyManual, elevation, sample, preview, state };
  scope.hubAdaptiveSight = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
