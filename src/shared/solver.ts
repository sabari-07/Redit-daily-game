import type { Building, City, Move, Tool } from './types.js';
import { jumpGeometry, cityTools } from './rules.js';

type SolvableCity = Pick<City, 'buildings' | 'startIndex' | 'summitIndex'> & Partial<Pick<City, 'tools'>>;

/** A mid-run position to solve from (used by the in-game Hint). */
export interface SolveFrom {
  pos: number;
  glideLeft: number;
  grappleLeft: number;
  collapsed: Iterable<number>;
}

/** The first jump of a shortest route from the current position, or null if no route exists. */
export function nextStep(city: SolvableCity, from: SolveFrom): Move | null {
  if (from.pos === city.summitIndex) return null;
  return solveRoute(city, 20, from)?.moves[0] ?? null;
}

const TOOLS: readonly Tool[] = ['walk', 'glide', 'grapple'];

/** Precomputed per-pair geometry: bit 1 = walk, 2 = glide, 4 = grapple. */
function geometryMatrix(buildings: Building[]): Uint8Array {
  const n = buildings.length;
  const m = new Uint8Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const g = jumpGeometry(buildings[a], buildings[b]);
      m[a * n + b] = (g.walk ? 1 : 0) | (g.glide ? 2 : 0) | (g.grapple ? 4 : 0);
    }
  }
  return m;
}

const TOOL_BIT: Record<Tool, number> = { walk: 1, glide: 2, grapple: 4 };

interface Prepared {
  n: number;
  geo: Uint8Array;
  crackedBit: Int8Array;
  start: number;
  summit: number;
  glide: number;
  grapple: number;
}

function prepare(city: SolvableCity): Prepared {
  const n = city.buildings.length;
  const crackedBit = new Int8Array(n).fill(-1);
  let bit = 0;
  for (let i = 0; i < n; i++) if (city.buildings[i].tags.includes('cracked')) crackedBit[i] = bit++;
  const t = cityTools({ tools: city.tools ?? { glide: 2, grapple: 2 } });
  return {
    n,
    geo: geometryMatrix(city.buildings),
    crackedBit,
    start: city.startIndex,
    summit: city.summitIndex,
    glide: t.glide,
    grapple: t.grapple,
  };
}

/** Packs a search state into one safe integer: pos (< 64) | glide | grapple | collapsed mask. */
function key(pos: number, g: number, r: number, mask: number): number {
  return pos + 64 * (g + 4 * (r + 4 * mask));
}

/**
 * Shortest route (fewest jumps) under the real rules: explicit tools, limited charges,
 * cracked roofs collapse after you leave them. Returns null if the Summit is unreachable.
 */
