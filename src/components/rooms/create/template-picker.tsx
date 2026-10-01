import React from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  CaretDown,
  Calendar as CalendarIcon,
  Monitor,
  VideoCamera,
  UsersThree,
  MicrophoneStage,
  Broadcast,
} from "@phosphor-icons/react/dist/ssr";
import {
  CREATABLE_MEETING_TYPES,
  MEETING_TYPE_I18N_KEYS,
  meetingTypeByValue,
  type MeetingType,
} from "@/lib/meeting/meeting-types";

/**
 * Icons live here rather than on the meeting type itself: `meeting-types.ts` is the API contract
 * (what value the server stores, what the type configures) and is imported by non-visual code.
 * Keyed by the stored value, so a type whose label is reworded keeps its icon.
 */
const ICON_BY_VALUE: Record<string, React.ComponentType<{ weight?: "duotone"; size?: number; className?: string }>> = {
  EVENT: CalendarIcon,
  CHANNEL_MEETING: Monitor,
  WEBINAR: VideoCamera,
  COMPANY_MEETING: UsersThree,
  VIRTUAL_APPOINTMENT: MicrophoneStage,
  LIVE_EVENT: Broadcast,
};

/**
 * The list is rendered from `CREATABLE_MEETING_TYPES`, not spelled out again here.
 *
 * It used to be a second hardcoded copy of the same six labels, and that is exactly why a new type
 * was once invisible for three days: it was added to `meeting-types.ts` while this file still
 * listed six items. Adding a meeting type is now one edit, in the file that already decides what
 * the value means.
 *
 * External Meeting (EXTERNAL_BRIDGE) is deliberately NOT offered here any more. Such a room is made
 * where the Google Meet call is — by WarpBot (with the Meet link and calendar event) or by the
 * desktop app's Meet auto-detect — never from this picker. See `CREATABLE_MEETING_TYPES`.
 */
export function TemplatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const t = useTranslations("rooms.create.templatePicker");

  function renderItem(type: MeetingType) {
    const Icon = ICON_BY_VALUE[type.value] ?? CalendarIcon;
    const label = t(`types.${MEETING_TYPE_I18N_KEYS[type.value]}`);
    return (
      <CommandItem
        key={type.value}
        onSelect={() => onChange(type.value)}
        className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2"
      >
        <Icon weight="duotone" size={14} className="text-ink-muted" />
        <span className="text-ink font-medium">{label}</span>
      </CommandItem>
    );
  }

  const selectedType = meetingTypeByValue(value);
  const selectedLabel = selectedType
    ? t(`types.${MEETING_TYPE_I18N_KEYS[selectedType.value]}`)
    : value;

  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-1 hover:bg-surface-2 px-1.5 py-0.5 rounded transition-colors text-ink cursor-pointer">
        {selectedLabel} <CaretDown size={12} weight="bold" className="text-ink-muted" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-1 bg-surface-1 rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
            <CommandGroup heading={t("meetingType")} className="text-[11px] text-ink-muted">
              {CREATABLE_MEETING_TYPES.map(renderItem)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
