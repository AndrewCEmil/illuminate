import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import type { CircleShape } from '../src/data/models';
import { SCHEMA_VERSION } from '../src/data/models';
import { ValidationError, validateProject } from '../src/data/validation';
import { addCircle, toggleRing, updateShapeGeometry } from '../src/editor/documentOps';
import { hitShape } from '../src/editor/hitTesting';
import { beginShapeDrag, circleBigEnough, circleFromDrag, circleTap, dragShape, tapSelect } from '../src/editor/interactions';
import { MIN_RADIUS, circleThrough, isValidCircle, shapeContains, shapeHandles } from '../src/editor/shapes';
import { worldToScreen } from '../src/editor/viewport';
import { drawArtwork } from '../src/export/pngExport';
import { BACKUP_FORMAT, parseBackup } from '../src/export/projectBackup';
import { exportSvg } from '../src/export/svgExport';
import { makeProject, projectWithShapes } from './helpers';

const vp = { x: 0, y: 0, scale: 1 };
const s = (x: number, y: number) => worldToScreen({ x, y }, vp);

function withCircles() {
  let doc = projectWithShapes();
  doc = addCircle(doc, { cx: 500, cy: 400, radius: 100 }, doc.palette[2]!.id, 'disc');
  doc = addCircle(doc, { cx: 800, cy: 400, radius: 100, innerRadius: 60 }, doc.palette[3]!.id, 'ring');
  return doc;
}
const circle = (doc: ReturnType<typeof withCircles>, id: string) => doc.shapes.find((x) => x.id === id) as CircleShape;

describe('circle geometry', () => {
  it('finds the circle through three rim points', () => {
    const c = circleThrough({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 })!;
    expect(c.cx).toBeCloseTo(0);
    expect(c.cy).toBeCloseTo(0);
    expect(c.radius).toBeCloseTo(10);
  });

  it('rejects collinear rim points', () => {
    expect(circleThrough({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 })).toBeNull();
    expect(circleThrough({ x: 0, y: 0 }, { x: 50, y: 0.0001 }, { x: 100, y: 0 })).toBeNull();
  });

  it('validates radii', () => {
    expect(isValidCircle({ cx: 0, cy: 0, radius: 10, innerRadius: 0 })).toBe(true);
    expect(isValidCircle({ cx: 0, cy: 0, radius: 10, innerRadius: 6 })).toBe(true);
    expect(isValidCircle({ cx: 0, cy: 0, radius: 10, innerRadius: 10 })).toBe(false);
    expect(isValidCircle({ cx: 0, cy: 0, radius: 0.1, innerRadius: 0 })).toBe(false);
    expect(isValidCircle({ cx: NaN, cy: 0, radius: 10, innerRadius: 0 })).toBe(false);
  });

  it('a ring hole is not part of the shape, so taps there reach what is beneath', () => {
    let doc = withCircles();
    expect(shapeContains(circle(doc, 'ring'), { x: 800, y: 400 })).toBe(false);
    expect(shapeContains(circle(doc, 'ring'), { x: 880, y: 400 })).toBe(true);
    expect(hitShape(doc, { x: 500, y: 400 })?.id).toBe('disc');
    doc = addCircle(doc, { cx: 500, cy: 400, radius: 50, innerRadius: 40 }, doc.palette[0]!.id, 'small-ring');
    expect(hitShape(doc, { x: 500, y: 400 })?.id).toBe('disc'); // through the hole
    expect(hitShape(doc, { x: 545, y: 400 })?.id).toBe('small-ring');
  });

  it('has centre and radius handles (inner only for rings)', () => {
    const doc = withCircles();
    expect(shapeHandles(circle(doc, 'disc')).map((h) => h.kind)).toEqual(['center', 'outer']);
    expect(shapeHandles(circle(doc, 'ring')).map((h) => [h.kind, h.point])).toEqual([
      ['center', { x: 800, y: 400 }],
      ['outer', { x: 900, y: 400 }],
      ['inner', { x: 740, y: 400 }],
    ]);
  });
});

