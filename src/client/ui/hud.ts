import type { GameState } from '../state.js';
import type { Tool } from '../../shared/types.js';
import { formatClock } from '../../shared/scoring.js';
import { showToast } from './toast.js';
import { trackInteraction } from '../telemetry.js';
import { isMuted, setMuted, playToolSelect } from '../audio.js';
import { GLIDE_GAP, GRAPPLE_GAP, WALK_GAP, WALK_RISE } from '../../shared/rules.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const TOOL_INFO: Record<Tool, { name: string; desc: string }> = {
  walk: { name: 'Walk', desc: `Free · ${WALK_GAP} tiles, ±${WALK_RISE} floors` },
  glide: { name: 'Glide', desc: `${GLIDE_GAP} tiles · same height or lower` },
  grapple: { name: 'Grapple', desc: `${GRAPPLE_GAP} tiles · climbs any height` },
};

/**
 * HUD. Every control has a text label.
 *  top bar : title, difficulty, Jumps vs Par, Gold, Time, On-track score, Streak, Help, Sound, Leaderboard
 *  bottom  : tool picker (Walk / Glide / Grapple with charges), Undo, Restart, Find me, Start/clock
 * Jumps are made by tapping a ringed roof twice (no Jump button).
 */
export class GameHUD {
  private topBar: HTMLElement;
  private legend: HTMLElement;
  private bottomDock: HTMLElement;
  private startBtn: HTMLButtonElement;
  private clockPill: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private hintBtn: HTMLButtonElement;
  private movesEl: HTMLElement;
  private goldEl: HTMLElement;
  private timeEl: HTMLElement;
  private scoreEl: HTMLElement;
  private streakEl: HTMLElement;
  private toolBtns = new Map<Tool, { btn: HTMLButtonElement; count: HTMLElement | null }>();
  private disposables: Array<() => void> = [];

  constructor(
    container: HTMLElement,
    private readonly state: GameState,
    opts: {
      onStart: () => void;
      onJump: () => void;
      onUndo: () => void;
      onReset: () => void;
      onRecenter: () => void;
      onToggleLeaderboard: () => void;
      onShowRules: () => void;
      onHint: () => void;
    }
  ) {
    const city = state.city;

    // ---------- Top bar ----------
    this.topBar = el('div', 'top-bar');
    this.topBar.setAttribute('role', 'banner');
    const brand = el('div', 'brand');
    brand.append(el('div', 'game-title', 'SKYLINE'));
    if (city) brand.append(el('span', `difficulty-chip ${city.difficulty.toLowerCase()}`, city.difficulty));

    const stats = el('div', 'top-stats');
    const stat = (label: string, hint: string, cls = ''): HTMLElement => {
      const g = el('div', 'stat-item');
      g.title = hint;
      const v = el('div', `stat-value ${cls}`.trim());
      g.append(el('div', 'stat-label', label), v);
      stats.append(g);
      return v;
    };
    this.movesEl = stat('JUMPS / PAR', 'Jumps used. Par is the fewest jumps that can reach the Summit today.');
    this.goldEl = stat('GOLD', 'Gold coins collected (+100 each).');
    this.timeEl = stat('TIME', 'Starts when you press Start or touch the city. Undo and Restart do not stop it.', 'time');
    this.scoreEl = stat('ON TRACK FOR', 'Points if you reach the Summit in par jumps right now. Drops 4 per second.', 'score');
    this.streakEl = stat('STREAK', 'Days in a row you reached the Summit.');

    const actions = el('div', 'top-bar-actions');
    const chip = (long: string, short: string, aria: string, onClick: () => void): HTMLButtonElement => {
      const b = el('button', 'btn-chip');
      b.setAttribute('aria-label', aria);
      b.append(el('span', 'lbl-long', long), el('span', 'lbl-short', short));
      b.addEventListener('click', onClick);
      actions.append(b);
      return b;
    };
    chip('How to play', 'Help', 'How to play and how scoring works', opts.onShowRules);
    const sound = chip(isMuted() ? 'Sound off' : 'Sound on', isMuted() ? 'Muted' : 'Sound', 'Toggle sound', () => {
      const m = !isMuted();
      setMuted(m);
      sound.replaceChildren(el('span', 'lbl-long', m ? 'Sound off' : 'Sound on'), el('span', 'lbl-short', m ? 'Muted' : 'Sound'));
    });
    chip('Leaderboard', 'Top 10', "Show today's leaderboard", () => {
      trackInteraction('open_leaderboard');
      opts.onToggleLeaderboard();
    });
    this.topBar.append(brand, stats, actions);

    // ---------- Ring legend ----------
    this.legend = el('div', 'ring-legend panel');
    this.legend.setAttribute('aria-label', 'What the rooftop rings mean');
    this.legend.append(el('div', 'legend-title', 'Rooftop rings'));
    const row = (cls: string, text: string): void => {
      const r = el('div', 'legend-row');
      r.append(el('span', `legend-swatch ${cls}`), el('span', '', text));
      this.legend.append(r);
    };
    row('walk', 'Bright: reachable with your tool');
    row('dim', 'Faint coloured: needs another tool');
    row('ahead', 'White: reachable after that jump');
    row('blocked', 'Red: out of reach');

    // ---------- Bottom dock ----------
    this.bottomDock = el('div', 'bottom-dock');
    this.bottomDock.setAttribute('role', 'toolbar');
    this.bottomDock.setAttribute('aria-label', 'Game controls');

    const tools = el('div', 'tool-picker');
    tools.setAttribute('role', 'radiogroup');
    tools.setAttribute('aria-label', 'Choose your next jump');
    for (const t of ['walk', 'glide', 'grapple'] as const) {
      const b = el('button', `tool-btn ${t}`);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `${TOOL_INFO[t].name}: ${TOOL_INFO[t].desc}`);
      const count = t === 'walk' ? null : el('span', 'tool-count', '0');
      const text = el('div', 'tool-text');
      text.append(el('div', 'tool-name', TOOL_INFO[t].name), el('div', 'tool-desc', TOOL_INFO[t].desc));
      if (count) b.append(count);
      else b.append(el('span', 'tool-count free', '∞'));
      b.append(text);
      b.addEventListener('click', () => {
        if (b.disabled) return;
        opts.onStart(); // choosing a tool is an interaction: the clock starts
        playToolSelect();
        state.setTool(t);
      });
      this.toolBtns.set(t, { btn: b, count });
      tools.append(b);
    }

