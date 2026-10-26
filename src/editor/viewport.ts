import type { Point } from '../data/models';

/**
 * Screen <-> world transform. Screen coordinates are CSS pixels relative to the
 * canvas element's top-left corner; world coordinates are artwork/image pixels.
 *
 *   screen = world * scale + offset
 *
 * Independent of devicePixelRatio: the browser handles CSS px -> device px.
 */
export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type Size = { width: number; height: number };

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 40;

export const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  return Math.min(max, Math.max(min, scale));
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

/** Converts a length in screen pixels to world units. */
export function screenLengthToWorld(length: number, viewport: Viewport): number {
  return length / viewport.scale;
}

export function panBy(delta: Point, viewport: Viewport): Viewport {
  return { x: viewport.x + delta.x, y: viewport.y + delta.y, scale: viewport.scale };
}

/** Scales by `factor` keeping the world point under `screenPoint` fixed. */
export function zoomAt(screenPoint: Point, factor: number, viewport: Viewport): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const anchor = screenToWorld(screenPoint, viewport);
  return {
    x: screenPoint.x - anchor.x * scale,
    y: screenPoint.y - anchor.y * scale,
    scale,
  };
}

/**
 * Two-finger gesture: the world point that was under `startMid` at gesture
 * start ends up under `currentMid`, scaled by `currentDistance / startDistance`.
 * Combines pinch zoom and two-finger pan in one stable formula (computed from
 * the gesture's start, so it does not accumulate error).
 */
export function pinchViewport(
  start: Viewport,
  startMid: Point,
  startDistance: number,
  currentMid: Point,
  currentDistance: number,
): Viewport {
  const factor = startDistance > 0 ? currentDistance / startDistance : 1;
  const scale = clampScale(start.scale * factor);
  const anchor = screenToWorld(startMid, start);
  return {
    x: currentMid.x - anchor.x * scale,
    y: currentMid.y - anchor.y * scale,
    scale,
  };
}

/** Viewport that fits a world rectangle centred inside the screen with padding (CSS px). */
export function fitViewport(world: Size, screen: Size, padding = 16): Viewport {
  const availW = Math.max(1, screen.width - padding * 2);
  const availH = Math.max(1, screen.height - padding * 2);
  const scale = clampScale(Math.min(availW / world.width, availH / world.height));
  return {
    x: (screen.width - world.width * scale) / 2,
    y: (screen.height - world.height * scale) / 2,
    scale,
  };
}

export function isValidViewport(v: unknown): v is Viewport {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.scale === 'number' &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.scale) &&
    o.scale > 0
  );
}
