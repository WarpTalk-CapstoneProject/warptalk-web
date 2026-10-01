"use client";

/**
 * A switch the popup flips by asking the main window, and reads back from its snapshot. WT-901.
 *
 * When the dock's Stop or Pause goes over the relay, nothing comes back but the next snapshot: the
 * main window runs its own handler (its host check, its request, its toasts) and the field flips
 * when the meeting has actually changed. So the button waits on the FIELD, not on a promise:
 *
 *   - `waiting` is true from the press until the field reads the value asked for;
 *   - `onConfirmed` runs once when it does — the popup's own "Translation stopped" toast, because
 *     the main window's toast is drawn in a window parked behind Google Meet;
 *   - after RELAYED_SWITCH_TIMEOUT_MS without that, `onTimeout` runs and the button is released.
 *     The main window refused (not the host after all, a 409, a failed request) and said so where
 *     the user cannot see it; the popup says that much rather than spin forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a relayed switch may take. The main window's handler is one REST call; ten seconds is
 * the slow end of that plus the snapshot back, and the length of the poll the relay replaced.
 */
export const RELAYED_SWITCH_TIMEOUT_MS = 10_000;

type Pending = { id: number; target: boolean };

export function useRelayedSwitch(
  current: boolean,
  {
    onConfirmed,
    onTimeout,
  }: { onConfirmed?: (value: boolean) => void; onTimeout?: (target: boolean) => void },
) {
  const [pending, setPending] = useState<Pending | null>(null);
  const currentRef = useRef(current);
  const callbacksRef = useRef({ onConfirmed, onTimeout });
  const confirmedRef = useRef<number | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    currentRef.current = current;
    callbacksRef.current = { onConfirmed, onTimeout };
  });

  // Confirmation is DERIVED, so nothing has to be reset when it lands; the effect only says so once.
  const waiting = pending !== null && current !== pending.target;
  useEffect(() => {
    if (!pending || current !== pending.target || confirmedRef.current === pending.id) return;
    confirmedRef.current = pending.id;
    callbacksRef.current.onConfirmed?.(pending.target);
  }, [current, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      if (currentRef.current !== pending.target) callbacksRef.current.onTimeout?.(pending.target);
      setPending((now) => (now?.id === pending.id ? null : now));
    }, RELAYED_SWITCH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  /** Start waiting for the field to read `target`. Call after the intent was sent. */
  const expect = useCallback((target: boolean) => {
    idRef.current += 1;
    setPending({ id: idRef.current, target });
  }, []);

  return { waiting, expect };
}
