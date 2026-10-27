import type { CircleShape, Point, Shape } from '../data/models';
import type { Bounds } from './geometry';
import { bounds, distance, isValidPolygon, pointInPolygon, translatePoints } from './geometry';

/** Shape-generic geometry (polygons and circles/rings), in world coordinates. */

/** Smallest radius, and smallest ring width, in world units. */
export const MIN_RADIUS = 0.5;
/** Inner radius given to a circle when it is turned into a ring. */
export const DEFAULT_RING_RATIO = 0.6;

export function isValidCircle(c: Pick<CircleShape, 'cx' | 'cy' | 'radius' | 'innerRadius'>): boolean {
  if (![c.cx, c.cy, c.radius, c.innerRadius].every(Number.isFinite)) return false;
  if (c.radius < MIN_RADIUS) return false;
  if (c.innerRadius === 0) return true;
  return c.innerRadius >= MIN_RADIUS && c.innerRadius <= c.radius - MIN_RADIUS;
}

export function isValidShape(shape: Shape): boolean {
  return shape.type === 'polygon' ? isValidPolygon(shape.points) : isValidCircle(shape);
}

/** Whether a world point is on the painted area (a ring's hole is not). */
export function shapeContains(shape: Shape, p: Point): boolean {
  if (shape.type === 'polygon') return pointInPolygon(p, shape.points);
  const d = Math.hypot(p.x - shape.cx, p.y - shape.cy);
  return d <= shape.radius && d >= shape.innerRadius;
}

export function translateShape<S extends Shape>(shape: S, dx: number, dy: number): S {
  if (shape.type === 'polygon') return { ...shape, points: translatePoints(shape.points, dx, dy) };
  return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
}

export function shapeBounds(shape: Shape): Bounds {
  if (shape.type === 'polygon') return bounds(shape.points);
  return { minX: shape.cx - shape.radius, minY: shape.cy - shape.radius, maxX: shape.cx + shape.radius, maxY: shape.cy + shape.radius };
}

export function sameGeometry(a: Shape, b: Shape): boolean {
  if (a.type === 'polygon' && b.type === 'polygon') {
    return a.points.length === b.points.length && a.points.every((p, i) => p.x === b.points[i]!.x && p.y === b.points[i]!.y);
  }
  if (a.type === 'circle' && b.type === 'circle') {
    return a.cx === b.cx && a.cy === b.cy && a.radius === b.radius && a.innerRadius === b.innerRadius;
  }
  return false;
}

export type Handle =
  | { kind: 'vertex'; index: number; point: Point }
  | { kind: 'center'; point: Point }
  | { kind: 'outer'; point: Point }
  | { kind: 'inner'; point: Point };

/**
 * Editing handles. Circles: centre (moves), outer radius on the right edge,
 * and for rings the inner radius on the left, so the two never overlap.
 */
export function shapeHandles(shape: Shape): Handle[] {
  if (shape.type === 'polygon') return shape.points.map((point, index) => ({ kind: 'vertex', index, point }));
  const handles: Handle[] = [
    { kind: 'center', point: { x: shape.cx, y: shape.cy } },
    { kind: 'outer', point: { x: shape.cx + shape.radius, y: shape.cy } },
  ];
  if (shape.innerRadius > 0) handles.push({ kind: 'inner', point: { x: shape.cx - shape.innerRadius, y: shape.cy } });
  return handles;
}

/** Circle through three points, or null if they are (nearly) collinear. */
export function circleThrough(a: Point, b: Point, c: Point): { cx: number; cy: number; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const scale = Math.max(distance(a, b), distance(b, c), distance(a, c));
  // Reject near-collinear points: the circle would be enormous and unstable.
  if (scale === 0 || Math.abs(d) < 1e-9 * scale * scale) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const radius = distance({ x: cx, y: cy }, a);
  if (radius > scale * 50) return null;
  return { cx, cy, radius };
}
