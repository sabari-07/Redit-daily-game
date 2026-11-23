import type { City, RunResult, Tool } from '../../shared/types.js';
import { scoreBreakdown, formatClock } from '../../shared/scoring.js';
import { msUntilNextUtcMidnight } from '../../shared/date.js';
import { shareComment, getGhosts } from '../api.js';
import { showToast } from './toast.js';
import { trackInteraction, trackWin, trackLose } from '../telemetry.js';
import { openModal, setModalTitle, type Modal } from './modal.js';
import { renderLeaderboard } from './leaderboard.js';

const TOOL_SQUARE: Record<Tool, string> = { walk: '🟦', glide: '🟪', grapple: '🟧' };

/** Spoiler-free share text: no building titles, just the shape of the route. */
export function buildShareText(result: RunResult, city: City, dayNumber: number, tools: Tool[]): string {
  const squares = tools.map((t, i) => (i === tools.length - 1 ? '🟩' : TOOL_SQUARE[t])).join('');
  return [
    `Skyline #${dayNumber} · ${city.difficulty}`,
    `🏙️ ${result.moves} jumps (par ${city.par}) · ⏱ ${formatClock(result.elapsedMs ?? 0)} · ⭐ ${result.points}`,
    squares,
  ].join('\n');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ResultOpts {
  result: RunResult;
  city: City;
  dayNumber: number;
  tools: Tool[];
  streak: number;
  rank: number;
  username: string;
  practice: boolean;
  /** Points of today's ranked run (shown when this run is practice). */
  rankedPoints?: number;
  loseReason?: 'out-of-moves' | 'stuck';
  onRetry: () => void;
  onUndo?: () => void;
  onClose: () => void;
}

/** The single end-of-run card: tabs at the top (Result / Leaderboard / Routes), × to close. */
export class ResultCard {
  private modal: Modal | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  show(o: ResultOpts): void {
    this.hide();
    if (o.result.won) trackWin(o.result.points);
    else trackLose();

    const title = o.result.won ? 'Route complete' : o.loseReason === 'stuck' ? 'Dead end' : 'Out of jumps';
    const m = openModal({ id: 'result-modal', title, wide: true, onClose: () => { this.stop(); o.onClose(); } });
    this.modal = m;

    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const panel = el('div', 'tab-panel');
    const tabDefs: Array<[string, () => void]> = [
      ['Result', () => { setModalTitle(m, title); this.renderResult(panel, o); }],
      ['Leaderboard', () => { trackInteraction('open_leaderboard'); setModalTitle(m, "Today's leaderboard"); void renderLeaderboard(panel, o.username); }],
    ];
    if (o.result.won) {
      tabDefs.push(['Popular routes', () => { trackInteraction('open_ghosts'); setModalTitle(m, 'Popular routes'); void this.renderRoutes(panel); }]);
    }
    const buttons = tabDefs.map(([label, render], i) => {
      const b = el('button', 'tab', label);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => {
        buttons.forEach((x, j) => x.setAttribute('aria-selected', String(j === i)));
        render();
      });
      tabs.append(b);
      return b;
    });
    buttons[0].setAttribute('aria-selected', 'true');
    m.body.append(tabs, panel);
    this.renderResult(panel, o);
  }

  private renderResult(panel: HTMLElement, o: ResultOpts): void {
    panel.replaceChildren();
    const { result, city } = o;

    if (!result.won) {
      panel.append(el('p', 'result-text', o.loseReason === 'stuck'
        ? 'No roof is in reach from here: your tools are used up or the roofs nearby collapsed. Undo your last jump or start over. The clock keeps running.'
        : `You used all ${city.maxMoves} jumps. Par today is ${city.par}, so a shorter route exists. The clock keeps running.`));
      const row = el('div', 'result-actions');
      if (o.onUndo) {
        const undo = o.onUndo;
        const u = el('button', 'btn-secondary', 'Undo last jump');
        u.addEventListener('click', () => { this.hide(); undo(); });
        row.append(u);
      }
      const retry = el('button', 'btn-primary', 'Start over');
      retry.addEventListener('click', () => { this.hide(); o.onRetry(); });
      row.append(retry);
      panel.append(row);
      return;
    }

    if (o.practice) {
      panel.append(el('p', 'practice-note',
        `Practice run. Your first finish today${o.rankedPoints !== undefined ? ` (${o.rankedPoints} pts)` : ''} is the one on the leaderboard.`));
    }

    const big = el('div', 'result-points');
    animateCount(big, result.points, 800);
    panel.append(big);

    const stats = el('div', 'result-stats');
    const stat = (label: string, value: string): void => {
      const c = el('div');
      c.append(el('div', 'result-stat-label', label), el('div', 'result-stat-value', value));
      stats.append(c);
    };
    stat('Jumps', `${result.moves} / ${city.par}`);
    stat('Time', formatClock(result.elapsedMs ?? 0));
    stat('Gold', String(result.goldCollected));
    stat('Rank', o.rank > 0 ? `#${o.rank}` : '—');
    stat('Streak', o.streak > 0 ? `${o.streak} day${o.streak === 1 ? '' : 's'}` : '—');
    panel.append(stats);

    const bd = scoreBreakdown(city.par, result.moves, result.goldCollected, result.toolsLeft ?? 0, result.elapsedMs ?? 0);
    const breakdown = el('div', 'score-breakdown');
    const line = (label: string, value: number, always = false): void => {
      if (value === 0 && !always) return;
      breakdown.append(el('span', '', label), el('span', value >= 0 ? 'pos' : 'neg', value > 0 ? `+${value}` : String(value)));
    };
    const diff = city.par - result.moves;
    line('Reached the Summit', bd.summit);
    line(`${Math.abs(diff)} jump${Math.abs(diff) === 1 ? '' : 's'} ${diff >= 0 ? 'under' : 'over'} par`, bd.route);
    line('At or under par', bd.perfect);
    line(`Speed (${formatClock(result.elapsedMs ?? 0)}: 1000 − 4/s)`, bd.speed, true);
    line(`Gold coins ×${result.goldCollected}`, bd.gold);
    line(`Unused tools ×${result.toolsLeft ?? 0}`, bd.tools);
    breakdown.append(el('span', 'total', 'Total'), el('span', 'total', String(bd.total)));
    panel.append(breakdown);

    const map = buildRouteMap(result.path, city);
    map.className = 'route-map-canvas';
    panel.append(map);

    const share = buildShareText(result, city, o.dayNumber, o.tools);
    const shareBox = el('pre', 'share-text', share);
    shareBox.setAttribute('aria-label', 'Your result, ready to share');
    panel.append(shareBox);

    const row = el('div', 'result-actions');
    const copy = el('button', 'btn-secondary', 'Copy');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(share).then(
        () => showToast('Copied', 'success'),
        () => showToast('Copy is not allowed here. Select the text above instead.', 'info')
      );
    });
    const post = el('button', 'btn-primary', 'Share as a comment');
    post.addEventListener('click', async () => {
      post.disabled = true;
      try {
        const { ok, error } = await shareComment(share);
        if (ok) {
          showToast('Comment posted', 'success');
          trackInteraction('share');
          post.textContent = 'Shared';
          return;
        }
        showToast(error ?? 'Could not post the comment', 'error');
      } catch {
        showToast('Could not post the comment', 'error');
      }
      post.disabled = false;
    });
    row.append(copy, post);
    panel.append(row);

    const again = el('button', 'btn-text', 'Play again (practice, not ranked)');
    again.addEventListener('click', () => { this.hide(); o.onRetry(); });
    panel.append(again);

    const countdown = el('div', 'countdown');
    const update = (): void => { countdown.textContent = `New city in ${formatCountdown(msUntilNextUtcMidnight())}`; };
    update();
    this.stop();
    this.timer = setInterval(update, 1000);
    panel.append(countdown);
  }

  private async renderRoutes(panel: HTMLElement): Promise<void> {
    panel.replaceChildren(el('p', 'muted', 'Loading…'));
    try {
      const ghosts = await getGhosts();
      panel.replaceChildren();
      if (ghosts.length === 0) {
        panel.append(el('p', 'muted', 'No routes yet. Yours will show here for the next players.'));
        return;
      }
      const labels = ['Most popular', 'Second', 'Third'];
      ghosts.forEach((g, i) => {
        panel.append(el('p', 'route-line', `${labels[i] ?? `#${i + 1}`}: ${g.path.length - 1} jumps, used by ${g.count} player${g.count === 1 ? '' : 's'}`));
      });
    } catch {
      panel.replaceChildren(el('p', 'muted', 'Routes unlock after you finish today.'));
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  hide(): void {
    this.stop();
    const m = this.modal;
    this.modal = null;
    if (m && document.body.contains(m.card)) m.card.parentElement?.remove();
  }

  dispose(): void {
    this.hide();
  }
}

function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function animateCount(node: HTMLElement, target: number, duration: number): void {
  const start = performance.now();
  const step = (): void => {
    const t = Math.min((performance.now() - start) / duration, 1);
    node.textContent = String(Math.round(t * target));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function buildRouteMap(path: number[], city: City): HTMLCanvasElement {
  const W = 480;
  const H = 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, W, H);
  if (city.buildings.length === 0) return canvas;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of city.buildings) {
    minX = Math.min(minX, b.x - b.size / 2); maxX = Math.max(maxX, b.x + b.size / 2);
    minZ = Math.min(minZ, b.z - b.size / 2); maxZ = Math.max(maxZ, b.z + b.size / 2);
  }
  const scale = Math.min((W - 20) / (maxX - minX || 1), (H - 20) / (maxZ - minZ || 1));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxZ - minZ) * scale) / 2;
  const at = (x: number, z: number): [number, number] => [ox + (x - minX) * scale, oy + (z - minZ) * scale];
  for (const b of city.buildings) {
    const [x, y] = at(b.x, b.z);
    const s = b.size * scale;
    ctx.fillStyle = b.tags.includes('summit') ? '#ffd36b' : b.tags.includes('start') ? '#18c6f0' : path.includes(b.index) ? '#4b5b7a' : '#2a3245';
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.strokeStyle = '#7ee2ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  path.forEach((idx, i) => {
    const b = city.buildings[idx];
    const [x, y] = at(b.x, b.z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  return canvas;
}
