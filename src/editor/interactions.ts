import type { ArtworkProject, CircleShape, Point, Shape } from '../data/models';
import { distance, moveVertex, polygonProblem, wouldSelfIntersect } from './geometry';
import type { PolygonProblem } from './geometry';
import { CLOSE_HIT_RADIUS_PX, hitShape, hitVertex } from './hitTesting';
import type { Handle } from './shapes';
import { MIN_RADIUS, circleThrough, shapeContains, shapeHandles, translateShape } from './shapes';
import type { Viewport } from './viewport';
import { screenToWorld, worldToScreen } from './viewport';

/**
 * Editing semantics, independent of React and DOM events. The pointer
 * controller recognises gestures (tap / drag); these functions decide what a
 * gesture means for the document.
 */

/** Taps closer than this (CSS px) to an existing draft vertex are treated as accidental repeats. */
export const DRAFT_DUPLICATE_RADIUS_PX = 10;

export type DrawTapResult =
  | { kind: 'add'; draft: Point[] }
  | { kind: 'close'; points: Point[] }
  | { kind: 'reject'; reason: string }
  | { kind: 'ignore' };

export function problemMessage(problem: PolygonProblem): string {
  switch (problem) {
    case 'too-few-points':
      return 'A shape needs at least 3 points';
    case 'duplicate-points':
      return 'Two points are in the same place';
    case 'zero-area':
      return 'That shape has no area';
    case 'self-intersecting':
      return 'Edges can’t cross each other';
    case 'non-finite':
      return 'Invalid point';
  }
}

export function closeDraft(draft: Point[]): DrawTapResult {
  const problem = polygonProblem(draft);
  if (problem) return { kind: 'reject', reason: problemMessage(problem) };
  return { kind: 'close', points: draft };
}

/** Interprets a tap (or precision-placement release) in Draw mode. */
export function drawTap(draft: Point[], screenPoint: Point, viewport: Viewport): DrawTapResult {
  const world = screenToWorld(screenPoint, viewport);
  if (draft.length >= 3 && hitVertex([draft[0]!], screenPoint, viewport, CLOSE_HIT_RADIUS_PX) !== null) {
    return closeDraft(draft);
  }
  for (const p of draft) {
    if (distance(worldToScreen(p, viewport), screenPoint) < DRAFT_DUPLICATE_RADIUS_PX) {
      return { kind: 'ignore' };
    }
  }
  if (wouldSelfIntersect(draft, world)) {
    return { kind: 'reject', reason: 'Edges can’t cross each other' };
  }
  return { kind: 'add', draft: [...draft, world] };
}

// --- Circle tool -------------------------------------------------------------

/** Circles smaller than this on screen (CSS px) are treated as accidental. */
export const MIN_CIRCLE_RADIUS_PX = 6;

export type CircleTapResult =
  | { kind: 'add'; rim: Point[] }
  | { kind: 'create'; circle: { cx: number; cy: number; radius: number } }
  | { kind: 'reject'; reason: string }
  | { kind: 'ignore' };

/** Circle tool tap: collect points on the rim; the third one defines the circle. */
export function circleTap(rim: Point[], screenPoint: Point, viewport: Viewport): CircleTapResult {
  for (const p of rim) {
    if (distance(worldToScreen(p, viewport), screenPoint) < DRAFT_DUPLICATE_RADIUS_PX) return { kind: 'ignore' };
  }
  const world = screenToWorld(screenPoint, viewport);
  if (rim.length < 2) return { kind: 'add', rim: [...rim, world] };
  const circle = circleThrough(rim[0]!, rim[1]!, world);
  if (!circle) return { kind: 'reject', reason: 'Those points are in a line — tap three points around the edge' };
  return { kind: 'create', circle };
}

/** Circle tool drag: from the centre (drag start) out to the rim (current point). */
export function circleFromDrag(startWorld: Point, currentWorld: Point): { cx: number; cy: number; radius: number } {
  return { cx: startWorld.x, cy: startWorld.y, radius: distance(startWorld, currentWorld) };
}

export function circleBigEnough(radius: number, viewport: Viewport): boolean {
  return radius * viewport.scale >= MIN_CIRCLE_RADIUS_PX && radius >= MIN_RADIUS;
}

// --- Select-mode drags ----------------------------------------------------------

export type ShapeDrag =
  | { kind: 'vertex'; shapeId: string; index: number; original: Shape; startWorld: Point }
  | { kind: 'move'; shapeId: string; original: Shape; startWorld: Point }
  | { kind: 'radius'; shapeId: string; which: 'outer' | 'inner'; original: CircleShape; startWorld: Point };

