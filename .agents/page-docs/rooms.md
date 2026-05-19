# Rooms Page Documentation

This document tracks the current behavior and maintenance notes for the host Rooms overview at `/rooms`.

---

## Schedule Table Overview

**What changed:**
- Replaced the original flat `All Rooms` list with a schedule table.
- Schedule columns represent room groups/departments and can be toggled from a compact view-options popover.
- The schedule now renders only time slots that have meetings instead of a fixed 9 AM to 5 PM range.
- Clicking any meeting cell opens a list view for that room/time slot.
- Cells with multiple meetings are collapsed into a `N meetings` summary and expand to the original list-style rows on click.
- Added a Back control to return from the selected meeting list to the schedule table.
- Added room renaming controls in the view-options popover.
- Added date controls inside the same view-options popover to keep the toolbar compact.

**Why it changed:**
The page needed to support a schedule-first workflow for hosts while still preserving access to a detailed meeting list when a time slot is selected. The compact popover keeps date and room column options together, similar to Linear-style view controls.

**Files affected:**
- `src/app/(app)/rooms/page.tsx`

**How the page currently works:**
- The page uses local demo data for rooms, time slots, and meetings.
- Visible room columns are derived from the selected room IDs.
- Visible time slots are derived from meetings in selected rooms and sorted by actual time.
- Selecting a populated schedule cell stores the room, time, and meetings in component state and switches the left panel to a detailed list view.
- The right-side `Investor Q&A` summary panel remains visible beside the schedule/list area.

**Important UI behavior:**
- Empty time rows are hidden.
- Room column names can be edited locally from the view-options popover.
- At least one room column stays selected when toggling rooms.
- A selected slot shows all meetings in that slot, whether there is one meeting or many.
- Meeting colors preserve the existing WarpTalk palette: `#003476`, `#fdfcf6`, `#e4eef9`, and slate neutrals.

**Known limitations:**
- Schedule data is local demo data and is not yet connected to the backend room APIs.
- Room rename and column selection are local state only and do not persist across reloads.
- Date selection changes the displayed date label but does not yet fetch date-specific meeting data.

**Testing checklist:**
- [ ] `/rooms` renders the schedule table.
- [ ] Empty time slots are hidden.
- [ ] Clicking a single-meeting cell opens the detailed list view.
- [ ] Clicking a multi-meeting cell opens all meetings for that slot.
- [ ] Back returns to the schedule table.
- [ ] View options popover opens from the compact toolbar.
- [ ] Room chips can toggle columns.
- [ ] Room names can be edited locally.
- [ ] Date picker/control updates the visible date label.
