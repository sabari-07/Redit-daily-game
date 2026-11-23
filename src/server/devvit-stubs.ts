/**
 * Type stubs for Devvit platform APIs.
 * When deployed via `npx devvit upload`, the real @devvit/web package is injected by
 * the Devvit runtime. These stubs exist so the TypeScript compiler and tests can run
 * without the Devvit CLI toolchain installed.
 */

export interface DevvitContext {
  redis: RedisClient;
  reddit: RedditClient;
  settings: SettingsClient;
  userId?: string;
  subredditName?: string;
  postId?: string;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
  zadd(key: string, opts: { score: number; member: string }): Promise<void>;
  zrevrangeWithScores(key: string, start: number, stop: number): Promise<Array<{ member: string; score: number }>>;
  zrank(key: string, member: string): Promise<number | null>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string> | null>;
}

export interface RedditPost {
  id: string;
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  linkFlairText?: string;
  nsfw: boolean;
  spoiler: boolean;
  removed?: boolean;
  deleted?: boolean;
  stickied: boolean;
  locked?: boolean;
}

export interface RedditClient {
  getTopPosts(subreddit: string, opts: { timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'; limit?: number }): AsyncIterable<RedditPost>;
  submitComment(opts: { id: string; text: string }): Promise<void>;
  submitPost(opts: { subredditName: string; title: string; kind: 'self' | 'link'; preview?: unknown }): Promise<{ id: string }>;
}

export interface SettingsClient {
  get<T = string>(key: string): Promise<T | undefined>;
}
