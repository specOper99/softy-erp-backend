import { computeBookingWindow, parseStartDateTime, windowsOverlap } from './booking-window.util';

describe('BookingWindowUtil', () => {
  describe('parseStartDateTime', () => {
    it('should combine eventDate date with startTime hours and minutes', () => {
      const eventDate = new Date('2024-06-15T08:00:00.000Z');
      const result = parseStartDateTime(eventDate, '14:30');

      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5); // June (0-indexed)
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it('should handle midnight start time', () => {
      const eventDate = new Date('2024-06-15T12:00:00.000Z');
      const result = parseStartDateTime(eventDate, '00:00');

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('should handle end of day start time', () => {
      const eventDate = new Date('2024-06-15T12:00:00.000Z');
      const result = parseStartDateTime(eventDate, '23:59');

      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });

    it('should throw on invalid time format', () => {
      const eventDate = new Date('2024-06-15T08:00:00.000Z');
      expect(() => parseStartDateTime(eventDate, '25:00')).toThrow();
      expect(() => parseStartDateTime(eventDate, '12:60')).toThrow();
      expect(() => parseStartDateTime(eventDate, 'invalid')).toThrow();
    });
  });

  describe('computeBookingWindow', () => {
    it('should compute correct start and end dates', () => {
      const eventDate = new Date('2024-06-15T08:00:00.000Z');
      const result = computeBookingWindow(eventDate, '14:30', 90);

      expect(result.start.getHours()).toBe(14);
      expect(result.start.getMinutes()).toBe(30);
      expect(result.end.getHours()).toBe(16);
      expect(result.end.getMinutes()).toBe(0);
    });

    it('should add durationMinutes correctly', () => {
      const eventDate = new Date('2024-06-15T08:00:00.000Z');
      const result = computeBookingWindow(eventDate, '10:00', 60);

      const expectedEnd = new Date(result.start);
      expectedEnd.setMinutes(expectedEnd.getMinutes() + 60);

      expect(result.end.getTime()).toBe(expectedEnd.getTime());
    });

    it('should handle 24-hour duration', () => {
      const eventDate = new Date('2024-06-15T08:00:00.000Z');
      const result = computeBookingWindow(eventDate, '00:00', 1440); // 24 hours = 1440 minutes

      expect(result.start.getDate()).toBe(15);
      expect(result.end.getDate()).toBe(16);
    });
  });

  describe('windowsOverlap', () => {
    const createWindow = (startHour: number, endHour: number) => ({
      start: new Date(`2024-06-15T${String(startHour).padStart(2, '0')}:00:00.000Z`),
      end: new Date(`2024-06-15T${String(endHour).padStart(2, '0')}:00:00.000Z`),
    });

    it('should return false when a.end === b.start (boundary touch - NOT overlap)', () => {
      const a = createWindow(10, 11);
      const b = createWindow(11, 12);

      expect(windowsOverlap(a, b)).toBe(false);
      expect(windowsOverlap(b, a)).toBe(false);
    });

    it('should return true when a.start < b.end && b.start < a.end (overlap)', () => {
      const a = createWindow(10, 12);
      const b = createWindow(11, 13);

      expect(windowsOverlap(a, b)).toBe(true);
      expect(windowsOverlap(b, a)).toBe(true);
    });

    it('should return false when windows do not overlap (gap)', () => {
      const a = createWindow(10, 11);
      const b = createWindow(13, 14);

      expect(windowsOverlap(a, b)).toBe(false);
      expect(windowsOverlap(b, a)).toBe(false);
    });

    it('should return true when one window contains another', () => {
      const a = createWindow(9, 15);
      const b = createWindow(11, 13);

      expect(windowsOverlap(a, b)).toBe(true);
    });

    it('should return true when windows are identical', () => {
      const a = createWindow(10, 12);
      const b = createWindow(10, 12);

      expect(windowsOverlap(a, b)).toBe(true);
    });

    it('should return false when a is entirely before b', () => {
      const a = createWindow(8, 10);
      const b = createWindow(12, 14);

      expect(windowsOverlap(a, b)).toBe(false);
    });

    it('should return false when a is entirely after b', () => {
      const a = createWindow(14, 16);
      const b = createWindow(10, 12);

      expect(windowsOverlap(a, b)).toBe(false);
    });

    it('should handle edge case where a.start === b.start', () => {
      const a = { start: new Date('2024-06-15T10:00:00'), end: new Date('2024-06-15T11:30:00') };
      const b = { start: new Date('2024-06-15T10:00:00'), end: new Date('2024-06-15T12:00:00') };

      expect(windowsOverlap(a, b)).toBe(true);
    });

    it('should handle edge case where a.end === b.end', () => {
      const a = { start: new Date('2024-06-15T09:00:00'), end: new Date('2024-06-15T12:00:00') };
      const b = { start: new Date('2024-06-15T10:00:00'), end: new Date('2024-06-15T12:00:00') };

      expect(windowsOverlap(a, b)).toBe(true);
    });
  });
});
