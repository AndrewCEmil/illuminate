import type { Point } from '../data/models';
import type { Viewport } from './viewport';
import { panBy, pinchViewport, zoomAt } from './viewport';

/**
 * Gesture recogniser for the canvas. Turns raw Pointer Events into:
 *  - tap (one pointer, little movement)
 *  - one-finger drag (offered to the editor first; panned if declined)
 *  - two-finger pinch/pan (always navigation, in every tool mode)
 *  - wheel zoom (desktop)
 *
 * It owns transient pointer state only; it never touches the document.
 */
export interface GestureHost {
  getViewport(): Viewport;
  setViewport(viewport: Viewport): void;
  /** True when one-finger drags should always pan (Pan tool). */
  panOnly(): boolean;
  onTap(point: Point): void;
  /** Return true to own the drag; false lets the controller pan instead. */
  onDragStart(start: Point, current: Point): boolean;
  onDragMove(point: Point): void;
  onDragEnd(point: Point): void;
  onDragCancel(): void;
}

type Tracked = { id: number; type: string; start: Point; current: Point };

type State =
  | { kind: 'idle' }
  | { kind: 'pending'; id: number }
  | { kind: 'drag'; id: number }
  | { kind: 'pan'; id: number; last: Point }
  | { kind: 'pinch'; a: number; b: number; startViewport: Viewport; startMid: Point; startDist: number }
  /** Waiting for remaining pointers to lift; ignores them. */
  | { kind: 'settle' };

