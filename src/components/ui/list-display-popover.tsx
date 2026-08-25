"use client";

import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DisplayOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type DisplayProperty = {
  key: string;
  label: string;
  disabled?: boolean;
};

type ListDisplayPopoverProps = {
  trigger: ReactNode;
  triggerClassName: string;
  triggerTitle: string;
  ordering: string;
  orderingOptions: DisplayOption[];
  onOrderingChange: (value: string) => void;
  direction: "asc" | "desc";
  onDirectionChange: (value: "asc" | "desc") => void;
  properties: DisplayProperty[];
  visibleProperties: string[];
  onToggleProperty: (key: string) => void;
  onReset: () => void;
  propertyLabel?: string;
};

export function ListDisplayPopover({
  trigger,
  triggerClassName,
  triggerTitle,
  ordering,
  orderingOptions,
  onOrderingChange,
  direction,
  onDirectionChange,
  properties,
  visibleProperties,
  onToggleProperty,
  onReset,
  propertyLabel = "Display properties",
}: ListDisplayPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={triggerClassName}
        title={triggerTitle}
        aria-label={triggerTitle}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px] gap-0 overflow-hidden rounded-[12px] border-border/70 bg-surface-1 p-0 text-ink shadow-xl"
      >
        <div className="grid gap-3 p-3">
          <div className="grid gap-2">
            <DisplaySelectRow
              label="Ordering"
              value={ordering}
              options={orderingOptions}
              onValueChange={onOrderingChange}
            />
            <DisplaySelectRow
              label="Direction"
              value={direction}
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              onValueChange={(value) =>
                onDirectionChange(value === "desc" ? "desc" : "asc")
              }
            />
          </div>
        </div>

        <div className="border-t border-border/60 px-3 py-3">
          <p className="mb-2 text-[12px] font-semibold text-ink">
            {propertyLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {properties.map((property) => {
              const checked = visibleProperties.includes(property.key);

              return (
                <button
                  key={property.key}
                  type="button"
                  disabled={property.disabled}
                  onClick={() => onToggleProperty(property.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    checked
                      ? "border-border bg-surface-2 text-ink"
                      : "border-border/70 bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {property.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Reset
          </button>
          <span className="text-[11px] text-ink-muted">
            {visibleProperties.length} shown
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DisplaySelectRow({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: DisplayOption[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onValueChange(nextValue);
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-full rounded-[8px] border-border/70 bg-surface-1 text-[12px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="text-[12px]">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="text-[12px]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
