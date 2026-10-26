import type { ArtworkProject, Point, PolygonShape } from '../data/models';
import { distance, pointInPolygon } from './geometry';
import type { Viewport } from './viewport';
import { worldToScreen } from './viewport';

/** Touch radius (CSS px) for grabbing a vertex handle. Constant in screen space. */
export const VERTEX_HIT_RADIUS_PX = 22;
/** Radius (CSS px) around the first draft vertex that closes the polygon. */
export const CLOSE_HIT_RADIUS_PX = 22;

/**
 * Nearest vertex of `shape` within `radiusPx` of `screenPoint`, measured in
 * screen space so the target size is independent of zoom.
 */
export function hitVertex(
  points: readonly Point[],
  screenPoint: Point,
  viewport: Viewport,
  radiusPx = VERTEX_HIT_RADIUS_PX,
): number | null {
  let best: number | null = null;
  let bestDist = radiusPx;
  points.forEach((p, i) => {
    const d = distance(worldToScreen(p, viewport), screenPoint);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** Topmost shape containing the world point. */
export function hitShape(doc: ArtworkProject, worldPoint: Point): PolygonShape | null {
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const shape = doc.shapes[i]!;
    if (pointInPolygon(worldPoint, shape.points)) return shape;
  }
  return null;
}
