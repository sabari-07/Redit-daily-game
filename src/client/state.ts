import type { City, Move, RunResult, Tool } from '../shared/types.js';
import { canJump, applyMove, initialRunState, reachableFrom, reachableAny } from '../shared/rules.js';
import { computeScore } from '../shared/scoring.js';
import type { RunState, JumpCheck } from '../shared/rules.js';

type EventMap = {
  'selection-change': { index: number | null; check: JumpCheck | null };
  'move': { state: RunState; move: Move; check: JumpCheck };
  'undo': { state: RunState };
  'reset': { state: RunState };
  'win': { result: RunResult };
  /** 'stuck' = no roof is reachable any more with any tool. */
  'lose': { moveCount: number; reason: 'out-of-moves' | 'stuck' };
  'tool-change': { tool: Tool };
  'clock-start': { startedAt: number };
};

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

export class GameState {
  city: City | null = null;
  run: RunState | null = null;
  selectedIndex: number | null = null;
  currentTool: Tool = 'walk';
  moveHistory: Array<{ move: Move; before: RunState }> = [];
  /** 'ready' = city is shown, clock not started yet. */
  phase: 'loading' | 'ready' | 'playing' | 'won' | 'lost' = 'loading';
  /** Server time the clock started (null until Start / first touch). */
  clockStartedAt: number | null = null;
  /** serverNow - Date.now(), so elapsed time follows the server clock. */
  private serverOffset = 0;
  /** Clock reading frozen at the moment the Summit was reached. */
  private frozenMs: number | null = null;

