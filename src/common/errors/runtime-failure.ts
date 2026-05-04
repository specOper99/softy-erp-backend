/**
 * RuntimeFailure
 * ---------------
 * A lightweight error class used throughout the codebase to represent
 * unrecoverable runtime conditions (e.g., mis‑configuration, security
 * violations, unexpected state). It extends the native `Error` class
 * and sets a consistent name so that error‑handling middleware can
 * reliably identify and transform it into an HTTP response.
 */
export class RuntimeFailure extends Error {
  /** Optional underlying cause (e.g., caught error) */
  public readonly cause?: unknown;

  /**
   * Create a new RuntimeFailure.
   * @param message Human‑readable description of the failure.
   * @param options Optional object containing a `cause` property.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    // Preserve the original cause if provided.
    if (options?.cause) {
      this.cause = options.cause;
    }
    // Explicitly set the prototype to maintain instanceof checks when
    // targeting ES5 output.
    Object.setPrototypeOf(this, RuntimeFailure.prototype);
    this.name = 'RuntimeFailure';
    // Capture stack trace (V8 specific) for better debugging.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RuntimeFailure);
    }
  }
}
