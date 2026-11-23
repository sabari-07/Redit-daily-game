import { describe, it, expect } from 'vitest';
import { fnv1a, mulberry32, makeRng, randInt, shuffle } from './rng.js';

describe('fnv1a', () => {
  it('is deterministic', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });

  it('differs for different inputs', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });

  it('returns a uint32', () => {
    const h = fnv1a('test');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('mulberry32', () => {
  it('produces values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });
});

describe('makeRng', () => {
  it('same string => same sequence', () => {
    const a = makeRng('skyline:2024-01-01');
    const b = makeRng('skyline:2024-01-01');
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });
});

describe('randInt', () => {
  it('stays within [min, max]', () => {
    const rng = makeRng('x');
    for (let i = 0; i < 200; i++) {
      const v = randInt(rng, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('shuffle', () => {
  it('returns same length', () => {
    const rng = makeRng('s');
    expect(shuffle(rng, [1, 2, 3, 4, 5])).toHaveLength(5);
  });

  it('is deterministic', () => {
    const a = shuffle(makeRng('s'), [1, 2, 3, 4, 5]);
    const b = shuffle(makeRng('s'), [1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });

  it('contains all original elements', () => {
    const arr = [10, 20, 30, 40];
    const result = shuffle(makeRng('s'), arr);
    expect(result.sort()).toEqual([...arr].sort());
  });
});
