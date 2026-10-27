import type { ArtworkProject, CircleShape, PaletteColor, Point, PolygonShape, ReferenceImage, Shape } from '../data/models';
import { newId } from '../data/models';
import { DEFAULT_RING_RATIO, MIN_RADIUS, isValidShape, sameGeometry } from './shapes';

/**
 * Pure, immutable operations on the artwork document. Each returns a new
 * document, or the same instance when nothing changed (so history can skip it).
 */

/** Adds a shape on top of the stack. Throws on invalid geometry or an unknown colour. */
export function addShape(doc: ArtworkProject, shape: Shape): ArtworkProject {
  if (!isValidShape(shape)) throw new Error('Refusing to add an invalid shape');
  if (!doc.palette.some((c) => c.id === shape.colorId)) throw new Error(`Unknown palette colour ${shape.colorId}`);
  return { ...doc, shapes: [...doc.shapes, shape] };
}

export function addPolygon(doc: ArtworkProject, points: Point[], colorId: string, id = newId('shp')): ArtworkProject {
  const shape: PolygonShape = { id, type: 'polygon', points: points.map((p) => ({ x: p.x, y: p.y })), colorId };
  return addShape(doc, shape);
}

export function addCircle(
  doc: ArtworkProject,
  circle: { cx: number; cy: number; radius: number; innerRadius?: number },
  colorId: string,
  id = newId('shp'),
): ArtworkProject {
  const shape: CircleShape = { id, type: 'circle', cx: circle.cx, cy: circle.cy, radius: circle.radius, innerRadius: circle.innerRadius ?? 0, colorId };
  return addShape(doc, shape);
}

/**
 * Replaces a shape's geometry (same id, type and colour). Invalid geometry or
 * an unchanged shape returns the document unchanged.
 */
export function updateShapeGeometry(doc: ArtworkProject, next: Shape): ArtworkProject {
  if (!isValidShape(next)) return doc;
  let changed = false;
  const shapes = doc.shapes.map((s) => {
    if (s.id !== next.id || s.type !== next.type || sameGeometry(s, next)) return s;
    changed = true;
    return { ...next, colorId: s.colorId };
  });
  return changed ? { ...doc, shapes } : doc;
}

export function setShapePoints(doc: ArtworkProject, shapeId: string, points: Point[]): ArtworkProject {
  const shape = doc.shapes.find((s) => s.id === shapeId);
  if (!shape || shape.type !== 'polygon') return doc;
  return updateShapeGeometry(doc, { ...shape, points: points.map((p) => ({ x: p.x, y: p.y })) });
}

/** Turns a solid circle into a ring (with a default hole) or a ring back into a solid circle. */
export function toggleRing(doc: ArtworkProject, shapeId: string): ArtworkProject {
  const shape = doc.shapes.find((s) => s.id === shapeId);
  if (!shape || shape.type !== 'circle') return doc;
  const innerRadius = shape.innerRadius > 0 ? 0 : Math.max(MIN_RADIUS, Math.min(shape.radius * DEFAULT_RING_RATIO, shape.radius - MIN_RADIUS));
  return updateShapeGeometry(doc, { ...shape, innerRadius });
}

export function deleteShape(doc: ArtworkProject, shapeId: string): ArtworkProject {
  const shapes = doc.shapes.filter((s) => s.id !== shapeId);
  return shapes.length === doc.shapes.length ? doc : { ...doc, shapes };
}

export function setShapeColor(doc: ArtworkProject, shapeId: string, colorId: string): ArtworkProject {
  if (!doc.palette.some((c) => c.id === colorId)) return doc;
  let changed = false;
  const shapes = doc.shapes.map((s) => {
    if (s.id !== shapeId || s.colorId === colorId) return s;
    changed = true;
    return { ...s, colorId };
  });
  return changed ? { ...doc, shapes } : doc;
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export function reorderShape(doc: ArtworkProject, shapeId: string, direction: ReorderDirection): ArtworkProject {
  const index = doc.shapes.findIndex((s) => s.id === shapeId);
  if (index < 0) return doc;
  const last = doc.shapes.length - 1;
  let target: number;
  switch (direction) {
    case 'forward':
      target = Math.min(last, index + 1);
      break;
    case 'backward':
      target = Math.max(0, index - 1);
      break;
    case 'front':
      target = last;
      break;
    case 'back':
      target = 0;
      break;
  }
  if (target === index) return doc;
  const shapes = [...doc.shapes];
  const [shape] = shapes.splice(index, 1);
  shapes.splice(target, 0, shape!);
  return { ...doc, shapes };
}

export function shapeIndex(doc: ArtworkProject, shapeId: string): number {
  return doc.shapes.findIndex((s) => s.id === shapeId);
}

export function setPaletteColor(doc: ArtworkProject, colorId: string, hex: string): ArtworkProject {
  const normalized = normalizeHex(hex);
  if (!normalized) return doc;
  let changed = false;
  const palette: PaletteColor[] = doc.palette.map((c) => {
    if (c.id !== colorId || c.hex === normalized) return c;
    changed = true;
    return { ...c, hex: normalized };
  });
  return changed ? { ...doc, palette } : doc;
}

export function setReference(doc: ArtworkProject, patch: Partial<Pick<ReferenceImage, 'opacity' | 'visible'>>): ArtworkProject {
  const opacity = patch.opacity === undefined ? doc.reference.opacity : Math.min(1, Math.max(0, patch.opacity));
  const visible = patch.visible ?? doc.reference.visible;
  if (opacity === doc.reference.opacity && visible === doc.reference.visible) return doc;
  return { ...doc, reference: { ...doc.reference, opacity, visible } };
}

export function renameDocument(doc: ArtworkProject, name: string): ArtworkProject {
  const trimmed = name.trim() || 'Untitled';
  return trimmed === doc.name ? doc : { ...doc, name: trimmed };
}

/**
 * The project name and reference settings are not artwork edits: they are
 * excluded from undo. When restoring a history snapshot, keep the current values.
 */
export function withNonUndoableFieldsOf(snapshot: ArtworkProject, current: ArtworkProject): ArtworkProject {
  if (snapshot.reference === current.reference && snapshot.name === current.name) return snapshot;
  return { ...snapshot, name: current.name, reference: current.reference };
}

export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return null;
}