  private listeners = new Map<keyof EventMap, Array<Listener<keyof EventMap>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener as Listener<keyof EventMap>);
    this.listeners.set(event, existing);
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) (listener as Listener<K>)(data);
  }

  startGame(city: City, clockStartedAt: number | null, serverNow: number): void {
    this.city = city;
    this.run = initialRunState(city);
    this.selectedIndex = null;
    this.currentTool = 'walk';
    this.moveHistory = [];
    this.serverOffset = serverNow - Date.now();
    this.clockStartedAt = clockStartedAt;
    this.phase = clockStartedAt === null ? 'ready' : 'playing';
  }

  /** Called with the server's answer to /api/start. Idempotent. */
  clockStarted(startedAt: number, serverNow: number): void {
    this.serverOffset = serverNow - Date.now();
    const first = this.clockStartedAt === null;
    this.clockStartedAt = startedAt;
    if (this.phase === 'ready') this.phase = 'playing';
    if (first) this.emit('clock-start', { startedAt });
  }

  /** Time on today's clock, following server time. 0 before Start. */
  elapsedMs(): number {
    if (this.clockStartedAt === null) return 0;
    if (this.frozenMs !== null) return this.frozenMs;
    return Math.max(0, Date.now() + this.serverOffset - this.clockStartedAt);
  }

  private check(index: number): JumpCheck | null {
    if (!this.city || !this.run) return null;
    const r = this.run;
    return canJump(this.city.buildings, r.pos, index, r.glideLeft, r.grappleLeft, r.collapsed, this.currentTool);
  }

  select(index: number | null): void {
    if (!this.city || !this.run) return;
    this.selectedIndex = index;
    const check = index !== null && this.run.pos !== index ? this.check(index) : null;
    this.emit('selection-change', { index, check });
  }

  checkJump(to: number): JumpCheck | null {
    return this.check(to);
  }

  /** Roofs reachable now with the selected tool. */
  reachable(): Set<number> {
    if (!this.city || !this.run) return new Set();
    const r = this.run;
    return reachableFrom(this.city.buildings, r.pos, r.glideLeft, r.grappleLeft, r.collapsed, this.currentTool);
  }

  /** Roofs reachable now ONLY with a different tool (shown dimmed, with the tool's colour). */
  reachableWithOtherTool(): Map<number, Tool> {
    if (!this.city || !this.run) return new Map();
    const r = this.run;
    const now = this.reachable();
    const out = new Map<number, Tool>();
    for (const [i, t] of reachableAny(this.city.buildings, r.pos, r.glideLeft, r.grappleLeft, r.collapsed)) {
      if (!now.has(i)) out.set(i, t);
    }
    return out;
  }

  /** Roofs reachable from `target` after jumping there with the selected tool (look-ahead). */
  lookahead(target: number): Set<number> {
    if (!this.city || !this.run) return new Set();
    const next = applyMove(this.run, { to: target, tool: this.currentTool }, this.city.buildings);
    if (!next) return new Set();
    return new Set(reachableAny(this.city.buildings, next.pos, next.glideLeft, next.grappleLeft, next.collapsed).keys());
  }

  /** Score if the Summit is reached at par from here (or with the next jump once at/over par). */
  projectedScore(): number {
    if (!this.city || !this.run) return 0;
    const r = this.run;
    const moves = Math.max(this.city.par, r.moveCount + 1);
    return computeScore(this.city.par, moves, r.goldCollected.size, r.glideLeft + r.grappleLeft, this.elapsedMs());
  }

  jump(): boolean {
    if (!this.city || !this.run || this.selectedIndex === null || this.phase !== 'playing') return false;
    const check = this.check(this.selectedIndex);
    if (!check?.valid) return false;

    const before = { ...this.run, collapsed: new Set(this.run.collapsed), goldCollected: new Set(this.run.goldCollected) };
    const move: Move = { to: this.selectedIndex, tool: this.currentTool };
    const next = applyMove(this.run, move, this.city.buildings);
    if (!next) return false;

    this.moveHistory.push({ move, before });
    this.run = next;
    this.selectedIndex = null;
    this.emit('move', { state: this.run, move, check });
    // Tools are never kept armed: the next jump is a Walk unless the player picks again.
    if (this.currentTool !== 'walk') this.setTool('walk');

    if (this.run.pos === this.city.summitIndex) {
      this.phase = 'won';
      const toolsLeft = this.run.glideLeft + this.run.grappleLeft;
      const elapsedMs = this.elapsedMs();
      this.frozenMs = elapsedMs;
      this.emit('win', {
        result: {
          won: true,
          moves: this.run.moveCount,
          goldCollected: this.run.goldCollected.size,
          points: computeScore(this.city.par, this.run.moveCount, this.run.goldCollected.size, toolsLeft, elapsedMs),
          path: this.run.path,
          toolsLeft,
          elapsedMs,
        },
      });
    } else if (this.run.moveCount >= this.city.maxMoves) {
      this.phase = 'lost';
      this.emit('lose', { moveCount: this.run.moveCount, reason: 'out-of-moves' });
    } else {
      const r = this.run;
      if (reachableAny(this.city.buildings, r.pos, r.glideLeft, r.grappleLeft, r.collapsed).size === 0) {
        this.phase = 'lost';
        this.emit('lose', { moveCount: r.moveCount, reason: 'stuck' });
      }
    }
    return true;
  }

  undo(): void {
    if (!this.city || this.moveHistory.length === 0) return;
    const last = this.moveHistory.pop()!;
    this.run = last.before;
    this.selectedIndex = null;
    this.phase = 'playing';
    this.emit('undo', { state: this.run });
  }

  /** Back to the start roof. The clock keeps running (it is per day, not per attempt). */
  reset(): void {
    if (!this.city) return;
    this.run = initialRunState(this.city);
    this.selectedIndex = null;
    this.moveHistory = [];
    this.frozenMs = null;
    this.phase = this.clockStartedAt === null ? 'ready' : 'playing';
    this.setTool('walk');
    this.emit('reset', { state: this.run });
  }

  setTool(tool: Tool): void {
    this.currentTool = tool;
    this.emit('tool-change', { tool });
    if (this.selectedIndex !== null) this.select(this.selectedIndex);
  }

  getMoves(): Move[] {
    return this.moveHistory.map((h) => h.move);
  }
}
