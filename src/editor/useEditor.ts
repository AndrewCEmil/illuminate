import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtworkProject, PaletteColor, Point } from '../data/models';
import { saveProject, saveViewport } from '../data/projectRepository';
import { SaveQueue } from '../data/saveQueue';
import type { SaveStatus } from '../data/saveQueue';
import {
  addPolygon,
  deleteShape,
  reorderShape,
  setPaletteColor,
  setReference,
  setShapeColor,
  setShapePoints,
  renameDocument,
  withNonUndoableFieldsOf,
} from './documentOps';
import type { ReorderDirection } from './documentOps';
import type { DragPreview, ToolMode } from './editorTypes';
import { isValidPolygon } from './geometry';
import * as H from './history';
import type { History } from './history';
import { beginShapeDrag, closeDraft, dragFocus, dragPoints, drawTap, tapSelect } from './interactions';
import type { DrawTapResult, ShapeDrag } from './interactions';
import type { GestureHost } from './pointerController';
import { PointerController } from './pointerController';
import type { Size, Viewport } from './viewport';
import { fitViewport, screenToWorld } from './viewport';

export type Notify = (text: string, tone?: 'info' | 'error', sticky?: boolean) => void;

/** useState plus a ref that is updated synchronously, for event handlers that run between renders. */
function useLiveState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((next: T) => {
    ref.current = next;
    setValue(next);
  }, []);
  return [value, set, ref] as const;
}

function saveErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'QuotaExceededError') return 'Storage is full — changes are not being saved. Back up and delete old projects.';
  return `Couldn’t save changes${err instanceof Error && err.message ? `: ${err.message}` : ''}. Keep the app open and back up your project.`;
}

