import PQueue from 'p-queue';

/**
 * Async utilities for safe concurrent operations.
 *
 * Uses p-queue to prevent DoS vectors from unbounded Promise.all() parallelism.
 */

/**
 * Result of a settled promise operation.
 */
export interface SettledResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: Error;
  index?: number;
}

/**
 * Options for concurrent execution.
 */
export interface ConcurrencyOptions {
  /** Maximum concurrent operations (default: 10) */
  concurrency?: number;
  /** Whether to throw on first rejection (default: false) */
  failFast?: boolean;
  /** Optional callback for progress tracking */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Execute promises with bounded concurrency via p-queue.
 */
export async function promiseAllWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  options: ConcurrencyOptions = {},
): Promise<SettledResult<T>[]> {
  const { concurrency = 10, failFast = false, onProgress } = options;

  if (tasks.length === 0) return [];

  const results: SettledResult<T>[] = new Array<SettledResult<T>>(tasks.length);
  const queue = new PQueue({ concurrency });
  let completedCount = 0;
  let firstRejection: Error | undefined;

  const enqueued = tasks.map((task, index) =>
    queue.add(async () => {
      if (failFast && firstRejection) return;
      try {
        const value = await task();
        results[index] = { status: 'fulfilled', value };
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error));
        results[index] = { status: 'rejected', reason, index };
        firstRejection = firstRejection ?? reason;
      }
      completedCount++;
      onProgress?.(completedCount, tasks.length);
    }),
  );

  await Promise.all(enqueued);

  if (failFast && firstRejection) {
    throw firstRejection;
  }

  return results;
}

/**
 * Map over an array with bounded concurrency.
 * Fulfilled results are collected and returned.
 * Rejected results are logged as warnings and omitted from the output — the
 * caller receives a shorter array than the input, which it must handle.
 * Use `promiseAllWithConcurrency` directly if silent omission is unacceptable.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions & { onRejected?: (reason: Error, index: number) => void } = {},
): Promise<R[]> {
  const tasks = items.map((item, index) => () => mapper(item, index));
  const results = await promiseAllWithConcurrency(tasks, options);

  const fulfilled: R[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== undefined) {
      fulfilled.push(result.value);
    } else if (result.status === 'rejected') {
      if (options.onRejected) {
        options.onRejected(result.reason ?? new Error('Unknown error'), result.index ?? -1);
      }
    }
  }
  return fulfilled;
}

/**
 * Execute cache deletions with bounded concurrency.
 */
export async function batchDelete<T>(
  deleteFn: (key: string) => Promise<T>,
  keys: string[],
  concurrency = 50,
): Promise<number> {
  const results = await promiseAllWithConcurrency(
    keys.map((key) => () => deleteFn(key)),
    { concurrency },
  );

  return results.filter((r) => r.status === 'fulfilled').length;
}

/**
 * Chunk an array into smaller batches.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
