import type { ArtworkProject } from '../data/models';
import { paletteLookup } from '../data/models';

/** Conservative limit that works on typical Android Chrome canvases. */
export const MAX_PNG_PIXELS = 16_000_000;

export function pngSize(project: ArtworkProject, scale: number): { width: number; height: number; scale: number } {
  let s = scale;
  if (project.width * project.height * s * s > MAX_PNG_PIXELS) {
    s = Math.sqrt(MAX_PNG_PIXELS / (project.width * project.height));
  }
  return { width: Math.max(1, Math.round(project.width * s)), height: Math.max(1, Math.round(project.height * s)), scale: s };
}

/** Minimal subset of CanvasRenderingContext2D used for drawing, so it can be tested with a fake. */
export type DrawContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'closePath' | 'fill' | 'fillRect' | 'setTransform'> & {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
};

export function drawArtwork(ctx: DrawContext, project: ArtworkProject, scale: number, background?: string): void {
  const colors = paletteLookup(project.palette);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, project.width, project.height);
  }
  for (const shape of project.shapes) {
    ctx.fillStyle = colors.get(shape.colorId) ?? '#000000';
    ctx.beginPath();
    if (shape.type === 'polygon') {
      shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.moveTo(shape.cx + shape.radius, shape.cy);
      ctx.arc(shape.cx, shape.cy, shape.radius, 0, Math.PI * 2);
      if (shape.innerRadius > 0) {
        ctx.moveTo(shape.cx + shape.innerRadius, shape.cy);
        ctx.arc(shape.cx, shape.cy, shape.innerRadius, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill('evenodd');
    }
  }
}

/** Renders the artwork (not the screen) into a PNG blob with a transparent background by default. */
export async function exportPng(project: ArtworkProject, scale = 1, background?: string): Promise<Blob> {
  const size = pngSize(project, scale);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  drawArtwork(ctx, project, size.scale, background);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode PNG (image may be too large)');
  return blob;
}
