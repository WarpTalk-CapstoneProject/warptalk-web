/**
 * A stable, recognisable colour for a voice that has no picture.
 *
 * Four hundred catalogue voices listed as four hundred identical grey dots is a list nobody can
 * scan: "the warm one I tried yesterday" has nothing to be recognised by. An orb gives every voice
 * a face that is the SAME every time — derived from its id, never random — so it can be found
 * again by colour alone.
 *
 * Pure and deterministic so it can be tested without rendering, and so the same voice looks the
 * same on this page, in a meeting, and on another person's screen.
 */

/** FNV-1a. Not cryptographic and does not need to be: it only has to spread ids evenly. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type OrbPalette = {
  /** Three hues in degrees, 0–359. */
  hues: [number, number, number];
  /** Where the conic sweep starts, so two voices of the same hue still differ in form. */
  rotation: number;
};

export function orbPalette(voiceId: string): OrbPalette {
  const h = hash(voiceId || "voice");
  const base = h % 360;
  // Offsets kept inside ~150° so the three read as one family rather than a rainbow — a sphere
  // with three unrelated colours stops looking like a sphere.
  const spread = 40 + ((h >>> 9) % 70);
  return {
    hues: [base, (base + spread) % 360, (base + spread * 2) % 360],
    rotation: (h >>> 17) % 360,
  };
}

/**
 * The CSS background for an orb.
 *
 * Layered bottom to top: a conic sweep for the body, a soft glow in the lower right for depth,
 * and a highlight in the upper left so it reads as lit from one side. Saturation and lightness sit
 * in the middle of the range on purpose, so the same orb works on a light page and a dark one.
 */
export function orbBackground(voiceId: string): string {
  const { hues, rotation } = orbPalette(voiceId);
  const [a, b, c] = hues;
  return [
    "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.7), rgba(255,255,255,0) 42%)",
    `radial-gradient(circle at 72% 78%, hsla(${c},80%,55%,0.85), hsla(${c},80%,55%,0) 58%)`,
    `conic-gradient(from ${rotation}deg, hsl(${a},72%,60%), hsl(${b},70%,56%), hsl(${c},74%,62%), hsl(${a},72%,60%))`,
  ].join(", ");
}