    const act = el('div', 'action-group');
    const secondary = (label: string, aria: string, onClick: () => void): HTMLButtonElement => {
      const b = el('button', 'btn-secondary', label);
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', onClick);
      act.append(b);
      return b;
    };
    this.hintBtn = secondary('Hint (1)', 'Show the next step of the best route. One hint per level.', opts.onHint);
    this.hintBtn.classList.add('hint-btn');
    this.undoBtn = secondary('Undo', 'Undo last jump', () => {
      trackInteraction('undo');
      opts.onUndo();
    });
    secondary('Restart', 'Back to the start roof (the clock keeps running)', () => {
      trackInteraction('reset');
      opts.onReset();
    });
    secondary('Find me', 'Move the camera to your hero', opts.onRecenter);

    this.startBtn = el('button', 'btn-primary start-btn');
    this.startBtn.setAttribute('aria-label', 'Start the clock');
    this.startBtn.append(el('span', 'start-label', 'Start'), el('span', 'start-sub', 'clock starts now'));
    this.startBtn.addEventListener('click', opts.onStart);
    this.clockPill = el('div', 'clock-pill');
    this.clockPill.setAttribute('aria-live', 'off');
    this.clockPill.hidden = true;

    this.bottomDock.append(tools, act, this.startBtn, this.clockPill);
    container.append(this.topBar, this.legend, this.bottomDock);

    const keyHandler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'Enter': opts.onStart(); opts.onJump(); break;
        case '1': opts.onStart(); state.setTool('walk'); break;
        case '2': if (!this.toolBtns.get('glide')?.btn.disabled) { opts.onStart(); state.setTool('glide'); } break;
        case '3': if (!this.toolBtns.get('grapple')?.btn.disabled) { opts.onStart(); state.setTool('grapple'); } break;
        case 'z': case 'Z': trackInteraction('undo'); opts.onUndo(); break;
        case 'r': case 'R': trackInteraction('reset'); opts.onReset(); break;
        case 'f': case 'F': opts.onRecenter(); break;
        case 'h': case 'H': opts.onHint(); break;
        case 'Escape': state.select(null); break;
      }
    };
    window.addEventListener('keydown', keyHandler);
    this.disposables.push(() => window.removeEventListener('keydown', keyHandler));

    state.on('tool-change', ({ tool }) => this.setActiveTool(tool));
    this.updateFromState();
  }

  private setActiveTool(tool: Tool): void {
    for (const [t, { btn }] of this.toolBtns) {
      btn.classList.toggle('active', t === tool);
      btn.setAttribute('aria-checked', String(t === tool));
    }
  }

  updateFromState(): void {
    const { run, city } = this.state;
    if (!run || !city) return;
    this.movesEl.textContent = `${run.moveCount} / ${city.par}`;
    this.movesEl.classList.toggle('over', run.moveCount >= city.par);
    const goldTotal = city.buildings.filter((b) => b.tags.includes('gold')).length;
    this.goldEl.textContent = `${run.goldCollected.size} / ${goldTotal}`;
    const glide = this.toolBtns.get('glide')!;
    const grapple = this.toolBtns.get('grapple')!;
    glide.count!.textContent = String(run.glideLeft);
    grapple.count!.textContent = String(run.grappleLeft);
    glide.btn.disabled = run.glideLeft === 0;
    grapple.btn.disabled = run.grappleLeft === 0;
    this.undoBtn.disabled = this.state.moveHistory.length === 0;
    this.setActiveTool(this.state.currentTool);
    this.tick();
  }

  /** Called every frame: clock and on-track score. */
  tick(): void {
    const started = this.state.clockStartedAt !== null;
    this.startBtn.hidden = started;
    this.clockPill.hidden = !started;
    const t = formatClock(this.state.elapsedMs());
    if (this.timeEl.textContent !== t) {
      this.timeEl.textContent = t;
      this.clockPill.textContent = `⏱ ${t}`;
    }
    const s = String(this.state.projectedScore());
    if (this.scoreEl.textContent !== s) this.scoreEl.textContent = s;
  }

  /** "Hint (1)" while available, "Hint used" after. */
  setHintsLeft(n: number): void {
    this.hintBtn.textContent = n > 0 ? `Hint (${n})` : 'Hint used';
    this.hintBtn.disabled = n <= 0;
  }

  /** Blinks the tool the hint says to pick (null stops it). */
  blinkTool(tool: Tool | null): void {
    for (const [t, { btn }] of this.toolBtns) btn.classList.toggle('hint-blink', t === tool);
  }

  updateStreak(streak: number): void {
    this.streakEl.textContent = streak > 0 ? `${streak} day${streak === 1 ? '' : 's'}` : 'Start one';
  }

  showInvalidMove(reason: string): void {
    showToast(reason, 'error');
  }

  dispose(): void {
    for (const cleanup of this.disposables) cleanup();
    this.topBar.remove();
    this.legend.remove();
    this.bottomDock.remove();
  }
}
