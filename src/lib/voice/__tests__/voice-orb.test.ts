/**
 * The orb formula: one seed in, a palette and a shape out.
 *
 * What these pin is the part a GPU is not needed for — that the formula is deterministic, that it
 * actually generates (rather than picking from a short list), and that every palette it can emit
 * stays inside the look that was approved: muted colour on a dark-to-light ladder, lit from below.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { orbFallbackBackground, orbParamsFromSeed, voiceOrbParams } from "../voice-orb.ts";

const HEX = /^#[0-9a-f]{6}$/;

function channels(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
}

/** WCAG relative luminance — enough to order tones by brightness. */
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const seeds = Array.from({ length: 500 }, (_, index) => index * 2654435761);

test("a voice gets the same orb every time", () => {
  // The whole point: a voice has to be recognisable again next week, on another screen.
  assert.deepEqual(voiceOrbParams("voice-abc"), voiceOrbParams("voice-abc"));
  assert.equal(orbFallbackBackground("voice-abc"), orbFallbackBackground("voice-abc"));
});

test("the palette is generated, not chosen from a short list", () => {
  // Five hundred seeds through a fixed list of sixteen palettes would give sixteen distinct mids.
  const mids = new Set(seeds.map((seed) => orbParamsFromSeed(seed).palette.mid));
  assert.ok(mids.size > 400, `only ${mids.size} distinct palettes across ${seeds.length} seeds`);
});

test("different voices get different forms as well as colours", () => {
  const ids = Array.from({ length: 60 }, (_, index) => `voice-${index}`);
  const forms = new Set(ids.map((id) => voiceOrbParams(id).offset.join(",")));
  assert.equal(forms.size, ids.length);
});

test("every palette emits valid colours", () => {
  for (const seed of seeds) {
    for (const color of Object.values(orbParamsFromSeed(seed).palette)) {
      assert.match(color, HEX, `seed ${seed} produced ${color}`);
    }
  }
});

test("every palette keeps the dark-to-light ladder", () => {
  // The shader shades from dark through mid to light; a palette whose "light" is darker than its
  // "mid" renders as a sphere lit from inside.
  for (const seed of seeds) {
    const { dark, mid, light } = orbParamsFromSeed(seed).palette;
    assert.ok(luminance(dark) < luminance(mid), `seed ${seed}: dark ${dark} not below mid ${mid}`);
    assert.ok(luminance(mid) < luminance(light), `seed ${seed}: mid ${mid} not below light ${light}`);
  }
});

/** OKLCH chroma of an sRGB hex — how colourful a tone is, independent of its brightness. */
function chroma(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
}

test("every tone stays muted", () => {
  // Muted is the approved look; the conic orbs this replaced were rejected for saturated colour.
  // The formula caps chroma at 0.13 — below a crimson like #b8374d (0.16).
  for (const seed of seeds) {
    for (const color of Object.values(orbParamsFromSeed(seed).palette)) {
      assert.ok(chroma(color) <= 0.135, `seed ${seed}: ${color} has chroma ${chroma(color).toFixed(3)}`);
    }
  }
});

test("no tone is clipped into neon", () => {
  // Chroma alone misses this one: #009888 is only 0.11, but its red channel is pinned at zero,
  // which is what reads as neon. Out-of-gamut tones must lose chroma, not have channels clipped.
  // The light tone is left out: a pale highlight like #ffdee0 legitimately touches 255.
  for (const seed of seeds) {
    const { mid, accent } = orbParamsFromSeed(seed).palette;
    for (const color of [mid, accent]) {
      const values = channels(color);
      assert.ok(Math.min(...values) > 0 && Math.max(...values) < 1, `seed ${seed}: ${color} is clipped`);
    }
  }
});

test("the light always comes from below", () => {
  for (const seed of seeds) {
    const [x, y] = orbParamsFromSeed(seed).light;
    assert.ok(y < 0, `seed ${seed}: light points up (${y})`);
    assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9, `seed ${seed}: light is not a unit vector`);
  }
});

test("an empty id still gets an orb rather than throwing", () => {
  assert.match(orbFallbackBackground(""), /radial-gradient/);
  assert.deepEqual(voiceOrbParams(""), voiceOrbParams("voice"));
});
