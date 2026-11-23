/**
 * Scoring. Every number is recomputed by the server from the submitted moves and the
 * server's own clock, so a client cannot fake it.
 *
 *   Reach the Summit        +500
 *   Each jump under par     +150      Each jump over par  -100
 *   Finish at or under par  +250
 *   Each gold coin          +100
 *   Each unused tool         +50
 *   Speed bonus             +1000, minus 4 for every second on the clock (0 after 4:10)
 *
 * The clock starts the first time you press Start or touch the city, and keeps running
 * through Undo and Restart. The total never drops below 100.
 */
export const SCORE_RULES = {
  summit: 500,
  perMoveUnderPar: 150,
  perMoveOverPar: 100,
  perfectRoute: 250,
  perGold: 100,
  perToolSaved: 50,
  speedMax: 1000,
  speedPerSecond: 4,
  floor: 100,
} as const;

export interface ScoreBreakdown {
  summit: number;
  route: number;
  perfect: number;
  gold: number;
  tools: number;
  speed: number;
  total: number;
}

export function speedBonus(elapsedMs: number): number {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return Math.max(0, SCORE_RULES.speedMax - SCORE_RULES.speedPerSecond * seconds);
}

export function scoreBreakdown(
  par: number,
  moves: number,
  goldCollected: number,
  toolsLeft: number,
  elapsedMs: number
): ScoreBreakdown {
  const summit = SCORE_RULES.summit;
  const route =
    moves <= par
      ? SCORE_RULES.perMoveUnderPar * (par - moves)
      : -SCORE_RULES.perMoveOverPar * (moves - par);
  const perfect = moves <= par ? SCORE_RULES.perfectRoute : 0;
  const gold = SCORE_RULES.perGold * goldCollected;
  const tools = SCORE_RULES.perToolSaved * toolsLeft;
  const speed = speedBonus(elapsedMs);
  const total = Math.max(SCORE_RULES.floor, summit + route + perfect + gold + tools + speed);
  return { summit, route, perfect, gold, tools, speed, total };
}

/** Points for a finished (won) run. */
export function computeScore(
  par: number,
  moves: number,
  goldCollected: number,
  toolsLeft = 0,
  elapsedMs = 0
): number {
  return scoreBreakdown(par, moves, goldCollected, toolsLeft, elapsedMs).total;
}

/** Formats a clock value as m:ss. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Leaderboard sort key: higher points first, then FASTER time, then earlier submission.
 * points * 1e9 + (1e9 - min(elapsedMs, 999_999_999)) stays below 2^53 for points < 9e6.
 */
export function encodeLeaderboardScore(points: number, elapsedMs: number): number {
  const t = Math.min(Math.max(0, Math.floor(elapsedMs)), 999_999_999);
  return points * 1_000_000_000 + (1_000_000_000 - t);
}
