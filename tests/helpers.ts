import type { ArtworkProject, Point, Shape } from '../src/data/models';
import { createProjectDocument } from '../src/data/models';
import { addPolygon } from '../src/editor/documentOps';

export const square = (x: number, y: number, s: number): Point[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

export function makeProject(width = 1000, height = 800): ArtworkProject {
  return createProjectDocument({ name: 'Test', imageId: 'img_test', width, height, now: new Date('2026-01-01T00:00:00Z') });
}

export function projectWithShapes(): ArtworkProject {
  let doc = makeProject();
  const [blue, red, gold] = doc.palette;
  doc = addPolygon(doc, square(0, 0, 100), blue!.id, 'a');
  doc = addPolygon(doc, square(50, 50, 100), red!.id, 'b');
  doc = addPolygon(doc, [{ x: 300, y: 300 }, { x: 400, y: 300 }, { x: 350, y: 380 }], gold!.id, 'c');
  return doc;
}

/** Points of a polygon shape (fails the test if it isn't one). */
export function pts(shape: Shape | undefined): Point[] {
  if (!shape || shape.type !== 'polygon') throw new Error('expected a polygon');
  return shape.points;
}
