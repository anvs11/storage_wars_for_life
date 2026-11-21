const wordCount = 2 ** 32;

export function draw(seed: number): { seed: number; word: number; value: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(next ^ (next >>> 15), next | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const word = (mixed ^ (mixed >>> 14)) >>> 0;
  return { seed: next, word, value: word / wordCount };
}

export function seededRandom(seed: number): () => number {
  return () => {
    const next = draw(seed);
    seed = next.seed;
    return next.value;
  };
}

export function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
