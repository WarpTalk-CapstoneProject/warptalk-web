"use client";

/**
 * The main window's half of the capturer lease (W4b part 1, WT-868). Mounted by
 * PersistentMeetingSession for a bridge room; the rules are in lib/meeting/bridge-capturer.
 *
 *   - resolves this desktop's role: what the server told this window (the claim, a lost heartbeat,
 *     a takeover — useBridgeCapturerStore), else the room record's `bridgeCapturerUserId`, else the
 *     legacy rule (the host captures);
 *   - while the meeting is live and this desktop HOLDS the lease, renews it every
 *     `capturerHeartbeatIntervalSeconds` (a third of the lease at most). A 409 CONFLICT means
 *     someone took over: this desktop becomes a member and stops capturing. The loop stops — and
 *     with it the lease, which then lapses for someone else to take — when the meeting ends, is
 *     idle-reaped, or the session unmounts;
 *   - `takeOver()` is the member's "Capture audio on this device", relayed from the popup.
 *
 * The heartbeat runs in the hidden main window, never in the popup: the main window is what
 * actually captures, so a lease renewed by a popup that outlived it would keep a dead capture
 * "live" for everyone else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { getErrorStatus } from "@/lib/api/retry-policy";
import {
  bridgeCapturerAway,
  capturerHeartbeatDelayMs,
  capturerHeartbeatOutcome,
  capturerTakeoverOutcome,
  holdsCapturerLease,
  resolveBridgeRole,
  type BridgeRole,
} from "@/lib/meeting/bridge-capturer";
import { translationRoomService } from "@/services/translation-room.service";
import { useBridgeCapturerStore } from "@/stores/bridge-capturer-store";

export type BridgeCapturerLease = {
  bridgeRole: BridgeRole;
  /** The capturer is somebody else and not connected (a hint; the server decides). Null: unknown. */
  capturerAway: boolean | null;
  /** Take the far side's capture over. Resolves true when this desktop is now the capturer. */
  takeOver: () => Promise<boolean>;
};

export function useBridgeCapturerLease({
  roomId,
  enabled,
  live,
  userId,
  bridgeCapturerUserId,
  isLegacyOwner,
  participants,
}: {
  roomId: string;
  /** An EXTERNAL_BRIDGE room. Nothing else has a capturer. */
  enabled: boolean;
  /** The meeting is open and not idle-reaped: only then is there a capture to keep alive. */
  live: boolean;
  userId: string | null | undefined;
  /** The room record's capturer, or null/undefined (legacy room / older server). */
  bridgeCapturerUserId: string | null | undefined;
  /** The legacy rule's owner: this user booked the room. */
  isLegacyOwner: boolean;
  participants: ReadonlyArray<{ userId: string; status: string }> | null | undefined;
}): BridgeCapturerLease {
  const queryClient = useQueryClient();
  const entry = useBridgeCapturerStore((state) => state.byRoomId[roomId]);
  const setRole = useBridgeCapturerStore((state) => state.setRole);

  const known = entry?.role ?? null;
  const bridgeRole = resolveBridgeRole({ userId, known, bridgeCapturerUserId, isLegacyOwner });
  const leaseHeld = enabled && holdsCapturerLease({ userId, known, bridgeCapturerUserId });
  const capturerAway =
    enabled && bridgeRole === "member"
      ? bridgeCapturerAway({ userId, bridgeCapturerUserId, participants })
      : null;

  const intervalSeconds = entry?.heartbeatIntervalSeconds;
  const leaseSeconds = entry?.leaseSeconds;
  /** Bumped when a heartbeat says "stop", so the loop does not restart until something changes. */
  const [stoppedFor, setStoppedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !live || !leaseHeld || !roomId || stoppedFor === roomId) return;
    let cancelled = false;
    let timer: number | undefined;
    const delay = capturerHeartbeatDelayMs(intervalSeconds, leaseSeconds);

    const beat = async () => {
      let outcome;
      try {
        await translationRoomService.heartbeatBridgeCapturer(roomId);
        outcome = capturerHeartbeatOutcome({ ok: true });
      } catch (error) {
        outcome = capturerHeartbeatOutcome({
          ok: false,
          status: getErrorStatus(error),
          code: apiErrorCode(error),
        });
      }
      if (cancelled) return;
      if (outcome === "lost") {
        // Someone took over. Stop capturing here: the session's capture effects read the role.
        setRole(roomId, "member");
        void queryClient.invalidateQueries({ queryKey: ["translationRooms", roomId] });
        return;
      }
      if (outcome === "stop") {
        setStoppedFor(roomId);
        return;
      }
      timer = window.setTimeout(() => void beat(), delay);
    };

    timer = window.setTimeout(() => void beat(), delay);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, live, leaseHeld, roomId, intervalSeconds, leaseSeconds, stoppedFor, setRole, queryClient]);

  const takingOverRef = useRef(false);
  const takeOver = useCallback(async () => {
    if (!enabled || !roomId || takingOverRef.current) return false;
    takingOverRef.current = true;
    try {
      await translationRoomService.takeOverBridgeCapturer(roomId);
      setRole(roomId, "capturer");
      setStoppedFor(null);
      void queryClient.invalidateQueries({ queryKey: ["translationRooms", roomId] });
      return true;
    } catch (error) {
      const outcome = capturerTakeoverOutcome({
        ok: false,
        status: getErrorStatus(error),
        code: apiErrorCode(error),
      });
      // The popup also says it failed (it waits on `bridgeRole` and times out); this is the
      // server's own sentence, for the main window.
      toast.error(
        getErrorMessage(
          error,
          outcome === "still-live"
            ? "Another participant is still capturing this call's audio."
            : "Could not capture this call's audio on this device.",
        ),
      );
      return false;
    } finally {
      takingOverRef.current = false;
    }
  }, [enabled, roomId, setRole, queryClient]);

  return { bridgeRole, capturerAway, takeOver };
}
