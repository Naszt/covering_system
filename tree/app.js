(function () {
  'use strict';

  const Syntax = window.CoveringCppParser;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'covering-expression-tree-v3';
  const SETTINGS_KEY = 'covering-tree-settings-v2';
  const DEFAULT_SETTINGS = Object.freeze({
    nodeRadius: 12,
    levelGap: 92,
    treeGap: 18,
    sumGap: 54,
    maxNudge: 40,
    verticalFlex: 10,
    elasticity: 60
  });
  const SIDE_PADDING = 44;
  const SUM_HUB_OFFSET = 28;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return Object.assign({}, DEFAULT_SETTINGS, saved || {});
    } catch (error) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  let settings = loadSettings();

  function orderGap() {
    return settings.nodeRadius * 2 + 4;
  }

  function physicsSettings() {
    const elasticity = clamp(settings.elasticity / 100, 0, 1);
    return {
      edgeSpring: 0.044 + elasticity * 0.024,
      edgeReaction: 0.008 + elasticity * 0.007,
      rootSpring: 0.12 + elasticity * 0.04,
      dragSpring: 0.28 + elasticity * 0.1,
      restoreSpring: 0.016 - elasticity * 0.006,
      freeDamping: 0.80 + elasticity * 0.1,
      rootDamping: 0.70 + elasticity * 0.07,
      dragDamping: 0.68 + elasticity * 0.07,
      maxSpeed: 14 + elasticity * 8
    };
  }

  const elements = {
    form: document.getElementById('expression-form'),
    input: document.getElementById('expression'),
    message: document.getElementById('parse-message'),
    reset: document.getElementById('reset-layout'),
    settingsToggle: document.getElementById('settings-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsReset: document.getElementById('settings-reset'),
    viewport: document.getElementById('canvas-viewport'),
    svg: document.getElementById('tree-canvas'),
    proofTimeline: document.getElementById('proof-timeline'),
    proofPrevious: document.getElementById('proof-previous'),
    proofPlay: document.getElementById('proof-play'),
    proofNext: document.getElementById('proof-next'),
    proofRule: document.getElementById('proof-rule'),
    proofEquation: document.getElementById('proof-equation'),
    proofDetailToggle: document.getElementById('proof-detail-toggle'),
    proofDetail: document.getElementById('proof-detail'),
    proofStatus: document.getElementById('proof-status')
  };

  let ast = null;
  let layout = null;
  let particles = new Map();
  let offsets = new Map();
  let rootOffset = { x: 0, y: 68 };
  let scene = null;
  let drag = null;
  let frame = null;
  let lastFrameTime = null;
  let resizeTimer = null;
  let settingsTimer = null;
  let parseController = null;
  let proofFrames = [];
  let proofIndex = 0;
  let proofTimer = null;

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function stableJitter(id) {
    let value = 0;
    for (let index = 0; index < id.length; index += 1) value = (value * 31 + id.charCodeAt(index)) | 0;
    return (Math.abs(value) % 11) - 5;
  }

  function computeLayout(root) {
    const nodes = new Map();
    const edges = [];
    const sums = [];
    const groups = new Map();
    const levels = new Map();
    let maximumDepth = 0;
    let terminalCount = 0;
    let sumSeparators = 0;

    (function count(node) {
      if (node.type === 'leaf' || node.type === 'recursion') {
        terminalCount += 1;
        return;
      }
      const children = node.type === 'sum' ? node.terms : node.children;
      if (node.type === 'sum') sumSeparators += Math.max(0, children.length - 1);
      children.forEach(count);
    })(root);

    const diameter = settings.nodeRadius * 2;
    const requestedStride = diameter + Math.max(5, settings.treeGap * 0.46);
    const minimumStride = diameter + 4;
    const requestedSumGap = Math.max(22, settings.sumGap * 0.68);
    const minimumSumGap = 18;
    const availableWidth = Math.max(320, (elements.viewport.clientWidth || 900) - SIDE_PADDING * 2);
    const requestedWidth = Math.max(diameter,
      (terminalCount - 1) * requestedStride + sumSeparators * requestedSumGap + diameter);
    const minimumWidth = Math.max(diameter,
      (terminalCount - 1) * minimumStride + sumSeparators * minimumSumGap + diameter);
    const compression = requestedWidth <= availableWidth || requestedWidth === minimumWidth
      ? 1
      : clamp((availableWidth - minimumWidth) / (requestedWidth - minimumWidth), 0, 1);
    const terminalStride = minimumStride + (requestedStride - minimumStride) * compression;
    const localSumGap = minimumSumGap + (requestedSumGap - minimumSumGap) * compression;
    let cursor = settings.nodeRadius;

    function place(node, depth, parentId, order) {
      maximumDepth = Math.max(maximumDepth, depth);

      if (node.type === 'leaf' || node.type === 'recursion') {
        const baseX = cursor;
        cursor += terminalStride;
        const entry = {
          id: node.id,
          ast: node,
          type: node.type,
          baseX,
          minX: baseX - settings.nodeRadius,
          maxX: baseX + settings.nodeRadius,
          firstTerminalId: node.id,
          lastTerminalId: node.id,
          depth,
          parentId,
          order
        };
        nodes.set(node.id, entry);
        return node.id;
      }

      const children = node.type === 'sum' ? node.terms : node.children;
      const childIds = [];
      children.forEach((child, childIndex) => {
        if (node.type === 'sum' && childIndex > 0) cursor += localSumGap;
        const childId = place(child, node.type === 'sum' ? depth : depth + 1, node.id, childIndex);
        childIds.push(childId);
      });

      const first = nodes.get(childIds[0]);
      const last = nodes.get(childIds[childIds.length - 1]);
      const entry = {
        id: node.id,
        ast: node,
        type: node.type,
        baseX: (first.baseX + last.baseX) / 2,
        minX: first.minX,
        maxX: last.maxX,
        firstTerminalId: first.firstTerminalId,
        lastTerminalId: last.lastTerminalId,
        depth,
        parentId,
        order,
        childIds
      };
      nodes.set(node.id, entry);
      groups.set(node.id, childIds);

      if (node.type === 'sum') sums.push({
        id: node.id,
        termIds: childIds,
        root: parentId === null,
        separators: childIds.slice(0, -1).map((leftId, index) => ({
          leftTerminalId: nodes.get(leftId).lastTerminalId,
          rightTerminalId: nodes.get(childIds[index + 1]).firstTerminalId
        }))
      });
      else childIds.forEach((childId, branch) => edges.push({
        from: node.id,
        to: childId,
        recursive: node.recursivePathChild === branch
      }));
      return node.id;
    }

    place(root, 0, null, 0);
    nodes.forEach((node) => {
      if (node.type === 'sum') return;
      if (!levels.has(node.depth)) levels.set(node.depth, []);
      levels.get(node.depth).push(node.id);
    });
    levels.forEach((ids) => ids.sort((leftId, rightId) => {
      const difference = nodes.get(leftId).baseX - nodes.get(rightId).baseX;
      return difference || leftId.localeCompare(rightId);
    }));

    return {
      rootId: root.id,
      nodes,
      edges,
      sums,
      groups,
      levels,
      width: Math.max(diameter, nodes.get(root.id).maxX),
      maximumDepth,
      maximumY: maximumDepth * settings.levelGap
    };
  }

  function particleFor(id) {
    return particles.get(id);
  }

  function displayPoint(id) {
    const particle = particleFor(id);
    const node = layout.nodes.get(id);
    if (node && node.type === 'sum') {
      const sum = layout.sums.find((item) => item.id === id);
      if (sum && !sum.root) return { x: particle.x, y: particle.y - SUM_HUB_OFFSET };
    }
    return particle;
  }

  function targetX(node) {
    let result = node.baseX + rootOffset.x;
    let current = node;
    while (current) {
      result += offsets.get(current.id) || 0;
      current = current.parentId ? layout.nodes.get(current.parentId) : null;
    }
    return result;
  }

  function targetY(node) {
    return node.depth * settings.levelGap + rootOffset.y;
  }

  function setSvgSize() {
    const viewportWidth = Math.max(elements.viewport.clientWidth, 320);
    const viewportHeight = Math.max(elements.viewport.clientHeight, 520);
    const width = Math.max(viewportWidth, layout.width + SIDE_PADDING * 2);
    const height = Math.max(viewportHeight, layout.maximumY + 160);
    elements.svg.setAttribute('width', width);
    elements.svg.setAttribute('height', height);
    elements.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    return { width, height };
  }

  function resetPhysicalState() {
    offsets = new Map();
    const size = setSvgSize();
    rootOffset = {
      x: (size.width - layout.width) / 2,
      y: Math.max(52, Math.min(76, (size.height - layout.maximumY) * 0.25))
    };
    particles = new Map();

    layout.nodes.forEach((node) => {
      const jitter = prefersReducedMotion || node.type === 'sum' ? 0 : stableJitter(node.id);
      const verticalJitter = prefersReducedMotion || node.type === 'sum' || settings.verticalFlex === 0
        ? 0
        : stableJitter(`${node.id}-vertical`) * Math.min(0.55, settings.verticalFlex / 18);
      particles.set(node.id, {
        x: targetX(node) + jitter,
        y: targetY(node) + verticalJitter,
        vx: prefersReducedMotion ? 0 : -jitter * 0.16,
        vy: prefersReducedMotion ? 0 : -verticalJitter * 0.12
      });
    });
  }

  function nodeDescription(node) {
    if (node.type === 'leaf') return node.ast.value === 0 ? '白色叶子 0' : '黑色叶子 1';
    if (node.type === 'recursion') return '递归箭头';
    if (node.type === 'sum') return '局部加法节点';
    return `${node.ast.arity} 叉分支节点`;
  }

  function createScene() {
    elements.svg.replaceChildren();
    const definitions = svgElement('defs');
    const marker = svgElement('marker', {
      id: 'recursive-arrow',
      markerWidth: '8',
      markerHeight: '8',
      refX: '7',
      refY: '4',
      orient: 'auto',
      markerUnits: 'strokeWidth'
    });
    marker.appendChild(svgElement('path', { class: 'recursive-arrowhead', d: 'M0,0 L8,4 L0,8 Z' }));
    definitions.appendChild(marker);
    const edgeLayer = svgElement('g', { 'aria-hidden': 'true' });
    const sumLayer = svgElement('g', { 'aria-hidden': 'true' });
    const leafLayer = svgElement('g');
    const hitLayer = svgElement('g');
    elements.svg.append(definitions, edgeLayer, sumLayer, leafLayer, hitLayer);

    const edgeItems = layout.edges.map((edge) => {
      const arrow = layout.nodes.get(edge.to).type === 'recursion';
      const recursive = arrow || edge.recursive;
      const element = svgElement('line', {
        class: `tree-edge${recursive ? ' recursive' : ''}`,
        ...(arrow ? { 'marker-end': 'url(#recursive-arrow)' } : {})
      });
      edgeLayer.appendChild(element);
      return { edge, element };
    });

    const sumItems = layout.sums.map((sum) => {
      const group = svgElement('g', { class: `sum-group${sum.root ? ' root-sum' : ''}` });
      const connectors = sum.root ? [] : sum.termIds.map(() => {
        const connector = svgElement('path', { class: 'sum-branch' });
        group.appendChild(connector);
        return connector;
      });
      const symbolCount = sum.root ? sum.separators.length : 1;
      const symbols = Array.from({ length: symbolCount }, () => {
        const symbol = svgElement('text', {
          class: 'sum-symbol',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'aria-hidden': 'true'
        });
        symbol.textContent = '+';
        group.appendChild(symbol);
        return symbol;
      });
      sumLayer.appendChild(group);
      return { sum, group, connectors, symbols, elements: connectors.concat(symbols) };
    });

    const leafItems = new Map();
    layout.nodes.forEach((node) => {
      if (node.type !== 'leaf') return;
      const circle = svgElement('circle', {
        class: `leaf-circle ${node.ast.value === 0 ? 'zero' : 'one'}`,
        r: settings.nodeRadius,
        role: 'img',
        'aria-label': node.ast.value === 0 ? '0，白色叶子' : '1，黑色叶子'
      });
      leafLayer.appendChild(circle);
      leafItems.set(node.id, circle);
    });

    const hitItems = new Map();
    const hittableNodes = Array.from(layout.nodes.values())
      .filter((node) => node.type !== 'sum' || node.id === layout.rootId)
      .sort((left, right) => left.id === layout.rootId ? 1 : right.id === layout.rootId ? -1 : 0);

    hittableNodes.forEach((node) => {
      const hit = svgElement('circle', {
        class: 'node-hit',
        r: settings.nodeRadius,
        tabindex: '0',
        role: 'button',
        'aria-label': `${nodeDescription(node)}，可拖动`
      });
      hit.dataset.nodeId = node.id;
      bindHitEvents(hit, node);
      hitLayer.appendChild(hit);
      hitItems.set(node.id, hit);
    });

    scene = { edgeItems, sumItems, leafItems, hitItems };
    updateScene();
  }

  function incidentElements(nodeId) {
    const result = [];
    scene.edgeItems.forEach((item) => {
      if (item.edge.from === nodeId || item.edge.to === nodeId) result.push(item.element);
    });
    scene.sumItems.forEach((item) => {
      if (item.sum.id === nodeId || item.sum.termIds.includes(nodeId)) result.push(...item.elements);
    });
    return result;
  }

  function bindHitEvents(hit, node) {
    hit.addEventListener('pointerenter', () => incidentElements(node.id).forEach((element) => element.classList.add('active')));
    hit.addEventListener('pointerleave', () => {
      if (!drag || drag.nodeId !== node.id) incidentElements(node.id).forEach((element) => element.classList.remove('active'));
    });
    hit.addEventListener('pointerdown', (event) => beginDrag(event, node, hit));
    hit.addEventListener('keydown', (event) => nudgeWithKeyboard(event, node));
  }

  function svgPoint(event) {
    const rect = elements.svg.getBoundingClientRect();
    const width = Number(elements.svg.getAttribute('width'));
    const height = Number(elements.svg.getAttribute('height'));
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height
    };
  }

  function beginDrag(event, node, hit) {
    event.preventDefault();
    const point = svgPoint(event);
    const particle = particleFor(node.id);
    drag = {
      nodeId: node.id,
      pointerId: event.pointerId,
      root: node.id === layout.rootId,
      grabX: point.x - particle.x,
      grabY: point.y - particle.y,
      pointerX: particle.x,
      pointerY: particle.y,
      lastX: particle.x,
      lastTime: performance.now()
    };
    hit.setPointerCapture(event.pointerId);
    incidentElements(node.id).forEach((element) => element.classList.add('active'));
    wake();
  }

  function rootBounds() {
    const width = Number(elements.svg.getAttribute('width'));
    const height = Number(elements.svg.getAttribute('height'));
    return {
      minX: 28,
      maxX: Math.max(28, width - layout.width - 28),
      minY: 28,
      maxY: Math.max(28, height - layout.maximumY - 28)
    };
  }

  function siblingTarget(id) {
    return particleFor(id).x;
  }

  function setNodeOffset(node, desiredX) {
    const existingOffset = offsets.get(node.id) || 0;
    const base = targetX(node) - existingOffset;
    let minimum = base - settings.maxNudge;
    let maximum = base + settings.maxNudge;
    const siblings = node.parentId ? layout.groups.get(node.parentId) : null;

    if (siblings) {
      const index = siblings.indexOf(node.id);
      if (index > 0) minimum = Math.max(minimum, siblingTarget(siblings[index - 1]) + orderGap());
      if (index + 1 < siblings.length) maximum = Math.min(maximum, siblingTarget(siblings[index + 1]) - orderGap());
    }
    if (minimum > maximum) {
      const middle = (minimum + maximum) / 2;
      minimum = middle;
      maximum = middle;
    }
    const constrained = clamp(desiredX, minimum, maximum);
    offsets.set(node.id, constrained - base);
    return constrained;
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const node = layout.nodes.get(drag.nodeId);
    const point = svgPoint(event);

    if (drag.root) {
      const bounds = rootBounds();
      rootOffset.x = clamp(point.x - drag.grabX - node.baseX, bounds.minX, bounds.maxX);
      rootOffset.y = clamp(point.y - drag.grabY - node.depth * settings.levelGap, bounds.minY, bounds.maxY);
      drag.pointerX = node.baseX + rootOffset.x;
      drag.pointerY = node.depth * settings.levelGap + rootOffset.y;
    } else {
      drag.pointerX = setNodeOffset(node, point.x - drag.grabX);
    }

    const particle = particleFor(node.id);
    const now = performance.now();
    const elapsed = Math.max(8, now - drag.lastTime);
    const pointerVelocity = (drag.pointerX - drag.lastX) / elapsed * 16.67;
    particle.vx = particle.vx * 0.58 + pointerVelocity * 0.42;
    drag.lastX = drag.pointerX;
    drag.lastTime = now;
    wake();
  }

  function endDrag(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    incidentElements(drag.nodeId).forEach((element) => element.classList.remove('active'));
    drag = null;
    wake();
  }

  function nudgeWithKeyboard(event, node) {
    const step = event.shiftKey ? 2 : 8;
    if (node.id === layout.rootId) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const bounds = rootBounds();
      if (event.key === 'ArrowLeft') rootOffset.x = clamp(rootOffset.x - step, bounds.minX, bounds.maxX);
      if (event.key === 'ArrowRight') rootOffset.x = clamp(rootOffset.x + step, bounds.minX, bounds.maxX);
      if (event.key === 'ArrowUp') rootOffset.y = clamp(rootOffset.y - step, bounds.minY, bounds.maxY);
      if (event.key === 'ArrowDown') rootOffset.y = clamp(rootOffset.y + step, bounds.minY, bounds.maxY);
      wake();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setNodeOffset(node, targetX(node) + (event.key === 'ArrowLeft' ? -step : step));
    wake();
  }

  function enforceOrder() {
    layout.levels.forEach((ids) => {
      if (ids.length < 2) return;
      const lockedIndex = drag ? ids.indexOf(drag.nodeId) : -1;

      if (lockedIndex >= 0) {
        for (let index = lockedIndex + 1; index < ids.length; index += 1) {
          const previous = particleFor(ids[index - 1]);
          const current = particleFor(ids[index]);
          current.x = Math.max(current.x, previous.x + orderGap());
        }
        for (let index = lockedIndex - 1; index >= 0; index -= 1) {
          const current = particleFor(ids[index]);
          const next = particleFor(ids[index + 1]);
          current.x = Math.min(current.x, next.x - orderGap());
        }
      } else {
        const centerBefore = ids.reduce((sum, id) => sum + particleFor(id).x, 0) / ids.length;
        for (let index = 1; index < ids.length; index += 1) {
          const previous = particleFor(ids[index - 1]);
          const current = particleFor(ids[index]);
          current.x = Math.max(current.x, previous.x + orderGap());
        }
        const centerAfter = ids.reduce((sum, id) => sum + particleFor(id).x, 0) / ids.length;
        const correction = centerBefore - centerAfter;
        ids.forEach((id) => { particleFor(id).x += correction; });
      }

      for (let index = 1; index < ids.length; index += 1) {
        const previous = particleFor(ids[index - 1]);
        const current = particleFor(ids[index]);
        if (current.x - previous.x > orderGap() + 0.01) continue;
        const closingSpeed = previous.vx - current.vx;
        if (closingSpeed <= 0) continue;
        const impulse = closingSpeed * 0.42;
        previous.vx -= impulse;
        current.vx += impulse;
      }
    });

    // 加法节点是不可见的虚拟锚点；把它限制在首末项之间，避免父边穿过相邻树。
    layout.sums.forEach((sum) => {
      const first = particleFor(sum.termIds[0]);
      const last = particleFor(sum.termIds[sum.termIds.length - 1]);
      const particle = particleFor(sum.id);
      const minimum = Math.min(first.x, last.x);
      const maximum = Math.max(first.x, last.x);
      if (particle.x < minimum) {
        particle.x = minimum;
        particle.vx = Math.max(0, particle.vx);
      } else if (particle.x > maximum) {
        particle.x = maximum;
        particle.vx = Math.min(0, particle.vx);
      }
    });
  }

  function updateScene() {
    if (!scene) return;
    scene.edgeItems.forEach(({ edge, element }) => {
      const from = displayPoint(edge.from);
      const to = displayPoint(edge.to);
      element.setAttribute('x1', from.x);
      element.setAttribute('y1', from.y);
      element.setAttribute('x2', to.x);
      element.setAttribute('y2', to.y);
    });
    scene.sumItems.forEach(({ sum, connectors, symbols }) => {
      if (sum.root) {
        sum.separators.forEach((separator, index) => {
          const left = particleFor(separator.leftTerminalId);
          const right = particleFor(separator.rightTerminalId);
          symbols[index].setAttribute('x', (left.x + right.x) / 2);
          symbols[index].setAttribute('y', particleFor(sum.id).y + 1);
        });
        return;
      }

      const hub = displayPoint(sum.id);
      symbols[0].setAttribute('x', hub.x);
      symbols[0].setAttribute('y', hub.y);
      sum.termIds.forEach((termId, index) => {
        const term = displayPoint(termId);
        const controlY = hub.y + (term.y - hub.y) * 0.54;
        connectors[index].setAttribute('d', `M ${hub.x} ${hub.y + 8} Q ${(hub.x + term.x) / 2} ${controlY} ${term.x} ${term.y}`);
      });
    });
    scene.leafItems.forEach((circle, id) => {
      const particle = particleFor(id);
      circle.setAttribute('cx', particle.x);
      circle.setAttribute('cy', particle.y);
    });
    scene.hitItems.forEach((hit, id) => {
      const particle = displayPoint(id);
      hit.setAttribute('cx', particle.x);
      hit.setAttribute('cy', particle.y);
    });
  }

  function animate(timestamp) {
    frame = null;
    const timeStep = lastFrameTime === null
      ? 1
      : clamp((timestamp - lastFrameTime) / 16.67, 0.5, 2);
    lastFrameTime = timestamp;
    let moving = Boolean(drag);
    const physics = physicsSettings();
    const forcesX = new Map();
    const forcesY = new Map();
    layout.nodes.forEach((node) => {
      forcesX.set(node.id, 0);
      forcesY.set(node.id, 0);
    });

    const rootNode = layout.nodes.get(layout.rootId);
    const rootParticle = particleFor(layout.rootId);
    forcesX.set(layout.rootId, (targetX(rootNode) - rootParticle.x) * physics.rootSpring);
    forcesY.set(layout.rootId, (targetY(rootNode) - rootParticle.y) * physics.rootSpring);

    layout.nodes.forEach((node) => {
      if (!node.parentId) return;
      const particle = particleFor(node.id);
      const parentNode = layout.nodes.get(node.parentId);
      const parent = particleFor(node.parentId);
      const restDistance = node.baseX - parentNode.baseX + (offsets.get(node.id) || 0);
      const horizontalStretch = parent.x + restDistance - particle.x;
      const verticalDistance = (node.depth - parentNode.depth) * settings.levelGap;
      const verticalStretch = parent.y + verticalDistance - particle.y;
      forcesX.set(node.id, forcesX.get(node.id) + horizontalStretch * physics.edgeSpring);
      forcesX.set(node.parentId, forcesX.get(node.parentId) - horizontalStretch * physics.edgeReaction);
      forcesX.set(node.id, forcesX.get(node.id) + (targetX(node) - particle.x) * physics.restoreSpring);
      forcesY.set(node.id, forcesY.get(node.id) + verticalStretch * physics.edgeSpring * 0.9);
      forcesY.set(node.parentId, forcesY.get(node.parentId) - verticalStretch * physics.edgeReaction * 0.55);
      forcesY.set(node.id, forcesY.get(node.id) + (targetY(node) - particle.y) * 0.035);
    });

    layout.sums.forEach((sum) => {
      const first = particleFor(sum.termIds[0]);
      const last = particleFor(sum.termIds[sum.termIds.length - 1]);
      const particle = particleFor(sum.id);
      const midpoint = (first.x + last.x) / 2;
      forcesX.set(sum.id, forcesX.get(sum.id) + (midpoint - particle.x) * 0.045);
    });

    if (drag) {
      const particle = particleFor(drag.nodeId);
      forcesX.set(drag.nodeId, forcesX.get(drag.nodeId) + (drag.pointerX - particle.x) * physics.dragSpring);
      if (drag.root) {
        forcesY.set(drag.nodeId, forcesY.get(drag.nodeId) + (drag.pointerY - particle.y) * physics.dragSpring);
      }
    }

    layout.nodes.forEach((node) => {
      const particle = particleFor(node.id);
      const isDragged = Boolean(drag && drag.nodeId === node.id);
      const isRoot = node.id === layout.rootId;
      const damping = prefersReducedMotion
        ? 0.62
        : isDragged
          ? physics.dragDamping
          : isRoot
            ? physics.rootDamping
            : physics.freeDamping;
      particle.vx = clamp(
        (particle.vx + forcesX.get(node.id) * timeStep) * Math.pow(damping, timeStep),
        -physics.maxSpeed,
        physics.maxSpeed
      );
      particle.x += particle.vx * timeStep;
      particle.vy = clamp(
        (particle.vy + forcesY.get(node.id) * timeStep) * Math.pow(Math.min(damping, 0.84), timeStep),
        -physics.maxSpeed * 0.45,
        physics.maxSpeed * 0.45
      );
      particle.y += particle.vy * timeStep;

      const verticalTarget = targetY(node);
      const minimumY = verticalTarget - settings.verticalFlex;
      const maximumY = verticalTarget + settings.verticalFlex;
      if (particle.y < minimumY || particle.y > maximumY) {
        particle.y = clamp(particle.y, minimumY, maximumY);
        particle.vy *= -0.16;
      }
      if (settings.verticalFlex === 0) {
        particle.y = verticalTarget;
        particle.vy = 0;
      }

      if (
        Math.abs(particle.vx) > 0.025 ||
        Math.abs(particle.vy) > 0.025 ||
        Math.abs(forcesX.get(node.id)) > 0.012 ||
        Math.abs(forcesY.get(node.id)) > 0.012
      ) moving = true;
    });

    enforceOrder();
    updateScene();
    if (moving) frame = requestAnimationFrame(animate);
    else lastFrameTime = null;
  }

  function wake() {
    if (frame === null) {
      lastFrameTime = null;
      frame = requestAnimationFrame(animate);
    }
  }

  function countKinds(root) {
    const counts = { tree: 0, leaf: 0, sum: 0, recursion: 0 };
    function visit(node) {
      counts[node.type] += 1;
      if (node.type === 'tree') node.children.forEach(visit);
      if (node.type === 'sum') node.terms.forEach(visit);
    }
    visit(root);
    return counts;
  }

  function rerenderLayout(announce, transition) {
    if (!ast) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrameTime = null;
    layout = computeLayout(ast);
    resetPhysicalState();
    createScene();
    wake();
    if (transition && !prefersReducedMotion && typeof elements.svg.animate === 'function') {
      elements.svg.animate([
        { opacity: 0.24, transform: 'translateY(9px) scale(0.992)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 430, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
    if (announce) {
      elements.message.classList.remove('error');
      elements.message.textContent = announce;
    }
  }

  function shortExpression(value, limit) {
    const text = String(value || '');
    const maximum = limit || 150;
    if (text.length <= maximum) return text;
    const side = Math.floor((maximum - 3) / 2);
    return `${text.slice(0, side)}…${text.slice(-side)}`;
  }

  function stopProofPlayback() {
    if (proofTimer !== null) window.clearTimeout(proofTimer);
    proofTimer = null;
    elements.proofPlay.textContent = '播放';
  }

  function clearProof(message) {
    stopProofPlayback();
    proofFrames = [];
    proofIndex = 0;
    elements.proofTimeline.replaceChildren();
    elements.proofPrevious.disabled = true;
    elements.proofPlay.disabled = true;
    elements.proofNext.disabled = true;
    elements.proofRule.textContent = '等待 C++ 轨迹';
    elements.proofEquation.textContent = '绘制表达式后生成可重放的 plus 步骤。';
    elements.proofDetailToggle.hidden = true;
    elements.proofDetailToggle.setAttribute('aria-expanded', 'false');
    elements.proofDetail.hidden = true;
    elements.proofDetail.querySelector('code').textContent = '';
    elements.proofStatus.textContent = message || '';
  }

  function proofDetailText(frame) {
    if (!frame.step) return frame.detail || frame.equation;
    const step = frame.step;
    const lines = [`U_${step.index} = (${step.beforeText}) + (${step.termText})`];
    if (step.expandedText && step.expandedText !== step.afterText) lines.push(`    = ${step.expandedText}`);
    lines.push(`    = ${step.afterText}`);
    return lines.join('\n');
  }

  function updateProofSelection(renderTree) {
    if (!proofFrames.length) return;
    const frameData = proofFrames[proofIndex];
    if (renderTree) {
      ast = frameData.ast;
      rerenderLayout(null, true);
    }
    elements.proofTimeline.querySelectorAll('.proof-step').forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === proofIndex));
    });
    elements.proofRule.textContent = frameData.rule;
    elements.proofEquation.textContent = frameData.equation;
    const detail = proofDetailText(frameData);
    elements.proofDetail.querySelector('code').textContent = detail;
    elements.proofDetail.hidden = true;
    elements.proofDetailToggle.setAttribute('aria-expanded', 'false');
    elements.proofDetailToggle.textContent = '查看内部等式';
    elements.proofDetailToggle.hidden = !detail || detail === frameData.equation;
    elements.proofPrevious.disabled = proofIndex === 0;
    elements.proofNext.disabled = proofIndex + 1 >= proofFrames.length;
  }

  function selectProofFrame(index, renderTree) {
    if (!proofFrames.length) return;
    stopProofPlayback();
    proofIndex = clamp(index, 0, proofFrames.length - 1);
    updateProofSelection(renderTree !== false);
  }

  function renderProofTimeline() {
    elements.proofTimeline.replaceChildren();
    proofFrames.forEach((frameData, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'proof-step';
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-pressed', String(index === proofIndex));
      button.textContent = frameData.label;
      button.addEventListener('click', () => selectProofFrame(index));
      elements.proofTimeline.appendChild(button);
    });
    elements.proofPlay.disabled = proofFrames.length < 2;
    updateProofSelection(false);
  }

  function startProofPlayback() {
    if (proofTimer !== null) {
      stopProofPlayback();
      return;
    }
    if (proofIndex + 1 >= proofFrames.length) proofIndex = 0;
    elements.proofPlay.textContent = '暂停';
    const advance = () => {
      proofTimer = null;
      if (proofIndex + 1 >= proofFrames.length) {
        stopProofPlayback();
        return;
      }
      proofIndex += 1;
      updateProofSelection(true);
      elements.proofPlay.textContent = '暂停';
      proofTimer = window.setTimeout(advance, prefersReducedMotion ? 350 : 1250);
    };
    proofTimer = window.setTimeout(advance, 180);
  }

  async function prepareProof(source, controller) {
    elements.proofStatus.textContent = '正在让 covering.hpp 生成 plus 轨迹…';
    try {
      const proof = await Syntax.proveDocument(source, controller.signal);
      if (controller !== parseController) return;
      const firstBefore = proof.steps.length ? proof.steps[0].before : { id: 'proof-zero', type: 'leaf', value: 0 };
      const generatedFrames = [];
      proof.steps.forEach((step) => {
        const hasIntermediate = Boolean(step.expanded && step.expandedText && step.expandedText !== step.afterText);
        if (hasIntermediate) {
          generatedFrames.push({
            label: `+ T${step.index}`,
            rule: '分配 · 吸收',
            equation: `U${step.index - 1} + T${step.index}  →  ${shortExpression(step.expandedText)}`,
            ast: step.expanded,
            step
          });
          generatedFrames.push({
            label: '合并',
            rule: '完整分支合并',
            equation: `${shortExpression(step.expandedText)}  →  ${shortExpression(step.afterText)}`,
            detail: `${step.expandedText}\n    = ${step.afterText}`,
            ast: step.after
          });
          return;
        }
        generatedFrames.push({
          label: `+ T${step.index}`,
          rule: step.beforeText === '0' ? '0 + A = A · 内部化简' : '加入项',
          equation: `U${step.index} = U${step.index - 1} + T${step.index}  →  ${shortExpression(step.afterText)}`,
          ast: step.after,
          step
        });
      });
      proofFrames = [
        {
          label: '原式',
          rule: '输入',
          equation: `E = ${shortExpression(proof.input)}`,
          detail: proof.input,
          ast: proof.inputAst
        },
        {
          label: 'U₀',
          rule: '初值',
          equation: 'U₀ = 0',
          detail: 'plus 从空集 U₀ = 0 开始累计覆盖。',
          ast: firstBefore
        },
        ...generatedFrames
      ];
      proofIndex = 0;
      renderProofTimeline();
      elements.proofStatus.textContent = proof.covered
        ? 'C++ 已把累计覆盖归约为 1。'
        : `当前累计覆盖归约为 ${shortExpression(proof.resultText, 110)}。`;
    } catch (error) {
      if (error.name === 'AbortError' || controller !== parseController) return;
      clearProof(`证明轨迹生成失败：${error.message}`);
    }
  }

  async function renderExpression(source, announce) {
    if (parseController) parseController.abort();
    parseController = new AbortController();
    const currentController = parseController;
    clearProof('等待表达式解析。');
    try {
      elements.message.classList.remove('error');
      elements.message.textContent = '正在由 covering.hpp 解析…';
      const nextAst = await Syntax.parse(source, currentController.signal);
      if (currentController !== parseController) return;
      ast = nextAst;
      rerenderLayout();
      const counts = countKinds(ast);
      elements.message.classList.remove('error');
      elements.message.textContent = announce || `covering.hpp 已识别 ${counts.tree} 个分叉、${counts.leaf} 个叶子、${counts.recursion} 个递归箭头、${counts.sum} 个和式。`;
      try {
        localStorage.setItem(STORAGE_KEY, source);
      } catch (error) {
        // Local persistence is optional.
      }
      prepareProof(source, currentController);
    } catch (error) {
      if (error.name === 'AbortError' || currentController !== parseController) return;
      const position = Number.isInteger(error.position) ? `第 ${error.position + 1} 个字符：` : '';
      elements.message.classList.add('error');
      elements.message.textContent = `${position}${error.message}`;
    }
  }

  function syncSettingsControls() {
    document.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      input.value = settings[key];
      const output = input.parentElement.querySelector('output');
      if (output) output.value = settings[key];
    });
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Local persistence is optional.
    }
  }

  function scheduleSettingsRender() {
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => {
      rerenderLayout('设置已更新。');
    }, 55);
  }

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderExpression(elements.input.value);
  });

  elements.proofPrevious.addEventListener('click', () => selectProofFrame(proofIndex - 1));
  elements.proofNext.addEventListener('click', () => selectProofFrame(proofIndex + 1));
  elements.proofPlay.addEventListener('click', startProofPlayback);
  elements.proofDetailToggle.addEventListener('click', () => {
    const opening = elements.proofDetail.hidden;
    elements.proofDetail.hidden = !opening;
    elements.proofDetailToggle.setAttribute('aria-expanded', String(opening));
    elements.proofDetailToggle.textContent = opening ? '收起内部等式' : '查看内部等式';
  });

  elements.input.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      renderExpression(elements.input.value);
    }
  });

  elements.settingsToggle.addEventListener('click', () => {
    const opening = elements.settingsPanel.hidden;
    elements.settingsPanel.hidden = !opening;
    elements.settingsToggle.setAttribute('aria-expanded', String(opening));
  });

  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.setting;
      settings[key] = Number(input.value);
      const output = input.parentElement.querySelector('output');
      if (output) output.value = input.value;
      persistSettings();
      scheduleSettingsRender();
    });
  });

  elements.settingsReset.addEventListener('click', () => {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    syncSettingsControls();
    persistSettings();
    scheduleSettingsRender();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || elements.settingsPanel.hidden) return;
    elements.settingsPanel.hidden = true;
    elements.settingsToggle.setAttribute('aria-expanded', 'false');
    elements.settingsToggle.focus();
  });

  elements.reset.addEventListener('click', () => {
    if (!ast) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrameTime = null;
    resetPhysicalState();
    updateScene();
    wake();
    elements.message.classList.remove('error');
    elements.message.textContent = '布局已复位。';
  });

  elements.svg.addEventListener('pointermove', moveDrag);
  elements.svg.addEventListener('pointerup', endDrag);
  elements.svg.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!ast) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastFrameTime = null;
      layout = computeLayout(ast);
      resetPhysicalState();
      createScene();
      wake();
    }, 150);
  });

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) elements.input.value = saved;
  } catch (error) {
    // Local persistence is optional.
  }
  syncSettingsControls();
  renderExpression(elements.input.value, '0 是白色叶子，1 是黑色叶子，↑ 表示递归分支。');
})();
