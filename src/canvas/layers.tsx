import { memo } from 'react';
import type { ArtworkProject, PaletteColor, Point, PolygonShape } from '../data/models';
import type { DragPreview } from '../editor/editorTypes';

const pointsAttr = (pts: readonly Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/** Reference image in world coordinates. Never affected by selection or editing. */
export const ReferenceLayer = memo(function ReferenceLayer({
  url,
  width,
  height,
  opacity,
}: {
  url: string;
  width: number;
  height: number;
  opacity: number;
}) {
  return <image href={url} x={0} y={0} width={width} height={height} opacity={opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />;
});

/** The artwork itself: one filled polygon per shape, in stacking order. */
export const PolygonLayer = memo(function PolygonLayer({
  shapes,
  palette,
  preview,
}: {
  shapes: PolygonShape[];
  palette: PaletteColor[];
  preview: DragPreview | null;
}) {
  const colors = new Map(palette.map((c) => [c.id, c.hex]));
  return (
    <g>
      {shapes.map((s) => (
        <polygon
          key={s.id}
          data-shape-id={s.id}
          points={pointsAttr(preview && preview.shapeId === s.id ? preview.points : s.points)}
          fill={colors.get(s.colorId) ?? '#000'}
        />
      ))}
    </g>
  );
});

/** Selection outline and vertex handles; sizes are divided by scale so they stay constant on screen. */
export function SelectionOverlay({ points, scale, valid, activeIndex }: { points: Point[]; scale: number; valid: boolean; activeIndex: number | null }) {
  const attr = pointsAttr(points);
  const r = 7 / scale;
  return (
    <g pointerEvents="none">
      <polygon points={attr} fill="none" stroke="#000" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <polygon
        points={attr}
        fill="none"
        stroke={valid ? '#ffffff' : '#ff4d4d'}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === activeIndex ? r * 1.4 : r}
          fill={i === activeIndex ? '#ffd166' : '#ffffff'}
          stroke="#000"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

/** In-progress polygon: tinted fill, solid placed edges, dashed closing edge, distinctive start vertex. */
export function DraftOverlay({
  draft,
  color,
  scale,
  pending,
}: {
  draft: Point[];
  color: string;
  scale: number;
  /** Precision-placement position (world) while the finger is down in Draw mode. */
  pending: Point | null;
}) {
  if (draft.length === 0 && !pending) return null;
  const first = draft[0];
  const last = draft[draft.length - 1];
  const closable = draft.length >= 3;
  const fillPts = pending ? [...draft, pending] : draft;
  return (
    <g pointerEvents="none">
      {fillPts.length >= 3 && <polygon points={pointsAttr(fillPts)} fill={color} fillOpacity={0.55} />}
      {draft.length >= 2 && (
        <>
          <polyline points={pointsAttr(draft)} fill="none" stroke="#000" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points={pointsAttr(draft)} fill="none" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </>
      )}
      {closable && first && last && (
        <line x1={last.x} y1={last.y} x2={first.x} y2={first.y} stroke="#fff" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      )}
      {pending && last && (
        <line x1={last.x} y1={last.y} x2={pending.x} y2={pending.y} stroke="#ffd166" strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      )}
      {draft.map((p, i) =>
        i === 0 ? null : <circle key={i} cx={p.x} cy={p.y} r={4.5 / scale} fill="#fff" stroke="#000" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />,
      )}
      {first && (
        <g>
          <circle cx={first.x} cy={first.y} r={11 / scale} fill={closable ? '#ffd166' : 'none'} fillOpacity={0.35} stroke="#ffd166" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          <circle cx={first.x} cy={first.y} r={4 / scale} fill="#ffd166" stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {pending && <circle cx={pending.x} cy={pending.y} r={4 / scale} fill="#ffd166" stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    </g>
  );
}

/** Thin outline of the artwork bounds, so the canvas edge is visible when the reference is hidden. */
export function ArtworkBounds({ doc }: { doc: ArtworkProject }) {
  return <rect x={0} y={0} width={doc.width} height={doc.height} fill="none" stroke="#3a3a3a" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
}
