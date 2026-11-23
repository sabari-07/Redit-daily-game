import { describe, it, expect, beforeEach } from 'vitest';
import type { RedisClient } from './devvit-stubs.js';
import { submitRun, getLeaderboard, getGhosts, startClock, getMyBest } from './runs.js';
import { updateStreak } from './streaks.js';
import { validateSourceCommunities } from './reddit.js';
import { buildCity } from '../shared/city.js';
import { solvePar, solveRoute } from '../shared/solver.js';
import { encodeLeaderboardScore } from '../shared/scoring.js';
import type { City, Move } from '../shared/types.js';
import { generateFixturePosts } from './reddit.js';

// In-memory fake Redis
function makeFakeRedis(): RedisClient {
  const store = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Array<{ member: string; score: number }>>();

  return {
    get(key) { return Promise.resolve(store.get(key) ?? null); },
    set(key, value, opts) {
      if (opts?.nx && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK' as const);
    },
    del(key) {
      const had = store.has(key);
      store.delete(key);
      return Promise.resolve(had ? 1 : 0);
    },
    expire(_key, _ttl) { return Promise.resolve(); },
    zadd(key, { score, member }) {
      let entries = zsets.get(key) ?? [];
      entries = entries.filter((e) => e.member !== member);
      entries.push({ member, score });
      zsets.set(key, entries);
      return Promise.resolve();
    },
    zrevrangeWithScores(key, start, stop) {
      const entries = [...(zsets.get(key) ?? [])].sort((a, b) => b.score - a.score);
      const end = stop === -1 ? entries.length : stop + 1;
      return Promise.resolve(entries.slice(start, end));
    },
    zrank(_key, _member) { return Promise.resolve(null); },
    hset(key, fields) {
      let h = hashes.get(key);
      if (!h) { h = new Map(); hashes.set(key, h); }
      for (const [f, v] of Object.entries(fields)) h.set(f, v);
      return Promise.resolve();
    },
    hget(key, field) { return Promise.resolve(hashes.get(key)?.get(field) ?? null); },
    hgetall(key) {
      const h = hashes.get(key);
      if (!h) return Promise.resolve(null);
      return Promise.resolve(Object.fromEntries(h.entries()));
    },
  };
}

function makeCity(): City {
  const posts = generateFixturePosts(20);
  return buildCity(posts, 'testsub', '2024-01-01');
}

/** Winning moves from the real solver (same rules the server enforces). */
function findWinningMoves(city: City): Move[] {
  return solveRoute(city)?.moves ?? [];
}

const DAY = '2024-01-01';
describe('submitRun', () => {
  let redis: RedisClient;
  let city: City;

  beforeEach(() => {
    redis = makeFakeRedis();
    city = makeCity();
  });

  it('rejects a forged run (a jump that is not possible)', async () => {
    const far = city.buildings.findIndex((_, i) => i !== city.startIndex && i !== city.summitIndex);
    const { result } = await submitRun(city, [{ to: city.summitIndex, tool: 'walk' }, { to: far, tool: 'walk' }], 'u2', 'User2', DAY, redis);
    expect(result.won).toBe(false);
  });

  it('accepts the solver route and scores it on the server clock', async () => {
    const moves = findWinningMoves(city);
    expect(moves.length).toBe(solvePar(city));
    await startClock('u1', DAY, redis, 1_000_000);
    const { result, practice } = await submitRun(city, moves, 'u1', 'User1', DAY, redis, 1_000_000 + 30_000);
    expect(result.won).toBe(true);
    expect(result.elapsedMs).toBe(30_000);
    expect(practice).toBe(false);
    // Par route, 30 s: 500 + 250 + speed (1000 - 4*30) + gold/tools bonuses >= 1630
    expect(result.points).toBeGreaterThanOrEqual(1630);
  });

  it('gives no speed bonus when the clock was never started', async () => {
    const moves = findWinningMoves(city);
    const { result } = await submitRun(city, moves, 'u1', 'User1', DAY, redis);
    expect(result.won).toBe(true);
    expect(result.elapsedMs).toBe(10 * 60 * 1000);
  });

  it('clock start cannot be reset by calling start again', async () => {
    const first = await startClock('u1', DAY, redis, 5_000);
    const again = await startClock('u1', DAY, redis, 90_000);
    expect(again).toBe(first);
  });

  it('only the first finish is ranked; later finishes are practice', async () => {
    const moves = findWinningMoves(city);
    await startClock('u1', DAY, redis, 0);
    const first = await submitRun(city, moves, 'u1', 'User1', DAY, redis, 100_000);
    const second = await submitRun(city, moves, 'u1', 'User1', DAY, redis, 200_000);
    expect(first.practice).toBe(false);
    expect(second.practice).toBe(true);
    const best = await getMyBest('u1', DAY, redis);
    expect(best?.timeMs).toBe(100_000);
    expect(best?.points).toBe(first.result.points);
  });

  it('rejects out-of-range index', async () => {
    const { result } = await submitRun(city, [{ to: 9999, tool: 'walk' }], 'u1', 'User1', DAY, redis);
    expect(result.won).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects too many moves (> 25)', async () => {
    const moves: Move[] = Array.from({ length: 26 }, (_, i) => ({ to: i % city.buildings.length, tool: 'walk' as const }));
    const { result } = await submitRun(city, moves, 'u1', 'User1', DAY, redis);
    expect(result.error).toContain('Too many moves');
  });

  it('rate limits after 30 runs', async () => {
    for (let i = 0; i < 30; i++) await submitRun(city, [], 'u1', 'User1', DAY, redis);
    const { result } = await submitRun(city, [], 'u1', 'User1', DAY, redis);
    expect(result.error).toContain('Rate limit');
  });

  it('equal points: the faster player ranks first', async () => {
    const moves = findWinningMoves(city);
    // Both finish beyond 4:10, so both get speed bonus 0 and identical points.
    await startClock('slow', DAY, redis, 0);
    await startClock('fast', DAY, redis, 0);
    await submitRun(city, moves, 'slow', 'Slow', DAY, redis, 400_000);
    await submitRun(city, moves, 'fast', 'Fast', DAY, redis, 300_000);
    const { top } = await getLeaderboard('slow', DAY, redis);
    expect(top[0]?.points).toBe(top[1]?.points);
    expect(top[0]?.username).toBe('Fast');
    expect(top[0]?.timeMs).toBe(300_000);
  });

  it('a faster finish earns more points and ranks higher', async () => {
    const moves = findWinningMoves(city);
    await startClock('a', DAY, redis, 0);
    await startClock('b', DAY, redis, 0);
    await submitRun(city, moves, 'a', 'A', DAY, redis, 10_000); // big speed bonus
    await submitRun(city, moves, 'b', 'B', DAY, redis, 9_000); // even faster
    const { top } = await getLeaderboard('a', DAY, redis);
    expect(top[0]?.username).toBe('B');
    expect(top[0].points).toBeGreaterThan(top[1].points);
  });
});
describe('ghost gating', () => {
  let redis: RedisClient;
  let city: City;

  beforeEach(() => {
    redis = makeFakeRedis();
    city = makeCity();
  });

  it('returns null before a win', async () => {
    const ghosts = await getGhosts('u1', '2024-01-01', redis);
    expect(ghosts).toBeNull();
  });

  it('returns routes after a win', async () => {
    const moves = findWinningMoves(city);
    expect(moves.length).toBeGreaterThan(0);
    await submitRun(city, moves, 'u1', 'User1', DAY, redis);
    const ghosts = await getGhosts('u1', '2024-01-01', redis);
    expect(ghosts).not.toBeNull();
    expect(Array.isArray(ghosts)).toBe(true);
  });
});

describe('streak transitions', () => {
  let redis: RedisClient;

  beforeEach(() => { redis = makeFakeRedis(); });

  it('first win gives streak 1', async () => {
    const count = await updateStreak('u1', '2024-01-15', redis);
    expect(count).toBe(1);
  });

  it('two consecutive days gives streak 2', async () => {
    await updateStreak('u1', '2024-01-14', redis);
    const count = await updateStreak('u1', '2024-01-15', redis);
    expect(count).toBe(2);
  });

  it('same day twice stays at current count', async () => {
    await updateStreak('u1', '2024-01-15', redis);
    const count = await updateStreak('u1', '2024-01-15', redis);
    expect(count).toBe(1);
  });

  it('broken streak resets to 1', async () => {
    await updateStreak('u1', '2024-01-10', redis);
    const count = await updateStreak('u1', '2024-01-15', redis);
    expect(count).toBe(1);
  });
});

describe('leaderboard score encoding', () => {
  it('stays below 2^53 for any realistic score and time', () => {
    const score = encodeLeaderboardScore(5000, 999_999_999);
    expect(score).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
describe('validateSourceCommunities', () => {
  it('accepts valid names', () => {
    expect(validateSourceCommunities('pics, AskReddit').valid).toBe(true);
  });

  it('rejects too many communities', () => {
    const result = validateSourceCommunities('a, b, c, d, e, f');
    expect(result.valid).toBe(false);
  });

  it('rejects invalid characters', () => {
    const result = validateSourceCommunities('invalid name!');
    expect(result.valid).toBe(false);
  });

  it('accepts empty string', () => {
    expect(validateSourceCommunities('').valid).toBe(true);
  });
});
