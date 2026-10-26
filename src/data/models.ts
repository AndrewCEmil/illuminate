/**
 * Persistent document model. Everything here is plain, serialisable data:
 * no DOM objects, no pointer state, no viewport.
 */

export const SCHEMA_VERSION = 1;

export type Point = {
  x: number;
  y: number;
};

export type PolygonShape = {
  id: string;
  type: 'polygon';
  points: Point[];
  /** References a PaletteColor.id, never a raw colour. */
  colorId: string;
};

export type PaletteColor = {
  id: string;
  name: string;
  /** Lowercase #rrggbb. */
  hex: string;
};

export type ReferenceImage = {
  /** Key of the image blob in the `images` store. */
  id: string;
  width: number;
  height: number;
  /** 0..1 */
  opacity: number;
  visible: boolean;
};

export type ArtworkProject = {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  /** World (artwork) dimensions; equal to the processed reference image size. */
  width: number;
  height: number;

  reference: ReferenceImage;
  palette: PaletteColor[];

  /** Array order defines back-to-front stacking. */
  shapes: PolygonShape[];
};

export const DEFAULT_REFERENCE_OPACITY = 0.45;

const DEFAULT_PALETTE: ReadonlyArray<Omit<PaletteColor, 'id'>> = [
  { name: 'Lapis', hex: '#1f3a8a' },
  { name: 'Vermilion', hex: '#d2412c' },
  { name: 'Gold', hex: '#d4a23a' },
  { name: 'Verdigris', hex: '#3f8f85' },
  { name: 'Vellum', hex: '#efe4c8' },
  { name: 'Burgundy', hex: '#7a1f3d' },
];

export function newId(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function createDefaultPalette(): PaletteColor[] {
  return DEFAULT_PALETTE.map((c) => ({ ...c, id: newId('col') }));
}

export function createProjectDocument(args: {
  name: string;
  imageId: string;
  width: number;
  height: number;
  now?: Date;
}): ArtworkProject {
  const now = (args.now ?? new Date()).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    name: args.name,
    createdAt: now,
    updatedAt: now,
    width: args.width,
    height: args.height,
    reference: {
      id: args.imageId,
      width: args.width,
      height: args.height,
      opacity: DEFAULT_REFERENCE_OPACITY,
      visible: true,
    },
    palette: createDefaultPalette(),
    shapes: [],
  };
}

export function paletteLookup(palette: PaletteColor[]): Map<string, string> {
  return new Map(palette.map((c) => [c.id, c.hex]));
}
