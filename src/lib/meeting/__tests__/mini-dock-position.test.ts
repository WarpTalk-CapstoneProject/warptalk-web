import assert from "node:assert/strict";
import { test } from "node:test";

import { clampToViewport, defaultPosition } from "../mini-dock-position.ts";

const bounds = {
  viewportWidth: 1440,
  viewportHeight: 900,
  dockWidth: 220,
  dockHeight: 380,
};

/**
 * A draggable window is only an improvement over a pinned one if it cannot be dragged
 * somewhere it can never be grabbed again. These pin that.
 */

test("a position inside the viewport is left alone", () => {
  assert.deepEqual(clampToViewport({ x: 300, y: 200 }, bounds), { x: 300, y: 200 });
});

test("it cannot be dragged off the left or top edge", () => {
  const result = clampToViewport({ x: -500, y: -500 }, bounds);
  assert.ok(result.x >= 0, `x=${result.x}`);
  assert.ok(result.y >= 0, `y=${result.y}`);
});

test("it cannot be dragged past the right or bottom edge", () => {
  const result = clampToViewport({ x: 99999, y: 99999 }, bounds);
  assert.ok(result.x + bounds.dockWidth <= bounds.viewportWidth, "right edge");
  assert.ok(result.y + bounds.dockHeight <= bounds.viewportHeight, "bottom edge");
});

test("a viewport smaller than the dock still leaves the top-left corner on screen", () => {
  // Rotating a phone, or opening devtools, can make this true — and a negative clamp bound
  // would otherwise push the window entirely out of reach.
  const tiny = { viewportWidth: 200, viewportHeight: 200, dockWidth: 220, dockHeight: 380 };
  const result = clampToViewport({ x: 500, y: 500 }, tiny);
  assert.ok(result.x >= 0 && result.x < tiny.viewportWidth, `x=${result.x}`);
  assert.ok(result.y >= 0 && result.y < tiny.viewportHeight, `y=${result.y}`);
});

test("it opens in the bottom-right, clear of the chat launcher", () => {
  const position = defaultPosition(bounds);
  assert.ok(position.x > bounds.viewportWidth / 2, "right half");
  // Measured at the window's centre, not its top edge: a 380px-tall window sitting in the
  // lower half still has its top edge a little above the midpoint.
  assert.ok(
    position.y + bounds.dockHeight / 2 > bounds.viewportHeight / 2,
    "lower half",
  );
  // Not flush to the bottom: the launcher sits there.
  assert.ok(position.y + bounds.dockHeight < bounds.viewportHeight, "clear of the bottom edge");
});

test("the default is itself clamped, so a short viewport cannot open it off-screen", () => {
  const short = { viewportWidth: 1440, viewportHeight: 380, dockWidth: 220, dockHeight: 380 };
  const position = defaultPosition(short);
  assert.ok(position.y >= 0, `y=${position.y}`);
});

test("positions are whole pixels, so the window does not render on a half pixel", () => {
  const result = clampToViewport({ x: 100.4, y: 200.6 }, bounds);
  assert.equal(result.x, Math.round(100.4));
  assert.equal(result.y, Math.round(200.6));
});
