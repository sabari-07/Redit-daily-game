import type { City, RawPost } from '../shared/types.js';
import { buildCity } from '../shared/city.js';
import { utcDayKey, epochDay } from '../shared/date.js';
import type { RedisClient, DevvitContext } from './devvit-stubs.js';
import type { PostSource } from './reddit.js';
import { fetchEligiblePosts, parseSourceCommunities } from './reddit.js';

const TTL_14_DAYS = 14 * 24 * 60 * 60;
const LOCK_TTL = 30;
const EPOCH_KEY = 'sky:epoch';

function cityKey(dayKey: string): string {
  return `sky:city:${dayKey}`;
}

function lockKey(dayKey: string): string {
  return `sky:lock:${dayKey}`;
}

/** Returns the city for a given day, creating it if not yet stored. */
export async function getOrCreateCity(
  dayKey: string,
  subreddit: string,
  redis: RedisClient,
  source: PostSource,
  ctx: DevvitContext
): Promise<City> {
  // Fast path: already stored
  const cached = await redis.get(cityKey(dayKey));
  if (cached) {
    const parsed = JSON.parse(cached) as { version?: number };
    // Cities stored by an older rules version are rebuilt (same seed, new rules).
    if (parsed.version === 2) return parsed as City;
  }

  // Acquire lock (NX = only set if not exists, EX = expire after LOCK_TTL)
  const lock = await redis.set(`sky:lock:${dayKey}`, '1', { nx: true, ex: LOCK_TTL });
  if (lock === null) {
    // Another process holds the lock — poll briefly then read
    await sleep(1500);
    const afterLock = await redis.get(cityKey(dayKey));
    if (afterLock && (JSON.parse(afterLock) as { version?: number }).version === 2) return JSON.parse(afterLock) as City;
    // Fallback: build anyway (idempotent since City is deterministic)
  }

  try {
    // Read sourceCommunities setting
    const rawSetting = (await ctx.settings.get<string>('sourceCommunities')) ?? '';
    const sourceCommunities = parseSourceCommunities(rawSetting);

    let posts: RawPost[];
    try {
      posts = await fetchEligiblePosts(source, sourceCommunities, subreddit);
    } catch {
      // If fetch fails entirely, use an empty array — buildCity will throw
      // and the outer try-catch will store a fallback
      posts = [];
    }

    let city: City;
    try {
      city = buildCity(posts, subreddit, dayKey);
    } catch {
      // Fallback: build with just empty lots
      const pads = Array.from({ length: 12 }, (_, i) => ({
        id: `empty:${i}`,
        title: 'Empty lot',
        score: 0,
        numComments: 0,
        permalink: '',
      }));
      city = buildCity(pads, subreddit, dayKey);
    }

    // Store the epoch day on first use
    const existing = await redis.get(EPOCH_KEY);
    if (!existing) {
      await redis.set(EPOCH_KEY, String(epochDay(dayKey)));
    }

    const json = JSON.stringify(city);
    await redis.set(cityKey(dayKey), json, { ex: TTL_14_DAYS });
    return city;
  } finally {
    // Release lock
    await redis.del(lockKey(dayKey));
  }
}

/** Returns the stored epoch day offset so we can number cities */
export async function getDayNumber(dayKey: string, redis: RedisClient): Promise<number> {
  const epochRaw = await redis.get(EPOCH_KEY);
  if (!epochRaw) return 1;
  return epochDay(dayKey) - parseInt(epochRaw, 10) + 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns today's dayKey in UTC */
export function todayKey(): string {
  return utcDayKey();
}
