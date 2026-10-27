import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, closeDB } from '../src/data/database';
import {
  createProject,
  deleteProject,
  getLastProjectId,
  listProjects,
  loadImage,
  loadProject,
  loadViewport,
  renameProject,
  saveProject,
  saveViewport,
  setLastProjectId,
  thumbKey,
} from '../src/data/projectRepository';
import { SCHEMA_VERSION } from '../src/data/models';
import { ValidationError, validateProject } from '../src/data/validation';
import { addPolygon } from '../src/editor/documentOps';
import { BACKUP_FORMAT, createBackup, parseBackup, serializeBackup } from '../src/export/projectBackup';
import { makeProject, projectWithShapes, square } from './helpers';

const imageBlob = (fill = 1) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, fill, 2, 3, 4])], { type: 'image/png' });

async function resetDB() {
  await closeDB();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function withId(id: string, imageId: string) {
  const p = projectWithShapes();
  return { ...p, id, reference: { ...p.reference, id: imageId } };
}

describe('persistence', () => {
  beforeEach(resetDB);
  afterEach(closeDB);

  it('saves and reloads a project exactly', async () => {
    const p = withId('p1', 'i1');
    await createProject(p, imageBlob());
    expect(await loadProject('p1')).toEqual(p);
    const edited = addPolygon(p, square(500, 500, 20), p.palette[3]!.id, 'new');
    await saveProject(edited);
    expect((await loadProject('p1'))!.shapes.map((s) => s.id)).toEqual(['a', 'b', 'c', 'new']);
  });

  it('persists the reference image blob', async () => {
    await createProject(withId('p1', 'i1'), imageBlob(9), imageBlob(5));
    const img = await loadImage('i1');
    expect(img).not.toBeNull();
    expect(new Uint8Array(await img!.arrayBuffer())[4]).toBe(9);
    expect(new Uint8Array(await (await loadImage(thumbKey('i1')))!.arrayBuffer())[4]).toBe(5);
  });

  it('keeps multiple projects independent and lists newest first', async () => {
    const a = { ...withId('pa', 'ia'), updatedAt: '2026-01-01T00:00:00.000Z', name: 'A' };
    const b = { ...withId('pb', 'ib'), updatedAt: '2026-02-01T00:00:00.000Z', name: 'B' };
    await createProject(a, imageBlob(1));
    await createProject(b, imageBlob(2));
    await saveProject({ ...a, shapes: [] });
    const { projects } = await listProjects();
    expect(projects.map((p) => p.name)).toEqual(['B', 'A']);
    expect((await loadProject('pb'))!.shapes.length).toBe(3);
    expect((await loadProject('pa'))!.shapes.length).toBe(0);
  });

  it('deletes a project with its image, thumbnail and settings', async () => {
    await createProject(withId('p1', 'i1'), imageBlob(), imageBlob());
    await createProject(withId('p2', 'i2'), imageBlob());
    await saveViewport('p1', { x: 1, y: 2, scale: 3 });
    await setLastProjectId('p1');
    await deleteProject('p1');
    expect(await loadProject('p1')).toBeNull();
    expect(await loadImage('i1')).toBeNull();
    expect(await loadImage(thumbKey('i1'))).toBeNull();
    expect(await loadViewport('p1')).toBeNull();
    expect(await getLastProjectId()).toBeNull();
    expect(await loadProject('p2')).not.toBeNull();
    expect(await loadImage('i2')).not.toBeNull();
  });

  it('stores per-project viewport and last-opened project', async () => {
    await saveViewport('p1', { x: 10, y: -5, scale: 1.5 });
    expect(await loadViewport('p1')).toEqual({ x: 10, y: -5, scale: 1.5 });
    await setLastProjectId('p1');
    expect(await getLastProjectId()).toBe('p1');
  });

  it('renames', async () => {
    await createProject(withId('p1', 'i1'), imageBlob());
    await renameProject('p1', '  Saint Michael  ');
    expect((await loadProject('p1'))!.name).toBe('Saint Michael');
  });

  it('refuses to store invalid documents', async () => {
    const bad = withId('p1', 'i1');
    bad.shapes[0] = { ...bad.shapes[0]!, type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } as never;
    await expect(saveProject(bad)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('validation', () => {
  it('accepts a valid project and strips unknown fields', () => {
    const p = { ...projectWithShapes(), extra: 'x' };
    expect(validateProject(p)).not.toHaveProperty('extra');
  });

  it.each([
    ['wrong schema', (p: any) => (p.schemaVersion = 99)],
    ['non-finite point', (p: any) => (p.shapes[0].points[0].x = Infinity)],
    ['dangling colour reference', (p: any) => (p.shapes[0].colorId = 'missing')],
    ['too few points', (p: any) => p.shapes[0].points.splice(0, 2)],
    ['self intersecting', (p: any) => (p.shapes[0].points = [{ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 9, y: 0 }, { x: 0, y: 9 }])],
    ['duplicate shape ids', (p: any) => (p.shapes[1].id = p.shapes[0].id)],
    ['zero width', (p: any) => (p.width = 0)],
    ['bad hex', (p: any) => (p.palette[0].hex = 'blue')],
    ['bad opacity', (p: any) => (p.reference.opacity = 2)],
  ])('rejects %s', (_name, mutate) => {
    const p = structuredClone(projectWithShapes());
    mutate(p);
    expect(() => validateProject(p)).toThrow(ValidationError);
  });
});

describe('project backup', () => {
  beforeEach(resetDB);
  afterEach(closeDB);

  it('round-trips a project and its image, as a new independent project', async () => {
    const original = projectWithShapes();
    const img = imageBlob(42);
    const text = serializeBackup(await createBackup(original, img));
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);

    const restored = parseBackup(text);
    expect(restored.project.id).not.toBe(original.id);
    expect(restored.project.reference.id).not.toBe(original.reference.id);
    expect(restored.project.shapes).toEqual(original.shapes);
    expect(restored.project.palette).toEqual(original.palette);
    expect(restored.image.type).toBe('image/png');
    expect(new Uint8Array(await restored.image.arrayBuffer())).toEqual(new Uint8Array(await img.arrayBuffer()));

    // It can be stored alongside the original without overwriting it.
    await createProject(original, img);
    await createProject(restored.project, restored.image);
    expect((await listProjects()).projects.length).toBe(2);
    expect(await loadImage(restored.project.reference.id)).not.toBeNull();
  });

  it.each([
    ['not JSON', '{nope'],
    ['wrong format', JSON.stringify({ format: 'other', schemaVersion: 1 })],
    ['future version', JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 999 })],
  ])('rejects %s', (_n, text) => {
    expect(() => parseBackup(text)).toThrow(ValidationError);
  });

  it('rejects a backup with a corrupt project or image', async () => {
    const good = JSON.parse(serializeBackup(await createBackup(makeProject(), imageBlob())));
    const badProject = structuredClone(good);
    badProject.project.shapes = [{ id: 'x', type: 'polygon', points: [], colorId: 'nope' }];
    expect(() => parseBackup(JSON.stringify(badProject))).toThrow(ValidationError);
    const badImage = structuredClone(good);
    badImage.referenceImage.dataUrl = 'data:image/png;base64,@@@';
    expect(() => parseBackup(JSON.stringify(badImage))).toThrow(ValidationError);
    const noImage = structuredClone(good);
    delete noImage.referenceImage;
    expect(() => parseBackup(JSON.stringify(noImage))).toThrow(ValidationError);
  });
});
