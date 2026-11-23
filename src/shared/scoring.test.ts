import { describe, it, expect } from 'vitest';
import { computeScore, scoreBreakdown, encodeLeaderboardScore, speedBonus, formatClock, SCORE_RULES } from './scoring.js';

describe('scoreBreakdown', () => {
  it('par route, no extras, 0 s on the clock', () => {
    expect(scoreBreakdown(6, 6, 0, 0, 0)).toEqual({
      summit: 500, route: 0, perfect: 250, gold: 0, tools: 0, speed: 1000, total: 1750,
    });
  });
  it('rewards each jump under par and penalizes each jump over', () => {
    expect(scoreBreakdown(6, 5, 0, 0, 0).route).toBe(150);
    const over = scoreBreakdown(6, 8, 0, 0, 0);
    expect(over.route).toBe(-200);
    expect(over.perfect).toBe(0);
  });
  it('adds gold and unused tools', () => {
    const b = scoreBreakdown(6, 6, 2, 3, 0);
    expect(b.gold).toBe(200);
    expect(b.tools).toBe(150);
  });
  it('total is the sum of its parts when above the floor', () => {
    const b = scoreBreakdown(8, 7, 1, 2, 61_500);
    expect(b.total).toBe(b.summit + b.route + b.perfect + b.gold + b.tools + b.speed);
  });
  it('never drops below the floor', () => {
    expect(scoreBreakdown(5, 25, 0, 0, 999_000).total).toBe(SCORE_RULES.floor);
  });
});

describe('speedBonus', () => {
  it('starts at 1000 and loses 4 per whole second', () => {
    expect(speedBonus(0)).toBe(1000);
    expect(speedBonus(999)).toBe(1000);
    expect(speedBonus(1000)).toBe(996);
    expect(speedBonus(60_000)).toBe(760);
  });
  it('reaches 0 at 4:10 and never goes negative', () => {
    expect(speedBonus(250_000)).toBe(0);
    expect(speedBonus(1_000_000)).toBe(0);
  });
  it('same route: faster always scores more', () => {
    expect(computeScore(7, 7, 0, 0, 30_000)).toBeGreaterThan(computeScore(7, 7, 0, 0, 90_000));
  });
});

describe('formatClock', () => {
  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatClock(600_000)).toBe('10:00');
  });
});

describe('encodeLeaderboardScore', () => {
  it('higher points rank higher regardless of time', () => {
    expect(encodeLeaderboardScore(1500, 200_000)).toBeGreaterThan(encodeLeaderboardScore(1400, 1_000));
  });
  it('equal points: faster ranks higher', () => {
    expect(encodeLeaderboardScore(1000, 30_000)).toBeGreaterThan(encodeLeaderboardScore(1000, 31_000));
  });
  it('stays below 2^53', () => {
    expect(encodeLeaderboardScore(5000, 999_999_999)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
