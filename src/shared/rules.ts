import type { Building, City, Move, RunResult, Tool } from './types.js';
import { footprintGap } from './city.js';
import { computeScore } from './scoring.js';

/**
 * Jump ranges. Gap = shortest distance between the two roof footprints, in tiles.
 * Rise = target height minus current height, in floors.
 *
 *   Walk     gap <= 3, |rise| <= 2     free
 *   Glide    gap <= 8, rise <= 0       spends 1 Glide  (long, level or downhill only)
 *   Grapple  gap <= 6, any rise        spends 1 Grapple (the only way up a tall tower)
 *
 * Tools are NEVER spent automatically: the player must pick Glide or Grapple first.
 */
export const WALK_GAP = 3;
export const WALK_RISE = 2;
export const GLIDE_GAP = 8;
export const GRAPPLE_GAP = 6;

/** Fallback charges for cities created before per-city tool counts existed. */
export const DEFAULT_TOOLS = { glide: 2, grapple: 2 } as const;

export interface JumpCheck {
  valid: boolean;
  tool: Tool;
  reason?: string;
  /** The tool that WOULD make this jump work with the charges left, if any. */
  suggest?: Tool;
  gap?: number;
  rise?: number;
}

/** Pure geometry: which tools can physically make this jump (ignores charges). */
export function jumpGeometry(src: Building, dst: Building): {
  gap: number;
  rise: number;
  walk: boolean;
  glide: boolean;
  grapple: boolean;
} {
  const gap = footprintGap(src.x, src.z, src.size, dst.x, dst.z, dst.size);
  const rise = dst.height - src.height;
  return {
    gap,
    rise,
    walk: gap <= WALK_GAP && Math.abs(rise) <= WALK_RISE,
    glide: gap <= GLIDE_GAP && rise <= 0,
    grapple: gap <= GRAPPLE_GAP,
  };
}

const NAME: Record<Tool, string> = { walk: 'Walk', glide: 'Glide', grapple: 'Grapple' };

function floors(n: number): string {
  const a = Math.abs(n);
  return `${a} floor${a === 1 ? '' : 's'}`;
}

/**
 * Whether and how a jump from `from` to `to` works with the chosen tool.
 * Never mutates anything. The reason text always includes the numbers and the fix.
 */
export function canJump(
  buildings: Building[],
  from: number,
  to: number,
  glideLeft: number,
  grappleLeft: number,
  collapsed: ReadonlySet<number>,
  tool: Tool
): JumpCheck {
  if (to < 0 || to >= buildings.length) return { valid: false, tool, reason: 'Invalid target' };
  if (from === to) return { valid: false, tool, reason: 'Already here' };
  if (collapsed.has(to)) return { valid: false, tool, reason: 'That roof collapsed. It cannot be used again this run.' };

  const g = jumpGeometry(buildings[from], buildings[to]);
  const base = { gap: g.gap, rise: g.rise };
  const ok = { walk: g.walk, glide: g.glide && glideLeft > 0, grapple: g.grapple && grappleLeft > 0 };

  if (ok[tool]) return { valid: true, tool, ...base };

  // Cheapest alternative that would work right now.
  const suggest: Tool | undefined = ok.walk ? 'walk' : ok.glide ? 'glide' : ok.grapple ? 'grapple' : undefined;
  const dist = `${g.gap.toFixed(1)} tiles`;
  const height = g.rise === 0 ? 'same height' : `${floors(g.rise)} ${g.rise > 0 ? 'higher' : 'lower'}`;

  let why: string;
  if (tool === 'walk') {
    why = g.gap > WALK_GAP
      ? `Too far to walk: ${dist} (walk reaches ${WALK_GAP}).`
      : `Too steep to walk: ${height} (walk climbs ${WALK_RISE}).`;
  } else if (tool === 'glide') {
    if (glideLeft === 0) why = 'No Glides left.';
    else if (g.rise > 0) why = `Glide cannot go up: that roof is ${height}.`;
    else why = `Too far to glide: ${dist} (glide reaches ${GLIDE_GAP}).`;
  } else {
    why = grappleLeft === 0 ? 'No Grapples left.' : `Too far to grapple: ${dist} (grapple reaches ${GRAPPLE_GAP}).`;
  }

  let fix: string;
  if (suggest) fix = ` Pick ${NAME[suggest]}, then tap the roof.`;
  else if (g.gap > GLIDE_GAP) fix = ' Out of range of every tool. Get closer first.';
  else if (g.rise > 0 && g.gap > GRAPPLE_GAP) fix = ' Only a Grapple climbs, and it reaches 6 tiles. Get closer first.';
  else fix = ' The tool it needs is used up.';

  return { valid: false, tool, reason: why + fix, ...base, ...(suggest ? { suggest } : {}) };
}

