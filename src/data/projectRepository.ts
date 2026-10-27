import { getDB } from './database';
import type { ArtworkProject } from './models';
import { validateProject } from './validation';
import type { Viewport } from '../editor/viewport';
import { isValidViewport } from '../editor/viewport';

/**
 * Persistence API. The editor never talks to IndexedDB directly.
 * Images live in their own store, keyed by ReferenceImage.id; a small
 * thumbnail for the project list is stored under `${imageId}:thumb`.
 */

const LAST_PROJECT_KEY = 'lastProjectId';
const viewportKey = (projectId: string) => `viewport:${projectId}`;
export const thumbKey = (imageId: string) => `${imageId}:thumb`;

export type ProjectListing = {
  projects: ArtworkProject[];
  /** Number of stored records that failed validation and were skipped. */
  invalidCount: number;
};

export async function listProjects(): Promise<ProjectListing> {
  const db = await getDB();
  const raw = await db.getAll('projects');
  const projects: ArtworkProject[] = [];
  let invalidCount = 0;
  for (const r of raw) {
    try {
      projects.push(validateProject(r));
    } catch (err) {
      invalidCount++;
      console.error('Skipping invalid stored project', err);
    }
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projects, invalidCount };
}

/** Stores a new project together with its reference image (and optional thumbnail) atomically. */
export async function createProject(project: ArtworkProject, image: Blob, thumbnail?: Blob): Promise<ArtworkProject> {
  const valid = validateProject(project);
  const db = await getDB();
  const tx = db.transaction(['projects', 'images'], 'readwrite');
  await Promise.all([
    tx.objectStore('images').put({ id: valid.reference.id, blob: image }),
    thumbnail ? tx.objectStore('images').put({ id: thumbKey(valid.reference.id), blob: thumbnail }) : Promise.resolve(),
    tx.objectStore('projects').add(valid),
    tx.done,
  ]);
  return valid;
}

/** Loads and validates a project. Returns null if it doesn't exist; throws if it is corrupt. */
export async function loadProject(id: string): Promise<ArtworkProject | null> {
  const db = await getDB();
  const raw = await db.get('projects', id);
  return raw ? validateProject(raw) : null;
}

export async function saveProject(project: ArtworkProject): Promise<void> {
  const valid = validateProject(project);
  const db = await getDB();
  await db.put('projects', valid);
}

export async function renameProject(id: string, name: string): Promise<ArtworkProject | null> {
  const db = await getDB();
  const tx = db.transaction('projects', 'readwrite');
  const raw = await tx.store.get(id);
  if (!raw) {
    await tx.done;
    return null;
  }
  const updated = { ...raw, name: name.trim() || 'Untitled', updatedAt: new Date().toISOString() };
  await tx.store.put(updated);
  await tx.done;
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'images', 'settings'], 'readwrite');
  const project = await tx.objectStore('projects').get(id);
  const ops: Promise<unknown>[] = [tx.objectStore('projects').delete(id), tx.objectStore('settings').delete(viewportKey(id))];
  if (project?.reference?.id) {
    ops.push(tx.objectStore('images').delete(project.reference.id));
    ops.push(tx.objectStore('images').delete(thumbKey(project.reference.id)));
  }
  const last = await tx.objectStore('settings').get(LAST_PROJECT_KEY);
  if (last === id) ops.push(tx.objectStore('settings').delete(LAST_PROJECT_KEY));
  await Promise.all([...ops, tx.done]);
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('images', { id, blob });
}

export async function loadImage(id: string): Promise<Blob | null> {
  const db = await getDB();
  const rec = await db.get('images', id);
  return rec?.blob ?? null;
}

export async function getLastProjectId(): Promise<string | null> {
  const db = await getDB();
  const v = await db.get('settings', LAST_PROJECT_KEY);
  return typeof v === 'string' ? v : null;
}

export async function setLastProjectId(id: string | null): Promise<void> {
  const db = await getDB();
  if (id) await db.put('settings', id, LAST_PROJECT_KEY);
  else await db.delete('settings', LAST_PROJECT_KEY);
}

export async function loadViewport(projectId: string): Promise<Viewport | null> {
  const db = await getDB();
  const v = await db.get('settings', viewportKey(projectId));
  return isValidViewport(v) ? v : null;
}

export async function saveViewport(projectId: string, viewport: Viewport): Promise<void> {
  const db = await getDB();
  await db.put('settings', { x: viewport.x, y: viewport.y, scale: viewport.scale }, viewportKey(projectId));
}

const ARTWORK_OPACITY_KEY = 'artworkOpacity';
export const DEFAULT_ARTWORK_OPACITY = 0.75;

/** On-screen artwork opacity while tracing (an app-wide preference, never exported). */
export async function loadArtworkOpacity(): Promise<number> {
  const db = await getDB();
  const v = await db.get('settings', ARTWORK_OPACITY_KEY);
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : DEFAULT_ARTWORK_OPACITY;
}

export async function saveArtworkOpacity(opacity: number): Promise<void> {
  const db = await getDB();
  await db.put('settings', Math.min(1, Math.max(0, opacity)), ARTWORK_OPACITY_KEY);
}

/** Asks the browser not to evict our storage under pressure. Best-effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
