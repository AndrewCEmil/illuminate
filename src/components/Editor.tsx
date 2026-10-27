import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArtworkCanvas } from '../canvas/ArtworkCanvas';
import type { ArtworkProject } from '../data/models';
import { loadImage } from '../data/projectRepository';
import { shapeIndex } from '../editor/documentOps';
import type { Notify } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import type { Viewport } from '../editor/viewport';
import { downloadBlob, safeFilename } from '../export/download';
import { exportPng } from '../export/pngExport';
import { createBackup, serializeBackup } from '../export/projectBackup';
import { exportSvg } from '../export/svgExport';
import { PromptDialog } from './Dialogs';
import { EditorMenu, OpacityPopover } from './EditorMenu';
import {
  IconBack,
  IconBackward,
  IconCheck,
  IconClose,
  IconEye,
  IconEyeOff,
  IconForward,
  IconCircle,
  IconHand,
  IconMore,
  IconOpacity,
  IconPolygon,
  IconRedo,
  IconRing,
  IconSelect,
  IconToBack,
  IconToFront,
  IconTrash,
  IconUndo,
} from './icons';
import { PaletteBar } from './PaletteBar';
import { PaletteEditor } from './PaletteEditor';

type Props = {
  project: ArtworkProject;
  image: Blob | null;
  initialViewport: Viewport | null;
  notify: Notify;
  /** Gives the app a way to flush pending saves before leaving. */
  registerFlush: (flush: () => Promise<void>) => void;
  onBack: () => void;
};

type Panel = null | 'menu' | 'opacity' | 'rename' | { paletteEdit: string };

