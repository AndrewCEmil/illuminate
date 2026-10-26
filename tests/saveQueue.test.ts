import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveQueue } from '../src/data/saveQueue';
import type { SaveStatus } from '../src/data/saveQueue';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces and writes only the newest value', async () => {
    const writes: number[] = [];
    const q = new SaveQueue<number>(async (v) => void writes.push(v), undefined, 100);
    q.schedule(1);
    q.schedule(2);
    q.schedule(3);
    await vi.advanceTimersByTimeAsync(150);
    expect(writes).toEqual([3]);
  });

  it('never lets an older value overwrite a newer one', async () => {
    const stored: number[] = [];
    const gates: ReturnType<typeof deferred>[] = [];
    const q = new SaveQueue<number>(
      (v) => {
        const g = deferred();
        gates.push(g);
        return g.promise.then(() => void stored.push(v));
      },
      undefined,
      10,
    );
    q.schedule(1);
    await vi.advanceTimersByTimeAsync(20); // write(1) in flight
    q.schedule(2);
    q.schedule(3);
    await vi.advanceTimersByTimeAsync(20); // 3 waits for 1 to finish
    expect(gates.length).toBe(1);
    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(gates.length).toBe(2);
    gates[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(stored).toEqual([1, 3]);
    expect(q.currentStatus).toBe('saved');
  });

  it('flush writes immediately', async () => {
    const writes: number[] = [];
    const q = new SaveQueue<number>(async (v) => void writes.push(v), undefined, 10_000);
    q.schedule(7);
    await q.flush();
    expect(writes).toEqual([7]);
  });

  it('regression: flushing with nothing pending does not wedge later saves', async () => {
    const writes: number[] = [];
    const q = new SaveQueue<number>(async (v) => void writes.push(v), undefined, 10);
    await q.flush(); // e.g. visibilitychange before any edit
    await q.flush();
    q.schedule(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(writes).toEqual([1]);
    expect(q.currentStatus).toBe('saved');
  });

  it('reports errors and retries the failed value on the next flush', async () => {
    const statuses: SaveStatus[] = [];
    let fail = true;
    const writes: number[] = [];
    const q = new SaveQueue<number>(
      async (v) => {
        if (fail) throw new DOMException('full', 'QuotaExceededError');
        writes.push(v);
      },
      (s) => statuses.push(s),
      10,
    );
    q.schedule(5);
    await vi.advanceTimersByTimeAsync(20);
    expect(q.currentStatus).toBe('error');
    fail = false;
    await q.flush();
    expect(writes).toEqual([5]);
    expect(statuses).toContain('error');
    expect(q.currentStatus).toBe('saved');
  });

  it('survives a write function that throws synchronously', async () => {
    let fail = true;
    const writes: number[] = [];
    const q = new SaveQueue<number>(
      (v) => {
        if (fail) throw new Error('sync');
        writes.push(v);
        return Promise.resolve();
      },
      undefined,
      10,
    );
    q.schedule(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(q.currentStatus).toBe('error');
    fail = false;
    q.schedule(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(writes).toEqual([2]);
  });
});
