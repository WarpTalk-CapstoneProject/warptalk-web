import { LanguageSelector } from "@/components/rooms/create/language-selector";
import { useUpdateTranslationRoomSettings } from "@/hooks/use-translationRooms";
import { StatusPanel } from "../StatusPanel";
import { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { Calendar as CalendarIcon, Copy, Users } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export function MeetingPropertiesPills({
  room,
  apiParticipants,
  occupancyLabel,
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
  user: { id: string; fullName?: string } | null;
  /** WT-310(12) — the page's copy handler, so the room-code pill reuses its confirmation. */
  onCopy: (text: string, label: string) => void;
}) {
  // The day this meeting runs: its scheduled time when it has one, otherwise the day it was
  // created — which for an ad-hoc room is the same thing.
  const meetingDate = new Date(room.scheduledAt ?? room.createdAt);

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

      <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0 uppercase">
          {room.hostId === user?.id ? user?.fullName?.charAt(0) : (apiParticipants.find(p => p.userId === room.hostId)?.displayName?.charAt(0) || room.hostId.charAt(0))}
        </div>
        <span className="text-ink-muted pr-1.5 text-[12px] font-medium">
          {room.hostId === user?.id ? user?.fullName : (apiParticipants.find(p => p.userId === room.hostId)?.displayName || room.hostId)}
        </span>
      </div>

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
        title="Participants in the room, out of the meeting type's seat capacity"
      >
        <Users size={12} weight="regular" className="text-ink-muted" aria-hidden />
        <span className="tabular-nums text-[12px] font-medium">{occupancyLabel}</span>
        <span className="text-[12px] text-ink-muted">in room</span>
        <span className="sr-only">participants in the room, out of the seat capacity</span>
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
