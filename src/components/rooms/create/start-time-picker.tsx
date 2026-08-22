import React, { useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Trash } from "@phosphor-icons/react/dist/ssr";
import { PillButton } from "./pill-button";
import { TimeField } from "./time-field";

export function StartTimePicker({ scheduledAt, onChange, onRemove }: { scheduledAt: Date; onChange: (value: Date) => void; onRemove: () => void }) {
  const [timeStr, setTimeStr] = useState(format(scheduledAt, "HH:mm"));

  const handleTimeChange = (val: string) => {
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
      <PopoverTrigger 
        render={
          <PillButton 
            icon={CalendarIcon} 
            label={format(scheduledAt, "MMM d, h:mm a")} 
            active={true} 
          />
        }
      />
      <PopoverContent align="start" className="w-auto p-3 bg-canvas rounded-xl shadow-xl border-border/50">
        <Calendar
          mode="single"
          selected={scheduledAt}
          onSelect={handleDateSelect}
          className="p-0 border-none bg-transparent"
        />
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
          {/* WT-548: not `<input type="time">`. Its am/pm labels come from the BROWSER's
              language, so a Vietnamese Chrome rendered "09:00 SA" inside an English dialog. */}
          <TimeField
            label="Start time"
            value={timeStr}
            onChange={handleTimeChange}
            className="flex-1"
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