/** Nearest handle of `shape` within the screen-space touch radius. */
export function hitHandle(shape: Shape, screenPoint: Point, viewport: Viewport): Handle | null {
  const handles = shapeHandles(shape);
  const index = hitVertex(
    handles.map((h) => h.point),
    screenPoint,
    viewport,
  );
  return index === null ? null : handles[index]!;
}

/**
 * Decides what a single-finger drag starting at `screenPoint` grabs in Select
 * mode. Priority: a handle of the selected shape, then the selected shape's
 * body, then the topmost shape under the finger. Null means "nothing" (pan).
 */
export function beginShapeDrag(
  doc: ArtworkProject,
  selectedId: string | null,
  screenPoint: Point,
  viewport: Viewport,
): ShapeDrag | null {
  const world = screenToWorld(screenPoint, viewport);
  const selected = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  if (selected) {
    const handle = hitHandle(selected, screenPoint, viewport);
    if (handle) {
      const base = { shapeId: selected.id, startWorld: world };
      switch (handle.kind) {
        case 'vertex':
          return { ...base, kind: 'vertex', index: handle.index, original: selected };
        case 'center':
          return { ...base, kind: 'move', original: selected };
        case 'outer':
        case 'inner':
          if (selected.type === 'circle') return { ...base, kind: 'radius', which: handle.kind, original: selected };
      }
    }
    // Prefer the selected shape if the finger is inside it, even when another shape is on top.
    if (shapeContains(selected, world)) return { kind: 'move', shapeId: selected.id, original: selected, startWorld: world };
  }
  const target = hitShape(doc, world);
  return target ? { kind: 'move', shapeId: target.id, original: target, startWorld: world } : null;
}

/** Geometry for the current drag position, applied as a delta so nothing jumps on drag start. */
export function dragShape(drag: ShapeDrag, currentWorld: Point): Shape {
  const dx = currentWorld.x - drag.startWorld.x;
  const dy = currentWorld.y - drag.startWorld.y;
  switch (drag.kind) {
    case 'move':
      return translateShape(drag.original, dx, dy);
    case 'vertex': {
      const shape = drag.original;
      if (shape.type !== 'polygon') return shape;
      const v = shape.points[drag.index]!;
      return { ...shape, points: moveVertex(shape.points, drag.index, { x: v.x + dx, y: v.y + dy }) };
    }
    case 'radius': {
      const c = drag.original;
      const handleR = drag.which === 'outer' ? c.radius : c.innerRadius;
      const handleX = drag.which === 'outer' ? c.cx + handleR : c.cx - handleR;
      const r = Math.hypot(handleX + dx - c.cx, c.cy + dy - c.cy);
      // Clamp so the outer edge always stays outside the hole and vice versa.
      if (drag.which === 'outer') return { ...c, radius: Math.max(r, c.innerRadius > 0 ? c.innerRadius + MIN_RADIUS : MIN_RADIUS) };
      return { ...c, innerRadius: Math.min(Math.max(r, MIN_RADIUS), c.radius - MIN_RADIUS) };
    }
  }
}

/** Polygon points after a drag (convenience for polygon-only callers and tests). */
export function dragPoints(drag: ShapeDrag, currentWorld: Point): Point[] {
  const shape = dragShape(drag, currentWorld);
  return shape.type === 'polygon' ? shape.points : [];
}

/** The point being positioned (for the magnifier), or null for whole-shape moves. */
export function dragFocus(drag: ShapeDrag, shape: Shape): Point | null {
  if (drag.kind === 'vertex' && shape.type === 'polygon') return shape.points[drag.index] ?? null;
  if (drag.kind === 'radius' && shape.type === 'circle') {
    return drag.which === 'outer' ? { x: shape.cx + shape.radius, y: shape.cy } : { x: shape.cx - shape.innerRadius, y: shape.cy };
  }
  return null;
}

/** Shape selected by a tap in Select mode (topmost), or null to deselect. */
export function tapSelect(doc: ArtworkProject, selectedId: string | null, screenPoint: Point, viewport: Viewport): string | null {
  const selected = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  // Tapping a handle of the selection keeps it selected.
  if (selected && hitHandle(selected, screenPoint, viewport)) return selected.id;
  const hit = hitShape(doc, screenToWorld(screenPoint, viewport));
  return hit ? hit.id : null;
}
