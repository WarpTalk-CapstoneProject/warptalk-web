/**
 * How a live WebGL canvas announces itself to the rest of the app.
 *
 * The View Transition API snapshots the page to cross-fade it. A WebGL canvas is not in that
 * snapshot, so any animated theme sweep tears across it. The theme toggle therefore needs to
 * know whether one is on screen — but it must not be the toggle's job to know WHERE such a
 * canvas lives. It briefly matched `pathname.endsWith("/home")`, which breaks the moment a
 * second WebGL surface exists anywhere else, and keeps breaking after the first one is removed.
 *
 * So the surface declares itself and the toggle asks the document. Mark the element that owns
 * the canvas with {...webglSurfaceProps()} and nothing else needs updating.
 */
export const WEBGL_SURFACE_ATTRIBUTE = "data-webgl-surface";

/** Spread onto the element that owns a live WebGL canvas. */
export function webglSurfaceProps() {
  return { [WEBGL_SURFACE_ATTRIBUTE]: "" } as const;
}
