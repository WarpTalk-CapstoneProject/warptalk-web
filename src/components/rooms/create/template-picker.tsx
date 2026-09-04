import React from "react";
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
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import { MEETING_TYPES, EXTERNAL_BRIDGE_TYPE, isExternalBridge } from "@/lib/meeting/meeting-types";

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
  [EXTERNAL_BRIDGE_TYPE]: ArrowSquareOut,
};

/**
 * The list is rendered from `MEETING_TYPES`, not spelled out again here.
 *
 * It used to be a second hardcoded copy of the same six labels, and that is exactly why
 * `EXTERNAL_BRIDGE` was invisible for three days: it was added to `meeting-types.ts` (and the
 * backend seeded rooms for it, and the desktop app shipped its half) while this file still
 * listed six items, so nothing in the product could ever select it. Adding a meeting type is
 * now one edit, in the file that already decides what the value means.
 */
export function TemplatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  // External Meeting is separated out. It is the only type whose call does not happen on
  // WarpTalk — it needs two virtual audio devices and Google Meet pointed at them — so offering
  // it in the same run as "Webinar" would read as one more room preset, which it is not.
  const standardTypes = MEETING_TYPES.filter((type) => !isExternalBridge(type.value));
  const bridgeTypes = MEETING_TYPES.filter((type) => isExternalBridge(type.value));

  function renderItem(type: (typeof MEETING_TYPES)[number]) {
    const Icon = ICON_BY_VALUE[type.value] ?? CalendarIcon;
    return (
      <CommandItem
        key={type.value}
        onSelect={() => onChange(type.label)}
        className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2"
      >
        <Icon weight="duotone" size={14} className="text-ink-muted" />
        <span className="text-ink font-medium">{type.label}</span>
      </CommandItem>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-1 hover:bg-surface-2 px-1.5 py-0.5 rounded transition-colors text-ink cursor-pointer">
        {value} <CaretDown size={12} weight="bold" className="text-ink-muted" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-1 bg-canvas rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
            <CommandGroup heading="Meeting Type" className="text-[11px] text-ink-muted">
              {standardTypes.map(renderItem)}
            </CommandGroup>
            {bridgeTypes.length > 0 && (
              <CommandGroup
                heading="Translate a call elsewhere"
                className="text-[11px] text-ink-muted"
              >
                {bridgeTypes.map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
