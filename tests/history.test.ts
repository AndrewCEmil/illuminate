import { describe, expect, it } from 'vitest';
import { addPolygon, deleteShape, reorderShape, setPaletteColor, setReference, setShapeColor, setShapePoints, withNonUndoableFieldsOf } from '../src/editor/documentOps';
import { canRedo, canUndo, commit, createHistory, redo, replacePresent, undo } from '../src/editor/history';
import { dragPoints } from '../src/editor/interactions';
import { makeProject, projectWithShapes, square } from './helpers';

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
  });

  it('a new commit after undo clears the redo branch', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = commit(h, 'd');
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('is bounded', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i, 100);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(50);
  });

  it('ignores no-op commits and supports non-undoable replacement', () => {
    const h = createHistory({ v: 1 });
    expect(commit(h, h.present)).toBe(h);
    const r = replacePresent(h, { v: 2 });
    expect(r.present.v).toBe(2);
    expect(canUndo(r)).toBe(false);
  });

  it('a whole drag is one history entry (intermediate states are never committed)', () => {
    const doc = projectWithShapes();
    let h = createHistory(doc);
    const shape = doc.shapes[0]!;
    const drag = { kind: 'vertex' as const, shapeId: shape.id, index: 2, original: shape.points, startWorld: { x: 100, y: 100 } };
    // Many pointer moves only produce previews...
    let preview = shape.points;
    for (let i = 1; i <= 50; i++) preview = dragPoints(drag, { x: 100 + i, y: 100 + i / 2 });
    // ...and a single commit at the end.
    h = commit(h, setShapePoints(h.present, shape.id, preview));
    expect(h.past.length).toBe(1);
    expect(h.present.shapes[0]!.points[2]).toEqual({ x: 150, y: 125 });
    h = undo(h);
    expect(h.present.shapes[0]!.points).toEqual(shape.points);
  });

  it('undo keeps current reference settings and name (they are not artwork edits)', () => {
    const doc = projectWithShapes();
    let h = createHistory(doc);
    h = commit(h, deleteShape(h.present, 'a'));
    h = replacePresent(h, setReference(h.present, { visible: false, opacity: 0.2 }));
    const restored = withNonUndoableFieldsOf(undo(h).present, h.present);
    expect(restored.shapes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(restored.reference.visible).toBe(false);
    expect(restored.reference.opacity).toBe(0.2);
  });
});

describe('document operations', () => {
  it('adds polygons on top with a palette reference', () => {
    const doc = makeProject();
    const next = addPolygon(doc, square(1, 1, 5), doc.palette[2]!.id, 'x');
    expect(next.shapes.at(-1)).toMatchObject({ id: 'x', colorId: doc.palette[2]!.id, type: 'polygon' });
    expect(doc.shapes.length).toBe(0);
  });

  it('refuses invalid polygons and unknown colours', () => {
    const doc = makeProject();
    expect(() => addPolygon(doc, [{ x: 0, y: 0 }, { x: 1, y: 1 }], doc.palette[0]!.id)).toThrow();
    expect(() => addPolygon(doc, square(0, 0, 3), 'nope')).toThrow();
  });

  it('setShapePoints ignores invalid geometry', () => {
    const doc = projectWithShapes();
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(setShapePoints(doc, 'a', bowtie)).toBe(doc);
  });

  it('deletes shapes', () => {
    const doc = projectWithShapes();
    expect(deleteShape(doc, 'b').shapes.map((s) => s.id)).toEqual(['a', 'c']);
    expect(deleteShape(doc, 'zzz')).toBe(doc);
  });

  it('reorders shapes', () => {
    const doc = projectWithShapes();
    const ids = (d: typeof doc) => d.shapes.map((s) => s.id).join('');
    expect(ids(reorderShape(doc, 'a', 'forward'))).toBe('bac');
    expect(ids(reorderShape(doc, 'c', 'backward'))).toBe('acb');
    expect(ids(reorderShape(doc, 'a', 'front'))).toBe('bca');
    expect(ids(reorderShape(doc, 'c', 'back'))).toBe('cab');
    expect(reorderShape(doc, 'c', 'forward')).toBe(doc);
    expect(reorderShape(doc, 'a', 'backward')).toBe(doc);
  });

  it('changes a shape colour to another palette slot', () => {
    const doc = projectWithShapes();
    const next = setShapeColor(doc, 'a', doc.palette[4]!.id);
    expect(next.shapes[0]!.colorId).toBe(doc.palette[4]!.id);
    expect(setShapeColor(doc, 'a', 'missing')).toBe(doc);
  });

  it('editing a palette slot recolours every shape that uses it', () => {
    let doc = projectWithShapes();
    const blue = doc.palette[0]!.id;
    doc = setShapeColor(doc, 'c', blue); // a and c now both use slot 0
    const next = setPaletteColor(doc, blue, '#00FF00');
    expect(next.palette[0]!.hex).toBe('#00ff00');
    const colors = new Map(next.palette.map((c) => [c.id, c.hex]));
    expect(next.shapes.filter((s) => colors.get(s.colorId) === '#00ff00').map((s) => s.id)).toEqual(['a', 'c']);
    expect(setPaletteColor(doc, blue, 'not a colour')).toBe(doc);
  });

  it('clamps reference opacity', () => {
    const doc = makeProject();
    expect(setReference(doc, { opacity: 3 }).reference.opacity).toBe(1);
    expect(setReference(doc, { opacity: -1 }).reference.opacity).toBe(0);
  });
});
