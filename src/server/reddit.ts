import type { RawPost } from '../shared/types.js';
import { sanitizeTitle } from '../shared/sanitize.js';
import { emptyLotBuilding } from '../shared/city.js';
import type { DevvitContext } from './devvit-stubs.js';

export interface PostSource {
  getTopPosts(
    subreddit: string,
    timeframe: 'day' | 'week' | 'month' | 'all',
    limit: number
  ): Promise<RawPost[]>;
}

const TIMEFRAME_ORDER: Array<'day' | 'week' | 'month' | 'all'> = ['day', 'week', 'month', 'all'];
const MIN_ELIGIBLE = 12;

/** Filters raw Reddit post objects to ones eligible for the city */
function isEligible(post: {
  title?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  removed?: boolean;
  deleted?: boolean;
  stickied?: boolean;
}): boolean {
  if (!post.title?.trim()) return false;
  if (post.nsfw) return false;
  if (post.spoiler) return false;
  if (post.removed) return false;
  if (post.deleted) return false;
  if (post.stickied) return false;
  return true;
}

/**
 * Fetches eligible posts from one or more source communities,
 * merges, dedupes, and falls back through wider timeframes if needed.
 * Never throws — pads with empty lots if still < MIN_ELIGIBLE.
 */
export async function fetchEligiblePosts(
  source: PostSource,
  sourceCommunities: string[],
  subreddit: string
): Promise<RawPost[]> {
  const communities = sourceCommunities.length > 0 ? sourceCommunities : [subreddit];

  for (const timeframe of TIMEFRAME_ORDER) {
    const allPosts: RawPost[] = [];
    const seen = new Set<string>();

    for (const community of communities) {
      const posts = await source.getTopPosts(community, timeframe, 100);
      for (const post of posts) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          allPosts.push(post);
        }
      }
    }

    // Sort by score descending after merge
    allPosts.sort((a, b) => b.score - a.score);

    if (allPosts.length >= MIN_ELIGIBLE) {
      return allPosts;
    }
  }

  // Still not enough — pad with empty lots
  const emptied: RawPost[] = [];
  for (let i = 0; i < MIN_ELIGIBLE; i++) {
    const b = emptyLotBuilding(i);
    emptied.push({
      id: b.postId,
      title: b.title,
      score: 0,
      numComments: 0,
      permalink: '',
    });
  }
  return emptied;
}

/** Parses source communities setting string into an array of valid names */
export function parseSourceCommunities(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_]{2,21}$/.test(s))
    .slice(0, 5);
}

/** Validates community names against Reddit format */
export function validateSourceCommunities(raw: string): { valid: boolean; error?: string } {
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return { valid: true };
  if (names.length > 5) return { valid: false, error: 'At most 5 communities allowed' };
  for (const name of names) {
    if (!/^[A-Za-z0-9_]{2,21}$/.test(name)) {
      return { valid: false, error: `Invalid community name: "${name}"` };
    }
  }
  return { valid: true };
}

/** Real implementation using the Devvit Reddit API */
export class DevvitPostSource implements PostSource {
  constructor(private readonly ctx: DevvitContext) {}

  async getTopPosts(
    subreddit: string,
    timeframe: 'day' | 'week' | 'month' | 'all',
    limit: number
  ): Promise<RawPost[]> {
    const results: RawPost[] = [];
    const devvitTf = timeframe === 'all' ? 'all' : timeframe;

    // Collect from async iterable returned by Devvit Reddit API
    for await (const post of this.ctx.reddit.getTopPosts(subreddit, {
      timeframe: devvitTf,
      limit,
    })) {
      if (!isEligible(post)) continue;
      results.push({
        id: post.id,
        title: sanitizeTitle(post.title),
        score: Math.max(0, post.score),
        numComments: Math.max(0, post.numComments),
        permalink: post.permalink,
        ...(post.linkFlairText !== undefined ? { flair: post.linkFlairText } : {}),
      });
    }

    return results;
  }
}

/** Mock implementation for local dev and tests */
export class MockPostSource implements PostSource {
  private readonly posts: RawPost[];

  constructor(posts?: RawPost[]) {
    this.posts = posts ?? generateFixturePosts(24);
  }

  getTopPosts(
    _subreddit: string,
    _timeframe: 'day' | 'week' | 'month' | 'all',
    limit: number
  ): Promise<RawPost[]> {
    return Promise.resolve(this.posts.slice(0, limit));
  }
}

export function generateFixturePosts(n: number): RawPost[] {
  return Array.from({ length: n }, (_, i) => {
    const flairWord = i % 4 === 0 ? (['Tech', 'Culture', 'Science', 'Gaming'] as const)[Math.floor(i / 4) % 4] : undefined;
    return {
      id: `t3_fixture_${i + 1}`,
      title: `Community post about interesting topic number ${i + 1}`,
      score: Math.floor((n - i) * 450 + Math.pow(i + 1, 1.5) * 20),
      numComments: Math.floor(i * 12 + 5),
      permalink: `/r/community/comments/fixture${i + 1}/post_title/`,
      ...(flairWord !== undefined ? { flair: flairWord } : {}),
    };
  });
}
