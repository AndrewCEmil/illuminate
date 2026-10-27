import type { Point, Shape } from '../data/models';

export type ToolMode = 'select' | 'draw' | 'circle' | 'pan';

/** Transient geometry shown while a shape or handle is being dragged. Never persisted. */
export type DragPreview = {
  /** The shape as it would be if the drag ended now (same id as the original). */
  shape: Shape;
  valid: boolean;
  /** Point being positioned (world coords), for the magnifier. */
  focus: Point | null;
  /** Index into shapeHandles(shape) of the handle being dragged, if any. */
  activeHandle: number | null;
};

/** Transient state of the circle tool before the circle exists. */
export type CircleDraft = {
  /** Points tapped on the rim so far (up to 2; the third creates the circle). */
  rim: Point[];
  /** Live circle while dragging from the centre. */
  dragging: { cx: number; cy: number; radius: number } | null;
};

export const EMPTY_CIRCLE_DRAFT: CircleDraft = { rim: [], dragging: null };
