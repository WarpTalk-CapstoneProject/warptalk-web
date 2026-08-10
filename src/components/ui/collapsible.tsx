"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

/**
 * WT-330: a real collapsible, wrapping the same @base-ui/react primitives every other control
 * in `components/ui` wraps (see popover.tsx, dropdown-menu.tsx).
 *
 * This exists because the room detail Tracking panel drew a ChevronDown beside "Attendees: 0/100"
 * and "Invited: 5" and then did nothing with it — the glyph the rest of the app uses for "opens"
 * on two headings that could not open. WT-310(7) had already deleted the same fake caret from the
 * panel *titles* for exactly that reason; these two were missed. The choice here is the other one:
 * the sections are worth collapsing, so the chevron becomes true rather than being deleted.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsiblePanel({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn("overflow-hidden", className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel }
