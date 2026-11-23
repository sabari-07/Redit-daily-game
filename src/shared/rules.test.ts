import { describe, it, expect } from 'vitest';
import {
  canJump, applyMove, simulateRun, initialRunState, reachableFrom, reachableAny,
  WALK_GAP, WALK_RISE, GLIDE_GAP, GRAPPLE_GAP,
} from './rules.js';
import { buildCity } from './city.js';
import { solveRoute } from './solver.js';
import type { Building, City, RawPost } from './types.js';

function makePosts(n: number): RawPost[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t3_${i + 1}`,
    title: `Post ${i + 1}`,
    score: (n - i) * 100,
    numComments: i * 5,
    permalink: `/r/test/c/${i}`,
  }));
}

/** size-3 roofs have half-size 1, so centre distance d gives gap d - 2. */
function bld(index: number, x: number, z: number, height: number, tags: Building['tags'] = []): Building {
  return {
    index, postId: `t3_${index}`, title: `B${index}`, score: 100, numComments: 5,
    permalink: '/r/t/c/1', x, z, size: 3, height, tags,
  };
}

const none = new Set<number>();

describe('canJump: explicit tools only', () => {
  const a = bld(0, 0, 0, 5);
  const near = bld(1, 2 + WALK_GAP, 0, 5 + WALK_RISE); // gap exactly WALK_GAP, rise exactly WALK_RISE
  const steep = bld(2, 0, 2 + WALK_GAP, 5 + WALK_RISE + 1); // walkable distance, one floor too steep
  const lowFar = bld(3, -(2 + GLIDE_GAP), 0, 3); // glide distance, downhill
  const upFar = bld(4, 0, -(2 + GRAPPLE_GAP), 11); // grapple distance, way up
  const tooFar = bld(5, 40, 40, 5);
  const bs = [a, near, steep, lowFar, upFar, tooFar];

  it('walk works at exactly the walk gap and rise', () => {
    expect(canJump(bs, 0, 1, 2, 2, none, 'walk')).toMatchObject({ valid: true, tool: 'walk' });
  });

  it('walk refuses one floor too steep, names the numbers, suggests Grapple', () => {
    const r = canJump(bs, 0, 2, 2, 2, none, 'walk');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Too steep to walk: 3 floors higher/);
    expect(r.suggest).toBe('grapple');
  });

  it('never spends a tool by itself: walking to a glide-only roof is refused', () => {
    const r = canJump(bs, 0, 3, 2, 2, none, 'walk');
    expect(r.valid).toBe(false);
    expect(r.suggest).toBe('glide');
    expect(r.reason).toMatch(/Pick Glide/);
  });

  it('glide reaches long, level-or-down jumps but cannot climb', () => {
    expect(canJump(bs, 0, 3, 1, 0, none, 'glide').valid).toBe(true);
    const up = canJump(bs, 0, 4, 1, 1, none, 'glide');
    expect(up.valid).toBe(false);
    expect(up.reason).toMatch(/cannot go up/);
  });

  it('grapple climbs any height within its range', () => {
    expect(canJump(bs, 0, 4, 0, 1, none, 'grapple').valid).toBe(true);
  });

  it('out of range of every tool says so', () => {
    const r = canJump(bs, 0, 5, 2, 2, none, 'walk');
    expect(r.suggest).toBeUndefined();
    expect(r.reason).toMatch(/Out of range of every tool/);
  });

  it('empty charges are reported', () => {
    expect(canJump(bs, 0, 3, 0, 2, none, 'glide').reason).toMatch(/No Glides left/);
    expect(canJump(bs, 0, 4, 2, 0, none, 'grapple').reason).toMatch(/No Grapples left/);
  });

  it('rejects current roof, collapsed roof and bad index', () => {
    expect(canJump(bs, 0, 0, 2, 2, none, 'walk').reason).toMatch(/Already here/);
    expect(canJump(bs, 0, 1, 2, 2, new Set([1]), 'walk').reason).toMatch(/collapsed/);
    expect(canJump(bs, 0, 99, 2, 2, none, 'walk').valid).toBe(false);
  });

  it('reachableFrom lists only roofs for the chosen tool; reachableAny picks the cheapest', () => {
    expect([...reachableFrom(bs, 0, 2, 2, none, 'walk')]).toEqual([1]);
    expect(reachableFrom(bs, 0, 2, 2, none, 'glide').has(3)).toBe(true);
    const any = reachableAny(bs, 0, 2, 2, none);
    expect(any.get(1)).toBe('walk');
    expect(any.get(3)).toBe('glide');
    expect(any.get(4)).toBe('grapple');
    expect(any.has(5)).toBe(false);
  });
});

describe('applyMove', () => {
  const city = (bs: Building[]): City => ({
    version: 2, subreddit: 't', dayKey: '2024-01-01', seed: 's', buildings: bs,
    startIndex: 0, summitIndex: bs.length - 1, par: 1, maxMoves: 5, difficulty: 'Easy',
    tools: { glide: 1, grapple: 1 },
  });

  it('spends exactly the chosen tool', () => {
    const bs = [bld(0, 0, 0, 5), bld(1, 0, 2 + GRAPPLE_GAP, 10)];
    const next = applyMove(initialRunState(city(bs)), { to: 1, tool: 'grapple' }, bs);
    expect(next).toMatchObject({ glideLeft: 1, grappleLeft: 0, pos: 1, moveCount: 1 });
  });

  it('collapses a cracked roof after you leave it', () => {
    const bs = [bld(0, 0, 0, 5, ['cracked']), bld(1, 4, 0, 5)];
    const next = applyMove(initialRunState(city(bs)), { to: 1, tool: 'walk' }, bs);
    expect(next?.collapsed.has(0)).toBe(true);
  });

  it('records gold', () => {
    const bs = [bld(0, 0, 0, 5), bld(1, 4, 0, 5, ['gold'])];
    expect(applyMove(initialRunState(city(bs)), { to: 1, tool: 'walk' }, bs)?.goldCollected.has(1)).toBe(true);
  });

  it('returns null for an invalid move', () => {
    const bs = [bld(0, 0, 0, 5), bld(1, 30, 0, 5)];
    expect(applyMove(initialRunState(city(bs)), { to: 1, tool: 'walk' }, bs)).toBeNull();
  });
});

describe('simulateRun', () => {
  const real = buildCity(makePosts(20), 'testsub', '2024-01-01');

  it('the solver route wins and is scored with the given clock', () => {
    const route = solveRoute(real)!;
    const fast = simulateRun(real, route.moves, 20_000);
    const slow = simulateRun(real, route.moves, 200_000);
    expect(fast.won).toBe(true);
    expect(fast.moves).toBe(real.par);
    expect(fast.points - slow.points).toBe(4 * 180); // 4 points per second
  });

  it('rejects moves after the Summit, out of range and too many', () => {
    const route = solveRoute(real)!;
    expect(simulateRun(real, [...route.moves, route.moves[0]]).error).toMatch(/after reaching the Summit/);
    expect(simulateRun(real, [{ to: -1, tool: 'walk' }]).error).toMatch(/out of range/);
    const many = Array.from({ length: 26 }, () => ({ to: 0, tool: 'walk' as const }));
    expect(simulateRun(real, many).error).toMatch(/Too many/);
  });
});
