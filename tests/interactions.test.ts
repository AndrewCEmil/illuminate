import { describe, expect, it } from 'vitest';
import { beginShapeDrag, closeDraft, dragPoints, drawTap, tapSelect } from '../src/editor/interactions';
import { worldToScreen } from '../src/editor/viewport';
import { projectWithShapes } from './helpers';

const vp = { x: 10, y: 20, scale: 2 };
const s = (x: number, y: number) => worldToScreen({ x, y }, vp);

describe('drawing polygons', () => {
  it('adds vertices in world coordinates', () => {
    const r = drawTap([], s(5, 7), vp);
    expect(r).toEqual({ kind: 'add', draft: [{ x: 5, y: 7 }] });
  });

  it('closes when tapping near the first vertex with at least 3 points', () => {
    const draft = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const tap = { x: s(0, 0).x + 8, y: s(0, 0).y - 6 }; // 10px away on screen
    expect(drawTap(draft, tap, vp)).toEqual({ kind: 'close', points: draft });
  });

  it('does not close with fewer than 3 points; repeated taps are ignored', () => {
    const draft = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(drawTap(draft, s(0, 0), vp).kind).toBe('ignore');
    expect(drawTap(draft, s(100, 1), vp).kind).toBe('ignore');
  });

  it('rejects a vertex whose edge would cross an earlier edge', () => {
    const draft = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(drawTap(draft, s(50, -50), vp).kind).toBe('reject');
  });

  it('rejects closing a polygon whose closing edge crosses another edge', () => {
    // The edge (50,100)-(50,-50) cuts through the first edge; closeDraft validates the whole polygon.
    const draft = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 50, y: -50 }];
    expect(closeDraft(draft).kind).toBe('reject');
  });
});

describe('select-mode drags', () => {
  it('grabs a vertex handle of the selected shape first', () => {
    const doc = projectWithShapes();
    const drag = beginShapeDrag(doc, 'a', { x: s(100, 100).x + 5, y: s(100, 100).y }, vp);
    expect(drag).toMatchObject({ kind: 'vertex', shapeId: 'a', index: 2 });
  });

  it('moves the selected shape when dragging inside it, even if another shape is on top', () => {
    const doc = projectWithShapes();
    const drag = beginShapeDrag(doc, 'a', s(75, 75), vp);
    expect(drag).toMatchObject({ kind: 'move', shapeId: 'a' });
  });

  it('grabs the topmost shape when nothing is selected, and nothing in empty space', () => {
    const doc = projectWithShapes();
    expect(beginShapeDrag(doc, null, s(75, 75), vp)).toMatchObject({ kind: 'move', shapeId: 'b' });
    expect(beginShapeDrag(doc, null, s(900, 700), vp)).toBeNull();
  });

  it('applies drags as deltas so geometry does not jump at drag start', () => {
    const doc = projectWithShapes();
    const drag = beginShapeDrag(doc, 'a', { x: s(100, 100).x + 6, y: s(100, 100).y + 4 }, vp)!;
    expect(dragPoints(drag, drag.startWorld)).toEqual(doc.shapes[0]!.points);
    expect(dragPoints(drag, { x: drag.startWorld.x + 10, y: drag.startWorld.y })[2]).toEqual({ x: 110, y: 100 });
  });

  it('whole-shape move translates every vertex', () => {
    const doc = projectWithShapes();
    const drag = beginShapeDrag(doc, 'c', s(350, 320), vp)!;
    const moved = dragPoints(drag, { x: drag.startWorld.x - 5, y: drag.startWorld.y + 5 });
    expect(moved).toEqual(doc.shapes[2]!.points.map((p) => ({ x: p.x - 5, y: p.y + 5 })));
  });

  it('tap selects topmost, empty tap deselects', () => {
    const doc = projectWithShapes();
    expect(tapSelect(doc, null, s(75, 75), vp)).toBe('b');
    expect(tapSelect(doc, 'b', s(800, 10), vp)).toBeNull();
  });
});
