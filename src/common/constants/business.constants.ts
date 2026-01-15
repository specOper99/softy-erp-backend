/**
 * Business logic constants extracted from various services.
 * Centralizing these values improves maintainability and testability.
 */
export const BUSINESS_CONSTANTS = {
  BOOKING: {
    /** Minimum lead time for new bookings (1 hour in ms) */
    MIN_LEAD_TIME_MS: 60 * 60 * 1000,
    /** Maximum allowed tax rate percentage */
    MAX_TAX_RATE_PERCENT: 50,
  },
  PRIVACY: {
    /** Directory for temporary privacy export files */
    TEMP_EXPORT_DIR: process.env.PRIVACY_TEMP_DIR || '/tmp/privacy-exports',
    /** Maximum ZIP export file size in MB */
    MAX_EXPORT_SIZE_MB: 100,
    /** Maximum records per table in export */
    MAX_RECORDS_PER_TABLE: 1000,
  },
  SEARCH: {
    /** Minimum search query length */
    MIN_LENGTH: 3,
    /** Maximum search query length */
    MAX_LENGTH: 100,
  },
} as const;

export type BusinessConstants = typeof BUSINESS_CONSTANTS;
