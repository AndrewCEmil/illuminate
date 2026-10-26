import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/reference.png', import.meta.url));

type Pt = { x: number; y: number };

/** Converts world (artwork) coordinates to page coordinates using the live canvas transform. */
async function worldToPage(page: Page, p: Pt): Promise<Pt> {
  return page.evaluate(({ x, y }) => {
    const svg = document.querySelector('[data-testid=canvas]')!;
    const r = svg.getBoundingClientRect();
    const m = /matrix\(([^)]+)\)/.exec(svg.querySelector('g')!.getAttribute('transform')!)![1]!.split(' ').map(Number);
    const [s, , , , tx, ty] = m as [number, number, number, number, number, number];
    return { x: r.left + x * s + tx, y: r.top + y * s + ty };
  }, p);
}

async function shapePoints(page: Page, index = 0): Promise<Pt[]> {
  const attr = await page.locator('[data-shape-id]').nth(index).getAttribute('points');
  return attr!.split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x: x!, y: y! };
  });
}

/** Real touch input via CDP, so the app receives pointerType "touch" events. */
class Touch {
  private constructor(private cdp: CDPSession) {}
  static async create(page: Page) {
    return new Touch(await page.context().newCDPSession(page));
  }
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }
  async tap(p: Pt) {
    await this.send('touchStart', [p]);
    await this.send('touchEnd', []);
  }
  async drag(from: Pt, to: Pt, steps = 12) {
    await this.send('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.send('touchMove', [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }]);
      await new Promise((r) => setTimeout(r, 16));
    }
    await this.send('touchEnd', []);
  }
  async pinch(center: Pt, fromDist: number, toDist: number, steps = 10) {
    const pts = (d: number) => [
      { x: center.x - d / 2, y: center.y },
      { x: center.x + d / 2, y: center.y },
    ];
    await this.send('touchStart', pts(fromDist));
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', pts(fromDist + ((toDist - fromDist) * i) / steps));
      await new Promise((r) => setTimeout(r, 16));
    }
    await this.send('touchEnd', []);
  }
}

async function newProject(page: Page) {
  await page.goto('/');
  await expect(page.getByText('New from image')).toBeVisible();
  await page.getByTestId('image-input').setInputFiles(FIXTURE);
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.locator('.canvas image')).toHaveCount(1);
}

async function waitSaved(page: Page) {
  await expect(page.locator('.save-dot')).toHaveClass(/saved/);
}

async function drawTriangle(page: Page, touch: Touch, pts: Pt[]) {
  for (const p of pts) await touch.tap(await worldToPage(page, p));
  await touch.tap(await worldToPage(page, pts[0]!)); // close on the first vertex
}