export function solveRoute(city: SolvableCity, maxDepth = 20, from?: SolveFrom): { par: number; moves: Move[] } | null {
  const p = prepare(city);
  let s0: [number, number, number, number] = [p.start, p.glide, p.grapple, 0];
  if (from) {
    let mask = 0;
    for (const i of from.collapsed) {
      const bit = p.crackedBit[i];
      if (bit >= 0) mask |= 1 << bit;
    }
    s0 = [from.pos, from.glideLeft, from.grappleLeft, mask];
  }
  const parent = new Map<number, { prev: number; move: Move } | null>();
  parent.set(key(s0[0], s0[1], s0[2], s0[3]), null);
  let frontier: Array<[number, number, number, number]> = [s0];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: Array<[number, number, number, number]> = [];
    for (const [pos, g, r, mask] of frontier) {
      const k = key(pos, g, r, mask);
      if (pos === p.summit) {
        const moves: Move[] = [];
        let cur: number | undefined = k;
        while (cur !== undefined) {
          const link = parent.get(cur);
          if (!link) break;
          moves.unshift(link.move);
          cur = link.prev;
        }
        return { par: depth, moves };
      }
      const bit = p.crackedBit[pos];
      const nextMask = bit >= 0 ? mask | (1 << bit) : mask;
      for (let to = 0; to < p.n; to++) {
        if (to === pos) continue;
        const tb = p.crackedBit[to];
        if (tb >= 0 && (nextMask >> tb) & 1) continue;
        const geo = p.geo[pos * p.n + to];
        for (const tool of TOOLS) {
          if (!(geo & TOOL_BIT[tool])) continue;
          const ng = tool === 'glide' ? g - 1 : g;
          const nr = tool === 'grapple' ? r - 1 : r;
          if (ng < 0 || nr < 0) continue;
          const nk = key(to, ng, nr, nextMask);
          if (parent.has(nk)) continue;
          parent.set(nk, { prev: k, move: { to, tool } });
          next.push([to, ng, nr, nextMask]);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Fewest jumps to the Summit (same rules as solveRoute), without building the route.
 * City generation calls this thousands of times, so it uses a flat typed-array BFS:
 * state = pos | glide << 6 | grapple << 8 | collapsedMask << 10.
 */
export function solvePar(city: SolvableCity, maxDepth = 20): number | null {
  const p = prepare(city);
  let bits = 0;
  for (let i = 0; i < p.n; i++) if (p.crackedBit[i] >= 0) bits++;
  if (p.n > 64 || p.glide > 3 || p.grapple > 3 || bits > 10) return solveRoute(city, maxDepth)?.par ?? null;

  const visited = new Uint8Array(1 << (10 + bits));
  const enc = (pos: number, g: number, r: number, mask: number): number => pos | (g << 6) | (r << 8) | (mask << 10);
  let frontier = new Int32Array(1);
  frontier[0] = enc(p.start, p.glide, p.grapple, 0);
  let fLen = 1;
  visited[frontier[0]] = 1;
  let next = new Int32Array(1024);

  for (let depth = 0; depth <= maxDepth && fLen > 0; depth++) {
    let nLen = 0;
    for (let f = 0; f < fLen; f++) {
      const s = frontier[f];
      const pos = s & 63;
      if (pos === p.summit) return depth;
      const g = (s >> 6) & 3;
      const r = (s >> 8) & 3;
      const mask = s >> 10;
      const bit = p.crackedBit[pos];
      const nextMask = bit >= 0 ? mask | (1 << bit) : mask;
      const row = pos * p.n;
      for (let to = 0; to < p.n; to++) {
        if (to === pos) continue;
        const tb = p.crackedBit[to];
        if (tb >= 0 && (nextMask >> tb) & 1) continue;
        const geo = p.geo[row + to];
        if (!geo) continue;
        for (let k = 0; k < 3; k++) {
          let ng = g;
          let nr = r;
          if (k === 0) {
            if (!(geo & 1)) continue;
          } else if (k === 1) {
            if (!(geo & 2) || g === 0) continue;
            ng = g - 1;
          } else {
            if (!(geo & 4) || r === 0) continue;
            nr = r - 1;
          }
          const ns = enc(to, ng, nr, nextMask);
          if (visited[ns]) continue;
          visited[ns] = 1;
          if (nLen === next.length) {
            const grown = new Int32Array(next.length * 2);
            grown.set(next);
            next = grown;
          }
          next[nLen++] = ns;
        }
      }
    }
    const tmp = frontier;
    frontier = next;
    next = tmp.length >= 1024 ? tmp : new Int32Array(1024);
    fLen = nLen;
  }
  return null;
}

/**
 * Counts distinct jump sequences that reach the Summit in <= limit jumps, stopping at `stopAt`.
 * Pruned with a lower bound (shortest path ignoring charges and collapses), so it stays fast.
 */
export function countRoutes(city: SolvableCity, limit: number, stopAt = 2): number {
  const p = prepare(city);
  // Lower bound: BFS distance to the summit on the "any tool" graph, ignoring charges.
  const lb = new Int16Array(p.n).fill(999);
  lb[p.summit] = 0;
  const q = [p.summit];
  while (q.length) {
    const v = q.shift()!;
    for (let u = 0; u < p.n; u++) {
      if (lb[u] <= lb[v] + 1) continue;
      if (p.geo[u * p.n + v]) {
        lb[u] = lb[v] + 1;
        q.push(u);
      }
    }
  }

  let count = 0;
  const dfs = (pos: number, depth: number, g: number, r: number, mask: number): void => {
    if (count >= stopAt) return;
    if (pos === p.summit) {
      count++;
      return;
    }
    if (depth + lb[pos] > limit) return;
    const bit = p.crackedBit[pos];
    const nextMask = bit >= 0 ? mask | (1 << bit) : mask;
    for (let to = 0; to < p.n && count < stopAt; to++) {
      if (to === pos) continue;
      const tb = p.crackedBit[to];
      if (tb >= 0 && (nextMask >> tb) & 1) continue;
      const geo = p.geo[pos * p.n + to];
      // Count distinct roof sequences: use the first tool that works for this hop.
      if (geo & 1) dfs(to, depth + 1, g, r, nextMask);
      else if (geo & 2 && g > 0) dfs(to, depth + 1, g - 1, r, nextMask);
      else if (geo & 4 && r > 0) dfs(to, depth + 1, g, r - 1, nextMask);
    }
  };
  dfs(p.start, 0, p.glide, p.grapple, 0);
  return count;
}

/**
 * A "no thinking" player: always jumps to the reachable roof closest to the Summit,
 * using the cheapest tool that works. Returns the jumps it needs, or null if it gets stuck.
 * Medium and Hard cities must beat this player, so the obvious route is never the best one.
 */
export function greedyRun(city: SolvableCity, maxDepth = 20): number | null {
  const p = prepare(city);
  const b = city.buildings;
  const sx = b[p.summit].x;
  const sz = b[p.summit].z;
  let pos = p.start;
  let g = p.glide;
  let r = p.grapple;
  let mask = 0;
  const seen = new Set<number>();
  for (let depth = 0; depth < maxDepth; depth++) {
    if (pos === p.summit) return depth;
    seen.add(pos);
    const bit = p.crackedBit[pos];
    const nextMask = bit >= 0 ? mask | (1 << bit) : mask;
    let best = -1;
    let bestD = Infinity;
    let bestTool: Tool = 'walk';
    for (let to = 0; to < p.n; to++) {
      if (to === pos || seen.has(to)) continue;
      const tb = p.crackedBit[to];
      if (tb >= 0 && (nextMask >> tb) & 1) continue;
      const geo = p.geo[pos * p.n + to];
      const tool: Tool | null = geo & 1 ? 'walk' : geo & 2 && g > 0 ? 'glide' : geo & 4 && r > 0 ? 'grapple' : null;
      if (!tool) continue;
      const d = Math.hypot(b[to].x - sx, b[to].z - sz);
      if (d < bestD) {
        bestD = d;
        best = to;
        bestTool = tool;
      }
    }
    if (best < 0) return null;
    if (bestTool === 'glide') g--;
    if (bestTool === 'grapple') r--;
    mask = nextMask;
    pos = best;
  }
  return pos === p.summit ? maxDepth : null;
}
