"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";

/**
 * The live meeting, now beside `waiting` and `ended` rather than at a bare `/room/{id}`.
 *
 * The page itself barely exists: the meeting is rendered by the app shell, which keeps one
 * LiveKit session mounted across every route so that navigating away minimises the call
 * instead of dropping it. All this page does is say which meeting is open.
 */
export default function LiveMeetingPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const openMeeting = useActiveMeetingStore((state) => state.openMeeting);

  useEffect(() => {
    openMeeting(roomId);
  }, [openMeeting, roomId]);

  return (
    <div className="grid h-full place-items-center text-ink-muted">
      <SpinnerGap className="size-5 animate-spin" aria-label="Opening meeting" />
    </div>
  );
}
