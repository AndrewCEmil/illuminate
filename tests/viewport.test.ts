import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  fitViewport,
  panBy,
  pinchViewport,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from '../src/editor/viewport';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('viewport transforms', () => {
  const vp = { x: 37.5, y: -12, scale: 2.75 };

  it('round-trips screen -> world -> screen', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 123.4, y: 987.6 }, { x: -50, y: 20 }]) {
      close(worldToScreen(screenToWorld(p, vp), vp), p);
      close(screenToWorld(worldToScreen(p, vp), vp), p);
    }
  });

  it('applies scale then offset', () => {
    expect(worldToScreen({ x: 10, y: 20 }, vp)).toEqual({ x: 10 * 2.75 + 37.5, y: 20 * 2.75 - 12 });
  });

  it('pans by a screen delta without changing scale', () => {
    const v = panBy({ x: 5, y: -7 }, vp);
    expect(v).toEqual({ x: 42.5, y: -19, scale: 2.75 });
    // world point under a screen point moves with the pan
    close(worldToScreen(screenToWorld({ x: 100, y: 100 }, vp), v), { x: 105, y: 93 });
  });

  it('zooms around an anchor: the world point under the anchor stays put', () => {
    const anchor = { x: 200, y: 300 };
    const before = screenToWorld(anchor, vp);
    const v = zoomAt(anchor, 3, vp);
    expect(v.scale).toBeCloseTo(8.25);
    close(screenToWorld(anchor, v), before);
  });

  it('clamps zoom', () => {
    expect(zoomAt({ x: 0, y: 0 }, 1e6, vp).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0 }, 1e-9, vp).scale).toBe(MIN_SCALE);
  });

  it('keeps the anchor fixed even when zoom is clamped', () => {
    const anchor = { x: 50, y: 60 };
    const before = screenToWorld(anchor, vp);
    close(screenToWorld(anchor, zoomAt(anchor, 1e6, vp)), before);
  });

  it('pinch: start midpoint world point follows the current midpoint', () => {
    const startMid = { x: 100, y: 200 };
    const world = screenToWorld(startMid, vp);
    const currentMid = { x: 140, y: 170 };
    const v = pinchViewport(vp, startMid, 100, currentMid, 250);
    expect(v.scale).toBeCloseTo(vp.scale * 2.5);
    close(worldToScreen(world, v), currentMid);
  });

  it('pinch with unchanged distance is a pure pan', () => {
    const v = pinchViewport(vp, { x: 0, y: 0 }, 80, { x: 10, y: 15 }, 80);
    expect(v).toEqual({ x: vp.x + 10, y: vp.y + 15, scale: vp.scale });
  });

  it('fits and centres the world inside the screen', () => {
    const v = fitViewport({ width: 2000, height: 1000 }, { width: 400, height: 800 }, 0);
    expect(v.scale).toBeCloseTo(0.2);
    close(worldToScreen({ x: 0, y: 0 }, v), { x: 0, y: 300 });
    close(worldToScreen({ x: 2000, y: 1000 }, v), { x: 400, y: 500 });
  });
});
