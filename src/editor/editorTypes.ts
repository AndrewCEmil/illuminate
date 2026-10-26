import type { Point } from '../data/models';

export type ToolMode = 'draw' | 'select' | 'pan';

/** Transient geometry shown while a shape or vertex is being dragged. Never persisted. */
export type DragPreview = {
  shapeId: string;
  points: Point[];
  valid: boolean;
  /** Vertex being dragged (world coords), for the magnifier. */
  focus: Point | null;
  vertexIndex: number | null;
};
