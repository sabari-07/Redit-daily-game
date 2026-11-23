/** FNV-1a 32-bit hash of a string -> unsigned 32-bit integer */
export function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // imul avoids overflow issues with JS numbers
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG — fast, good quality, seedable */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    return z;
  };
}

/** Returns a seeded RNG for a given string seed */
export function makeRng(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}

/** Seeded random integer in [min, max] inclusive */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Seeded shuffle (Fisher-Yates in-place) */
export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