export function Editor({ project, image, initialViewport, notify, registerFlush, onBack }: Props) {
  const ed = useEditor({ initial: project, initialViewport, notify });
  const { doc, actions, tool, selectedId, draft, viewport, size } = ed;
  const name = doc.name;
  const [panel, setPanel] = useState<Panel>(null);
  const [blackBackground, setBlackBackground] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);

  // Object URL for the reference image; revoked when the editor closes.
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Track the canvas area size.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) actions.setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [actions.setSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach the gesture controller to the canvas element.
  useEffect(() => {
    if (!svgEl) return;
    return ed.controller.attach(svgEl);
  }, [svgEl, ed.controller]);

  useEffect(() => {
    registerFlush(actions.flush);
  }, [registerFlush, actions.flush]);

  // Keyboard shortcuts (desktop / hardware keyboards).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel || (e.target instanceof HTMLElement && e.target.matches('input, textarea'))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.redo();
      } else if (e.key === 'Escape') {
        if (draft.length) actions.cancelDraft();
        else if (ed.circleDraft.rim.length) actions.cancelCircleDraft();
        else actions.deselect();
      } else if (e.key === 'Enter' && draft.length) {
        actions.finishDraft();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        actions.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, draft.length, ed.circleDraft.rim.length, panel, selectedId]);

  const exportBase = safeFilename(name);
  const svgBackground = blackBackground ? '#000000' : undefined;

  const doExportSvg = () => {
    const svg = exportSvg(doc, { background: svgBackground });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${exportBase}.svg`);
  };
  const doExportPng = async (scale: number) => {
    try {
      downloadBlob(await exportPng(doc, scale, svgBackground), `${exportBase}${scale === 1 ? '' : `@${scale}x`}.png`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'PNG export failed', 'error');
    }
  };
  const doBackup = async () => {
    try {
      await actions.flush();
      const img = image ?? (await loadImage(doc.reference.id));
      if (!img) throw new Error('Reference image is missing');
      const backup = await createBackup({ ...doc, updatedAt: new Date().toISOString() }, img);
      downloadBlob(new Blob([serializeBackup(backup)], { type: 'application/json' }), `${exportBase}.manuscript.json`);
    } catch (err) {
      notify(`Backup failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const selectedShape = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  const selIndex = selectedId ? shapeIndex(doc, selectedId) : -1;
  const draftColor = ed.palette.find((c) => c.id === ed.activeColorId)?.hex ?? '#ffffff';

  return (
    <div className="editor">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Back to projects" onClick={onBack}>
          <IconBack />
        </button>
        <button type="button" className="icon-btn" aria-label="Undo" disabled={!ed.canUndo} onClick={actions.undo}>
          <IconUndo />
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" disabled={!ed.canRedo} onClick={actions.redo}>
          <IconRedo />
        </button>
        <div className="title" title={name}>
          <span className="title-text">{name}</span>
          <span className={`save-dot ${ed.saveStatus}`} aria-label={`Save status: ${ed.saveStatus}`} title={ed.saveStatus} />
        </div>
        <button
          type="button"
          className={`icon-btn${doc.reference.visible ? '' : ' off'}`}
          aria-label={doc.reference.visible ? 'Hide reference' : 'Show reference'}
          aria-pressed={doc.reference.visible}
          onClick={() => actions.setReferenceVisible(!doc.reference.visible)}
        >
          {doc.reference.visible ? <IconEye /> : <IconEyeOff />}
        </button>
        <button type="button" className="icon-btn" aria-label="Reference opacity" onClick={() => setPanel('opacity')}>
          <IconOpacity />
        </button>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setPanel('menu')}>
          <IconMore />
        </button>
      </header>

      <div className={`canvas-wrap tool-${tool}`} ref={wrapRef}>
        {size && viewport && (
          <ArtworkCanvas
            svgRef={setSvgEl}
            doc={doc}
            palette={ed.palette}
            imageUrl={imageUrl}
            viewport={viewport}
            size={size}
            tool={tool}
            selectedId={selectedId}
            preview={ed.preview}
            draft={draft}
            draftColor={draftColor}
            placement={ed.placement}
            circleDraft={ed.circleDraft}
            artworkOpacity={ed.artworkOpacity}
          />
        )}
        {tool === 'draw' && draft.length === 0 && doc.shapes.length === 0 && (
          <div className="hint">Tap to place corners. Hold and drag to aim with the magnifier. Two fingers to zoom and pan.</div>
        )}
        {tool === 'circle' && ed.circleDraft.rim.length === 0 && !ed.circleDraft.dragging && (
          <div className="hint">Drag out from the centre — or tap 3 points on the edge of a circle to trace it.</div>
        )}
      </div>

      <footer className="bottombar">
        {draft.length > 0 && (
          <div className="context-row">
            <button type="button" className="text-btn" onClick={actions.cancelDraft}>
              <IconClose /> Cancel
            </button>
            <span className="context-info">
              {draft.length} point{draft.length === 1 ? '' : 's'}
            </span>
            <button type="button" className="text-btn primary" disabled={draft.length < 3} onClick={actions.finishDraft}>
              <IconCheck /> Finish
            </button>
          </div>
        )}
        {ed.circleDraft.rim.length > 0 && (
          <div className="context-row">
            <button type="button" className="text-btn" onClick={actions.cancelCircleDraft}>
              <IconClose /> Cancel
            </button>
            <span className="context-info">
              Tap {3 - ed.circleDraft.rim.length} more point{ed.circleDraft.rim.length === 2 ? '' : 's'} on the edge
            </span>
          </div>
        )}
        {selectedShape && draft.length === 0 && (
          <div className="context-row">
            <button type="button" className="icon-btn" aria-label="Delete shape" onClick={actions.deleteSelected}>
              <IconTrash />
            </button>
            {selectedShape.type === 'circle' ? (
              <button
                type="button"
                className={`text-btn small${selectedShape.innerRadius > 0 ? ' on' : ''}`}
                aria-pressed={selectedShape.innerRadius > 0}
                onClick={actions.toggleSelectedRing}
              >
                <IconRing /> Ring
              </button>
            ) : (
              <span className="context-info">
                {selIndex + 1} / {doc.shapes.length}
              </span>
            )}
            <button type="button" className="icon-btn" aria-label="Send to back" disabled={selIndex <= 0} onClick={() => actions.reorderSelected('back')}>
              <IconToBack />
            </button>
            <button type="button" className="icon-btn" aria-label="Send backward" disabled={selIndex <= 0} onClick={() => actions.reorderSelected('backward')}>
              <IconBackward />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Bring forward"
              disabled={selIndex >= doc.shapes.length - 1}
              onClick={() => actions.reorderSelected('forward')}
            >
              <IconForward />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Bring to front"
              disabled={selIndex >= doc.shapes.length - 1}
              onClick={() => actions.reorderSelected('front')}
            >
              <IconToFront />
            </button>
            <button type="button" className="icon-btn" aria-label="Deselect" onClick={actions.deselect}>
              <IconClose />
            </button>
          </div>
        )}
        <PaletteBar
          palette={ed.palette}
          activeColorId={ed.activeColorId}
          selectedShapeColorId={(tool === 'select' || tool === 'pan') && selectedShape ? selectedShape.colorId : null}
          onPick={actions.pickColor}
          onEdit={(id) => setPanel({ paletteEdit: id })}
        />
        <div className="tool-row" role="toolbar" aria-label="Tools">
          <ToolButton label="Select" active={tool === 'select'} onClick={() => actions.setTool('select')} icon={<IconSelect />} />
          <ToolButton label="Polygon" active={tool === 'draw'} onClick={() => actions.setTool('draw')} icon={<IconPolygon />} />
          <ToolButton label="Circle" active={tool === 'circle'} onClick={() => actions.setTool('circle')} icon={<IconCircle />} />
          <ToolButton label="Pan" active={tool === 'pan'} onClick={() => actions.setTool('pan')} icon={<IconHand />} />
        </div>
      </footer>

      {panel === 'menu' && (
        <EditorMenu
          shapeCount={doc.shapes.length}
          blackBackground={blackBackground}
          onToggleBlackBackground={setBlackBackground}
          onFit={actions.fit}
          onRename={() => setPanel('rename')}
          onExportSvg={doExportSvg}
          onExportPng={(s) => void doExportPng(s)}
          onBackup={() => void doBackup()}
          onClose={() => setPanel((p) => (p === 'menu' ? null : p))}
        />
      )}
      {panel === 'opacity' && (
        <OpacityPopover
          referenceOpacity={doc.reference.opacity}
          artworkOpacity={ed.artworkOpacity}
          onReferenceChange={actions.setReferenceOpacity}
          onArtworkChange={actions.setArtworkOpacity}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'rename' && (
        <PromptDialog
          title="Rename project"
          initialValue={name}
          confirmLabel="Rename"
          onCancel={() => setPanel(null)}
          onConfirm={(value) => {
            setPanel(null);
            actions.rename(value);
          }}
        />
      )}
      {panel && typeof panel === 'object' && (
        <PaletteEditor
          palette={doc.palette}
          colorId={panel.paletteEdit}
          usageCount={(id) => doc.shapes.filter((s) => s.colorId === id).length}
          onPreview={actions.previewPaletteColor}
          onCommit={actions.commitPaletteColor}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function ToolButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" className={`tool-btn${active ? ' active' : ''}`} aria-pressed={active} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
