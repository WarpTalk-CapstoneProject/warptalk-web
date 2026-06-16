import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { DotsThree, Calendar as CalendarIcon, GlobeHemisphereWest, Repeat, CheckCircle } from "@phosphor-icons/react/dist/ssr";

export function OptionsMenu({ 
  hasScheduledAt, 
  onAddScheduledAt,
  isMultiLang,
  onToggleMultiLang,
  isDaily,
  onToggleDaily
}: { 
  hasScheduledAt?: boolean; 
  onAddScheduledAt?: () => void;
  isMultiLang: boolean;
  onToggleMultiLang: () => void;
  isDaily?: boolean;
  onToggleDaily?: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger className="flex items-center justify-center h-[26px] w-[26px] rounded-full border border-border/60 bg-white dark:bg-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-ink-muted hover:text-ink hover:border-border hover:bg-surface-1 transition-colors cursor-pointer">
        <DotsThree weight="bold" size={16} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-1 bg-canvas rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
            {!hasScheduledAt && (
              <CommandItem onSelect={onAddScheduledAt} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                <CalendarIcon weight="duotone" size={14} />
                Date & Time
              </CommandItem>
            )}
            <CommandItem 
              onSelect={() => {
                onToggleMultiLang();
              }} 
              className="w-full text-[13px] rounded-md cursor-pointer flex items-center justify-between px-2 py-2 aria-selected:bg-surface-2"
            >
              <div className="flex items-center gap-2">
                <GlobeHemisphereWest weight="duotone" size={16} />
                <span className="font-medium text-ink whitespace-nowrap">Multi-lang</span>
              </div>
              <div data-slot="command-shortcut" className="flex shrink-0 ml-auto items-center">
                {isMultiLang ? (
                  <CheckCircle weight="fill" size={16} color="#3b82f6" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border/60 transition-colors" />
                )}
              </div>
            </CommandItem>
            {onToggleDaily && (
              <CommandItem 
                onSelect={() => {
                  onToggleDaily();
                }} 
                className="w-full text-[13px] rounded-md cursor-pointer flex items-center justify-between px-2 py-2 aria-selected:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <Repeat weight="duotone" size={16} />
                  <span className="font-medium text-ink whitespace-nowrap">Daily</span>
                </div>
                <div data-slot="command-shortcut" className="flex shrink-0 ml-auto items-center">
                  {isDaily ? (
                    <CheckCircle weight="fill" size={16} color="#3b82f6" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-border/60 transition-colors" />
                  )}
                </div>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
