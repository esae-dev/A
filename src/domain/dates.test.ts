import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, isDateKey, localDateKey } from './dates';

describe('local calendar dates', () => {
  it('uses local fields at either end of a day', () => {
    expect(localDateKey(new Date(2026, 9, 26, 0, 1))).toBe('2026-10-26');
    expect(localDateKey(new Date(2026, 9, 26, 23, 59))).toBe('2026-10-26');
  });

  it('crosses month, year and leap-year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('increments calendar days through spring and autumn DST changes', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
  });

  it('uses Sunday-zero weekday numbers', () => {
    expect(dayOfWeek('2026-10-25')).toBe(0);
    expect(dayOfWeek('2026-10-26')).toBe(1);
    expect(dayOfWeek('2026-10-31')).toBe(6);
  });

  it.each(['2025-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-01', '2026-10-26T00:00:00Z', 'not-a-date'])('rejects invalid key %s', key => {
    expect(isDateKey(key)).toBe(false);
    expect(() => addDays(key, 1)).toThrow(RangeError);
  });

  it('validates leap-year dates and rejects invalid inputs', () => {
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(() => addDays('2026-10-26', 0.5)).toThrow(RangeError);
    expect(() => localDateKey(new Date('invalid'))).toThrow(RangeError);
  });
});
