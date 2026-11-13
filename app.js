import { fixture, validate, parse, locate, toCSV } from './core.js';
const $ = (id) => document.getElementById(id),
  ns = 'http://www.w3.org/2000/svg';
let points = fixture(),
  result = null,
  selected = null,
  probePoint = null,
  history = [],
  worker = null,
  busy = false,
  revision = 0,
  view = null;
const fmt = (n) => Number(n.toFixed(3)).toLocaleString();
function status(text) {
  $('status').textContent = text;
  $('coordinate-status').textContent = text;
}
function controls() {
  for (const n of document.querySelectorAll('button,input,select,textarea')) n.disabled = busy;
  $('undo').disabled = busy || !history.length;
  $('remove').disabled = busy || selected === null || points.length === 1;
  $('report').disabled = busy || !result;
  $('hull-csv').disabled = busy || !result;
}
function compute() {
  const ticket = ++revision;
  worker?.terminate();
  busy = true;
  controls();
  const w = new Worker('worker.js', { type: 'module' });
  worker = w;
  status('Computing geometric envelopes…');
  w.onmessage = ({ data }) => {
    if (ticket !== revision) return;
    w.terminate();
    worker = null;
    busy = false;
    if (data.error) status(data.error);
    else {
      result = data.result;
      render();
      status(
        `${points.length} input points · ${result.unique} unique · ${result.hull.length} hull vertices.`,
      );
    }
    controls();
  };
  w.onerror = () => {
    if (ticket === revision) {
      w.terminate();
      worker = null;
      busy = false;
      status('The geometry worker failed. Try an example or apply the coordinates again.');
      controls();
    }
  };
  w.postMessage(points);
}
function replace(candidate, remember = true) {
  try {
    const next = validate(candidate);
    if (remember) {
      history.push(structuredClone(points));
      if (history.length > 50) history.shift();
    }
    points = next;
    selected = null;
    probePoint = null;
    result = null;
    $('coordinates').value = points.map((p) => `${p.x},${p.y}`).join('\n');
    $('probe-result').textContent = '';
    $('coordinate-probe').textContent = '';
    compute();
  } catch (e) {
    status(e.message);
  }
}
function svg(tag, attrs, text) {
  const n = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function render() {
  if (!result) return;
  $('area').textContent = fmt(result.area);
  $('box-area').textContent = fmt(result.rectangle.area);
  $('box-shape').textContent =
    `${fmt(result.rectangle.width)} × ${fmt(result.rectangle.height)} · ${fmt(result.rectangle.angle)}°`;
  $('diameter').textContent = fmt(result.diameter.distance);
  $('perimeter').textContent = fmt(result.perimeter);
  $('counts').textContent =
    `${points.length} input points / ${result.unique} unique / ${result.hull.length} hull vertices. ${points.length - result.unique} duplicate entries.`;
  const all = [...points, ...result.rectangle.corners],
    xs = all.map((p) => p.x),
    ys = all.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys),
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    scale = Math.min(700 / Math.max(20, maxX - minX), 440 / Math.max(20, maxY - minY));
  view = { cx, cy, scale };
  const x = (p) => 400 + (p.x - cx) * scale,
    y = (p) => 270 - (p.y - cy) * scale,
    root = $('canvas');
  root.replaceChildren();
  for (let i = 0; i <= 5; i++) {
    const px = 50 + i * 140,
      py = 50 + i * 88;
    root.append(
      svg('line', { x1: px, x2: px, y1: 40, y2: 500, stroke: '#e4eee8' }),
      svg('line', { x1: 40, x2: 760, y1: py, y2: py, stroke: '#e4eee8' }),
      svg(
        'text',
        { x: px, y: 522, 'font-size': 10, 'text-anchor': 'middle', fill: '#91a89c' },
        fmt(cx + (px - 400) / scale),
      ),
      svg(
        'text',
        { x: 30, y: py + 3, 'font-size': 10, 'text-anchor': 'end', fill: '#91a89c' },
        fmt(cy - (py - 270) / scale),
      ),
    );
  }
  const path = (ps) => ps.map((p) => `${x(p)},${y(p)}`).join(' ');
  root.append(
    svg('polygon', {
      points: path(result.rectangle.corners),
      fill: 'none',
      stroke: '#7ca3a3',
      'stroke-width': 2,
      'stroke-dasharray': '7 5',
    }),
  );
  root.append(
    svg(result.hull.length > 2 ? 'polygon' : 'polyline', {
      points: path(result.hull),
      fill: result.hull.length > 2 ? '#dceee580' : 'none',
      stroke: '#247e67',
      'stroke-width': 2.3,
    }),
  );
  const [a, b] = result.diameter.pair;
  root.append(
    svg('line', {
      x1: x(a),
      y1: y(a),
      x2: x(b),
      y2: y(b),
      stroke: '#c58a60',
      'stroke-width': 2,
      'stroke-dasharray': '3 4',
    }),
  );
  points.forEach((p, i) => {
    const circle = svg('circle', {
      cx: x(p),
      cy: y(p),
      r: selected === i ? 6 : 4,
      fill: selected === i ? '#d28a58' : '#397c6d',
      stroke: '#f8fcfa',
      'stroke-width': 1.5,
      tabindex: 0,
      'data-point': i,
      role: 'button',
      'aria-label': `Select point ${i + 1}: ${p.x}, ${p.y}`,
    });
    const choose = (e) => {
      e.stopPropagation();
      if (busy) return;
      selected = i;
      render();
      controls();
      root.querySelector(`[data-point="${i}"]`)?.focus();
    };
    circle.addEventListener('click', choose);
    circle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(e);
      }
    });
    root.append(circle);
  });
  if (probePoint) {
    const px = x(probePoint),
      py = y(probePoint);
    if (px >= 0 && px <= 800 && py >= 0 && py <= 540)
      root.append(
        svg('path', {
          d: `M${px - 7},${py}h14 M${px},${py - 7}v14`,
          stroke: '#b76450',
          'stroke-width': 2,
          fill: 'none',
        }),
      );
  }
  $('selection').textContent =
    selected === null
      ? 'Click the plot to add a point. Select an existing point to remove it.'
      : `Selected point ${selected + 1}: (${points[selected].x}, ${points[selected].y}).`;
  controls();
}
function coordinate() {
  if (!$('x').value.trim() || !$('y').value.trim()) throw Error('Enter both coordinates.');
  return validate([{ x: Number($('x').value), y: Number($('y').value) }])[0];
}
function probe(p) {
  if (!result) return;
  try {
    validate([p]);
    probePoint = p;
    $('probe-result').textContent =
      `(${p.x}, ${p.y}) is ${locate(p, result.hull) === 'boundary' ? 'on the boundary of' : locate(p, result.hull)} the convex hull.`;
    $('coordinate-probe').textContent = $('probe-result').textContent;
    render();
  } catch (e) {
    status(e.message);
  }
}
$('canvas').addEventListener('click', (e) => {
  if (busy || !view) return;
  const rect = $('canvas').getBoundingClientRect(),
    sx = ((e.clientX - rect.left) / rect.width) * 800,
    sy = ((e.clientY - rect.top) / rect.height) * 540;
  if (sx < 40 || sx > 760 || sy < 40 || sy > 500) return;
  const p = {
    x: Math.round(view.cx + (sx - 400) / view.scale),
    y: Math.round(view.cy - (sy - 270) / view.scale),
  };
  if ($('mode').value === 'probe') probe(p);
  else replace([...points, p]);
});
$('add').addEventListener('click', () => {
  try {
    replace([...points, coordinate()]);
  } catch (e) {
    status(e.message);
  }
});
$('probe').addEventListener('click', () => {
  try {
    probe(coordinate());
  } catch (e) {
    status(e.message);
  }
});
$('remove').addEventListener('click', () => {
  if (selected !== null && points.length > 1) replace(points.filter((_, i) => i !== selected));
});
$('undo').addEventListener('click', () => {
  if (history.length) replace(history.pop(), false);
});
$('example').addEventListener('change', () => replace(fixture($('example').value)));
$('apply').addEventListener('click', () => {
  try {
    replace(parse($('coordinates').value));
  } catch (e) {
    status(e.message);
  }
});
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('save').addEventListener('click', () =>
  download('point-cloud.json', JSON.stringify({ points }, null, 2)),
);
$('report').addEventListener('click', () => {
  if (result) download('geometry-analysis.json', JSON.stringify(result, null, 2));
});
$('hull-csv').addEventListener('click', () => {
  if (result) download('convex-hull.csv', toCSV(result.hull), 'text/csv;charset=utf-8');
});
$('file').addEventListener('change', async () => {
  const f = $('file').files[0];
  if (!f) return;
  const ticket = ++revision;
  worker?.terminate();
  worker = null;
  busy = true;
  controls();
  try {
    if (f.size > 100000) throw Error('Point files are limited to 100 KB.');
    const text = await f.text();
    let candidate;
    if (f.name.toLowerCase().endsWith('.json')) {
      const value = JSON.parse(text);
      if (!value || Array.isArray(value) || Object.keys(value).join(',') !== 'points')
        throw Error('JSON needs a points array only.');
      candidate = validate(value.points);
    } else candidate = parse(text.replace(/^\uFEFF/, '').replace(/^\s*x\s*,\s*y\s*\r?\n/i, ''));
    if (ticket !== revision) return;
    busy = false;
    replace(candidate);
  } catch (e) {
    if (ticket === revision) {
      busy = false;
      controls();
      status(`Import rejected: ${e.message}`);
    }
  } finally {
    $('file').value = '';
  }
});
$('coordinates-open').addEventListener('click', () => $('coordinate-dialog').showModal());
$('coordinates-close').addEventListener('click', () => $('coordinate-dialog').close());
replace(points, false);
