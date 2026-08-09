"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type DockPosition,
  clampToViewport,
  defaultPosition,
} from "@/lib/meeting/mini-dock-position";

const DOCK_WIDTH = 232;
const DOCK_HEIGHT = 388;

/**
 * The floating meeting window, which the person on the call can move.
 *
 * It was pinned to the bottom-right corner — the one place guaranteed to cover something,
 * since the chat launcher and the toast stack both live there. It is also portrait now: a
 * 360x220 landscape frame spent most of its width on the room behind whoever was talking,
 * where a single face fits a tall frame.
 *
 * Dragging starts only from `[data-mini-drag-handle]`, so the mute and camera buttons inside
 * the window stay clickable rather than becoming drag surfaces. Every position — including
 * the one restored after the window is resized — goes through `clampToViewport`, because a
 * window dragged off the edge is a window that can never be grabbed again.
 */
export function MiniMeetingDock({
  floating,
  children,
}: {
  /** False while the live room route owns the screen: the session fills its container instead. */
  floating: boolean;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState<DockPosition | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const bounds = useCallback(
    () => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dockWidth: DOCK_WIDTH,
      dockHeight: DOCK_HEIGHT,
    }),
    [],
  );

  // Placed on the first render that has a viewport to measure, not in an effect: an effect
  // runs after paint, so the window would appear in the top-left corner for a frame and then
  // jump. The dock is only mounted once a meeting is active, which is client state, so this
  // branch never differs between the server render and the first client one.
  const [measured, setMeasured] = useState(false);
  if (!measured && typeof window !== "undefined") {
    setMeasured(true);
    setPosition(defaultPosition(bounds()));
  }

  useEffect(() => {
    function handleResize() {
      setPosition((current) => (current ? clampToViewport(current, bounds()) : current));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [bounds]);

  useEffect(() => {
    if (!isDragging) return;

    function handleMove(event: PointerEvent) {
      const offset = dragOffset.current;
      if (!offset) return;
      setPosition(
        clampToViewport({ x: event.clientX - offset.x, y: event.clientY - offset.y }, bounds()),
      );
    }

    function handleUp() {
      dragOffset.current = null;
      setIsDragging(false);
    }

    // On window, not on the element: a fast drag outruns the pointer and would otherwise drop
    // the window the moment the cursor left it.
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDragging, bounds]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!position) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-mini-drag-handle]")) return;
    // Controls are not drag surfaces. This exclusion is what let the drag handle grow from a
    // strip across the top to the whole window: the strip could never be hidden, because
    // hiding it left nothing to grab, which is why the window wore a permanent black bar.
    if (target.closest("button, a, input, textarea, select, [role='button']")) return;
    // Only the primary button, and never a right-click that is on its way to a context menu.
    if (event.button !== 0) return;

    dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    setIsDragging(true);
    event.preventDefault();
  }

  // One <div> in one position, whatever the mode. Rendering the floating window and the
  // full-screen stage as two branches of a ternary looks equivalent and is not: React would
  // unmount the session on every navigation into or out of the room, tearing down the LiveKit
  // connection that this whole component tree exists to keep alive across routes.
  return (
    <div
      onPointerDown={floating ? handlePointerDown : undefined}
      style={
        floating
          ? {
              width: DOCK_WIDTH,
              height: DOCK_HEIGHT,
              left: position?.x ?? 0,
              top: position?.y ?? 0,
              // Hidden until measured, so it never paints in the wrong corner for one frame.
              visibility: position ? "visible" : "hidden",
              cursor: isDragging ? "grabbing" : undefined,
            }
          : undefined
      }
      className={
        floating
          ? "fixed z-[70] overflow-hidden rounded-[20px] border border-white/70 bg-surface-1 shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-black/5"
          : "absolute inset-0 z-30"
      }
    >
      {children}
    </div>
  );
}
