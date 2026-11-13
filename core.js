export function validate(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 500)
    throw Error('Use 1–500 points.');
  return input.map((p) => {
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      Object.keys(p).sort().join(',') !== 'x,y' ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      Math.abs(p.x) > 10000 ||
      Math.abs(p.y) > 10000
    )
      throw Error('Points need integer x and y coordinates from −10,000 to 10,000.');
    return { ...p };
  });
}
export function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function hull(input) {
  const source = validate(input),
    sorted = [...new Map(source.map((p) => [`${p.x},${p.y}`, p])).values()].sort(
      (a, b) => a.x - b.x || a.y - b.y,
    );
  if (sorted.length <= 2) return sorted;
  const lower = [],
    upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function locate(p, polygon) {
  validate([p]);
  if (!polygon.length) throw Error('Empty hull.');
  if (polygon.length === 1)
    return p.x === polygon[0].x && p.y === polygon[0].y ? 'boundary' : 'outside';
  if (polygon.length === 2) {
    const [a, b] = polygon;
    return cross(a, b, p) === 0 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) &&
      p.y <= Math.max(a.y, b.y)
      ? 'boundary'
      : 'outside';
  }
  let boundary = false;
  for (let i = 0; i < polygon.length; i++) {
    const c = cross(polygon[i], polygon[(i + 1) % polygon.length], p);
    if (c < 0) return 'outside';
    if (c === 0) boundary = true;
  }
  return boundary ? 'boundary' : 'inside';
}
export function diameter(polygon) {
  const n = polygon.length;
  if (!n) throw Error('Empty hull.');
  if (n === 1) return { squared: 0, distance: 0, pair: [polygon[0], polygon[0]] };
  if (n === 2)
    return {
      squared: distance2(...polygon),
      distance: Math.sqrt(distance2(...polygon)),
      pair: polygon,
    };
  let best = -1,
    pair = null,
    j = 1;
  const consider = (a, b) => {
    const d = distance2(polygon[a], polygon[b]);
    if (d > best) {
      best = d;
      pair = [polygon[a], polygon[b]];
    }
  };
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    while (
      Math.abs(cross(polygon[i], polygon[next], polygon[(j + 1) % n])) >
      Math.abs(cross(polygon[i], polygon[next], polygon[j]))
    )
      j = (j + 1) % n;
    consider(i, j);
    consider(next, j);
    if (
      Math.abs(cross(polygon[i], polygon[next], polygon[(j + 1) % n])) ===
      Math.abs(cross(polygon[i], polygon[next], polygon[j]))
    ) {
      consider(i, (j + 1) % n);
      consider(next, (j + 1) % n);
    }
  }
  return { squared: best, distance: Math.sqrt(best), pair };
}
export function rectangle(polygon) {
  if (!polygon.length) throw Error('Empty hull.');
  if (polygon.length === 1)
    return {
      area: 0,
      width: 0,
      height: 0,
      angle: 0,
      corners: Array.from({ length: 4 }, () => ({ ...polygon[0] })),
    };
  if (polygon.length === 2) {
    const [a, b] = polygon;
    return {
      area: 0,
      width: Math.hypot(b.x - a.x, b.y - a.y),
      height: 0,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      corners: [{ ...a }, { ...b }, { ...b }, { ...a }],
    };
  }
  let best = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      length = Math.hypot(b.x - a.x, b.y - a.y),
      u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
      v = { x: -u.y, y: u.x };
    const along = polygon.map((p) => p.x * u.x + p.y * u.y),
      across = polygon.map((p) => p.x * v.x + p.y * v.y),
      minU = Math.min(...along),
      maxU = Math.max(...along),
      minV = Math.min(...across),
      maxV = Math.max(...across),
      width = maxU - minU,
      height = maxV - minV,
      area = width * height;
    const point = (x, y) => ({ x: x * u.x + y * v.x, y: x * u.y + y * v.y });
    if (!best || area < best.area - 1e-8)
      best = {
        area,
        width,
        height,
        angle: (Math.atan2(u.y, u.x) * 180) / Math.PI,
        corners: [point(minU, minV), point(maxU, minV), point(maxU, maxV), point(minU, maxV)],
      };
  }
  return best;
}
export function analyze(input) {
  const points = validate(input),
    polygon = hull(points);
  let twiceArea = 0,
    perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    twiceArea += a.x * b.y - a.y * b.x;
    perimeter += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return {
    points,
    hull: polygon,
    unique: new Set(points.map((p) => `${p.x},${p.y}`)).size,
    area: Math.abs(twiceArea) / 2,
    perimeter,
    diameter: diameter(polygon),
    rectangle: rectangle(polygon),
  };
}
export function parse(text) {
  if (typeof text !== 'string' || text.length > 20000)
    throw Error('Coordinate text is limited to 20,000 characters.');
  return validate(
    text
      .split(/\r?\n/)
      .filter((s) => s.trim())
      .map((line, i) => {
        const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(line);
        if (!match) throw Error(`Line ${i + 1}: use x,y integer coordinates.`);
        return { x: Number(match[1]), y: Number(match[2]) };
      }),
  );
}
export function toCSV(points) {
  return 'x,y\r\n' + points.map((p) => `${p.x},${p.y}`).join('\r\n') + '\r\n';
}
export function fixture(kind = 'cloud') {
  if (kind === 'line')
    return [
      { x: -60, y: -30 },
      { x: -20, y: -10 },
      { x: 0, y: 0 },
      { x: 60, y: 30 },
      { x: 60, y: 30 },
    ];
  if (kind === 'rotated')
    return [
      { x: -60, y: -20 },
      { x: 20, y: 40 },
      { x: 44, y: 8 },
      { x: -36, y: -52 },
      { x: 0, y: 0 },
      { x: -20, y: -10 },
    ];
  if (kind !== 'cloud') throw Error('Unknown fixture.');
  let seed = 77;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: 35 }, () => ({
    x: Math.round(rand() * 160 - 80),
    y: Math.round(rand() * 110 - 55),
  }));
}
