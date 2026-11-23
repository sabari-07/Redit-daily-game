import type { Building, City, Difficulty, RawPost } from './types.js';
import { fnv1a, makeRng } from './rng.js';
import { sanitizeTitle } from './sanitize.js';
import { countRoutes, greedyRun, solvePar } from './solver.js';
import { utcWeekday } from './date.js';

/** Buildings per city (hard limit 63: the solver packs the roof index into 6 bits). */
const MAX_BUILDINGS = 29;
const MIN_BUILDINGS = 12;
const MIN_GAP = 1.5;
const GRID = 7; // 7 x 7 lots, summit in the middle

export interface DayPlan {
  difficulty: Difficulty;
  parRange: [number, number];
  tools: { glide: number; grapple: number };
  maxCracked: number;
  /** Medium/Hard: the "always jump toward the beacon" player must not finish within par + 1. */
  mustBeatGreedy: boolean;
  /** How far (in tiles) post placement may stray from the downtown-is-tallest slope. */
  layoutNoise: number;
  /** Chance that a lot is left empty as a plaza. */
  plazaChance: number;
  /** Start is the lowest roof among this share of the buildings farthest from downtown. */
  startFarShare: number;
  /** Layout attempts per generation pass. */
  attempts: number;
}

/** Difficulty by UTC weekday: easy start of the week, hardest at the weekend. */
export function dayPlan(dayKey: string): DayPlan {
  const wd = utcWeekday(dayKey);
  if (wd === 1 || wd === 2) {
    return {
      difficulty: 'Easy', parRange: [5, 7], tools: { glide: 2, grapple: 2 }, maxCracked: 2,
      mustBeatGreedy: false, layoutNoise: 6, plazaChance: 0.08, startFarShare: 0.34, attempts: 600,
    };
  }
  if (wd === 3 || wd === 4) {
    return {
      difficulty: 'Medium', parRange: [7, 9], tools: { glide: 2, grapple: 1 }, maxCracked: 3,
      mustBeatGreedy: true, layoutNoise: 10, plazaChance: 0.15, startFarShare: 0.25, attempts: 2000,
    };
  }
  return {
    difficulty: 'Hard', parRange: [8, 12], tools: { glide: 2, grapple: 1 }, maxCracked: 4,
    mustBeatGreedy: true, layoutNoise: 10, plazaChance: 0.12, startFarShare: 0.12, attempts: 4000,
  };
}
function deriveHeight(logScore: number, minLog: number, maxLog: number): number {
  const norm = minLog === maxLog ? 0.5 : (logScore - minLog) / (maxLog - minLog);
  return Math.max(2, Math.min(12, 2 + Math.round(10 * norm)));
}

function halfSize(size: 3 | 5): number {
  return (size - 1) / 2;
}

/** Shortest XZ gap between two square roof footprints (0 if they overlap). */
export function footprintGap(
  ax: number, az: number, aSize: 3 | 5,
  bx: number, bz: number, bSize: 3 | 5
): number {
  const ha = halfSize(aSize);
  const hb = halfSize(bSize);
  const dx = Math.max(0, Math.abs(ax - bx) - ha - hb);
  const dz = Math.max(0, Math.abs(az - bz) - ha - hb);
  if (dx === 0 && dz === 0) return 0;
  if (dx === 0) return dz;
  if (dz === 0) return dx;
  return Math.sqrt(dx * dx + dz * dz);
}

export function flairTrimIndex(flair: string | undefined): number {
  if (!flair) return -1;
  return fnv1a(flair) % 6;
}

/** Street centre lines between the lot columns/rows (used to draw roads). */
export interface StreetGrid {
  x: number[];
  z: number[];
}

interface Lot {
  x: number;
  z: number;
  dist: number;
}

