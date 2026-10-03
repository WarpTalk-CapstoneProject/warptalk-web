"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";

import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { openDesktopTranscriptWindow } from "@/lib/desktop/bridge";
import { isExternalBridge } from "@/lib/meeting/meeting-types";
import { canJoinTranslationRoom } from "@/lib/meeting/translation-room-access";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";

/**
 * The live meeting, now beside `waiting` and `ended` rather than at a bare `/room/{id}`.
 *
 * The page itself barely exists: the meeting is rendered by the app shell, which keeps one
 * LiveKit session mounted across every route so that navigating away minimises the call
 * instead of dropping it. All this page does is say which meeting is open.
 *
 * WT-366 — EXCEPT for meetings that are over.
 *
 * It used to say it unconditionally. After a meeting ended the user was sent to the room page,
 * and pressing the browser's Back button brought them here again — where `openMeeting()` opened
 * a session for a room that no longer accepts one, and the shell sat on "Waiting for LiveKit"
 * forever. The transcript still showing the end-of-meeting marker beside a spinner is a
 * particularly bleak way to be stuck.
 *
 * The status rule is `canJoinTranslationRoom`, not a fresh list of statuses written here: the
 * same set already decides whether the room page offers a Join button, and a second copy would
 * eventually disagree with the first about `expired` or `timeout`.
 *
 * WT-868 — AND for External Meetings.
 *
 * A Google Meet call is translated beside Meet, from the desktop app's popup; it is never an
 * in-app meeting. Every link that still lands here for such a room (the room page's Join, a
 * "meeting started" notification, search, the legacy `/room/{id}` address, a bookmark) is sent
 * to the room's page instead, and on the desktop the popup is asked for. The meeting session for
 * the room is not opened from here: the popup's own Start asks this window for it
 * (onBridgeRoomActivated in the app layout), as does the automatic Meet room.
 */
export default function LiveMeetingPage() {
  const { id: roomId, workspaceSlug } = useParams<{ id: string; workspaceSlug: string }>();
  const router = useRouter();
  const openMeeting = useActiveMeetingStore((state) => state.openMeeting);
  const closeMeeting = useActiveMeetingStore((state) => state.closeMeeting);

  const { data: room, isError } = useTranslationRoom(roomId);

  useEffect(() => {
    // Wait for the answer. Opening on an unknown status would reintroduce exactly the race this
    // exists to close, and a room that fails to load is handled by the room page's own error
    // state rather than by guessing here.
    if (!room) {
      if (isError) router.replace(`/${workspaceSlug}/rooms/${roomId}`);
      return;
    }

    if (isExternalBridge(room.translationRoomType)) {
      // replace for the same reason as below: Back must not find /live again. No closeMeeting():
      // a bridge session already running in this window (the auto Meet room) is the popup's, and
      // leaving it alone is what keeps the call translating.
      router.replace(`/${workspaceSlug}/rooms/${roomId}`);
      // Resolves false on the web, where there is no popup to open.
      void openDesktopTranscriptWindow(roomId);
      return;
    }

    if (!canJoinTranslationRoom(room.status)) {
      // Close first. Back can arrive with the ended meeting still in the store from before it
      // finished, and leaving it there keeps the shell rendering a dead session over the page we
      // are about to land on.
      closeMeeting();
      // replace, not push: the whole complaint is that /live is reachable from history, and
      // pushing would leave it there for the next Back press to find again.
      router.replace(`/${workspaceSlug}/rooms/${roomId}`);
      return;
    }

    openMeeting(roomId);
  }, [room, isError, roomId, workspaceSlug, router, openMeeting, closeMeeting]);

  return (
    <div className="grid h-full place-items-center text-ink-muted">
      <SpinnerGap className="size-5 animate-spin" aria-label="Opening meeting" />
    </div>
  );
}
