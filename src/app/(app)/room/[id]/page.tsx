"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";

export default function RoomDetailPage() {
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