/** Lot centres on an uneven street grid: street pitch varies 5-7 tiles per block. */
function makeLots(rng: () => number): { lots: Lot[]; streets: StreetGrid } {
  const pitches = (): number[] => Array.from({ length: GRID - 1 }, () => 5 + Math.floor(rng() * 3));
  const axis = (p: number[]): number[] => {
    const pos = [0];
    for (const d of p) pos.push(pos[pos.length - 1] + d);
    const mid = pos[Math.floor(GRID / 2)];
    return pos.map((v) => v - mid);
  };
  const xs = axis(pitches());
  const zs = axis(pitches());
  const lots: Lot[] = [];
  for (const x of xs) {
    for (const z of zs) lots.push({ x, z, dist: Math.hypot(x, z) });
  }
  const mids = (a: number[]): number[] => a.slice(1).map((v, i) => (v + a[i]) / 2);
  return { lots, streets: { x: mids(xs), z: mids(zs) } };
}

function makeBuilding(post: RawPost, index: number, x: number, z: number, size: 3 | 5, height: number): Building {
  return {
    index,
    postId: post.id,
    title: post.title, // already sanitized once in buildCity
    score: post.score,
    numComments: post.numComments,
    permalink: post.permalink,
    x,
    z,
    size,
    height,
    tags: [],
  };
}

function canPlace(x: number, z: number, size: 3 | 5, existing: Building[]): boolean {
  for (const b of existing) {
    if (footprintGap(x, z, size, b.x, b.z, b.size) < MIN_GAP) return false;
  }
  return true;
}

interface Layout {
  buildings: Building[];
  startIndex: number;
  summitIndex: number;
  streets: StreetGrid;
}

function layout(eligible: RawPost[], plan: DayPlan, rng: () => number): Layout | null {
  const logScores = eligible.map((p) => Math.log(p.score + 1));
  const minLog = Math.min(...logScores);
  const maxLog = Math.max(...logScores);
  const comments = eligible.map((p) => p.numComments).sort((a, b) => a - b);
  const bigThreshold = comments[Math.floor(comments.length * (2 / 3))] ?? 0;

  const { lots, streets } = makeLots(rng);
  const centre = lots.reduce((a, b) => (a.dist <= b.dist ? a : b));
  // Real-city skyline: busier posts sit closer to downtown. Noise (bigger on harder days)
  // breaks the smooth slope, and some lots are left empty as plazas you must get around.
  const order = lots
    .filter((l) => l !== centre)
    .map((l) => ({ l, k: l.dist + rng() * plan.layoutNoise }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.l);

  const buildings: Building[] = [];
  const summitPost = eligible[0];
  const summitSize: 3 | 5 = summitPost.numComments > bigThreshold ? 5 : 3;
  buildings.push(makeBuilding(summitPost, 0, centre.x, centre.z, summitSize, deriveHeight(logScores[0], minLog, maxLog)));

  let lotIdx = 0;
  for (let i = 1; i < eligible.length; i++) {
    const post = eligible[i];
    let size: 3 | 5 = post.numComments > bigThreshold ? 5 : 3;
    let placed = false;
    while (lotIdx < order.length && !placed) {
      const lot = order[lotIdx++];
      if (rng() < plan.plazaChance) continue; // leave a plaza
      const jx = lot.x + (rng() - 0.5);
      const jz = lot.z + (rng() - 0.5);
      if (!canPlace(jx, jz, size, buildings) && size === 5) size = 3; // a big plot will not fit here
      if (canPlace(jx, jz, size, buildings)) {
        buildings.push(makeBuilding(post, i, jx, jz, size, deriveHeight(logScores[i], minLog, maxLog)));
        placed = true;
      }
    }
    if (!placed) return null;
  }  // Re-index so building.index === array position.
  buildings.forEach((b, i) => { b.index = i; });

  // Start: the lowest roof among the far third of the city (ties: lower Buzz).
  const far = buildings
    .slice(1)
    .sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))
    .slice(0, Math.max(2, Math.ceil(buildings.length * plan.startFarShare)));
  far.sort((a, b) => a.height - b.height || a.score - b.score || a.index - b.index);
  const start = far[0];

  const summit = buildings[0];
  summit.tags.push('summit');
  start.tags.push('start');

  // Gold: the 4 most-discussed posts (not start/summit).
  [...buildings]
    .filter((b) => b !== summit && b !== start)
    .sort((a, b) => b.numComments - a.numComments || a.index - b.index)
    .slice(0, 4)
    .forEach((b) => b.tags.push('gold'));

  // Damaged ("heated thread"): lots of Chatter relative to Buzz. Capped per day.
  [...buildings]
    .filter((b) => b !== summit && b !== start && b.numComments >= 20 && b.numComments >= 0.8 * b.score)
    .sort((a, b) => b.numComments / Math.max(1, b.score) - a.numComments / Math.max(1, a.score) || a.index - b.index)
    .slice(0, plan.maxCracked)
    .forEach((b) => b.tags.push('cracked'));

  return { buildings, startIndex: start.index, summitIndex: summit.index, streets };
}

