/**
 * Random helpers. Uses Math.random by default; pass a numeric seed to get a
 * deterministic sequence (useful for tests and reproducible bug reports).
 * Passwords always use the Web Crypto API.
 */

/** Small, fast seeded PRNG (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} [seed]
 * @returns {import('../locales/index.js').RandomHelper & {next:() => number, sample:<T>(items:T[], n:number) => T[]}}
 */
export function createRandom(seed) {
  const next = Number.isFinite(seed) ? mulberry32(seed) : Math.random;
  const int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  const pick = (items) => items[int(0, items.length - 1)];
  return {
    next,
    int,
    pick,
    bool: (probability = 0.5) => next() < probability,
    digits: (count) => Array.from({ length: count }, () => int(0, 9)).join(''),
    /** n distinct items (order randomised). */
    sample(items, n) {
      const pool = [...items];
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, Math.min(n, pool.length));
    },
  };
}

const PASSWORD_SETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I/O to avoid ambiguity
  'abcdefghijkmnpqrstuvwxyz', // no l/o
  '23456789',
  '!@#$%&*?-_',
];

function secureIndex(max) {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

/**
 * Strong password guaranteed to contain upper, lower, digit and symbol — this
 * satisfies the vast majority of "password policy" validators.
 * @param {number} length
 */
export function securePassword(length = 14) {
  const size = Math.max(length, PASSWORD_SETS.length);
  const all = PASSWORD_SETS.join('');
  const chars = PASSWORD_SETS.map((set) => set[secureIndex(set.length)]);
  while (chars.length < size) chars.push(all[secureIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
