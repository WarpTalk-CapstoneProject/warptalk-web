#!/usr/bin/env node
/**
 * An external collaborator must not be offered meeting creation.
 *
 * WHAT HAPPENED (WT-371 #2)
 *   A member invited into a workspace as External got the Internal experience in full: every
 *   New-meeting entry point, and — because WorkspaceMemberMapper granted can_create_meetings to
 *   everyone on join — a server that actually let them through. The backend half is fixed in the
 *   mapper and covered by unit tests there. This script covers the half that lives here: the shell
 *   must not offer an action the member does not have.
 *
 * WHY A SCRIPT AND NOT A COMPONENT TEST
 *   There is no single New-meeting button. Five different surfaces call
 *   `setCreateRoomModalOpen(true)` to start a NEW meeting, and the failure mode is not "the gate is
 *   wrong" but "someone added a sixth surface and did not know there was a gate". A rendering test
 *   can only assert about surfaces it already knows about; this asserts about the call site itself,
 *   so a new one fails the build the day it is written.
 *
 * THE RULES
 *   1. Every file that opens the create-meeting dialog reads the permission. The one exemption is
 *      the room detail page, which reopens the dialog as an EDITOR for a room the user already
 *      hosts (it sets editRoomId first and is gated on room.hostId === user.id) — editing your own
 *      meeting is not creating one.
 *   2. The permission collapses `null` to allowed, in exactly one place. `null` means "not known
 *      yet" — nothing selected, or state persisted before the field existed — and a surface reading
 *      `!!canCreateMeetings` directly would hide itself for every user on first paint after login.
 *      So the store exports the helper and nobody re-derives it.
 *   3. applySelectedWorkspace forwards the field with `??`, not `||`. An explicit `false` from the
 *      server is the entire point of the field; `||` would turn it back into `true`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src");
const read = (p) => readFileSync(join(root, p), "utf8");

const STORE = "src/stores/workspace-store.ts";
const APPLY = "src/lib/workspace/apply-selected-workspace.ts";

/**
 * Reopens the create dialog in EDIT mode for an existing room, host-gated on its own. Listed by
 * path so that adding a genuine new creation surface can never be waved through by accident.
 */
const EDIT_MODE_EXEMPT = new Set([
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
]);

const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// ---- Rule 1: every creation surface consults the permission --------------------------------
for (const file of walk(SRC)) {
  const rel = relative(root, file).replace(/\\/g, "/");
  const source = readFileSync(file, "utf8");

  if (!/setCreateRoomModalOpen\(true\)/.test(source)) continue;
  if (EDIT_MODE_EXEMPT.has(rel)) {
    // Verify the exemption still earns itself: it must set an edit target, or it has quietly
    // become a plain creation surface and needs the gate like everyone else.
    if (!/setEditRoomId\(/.test(source)) {
      failures.push(
        `${rel}: exempted as the room EDITOR, but it no longer calls setEditRoomId — it now opens ` +
          `the dialog to create a new meeting and must read useCanCreateMeetings().`,
      );
    }
    continue;
  }

  if (!/useCanCreateMeetings\(\)/.test(source)) {
    failures.push(
      `${rel}: opens the create-meeting dialog without reading useCanCreateMeetings(). An ` +
        `External member would be offered an action ValidateMeetingCreation refuses with a 403. ` +
        `Import the helper from @/stores/workspace-store and hide the entry point.`,
    );
  }
}

// ---- Rule 2: the tri-state collapses in one place, and it collapses toward allowed ----------
const store = read(STORE);

if (!/export function useCanCreateMeetings\(\)/.test(store)) {
  failures.push(
    `${STORE}: useCanCreateMeetings must stay exported — it is the single place the null ` +
      `("unknown") case is decided, and every creation surface depends on it.`,
  );
}

if (!/state\.canCreateMeetings !== false/.test(store)) {
  failures.push(
    `${STORE}: useCanCreateMeetings must read \`!== false\`. A truthiness check treats "not ` +
      `loaded yet" as "not allowed" and hides New-meeting from every user on first paint.`,
  );
}

if (!/canCreateMeetings: state\.canCreateMeetings/.test(store)) {
  failures.push(
    `${STORE}: canCreateMeetings must be in partialize. Dropped from the persisted state it ` +
      `resets to null — read as allowed — on every reload.`,
  );
}

// ---- Rule 3: a server-sent `false` survives the hand-off ------------------------------------
const apply = read(APPLY);
if (!/selection\.canCreateMeetings \?\? true/.test(apply)) {
  failures.push(
    `${APPLY}: forward selection.canCreateMeetings with \`?? true\`. With \`|| true\` an explicit ` +
      `false from the server becomes true and the whole gate is inert.`,
  );
}

if (failures.length > 0) {
  console.error("external-member-permissions contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("external-member-permissions contract OK");
