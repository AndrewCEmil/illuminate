# Geometric Manuscript Studio

A mobile-first, offline Progressive Web App for tracing reference images (illuminated manuscripts, especially) into abstract compositions of flat-coloured polygons, circles and rings. The results export as clean SVG, ready to be scaled up and painted onto fabric.

Everything runs locally in the browser. There is no backend, no account and no analytics.

## Using the app

1. **New from image**: choose a reference picture. It's decoded and downscaled (max 2560 px) on the device.
2. **Polygon** tool: tap to place corners. To close the shape, tap the gold first corner or press **Finish**. If you hold and drag, a magnifier shows exactly where the corner will land when you lift your finger. Placements that would make edges cross are refused, with a buzz.
3. **Circle** tool: drag from the centre outwards. Or, to trace a halo or medallion whose centre you can't see, tap three points on its edge; the circle snaps through them.
4. **Select**: tap a shape to select it.
   - Drag a white handle to move a corner, or drag inside the shape to move all of it.
   - Circles have a centre handle (moves it) and a radius handle on the right edge. **Ring** cuts a hole in a circle; the hole's handle sits on its left edge. The hole is unpainted, like any area without a shape.
   - Tap a swatch to recolour the shape.
   - Use the context row to delete it or change its stacking order (back, backward, forward, front).
5. **Navigate**: pinch with two fingers to zoom, and drag with two fingers to pan; this works in every mode. In Select mode you can also drag empty space with one finger. The Pan tool makes every one-finger drag pan.
6. **Palette**: long-press a swatch, or tap ✎, to edit that slot. Every shape that uses the slot changes with it.
7. **See-through**: the half-circle icon has two sliders. *Reference* fades the image. *Artwork* (75% by default) lets the reference show through your shapes while you trace. Artwork see-through only applies while the reference is showing; hide it with the eye icon to see the true, solid composition. Exports are always solid.
8. **Undo/redo**: while you're drawing, undo removes the last corner (or circle edge point) first.
9. **Menu (⋯)**:
   - Fit to screen, Rename.
   - Export SVG, PNG or PNG at double size. Exports are transparent unless you tick "black background".
   - Back up the project as `.json`.

Projects save automatically after every committed edit. The green dot in the title bar means the latest change is stored; amber means it's being saved, and red means saving failed (a message explains why). Reopening the app returns you to the project you were working on.

> **Local storage is not a backup.** The browser can evict site data, and clearing site data deletes your projects. Use *Back up project* for anything you care about, and restore it with *Import backup* on the project screen. A restore always creates a new project and never overwrites an existing one.

## Development

Requires Node 20.19+ (developed on Node 26).

```bash
npm install
```

```bash
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest unit tests (geometry, circles/rings, viewport, history, gestures, autosave, persistence via fake-indexeddb, export, backup, schema upgrades) |
| `npm run test:e2e` | Builds, serves the production build, runs Playwright with Pixel 7 touch emulation (first run: `npx playwright install chromium`) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Production build into `dist/`, including the service worker and manifest |
| `npm run preview` | Serves `dist/` locally |
| `npm run icons` | Regenerates the PWA icons and the e2e test fixture (no dependencies) |

The service worker only runs in production builds (`npm run build && npm run preview`), not under `npm run dev`.

### Project layout

```
src/
  app/App.tsx               screens, startup (reopen last project), Android back button
  components/               Editor, ProjectList, PaletteBar, PaletteEditor, menus, dialogs, icons
  canvas/                   SVG rendering: reference, polygons, selection, draft, magnifier
  editor/
    viewport.ts             screen <-> world transform, zoomAt, panBy, pinch, fit
    geometry.ts             simple-polygon validation, intersection, hit primitives
    shapes.ts               shape-generic geometry: containment, handles, circle through 3 points
    hitTesting.ts           constant-screen-size vertex hit targets, topmost shape
    interactions.ts         what taps/drags mean (pure, tested)
    pointerController.ts    gesture recogniser (tap / drag / pinch / wheel)
    documentOps.ts          immutable document edits
    history.ts              bounded snapshot undo/redo
    useEditor.ts            glues the above to React state and autosave
  data/                     models, validation, IndexedDB (idb), repository, save queue, image import
  export/                   SVG, PNG, project backup, download
