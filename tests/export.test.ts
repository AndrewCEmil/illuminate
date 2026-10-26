import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { addPolygon, setPaletteColor } from '../src/editor/documentOps';
import { drawArtwork, pngSize } from '../src/export/pngExport';
import { exportSvg, formatNumber } from '../src/export/svgExport';
import { makeProject, projectWithShapes } from './helpers';

function parse(svg: string) {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const doc = dom.window.document;
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

describe('SVG export', () => {
  it('has correct dimensions and viewBox', () => {
    const root = parse(exportSvg(projectWithShapes())).documentElement;
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('width')).toBe('1000');
    expect(root.getAttribute('height')).toBe('800');
    expect(root.getAttribute('viewBox')).toBe('0 0 1000 800');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
  });

  it('emits one polygon per shape, in stacking order, with exact coordinates', () => {
    const doc = projectWithShapes();
    const polys = [...parse(exportSvg(doc)).querySelectorAll('polygon')];
    expect(polys.map((p) => p.getAttribute('id'))).toEqual(['a', 'b', 'c']);
    expect(polys[0]!.getAttribute('points')).toBe('0,0 100,0 100,100 0,100');
    expect(polys[2]!.getAttribute('points')).toBe('300,300 400,300 350,380');
  });

  it('resolves fills from the palette, including edited slots', () => {
    let doc = projectWithShapes();
    doc = setPaletteColor(doc, doc.palette[0]!.id, '#123456');
    const polys = [...parse(exportSvg(doc)).querySelectorAll('polygon')];
    expect(polys.map((p) => p.getAttribute('fill'))).toEqual(['#123456', doc.palette[1]!.hex, doc.palette[2]!.hex]);
  });

  it('contains no reference image, editor artefacts, or background by default', () => {
    const svg = exportSvg(projectWithShapes());
    expect(svg).not.toMatch(/<image|<rect|stroke|<circle|<line|<polyline|data:|href|transform|opacity/);
    const children = [...parse(svg).documentElement.children].map((c) => c.tagName);
    expect(new Set(children)).toEqual(new Set(['title', 'polygon']));
  });

  it('adds an opaque background only when asked', () => {
    const rect = parse(exportSvg(projectWithShapes(), { background: '#000000' })).querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe('#000000');
    expect(rect?.getAttribute('width')).toBe('1000');
  });

  it('rounds coordinates compactly and escapes text', () => {
    expect(formatNumber(1.23456)).toBe('1.23');
    expect(formatNumber(-0.001)).toBe('0');
    let doc = makeProject();
    doc = { ...doc, name: 'Saint <Michael> & "Dragon"' };
    doc = addPolygon(doc, [{ x: 0.123, y: 0 }, { x: 10, y: 0.5 }, { x: 5, y: 9.999 }], doc.palette[0]!.id, 'p');
    const parsed = parse(exportSvg(doc));
    expect(parsed.querySelector('title')?.textContent).toBe('Saint <Michael> & "Dragon"');
    expect(parsed.querySelector('polygon')?.getAttribute('points')).toBe('0.12,0 10,0.5 5,10');
  });

  it('is independent of the editor viewport (pure function of the document)', () => {
    const doc = projectWithShapes();
    expect(exportSvg(doc)).toBe(exportSvg(structuredClone(doc)));
  });
});

describe('PNG export', () => {
  it('draws only artwork, in order, scaled', () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '' as string,
      setTransform: (...a: number[]) => calls.push(`T${a.join(',')}`),
      fillRect: () => calls.push('rect'),
      beginPath: () => calls.push('begin'),
      moveTo: (x: number, y: number) => calls.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => calls.push(`L${x},${y}`),
      closePath: () => calls.push('Z'),
      fill() {
        calls.push(`fill ${this.fillStyle}`);
      },
    };
    const doc = projectWithShapes();
    drawArtwork(ctx as never, doc, 2);
    expect(calls[0]).toBe('T2,0,0,2,0,0');
    expect(calls).not.toContain('rect'); // transparent
    expect(calls.filter((c) => c.startsWith('fill'))).toEqual([
      `fill ${doc.palette[0]!.hex}`,
      `fill ${doc.palette[1]!.hex}`,
      `fill ${doc.palette[2]!.hex}`,
    ]);
    drawArtwork(ctx as never, doc, 1, '#000');
    expect(calls).toContain('rect');
  });

  it('caps output size predictably', () => {
    const doc = makeProject(2560, 1920);
    expect(pngSize(doc, 1)).toMatchObject({ width: 2560, height: 1920 });
    const big = pngSize(doc, 4);
    expect(big.width * big.height).toBeLessThanOrEqual(16_000_000 * 1.001);
    expect(big.width / big.height).toBeCloseTo(2560 / 1920, 2);
  });
});
