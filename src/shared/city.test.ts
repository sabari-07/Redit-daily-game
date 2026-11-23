import { describe, it, expect } from 'vitest';
import { buildCity, footprintGap, dayPlan } from './city.js';
import { solveRoute, greedyRun } from './solver.js';
import { simulateRun } from './rules.js';
import { generateFixturePosts } from '../server/reddit.js';
import type { RawPost } from './types.js';

function makePost(i: number, score = 100 * i, comments = 10 * i): RawPost {
  return {
    id: `t3_${i}`,
    title: `Post number ${i}`,
    score,
    numComments: comments,
    permalink: `/r/test/comments/${i}`,
  };
}

function makePosts(n: number): RawPost[] {
  return Array.from({ length: n }, (_, i) => makePost(i + 1, (n - i) * 100, i * 5));
}

describe('footprintGap', () => {
  it('returns 0 for overlapping buildings', () => {
    expect(footprintGap(0, 0, 3, 0, 0, 3)).toBe(0);
  });

  it('calculates axis-aligned gap correctly', () => {
    // 3x3 buildings: half = 1; centers at x=0 and x=10 → gap = 10 - 1 - 1 = 8
    expect(footprintGap(0, 0, 3, 10, 0, 3)).toBe(8);
  });

  it('calculates diagonal gap', () => {
    // 3x3 half=1; centers (0,0) and (5,5): dx=5-1-1=3, dz=5-1-1=3 → sqrt(18) ≈ 4.24
    const gap = footprintGap(0, 0, 3, 5, 5, 3);
    expect(gap).toBeCloseTo(4.24, 1);
  });
});

describe('buildCity', () => {
  it('is deterministic', () => {
    const posts = makePosts(20);
    const a = buildCity(posts, 'testSub', '2024-01-01');
    const b = buildCity(posts, 'testSub', '2024-01-01');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 30_000);

  it('different seeds produce different cities', () => {
    const posts = makePosts(20);
    const a = buildCity(posts, 'testSub', '2024-01-01');
    const b = buildCity(posts, 'testSub', '2024-01-02');
    expect(JSON.stringify(a.buildings)).not.toBe(JSON.stringify(b.buildings));
  });

  it('throws with fewer than 12 eligible posts', () => {
    const posts = makePosts(5);
    expect(() => buildCity(posts, 'testSub', '2024-01-01')).toThrow();
  });

  it('has exactly one summit and one start', () => {
    const posts = makePosts(20);
    const city = buildCity(posts, 'testSub', '2024-01-01');
    const summits = city.buildings.filter((b) => b.tags.includes('summit'));
    const starts = city.buildings.filter((b) => b.tags.includes('start'));
    expect(summits).toHaveLength(1);
    expect(starts).toHaveLength(1);
  });

  it('start is not summit', () => {
    const posts = makePosts(20);
    const city = buildCity(posts, 'testSub', '2024-01-01');
    expect(city.startIndex).not.toBe(city.summitIndex);
  });

  it('no footprint overlaps', () => {
    const posts = makePosts(20);
    const city = buildCity(posts, 'testSub', '2024-01-01');
    const { buildings } = city;
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const gap = footprintGap(
          buildings[i].x, buildings[i].z, buildings[i].size,
          buildings[j].x, buildings[j].z, buildings[j].size
        );
        expect(gap).toBeGreaterThanOrEqual(1.49); // allow tiny float tolerance
      }
    }
  });

  it('difficulty label always matches the real par', () => {
    for (const day of ['2024-01-01', '2024-01-03', '2024-01-06']) { // Mon, Wed, Sat
      const city = buildCity(makePosts(20), 'testSub', day);
      if (city.difficulty === 'Hard') expect(city.par).toBeGreaterThanOrEqual(8);
      if (city.difficulty === 'Medium') expect(city.par).toBeGreaterThanOrEqual(7);
      if (city.difficulty === 'Easy') expect(city.par).toBeLessThanOrEqual(7);
      expect(city.maxMoves).toBe(city.par + 4);
    }
  }, 60_000);

  it('follows the weekly schedule: Mon Easy, Wed Medium, Sat Hard', () => {
    expect(dayPlan('2024-01-01').difficulty).toBe('Easy');
    expect(dayPlan('2024-01-03').difficulty).toBe('Medium');
    expect(dayPlan('2024-01-06').difficulty).toBe('Hard');
    expect(dayPlan('2024-01-06').tools).toEqual({ glide: 2, grapple: 1 });
  });

  it('the solver route wins via simulateRun', () => {
    const city = buildCity(makePosts(20), 'testSub', '2024-01-03');
    const route = solveRoute(city);
    expect(route?.par).toBe(city.par);
    expect(simulateRun(city, route!.moves).won).toBe(true);
  }, 60_000);

  it('Medium/Hard cities cannot be beaten by just jumping toward the beacon', () => {
    let hardDays = 0;
    let beaten = 0;
    for (let d = 0; d < 14; d++) {
      const day = new Date(Date.UTC(2024, 0, 1 + d)).toISOString().slice(0, 10);
      const city = buildCity(generateFixturePosts(24), 'sub', day);
      if (city.difficulty === 'Easy') continue;
      hardDays++;
      const g = greedyRun(city);
      if (g === null || g > city.par + 1) beaten++;
    }
    expect(hardDays).toBeGreaterThan(0);
    expect(beaten / hardDays).toBeGreaterThanOrEqual(0.7);
  }, 120_000);

  it('a new layout every day, even when the same posts stay on top', () => {
    const posts = generateFixturePosts(24);
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2024, 1, 1 + d)).toISOString().slice(0, 10);
      const c = buildCity(posts, 'sub', day);
      seen.add(`${c.startIndex}|${c.buildings.map((b) => `${b.x.toFixed(2)},${b.z.toFixed(2)}`).join(';')}`);
    }
    expect(seen.size).toBe(30);
  }, 240_000);

  it('a Hard day generates within 8 s', () => {
    const t0 = performance.now();
    buildCity(generateFixturePosts(24), 'bench', '2024-01-06');
    expect(performance.now() - t0).toBeLessThan(8000);
  }, 20_000);
});

describe('buildCity - varied post sets', () => {
  it('all produce valid, solvable cities', () => {
    for (let i = 0; i < 10; i++) {
      const posts = Array.from({ length: 20 }, (_, j) => ({
        id: `t3_${i}_${j}`,
        title: `Post ${j} set ${i}`,
        score: Math.floor(Math.pow(j + 1, 2) * (i + 1) * 7),
        numComments: Math.floor((j * 3 + i) * 11),
        permalink: `/r/t/c/${i}/${j}`,
      }));
      const city = buildCity(posts, `sub${i}`, `2024-01-${String(i + 1).padStart(2, '0')}`);
      expect(city.buildings.filter((b) => b.tags.includes('summit'))).toHaveLength(1);
      expect(city.buildings.filter((b) => b.tags.includes('start'))).toHaveLength(1);
      expect(city.startIndex).not.toBe(city.summitIndex);
      expect(city.buildings.filter((b) => b.tags.includes('cracked')).length).toBeLessThanOrEqual(4);
      expect(simulateRun(city, solveRoute(city)!.moves).won).toBe(true);
    }
  }, 240_000);
});