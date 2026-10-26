import type { ArtworkProject, Point } from '../data/models';
import { distance, moveVertex, pointInPolygon, polygonProblem, translatePoints, wouldSelfIntersect } from './geometry';
import type { PolygonProblem } from './geometry';
import { CLOSE_HIT_RADIUS_PX, hitShape, hitVertex } from './hitTesting';
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

export type ShapeDrag =
  | { kind: 'vertex'; shapeId: string; index: number; original: Point[]; startWorld: Point }
  | { kind: 'move'; shapeId: string; original: Point[]; startWorld: Point };

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
    const index = hitVertex(selected.points, screenPoint, viewport);
    if (index !== null) {
      return { kind: 'vertex', shapeId: selected.id, index, original: selected.points, startWorld: world };
    }
  }
  const target = hitShape(doc, world);
  // Prefer the selected shape if the finger is inside it, even when another shape is on top.
  if (selected && pointInPolygon(world, selected.points)) {
    return { kind: 'move', shapeId: selected.id, original: selected.points, startWorld: world };
  }
  if (target) {
    return { kind: 'move', shapeId: target.id, original: target.points, startWorld: world };
  }
  return null;
}

/** Geometry for the current drag position, applied as a delta so nothing jumps on drag start. */
export function dragPoints(drag: ShapeDrag, currentWorld: Point): Point[] {
  const dx = currentWorld.x - drag.startWorld.x;
  const dy = currentWorld.y - drag.startWorld.y;
  if (drag.kind === 'move') return translatePoints(drag.original, dx, dy);
  const v = drag.original[drag.index]!;
  return moveVertex(drag.original, drag.index, { x: v.x + dx, y: v.y + dy });
}

/** Where the dragged vertex currently is (for the magnifier), or null for whole-shape moves. */
export function dragFocus(drag: ShapeDrag, points: Point[]): Point | null {
  return drag.kind === 'vertex' ? (points[drag.index] ?? null) : null;
}

/** Shape selected by a tap in Select mode (topmost), or null to deselect. */
export function tapSelect(doc: ArtworkProject, selectedId: string | null, screenPoint: Point, viewport: Viewport): string | null {
  const selected = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  // Tapping a handle of the selection keeps it selected.
  if (selected && hitVertex(selected.points, screenPoint, viewport) !== null) return selected.id;
  const hit = hitShape(doc, screenToWorld(screenPoint, viewport));
  return hit ? hit.id : null;
}