/** Every roof reachable right now with `tool` (glowing rings in the UI). */
export function reachableFrom(
  buildings: Building[],
  from: number,
  glideLeft: number,
  grappleLeft: number,
  collapsed: ReadonlySet<number>,
  tool: Tool
): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < buildings.length; i++) {
    if (i === from) continue;
    if (canJump(buildings, from, i, glideLeft, grappleLeft, collapsed, tool).valid) out.add(i);
  }
  return out;
}

/** Roofs reachable with ANY tool still available, mapped to the cheapest tool. */
export function reachableAny(
  buildings: Building[],
  from: number,
  glideLeft: number,
  grappleLeft: number,
  collapsed: ReadonlySet<number>
): Map<number, Tool> {
  const out = new Map<number, Tool>();
  for (const t of ['walk', 'glide', 'grapple'] as const) {
    for (const i of reachableFrom(buildings, from, glideLeft, grappleLeft, collapsed, t)) {
      if (!out.has(i)) out.set(i, t);
    }
  }
  return out;
}

export interface RunState {
  pos: number;
  glideLeft: number;
  grappleLeft: number;
  collapsed: Set<number>;
  goldCollected: Set<number>;
  path: number[];
  moveCount: number;
}

export function cityTools(city: Pick<City, 'tools'>): { glide: number; grapple: number } {
  return city.tools ?? DEFAULT_TOOLS;
}

export function initialRunState(city: City): RunState {
  const t = cityTools(city);
  return {
    pos: city.startIndex,
    glideLeft: t.glide,
    grappleLeft: t.grapple,
    collapsed: new Set<number>(),
    goldCollected: new Set<number>(),
    path: [city.startIndex],
    moveCount: 0,
  };
}

/** Applies one move immutably. Returns null if the move is invalid. */
export function applyMove(state: RunState, move: Move, buildings: Building[]): RunState | null {
  const check = canJump(
    buildings,
    state.pos,
    move.to,
    state.glideLeft,
    state.grappleLeft,
    state.collapsed,
    move.tool
  );
  if (!check.valid) return null;

  const newCollapsed = new Set(state.collapsed);
  if (buildings[state.pos].tags.includes('cracked')) newCollapsed.add(state.pos);

  const newGold = new Set(state.goldCollected);
  if (buildings[move.to].tags.includes('gold')) newGold.add(move.to);

  return {
    pos: move.to,
    glideLeft: move.tool === 'glide' ? state.glideLeft - 1 : state.glideLeft,
    grappleLeft: move.tool === 'grapple' ? state.grappleLeft - 1 : state.grappleLeft,
    collapsed: newCollapsed,
    goldCollected: newGold,
    path: [...state.path, move.to],
    moveCount: state.moveCount + 1,
  };
}

export const MAX_SUBMITTED_MOVES = 25;

/**
 * Authoritative validator, used by the server for every submission (and by the client
 * so the numbers always match). `elapsedMs` must come from the server's own clock.
 */
export function simulateRun(city: City, moves: Move[], elapsedMs = 0): RunResult {
  const fail = (error: string, s: RunState): RunResult => ({
    won: false,
    moves: s.moveCount,
    goldCollected: s.goldCollected.size,
    points: 0,
    path: s.path,
    error,
  });

  let state = initialRunState(city);
  if (moves.length > MAX_SUBMITTED_MOVES) return fail('Too many moves', state);

  for (const move of moves) {
    if (move.to < 0 || move.to >= city.buildings.length) return fail('Move out of range', state);
    if (state.pos === city.summitIndex) return fail('Moves after reaching the Summit', state);
    const next = applyMove(state, move, city.buildings);
    if (!next) return fail('Invalid move', state);
    state = next;
  }

  const won = state.pos === city.summitIndex;
  const toolsLeft = state.glideLeft + state.grappleLeft;
  return {
    won,
    moves: state.moveCount,
    goldCollected: state.goldCollected.size,
    points: won ? computeScore(city.par, state.moveCount, state.goldCollected.size, toolsLeft, elapsedMs) : 0,
    path: state.path,
    toolsLeft,
    elapsedMs,
  };
}
