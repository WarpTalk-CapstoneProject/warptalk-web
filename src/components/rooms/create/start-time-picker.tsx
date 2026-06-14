import React, { useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Trash } from "@phosphor-icons/react/dist/ssr";
import { PillButton } from "./pill-button";

export function StartTimePicker({ scheduledAt, onChange, onRemove }: { scheduledAt: Date; onChange: (value: Date) => void; onRemove: () => void }) {
  const [timeStr, setTimeStr] = useState(format(scheduledAt, "HH:mm"));

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTimeStr(val);
    const [hours, minutes] = val.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDate = setMinutes(setHours(scheduledAt, hours), minutes);
      onChange(newDate);
    }
  };

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const newDate = setMinutes(setHours(d, hours || 0), minutes || 0);
      onChange(newDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger>
        <PillButton 
          icon={CalendarIcon} 
          label={format(scheduledAt, "MMM d, h:mm a")} 
          active={true} 
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 bg-canvas rounded-xl shadow-xl border-border/50">
        <Calendar
          mode="single"
          selected={scheduledAt}
          onSelect={handleDateSelect}
          className="p-0 border-none bg-transparent"
        />
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
          <input
            type="time"
            value={timeStr}
            onChange={handleTimeChange}
            className="w-full h-8 px-2 text-[13px] bg-surface-1 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ink/20 text-ink"
          />
          <button 
            onClick={onRemove}
            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
            title="Remove schedule"
          >
            <Trash weight="bold" size={14} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
