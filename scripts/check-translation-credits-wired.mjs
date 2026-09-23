import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// WT-699 / TC3705: translation used to keep running at zero credits, and once it was made to stop
// it stopped silently. The meeting must (1) listen for the relay's two events and say why, and
// (2) show the server's own refusal when Start Translation is refused, not "status code 403".
const root = path.resolve(import.meta.dirname, "..");
const liveRoom = fs.readFileSync(
  path.join(root, "src/components/rooms/live/persistent-meeting-session.tsx"),
  "utf8",
);

assert.match(
  liveRoom,
  /connection\.on\("TranslationCreditsExhausted",[\s\S]{0,200}?translationSuspendedNotice\(reason\)/,
  "The meeting must tell everyone why translation stopped when the workspace cannot pay for it.",
);
assert.match(
  liveRoom,
  /connection\.on\("TranslationCreditsRestored"/,
  "The meeting must say when translation is available again.",
);
assert.match(
  liveRoom,
  /async function handleStartWarptalk\(\)[\s\S]*?toast\.error\(getErrorMessage\(error, "Failed to start translation\."\)\)/,
  "A refused Start Translation must show the server's reason, not the HTTP status line.",
);

console.log("Translation credits wiring contract: PASS");
