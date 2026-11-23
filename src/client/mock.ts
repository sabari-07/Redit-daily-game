import { buildCity } from '../shared/city.js';
import type { City, GhostRoute, InitResponse, LeaderboardEntry, MyRun, RawPost } from '../shared/types.js';
import { utcDayKey } from '../shared/date.js';
import { makeRng } from '../shared/rng.js';

/**
 * Local dev data (?mock=1). Posts change with the date, so the mock city is different
 * every day, exactly like the real one. Preview any day with ?mock=1&day=YYYY-MM-DD.
 * Mock state lives in sessionStorage so a reload behaves like the server (clock keeps running).
 */

const SUBJECTS = ['My grandma', 'Our cat', 'This bridge', 'The night bus', 'A tiny bakery', 'My first bike', 'The old library',
  'This street', 'Our neighbour', 'A rainy market', 'The corner shop', 'My roommate', 'This sunset', 'The ferry', 'A street musician'];
const ENDINGS = ['finally got fixed after 10 years', 'is the best thing I saw today', 'made the whole block smile',
  'just turned 100', 'survived the storm', 'has a secret garden on the roof', 'did something wholesome', 'looks unreal at night',
  'won the local award', 'is back after the renovation', 'went viral in our town', 'taught me something new'];
const QUESTIONS = ['What is the most underrated city you have visited?', 'Which small habit changed your life?',
  'What is a skill everyone should learn?', 'What food from your city should be famous?', 'What is your best budget travel tip?'];

export function mockDayKey(): string {
  const d = new URLSearchParams(window.location.search).get('day');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : utcDayKey();
}

function fixturePosts(dayKey: string, n: number): RawPost[] {
  const rng = makeRng(`mock-posts:${dayKey}`);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  return Array.from({ length: n }, (_, i) => {
    const title = rng() < 0.22 ? pick(QUESTIONS) : `${pick(SUBJECTS)} ${pick(ENDINGS)}`;
    const score = Math.floor(30 + Math.pow(rng(), 2.2) * 24000);
    const numComments = Math.floor(score * (0.03 + rng() * (rng() < 0.2 ? 1.4 : 0.25)));
    return {
      id: `t3_${dayKey.replace(/-/g, '')}_${i}`,
      title,
      score,
      numComments,
      permalink: `/r/community/comments/mock${i}/`,
    };
  });
}

let _mockCity: City | null = null;

export function getMockCity(): City {
  if (!_mockCity) {
    const day = mockDayKey();
    _mockCity = buildCity(fixturePosts(day, 32), 'community', day);
  }
  return _mockCity;
}

export function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).has('mock');
}

const k = (name: string): string => `sky-mock:${mockDayKey()}:${name}`;

function read<T>(name: string): T | null {
  try {
    const v = sessionStorage.getItem(k(name));
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(name: string, v: unknown): void {
  try {
    sessionStorage.setItem(k(name), JSON.stringify(v));
  } catch {
    /* storage unavailable: mock state just resets */
  }
}

export function mockStartClock(): number {
  const existing = read<number>('clock');
  if (existing !== null) return existing;
  const now = Date.now();
  write('clock', now);
  return now;
}

export function mockClockStart(): number | null {
  return read<number>('clock');
}

/** Mirrors the server: first finish is ranked, later finishes are practice. */
export function mockRecordFinish(run: MyRun): { practice: boolean } {
  if (read<MyRun>('ranked')) return { practice: true };
  write('ranked', run);
  return { practice: false };
}

export function getMockInitResponse(): InitResponse {
  const myBest = read<MyRun>('ranked');
  return {
    city: getMockCity(),
    username: 'player',
    postId: 'mock_post',
    myBest,
    streak: 3,
    hasFinished: myBest !== null,
    clockStartedAt: mockClockStart(),
    serverNow: Date.now(),
    dayNumber: 12,
  };
}

export function getMockLeaderboard(): { top: LeaderboardEntry[]; myRank: number } {
  const mine = read<MyRun>('ranked');
  const others: LeaderboardEntry[] = Array.from({ length: 9 }, (_, i) => ({
    username: ['skyhopper', 'roofrunner', 'nightowl_88', 'grapple_gal', 'citycat', 'pigeonpal', 'lamp_post', 'tallorder', 'downtown_dan'][i],
    points: 2350 - i * 140,
    moves: getMockCity().par + Math.floor(i / 3),
    timeMs: 42_000 + i * 17_000,
    rank: 0,
  }));
  const all = mine ? [...others, { username: 'player', points: mine.points, moves: mine.moves, timeMs: mine.timeMs, rank: 0 }] : others;
  all.sort((a, b) => b.points - a.points || a.timeMs - b.timeMs);
  all.forEach((e, i) => { e.rank = i + 1; });
  return { top: all.slice(0, 10), myRank: all.find((e) => e.username === 'player')?.rank ?? 0 };
}

export function getMockGhosts(): GhostRoute[] {
  const city = getMockCity();
  return [{ path: [city.startIndex, city.summitIndex], count: 42 }];
}
