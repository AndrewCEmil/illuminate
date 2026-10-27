import { IconDownload, IconFit, IconPencil } from './icons';

type Props = {
  shapeCount: number;
  blackBackground: boolean;
  onToggleBlackBackground: (value: boolean) => void;
  onFit: () => void;
  onRename: () => void;
  onExportSvg: () => void;
  onExportPng: (scale: number) => void;
  onBackup: () => void;
  onClose: () => void;
};

export function EditorMenu(p: Props) {
  const act = (fn: () => void) => () => {
    p.onClose();
    fn();
  };
  return (
    <div className="sheet-backdrop" onClick={p.onClose}>
      <div className="sheet menu" role="menu" aria-label="Project menu" onClick={(e) => e.stopPropagation()}>
        <button type="button" role="menuitem" className="menu-item" onClick={act(p.onFit)}>
          <IconFit /> Fit to screen
        </button>
        <button type="button" role="menuitem" className="menu-item" onClick={act(p.onRename)}>
          <IconPencil /> Rename project
        </button>
        <div className="menu-sep" />
        <div className="menu-heading">Export artwork ({p.shapeCount} shape{p.shapeCount === 1 ? '' : 's'})</div>
        <button type="button" role="menuitem" className="menu-item" onClick={act(p.onExportSvg)}>
          <IconDownload /> SVG (editable vector)
        </button>
        <button type="button" role="menuitem" className="menu-item" onClick={act(() => p.onExportPng(1))}>
          <IconDownload /> PNG
        </button>
        <button type="button" role="menuitem" className="menu-item" onClick={act(() => p.onExportPng(2))}>
          <IconDownload /> PNG, double size
        </button>
        <label className="menu-item checkbox">
          <input type="checkbox" checked={p.blackBackground} onChange={(e) => p.onToggleBlackBackground(e.target.checked)} />
          Include black background (otherwise transparent)
        </label>
        <div className="menu-sep" />
        <button type="button" role="menuitem" className="menu-item" onClick={act(p.onBackup)}>
          <IconDownload /> Back up project (.json)
        </button>
        <p className="sheet-note">Projects are stored only in this browser. Back up anything you care about.</p>
      </div>
    </div>
  );
}

/**
 * Two see-through controls: the reference image, and the artwork itself (a
 * tracing aid that only applies on screen while the reference is visible).
 */
export function OpacityPopover({
  referenceOpacity,
  artworkOpacity,
  onReferenceChange,
  onArtworkChange,
  onClose,
}: {
  referenceOpacity: number;
  artworkOpacity: number;
  onReferenceChange: (v: number) => void;
  onArtworkChange: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover" onClick={(e) => e.stopPropagation()}>
        <OpacitySlider label="Reference" value={referenceOpacity} min={0} onChange={onReferenceChange} />
        <OpacitySlider label="Artwork" value={artworkOpacity} min={0.1} onChange={onArtworkChange} />
        <p className="popover-note">Artwork see-through only applies while the reference is showing. Exports are always solid.</p>
      </div>
    </div>
  );
}

function OpacitySlider({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <label className="popover-row">
      <span className="popover-label">{label}</span>
      <input
        type="range"
        min={Math.round(min * 100)}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={`${label} opacity`}
      />
      <span className="popover-value">{Math.round(value * 100)}%</span>
    </label>
  );
}
