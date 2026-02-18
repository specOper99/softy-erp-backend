/**
 * Booking window utilities for computing booking time ranges and detecting overlaps.
 * Supports the staff conflict engine (T7).
 */

export interface BookingWindow {
  start: Date;
  end: Date;
}

/**
 * Parse start time string (HH:mm) into hours and minutes.
 */
function parseTimeString(time: string): { hours: number; minutes: number } {
  const parts = time.split(':');
  const hoursStr = parts[0];
  const minutesStr = parts[1];

  if (!hoursStr || !minutesStr) {
    throw new Error(`Invalid time format: ${time}. Expected HH:mm format.`);
  }

  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${time}. Expected HH:mm format.`);
  }

  return { hours, minutes };
}

/**
 * Parse eventDate and startTime into a combined Date object.
 * Uses the date part from eventDate and sets hours/minutes from startTime.
 *
 * @param eventDate - The date of the event (time component is ignored)
 * @param startTime - Start time in HH:mm format (e.g., "14:30")
 * @returns Combined Date with eventDate's date and startTime's hours/minutes
 */
export function parseStartDateTime(eventDate: Date, startTime: string): Date {
  const { hours, minutes } = parseTimeString(startTime);

  const result = new Date(eventDate);
  result.setHours(hours, minutes, 0, 0);

  return result;
}

/**
 * Compute the booking window (start and end Date objects) from booking data.
 *
 * @param eventDate - The date of the event
 * @param startTime - Start time in HH:mm format (e.g., "14:30")
 * @param durationMinutes - Duration of the booking in minutes
 * @returns Object with start and end Date objects
 */
export function computeBookingWindow(eventDate: Date, startTime: string, durationMinutes: number): BookingWindow {
  const start = parseStartDateTime(eventDate, startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return { start, end };
}

/**
 * Check if two booking windows overlap using half-open intervals [start, end).
 * Boundary touching (a.end === b.start) is NOT considered overlap.
 *
 * @param a - First booking window
 * @param b - Second booking window
 * @returns true if windows overlap, false otherwise
 *
 * @example
 * ```typescript
 * // These do NOT overlap (boundary touch)
 * windowsOverlap({ start: new Date('2024-01-01T10:00'), end: new Date('2024-01-01T11:00') },
 *                { start: new Date('2024-01-01T11:00'), end: new Date('2024-01-01T12:00') });
 * // returns false
 *
 * // These DO overlap
 * windowsOverlap({ start: new Date('2024-01-01T10:00'), end: new Date('2024-01-01T11:30') },
 *                { start: new Date('2024-01-01T11:00'), end: new Date('2024-01-01T12:00') });
 * // returns true
 * ```
 */
export function windowsOverlap(a: BookingWindow, b: BookingWindow): boolean {
  // Half-open interval [start, end): overlap if a.start < b.end AND b.start < a.end
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}
