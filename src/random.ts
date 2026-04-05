export type RandomSource = () => number;

function normalizeSeed(seed: string | number): number {
  if (typeof seed === "number") {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createMulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed?: string | number): RandomSource {
  const fallback = Math.floor(Math.random() * 0xffffffff);
  return createMulberry32(normalizeSeed(seed ?? fallback));
}
