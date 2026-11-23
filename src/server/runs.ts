import type { City, GhostRoute, LeaderboardEntry, Move, MyRun, RunResult } from '../shared/types.js';
import { simulateRun } from '../shared/rules.js';
import { encodeLeaderboardScore } from '../shared/scoring.js';
import type { RedisClient } from './devvit-stubs.js';
import { updateStreak } from './streaks.js';

const TTL_14_DAYS = 14 * 24 * 60 * 60;
const MAX_RUNS_PER_DAY = 30;
/** A run with no recorded clock start gets this elapsed time (speed bonus 0). */
const NO_CLOCK_PENALTY_MS = 10 * 60 * 1000;

const lbKey = (d: string): string => `sky:lb:${d}`;
const runKey = (d: string, u: string): string => `sky:run:${d}:${u}`;
const clockKey = (d: string, u: string): string => `sky:clock:${d}:${u}`;
const edgesKey = (d: string): string => `sky:edges:${d}`;
const routesKey = (d: string): string => `sky:routes:${d}`;
const shareKey = (d: string, u: string): string => `sky:share:${d}:${u}`;
const runCountKey = (d: string, u: string): string => `sky:runcount:${d}:${u}`;

export interface StoredRun {
  points: number;
  moves: number;
  path: number[];
  username: string;
  timeMs: number;
  submittedAt: number;
}

export interface SubmitResult {
  result: RunResult;
  rank: number;
  streak: number;
  /** true when the player already had a ranked finish today (this run is practice). */
  practice: boolean;
}

/**
 * Starts the player's clock for today. Only the FIRST call counts (SET NX), so Restart,
 * reloading the page or calling this again never resets the clock.
 */
export async function startClock(userId: string, dayKey: string, redis: RedisClient, now = Date.now()): Promise<number> {
  await redis.set(clockKey(dayKey, userId), String(now), { nx: true, ex: TTL_14_DAYS });
  const raw = await redis.get(clockKey(dayKey, userId));
  return raw ? parseInt(raw, 10) : now;
}

export async function getClockStart(userId: string, dayKey: string, redis: RedisClient): Promise<number | null> {
  const raw = await redis.get(clockKey(dayKey, userId));
  return raw ? parseInt(raw, 10) : null;
}

/**
 * Validates a run with the shared rules and the SERVER clock, then stores it.
 * The first finished run of the day is the ranked one; later finishes are practice.
 */
export async function submitRun(
  city: City,
  moves: Move[],
  userId: string,
  username: string,
  dayKey: string,
  redis: RedisClient,
  now = Date.now()
): Promise<SubmitResult> {
  const countRaw = await redis.get(runCountKey(dayKey, userId));
  const runCount = countRaw ? parseInt(countRaw, 10) : 0;
  if (runCount >= MAX_RUNS_PER_DAY) {
    return {
      result: { won: false, moves: 0, goldCollected: 0, points: 0, path: [], error: 'Rate limit exceeded' },
      rank: 0,
      streak: 0,
      practice: false,
    };
  }
  await redis.set(runCountKey(dayKey, userId), String(runCount + 1), { ex: TTL_14_DAYS });

  const clock = await getClockStart(userId, dayKey, redis);
  const elapsedMs = clock === null ? NO_CLOCK_PENALTY_MS : Math.max(0, now - clock);
  const result = simulateRun(city, moves, elapsedMs);
  if (!result.won) return { result, rank: 0, streak: 0, practice: false };

  const existing = await redis.get(runKey(dayKey, userId));
  const practice = existing !== null;
  if (!practice) {
    const stored: StoredRun = {
      points: result.points,
      moves: result.moves,
      path: result.path,
      username,
      timeMs: elapsedMs,
      submittedAt: now,
    };
    await redis.set(runKey(dayKey, userId), JSON.stringify(stored), { ex: TTL_14_DAYS });
    await redis.zadd(lbKey(dayKey), { score: encodeLeaderboardScore(result.points, elapsedMs), member: userId });
    await redis.expire(lbKey(dayKey), TTL_14_DAYS);
    await recordRouteData(result.path, dayKey, redis);
  }

  const streak = await updateStreak(userId, dayKey, redis);
  const rank = await getUserRank(userId, dayKey, redis);
  return { result, rank, streak, practice };
}

async function recordRouteData(path: number[], dayKey: string, redis: RedisClient): Promise<void> {
  const routeStr = path.join('-');
  const existing = await redis.hget(routesKey(dayKey), routeStr);
  await redis.hset(routesKey(dayKey), { [routeStr]: String(existing ? parseInt(existing, 10) + 1 : 1) });
  await redis.expire(routesKey(dayKey), TTL_14_DAYS);
  for (let i = 0; i < path.length - 1; i++) {
    const field = `${path[i]}>${path[i + 1]}`;
    const prev = await redis.hget(edgesKey(dayKey), field);
    await redis.hset(edgesKey(dayKey), { [field]: String(prev ? parseInt(prev, 10) + 1 : 1) });
  }
  await redis.expire(edgesKey(dayKey), TTL_14_DAYS);
}

/** 1-based rank (1 = best), 0 if not ranked. */
export async function getUserRank(userId: string, dayKey: string, redis: RedisClient): Promise<number> {
  const entries = await redis.zrevrangeWithScores(lbKey(dayKey), 0, -1);
  const idx = entries.findIndex((e) => e.member === userId);
  return idx === -1 ? 0 : idx + 1;
}

export async function getLeaderboard(
  userId: string,
  dayKey: string,
  redis: RedisClient
): Promise<{ top: LeaderboardEntry[]; myRank: number }> {
  const entries = await redis.zrevrangeWithScores(lbKey(dayKey), 0, 19);
  const top: LeaderboardEntry[] = await Promise.all(
    entries.map(async (e, idx) => {
      const runRaw = await redis.get(runKey(dayKey, e.member));
      const run = runRaw ? (JSON.parse(runRaw) as StoredRun) : null;
      return {
        username: run?.username ?? 'Player',
        points: run?.points ?? 0,
        moves: run?.moves ?? 0,
        timeMs: run?.timeMs ?? 0,
        rank: idx + 1,
      };
    })
  );
  return { top, myRank: await getUserRank(userId, dayKey, redis) };
}

/** Top 3 routes. null until the caller has finished today. */
export async function getGhosts(userId: string, dayKey: string, redis: RedisClient): Promise<GhostRoute[] | null> {
  if (!(await redis.get(runKey(dayKey, userId)))) return null;
  const all = await redis.hgetall(routesKey(dayKey));
  if (!all) return [];
  return Object.entries(all)
    .map(([path, count]) => ({ path: path.split('-').map(Number), count: parseInt(count, 10) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/** Posts the result as a comment for the user (once per day). */
export async function shareAsComment(
  userId: string,
  dayKey: string,
  commentText: string,
  postId: string,
  redis: RedisClient,
  submitComment: (id: string, text: string) => Promise<void>
): Promise<{ ok: boolean; error?: string }> {
  const key = shareKey(dayKey, userId);
  if (await redis.get(key)) return { ok: false, error: 'Already shared today' };
  await submitComment(postId, commentText);
  await redis.set(key, '1', { ex: TTL_14_DAYS });
  return { ok: true };
}

/** The player's ranked run today, if any. */
export async function getMyBest(userId: string, dayKey: string, redis: RedisClient): Promise<MyRun | null> {
  const raw = await redis.get(runKey(dayKey, userId));
  if (!raw) return null;
  const run = JSON.parse(raw) as StoredRun;
  return { points: run.points, moves: run.moves, path: run.path, timeMs: run.timeMs ?? 0 };
}
