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
