import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ArtworkProject } from './models';

export const DB_NAME = 'geometric-manuscript-studio';
export const DB_VERSION = 1;

/** Stored image record. Blobs are stored natively; IndexedDB handles them efficiently. */
export type StoredImage = { id: string; blob: Blob };

export interface StudioDB extends DBSchema {
  projects: { key: string; value: ArtworkProject };
  images: { key: string; value: StoredImage };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<StudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('images', { keyPath: 'id' });
          db.createObjectStore('settings');
        }
        // Future schema migrations go here, keyed on oldVersion.
      },
      blocking() {
        // A newer app version wants to upgrade: release our connection.
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    }).catch((err: unknown) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection (after deleting the database). */
export async function closeDB(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}
