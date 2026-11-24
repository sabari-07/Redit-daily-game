import { describe, it, expect } from 'vitest';
import { solvePar, solveRoute, nextStep } from './solver.js';
import { buildCity } from './city.js';
import { simulateRun, initialRunState, applyMove } from './rules.js';
import { makeRng } from './rng.js';
import type { City, RawPost } from './types.js';

function posts(seed: string, n: number): RawPost[] {
  const rng = makeRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const score = Math.floor(30 + Math.pow(rng(), 2.2) * 24000);
    return {
      id: `t3_${seed}_${i}`,
      title: `Post ${i}`,
      score,
      numComments: Math.floor(score * (0.03 + rng() * (rng() < 0.2 ? 1.4 : 0.25))),
      permalink: `/r/x/${i}`,
    };
  });
}

const cities: City[] = ['2024-01-01', '2024-01-03', '2024-01-06'].map((d) => buildCity(posts(d, 32), 'sub', d));

describe('solver', () => {
  it('fast solvePar agrees with the full route solver', () => {
    for (const c of cities) {
      expect(solvePar(c)).toBe(solveRoute(c)?.par ?? null);
      // Also from other start roofs, including unsolvable ones.
      for (let s = 0; s < c.buildings.length; s += 3) {
        const alt = { ...c, startIndex: s };
        expect(solvePar(alt)).toBe(solveRoute(alt)?.par ?? null);
      }
    }
  }, 60_000);

  it('cities have 29 buildings when enough posts exist', () => {
    for (const c of cities) expect(c.buildings.length).toBe(29);
  });

  it('nextStep from the start is the first jump of a shortest route', () => {
    for (const c of cities) {
      const step = nextStep(c, { pos: c.startIndex, glideLeft: c.tools.glide, grappleLeft: c.tools.grapple, collapsed: [] });
      expect(step).not.toBeNull();
      const after = applyMove(initialRunState(c), step!, c.buildings);
      expect(after).not.toBeNull();
      // From there, the rest of the route is exactly par - 1 jumps.
      const rest = solveRoute(c, 20, {
        pos: after!.pos, glideLeft: after!.glideLeft, grappleLeft: after!.grappleLeft, collapsed: after!.collapsed,
      });
      expect(rest?.par).toBe(c.par - 1);
    }
  });

  it('following nextStep every turn reaches the Summit in par jumps', () => {
    for (const c of cities) {
      let run = initialRunState(c);
      const moves = [];
      for (let i = 0; i < 25 && run.pos !== c.summitIndex; i++) {
        const step = nextStep(c, { pos: run.pos, glideLeft: run.glideLeft, grappleLeft: run.grappleLeft, collapsed: run.collapsed });
        expect(step).not.toBeNull();
        moves.push(step!);
        run = applyMove(run, step!, c.buildings)!;
      }
      expect(simulateRun(c, moves).won).toBe(true);
      expect(moves.length).toBe(c.par);
    }
  });

  it('every day has a different best route, even with the same posts', () => {
    const same = posts('fixed', 32);
    const routes = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2024, 2, 1 + d)).toISOString().slice(0, 10);
      const c = buildCity(same, 'sub', day);
      const r = solveRoute(c)!;
      // Route = the roofs visited in order, by position (indices alone could repeat by chance).
      const roofs = [c.startIndex, ...r.moves.map((m) => m.to)].map((i) => `${c.buildings[i].x.toFixed(1)},${c.buildings[i].z.toFixed(1)}`);
      routes.add(`${roofs.join('>')}|${r.moves.map((m) => m.tool).join('')}`);
    }
    expect(routes.size).toBe(30);
  }, 240_000);

  it('nextStep is null at the Summit', () => {
    const c = cities[0];
    expect(nextStep(c, { pos: c.summitIndex, glideLeft: 1, grappleLeft: 1, collapsed: [] })).toBeNull();
  });
});
