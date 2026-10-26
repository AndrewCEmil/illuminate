export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced, strictly ordered autosave. Only one write is in flight at a time
 * and each write takes the newest scheduled value, so an older document can
 * never overwrite a newer one.
 */
export class SaveQueue<T> {
  private latest: { value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private status: SaveStatus = 'saved';

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onStatus: (status: SaveStatus, error?: unknown) => void = () => {},
    private readonly delayMs = 300,
  ) {}

  get currentStatus(): SaveStatus {
    return this.status;
  }

  get hasPending(): boolean {
    return this.latest !== null || this.running !== null;
  }

  schedule(value: T): void {
    this.latest = { value };
    this.setStatus('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.delayMs);
  }

  /** Writes any pending value now and resolves once everything queued so far is stored. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.run();
    // A value may have been scheduled while the previous write was running.
    if (this.latest) await this.run();
  }

  private run(): Promise<void> {
    if (this.running) return this.running;
    if (!this.latest) return Promise.resolve();
    this.running = (async () => {
      // Yield first so `this.running` is assigned before the body (and its `finally`) can run.
      await null;
      try {
        while (this.latest) {
          const { value } = this.latest;
          this.latest = null;
          this.setStatus('saving');
          try {
            await this.write(value);
          } catch (err) {
            // Keep the failed value unless something newer arrived; retry on next schedule/flush.
            if (!this.latest) this.latest = { value };
            this.setStatus('error', err);
            return;
          }
        }
        this.setStatus('saved');
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private setStatus(status: SaveStatus, error?: unknown): void {
    this.status = status;
    this.onStatus(status, error);
  }
}