test('import, draw, recolour, edit vertex, zoom, undo/redo, persist, export SVG', async ({ page }) => {
  const touch = await Touch.create(page);
  await newProject(page);

  // Draw a triangle in world coordinates (fixture is 600×800).
  const tri = [{ x: 300, y: 120 }, { x: 450, y: 360 }, { x: 150, y: 360 }];
  await drawTriangle(page, touch, tri);
  await expect(page.locator('[data-shape-id]')).toHaveCount(1);
  const drawn = await shapePoints(page);
  drawn.forEach((p, i) => {
    expect(p.x).toBeCloseTo(tri[i]!.x, -0.5); // within ~1 world px
    expect(p.y).toBeCloseTo(tri[i]!.y, -0.5);
  });

  // Select it and change its colour.
  await page.getByRole('button', { name: 'Select' }).click();
  await touch.tap(await worldToPage(page, { x: 300, y: 300 }));
  await expect(page.getByRole('button', { name: 'Delete shape' })).toBeVisible();
  const vermilion = page.locator('.palette-bar .swatch').nth(1);
  await vermilion.click();
  const red = await vermilion.getAttribute('aria-label');
  expect(red).toContain('#d2412c');
  await expect(page.locator('[data-shape-id]')).toHaveAttribute('fill', '#d2412c');

  // Pinch-zoom in around the top vertex, then drag it precisely.
  const before = await page.evaluate(() => document.querySelector('[data-testid=canvas] g')!.getAttribute('transform'));
  await touch.pinch(await worldToPage(page, { x: 300, y: 200 }), 80, 240);
  const after = await page.evaluate(() => document.querySelector('[data-testid=canvas] g')!.getAttribute('transform'));
  expect(after).not.toBe(before);
  await expect(page.locator('[data-shape-id]')).toHaveCount(1);
  expect(await shapePoints(page)).toEqual(drawn); // navigation never edits geometry

  const vertex = await worldToPage(page, drawn[0]!);
  const target = await worldToPage(page, { x: drawn[0]!.x + 20, y: drawn[0]!.y - 10 });
  await touch.drag({ x: vertex.x + 3, y: vertex.y + 3 }, { x: target.x + 3, y: target.y + 3 });
  const moved = await shapePoints(page);
  expect(moved[0]!.x).toBeCloseTo(drawn[0]!.x + 20, 0);
  expect(moved[0]!.y).toBeCloseTo(drawn[0]!.y - 10, 0);
  expect(moved.slice(1)).toEqual(drawn.slice(1));

  // Undo the vertex move, redo it.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await shapePoints(page)).toEqual(drawn);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await shapePoints(page)).toEqual(moved);

  // Hide the reference: artwork remains.
  await page.getByRole('button', { name: 'Hide reference' }).click();
  await expect(page.locator('.canvas image')).toHaveCount(0);
  await expect(page.locator('[data-shape-id]')).toHaveCount(1);

  // Reload: the app reopens the same project with the committed state.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.locator('[data-shape-id]')).toHaveAttribute('fill', '#d2412c');
  expect(await shapePoints(page)).toEqual(moved);
  await expect(page.locator('.canvas image')).toHaveCount(0);

  // Export SVG and check its content.
  await page.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /SVG/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const svg = readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('viewBox="0 0 600 800"');
  expect(svg).toContain('width="600" height="800"');
  expect(svg.match(/<polygon /g)).toHaveLength(1);
  expect(svg).toContain('fill="#d2412c"');
  const pts = moved.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(' ');
  expect(svg).toContain(`points="${pts}"`);
  expect(svg).not.toMatch(/<image|<rect|<circle|stroke/);

  // PNG export produces a real PNG.
  await page.getByRole('button', { name: 'Menu' }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG', exact: true }).click()]);
  const bytes = readFileSync((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(600);
  expect(bytes.readUInt32BE(20)).toBe(800);
});

test('rejects self-intersecting shapes and undo removes draft vertices first', async ({ page }) => {
  const touch = await Touch.create(page);
  await newProject(page);
  for (const p of [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 400 }]) await touch.tap(await worldToPage(page, p));
  // This vertex would make its edge cross the first edge.
  await touch.tap(await worldToPage(page, { x: 250, y: 20 }));
  await expect(page.locator('.toast')).toContainText('can’t cross');
  await expect(page.getByText('3 points')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('2 points')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.context-row')).toHaveCount(0);
  await expect(page.locator('[data-shape-id]')).toHaveCount(0);
});

test('a second finger during drawing does not place a vertex', async ({ page }) => {
  const touch = await Touch.create(page);
  await newProject(page);
  await touch.tap(await worldToPage(page, { x: 100, y: 100 }));
  await expect(page.getByText('1 point')).toBeVisible();
  await touch.pinch(await worldToPage(page, { x: 300, y: 400 }), 100, 150);
  await expect(page.getByText('1 point')).toBeVisible();
});

test('backup export and restore creates an independent editable copy', async ({ page }) => {
  const touch = await Touch.create(page);
  await newProject(page);
  await drawTriangle(page, touch, [{ x: 100, y: 500 }, { x: 300, y: 500 }, { x: 200, y: 700 }]);
  await waitSaved(page);
  const original = await shapePoints(page);

  await page.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Back up project/ }).click()]);
  const backupPath = (await download.path())!;
  expect(JSON.parse(readFileSync(backupPath, 'utf8')).format).toBe('geometric-manuscript-project');

  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.getByTestId('backup-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: readFileSync(backupPath) });
  await expect(page.locator('.toast')).toContainText('Restored');
  await expect(page.locator('.project-card .project-name')).toHaveCount(2);
  await page.getByRole('button', { name: /Open .*\(restored\)/ }).click();
  await expect(page.locator('.canvas image')).toHaveCount(1);
  expect(await shapePoints(page)).toEqual(original);

  // Malformed backups are rejected without creating anything.
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.getByTestId('backup-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"nope"}') });
  await expect(page.locator('.toast')).toContainText('Invalid backup');
  await expect(page.locator('.project-card .project-name')).toHaveCount(2);
});

test('works offline after the service worker is installed', async ({ page, context }) => {
  const touch = await Touch.create(page);
  await newProject(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect(page.getByTestId('canvas')).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.locator('.canvas image')).toHaveCount(1); // reference image from IndexedDB
  await drawTriangle(page, touch, [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }]);
  await expect(page.locator('[data-shape-id]')).toHaveCount(1);
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('[data-shape-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /SVG/ }).click()]);
  expect(readFileSync((await download.path())!, 'utf8')).toContain('<polygon');
  await context.setOffline(false);
});