/**
 * Builds today's City. Deterministic: same posts + community + day = same City.
 * Different days always get a different seed, so the layout changes every day even if
 * the same posts are still on top.
 */
export function buildCity(
  rawPosts: RawPost[],
  subreddit: string,
  dayKey: string,
  planOverride?: Partial<DayPlan>
): City {
  const seed = `${subreddit}:${dayKey}`;
  // Titles are cleaned ONCE here (not per layout attempt: generation tries thousands of layouts).
  const eligible = rawPosts
    .map((p) => ({ ...p, title: sanitizeTitle(p.title) }))
    .filter((p) => p.title.trim().length > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_BUILDINGS);
  if (eligible.length < MIN_BUILDINGS) {
    throw new Error(`Not enough eligible posts: ${eligible.length} < ${MIN_BUILDINGS}`);
  }

  const plan: DayPlan = { ...dayPlan(dayKey), ...planOverride };
  // Pass 1: full rules. Pass 2: drop the anti-greedy rule. Pass 3: same par band, 2/2 tools.
  // Pass 4 (last resort): any solvable par 3-14 (e.g. a very quiet community of empty lots).
  const passes: Array<{ plan: DayPlan; range: [number, number]; greedy: boolean }> = [
    { plan, range: plan.parRange, greedy: plan.mustBeatGreedy },
    { plan, range: plan.parRange, greedy: false },
    { plan: { ...plan, tools: { glide: 2, grapple: 2 } }, range: plan.parRange, greedy: false },
    { plan: { ...plan, tools: { glide: 2, grapple: 2 }, attempts: 600 }, range: [3, 14], greedy: false },
  ];

  for (let pass = 0; pass < passes.length; pass++) {
    const { plan: pp, range, greedy } = passes[pass];
    for (let attempt = 0; attempt < pp.attempts; attempt++) {
      const rng = makeRng(`${seed}:${pass}:${attempt}`);
      const l = layout(eligible, pp, rng);
      if (!l) continue;
      const draft = { buildings: l.buildings, startIndex: l.startIndex, summitIndex: l.summitIndex, tools: pp.tools };
      const par = solvePar(draft);
      if (par === null || par < range[0] || par > range[1]) continue;
      // At least two good routes, so the leaderboard and ghost routes are interesting.
      if (countRoutes(draft, par + 1, 2) < 2) continue;
      if (greedy) {
        const gr = greedyRun(draft);
        if (gr !== null && gr <= par + 1) continue;
      }
      // The label must match what the player actually gets: trust the plan only if pass 1/2 met it.
      const difficulty: Difficulty = pass < 3 ? plan.difficulty : par >= 9 ? 'Hard' : par >= 7 ? 'Medium' : 'Easy';
      return {
        version: 2,
        subreddit,
        dayKey,
        seed,
        buildings: l.buildings,
        startIndex: l.startIndex,
        summitIndex: l.summitIndex,
        par,
        maxMoves: Math.min(20, par + 4),
        difficulty,
        tools: pp.tools,
        streets: l.streets,
      };
    }
  }
  throw new Error('City generation failed after all attempts');
}

/** Padded "empty lot" building for very quiet communities. */
export function emptyLotBuilding(index: number): Building {
  return {
    index,
    postId: `empty:${index}`,
    title: 'Empty lot',
    score: 0,
    numComments: 0,
    permalink: '',
    x: 0,
    z: 0,
    size: 3,
    height: 2,
    tags: [],
  };
}
