import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  clampSidePanelWidth,
  readStoredSidePanelWidth,
} from "../side-panel-width.ts";

/**
 * Dragging the transcript panel wider.
 *
 * "cửa sổ transcript này cho điều chỉnh kéo to ra ko ... để nhỏ quá nhìn khó" — 15 Aug test. The
 * panel is a flex sibling of the video stage, so the interesting part is not the drag, it is what
 * stops the drag from deleting the stage and the control bar with it.
 */

test("a drag inside the bounds is honoured", () => {
  assert.equal(clampSidePanelWidth(460, 1440), 460);
});

test("the stage keeps its floor, however far the user drags", () => {
  // 1280 viewport - 480 stage floor = 800, capped again by the absolute maximum.
  assert.equal(clampSidePanelWidth(5000, 1280), Math.min(MAX_SIDE_PANEL_WIDTH, 800));
});

test("on a narrow viewport the panel minimum wins over the stage floor", () => {
  // Otherwise the clamp would return a negative width and the panel would vanish — worse than a
  // cramped stage, which the user can still fix by dragging back.
  assert.equal(clampSidePanelWidth(400, 600), MIN_SIDE_PANEL_WIDTH);
});

test("dragging it shut stops at the readable minimum", () => {
  assert.equal(clampSidePanelWidth(0, 1440), MIN_SIDE_PANEL_WIDTH);
  assert.equal(clampSidePanelWidth(-200, 1440), MIN_SIDE_PANEL_WIDTH);
});

test("an unknown viewport falls back to the absolute bounds", () => {
  // Server render. Enforcing a stage floor needs a viewport, and guessing one would make the
  // server and the browser disagree about the width.
  assert.equal(clampSidePanelWidth(900, 0), MAX_SIDE_PANEL_WIDTH);
});

test("a nonsense width does not become NaN on the element", () => {
  assert.equal(clampSidePanelWidth(Number.NaN, 1440), MIN_SIDE_PANEL_WIDTH);
});

test("nothing stored means the responsive default still applies", () => {
  // Null, not a number: returning one would pin every viewport to a single width the moment this
  // shipped, overriding the 300px/340px breakpoints that are already there.
  assert.equal(readStoredSidePanelWidth(null), null);
  assert.equal(readStoredSidePanelWidth(""), null);
  assert.equal(readStoredSidePanelWidth("wide"), null);
  assert.equal(readStoredSidePanelWidth("0"), null);
});

test("a stored width is read back", () => {
  assert.equal(readStoredSidePanelWidth("420"), 420);
});
