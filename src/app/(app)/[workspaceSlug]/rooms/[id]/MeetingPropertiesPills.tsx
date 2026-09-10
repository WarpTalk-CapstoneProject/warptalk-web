import { LanguageSelector } from "@/components/rooms/create/language-selector";
import { useUpdateTranslationRoomSettings } from "@/hooks/use-translationRooms";
import { StatusPanel } from "../StatusPanel";
import { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { Calendar as CalendarIcon, Copy, Tag, Users } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { meetingTypeByValue } from "@/lib/meeting/meeting-types";
import { UserChip, type UserChipIdentity } from "@/components/user/user-chip";

/**
 * Who hosts this room, from the two sources this component has: the signed-in user (when they
 * are the host) and the participant roster. Neither is guaranteed — a host who has not joined
 * yet is in neither — so the last resort is the word "Host", not their id.
 */
function hostIdentity(
  room: TranslationRoomDto,
  apiParticipants: TranslationRoomParticipantDto[],
  user: { id: string; fullName?: string } | null,
): UserChipIdentity {
  const fromRoster = apiParticipants.find(
    (participant) => participant.userId === room.hostId,
  );
  return {
    userId: room.hostId,
    name:
      (room.hostId === user?.id ? user?.fullName : fromRoster?.displayName) ||
      fromRoster?.displayName ||
      "Host",
    role: "Host",
  };
}

export function MeetingPropertiesPills({
  room,
  apiParticipants,
  occupancyLabel,
  occupancyNoun,
  user,
  onCopy
}: {
  room: TranslationRoomDto;
  apiParticipants: TranslationRoomParticipantDto[];
  /**
   * WT-274: the already-formatted "seats/capacity" pair from `useRoomOccupancy`. This takes a
   * finished string rather than a count on purpose — the component has no business deciding
   * which participant statuses occupy a seat, and when it did the chip disagreed with the
   * Tracking panel beside it.
   */
  occupancyLabel: string;
  /** "in room" while it is running, "attended" once it is over. */
  occupancyNoun: string;
  user: { id: string; fullName?: string } | null;
  /** WT-310(12) — the page's copy handler, so the room-code pill reuses its confirmation. */
  onCopy: (text: string, label: string) => void;
}) {
  // The day this meeting runs: its scheduled time when it has one, otherwise the day it was
  // created — which for an ad-hoc room is the same thing.
  const meetingDate = new Date(room.scheduledAt ?? room.createdAt);

  // null for a type this build's registry does not know — the chip is then simply not rendered.
  const meetingType = meetingTypeByValue(room.translationRoomType);

  const updateSettings = useUpdateTranslationRoomSettings();

  // Edit the room's declared language set; source language is derived as the first
  // entry (an internal fallback), matching how the create dialog builds it.
  const handleLanguagesChange = (langs: string[]) => {
    if (langs.length === 0) return;
    updateSettings.mutate({
      id: room.id,
      data: { sourceLanguage: langs[0], targetLanguages: langs }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
      <StatusPanel status={room.status} />

      {/* The meeting type. It is picked at creation and it decides the things a viewer of this
          page will otherwise be surprised by — the lobby, mute-on-entry, auto-record, breakouts
          and the seat cap in the occupancy pill a few chips along. It was shown in the create
          dialog and then never again, so a room's own page could not tell you whether it was an
          Event or a Webinar.

          Read-only, unlike the language selector beside it: the type is what stamped the room's
          settings and seat cap at creation, and changing it here would imply those get restamped,
          which no endpoint does. Nothing is rendered at all for a type the registry does not
          know — better a missing chip than a confident wrong label. */}
      {meetingType && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          title={`Meeting type — sets the lobby, mute on entry, recording, breakouts and the ${meetingType.defaults.maxParticipants}-seat capacity`}
        >
          <Tag size={12} weight="regular" className="text-ink-muted" aria-hidden />
          <span className="text-[12px] font-medium text-ink">{meetingType.label}</span>
        </div>
      )}

      {/* The host, as a chip you can open rather than a name you can only read. This drew its own
          initial-in-a-circle and never had a code path that could show a face, so the host of
          every meeting was a letter — and when neither the viewer nor the participant list could
          name them it printed the raw host UUID into the pill. The shared chip carries the face,
          the presence dot and the card; an unresolvable host now reads as "Host". */}
      <UserChip user={hostIdentity(room, apiParticipants, user)} size="md" className="border-border/60" />

      <LanguageSelector
        languages={room.targetLanguages?.length ? room.targetLanguages : [room.sourceLanguage].filter(Boolean) as string[]}
        onLanguagesChange={handleLanguagesChange}
      />

      {/* WT-310(12): the room code is what a host actually came here for, and it lived only in
          an "Actions" button and as 11px muted mono text at the bottom of the right column.
          It sits beside the title now, in the row a visitor reads first, and copies on click.
          Both older copies stay — the button and the "Meeting access" line are still correct. */}
      <button
        type="button"
        onClick={() => onCopy(room.translationRoomCode, "Room code")}
        title="Copy room code"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-surface-2 transition-colors cursor-pointer"
      >
        <Copy size={12} weight="bold" className="text-ink-muted" />
        <span className="font-mono text-[12px] font-semibold tracking-wide text-ink">
          {room.translationRoomCode}
        </span>
      </button>

      {/* WT-321(3): same legibility fix as the meetings list row — the pair is
          seats-taken / seat cap, and now says so instead of reading as a bare code.

          WT-330(7): both halves of that pair are real, so the pill stays — but it now says
          "in room" out loud. The product owner read "0/100" on a scheduled room as a hardcoded
          placeholder, and a bare fraction sitting between a room code and a date genuinely does
          look like one. It is not: `0` is the CONNECTED seat count (room-occupancy.ts, matching
          the backend's ratified SeatHolding rule) and `100` is the room's own persisted
          `maxParticipants`, stamped at creation from TranslationRoomTypePolicy — EVENT caps at
          100, VIRTUAL_APPOINTMENT at 2 — and enforced on every join
          (TranslationRoomService.CreateParticipant, WT-262). It reads 0 because nobody has
          joined yet, which is the correct answer, so the fix is to stop the number looking like
          a placeholder rather than to delete a true one. */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
        title={
          occupancyNoun === "attended"
            ? "People who joined this meeting"
            : "Participants in the room, out of the meeting type's seat capacity"
        }
      >
        <Users size={12} weight="regular" className="text-ink-muted" aria-hidden />
        <span className="tabular-nums text-[12px] font-medium">{occupancyLabel}</span>
        <span className="text-[12px] text-ink-muted">{occupancyNoun}</span>
        <span className="sr-only">{occupancyNoun}</span>
      </div>

      {/* scheduledAt, not createdAt.
          This showed the day the room was created, which for a scheduled meeting is not the
          day it runs — the "When" row below the title carried the real answer, and that row is
          gone. The full timestamp rides along in the tooltip, because month-and-day cannot say
          5:04 PM and that was the other thing the row said. */}
      <Popover>
        <PopoverTrigger
          title={meetingDate.toLocaleString()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-w-[80px] justify-center text-muted-foreground cursor-pointer hover:bg-surface-2 transition-colors"
        >
          <CalendarIcon size={13} weight="regular" />
          <span className="tabular-nums text-[12px] font-medium">
            {meetingDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-xl" align="end">
          <Calendar mode="single" selected={meetingDate} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
