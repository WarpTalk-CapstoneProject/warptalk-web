"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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


const HOUR_LABEL = new Intl.DateTimeFormat("en-US", { hour: "numeric" });

/** Every hour of the day, so the rail is a day and not just the hours that happen to be booked. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** One hour row. 44px is the floor, not the height — an hour with two meetings grows. */
const HOUR_ROW_HEIGHT = 44;

function MeetingBlock({ room, workspaceSlug }: { room: TranslationRoomDto; workspaceSlug: string }) {
  const languages = meetingLanguageSet(room.sourceLanguage, room.targetLanguages);

  return (
    <Link
      href={`/${workspaceSlug}/rooms/${room.id}`}
      className="flex min-w-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 transition-colors hover:border-primary/50 hover:bg-primary/10"
    >
      <span className="shrink-0 text-[11px] font-medium tabular-nums text-primary">
        {TIME.format(new Date(room.scheduledAt as string))}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{room.title}</span>
      <span className="flex shrink-0 items-center gap-1">
        {languages.map((language) => (
          <LanguageLabel key={language} value={language} showName={false} />
        ))}
      </span>
    </Link>
  );
}

/**
 * The day as an hour rail, the way a calendar shows one.
 *
 * The panel is a fixed height so it cannot resize as days change, and a day with one meeting used
 * to spend the rest of that height on nothing. An hour column fills it with the thing the height
 * was reserved for: where the day's meetings sit relative to each other and to the hours around
 * them. One meeting at 8am now reads as "8am, and the morning after it is free" rather than as a
 * row with a void under it.
 *
 * All 24 hours, scrolled to where the day actually starts — clipping the rail to booked hours
 * would make an empty afternoon invisible, which is the question this view answers.
 */
function DayHourRail({
  meetings,
  workspaceSlug,
}: {
  meetings: TranslationRoomDto[];
  workspaceSlug: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const meetingsByHour = useMemo(() => {
    const byHour = new Map<number, TranslationRoomDto[]>();
    for (const room of meetings) {
      if (!room.scheduledAt) continue;
      const hour = new Date(room.scheduledAt).getHours();
      byHour.set(hour, [...(byHour.get(hour) ?? []), room]);
    }
    return byHour;
  }, [meetings]);

  const firstBookedHour = useMemo(() => {
    const hours = [...meetingsByHour.keys()];
    return hours.length > 0 ? Math.min(...hours) : null;
  }, [meetingsByHour]);

  // Scroll to the first meeting, or to the working morning when the day is empty. Without this the
  // rail opens at midnight and every real meeting is below the fold of a 176px box.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const target = firstBookedHour ?? 8;
    // One row above the target, so the meeting does not sit flush against the top edge with no
    // indication that earlier hours exist.
    rail.scrollTop = Math.max(0, (target - 1) * HOUR_ROW_HEIGHT);
  }, [firstBookedHour]);

  return (
    <div ref={railRef} className="h-full overflow-y-auto pr-1">
      {HOURS.map((hour) => {
        const booked = meetingsByHour.get(hour) ?? [];
        const label = HOUR_LABEL.format(new Date(2026, 0, 1, hour));

        return (
          <div
            key={hour}
            className="flex items-stretch gap-3 border-t border-border/40 first:border-t-0"
            style={{ minHeight: HOUR_ROW_HEIGHT }}
          >
            <span className="w-[52px] shrink-0 pt-1.5 text-right text-[11px] tabular-nums text-ink-muted">
              {label}
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1">
              {booked.map((room) => (
                <MeetingBlock key={room.id} room={room} workspaceSlug={workspaceSlug} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
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
          <DayHourRail meetings={dayMeetings} workspaceSlug={slug} />
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
