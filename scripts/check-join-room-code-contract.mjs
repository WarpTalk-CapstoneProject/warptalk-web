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
assert.match(
  joinPage,
  /const \[roomCode, setRoomCode\] = useState/,
  "Join page must keep the room code in editable state, not a URL-only constant.",
);
assert.match(
  joinPage,
  /<Input[\s\S]{0,200}value=\{roomCode\}[\s\S]{0,200}onChange=\{\(event\) => setRoomCode\(event\.target\.value\)\}/,
  "Join page must render an input the user can type a room code into.",
);

console.log("Join room-code input contract: PASS");
