import { useState } from 'react';
import type { PaletteColor } from '../data/models';
import { normalizeHex } from '../editor/documentOps';

type Props = {
  palette: PaletteColor[];
  colorId: string;
  usageCount: (colorId: string) => number;
  /** Live preview while editing (not committed, not in history). */
  onPreview: (colorId: string, hex: string | null) => void;
  onCommit: (colorId: string, hex: string) => void;
  onClose: () => void;
};

/**
 * Bottom sheet for editing a palette slot. Changing a slot recolours every
 * shape that uses it. Uses the native colour picker (works offline) plus a hex field.
 */
export function PaletteEditor({ palette, colorId: initialId, usageCount, onPreview, onCommit, onClose }: Props) {
  const [colorId, setColorId] = useState(initialId);
  const original = palette.find((c) => c.id === colorId);
  const [text, setText] = useState(original?.hex ?? '#000000');
  const hex = normalizeHex(text);

  const switchTo = (id: string) => {
    onPreview(colorId, null);
    setColorId(id);
    setText(palette.find((c) => c.id === id)?.hex ?? '#000000');
  };

  const update = (value: string) => {
    setText(value);
    const n = normalizeHex(value);
    onPreview(colorId, n);
  };

  const cancel = () => {
    onPreview(colorId, null);
    onClose();
  };

  const done = () => {
    onPreview(colorId, null);
    if (hex && original && hex !== original.hex) onCommit(colorId, hex);
    onClose();
  };

  const uses = usageCount(colorId);

  return (
    <div className="sheet-backdrop" onClick={cancel}>
      <div className="sheet" role="dialog" aria-label="Edit palette colour" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Palette colour</div>
        <div className="palette-slots">
          {palette.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`swatch${c.id === colorId ? ' active' : ''}`}
              style={{ background: c.id === colorId && hex ? hex : c.hex }}
              aria-label={`Edit ${c.name || c.hex}`}
              onClick={() => switchTo(c.id)}
            />
          ))}
        </div>
        <div className="color-edit-row">
          <label className="color-input-wrap" style={{ background: hex ?? original?.hex }}>
            <input type="color" value={hex ?? original?.hex ?? '#000000'} onChange={(e) => update(e.target.value)} aria-label="Pick colour" />
          </label>
          <input
            className={`hex-input${hex ? '' : ' invalid'}`}
            value={text}
            onChange={(e) => update(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={7}
            aria-label="Hex colour"
          />
        </div>
        <p className="sheet-note">
          {original?.name ? `${original.name}. ` : ''}
          {uses === 0 ? 'Not used yet.' : `Used by ${uses} shape${uses === 1 ? '' : 's'} — they all change together.`}
        </p>
        <div className="sheet-actions">
          <button type="button" className="text-btn" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="text-btn primary" onClick={done} disabled={!hex}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
