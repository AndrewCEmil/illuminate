import type { ArtworkProject } from '../data/models';
import { MIN_SUPPORTED_SCHEMA_VERSION, SCHEMA_VERSION, newId } from '../data/models';
import { ValidationError, validateProject } from '../data/validation';

export const BACKUP_FORMAT = 'geometric-manuscript-project';

export type ProjectBackup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  project: ArtworkProject;
  referenceImage: {
    mimeType: string;
    dataUrl: string;
  };
};

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match || !match[2]) throw new ValidationError('referenceImage.dataUrl: expected a base64 data URL');
  let binary: string;
  try {
    binary = atob(match[3]!);
  } catch {
    throw new ValidationError('referenceImage.dataUrl: invalid base64');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] ?? 'application/octet-stream' });
}

export async function createBackup(project: ArtworkProject, image: Blob): Promise<ProjectBackup> {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: validateProject(project),
    referenceImage: { mimeType: image.type || 'application/octet-stream', dataUrl: await blobToDataUrl(image) },
  };
}

export function serializeBackup(backup: ProjectBackup): string {
  return JSON.stringify(backup);
}

export type RestoredBackup = { project: ArtworkProject; image: Blob };

/**
 * Parses and validates a backup file. The returned project gets fresh project
 * and image IDs so importing never overwrites an existing local project.
 */
export function parseBackup(text: string, now = new Date()): RestoredBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError('This file is not valid JSON');
  }
  if (!raw || typeof raw !== 'object') throw new ValidationError('Backup must be a JSON object');
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) throw new ValidationError('Not a Geometric Manuscript project backup');
  const version = o.schemaVersion;
  if (typeof version !== 'number' || version < MIN_SUPPORTED_SCHEMA_VERSION || version > SCHEMA_VERSION) {
    throw new ValidationError(`Unsupported backup version ${String(o.schemaVersion)}`);
  }
  const project = validateProject(o.project);
  const ref = o.referenceImage as Record<string, unknown> | undefined;
  if (!ref || typeof ref.dataUrl !== 'string') throw new ValidationError('referenceImage: missing image data');
  const image = dataUrlToBlob(ref.dataUrl);
  if (image.size === 0) throw new ValidationError('referenceImage: empty image');

  const imageId = newId('img');
  const stamp = now.toISOString();
  return {
    project: {
      ...project,
      id: newId('prj'),
      createdAt: stamp,
      updatedAt: stamp,
      reference: { ...project.reference, id: imageId },
    },
    image,
  };
}
