import type { ArtworkProject, PaletteColor, Point, ReferenceImage, Shape } from './models';
import { MIN_SUPPORTED_SCHEMA_VERSION, SCHEMA_VERSION } from './models';
import { isValidPolygon } from '../editor/geometry';
import { isValidCircle } from '../editor/shapes';
import { normalizeHex } from '../editor/documentOps';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new ValidationError(`${path}: ${msg}`);
}

function obj(v: unknown, path: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'expected a non-empty string');
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');
  return v;
}

function positive(v: unknown, path: string): number {
  const n = num(v, path);
  if (n <= 0) fail(path, 'expected a positive number');
  return n;
}

function isoDate(v: unknown, path: string): string {
  const s = str(v, path);
  if (Number.isNaN(Date.parse(s))) fail(path, 'expected an ISO date');
  return s;
}

function point(v: unknown, path: string): Point {
  const o = obj(v, path);
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`) };
}

function paletteColor(v: unknown, path: string): PaletteColor {
  const o = obj(v, path);
  const hex = normalizeHex(str(o.hex, `${path}.hex`));
  if (!hex) fail(`${path}.hex`, 'expected #rrggbb');
  return { id: str(o.id, `${path}.id`), name: typeof o.name === 'string' ? o.name : '', hex };
}

function reference(v: unknown, path: string): ReferenceImage {
  const o = obj(v, path);
  const opacity = num(o.opacity, `${path}.opacity`);
  if (opacity < 0 || opacity > 1) fail(`${path}.opacity`, 'expected 0..1');
  if (typeof o.visible !== 'boolean') fail(`${path}.visible`, 'expected boolean');
  return {
    id: str(o.id, `${path}.id`),
    width: positive(o.width, `${path}.width`),
    height: positive(o.height, `${path}.height`),
    opacity,
    visible: o.visible,
  };
}

/**
 * Validates an unknown value as an ArtworkProject, enforcing the geometry
 * invariants. Returns a clean copy containing only known fields.
 */
export function validateProject(value: unknown): ArtworkProject {
  const o = obj(value, 'project');
  const schemaVersion = num(o.schemaVersion, 'project.schemaVersion');
  if (!Number.isInteger(schemaVersion) || schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION || schemaVersion > SCHEMA_VERSION) {
    fail('project.schemaVersion', `unsupported version ${schemaVersion}`);
  }

  if (!Array.isArray(o.palette) || o.palette.length === 0) fail('project.palette', 'expected a non-empty array');
  const palette = o.palette.map((c, i) => paletteColor(c, `project.palette[${i}]`));
  const colorIds = new Set(palette.map((c) => c.id));
  if (colorIds.size !== palette.length) fail('project.palette', 'duplicate colour ids');

  if (!Array.isArray(o.shapes)) fail('project.shapes', 'expected an array');
  const shapeIds = new Set<string>();
  const shapes: Shape[] = o.shapes.map((raw, i) => {
    const path = `project.shapes[${i}]`;
    const s = obj(raw, path);
    const id = str(s.id, `${path}.id`);
    if (shapeIds.has(id)) fail(`${path}.id`, 'duplicate shape id');
    shapeIds.add(id);
    const colorId = str(s.colorId, `${path}.colorId`);
    if (!colorIds.has(colorId)) fail(`${path}.colorId`, 'unknown palette colour');
    if (s.type === 'polygon') {
      if (!Array.isArray(s.points)) fail(`${path}.points`, 'expected an array');
      const points = s.points.map((p, j) => point(p, `${path}.points[${j}]`));
      if (!isValidPolygon(points)) fail(`${path}.points`, 'not a valid simple polygon');
      return { id, type: 'polygon', points, colorId };
    }
    // Circles only exist from schema version 2.
    if (s.type === 'circle' && schemaVersion >= 2) {
      const circle = {
        cx: num(s.cx, `${path}.cx`),
        cy: num(s.cy, `${path}.cy`),
        radius: num(s.radius, `${path}.radius`),
        innerRadius: num(s.innerRadius, `${path}.innerRadius`),
      };
      if (!isValidCircle(circle)) fail(path, 'invalid circle or ring radii');
      return { id, type: 'circle', ...circle, colorId };
    }
    return fail(`${path}.type`, `unknown shape type ${JSON.stringify(s.type)}`);
  });

  return {
    // Older documents are upgraded in memory and saved in the current version.
    schemaVersion: SCHEMA_VERSION,
    id: str(o.id, 'project.id'),
    name: typeof o.name === 'string' ? o.name : 'Untitled',
    createdAt: isoDate(o.createdAt, 'project.createdAt'),
    updatedAt: isoDate(o.updatedAt, 'project.updatedAt'),
    width: positive(o.width, 'project.width'),
    height: positive(o.height, 'project.height'),
    reference: reference(o.reference, 'project.reference'),
    palette,
    shapes,
  };
}
