/**
 * Bounded snapshot history. Documents are small (arrays of points), so whole
 * snapshots are simpler and safer than inverse operations.
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records `next` as a new undoable step. Clears the redo branch. */
export function commit<T>(history: History<T>, next: T, limit = DEFAULT_HISTORY_LIMIT): History<T> {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

/** Replaces the present without creating an undo step (e.g. non-artwork settings). */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const past = history.past.slice(0, -1);
  const previous = history.past[history.past.length - 1] as T;
  return { past, present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const [next, ...future] = history.future as [T, ...T[]];
  return { past: [...history.past, history.present], present: next, future };
}
