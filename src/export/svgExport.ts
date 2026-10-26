import type { ArtworkProject } from '../data/models';
import { paletteLookup } from '../data/models';

export type SvgExportOptions = {
  /** Fill the canvas with this colour (e.g. '#000000'); omit for a transparent background. */
  background?: string;
};

/** Formats a coordinate compactly: up to 2 decimals, no trailing zeros, no "-0". */
export function formatNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/**
 * Clean, standalone SVG of the artwork only: one <polygon> per shape in
 * stacking order, fills resolved from the palette, transparent by default.
 * Independent of the editor's zoom/pan.
 */
export function exportSvg(project: ArtworkProject, options: SvgExportOptions = {}): string {
  const colors = paletteLookup(project.palette);
  const w = formatNumber(project.width);
  const h = formatNumber(project.height);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  lines.push(`  <title>${escapeXml(project.name)}</title>`);
  if (options.background) {
    lines.push(`  <rect id="background" x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(options.background)}"/>`);
  }
  for (const shape of project.shapes) {
    const fill = colors.get(shape.colorId) ?? '#000000';
    const color = project.palette.find((c) => c.id === shape.colorId);
    const pts = shape.points.map((p) => `${formatNumber(p.x)},${formatNumber(p.y)}`).join(' ');
    const label = color?.name ? ` data-color="${escapeXml(color.name)}"` : '';
    lines.push(`  <polygon id="${escapeXml(shape.id)}"${label} fill="${fill}" points="${pts}"/>`);
  }
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
