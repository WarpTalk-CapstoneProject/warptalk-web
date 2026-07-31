import { LanguageSelector } from "@/components/rooms/create/language-selector";
import { useUpdateTranslationRoomSettings } from "@/hooks/use-translationRooms";
import { StatusPanel } from "../StatusPanel";
import { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { Calendar as CalendarIcon } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export function MeetingPropertiesPills({
  room,
  apiParticipants,
  activeParticipantCount,
  user
}: {
  room: TranslationRoomDto;
  apiParticipants: TranslationRoomParticipantDto[];
  activeParticipantCount: number;
  user: { id: string; fullName?: string } | null;
}) {
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

      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <span className="tabular-nums text-[12px] font-medium">{activeParticipantCount}/{room.maxParticipants}</span>
      </div>

      <Popover>
        <PopoverTrigger className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-w-[80px] justify-center text-muted-foreground cursor-pointer hover:bg-surface-2 transition-colors">
          <CalendarIcon size={13} weight="regular" />
          <span className="tabular-nums text-[12px] font-medium">
            {new Date(room.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-xl" align="end">
          <Calendar
            mode="single"
            selected={new Date(room.createdAt)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