export function tapSlop(pointerType: string): number {
  if (pointerType === 'mouse') return 4;
  if (pointerType === 'pen') return 6;
  return 10;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export class PointerController {
  private pointers = new Map<number, Tracked>();
  private state: State = { kind: 'idle' };
  private element: HTMLElement | SVGElement | null = null;
  private rect: DOMRect | null = null;
  private frame = 0;
  private pendingViewport: Viewport | null = null;
  private pendingDragPoint: Point | null = null;

  constructor(private host: GestureHost) {}

  attach(element: HTMLElement | SVGElement): () => void {
    this.element = element;
    const opts = { passive: false } as const;
    const down = (e: Event) => this.onPointerDown(e as PointerEvent);
    const move = (e: Event) => this.onPointerMove(e as PointerEvent);
    const up = (e: Event) => this.onPointerUp(e as PointerEvent);
    const cancel = (e: Event) => this.onPointerCancel(e as PointerEvent);
    const wheel = (e: Event) => this.onWheel(e as WheelEvent);
    const menu = (e: Event) => e.preventDefault();
    element.addEventListener('pointerdown', down, opts);
    element.addEventListener('pointermove', move, opts);
    element.addEventListener('pointerup', up, opts);
    element.addEventListener('pointercancel', cancel, opts);
    element.addEventListener('wheel', wheel, opts);
    element.addEventListener('contextmenu', menu);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancel);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('contextmenu', menu);
      this.reset();
      this.element = null;
    };
  }

  /** Abandons any in-progress gesture (e.g. on tool switch). Cancels editor drags. */
  reset(): void {
    if (this.state.kind === 'drag') this.host.onDragCancel();
    this.flush(false);
    this.state = this.pointers.size > 0 ? { kind: 'settle' } : { kind: 'idle' };
  }

  get isActive(): boolean {
    return this.state.kind !== 'idle';
  }

  private localPoint(e: PointerEvent | WheelEvent): Point {
    const rect = this.rect ?? this.element?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: e.clientX, y: e.clientY };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    if (this.pointers.size === 0) this.rect = this.element?.getBoundingClientRect() ?? null;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, { id: e.pointerId, type: e.pointerType, start: p, current: p });
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is best-effort; synthetic events may not support it.
    }

    const s = this.state;
    if (s.kind === 'idle') {
      // Middle mouse button always pans.
      this.state = e.pointerType === 'mouse' && e.button === 1 ? { kind: 'pan', id: e.pointerId, last: p } : { kind: 'pending', id: e.pointerId };
      return;
    }
    if (s.kind === 'pending' || s.kind === 'drag' || s.kind === 'pan') {
      // A second finger turns any one-finger gesture into navigation, discarding its effect.
      if (s.kind === 'drag') {
        this.pendingDragPoint = null;
        this.host.onDragCancel();
      }
      this.startPinch(s.id, e.pointerId);
      return;
    }
    // pinch with a third finger, or settle: ignore extra pointers.
  }

  private startPinch(a: number, b: number): void {
    const pa = this.pointers.get(a);
    const pb = this.pointers.get(b);
    if (!pa || !pb) {
      this.state = { kind: 'settle' };
      return;
    }
    this.flush(true);
    this.state = {
      kind: 'pinch',
      a,
      b,
      startViewport: this.host.getViewport(),
      startMid: mid(pa.current, pb.current),
      startDist: dist(pa.current, pb.current),
    };
  }

  private onPointerMove(e: PointerEvent): void {
    const tracked = this.pointers.get(e.pointerId);
    if (!tracked) return;
    e.preventDefault();
    tracked.current = this.localPoint(e);
    const s = this.state;
    switch (s.kind) {
      case 'pending': {
        if (s.id !== e.pointerId) return;
        if (dist(tracked.start, tracked.current) < tapSlop(tracked.type)) return;
        if (!this.host.panOnly() && this.host.onDragStart(tracked.start, tracked.current)) {
          this.state = { kind: 'drag', id: s.id };
          this.queueDrag(tracked.current);
        } else {
          this.state = { kind: 'pan', id: s.id, last: tracked.start };
          this.applyPan(tracked.current);
        }
        return;
      }
      case 'drag':
        if (s.id === e.pointerId) this.queueDrag(tracked.current);
        return;
      case 'pan':
        if (s.id === e.pointerId) this.applyPan(tracked.current);
        return;
      case 'pinch': {
        const pa = this.pointers.get(s.a);
        const pb = this.pointers.get(s.b);
        if (!pa || !pb) return;
        this.queueViewport(pinchViewport(s.startViewport, s.startMid, s.startDist, mid(pa.current, pb.current), dist(pa.current, pb.current)));
        return;
      }
      default:
        return;
    }
  }

  private applyPan(current: Point): void {
    const s = this.state;
    if (s.kind !== 'pan') return;
    const delta = { x: current.x - s.last.x, y: current.y - s.last.y };
    s.last = current;
    this.queueViewport(panBy(delta, this.pendingViewport ?? this.host.getViewport()));
  }

  private onPointerUp(e: PointerEvent): void {
    const tracked = this.pointers.get(e.pointerId);
    if (!tracked) return;
    e.preventDefault();
    tracked.current = this.localPoint(e);
    this.pointers.delete(e.pointerId);
    const s = this.state;
    switch (s.kind) {
      case 'pending':
        if (s.id === e.pointerId) {
          this.state = { kind: 'idle' };
          this.host.onTap(tracked.start);
        }
        break;
      case 'drag':
        if (s.id === e.pointerId) {
          this.pendingDragPoint = null;
          this.flush(true);
          this.state = { kind: 'idle' };
          this.host.onDragEnd(tracked.current);
        }
        break;
      case 'pan':
        if (s.id === e.pointerId) {
          this.flush(true);
          this.state = { kind: 'idle' };
        }
        break;
      case 'pinch': {
        this.flush(true);
        // Continue panning smoothly with the finger that remains.
        const remainingId = s.a === e.pointerId ? s.b : s.a;
        const remaining = this.pointers.get(remainingId);
        this.state = remaining ? { kind: 'pan', id: remainingId, last: remaining.current } : { kind: 'settle' };
        break;
      }
      default:
        break;
    }
    if (this.pointers.size === 0 && this.state.kind === 'settle') this.state = { kind: 'idle' };
  }

  private onPointerCancel(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const s = this.state;
    if (s.kind === 'drag' && s.id === e.pointerId) {
      this.pendingDragPoint = null;
      this.host.onDragCancel();
    }
    this.flush(true);
    this.state = this.pointers.size > 0 ? { kind: 'settle' } : { kind: 'idle' };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.state.kind === 'drag') return;
    const p = this.localPoint(e);
    const base = this.pendingViewport ?? this.host.getViewport();
    if (e.ctrlKey || e.metaKey || e.deltaMode !== 0 || Math.abs(e.deltaX) < 1) {
      // Mouse wheel or trackpad pinch (ctrlKey): zoom around the cursor.
      const unit = e.deltaMode === 1 ? 16 : 1;
      const factor = Math.exp((-e.deltaY * unit) * (e.ctrlKey ? 0.01 : 0.0015));
      this.queueViewport(zoomAt(p, factor, base));
    } else {
      // Two-finger trackpad scroll: pan.
      this.queueViewport(panBy({ x: -e.deltaX, y: -e.deltaY }, base));
    }
  }

  // --- frame coalescing: at most one viewport/drag update per animation frame ---

  private queueViewport(v: Viewport): void {
    this.pendingViewport = v;
    this.scheduleFrame();
  }

  private queueDrag(p: Point): void {
    this.pendingDragPoint = p;
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.frame) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    this.frame = raf(() => {
      this.frame = 0;
      this.flush(true);
    });
  }

  private flush(apply: boolean): void {
    const v = this.pendingViewport;
    const d = this.pendingDragPoint;
    this.pendingViewport = null;
    this.pendingDragPoint = null;
    if (!apply) return;
    if (v) this.host.setViewport(v);
    if (d && this.state.kind === 'drag') this.host.onDragMove(d);
  }
}