describe('circle tool', () => {
  it('creates a circle after three rim taps', () => {
    let r = circleTap([], s(110, 100), vp);
    expect(r.kind).toBe('add');
    r = circleTap(r.kind === 'add' ? r.rim : [], s(100, 110), vp);
    expect(r.kind).toBe('add');
    r = circleTap(r.kind === 'add' ? r.rim : [], s(90, 100), vp);
    expect(r.kind).toBe('create');
    if (r.kind === 'create') {
      expect(r.circle.cx).toBeCloseTo(100);
      expect(r.circle.cy).toBeCloseTo(100);
      expect(r.circle.radius).toBeCloseTo(10);
    }
  });

  it('ignores a repeated tap and rejects a straight line', () => {
    expect(circleTap([{ x: 0, y: 0 }], s(3, 3), vp).kind).toBe('ignore');
    expect(circleTap([{ x: 0, y: 0 }, { x: 50, y: 0 }], s(100, 0), vp).kind).toBe('reject');
  });

  it('drag from centre sets the radius; tiny drags are ignored', () => {
    expect(circleFromDrag({ x: 10, y: 10 }, { x: 13, y: 14 })).toEqual({ cx: 10, cy: 10, radius: 5 });
    expect(circleBigEnough(3, { x: 0, y: 0, scale: 1 })).toBe(false);
    expect(circleBigEnough(3, { x: 0, y: 0, scale: 4 })).toBe(true);
  });
});

describe('editing circles', () => {
  it('drags the outer radius handle without jumping', () => {
    const doc = withCircles();
    const drag = beginShapeDrag(doc, 'disc', s(602, 401), vp)!;
    expect(drag.kind).toBe('radius');
    expect(dragShape(drag, drag.startWorld)).toEqual(circle(doc, 'disc'));
    const bigger = dragShape(drag, { x: drag.startWorld.x + 30, y: drag.startWorld.y }) as CircleShape;
    expect(bigger.radius).toBeCloseTo(130);
    expect(bigger.cx).toBe(500);
  });

  it('keeps the outer edge outside the hole, and the hole inside the edge', () => {
    const doc = withCircles();
    const outer = beginShapeDrag(doc, 'ring', s(900, 400), vp)!;
    const shrunk = dragShape(outer, { x: 750, y: 400 }) as CircleShape;
    expect(shrunk.radius).toBeCloseTo(60 + MIN_RADIUS);
    expect(isValidCircle(shrunk)).toBe(true);
    const inner = beginShapeDrag(doc, 'ring', s(740, 400), vp)!;
    expect(inner).toMatchObject({ kind: 'radius', which: 'inner' });
    const grown = dragShape(inner, { x: 650, y: 400 }) as CircleShape;
    expect(grown.innerRadius).toBeCloseTo(100 - MIN_RADIUS);
    expect(isValidCircle(grown)).toBe(true);
  });

  it('dragging the centre handle or body moves the circle', () => {
    const doc = withCircles();
    const viaCentre = beginShapeDrag(doc, 'disc', s(500, 400), vp)!;
    expect(viaCentre.kind).toBe('move');
    expect(dragShape(viaCentre, { x: 510, y: 380 })).toMatchObject({ cx: 510, cy: 380, radius: 100 });
    const viaBody = beginShapeDrag(doc, null, s(540, 440), vp)!;
    expect(viaBody).toMatchObject({ kind: 'move', shapeId: 'disc' });
  });

  it('taps select circles and rings by their painted area', () => {
    const doc = withCircles();
    expect(tapSelect(doc, null, s(500, 400), vp)).toBe('disc');
    expect(tapSelect(doc, null, s(800, 400), vp)).toBeNull(); // ring hole, nothing beneath
    expect(tapSelect(doc, null, s(885, 400), vp)).toBe('ring');
  });

  it('toggles between solid circle and ring', () => {
    let doc = withCircles();
    doc = toggleRing(doc, 'disc');
    expect(circle(doc, 'disc').innerRadius).toBeCloseTo(60);
    doc = toggleRing(doc, 'disc');
    expect(circle(doc, 'disc').innerRadius).toBe(0);
    expect(toggleRing(doc, 'a')).toBe(doc); // polygons are unaffected
  });

  it('refuses invalid geometry updates', () => {
    const doc = withCircles();
    expect(updateShapeGeometry(doc, { ...circle(doc, 'ring'), innerRadius: 150 })).toBe(doc);
  });
});