tests/                      unit tests; tests/e2e for Playwright
```

**Design notes**

- Documents are versioned: version 2 added circles. Version 1 projects and backups are upgraded automatically when loaded.
- All geometry is stored in image/world pixels. The viewport transform (`screen = world × scale + offset`) lives in `editor/viewport.ts`, and rendering, hit testing, drawing and dragging all go through it.
- Polygons reference palette slots by id, never by raw colour.
- Drags render a transient preview and commit once on release, so a whole drag is one undo step and one database write.
- The `SaveQueue` debounces writes and keeps exactly one in flight, always writing the newest document, so an older version can never overwrite a newer one.
- Reference visibility/opacity and the project name are saved but kept out of undo.

## Deploying

The build is a static site. Host `dist/` on any **HTTPS** static host; service workers require HTTPS, except on localhost.

- **Netlify / Cloudflare Pages / Vercel**: use build command `npm run build` and output directory `dist`.
- **GitHub Pages (project site)**: build with the repository sub-path, then publish `dist/`:

  ```bash
  BASE_PATH=/your-repo-name/ npm run build
  ```

Updates never interrupt editing. When a new version is deployed, the project screen shows "A new version is ready", and the app reloads only when you tap **Update**. Projects live in IndexedDB and are unaffected by updates.

## Installing and testing on Android

1. Deploy over HTTPS (above), or run it from your computer: `npm run build && npx vite preview --host`, then tunnel it over HTTPS. A plain `http://192.168…` LAN address won't register the service worker; Chrome's `chrome://inspect` port forwarding to `localhost:4173` does work.
2. Open the URL in **Chrome on Android**, then use ⋮ → **Add to Home screen / Install app**.
3. Launch it from the home screen. It opens standalone, without browser UI.
4. **Offline check**: open a project once while online. Then turn on airplane mode, force-close the app, relaunch it and confirm that you can:
   - see the reference image,
   - draw and edit shapes,
   - go back to the list and reopen the project,
   - export SVG and PNG.

### What still needs a real phone

These were verified only in desktop Chromium with touch emulation (Playwright CDP touch events and an emulated mobile viewport), not on physical hardware:

- How pinch and two-finger pan feel, and how smooth they are, on a mid-range Android phone.
- Whether vertex handles are comfortable to grab: the visible radius is 7 px, the hit radius 22 px. Same question for the 10 px tap/drag threshold.
- Where the magnifier sits relative to the finger when working near the screen corners.
- Long-press on palette swatches, which shouldn't trigger text selection or the context menu.
- The Android system back button: from the editor it should return to the list.
- Display cutouts and gesture-navigation safe areas in standalone mode.
- That the native colour picker (`<input type="color">`) opens correctly.
- That downloads land in the Downloads folder and the SVG opens in Inkscape or Illustrator.
- PWA install, and a full session in airplane mode.

## Known limitations

- Shapes are polygons, circles and rings only: no curves, ellipses, arbitrary holes, boolean operations, grouping, rotation or scaling. Bare fabric is represented by the absence of paint.
- Corners can't be added to or removed from an existing polygon; redraw the shape instead.
- When shapes overlap, a tap selects the topmost one. To reach a shape underneath, send the top one backward.
- Undo history is per session and resets when the project is reopened. The committed document is always saved.
- PNG export is capped at 16 megapixels so it stays within Android canvas limits.
- Exports use a plain download. Web Share to other apps isn't implemented yet.
- Backups embed the reference image as base64, so they are roughly 1.3× the image size.
