import type { RedisClient } from './devvit-stubs.js';
import { yesterdayKey } from '../shared/date.js';

const STREAK_KEY_PREFIX = 'sky:streak:';

interface StreakData {
  last: string;
  count: number;
}

function streakKey(userId: string): string {
  return `${STREAK_KEY_PREFIX}${userId}`;
}

/** Reads the current streak for a user (returns 0 if never played) */
export async function getStreak(userId: string, redis: RedisClient): Promise<number> {
  const last = await redis.hget(streakKey(userId), 'last');
  const count = await redis.hget(streakKey(userId), 'count');
  if (!last || !count) return 0;
  return parseInt(count, 10);
}

/**
 * Updates the streak after a won run.
 * Per plan 5.6:
 *   - last == yesterday → count + 1
 *   - last == today     → count unchanged (already counted today)
 *   - otherwise         → reset to 1
 * No TTL on streak keys (persist indefinitely).
 */
export async function updateStreak(
  userId: string,
  dayKey: string,
  redis: RedisClient
): Promise<number> {
  const last = await redis.hget(streakKey(userId), 'last');
  const countRaw = await redis.hget(streakKey(userId), 'count');
  const prevCount = countRaw ? parseInt(countRaw, 10) : 0;

  let newCount: number;
  if (last === dayKey) {
    // Already counted today
    newCount = prevCount;
  } else if (last === yesterdayKey(dayKey)) {
    newCount = prevCount + 1;
  } else {
    newCount = 1;
  }

  await redis.hset(streakKey(userId), { last: dayKey, count: String(newCount) });
  return newCount;
}

/** Returns streak data for display */
export async function getStreakData(
  userId: string,
  redis: RedisClient
): Promise<StreakData> {
  const last = await redis.hget(streakKey(userId), 'last');
  const countRaw = await redis.hget(streakKey(userId), 'count');
  return {
    last: last ?? '',
    count: countRaw ? parseInt(countRaw, 10) : 0,
  };
}
