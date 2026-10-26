import type { Point } from '../data/models';

/** Pure 2D geometry helpers. All inputs/outputs are in world coordinates unless noted. */

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Points closer than this (world units) are treated as the same vertex. */
export const DUPLICATE_EPSILON = 1e-6;
/** Polygons with smaller absolute area (world units²) are degenerate. */
export const MIN_POLYGON_AREA = 1e-3;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** Signed area (shoelace). Positive for counter-clockwise in a y-up system. */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(signedArea(points));
}

export function bounds(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function translatePoints(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function moveVertex(points: readonly Point[], index: number, to: Point): Point[] {
  return points.map((p, i) => (i === index ? { x: to.x, y: to.y } : p));
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  // q lies on segment pr, given the three are collinear
  return (
    Math.min(p.x, r.x) - 1e-12 <= q.x &&
    q.x <= Math.max(p.x, r.x) + 1e-12 &&
    Math.min(p.y, r.y) - 1e-12 <= q.y &&
    q.y <= Math.max(p.y, r.y) + 1e-12
  );
}

/** True if closed segments ab and cd share any point (including touching / collinear overlap). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(c, a, d)) return true;
  if (d2 === 0 && onSegment(c, b, d)) return true;
  if (d3 === 0 && onSegment(a, c, b)) return true;
  if (d4 === 0 && onSegment(a, d, b)) return true;
  return false;
}

export function hasDuplicateVertices(points: readonly Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distance(points[i]!, points[j]!) <= DUPLICATE_EPSILON) return true;
    }
  }
  return false;
}

/**
 * True if the closed polygon has no self-intersections: non-adjacent edges
 * never touch, and adjacent edges only share their common vertex.
 */
export function isSimplePolygon(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  if (hasDuplicateVertices(points)) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const c = points[j]!;
      const d = points[(j + 1) % n]!;
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Adjacent edges must not fold back onto each other (collinear overlap).
        const shared = j === i + 1 ? b : a;
        const other1 = j === i + 1 ? a : b;
        const other2 = j === i + 1 ? d : c;
        if (cross(shared, other1, other2) === 0) {
          const v1x = other1.x - shared.x;
          const v1y = other1.y - shared.y;
          const v2x = other2.x - shared.x;
          const v2y = other2.y - shared.y;
          if (v1x * v2x + v1y * v2y > 0) return false;
        }
        continue;
      }
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

export type PolygonProblem = 'too-few-points' | 'non-finite' | 'duplicate-points' | 'self-intersecting' | 'zero-area';

/** Returns null if the polygon is a valid simple polygon, or the reason it isn't. */
export function polygonProblem(points: readonly Point[]): PolygonProblem | null {
  if (points.length < 3) return 'too-few-points';
  if (!points.every(isFinitePoint)) return 'non-finite';
  if (hasDuplicateVertices(points)) return 'duplicate-points';
  if (allCollinear(points)) return 'zero-area';
  if (!isSimplePolygon(points)) return 'self-intersecting';
  if (polygonArea(points) < MIN_POLYGON_AREA) return 'zero-area';
  return null;
}

function allCollinear(points: readonly Point[]): boolean {
  const a = points[0]!;
  const b = points[1]!;
  return points.every((p) => cross(a, b, p) === 0);
}

export function isValidPolygon(points: readonly Point[]): boolean {
  return polygonProblem(points) === null;
}

/**
 * Whether appending `next` to an open polyline would make the new edge cross
 * an earlier edge. Used to reject bad vertex placements while drawing.
 */
export function wouldSelfIntersect(chain: readonly Point[], next: Point): boolean {
  const n = chain.length;
  if (n < 2) return false;
  const last = chain[n - 1]!;
  for (let i = 0; i < n - 2; i++) {
    if (segmentsIntersect(chain[i]!, chain[i + 1]!, last, next)) return true;
  }
  // The new edge must not fold back over the previous edge.
  const prev = chain[n - 2]!;
  if (cross(last, prev, next) === 0) {
    const dot = (prev.x - last.x) * (next.x - last.x) + (prev.y - last.y) * (next.y - last.y);
    if (dot > 0) return true;
  }
  return false;
}

/** Even-odd point in polygon test. */
export function pointInPolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolygonEdge(p: Point, points: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % points.length]!));
  }
  return best;
}
