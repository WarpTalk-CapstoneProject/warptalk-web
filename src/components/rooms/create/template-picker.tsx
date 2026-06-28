import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { CaretDown, Calendar as CalendarIcon, Monitor, VideoCamera, UsersThree, MicrophoneStage, Broadcast } from "@phosphor-icons/react/dist/ssr";

export function TemplatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-1 hover:bg-surface-2 px-1.5 py-0.5 rounded transition-colors text-ink cursor-pointer">
        {value} <CaretDown size={12} weight="bold" className="text-ink-muted" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1 bg-canvas rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
             <CommandGroup heading="Meeting Type" className="text-[11px] text-ink-muted">
                <CommandItem onSelect={() => onChange("Event")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <CalendarIcon weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Event</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Channel Meeting")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <Monitor weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Channel Meeting</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Webinar")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <VideoCamera weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Webinar</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Company Meeting")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <UsersThree weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Company Meeting</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Virtual Appointment")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <MicrophoneStage weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Virtual Appointment</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Live Event")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <Broadcast weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Live Event</span>
                </CommandItem>
             </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
