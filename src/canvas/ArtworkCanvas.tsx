import type { Ref } from 'react';
import type { ArtworkProject, PaletteColor, Point } from '../data/models';
import type { DragPreview, ToolMode } from '../editor/editorTypes';
import type { Size, Viewport } from '../editor/viewport';
import { worldToScreen } from '../editor/viewport';
import { ArtworkBounds, DraftOverlay, PolygonLayer, ReferenceLayer, SelectionOverlay } from './layers';

export type CanvasProps = {
  svgRef: Ref<SVGSVGElement>;
  doc: ArtworkProject;
  palette: PaletteColor[];
  imageUrl: string | null;
  viewport: Viewport;
  size: Size;
  tool: ToolMode;
  selectedId: string | null;
  preview: DragPreview | null;
  draft: Point[];
  draftColor: string;
  /** World point of an in-progress precision placement (Draw mode, finger down). */
  placement: Point | null;
};

const LOUPE_SIZE = 136;
const LOUPE_MAGNIFICATION = 3;
const LOUPE_MARGIN = 12;

export function ArtworkCanvas(props: CanvasProps) {
  const { svgRef, doc, palette, imageUrl, viewport, size, selectedId, preview, draft, draftColor, placement } = props;
  const { x, y, scale } = viewport;
  const selected = selectedId ? doc.shapes.find((s) => s.id === selectedId) : undefined;
  const selectedPoints = selected && preview?.shapeId === selected.id ? preview.points : selected?.points;
  const focus = placement ?? preview?.focus ?? null;

  return (
    <>
      <svg ref={svgRef} className="canvas" width={size.width} height={size.height} data-testid="canvas">
        <rect x={0} y={0} width={size.width} height={size.height} fill="#000" />
        <g transform={`matrix(${scale} 0 0 ${scale} ${x} ${y})`}>
          <ArtworkBounds doc={doc} />
          {doc.reference.visible && imageUrl && (
            <ReferenceLayer url={imageUrl} width={doc.width} height={doc.height} opacity={doc.reference.opacity} />
          )}
          <PolygonLayer shapes={doc.shapes} palette={palette} preview={preview} />
          {selectedPoints && (
            <SelectionOverlay
              points={selectedPoints}
              scale={scale}
              valid={preview?.shapeId === selected?.id ? preview!.valid : true}
              activeIndex={preview?.vertexIndex ?? null}
            />
          )}
          <DraftOverlay draft={draft} color={draftColor} scale={scale} pending={placement} />
        </g>
      </svg>
      {focus && <Loupe {...props} focus={focus} />}
    </>
  );
}

/**
 * Magnified view around the point under the finger, shown in a corner away
 * from the finger, so vertices can be placed precisely despite occlusion.
 */
function Loupe({ doc, palette, imageUrl, viewport, size, preview, draft, draftColor, placement, focus }: CanvasProps & { focus: Point }) {
  const screen = worldToScreen(focus, viewport);
  const nearLeftCorner = screen.x < LOUPE_SIZE + LOUPE_MARGIN * 3 && screen.y < LOUPE_SIZE + LOUPE_MARGIN * 3;
  const left = nearLeftCorner ? size.width - LOUPE_SIZE - LOUPE_MARGIN : LOUPE_MARGIN;
  const loupeScale = viewport.scale * LOUPE_MAGNIFICATION;
  const half = LOUPE_SIZE / 2 / loupeScale;
  const ref = doc.reference;
  return (
    <div className="loupe" style={{ left, top: LOUPE_MARGIN, width: LOUPE_SIZE, height: LOUPE_SIZE }} aria-hidden="true">
      <svg width={LOUPE_SIZE} height={LOUPE_SIZE} viewBox={`${focus.x - half} ${focus.y - half} ${half * 2} ${half * 2}`}>
        <rect x={focus.x - half} y={focus.y - half} width={half * 2} height={half * 2} fill="#000" />
        {ref.visible && imageUrl && <ReferenceLayer url={imageUrl} width={doc.width} height={doc.height} opacity={Math.max(ref.opacity, 0.7)} />}
        <PolygonLayer shapes={doc.shapes} palette={palette} preview={preview} />
        {preview && <SelectionOverlay points={preview.points} scale={loupeScale} valid={preview.valid} activeIndex={preview.vertexIndex} />}
        <DraftOverlay draft={draft} color={draftColor} scale={loupeScale} pending={placement} />
        <g stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke">
          <line x1={focus.x - half} y1={focus.y} x2={focus.x - 6 / loupeScale} y2={focus.y} vectorEffect="non-scaling-stroke" />
          <line x1={focus.x + 6 / loupeScale} y1={focus.y} x2={focus.x + half} y2={focus.y} vectorEffect="non-scaling-stroke" />
          <line x1={focus.x} y1={focus.y - half} x2={focus.x} y2={focus.y - 6 / loupeScale} vectorEffect="non-scaling-stroke" />
          <line x1={focus.x} y1={focus.y + 6 / loupeScale} x2={focus.x} y2={focus.y + half} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
  );
}
