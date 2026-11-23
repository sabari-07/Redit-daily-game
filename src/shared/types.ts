export type Tag = 'summit' | 'start' | 'gold' | 'cracked';
/** The player always picks the tool. Walk is free; Glide and Grapple spend a charge. */
export type Tool = 'walk' | 'glide' | 'grapple';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface RawPost {
  id: string;
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  flair?: string;
}

export interface Building {
  index: number;
  postId: string;
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  x: number;
  z: number;
  size: 3 | 5;
  height: number;
  tags: Tag[];
}

export interface City {
  /** 2 = explicit tools, per-city tool charges, timed scoring. Older stored cities are regenerated. */
  version: 2;
  subreddit: string;
  dayKey: string;
  seed: string;
  buildings: Building[];
  startIndex: number;
  summitIndex: number;
  par: number;
  maxMoves: number;
  difficulty: Difficulty;
  /** Charges for today's city (fewer on harder days). */
  tools: { glide: number; grapple: number };
  /** Street centre lines between lot rows/columns, for drawing roads. */
  streets?: { x: number[]; z: number[] };
}

export interface Move {
  to: number;
  tool: Tool;
}

export interface RunResult {
  won: boolean;
  moves: number;
  goldCollected: number;
  points: number;
  path: number[];
  /** Unused Glide + Grapple charges at the end of the run (feeds the tool bonus). */
  toolsLeft?: number;
  /** Time on the server clock from the day's first Start/touch to this submission. */
  elapsedMs?: number;
  error?: string;
}

export interface LeaderboardEntry {
  username: string;
  points: number;
  moves: number;
  timeMs: number;
  rank: number;
}

export interface GhostRoute {
  path: number[];
  count: number;
}

export interface MyRun {
  points: number;
  moves: number;
  path: number[];
  timeMs: number;
}

export interface InitResponse {
  city: City;
  username: string;
  postId: string;
  /** The ranked (first finished) run today, if any. */
  myBest: MyRun | null;
  streak: number;
  hasFinished: boolean;
  /** Server time the player's clock started today (null = not started yet). */
  clockStartedAt: number | null;
  /** Server "now", so the client can show the running clock without trusting its own clock. */
  serverNow: number;
  /** Days since this community's first Skyline (shown as Skyline #N). */
  dayNumber: number;
}
