import type { DevvitContext } from './devvit-stubs.js';
import type { RedisClient } from './devvit-stubs.js';
import { getDayNumber } from './cityStore.js';

const POST_KEY_PREFIX = 'sky:post:';

function postDayKey(dayKey: string): string {
  return `${POST_KEY_PREFIX}${dayKey}`;
}

/**
 * Creates today's Skyline custom post on the subreddit.
 * Idempotent — if a post was already created today, returns its ID.
 */
export async function createDailyPost(
  subreddit: string,
  dayKey: string,
  topPostTitle: string,
  redis: RedisClient,
  ctx: DevvitContext
): Promise<string> {
  // Check if post already exists for this day
  const existing = await redis.get(postDayKey(dayKey));
  if (existing) return existing;

  const dayNumber = await getDayNumber(dayKey, redis);
  const truncatedTitle = topPostTitle.length > 40
    ? topPostTitle.slice(0, 39) + '…'
    : topPostTitle;

  const title = `Skyline #${dayNumber} · ${truncatedTitle}`;

  // Submit via Devvit Reddit API
  const post = await ctx.reddit.submitPost({
    subredditName: subreddit,
    title,
    kind: 'self',
  });

  // Store idempotency key with 15-day TTL
  await redis.set(postDayKey(dayKey), post.id, { ex: 15 * 24 * 60 * 60 });

  return post.id;
}
