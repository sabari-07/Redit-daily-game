import type { GhostRoute, InitResponse, LeaderboardEntry, Move } from '../shared/types.js';
import {
  isMockMode, getMockInitResponse, getMockLeaderboard, getMockGhosts, getMockCity,
  mockStartClock, mockRecordFinish,
} from './mock.js';
import { simulateRun } from '../shared/rules.js';

export interface RunResponse {
  won: boolean;
  moves: number;
  goldCollected: number;
  points: number;
  path: number[];
  toolsLeft?: number;
  elapsedMs?: number;
  rank: number;
  streak: number;
  /** true when today's ranked finish already exists (this one does not change the leaderboard). */
  practice: boolean;
  error?: string;
}

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function fetchWithRetry<T>(url: string, opts: RequestInit, maxRetries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchJson<T>(url, opts);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export async function init(): Promise<InitResponse> {
  if (isMockMode()) return getMockInitResponse();
  return fetchJson<InitResponse>('/api/init');
}

/** Starts (or returns) today's clock on the server. Only the first call of the day counts. */
export async function startClock(): Promise<{ startedAt: number; serverNow: number }> {
  if (isMockMode()) return { startedAt: mockStartClock(), serverNow: Date.now() };
  return fetchWithRetry<{ startedAt: number; serverNow: number }>('/api/start', { method: 'POST' });
}

export async function submitRun(moves: Move[], clockStartedAt: number | null): Promise<RunResponse> {
  if (isMockMode()) {
    // Same validator as the server; elapsed comes from the mock clock.
    const elapsed = clockStartedAt === null ? 10 * 60 * 1000 : Date.now() - clockStartedAt;
    const r = simulateRun(getMockCity(), moves, elapsed);
    const { practice } = r.won
      ? mockRecordFinish({ points: r.points, moves: r.moves, path: r.path, timeMs: elapsed })
      : { practice: false };
    const lb = getMockLeaderboard();
    return { ...r, rank: lb.myRank, streak: 4, practice };
  }
  return fetchWithRetry<RunResponse>('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moves }),
  });
}

export async function getLeaderboard(): Promise<{ top: LeaderboardEntry[]; myRank: number }> {
  if (isMockMode()) return getMockLeaderboard();
  return fetchJson<{ top: LeaderboardEntry[]; myRank: number }>('/api/leaderboard');
}

export async function getGhosts(): Promise<GhostRoute[]> {
  if (isMockMode()) return getMockGhosts();
  const data = await fetchJson<{ ghosts: GhostRoute[] }>('/api/ghosts');
  return data.ghosts;
}

export async function shareComment(text: string): Promise<{ ok: boolean; error?: string }> {
  if (isMockMode()) return { ok: true };
  return fetchJson<{ ok: boolean; error?: string }>('/api/share-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