export function useEditor(opts: { initial: ArtworkProject; initialViewport: Viewport | null; notify: Notify }) {
  const { notify } = opts;
  const [history, setHistory, historyRef] = useLiveState<History<ArtworkProject>>(() => H.createHistory(opts.initial));
  const [tool, setToolState, toolRef] = useLiveState<ToolMode>(opts.initial.shapes.length === 0 ? 'draw' : 'select');
  const [activeColorId, setActiveColorId, activeColorRef] = useLiveState(opts.initial.palette[0]!.id);
  const [selectedId, setSelectedId, selectedRef] = useLiveState<string | null>(null);
  const [draft, setDraft, draftRef] = useLiveState<Point[]>([]);
  const [preview, setPreview] = useLiveState<DragPreview | null>(null);
  const [placement, setPlacement] = useLiveState<Point | null>(null);
  const [viewport, setViewportState, viewportRef] = useLiveState<Viewport | null>(opts.initialViewport);
  const [size, setSizeState, sizeRef] = useLiveState<Size | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [palettePreview, setPalettePreview] = useState<{ colorId: string; hex: string } | null>(null);
  const dragRef = useRef<ShapeDrag | null>(null);

  const doc = history.present;

  // --- persistence ---------------------------------------------------------

  const saveQueueRef = useRef<SaveQueue<ArtworkProject> | null>(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = new SaveQueue<ArtworkProject>(
      (d) => saveProject({ ...d, updatedAt: new Date().toISOString() }),
      (status, err) => {
        setSaveStatus(status);
        if (status === 'error') notify(saveErrorMessage(err), 'error', true);
      },
    );
  }
  const saveQueue = saveQueueRef.current;

  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId = opts.initial.id;
  const persistViewport = useCallback(
    (v: Viewport) => {
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = setTimeout(() => {
        void saveViewport(projectId, v).catch(() => {});
      }, 600);
    },
    [projectId],
  );

  const setViewport = useCallback(
    (v: Viewport) => {
      setViewportState(v);
      persistViewport(v);
    },
    [setViewportState, persistViewport],
  );

  /** Flushes pending writes; call before leaving the editor. */
  const flush = useCallback(async () => {
    if (viewportSaveTimer.current && viewportRef.current) {
      clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = null;
      await saveViewport(projectId, viewportRef.current).catch(() => {});
    }
    await saveQueue.flush();
  }, [projectId, saveQueue, viewportRef]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  // --- document changes ----------------------------------------------------

  /** Applies a document change. Undoable edits go into history; all edits are autosaved. */
  const applyDoc = useCallback(
    (next: ArtworkProject, undoable = true) => {
      const h = historyRef.current;
      if (next === h.present) return;
      setHistory(undoable ? H.commit(h, next) : H.replacePresent(h, next));
      saveQueue.schedule(next);
    },
    [historyRef, saveQueue, setHistory],
  );

  const restoreSnapshot = useCallback(
    (h: History<ArtworkProject>, current: ArtworkProject) => {
      const present = withNonUndoableFieldsOf(h.present, current);
      const next = { ...h, present };
      setHistory(next);
      saveQueue.schedule(present);
      if (selectedRef.current && !present.shapes.some((s) => s.id === selectedRef.current)) setSelectedId(null);
      if (!present.palette.some((c) => c.id === activeColorRef.current)) setActiveColorId(present.palette[0]!.id);
    },
    [activeColorRef, saveQueue, selectedRef, setActiveColorId, setHistory, setSelectedId],
  );

  const controllerRef = useRef<PointerController | null>(null);

  const cancelInteraction = useCallback(() => {
    controllerRef.current?.reset();
    dragRef.current = null;
    setPreview(null);
    setPlacement(null);
  }, [setPreview, setPlacement]);

  const undo = useCallback(() => {
    cancelInteraction();
    if (draftRef.current.length > 0) {
      setDraft(draftRef.current.slice(0, -1));
      return;
    }
    const h = historyRef.current;
    if (!H.canUndo(h)) return;
    restoreSnapshot(H.undo(h), h.present);
  }, [cancelInteraction, draftRef, historyRef, restoreSnapshot, setDraft]);

  const redo = useCallback(() => {
    if (draftRef.current.length > 0) return;
    cancelInteraction();
    const h = historyRef.current;
    if (!H.canRedo(h)) return;
    restoreSnapshot(H.redo(h), h.present);
  }, [cancelInteraction, draftRef, historyRef, restoreSnapshot]);

  // --- drawing -------------------------------------------------------------

  const finishPolygon = useCallback(
    (points: Point[]) => {
      try {
        applyDoc(addPolygon(historyRef.current.present, points, activeColorRef.current));
        setDraft([]);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Couldn’t add shape', 'error');
      }
    },
    [activeColorRef, applyDoc, historyRef, notify, setDraft],
  );

  const handleDrawResult = useCallback(
    (result: DrawTapResult) => {
      switch (result.kind) {
        case 'add':
          setDraft(result.draft);
          break;
        case 'close':
          finishPolygon(result.points);
          break;
        case 'reject':
          navigator.vibrate?.(40);
          notify(result.reason, 'error');
          break;
        case 'ignore':
          break;
      }
    },
    [finishPolygon, notify, setDraft],
  );

  const finishDraft = useCallback(() => handleDrawResult(closeDraft(draftRef.current)), [draftRef, handleDrawResult]);
  const cancelDraft = useCallback(() => {
    cancelInteraction();
    setDraft([]);
  }, [cancelInteraction, setDraft]);

  // --- tools & selection -----------------------------------------------------

  const setTool = useCallback(
    (next: ToolMode) => {
      if (next === toolRef.current) return;
      cancelInteraction();
      const d = draftRef.current;
      if (toolRef.current === 'draw' && d.length > 0) {
        if (isValidPolygon(d)) {
          finishPolygon(d);
          notify('Shape finished');
        } else {
          setDraft([]);
          notify('Unfinished shape discarded');
        }
      }
      if (next === 'draw') setSelectedId(null);
      setToolState(next);
    },
    [cancelInteraction, draftRef, finishPolygon, notify, setDraft, setSelectedId, setToolState, toolRef],
  );

  const pickColor = useCallback(
    (colorId: string) => {
      setActiveColorId(colorId);
      const sel = selectedRef.current;
      if (sel && toolRef.current !== 'draw') {
        applyDoc(setShapeColor(historyRef.current.present, sel, colorId));
      }
    },
    [applyDoc, historyRef, selectedRef, setActiveColorId, toolRef],
  );

  const deleteSelected = useCallback(() => {
    const sel = selectedRef.current;
    if (!sel) return;
    cancelInteraction();
    applyDoc(deleteShape(historyRef.current.present, sel));
    setSelectedId(null);
  }, [applyDoc, cancelInteraction, historyRef, selectedRef, setSelectedId]);

  const reorderSelected = useCallback(
    (direction: ReorderDirection) => {
      const sel = selectedRef.current;
      if (sel) applyDoc(reorderShape(historyRef.current.present, sel, direction));
    },
    [applyDoc, historyRef, selectedRef],
  );

  const deselect = useCallback(() => setSelectedId(null), [setSelectedId]);

  // --- palette & reference -------------------------------------------------

  const commitPaletteColor = useCallback(
    (colorId: string, hex: string) => applyDoc(setPaletteColor(historyRef.current.present, colorId, hex)),
    [applyDoc, historyRef],
  );

  const previewPaletteColor = useCallback((colorId: string, hex: string | null) => {
    setPalettePreview(hex ? { colorId, hex } : null);
  }, []);

  const setReferenceVisible = useCallback(
    (visible: boolean) => applyDoc(setReference(historyRef.current.present, { visible }), false),
    [applyDoc, historyRef],
  );
  const setReferenceOpacity = useCallback(
    (opacity: number) => applyDoc(setReference(historyRef.current.present, { opacity }), false),
    [applyDoc, historyRef],
  );

  const rename = useCallback(
    (name: string) => applyDoc(renameDocument(historyRef.current.present, name), false),
    [applyDoc, historyRef],
  );

  // --- viewport --------------------------------------------------------------

  const fit = useCallback(() => {
    const s = sizeRef.current;
    if (!s) return;
    const d = historyRef.current.present;
    setViewport(fitViewport({ width: d.width, height: d.height }, s, 20));
  }, [historyRef, setViewport, sizeRef]);

  const setSize = useCallback(
    (s: Size) => {
      setSizeState(s);
      if (!viewportRef.current) {
        const d = historyRef.current.present;
        setViewportState(fitViewport({ width: d.width, height: d.height }, s, 20));
      }
    },
    [historyRef, setSizeState, setViewportState, viewportRef],
  );

  // --- gestures --------------------------------------------------------------

  const hostRef = useRef<GestureHost | null>(null);
  hostRef.current = {
    getViewport: () => viewportRef.current ?? { x: 0, y: 0, scale: 1 },
    setViewport,
    panOnly: () => toolRef.current === 'pan',
    onTap: (p) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const d = historyRef.current.present;
      if (toolRef.current === 'draw') handleDrawResult(drawTap(draftRef.current, p, vp));
      else if (toolRef.current === 'select') setSelectedId(tapSelect(d, selectedRef.current, p, vp));
    },
    onDragStart: (start, current) => {
      const vp = viewportRef.current;
      if (!vp) return false;
      if (toolRef.current === 'draw') {
        setPlacement(screenToWorld(current, vp));
        return true;
      }
      if (toolRef.current !== 'select') return false;
      const drag = beginShapeDrag(historyRef.current.present, selectedRef.current, start, vp);
      if (!drag) return false;
      dragRef.current = drag;
      setSelectedId(drag.shapeId);
      return true;
    },
    onDragMove: (p) => {
      const vp = viewportRef.current;
      if (!vp) return;
      if (toolRef.current === 'draw') {
        setPlacement(screenToWorld(p, vp));
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      const points = dragPoints(drag, screenToWorld(p, vp));
      setPreview({
        shapeId: drag.shapeId,
        points,
        valid: isValidPolygon(points),
        focus: dragFocus(drag, points),
        vertexIndex: drag.kind === 'vertex' ? drag.index : null,
      });
    },
    onDragEnd: (p) => {
      const vp = viewportRef.current;
      if (!vp) return;
      if (toolRef.current === 'draw') {
        setPlacement(null);
        handleDrawResult(drawTap(draftRef.current, p, vp));
        return;
      }
      const drag = dragRef.current;
      dragRef.current = null;
      setPreview(null);
      if (!drag) return;
      const points = dragPoints(drag, screenToWorld(p, vp));
      if (!isValidPolygon(points)) {
        navigator.vibrate?.(40);
        notify('Edges can’t cross — change undone', 'error');
        return;
      }
      // One committed history entry for the whole drag.
      applyDoc(setShapePoints(historyRef.current.present, drag.shapeId, points));
    },
    onDragCancel: () => {
      dragRef.current = null;
      setPreview(null);
      setPlacement(null);
    },
  };

  if (!controllerRef.current) {
    const delegate: GestureHost = {
      getViewport: () => hostRef.current!.getViewport(),
      setViewport: (v) => hostRef.current!.setViewport(v),
      panOnly: () => hostRef.current!.panOnly(),
      onTap: (p) => hostRef.current!.onTap(p),
      onDragStart: (s, c) => hostRef.current!.onDragStart(s, c),
      onDragMove: (p) => hostRef.current!.onDragMove(p),
      onDragEnd: (p) => hostRef.current!.onDragEnd(p),
      onDragCancel: () => hostRef.current!.onDragCancel(),
    };
    controllerRef.current = new PointerController(delegate);
  }

  const palette: PaletteColor[] = palettePreview
    ? doc.palette.map((c) => (c.id === palettePreview.colorId ? { ...c, hex: palettePreview.hex } : c))
    : doc.palette;

  return {
    doc,
    palette,
    canUndo: draft.length > 0 || H.canUndo(history),
    canRedo: draft.length === 0 && H.canRedo(history),
    tool,
    activeColorId,
    selectedId,
    draft,
    preview,
    placement,
    viewport,
    size,
    saveStatus,
    controller: controllerRef.current,
    actions: {
      undo,
      redo,
      setTool,
      pickColor,
      deleteSelected,
      reorderSelected,
      deselect,
      finishDraft,
      cancelDraft,
      commitPaletteColor,
      previewPaletteColor,
      setReferenceVisible,
      setReferenceOpacity,
      rename,
      fit,
      setSize,
      flush,
    },
  };
}
