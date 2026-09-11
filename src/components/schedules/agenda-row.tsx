"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";

import { UserChip } from "@/components/user/user-chip";
import { formatLanguageRouteShort } from "@/lib/language/languages";
import type { TimedMeeting } from "@/lib/meeting/agenda-sections";
import { meetingStateLabel } from "@/lib/meeting/meeting-display-state";
import { cn } from "@/lib/utils";

import { MeetingStateIcon } from "./meeting-state-icon";

const APP_CALENDAR_LOCALE = "en-GB";

/**
 * One meeting in the Agenda list: time, state, title, one line of who and how — and an action
 * only when there is one to take.
 *
 * Deliberately bare. No pill, no tint, no border: a month is thirty of these and the WeekCard's
 * coloured box, repeated thirty times, is a wall in which nothing stands out. The state lives in
 * the 13px icon, the host relation in the title's weight, and hover is the only background a row
 * ever gets — so the one live meeting with a Join button is the thing the eye lands on.
 *
 * A `role="button"` div rather than a <button>, for the same reason as the page's WeekCard: the
 * host's name inside it is a `UserChip` and the live action is a <Link>, and neither may sit
 * inside a real <button>.
 */
export function AgendaRow({
  meeting,
  workspaceSlug,
  onOpen,
  highlighted = false,
}: {
  meeting: TimedMeeting;
  workspaceSlug: string;
  onOpen: () => void;
  /** Briefly true after a deep link lands on this row — see `AgendaList.highlightMeeting`. */
  highlighted?: boolean;
}) {
  // Cancellation outranks the clock, as everywhere on the schedule: a cancelled meeting whose slot
  // is now is not live, and gets neither the pulse nor the Join button.
  const isCancelled = meeting.status === "cancelled";
  const isLive = meeting.timeState === "live" && !isCancelled;

  const time = formatTime(meeting.occursAt);
  const relation = meeting.isHost ? "You host" : `Invited by ${meeting.hostName}`;
  const stateLabel = meetingStateLabel(meeting);
  const people = describePeople(meeting.participantCount);
  // Short marks, "EN → VI", as the approved design draws them: the full names ("English →
  // Vietnamese") push the route off the end of a meta line that already carries the host and the
  // head count, and the route is the part a reader scans the column for.
  const route = formatLanguageRouteShort(meeting.sourceLanguage, meeting.targetLanguages);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Only when the ROW itself has focus. Enter on the host chip or on Join bubbles up to here,
    // and without this check it would open the chip's card (or follow the link) AND open the
    // meeting behind it in the same keystroke.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-meeting-id={meeting.id}
      // Time, title, relation and state: everything a sighted reader gets from the row at a
      // glance. The visible text is split across columns and an icon, and read in DOM order it
      // would come out as "09:30 Weekly sync You host 4 people" with the state missing entirely.
      aria-label={`${time}, ${meeting.title}, ${relation}, ${stateLabel}`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={cn(
        "group flex min-w-0 cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 outline-none hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring/40",
        // The deep-link highlight fades rather than blinks, but only for people who have not
        // asked for less motion — for them it simply appears and, two seconds later, goes.
        "motion-safe:transition-colors motion-safe:duration-700",
        highlighted && "bg-primary/[0.10] ring-1 ring-primary/40 hover:bg-primary/[0.14]",
      )}
    >
      <span className="w-11 shrink-0 pt-[3px] font-mono text-[12px] leading-4 tabular-nums text-ink-muted">
        {time}
      </span>

      <MeetingStateIcon meeting={meeting} size={13} className="mt-[4px]" />

      <div className="min-w-0 flex-1">
        <p
          title={meeting.title}
          className={cn(
            "truncate text-[13.5px] leading-5",
            // Weight is the host signal: the meetings you run are the ones you cannot skip, and
            // that has to read without a badge. Cancelled is muted colour only — never struck
            // through (removed on purpose in 8953691).
            meeting.isHost ? "font-semibold" : "font-normal",
            isCancelled ? "text-ink-muted" : "text-ink",
          )}
        >
          {meeting.title}
        </p>

        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-4 text-ink-muted">
          {meeting.isHost ? (
            <span className="shrink-0 font-semibold text-ink">You host</span>
          ) : (
            <>
              <span className="shrink-0">Invited by</span>
              {/* A person's name opens their card, everywhere it appears (PR #463). The chip
                  swallows its own click, so opening the card does not also open the meeting. */}
              <span className="flex min-w-0 max-w-[45%] shrink-0">
                <UserChip
                  user={{ userId: meeting.hostId, name: meeting.hostName, role: "Host" }}
                  variant="text"
                  size="sm"
                  showAvatar={false}
                  className="text-[12px] text-ink"
                />
              </span>
            </>
          )}
          <span className="min-w-0 truncate">
            {people ? ` · ${people}` : ""} · {route}
          </span>
        </p>
      </div>

      {isLive ? (
        <Link
          href={`/${workspaceSlug}/rooms/${meeting.id}`}
          // The row would open the room too, but through `onOpen` and the router; the link has to
          // be the only thing a click here does, or the room is pushed onto history twice.
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 flex h-6 shrink-0 items-center rounded-md bg-rose-500 px-2.5 text-[12px] font-medium text-white outline-none transition-colors hover:bg-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/40"
        >
          Join
        </Link>
      ) : isCancelled ? (
        <span className="shrink-0 pt-[3px] text-[12px] leading-4 text-ink-muted">Cancelled</span>
      ) : null}
    </div>
  );
}

/**
 * "1 person", "4 people" — or nothing at all for zero.
 *
 * A booked room nobody has joined yet counts zero participants, and "0 people" under a meeting
 * you were invited to reads as "nobody is coming", which is not what the number means.
 */
function describePeople(count: number) {
  if (!count || count < 0) return null;
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** The page's `formatTime`, duplicated until the integrator moves both onto one helper. */
function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
}
