import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const joinPagePath = path.join(root, "src/app/(app)/join/page.tsx");

assert.ok(
  fs.existsSync(joinPagePath),
  "Join page must exist so users can join a translation room by code.",
);

const joinPage = fs.readFileSync(joinPagePath, "utf8");

// WT-172 #3: the join page previously only read the room code from the
// `?code=` URL param with no way to type one in, so navigating there via
// "Join by code" (no query string) made it impossible to ever join.
// WT-368 — the code must come FROM the URL, and be overridable BY typing.
//
// This previously pinned `useState(searchParams.get("code") ?? "")`, which reads as correct and
// is not: /join is statically rendered, so useSearchParams() is empty during the render the
// initialiser runs in, and useState ignores every later value. The contract was pinning the
// shape of the bug. It now pins the two properties that actually matter.
assert.match(
  joinPage,
  /const codeFromUrl = searchParams\.get\("code"\)/,
  "Join page must read the room code from the ?code query parameter.",
);
assert.match(
  joinPage,
  /const roomCode = typedCode \?\? codeFromUrl/,
  "The room code must be derived from the URL until the user types, not captured once at mount.",
);
assert.match(
  joinPage,
  /<Input[\s\S]{0,300}value=\{roomCode\}[\s\S]{0,300}onChange=\{\(event\) => setTypedCode\(event\.target\.value\)\}/,
  "Join page must render an input the user can type a room code into, taking ownership from the URL.",
);

console.log("Join room-code input contract: PASS");
