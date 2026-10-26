/** Decodes, orients and downsamples a user-chosen reference image, entirely locally. */

export const MAX_REFERENCE_DIMENSION = 2560;
export const THUMBNAIL_DIMENSION = 320;

export type ProcessedImage = {
  blob: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};

export class ImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageImportError';
  }
}

export function scaledSize(width: number, height: number, maxDim: number): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    // 'from-image' applies EXIF orientation (the default in current browsers; explicit for clarity).
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageImportError('Couldn’t read that image. Try a JPEG, PNG or WebP file.');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(source: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageImportError('Canvas is not available in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  // WebP keeps alpha and is compact; fall back to PNG where WebP encoding is unsupported.
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  const png = await canvasToBlob(canvas, 'image/png', 1);
  if (!png) throw new ImageImportError('Couldn’t process that image (it may be too large).');
  return png;
}

export async function processReferenceImage(file: Blob): Promise<ProcessedImage> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new ImageImportError('That file isn’t an image.');
  }
  const bitmap = await decode(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ImageImportError('That image is empty.');
    const size = scaledSize(bitmap.width, bitmap.height, MAX_REFERENCE_DIMENSION);
    const thumbSize = scaledSize(bitmap.width, bitmap.height, THUMBNAIL_DIMENSION);
    const blob = await encode(bitmap, size.width, size.height, 0.9);
    const thumbnail = await encode(bitmap, thumbSize.width, thumbSize.height, 0.8);
    return { blob, thumbnail, width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}

/** Regenerates a thumbnail from an already-processed image (used when restoring backups). */
export async function makeThumbnail(image: Blob): Promise<Blob | undefined> {
  try {
    const bitmap = await createImageBitmap(image);
    try {
      const s = scaledSize(bitmap.width, bitmap.height, THUMBNAIL_DIMENSION);
      return await encode(bitmap, s.width, s.height, 0.8);
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

export function nameFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.slice(0, 60) || 'Untitled';
}
