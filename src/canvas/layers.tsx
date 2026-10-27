import { memo } from 'react';
import type { ArtworkProject, PaletteColor, Point, Shape } from '../data/models';
import type { CircleDraft, DragPreview } from '../editor/editorTypes';
import { shapeHandles } from '../editor/shapes';
import { ringPath } from '../export/svgExport';

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

/** One shape as an SVG element. Shared by the editor, magnifier and project thumbnails. */
export function ShapeElement({ shape, fill, ...rest }: { shape: Shape; fill: string } & React.SVGAttributes<SVGElement>) {
  if (shape.type === 'polygon') return <polygon {...rest} points={pointsAttr(shape.points)} fill={fill} />;
  if (shape.innerRadius > 0) return <path {...rest} d={ringPath(shape)} fillRule="evenodd" fill={fill} />;
  return <circle {...rest} cx={shape.cx} cy={shape.cy} r={shape.radius} fill={fill} />;
}

/**
 * The artwork itself, in stacking order. `opacity` applies to the layer as a
 * whole (a tracing aid): shapes stay opaque against each other and only the
 * reference shows through.
 */
export const ShapeLayer = memo(function ShapeLayer({
  shapes,
  palette,
  preview,
  opacity = 1,
}: {
  shapes: Shape[];
  palette: PaletteColor[];
  preview: DragPreview | null;
  opacity?: number;
}) {
  const colors = new Map(palette.map((c) => [c.id, c.hex]));
  return (
    <g opacity={opacity < 1 ? opacity : undefined} data-testid="artwork">
      {shapes.map((s) => (
        <ShapeElement
          key={s.id}
          data-shape-id={s.id}
          data-shape-type={s.type}
          shape={preview && preview.shape.id === s.id ? preview.shape : s}
          fill={colors.get(s.colorId) ?? '#000'}
        />
      ))}
    </g>
  );
});

/** Selection outline and handles; sizes are divided by scale so they stay constant on screen. */
export function SelectionOverlay({ shape, scale, valid, activeHandle }: { shape: Shape; scale: number; valid: boolean; activeHandle: number | null }) {
  const r = 7 / scale;
  const outline = { fill: 'none', vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const };
  return (
    <g pointerEvents="none">
      <ShapeElement shape={shape} {...outline} fill="none" stroke="#000" strokeWidth={4} />
      <ShapeElement shape={shape} {...outline} fill="none" stroke={valid ? '#ffffff' : '#ff4d4d'} strokeWidth={2} />
      {shapeHandles(shape).map((h, i) =>
        h.kind === 'center' ? (
          <g key={i}>
            <circle cx={h.point.x} cy={h.point.y} r={r} fill={i === activeHandle ? '#ffd166' : '#ffffff'} stroke="#000" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path
              d={`M${h.point.x - r * 0.55} ${h.point.y}H${h.point.x + r * 0.55}M${h.point.x} ${h.point.y - r * 0.55}V${h.point.y + r * 0.55}`}
              stroke="#000"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : (
          <circle
            key={i}
            cx={h.point.x}
            cy={h.point.y}
            r={i === activeHandle ? r * 1.4 : r}
            fill={i === activeHandle ? '#ffd166' : '#ffffff'}
            stroke="#000"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
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

/** Circle tool feedback: tapped rim points, and the live circle while dragging out from the centre. */
export function CircleDraftOverlay({ draft, color, scale }: { draft: CircleDraft; color: string; scale: number }) {
  const { rim, dragging } = draft;
  if (rim.length === 0 && !dragging) return null;
  return (
    <g pointerEvents="none">
      {dragging && (
        <>
          <circle cx={dragging.cx} cy={dragging.cy} r={dragging.radius} fill={color} fillOpacity={0.55} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <line
            x1={dragging.cx}
            y1={dragging.cy}
            x2={dragging.cx + dragging.radius}
            y2={dragging.cy}
            stroke="#ffd166"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={dragging.cx} cy={dragging.cy} r={4 / scale} fill="#ffd166" stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {rim.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={6 / scale} fill="#ffd166" stroke="#000" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

/** Thin outline of the artwork bounds, so the canvas edge is visible when the reference is hidden. */
export function ArtworkBounds({ doc }: { doc: ArtworkProject }) {
  return <rect x={0} y={0} width={doc.width} height={doc.height} fill="none" stroke="#3a3a3a" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
}
