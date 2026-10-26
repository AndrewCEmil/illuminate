import { useRef } from 'react';
import type { PaletteColor } from '../data/models';
import { IconPencil } from './icons';

const LONG_PRESS_MS = 500;

type Props = {
  palette: PaletteColor[];
  /** Colour new polygons get. */
  activeColorId: string;
  /** Colour of the selected shape, if any (ringed differently). */
  selectedShapeColorId: string | null;
  onPick: (colorId: string) => void;
  onEdit: (colorId: string) => void;
};

export function PaletteBar({ palette, activeColorId, selectedShapeColorId, onPick, onEdit }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const markedId = selectedShapeColorId ?? activeColorId;

  return (
    <div className="palette-bar" role="toolbar" aria-label="Palette">
      {palette.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`swatch${c.id === markedId ? ' active' : ''}`}
          style={{ background: c.hex }}
          aria-label={`${c.name || 'Colour'} ${c.hex}${c.id === markedId ? ' (active)' : ''}`}
          aria-pressed={c.id === markedId}
          data-color-id={c.id}
          onPointerDown={() => {
            longPressed.current = false;
            clear();
            timer.current = setTimeout(() => {
              longPressed.current = true;
              navigator.vibrate?.(15);
              onEdit(c.id);
            }, LONG_PRESS_MS);
          }}
          onPointerUp={clear}
          onPointerLeave={clear}
          onPointerCancel={clear}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            onPick(c.id);
          }}
        />
      ))}
      <button type="button" className="icon-btn small" aria-label="Edit palette colour" onClick={() => onEdit(markedId)}>
        <IconPencil />
      </button>
    </div>
  );
}
