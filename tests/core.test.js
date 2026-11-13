import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, hull, locate, analyze, parse, toCSV, fixture } from '../core.js';
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const point = (x, y) => ({ x, y }),
  dist = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
test('square hull removes interior, duplicate, and collinear-edge points', () => {
  const r = analyze([
    point(0, 0),
    point(2, 0),
    point(2, 2),
    point(0, 2),
    point(1, 1),
    point(1, 0),
    point(0, 0),
  ]);
  assert.deepEqual(r.hull, [point(0, 0), point(2, 0), point(2, 2), point(0, 2)]);
  assert.equal(r.unique, 6);
  assert.equal(r.area, 4);
  assert.equal(r.perimeter, 8);
  assert.equal(r.diameter.squared, 8);
  near(r.rectangle.area, 4);
});
test('one-point and collinear clouds have explicit zero-area envelopes', () => {
  const one = analyze([point(3, 4), point(3, 4)]);
  assert.equal(one.area, 0);
  assert.equal(one.diameter.distance, 0);
  assert.equal(one.rectangle.area, 0);
  const line = analyze(fixture('line'));
  assert.equal(line.hull.length, 2);
  assert.equal(line.rectangle.height, 0);
  assert.equal(line.rectangle.area, 0);
  near(line.perimeter, 2 * line.diameter.distance);
});
test('rotated rectangle recovers exact geometric measurements', () => {
  const r = analyze(fixture('rotated'));
  near(r.area, 4000);
  near(r.perimeter, 280);
  assert.equal(r.diameter.squared, 11600);
  near(r.rectangle.area, 4000);
  near(r.rectangle.width * r.rectangle.height, 4000);
});
test('integer point location distinguishes inside, boundary, and outside', () => {
  const polygon = hull([point(0, 0), point(10, 0), point(10, 10), point(0, 10)]);
  for (const p of [point(0, 0), point(5, 0), point(10, 8)])
    assert.equal(locate(p, polygon), 'boundary');
  assert.equal(locate(point(5, 5), polygon), 'inside');
  assert.equal(locate(point(15, 0), polygon), 'outside');
  assert.equal(locate(point(-1, 5), polygon), 'outside');
  assert.equal(locate(point(1, 1), [point(0, 0), point(2, 2)]), 'boundary');
  assert.equal(locate(point(3, 3), [point(0, 0), point(2, 2)]), 'outside');
});
test('300 random hulls match independent gift wrapping; diameters match all pairs', () => {
  let seed = 37;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let sample = 0; sample < 300; sample++) {
    const points = Array.from({ length: 3 + rand(35) }, () =>
        point(rand(201) - 100, rand(201) - 100),
      ),
      r = analyze(points),
      unique = [...new Map(points.map((p) => [JSON.stringify(p), p])).values()];
    let start = unique.reduce((a, b) => (a.x < b.x || (a.x === b.x && a.y < b.y) ? a : b)),
      current = start;
    const expected = [];
    do {
      expected.push(current);
      let next = unique.find((p) => p !== current);
      if (!next) break;
      for (const p of unique) {
        const cross =
          (next.x - current.x) * (p.y - current.y) - (next.y - current.y) * (p.x - current.x);
        if (cross < 0 || (cross === 0 && dist(current, p) > dist(current, next))) next = p;
      }
      current = next;
    } while (current !== start);
    assert.deepEqual(r.hull, expected);
    let far = 0;
    for (const a of points) for (const b of points) far = Math.max(far, dist(a, b));
    assert.equal(r.diameter.squared, far);
    assert.equal(dist(...r.diameter.pair), far);
    for (const p of points) assert.notEqual(locate(p, r.hull), 'outside');
  }
});
test('minimum rectangles contain every point and beat a dense angle sweep', () => {
  for (let seed = 1; seed <= 35; seed++) {
    const points = Array.from({ length: 20 }, (_, i) =>
        point(Math.round(70 * Math.sin(i * seed)), Math.round(50 * Math.cos(i * seed * 1.3))),
      ),
      r = analyze(points),
      box = r.rectangle;
    if (box.height === 0) {
      assert.equal(box.area, 0);
      for (const p of points) assert.equal(locate(p, r.hull), 'boundary');
      continue;
    }
    const [a, b, , d] = box.corners,
      u = point((b.x - a.x) / box.width, (b.y - a.y) / box.width),
      v = point((d.x - a.x) / box.height, (d.y - a.y) / box.height);
    for (const p of points) {
      const x = (p.x - a.x) * u.x + (p.y - a.y) * u.y,
        y = (p.x - a.x) * v.x + (p.y - a.y) * v.y;
      assert.ok(x >= -1e-7 && x <= box.width + 1e-7 && y >= -1e-7 && y <= box.height + 1e-7);
    }
    for (let angle = 0; angle < 180; angle++) {
      const t = (angle * Math.PI) / 180,
        xx = points.map((p) => p.x * Math.cos(t) + p.y * Math.sin(t)),
        yy = points.map((p) => -p.x * Math.sin(t) + p.y * Math.cos(t)),
        area = (Math.max(...xx) - Math.min(...xx)) * (Math.max(...yy) - Math.min(...yy));
      assert.ok(box.area <= area + 1e-7);
    }
  }
});
test('translation and integer scaling preserve shape and transform measures', () => {
  const points = fixture(),
    a = analyze(points),
    b = analyze(points.map((p) => point(p.x * 3 + 17, p.y * 3 - 23)));
  assert.equal(b.area, a.area * 9);
  near(b.perimeter, a.perimeter * 3);
  assert.equal(b.diameter.squared, a.diameter.squared * 9);
  near(b.rectangle.area, a.rectangle.area * 9, 1e-6);
});
test('extreme allowed coordinates keep orientation and area arithmetic exact', () => {
  const r = analyze([
    point(-10000, -10000),
    point(10000, -10000),
    point(10000, 10000),
    point(-10000, 10000),
  ]);
  assert.equal(r.area, 400000000);
  assert.equal(r.diameter.squared, 800000000);
  assert.equal(r.rectangle.area, 400000000);
});
test('coordinate text parser rejects fractional, malformed, and unbounded points', () => {
  assert.deepEqual(parse(' -2, 3\r\n4,-5\n'), [point(-2, 3), point(4, -5)]);
  for (const text of ['', '1.5,2', '1,2,3', '10001,0', 'NaN,2']) assert.throws(() => parse(text));
  assert.throws(() => validate(Array(501).fill(point(1, 2))));
  assert.throws(() => validate([{ x: 1, y: 2, z: 3 }]));
});
test('source order does not alter measurements and analysis leaves input unchanged', () => {
  const points = fixture(),
    before = JSON.stringify(points),
    a = analyze(points),
    b = analyze([...points].reverse());
  assert.equal(JSON.stringify(points), before);
  assert.deepEqual(a.hull, b.hull);
  assert.equal(a.rectangle.area, b.rectangle.area);
  assert.equal(toCSV([point(-2, 3)]), 'x,y\r\n-2,3\r\n');
});
