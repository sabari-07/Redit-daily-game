import type { LeaderboardEntry } from '../../shared/types.js';
import { formatClock } from '../../shared/scoring.js';
import { getLeaderboard } from '../api.js';
import { openModal } from './modal.js';

/** Renders a leaderboard table (rank, player, points, time) into `into`. */
export async function renderLeaderboard(into: HTMLElement, me: string): Promise<void> {
  into.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = 'Loading…';
  into.append(loading);
  try {
    const { top, myRank } = await getLeaderboard();
    into.replaceChildren(table(top, me, myRank));
  } catch {
    loading.textContent = 'The leaderboard could not be loaded. Try again in a moment.';
  }
}

function table(entries: LeaderboardEntry[], me: string, myRank: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'lb-wrap';
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'Ranked by points (speed counts). Equal points: the faster time wins. Only your first finish of the day is ranked.';
  const grid = document.createElement('div');
  grid.className = 'lb-grid';
  for (const h of ['#', 'Player', 'Points', 'Time']) {
    const c = document.createElement('span');
    c.className = 'lb-head';
    c.textContent = h;
    grid.append(c);
  }
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nobody has reached the Summit yet today. Be the first.';
    wrap.append(empty);
  }
  for (const e of entries) {
    const mine = e.username === me;
    const cells = [`${e.rank}`, mine ? 'You' : e.username, String(e.points), formatClock(e.timeMs)];
    cells.forEach((text, i) => {
      const c = document.createElement('span');
      c.className = `lb-cell${mine ? ' me' : ''}${i === 2 ? ' pts' : ''}`;
      c.textContent = text;
      grid.append(c);
    });
  }
  wrap.append(grid, note);
  if (myRank > entries.length) {
    const mine = document.createElement('p');
    mine.className = 'lb-me-line';
    mine.textContent = `Your rank today: #${myRank}`;
    wrap.append(mine);
  }
  return wrap;
}

/** The top-bar Leaderboard button: opens at the top of the screen with a × close. */
export class LeaderboardPanel {
  constructor(private readonly username: string) {}

  toggle(): void {
    const existing = document.getElementById('leaderboard-modal');
    if (existing) {
      existing.remove();
      return;
    }
    const m = openModal({ id: 'leaderboard-modal', title: "Today's leaderboard" });
    void renderLeaderboard(m.body, this.username);
  }

  dispose(): void {
    document.getElementById('leaderboard-modal')?.remove();
  }
}
