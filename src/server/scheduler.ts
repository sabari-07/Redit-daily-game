import type { DevvitContext } from './devvit-stubs.js';
import { todayKey, getOrCreateCity } from './cityStore.js';
import { createDailyPost } from './posts.js';
import { DevvitPostSource } from './reddit.js';

/** Called by the daily cron at 00:00 UTC */
export async function handleDailyCron(ctx: DevvitContext): Promise<void> {
  const subreddit = ctx.subredditName ?? '';
  if (!subreddit) return;

  const dayKey = todayKey();
  const source = new DevvitPostSource(ctx);

  const city = await getOrCreateCity(dayKey, subreddit, ctx.redis, source, ctx);

  // Use the summit building's title as the post teaser
  const summitBuilding = city.buildings[city.summitIndex];
  const topTitle = summitBuilding?.title ?? 'Today\'s city';

  await createDailyPost(subreddit, dayKey, topTitle, ctx.redis, ctx);
}

/** Called when the app is first installed on a subreddit */
export async function handleAppInstall(ctx: DevvitContext): Promise<void> {
  await handleDailyCron(ctx);
}

/** Called by the moderator menu item */
export async function handleMenuCreatePost(ctx: DevvitContext): Promise<void> {
  await handleDailyCron(ctx);
}
