/**
 * Async utilities for safe concurrent operations.
 *
 * This module provides utilities to prevent DoS vectors from unbounded
 * Promise.all() parallelism and handle individual promise rejections gracefully.
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
 * Execute promises with bounded concurrency.
 *
 * Unlike Promise.all, this limits how many operations run simultaneously,
 * preventing resource exhaustion (memory, connections, CPU) that could
 * lead to DoS conditions.
 *
 * @param tasks - Array of functions returning promises (lazy evaluation)
 * @param options - Concurrency options
 * @returns Array of results in the same order as input
 *
 * @example
 * // Process 1000 items with max 10 concurrent operations
 * const results = await mapWithConcurrency(
 *   items,
 *   async (item) => processItem(item),
 *   { concurrency: 10 }
 * );
 */
export async function promiseAllWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  options: ConcurrencyOptions = {},
): Promise<SettledResult<T>[]> {
  const { concurrency = 10, failFast = false, onProgress } = options;

  if (tasks.length === 0) {
    return [];
  }

  const results: SettledResult<T>[] = new Array<SettledResult<T>>(tasks.length);
  let currentIndex = 0;
  let completedCount = 0;
  let hasRejection = false;
  let firstRejection: Error | undefined;

  const runTask = async (): Promise<void> => {
    while (currentIndex < tasks.length) {
      // Early exit if failFast and we've already rejected
      if (failFast && hasRejection) {
        return;
      }

      const index = currentIndex++;
      const task = tasks[index];

      // Skip if task is undefined (should never happen but TypeScript needs assurance)
      if (!task) {
        continue;
      }

      try {
        const value = await task();
        results[index] = { status: 'fulfilled', value };
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error));
        results[index] = { status: 'rejected', reason };
        hasRejection = true;
        firstRejection = firstRejection || reason;
      }

      completedCount++;
      if (onProgress) {
        onProgress(completedCount, tasks.length);
      }
    }
  };

  // Start concurrent workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(runTask());
  }

  await Promise.all(workers);

  if (failFast && firstRejection) {
    throw firstRejection;
  }

  return results;
}

/**
 * Map over an array with bounded concurrency.
 *
 * @param items - Array of items to process
 * @param mapper - Async function to apply to each item
 * @param options - Concurrency options
 * @returns Array of successful results (rejected items are filtered out)
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions = {},
): Promise<R[]> {
  const tasks = items.map((item, index) => () => mapper(item, index));
  const results = await promiseAllWithConcurrency(tasks, options);

  // Return only fulfilled values
  return results
    .filter((result): result is SettledResult<R> & { status: 'fulfilled'; value: R } => result.status === 'fulfilled')
    .map((result) => result.value);
}

/**
 * Execute cache deletions with bounded concurrency.
 *
 * @param deleteFn - Function to delete a single key
 * @param keys - Array of keys to delete
 * @param concurrency - Max concurrent deletions (default: 50)
 * @returns Number of successfully deleted keys
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
 *
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
