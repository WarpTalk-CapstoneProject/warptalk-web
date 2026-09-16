/**
 * A stable, recognisable face for a voice that has no picture.
 *
 * Four hundred catalogue voices listed as four hundred identical grey dots is a list nobody can
 * scan: "the warm one I tried yesterday" has nothing to be recognised by. An orb gives every voice
 * a face that is the SAME every time — derived from its id, never random per render — so it can be
 * found again by colour and form alone.
 *
 * ONE FORMULA, NO STORED PICTURES. The look follows ElevenLabs' voice library — a soft sphere of
 * a few muted tones smeared into one another, shaded toward the rim, under film grain — but theirs
 * are images drawn once per voice and stored. Here every orb comes out of `orbParamsFromSeed`: a
 * seed goes in, a palette and a shape come out, and the renderer (./voice-orb-renderer) draws
 * them. Nothing is kept per voice; any seed is a new, valid orb.
 *
 * Everything in this file is pure and deterministic, so it can be tested without a GPU.
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

/** A tiny seeded generator, so one hash yields as many independent draws as the formula needs. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * OKLCH → sRGB hex.
 *
 * OKLCH rather than HSL because its lightness is perceptual: "L 0.45" is equally bright whatever
 * the hue, so a formula can hold every orb to the same dark-to-light ladder. In HSL the same
 * numbers give a glowing yellow and a murky blue.
 *
 * Out-of-gamut colours lose chroma until they fit, rather than having channels clipped. Clipping
 * is what turns a muted teal into #009888 — a channel pinned at zero reads as neon.
 */
function oklchToLinearSrgb(lightness: number, chroma: number, hue: number): number[] {
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  let linear = oklchToLinearSrgb(lightness, chroma, hue);
  for (let fitted = chroma; linear.some((c) => c < 0 || c > 1) && fitted > 0.001; ) {
    fitted *= 0.9;
    linear = oklchToLinearSrgb(lightness, fitted, hue);
  }
  return `#${linear
    .map((channel) => {
      const encoded =
        channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(channel, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export type OrbPalette = {
  /** The shadowed body. */
  dark: string;
  /** The main tone. */
  mid: string;
  /** Highlights and the lit rim. */
  light: string;
  /** A second tone that takes over part of the sphere, so one orb is never a single flat hue. */
  accent: string;
};

/**
 * The colour half of the formula.
 *
 * Every palette is one hue family on a fixed lightness ladder, low in chroma — muted and earthy is
 * what makes these read as objects rather than as the neon rainbow the conic version was rejected
 * for. The accent sits either near the base hue or well away from it (navy with crimson, plum with
 * coral), which is where most of the variety between orbs comes from.
 */
function paletteFrom(random: () => number): OrbPalette {
  let hue = random() * 360;
  // Low-lightness yellow-green is the one family that reads as mud rather than as a colour. It is
  // folded back into amber and copper, which also tilts the set warm — the reference library is
  // mostly earth tones, and an even hue wheel came out as a wall of teal and indigo.
  if (hue >= 80 && hue < 135) hue -= 55;
  // One orb in eight is near-grey, like a graphite or taupe voice.
  const chroma = random() < 0.12 ? 0.012 : 0.03 + random() * 0.08;
  const near = random() < 0.6;
  const offset = (near ? 20 + random() * 30 : 80 + random() * 80) * (random() < 0.5 ? -1 : 1);

  return {
    dark: oklchToHex(0.17 + random() * 0.09, chroma * 0.8, hue),
    mid: oklchToHex(0.38 + random() * 0.17, chroma, hue),
    light: oklchToHex(0.84 + random() * 0.09, chroma * 0.45, hue + offset * 0.3),
    accent: oklchToHex(0.5 + random() * 0.18, Math.min(0.13, chroma * 1.2 + 0.025), hue + offset),
  };
}

export type VoiceOrbParams = {
  palette: OrbPalette;
  /** Where on the noise field this orb's sphere sits. */
  offset: [number, number, number];
  /** Euler angles (radians) turning the sphere, so two similar palettes still differ in form. */
  rotation: [number, number, number];
  /** Size of the colour regions: lower is fewer, larger blobs. */
  scale: number;
  /** How far the regions are smeared into each other. */
  warp: number;
  /** Shifts the balance between the dark and light tones, so some orbs are pale and some deep. */
  bias: number;
  /** Unit vector in screen space (y up) pointing at the light, which always comes from below. */
  light: [number, number];
};

/** The whole formula: a seed in, everything the renderer needs out. */
export function orbParamsFromSeed(seed: number): VoiceOrbParams {
  const random = splitmix32(seed);
  const turn = () => random() * Math.PI * 2;
  const palette = paletteFrom(random);
  // -π/2 is straight down; ±0.8 rad keeps the lit rim in the lower half, where the reference
  // orbs catch their light.
  const lightAngle = -Math.PI / 2 + (random() - 0.5) * 1.6;

  return {
    palette,
    offset: [random() * 100, random() * 100, random() * 100],
    rotation: [turn(), turn(), turn()],
    scale: 0.55 + random() * 0.35,
    warp: 0.9 + random() * 0.8,
    bias: -0.04 + random() * 0.26,
    light: [Math.cos(lightAngle), Math.sin(lightAngle)],
  };
}

/** A voice's orb: the formula, seeded by its id so the voice keeps the same face everywhere. */
export function voiceOrbParams(voiceId: string): VoiceOrbParams {
  return orbParamsFromSeed(hash(voiceId || "voice"));
}

/**
 * What an orb shows before its picture is drawn, and for good where WebGL is unavailable.
 *
 * Same palette as the drawn orb, so the swap from placeholder to picture reads as the orb coming
 * into focus rather than as a different voice.
 */
export function orbFallbackBackground(voiceId: string): string {
  const { palette, light } = voiceOrbParams(voiceId);
  // The light vector is y-up; CSS percentages grow downward.
  const glowX = Math.round(50 + light[0] * 30);
  const glowY = Math.round(50 - light[1] * 30);
  return [
    `radial-gradient(circle at ${glowX}% ${glowY}%, ${palette.light}b3, transparent 55%)`,
    `radial-gradient(circle at 30% 30%, ${palette.accent}cc, transparent 60%)`,
    `radial-gradient(circle at 50% 50%, ${palette.mid}, ${palette.dark})`,
  ].join(", ");
}
