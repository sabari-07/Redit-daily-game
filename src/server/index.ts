import { Hono } from 'hono';
import type { Move } from '../shared/types.js';
import { todayKey, getOrCreateCity, getDayNumber } from './cityStore.js';
import { submitRun, getLeaderboard, getGhosts, shareAsComment, getMyBest, startClock, getClockStart } from './runs.js';
import { getStreakData } from './streaks.js';
import { validateSourceCommunities } from './reddit.js';
import { handleDailyCron, handleAppInstall, handleMenuCreatePost } from './scheduler.js';
import type { DevvitContext } from './devvit-stubs.js';
import type { InitResponse } from '../shared/types.js';

const app = new Hono();

/** Extracts the Devvit context injected by the runtime into each request */
function getContext(c: { env?: unknown }): DevvitContext {
  // In real Devvit deployment, context is injected at request time.
  // This placeholder is overridden in tests.
  const ctx = (c as { env?: { ctx?: DevvitContext } }).env?.ctx;
  if (!ctx) throw new Error('No Devvit context');
  return ctx;
}

// --- API ROUTES ---

app.get('/api/init', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous', subredditName = '', postId = '' } = ctx;
    const dayKey = todayKey();

    const source = new (await import('./reddit.js').then((m) => m.DevvitPostSource))(ctx);
    const city = await getOrCreateCity(dayKey, subredditName, redis, source, ctx);
    const myBest = userId !== 'anonymous' ? await getMyBest(userId, dayKey, redis) : null;
    const { count: streak } = await getStreakData(userId, redis);

    const response: InitResponse = {
      city,
      username: userId,
      postId,
      myBest,
      streak,
      hasFinished: myBest !== null,
      clockStartedAt: await getClockStart(userId, dayKey, redis),
      serverNow: Date.now(),
      dayNumber: await getDayNumber(dayKey, redis),
    };

    return c.json(response);
  } catch (err) {
    console.error('init error:', err);
    return c.json({ error: 'Failed to initialize game' }, 500);
  }
});

/**
 * Starts the player's clock: called on Start, or the first time they rotate/zoom the
 * city or tap a roof (whichever comes first). Only the first call of the day counts.
 */
app.post('/api/start', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous' } = ctx;
    const startedAt = await startClock(userId, todayKey(), redis);
    return c.json({ startedAt, serverNow: Date.now() });
  } catch (err) {
    console.error('start error:', err);
    return c.json({ error: 'Failed to start the clock' }, 500);
  }
});

app.post('/api/run', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous', subredditName = '' } = ctx;

    const body = await c.req.json<{ moves?: unknown }>();
    if (!Array.isArray(body?.moves)) {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const moves = body.moves as Move[];

    // Validate shape
    if (moves.length > 25) {
      return c.json({ error: 'Too many moves' }, 400);
    }

    for (const move of moves) {
      if (
        typeof move.to !== 'number' ||
        !Number.isInteger(move.to) ||
        move.to < 0 ||
        !['walk', 'glide', 'grapple'].includes(move.tool)
      ) {
        return c.json({ error: 'Invalid move shape' }, 400);
      }
    }

    const dayKey = todayKey();
    const source = new (await import('./reddit.js').then((m) => m.DevvitPostSource))(ctx);
    const city = await getOrCreateCity(dayKey, subredditName, redis, source, ctx);

    // Validate all indices against actual city size
    for (const move of moves) {
      if (move.to >= city.buildings.length) {
        return c.json({ error: 'Move index out of range' }, 400);
      }
    }

    const username = userId; // usernames are from Reddit auth, don't expose in telemetry
    const { result, rank, streak, practice } = await submitRun(city, moves, userId, username, dayKey, redis);

    return c.json({ ...result, rank, streak, practice });
  } catch (err) {
    console.error('run error:', err);
    return c.json({ error: 'Failed to process run' }, 500);
  }
});

app.get('/api/leaderboard', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous', subredditName: _ } = ctx;
    const dayKey = todayKey();
    const { top, myRank } = await getLeaderboard(userId, dayKey, redis);
    return c.json({ top, myRank });
  } catch (err) {
    console.error('leaderboard error:', err);
    return c.json({ error: 'Failed to load leaderboard' }, 500);
  }
});

app.get('/api/ghosts', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous' } = ctx;
    const dayKey = todayKey();
    const ghosts = await getGhosts(userId, dayKey, redis);
    if (ghosts === null) {
      return c.json({ error: 'Complete the puzzle to unlock ghost routes' }, 403);
    }
    return c.json({ ghosts });
  } catch (err) {
    console.error('ghosts error:', err);
    return c.json({ error: 'Failed to load ghost routes' }, 500);
  }
});

app.post('/api/share-comment', async (c) => {
  try {
    const ctx = getContext(c);
    const { redis, userId = 'anonymous', postId = '' } = ctx;
    const dayKey = todayKey();

    const body = await c.req.json<{ text?: unknown }>();
    if (typeof body?.text !== 'string' || body.text.length > 500) {
      return c.json({ error: 'Invalid comment text' }, 400);
    }

    const submitComment = (id: string, text: string) => ctx.reddit.submitComment({ id, text });
    const { ok, error } = await shareAsComment(userId, dayKey, body.text, postId, redis, submitComment);

    if (!ok) return c.json({ error }, 429);
    return c.json({ ok: true });
  } catch (err) {
    console.error('share error:', err);
    return c.json({ error: 'Failed to post comment' }, 500);
  }
});

// --- INTERNAL ROUTES ---

app.post('/internal/menu/create-post', async (c) => {
  try {
    const ctx = getContext(c);
    await handleMenuCreatePost(ctx);
    return c.json({ ok: true });
  } catch (err) {
    console.error('menu error:', err);
    return c.json({ error: 'Failed to create post' }, 500);
  }
});

app.post('/internal/triggers/on-app-install', async (c) => {
  try {
    const ctx = getContext(c);
    await handleAppInstall(ctx);
    return c.json({ ok: true });
  } catch (err) {
    console.error('install error:', err);
    return c.json({ error: 'Failed to handle install' }, 500);
  }
});

app.post('/internal/cron/daily', async (c) => {
  try {
    const ctx = getContext(c);
    await handleDailyCron(ctx);
    return c.json({ ok: true });
  } catch (err) {
    console.error('cron error:', err);
    return c.json({ error: 'Failed to run daily cron' }, 500);
  }
});

app.post('/internal/settings/validate-sources', async (c) => {
  try {
    const body = await c.req.json<{ value?: unknown }>();
    if (typeof body?.value !== 'string') {
      return c.json({ valid: false, error: 'Value must be a string' }, 400);
    }
    const { valid, error } = validateSourceCommunities(body.value);
    return c.json({ valid, error });
  } catch {
    return c.json({ valid: false, error: 'Invalid request' }, 400);
  }
});

export default app;
