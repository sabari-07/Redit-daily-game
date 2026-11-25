/**
 * Keeps the header, footer, popups and splash text at their normal on-screen size even when
 * the browser page is zoomed (for example Chrome remembering 33% for this site). Only the 3D
 * city should change size. Sets the CSS variable --ui (1 = no correction).
 */

/** Standard browser zoom levels; a measured ratio is only trusted if it lands near one. */
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function snap(z: number): number | null {
  for (const level of ZOOM_LEVELS) if (Math.abs(z - level) / level < 0.04) return level;
  return null;
}

/** Best estimate of the browser page zoom (1 = 100%). */
export function pageZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  // No real screen has fewer than 1 device pixel per CSS pixel, so dpr < 1 means zoomed out.
  if (dpr < 0.95) return snap(dpr) ?? dpr;
  // Desktop mouse users only: on phones outerWidth is unreliable (and page zoom is blocked anyway).
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (touch) return 1;
  // Top-level page on desktop: outer window width is not affected by page zoom, inner is.
  if (window.top === window && window.outerWidth > 0 && window.innerWidth > 0) {
    const z = snap(window.outerWidth / window.innerWidth);
    if (z !== null) return z;
  }
  return 1;
}

export function installUiScale(): void {
  const apply = (): void => {
    const ui = Math.min(4, Math.max(0.5, 1 / pageZoom()));
    document.documentElement.style.setProperty('--ui', ui.toFixed(3));
    // At normal zoom no transform is applied at all, so text is rendered natively (never resampled).
    document.documentElement.classList.toggle('ui-scaled', Math.abs(ui - 1) > 0.02);
  };
  apply();
  window.addEventListener('resize', apply);
}
