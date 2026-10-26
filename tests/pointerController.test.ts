import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../src/data/models';
import type { GestureHost } from '../src/editor/pointerController';
import { PointerController } from '../src/editor/pointerController';
import type { Viewport } from '../src/editor/viewport';
import { screenToWorld } from '../src/editor/viewport';

/** Minimal element that dispatches pointer-like events (Node has no PointerEvent). */
class FakeElement extends EventTarget {
  getBoundingClientRect() {
    return { left: 0, top: 0 } as DOMRect;
  }
  fire(type: string, id: number, x: number, y: number, pointerType = 'touch') {
    const e = Object.assign(new Event(type, { cancelable: true }), { pointerId: id, pointerType, clientX: x, clientY: y, button: 0 });
    this.dispatchEvent(e);
  }
}

function setup(opts: { acceptDrag?: boolean; panOnly?: boolean } = {}) {
  const log: string[] = [];
  let viewport: Viewport = { x: 0, y: 0, scale: 1 };
  const host: GestureHost = {
    getViewport: () => viewport,
    setViewport: (v) => {
      viewport = v;
      log.push('viewport');
    },
    panOnly: () => opts.panOnly ?? false,
    onTap: (p: Point) => log.push(`tap ${p.x},${p.y}`),
    onDragStart: (s: Point) => {
      log.push(`dragStart ${s.x},${s.y}`);
      return opts.acceptDrag ?? true;
    },
    onDragMove: (p: Point) => log.push(`dragMove ${p.x},${p.y}`),
    onDragEnd: (p: Point) => log.push(`dragEnd ${p.x},${p.y}`),
    onDragCancel: () => log.push('dragCancel'),
  };
  const el = new FakeElement();
  const ctrl = new PointerController(host);
  ctrl.attach(el as unknown as HTMLElement);
  return { el, ctrl, log, vp: () => viewport };
}

describe('PointerController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('recognises a tap within the slop radius', () => {
    const { el, log } = setup();
    el.fire('pointerdown', 1, 100, 100);
    el.fire('pointermove', 1, 104, 103); // < 10px
    el.fire('pointerup', 1, 104, 103);
    expect(log).toEqual(['tap 100,100']);
  });

  it('turns movement past the slop into one drag with start, moves and end', async () => {
    const { el, log } = setup();
    el.fire('pointerdown', 1, 100, 100);
    el.fire('pointermove', 1, 120, 100);
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointermove', 1, 130, 110);
    el.fire('pointermove', 1, 140, 120); // coalesced into one frame
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointerup', 1, 150, 130);
    expect(log).toEqual(['dragStart 100,100', 'dragMove 120,100', 'dragMove 140,120', 'dragEnd 150,130']);
  });

  it('pans when the editor declines the drag', async () => {
    const { el, log, vp } = setup({ acceptDrag: false });
    el.fire('pointerdown', 1, 100, 100);
    el.fire('pointermove', 1, 130, 90);
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointerup', 1, 130, 90);
    expect(log.filter((l) => l.startsWith('tap') || l.startsWith('drag'))).toEqual(['dragStart 100,100']);
    expect(vp()).toEqual({ x: 30, y: -10, scale: 1 });
  });

  it('pan tool never offers drags to the editor', async () => {
    const { el, log } = setup({ panOnly: true });
    el.fire('pointerdown', 1, 0, 0);
    el.fire('pointermove', 1, 50, 0);
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointerup', 1, 50, 0);
    expect(log.some((l) => l.startsWith('drag'))).toBe(false);
  });

  it('a second finger cancels an editor drag and becomes a pinch, without taps or commits', async () => {
    const { el, log, vp } = setup();
    el.fire('pointerdown', 1, 100, 100);
    el.fire('pointermove', 1, 120, 100);
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointerdown', 2, 220, 100);
    expect(log).toContain('dragCancel');
    const world = screenToWorld({ x: 170, y: 100 }, vp()); // start midpoint
    el.fire('pointermove', 1, 70, 100);
    el.fire('pointermove', 2, 270, 100); // distance 100 -> 200, midpoint unchanged
    await vi.advanceTimersByTimeAsync(20);
    expect(vp().scale).toBeCloseTo(2);
    const after = screenToWorld({ x: 170, y: 100 }, vp());
    expect(after.x).toBeCloseTo(world.x);
    expect(after.y).toBeCloseTo(world.y);
    el.fire('pointerup', 1, 70, 100);
    el.fire('pointerup', 2, 270, 100);
    expect(log.some((l) => l.startsWith('tap') || l.startsWith('dragEnd'))).toBe(false);
  });

  it('a second finger during a pending tap suppresses the tap (no accidental vertex)', () => {
    const { el, log } = setup();
    el.fire('pointerdown', 1, 100, 100);
    el.fire('pointerdown', 2, 200, 200);
    el.fire('pointerup', 1, 100, 100);
    el.fire('pointerup', 2, 200, 200);
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });

  it('pointercancel during a drag cancels it', async () => {
    const { el, log } = setup();
    el.fire('pointerdown', 1, 0, 0);
    el.fire('pointermove', 1, 40, 0);
    await vi.advanceTimersByTimeAsync(20);
    el.fire('pointercancel', 1, 40, 0);
    expect(log.at(-1)).toBe('dragCancel');
    expect(log).not.toContain('dragEnd 40,0');
  });

  it('reset() (e.g. tool switch) cancels an active drag', async () => {
    const { el, ctrl, log } = setup();
    el.fire('pointerdown', 1, 0, 0);
    el.fire('pointermove', 1, 40, 0);
    await vi.advanceTimersByTimeAsync(20);
    ctrl.reset();
    el.fire('pointerup', 1, 40, 0);
    expect(log).toContain('dragCancel');
    expect(log.some((l) => l.startsWith('dragEnd') || l.startsWith('tap'))).toBe(false);
  });
});
