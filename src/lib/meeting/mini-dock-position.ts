/**
 * Where the floating meeting window sits, and how it is kept reachable.
 *
 * It used to be pinned to the bottom-right corner, which is the one place it is guaranteed to
 * cover something: the chat launcher, the toast stack, and whatever the page puts in that
 * corner. Making it draggable is only useful if it cannot be dragged somewhere it can never be
 * grabbed again — off the edge, or behind a viewport that later shrinks — so every position
 * goes through `clampToViewport`, including the ones restored after a resize.
 */

export type DockPosition = { x: number; y: number };

export type Bounds = {
  viewportWidth: number;
  viewportHeight: number;
  dockWidth: number;
  dockHeight: number;
};

/** Kept visible on every edge, so the drag handle is always reachable. */
const EDGE_MARGIN = 8;

export type DockSize = { width: number; height: number };

/**
 * The floor is set by the chrome, not by taste.
 *
 * The control tray is four 32px buttons, a separator and 4px of padding — about 150px — and
 * the window has to hold that plus a margin either side. Below this width the tray would have
 * to shrink or shed buttons, and a control that disappears when you resize is worse than a
 * window that refuses to get smaller.
 *
 * The height floor is not taste either: GRID_TILE_SIZING in the stage gives every tile a
 * `min-h-[180px]` floor, so a window shorter than that overflows its own picture and clips it.
 * 200 leaves that floor intact with the tray's 52px sitting over it.
 */
export const MIN_DOCK_SIZE: DockSize = { width: 190, height: 200 };

/** Two thirds of the viewport. Past that it is not a mini window any more; expand instead. */
function maxSize(bounds: Pick<Bounds, "viewportWidth" | "viewportHeight">): DockSize {
  return {
    width: Math.max(MIN_DOCK_SIZE.width, Math.round(bounds.viewportWidth * 0.66)),
    height: Math.max(MIN_DOCK_SIZE.height, Math.round(bounds.viewportHeight * 0.66)),
  };
}

/**
 * A size the window can actually be given.
 *
 * Clamped against the viewport as well as the floor, because a window resized on a large
 * screen and then carried to a small one would otherwise be unreachable in exactly the way
 * `clampToViewport` exists to prevent.
 */
export function clampDockSize(
  size: DockSize,
  bounds: Pick<Bounds, "viewportWidth" | "viewportHeight">,
): DockSize {
  const max = maxSize(bounds);
  return {
    width: Math.round(
      Math.min(Math.max(size.width, MIN_DOCK_SIZE.width), max.width),
    ),
    height: Math.round(
      Math.min(Math.max(size.height, MIN_DOCK_SIZE.height), max.height),
    ),
  };
}

export function clampToViewport(position: DockPosition, bounds: Bounds): DockPosition {
  const maxX = bounds.viewportWidth - bounds.dockWidth - EDGE_MARGIN;
  const maxY = bounds.viewportHeight - bounds.dockHeight - EDGE_MARGIN;

  // A viewport narrower than the dock makes maxX negative; the margin then loses to the edge,
  // and pinning to EDGE_MARGIN is the only choice that keeps the top-left corner on screen.
  return {
    x: Math.round(Math.min(Math.max(position.x, EDGE_MARGIN), Math.max(maxX, EDGE_MARGIN))),
    y: Math.round(Math.min(Math.max(position.y, EDGE_MARGIN), Math.max(maxY, EDGE_MARGIN))),
  };
}

/**
 * The corner it opens in when nobody has dragged it yet.
 *
 * Above the bottom edge rather than flush to it, because the app's own chat launcher lives
 * down there and a window that opens on top of a button is a window nobody asked for.
 */
export function defaultPosition(bounds: Bounds, bottomInset = 72): DockPosition {
  return clampToViewport(
    {
      x: bounds.viewportWidth - bounds.dockWidth - 20,
      y: bounds.viewportHeight - bounds.dockHeight - bottomInset,
    },
    bounds,
  );
}

/**
 * How much room the bottom chrome needs, so the stage can keep a participant's name out from
 * under it.
 *
 * The tray is centred and nearly as wide as the window, so a name pinned to the bottom-left
 * does not sit beside it — it sits behind it. This is the number that moves the name up.
 */
export function bottomChromeInset(size: DockSize): number {
  // tray height (40) + its inset from the bottom (12) + a little air.
  return size.height >= MIN_DOCK_SIZE.height ? 58 : 0;
}
