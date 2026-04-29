/**
 * Jest mock for p-retry (pure ESM package).
 * Executes the function directly without retrying — suitable for unit tests.
 */
async function pRetry<T>(fn: (attemptNumber: number) => Promise<T> | T, _options?: unknown): Promise<T> {
  return fn(1);
}

module.exports = pRetry;
module.exports.default = pRetry;
