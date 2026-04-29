/**
 * Jest mock for p-queue (pure ESM package).
 * Provides a synchronous no-queue fallback suitable for unit tests.
 */
class PQueue {
  private concurrency: number;

  constructor(options?: { concurrency?: number }) {
    this.concurrency = options?.concurrency ?? Infinity;
  }

  async add<T>(fn: () => Promise<T> | T): Promise<T> {
    return fn();
  }

  get size(): number {
    return 0;
  }

  get pending(): number {
    return 0;
  }

  async onEmpty(): Promise<void> {}
  async onIdle(): Promise<void> {}
  async onSizeLessThan(): Promise<void> {}
}

module.exports = PQueue;
module.exports.default = PQueue;
