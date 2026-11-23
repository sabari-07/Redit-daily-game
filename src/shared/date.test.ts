import { describe, it, expect } from 'vitest';
import { utcDayKey, parseDayKey, yesterdayKey, epochDay, utcWeekday, targetParRange } from './date.js';

describe('utcDayKey', () => {
  it('formats correctly', () => {
    const d = new Date('2024-03-05T14:30:00Z');
    expect(utcDayKey(d)).toBe('2024-03-05');
  });
});

describe('parseDayKey', () => {
  it('parses to UTC midnight', () => {
    const d = parseDayKey('2024-01-15');
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(0);
  });
});

describe('yesterdayKey', () => {
  it('returns previous day', () => {
    expect(yesterdayKey('2024-03-05')).toBe('2024-03-04');
  });

  it('wraps month correctly', () => {
    expect(yesterdayKey('2024-03-01')).toBe('2024-02-29');
  });
});

describe('epochDay', () => {
  it('is consistent', () => {
    const d1 = epochDay('2024-01-01');
    const d2 = epochDay('2024-01-02');
    expect(d2 - d1).toBe(1);
  });
});

describe('utcWeekday', () => {
  it('returns correct day for known date', () => {
    // 2024-01-01 was a Monday
    expect(utcWeekday('2024-01-01')).toBe(1);
  });
});

describe('targetParRange', () => {
  it('Monday is Easy (5-6)', () => {
    expect(targetParRange(1)).toEqual([5, 6]);
  });
  it('Wednesday is Medium (7-8)', () => {
    expect(targetParRange(3)).toEqual([7, 8]);
  });
  it('Friday is Hard (9-10)', () => {
    expect(targetParRange(5)).toEqual([9, 10]);
  });
  it('Sunday is Hard (10-12)', () => {
    expect(targetParRange(0)).toEqual([10, 12]);
  });
});
