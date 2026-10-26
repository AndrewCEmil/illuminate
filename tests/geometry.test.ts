import { describe, expect, it } from 'vitest';
import {
  bounds,
  distanceToSegment,
  isSimplePolygon,
  moveVertex,
  pointInPolygon,
  polygonArea,
  polygonProblem,
  segmentsIntersect,
  translatePoints,
  wouldSelfIntersect,
} from '../src/editor/geometry';
import { hitShape, hitVertex } from '../src/editor/hitTesting';
import { projectWithShapes, square } from './helpers';

describe('geometry', () => {
  it('computes area and bounds', () => {
    expect(polygonArea(square(10, 10, 5))).toBe(25);
    expect(bounds([{ x: 3, y: -1 }, { x: -2, y: 7 }, { x: 0, y: 0 }])).toEqual({ minX: -2, minY: -1, maxX: 3, maxY: 7 });
  });

  it('translates polygons and moves single vertices immutably', () => {
    const sq = square(0, 0, 10);
    expect(translatePoints(sq, 5, -2)[2]).toEqual({ x: 15, y: 8 });
    const moved = moveVertex(sq, 1, { x: 20, y: 1 });
    expect(moved[1]).toEqual({ x: 20, y: 1 });
    expect(moved[0]).toBe(sq[0]);
    expect(sq[1]).toEqual({ x: 10, y: 0 });
  });

  it('detects segment intersections, including touching', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true);
  });

  it('accepts convex and concave simple polygons', () => {
    expect(polygonProblem(square(0, 0, 10))).toBeNull();
    const concave = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 3 }, { x: 0, y: 10 }];
    expect(isSimplePolygon(concave)).toBe(true);
    expect(polygonProblem(concave)).toBeNull();
  });

  it('rejects degenerate and self-intersecting polygons', () => {
    expect(polygonProblem([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe('too-few-points');
    expect(polygonProblem([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }])).toBe('duplicate-points');
    expect(polygonProblem([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }])).toBe('zero-area');
    expect(polygonProblem([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe('self-intersecting');
    expect(polygonProblem([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 3, y: 0 }])).toBe('non-finite');
  });

  it('rejects polygons where a vertex touches a non-adjacent edge', () => {
    // vertex 4 lies exactly on edge 0-1
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 0 }, { x: 0, y: 10 }];
    expect(isSimplePolygon(pts)).toBe(false);
  });

  it('predicts self-intersection when appending a draft vertex', () => {
    const chain = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(wouldSelfIntersect(chain, { x: 0, y: 10 })).toBe(false);
    expect(wouldSelfIntersect(chain, { x: 5, y: -5 })).toBe(true);
    // folding straight back over the previous edge
    expect(wouldSelfIntersect(chain, { x: 10, y: 5 })).toBe(true);
  });

  it('point in polygon and distance to segment', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square(0, 0, 10))).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square(0, 0, 10))).toBe(false);
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
});

describe('hit testing', () => {
  it('selects the topmost shape under a point', () => {
    const doc = projectWithShapes();
    expect(hitShape(doc, { x: 75, y: 75 })?.id).toBe('b'); // overlap: b is above a
    expect(hitShape(doc, { x: 10, y: 10 })?.id).toBe('a');
    expect(hitShape(doc, { x: 900, y: 700 })).toBeNull();
  });

  it('hits vertices within a constant screen radius regardless of zoom', () => {
    const pts = square(100, 100, 50);
    // At scale 10, world distance 2 = 20 screen px (inside 22px); at scale 20 it is 40px (outside).
    const near = { x: 102, y: 100 };
    expect(hitVertex(pts, { x: near.x * 10, y: near.y * 10 }, { x: 0, y: 0, scale: 10 })).toBe(0);
    expect(hitVertex(pts, { x: near.x * 20, y: near.y * 20 }, { x: 0, y: 0, scale: 20 })).toBeNull();
  });

  it('picks the nearest vertex when several are in range', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }];
    expect(hitVertex(pts, { x: 2.6, y: 0.1 }, { x: 0, y: 0, scale: 1 })).toBe(1);
  });
});
