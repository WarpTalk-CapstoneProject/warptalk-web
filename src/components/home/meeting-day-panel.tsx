"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, VideoCamera } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { LanguageLabel } from "@/components/language/language-label";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { meetingLanguageSet } from "@/lib/language/languages";
import { isSameDay, meetingsOn } from "@/lib/meeting/meeting-day";
import { MeetingDayStrip } from "@/components/meetings/meeting-day-strip";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { TranslationRoomDto } from "@/types/translationRoom";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });


function MeetingRow({ room, workspaceSlug }: { room: TranslationRoomDto; workspaceSlug: string }) {
  const languages = meetingLanguageSet(room.sourceLanguage, room.targetLanguages);

  return (
    <Link
      href={`/${workspaceSlug}/rooms/${room.id}`}
      className="flex shrink-0 items-center gap-3 rounded-xl border border-border/60 bg-surface-1 px-3 py-2.5 transition-colors hover:border-border hover:bg-surface-2"
    >
      <span className="w-[68px] shrink-0 text-[12px] font-medium tabular-nums text-ink">
        {TIME.format(new Date(room.scheduledAt as string))}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
        {room.title}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {languages.map((language) => (
          <LanguageLabel key={language} value={language} showName={false} />
        ))}
      </span>
    </Link>
  );
}

/**
 * The day strip and the meetings booked for the selected day.
 *
 * Modelled on Google Meet's home panel, which the owner asked for by name: a week of day chips
 * with the selected one picked out, and that day's meetings underneath. It answers "what am I in
 * today?" without a click, which is the question the home page opened on a grid of shortcuts to.
 *
 * `today` is captured once in state rather than read during render. Reading the clock while
 * rendering makes the component impure and makes "is this chip today?" able to change under a
 * re-render; the meetings list already learned this (see its nextUpcoming comment).
 */
export function MeetingDayPanel() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);

  const [today] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // workspaceId is what lets the server answer this for a workspace Owner/Admin at all: without
  // it the list falls back to host-or-participant-or-invitee, and an Admin sees an empty panel
  // for a workspace that has meetings in it. Same reasoning as the meetings list.
  const roomList = useTranslationRooms({
    pageSize: 100,
    status: "SCHEDULED,WAITING,IN_PROGRESS,PAUSED",
    workspaceId: activeWorkspaceId ?? undefined,
  });

  const rooms = useMemo(() => roomList.data?.rooms ?? [], [roomList.data?.rooms]);
  const dayMeetings = useMemo(() => meetingsOn(rooms, selectedDate), [rooms, selectedDate]);

  const slug = activeWorkspaceSlug || "workspace";

  return (
    <section
      aria-label="Meetings by day"
      className="rounded-[14px] border border-border bg-canvas p-3 shadow-linear sm:p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">
          {LONG_DATE.format(selectedDate)}
        </h2>

        {/* The same strip the meetings list shows, so the two cannot disagree about which day
            has meetings — see MeetingDayStrip for why it is shared rather than copied. */}
        <MeetingDayStrip
          rooms={rooms}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          today={today}
        />
      </header>

      {/* One fixed height for every state. 176px is the empty state's own natural height, kept as
          the measure so the panel never changes size: loading, one meeting and five meetings all
          occupy the same box, and switching days can no longer resize the card and shove the
          shortcuts below it around. Past three rows the list scrolls inside instead of growing. */}
      <div className="mt-3 h-[176px]">
        {roomList.isPending ? (
          // Placeholder rows rather than a spinner, clipped to the box like the real list.
          <div className="flex h-full flex-col gap-2 overflow-hidden" aria-hidden>
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-[42px] shrink-0 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : dayMeetings.length > 0 ? (
          <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
            {dayMeetings.map((room) => (
              <MeetingRow key={room.id} room={room} workspaceSlug={slug} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-4 text-center">
            <VideoCamera size={22} weight="duotone" className="text-ink-muted" />
            <div>
              <p className="text-[13px] font-medium text-ink">
                {isSameDay(selectedDate, today)
                  ? "No meetings scheduled for today"
                  : "No meetings scheduled for this day"}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Schedule one, or enjoy the quiet.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setCreateRoomModalOpen(true)}
              className="h-8 gap-1.5 rounded-full px-3 text-[13px]"
            >
              <Plus size={14} weight="bold" />
              New meeting
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
