import type { ArtworkProject, PaletteColor, Point, PolygonShape, ReferenceImage } from '../data/models';
import { newId } from '../data/models';
import { isValidPolygon } from './geometry';

/**
 * Pure, immutable operations on the artwork document. Each returns a new
 * document, or the same instance when nothing changed (so history can skip it).
 */

export function addPolygon(doc: ArtworkProject, points: Point[], colorId: string, id = newId('shp')): ArtworkProject {
  if (!isValidPolygon(points)) throw new Error('Refusing to add an invalid polygon');
  if (!doc.palette.some((c) => c.id === colorId)) throw new Error(`Unknown palette colour ${colorId}`);
  const shape: PolygonShape = { id, type: 'polygon', points: points.map((p) => ({ x: p.x, y: p.y })), colorId };
  return { ...doc, shapes: [...doc.shapes, shape] };
}

export function setShapePoints(doc: ArtworkProject, shapeId: string, points: Point[]): ArtworkProject {
  if (!isValidPolygon(points)) return doc;
  let changed = false;
  const shapes = doc.shapes.map((s) => {
    if (s.id !== shapeId) return s;
    if (samePoints(s.points, points)) return s;
    changed = true;
    return { ...s, points: points.map((p) => ({ x: p.x, y: p.y })) };
  });
  return changed ? { ...doc, shapes } : doc;
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

function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y);
}
