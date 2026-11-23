import type { Tool } from '../shared/types.js';

/**
 * Wrapper for Devvit Journeys telemetry SDK.
 * All calls are wrapped in try/catch — telemetry must NEVER break gameplay.
 * No personal data (no usernames, no post titles) in any event fields.
 * Journey.Start fires ONLY on explicit Play press, never on page load.
 */

type JourneysSdk = {
  track: (event: string, properties?: Record<string, unknown>) => void;
};

function getSdk(): JourneysSdk | null {
  // Devvit Journeys SDK is injected by the runtime as window.__journeys
  const w = window as unknown as { __journeys?: JourneysSdk };
  return w.__journeys ?? null;
}

function track(event: string, properties?: Record<string, unknown>): void {
  try {
    const sdk = getSdk();
    sdk?.track(event, properties);
  } catch {
    // Telemetry failures never affect gameplay
  }
}

/** Fire once when the app becomes interactive */
export function trackAppReady(): void {
  track('App.Ready');
}

/**
 * Fire when the player explicitly presses Play / starts a run.
 * NOT on app load, NOT on page view.
 */
export function trackJourneyStart(): void {
  track('Journey.Start');
}

/** Fire on each committed jump (mouseup/touchend confirmed) */
export function trackJump(movesUsed: number, par: number, tool: Tool): void {
  track('Journey.Progress', {
    progress: Math.min(0.95, movesUsed / par),
    action: 'jump',
    actionDetails: tool,
  });
}

/** Fire on UI interactions */
export function trackInteraction(action: 'undo' | 'reset' | 'open_leaderboard' | 'open_ghosts' | 'open_thread' | 'share'): void {
  track('Journey.Interaction', { action });
}

/** Fire on win */
export function trackWin(points: number): void {
  track('Journey.End', {
    complete: true,
    game: { win: true, score: points },
  });
}

/** Fire when out of moves */
export function trackLose(): void {
  track('Journey.End', {
    complete: false,
    game: { win: false, score: 0 },
  });
}

/** Fire when player leaves mid-run (visibilitychange hidden) */
export function trackAbandon(): void {
  track('Journey.End', { complete: false });
}
