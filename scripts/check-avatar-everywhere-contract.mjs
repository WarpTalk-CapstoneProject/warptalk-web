#!/usr/bin/env node
/**
 * A face uploaded once shows up everywhere.
 *
 * WHY THIS EXISTS
 *   `user.avatarUrl` holds an absolute URL for a Google-hosted picture and a RELATIVE path for one
 *   uploaded here. Handed straight to an <img> the relative one resolves against the PAGE origin —
 *   the web app — while the API is on another host. It 404s and the fallback initials take over.
 *
 *   Nine components render a face. Exactly one of them called `resolveAvatarUrl`. So everybody
 *   with a Google picture had an avatar (absolute, so it worked by accident) and everybody who
 *   uploaded one saw initials on every screen except their own profile page: the sidebar account
 *   card, the members list, the rooms list, documents, and every tile in a meeting.
 *
 *   `avatar-url.ts` even carried a comment saying the resolving happened "once, here, rather than
 *   in each of the seven places that put a face on screen". It was describing an intention, not
 *   the code.
 *
 * THE RULE
 *   The resolution happens inside `AvatarImage`. Not at the call sites — that is the arrangement
 *   that failed, and it fails silently and only for a subset of users, which is the worst way for
 *   something to be wrong. A new surface that renders a face is then correct without its author
 *   having to know any of this.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const primitive = read("src/components/ui/avatar.tsx");

// 1. The primitive resolves, and does it to the src it forwards.
assert.ok(
  primitive.includes("resolveAvatarUrl"),
  "AvatarImage must resolve its src through resolveAvatarUrl. Without it an uploaded avatar is a"
    + " relative path resolved against the web app's own origin, which 404s.",
);
assert.ok(
  /src=\{[^}]*resolveAvatarUrl\(src\)[^}]*\}/.test(primitive),
  "The resolution must be applied to the src that is forwarded to the primitive — importing it and"
    + " not using it on src is the same bug with an import above it.",
);

// 2. Nobody bypasses the primitive with a raw <img>.
const componentFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(tsx|jsx)$/.test(entry.name)) componentFiles.push(rel);
  }
};
walk("src");

const bypasses = componentFiles.filter((file) => {
  if (file.endsWith(path.join("ui", "avatar.tsx"))) return false;
  const text = read(file);
  // A bare <img> whose src mentions an avatar. The primitive is the only thing that should put an
  // avatar value into an image element.
  return /<img[^>]{0,200}src=\{[^}]{0,120}[aA]vatar/.test(text);
});

assert.deepEqual(
  bypasses,
  [],
  `These render an avatar through a raw <img> instead of AvatarImage, so the resolution never runs`
    + ` for them: ${bypasses.join(", ")}`,
);

// 3. The rule is worth having: several components do render faces, and none of them should need to
// know about any of this.
const renderers = componentFiles.filter(
  (file) => !file.endsWith(path.join("ui", "avatar.tsx")) && read(file).includes("<AvatarImage"),
);
assert.ok(
  renderers.length >= 5,
  `Expected several components to render AvatarImage; found ${renderers.length}. If this dropped,`
    + " check whether faces moved to something that does not resolve the URL.",
);

// 4. In a meeting, the face comes from the identity join — the participants API carries no avatar
// at all, so a tile reading participant.avatarUrl gets undefined and shows a monogram forever.
const meetingAvatar = read("src/components/rooms/live/participant-avatar.tsx");
assert.ok(
  meetingAvatar.includes("identity.avatarUrl"),
  "The meeting tile must take its face from the resolved identity, never from the participant DTO,"
    + " which has no avatar field on the server at all.",
);

// 5. THE SURFACES THEMSELVES.
//
// The bypass check above looks for a raw <img>, and the real failure mode was quieter than that:
// a component that draws a monogram in a circle and has NO code path to a picture at all. The
// room detail page had an `AvatarInitial` that rendered `user.name.charAt(0)` while its own type
// declared `avatarUrl`, and the meeting chat drew two letters in a square. Neither is an <img>,
// so neither tripped anything — they just quietly showed a letter to everyone forever.
//
// Every surface a person appears on is named here, with what it must reach for.
// The needles are CALL sites — `<Name`, not `Name`. A component that is defined and never
// rendered still contains its own name, and an earlier version of this check passed against
// exactly that: the chat's face component survived with its usage deleted.
const FACE_SURFACES = [
  ["src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx", "<PersonAvatar", "the room record's people chips"],
  ["src/components/rooms/live/chat-panel.tsx", "<ChatSenderAvatar", "a chat message's sender"],
  ["src/components/rooms/live/side-panel/transcript-panel.tsx", "<ParticipantAvatar", "the live transcript"],
  ["src/components/rooms/live/live-subtitle-overlay.tsx", "<ParticipantAvatar", "the subtitle lane"],
  ["src/components/rooms/transcript-speaker-avatar.tsx", "<AvatarImage", "the saved transcript"],
];

for (const [file, needle, what] of FACE_SURFACES) {
  assert.ok(
    read(file).includes(needle),
    `${what} must show a real face — ${file} no longer reaches for ${needle}. A monogram with no`
      + " path to a picture is what this contract exists to stop; it is not an <img>, so nothing"
      + " else will notice.",
  );
}

// The room record must take the face from the member list. participant.avatarUrl has never been
// populated by the server — reaching for it looks right, type-checks, and is always undefined.
const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
assert.ok(
  roomDetail.includes("resolveUserAvatar("),
  "The room record must resolve faces from the workspace member list, not from the participant DTO.",
);
assert.ok(
  !/avatarUrl: participant\.avatarUrl/.test(roomDetail),
  "participant.avatarUrl is a phantom — the participants API returns no avatar at all, so this"
    + " reads as 'this person has no picture' for everybody.",
);

console.log("Avatar everywhere contract: PASS");