describe('circle export', () => {
  function parse(svg: string) {
    const d = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
    expect(d.querySelector('parsererror')).toBeNull();
    return d;
  }

  it('writes discs as <circle> and rings as an even-odd <path>, in stacking order', () => {
    const doc = withCircles();
    const svg = parse(exportSvg(doc));
    const els = [...svg.documentElement.children].filter((e) => e.tagName !== 'title');
    expect(els.map((e) => `${e.tagName}#${e.getAttribute('id')}`)).toEqual(['polygon#a', 'polygon#b', 'polygon#c', 'circle#disc', 'path#ring']);
    const disc = svg.querySelector('circle')!;
    expect([disc.getAttribute('cx'), disc.getAttribute('cy'), disc.getAttribute('r')]).toEqual(['500', '400', '100']);
    expect(disc.getAttribute('fill')).toBe(doc.palette[2]!.hex);
    const ring = svg.querySelector('path')!;
    expect(ring.getAttribute('fill-rule')).toBe('evenodd');
    expect(ring.getAttribute('fill')).toBe(doc.palette[3]!.hex);
    expect(ring.getAttribute('d')).toBe('M900 400A100 100 0 1 0 700 400A100 100 0 1 0 900 400ZM860 400A60 60 0 1 0 740 400A60 60 0 1 0 860 400Z');
  });

  it('exports are fully opaque (on-screen see-through is never written out)', () => {
    expect(exportSvg(withCircles())).not.toMatch(/opacity/);
  });

  it('PNG draws rings with the even-odd rule', () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '',
      setTransform: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: (x: number, y: number, r: number) => calls.push(`arc ${x},${y},${r}`),
      closePath: () => {},
      fill: (rule?: string) => calls.push(`fill ${rule ?? 'nonzero'}`),
    };
    drawArtwork(ctx as never, withCircles(), 1);
    expect(calls.slice(-5)).toEqual(['arc 500,400,100', 'fill evenodd', 'arc 800,400,100', 'arc 800,400,60', 'fill evenodd']);
  });
});

describe('schema versions', () => {
  it('upgrades a version 1 (polygon-only) project to the current version', () => {
    const v1 = { ...projectWithShapes(), schemaVersion: 1 };
    const upgraded = validateProject(v1);
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.shapes).toEqual(v1.shapes);
  });

  it('round-trips circles and rings through validation', () => {
    const doc = withCircles();
    expect(validateProject(structuredClone(doc))).toEqual(doc);
  });

  it('rejects circles in a version 1 document, bad radii, and unknown types', () => {
    const doc = withCircles();
    expect(() => validateProject({ ...structuredClone(doc), schemaVersion: 1 })).toThrow(ValidationError);
    const bad = structuredClone(doc);
    (bad.shapes[4] as CircleShape).innerRadius = 120;
    expect(() => validateProject(bad)).toThrow(ValidationError);
    const unknown = structuredClone(doc) as unknown as { shapes: { type: string }[] };
    unknown.shapes[0]!.type = 'bezier';
    expect(() => validateProject(unknown)).toThrow(ValidationError);
    expect(() => validateProject({ ...structuredClone(doc), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(ValidationError);
  });

  it('still imports version 1 backups', () => {
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      project: { ...makeProject(), schemaVersion: 1 },
      referenceImage: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    });
    expect(parseBackup(text).project.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
