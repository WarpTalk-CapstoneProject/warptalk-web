import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A participant's own speak/listen choice must outrank any room-level default, and the
 * client must never assert the "auto" sentinel as if it were a decision.
 *
 * The unit tests next door cover the resolver's behaviour. This guards the wiring: that the
 * live meeting session actually ASKS the resolver, with the participant record among its
 * inputs, instead of growing a second inline fallback chain — which is exactly the shape the
 * defect had (`listenLanguageOverride ?? roomDefaultListenLanguage`, with nothing between
 * them and no way for the server's record of the user's choice to get a word in).
 */

const sessionSource = readFileSync(
  new URL("../src/components/rooms/live/persistent-meeting-session.tsx", import.meta.url),
  "utf8",
);
const resolverSource = readFileSync(
  new URL("../src/lib/language/participant-language-preference.ts", import.meta.url),
  "utf8",
);

// ─── The precedence lives in one place, and the session uses it ───

assert.match(
  sessionSource,
  /from "@\/lib\/language\/participant-language-preference"/,
  "The live meeting session must resolve languages through the shared precedence module.",
);
assert.match(
  sessionSource,
  /const sourceLanguage = resolveSpeakLanguage\(languageSources\.speak, room\)/,
  "Speak language must come from resolveSpeakLanguage, not an inline fallback chain.",
);
assert.match(
  sessionSource,
  /const listenLanguage = resolveListenLanguage\(languageSources\.listen, room\)/,
  "Listen language must come from resolveListenLanguage, not an inline fallback chain.",
);

// The regression this ticket exists for: a room default that outranked the user's choice.
assert.doesNotMatch(
  sessionSource,
  /listenLanguageOverride\s*\?\?\s*roomDefaultListenLanguage/,
  "A room default must never sit directly behind the in-session pick — the user's saved " +
    "choice and their server participant record both belong in between.",
);

// ─── The server's participant record is one of the inputs ───

assert.match(
  sessionSource,
  /apiParticipants\.find\(\s*\(participant\) => participant\.userId === currentUserId,?\s*\)/,
  "The session must locate this viewer's own participant row to seed their languages.",
);
assert.match(
  sessionSource,
  /speak: \{[\s\S]{0,200}?participant: myParticipantRecord\?\.speakLanguage,/,
  "The participant record's speakLanguage must be an input to speak-language resolution.",
);
assert.match(
  sessionSource,
  /listen: \{[\s\S]{0,200}?participant: myParticipantRecord\?\.listenLanguage,/,
  "The participant record's listenLanguage must be an input to listen-language resolution.",
);

// Ordering, asserted on the resolver itself: pick, then session storage, then the
// participant row — and only then anything room-level.
for (const resolver of ["resolveListenLanguage", "resolveSpeakLanguage"]) {
  assert.match(
    resolverSource,
    new RegExp(
      `export function ${resolver}\\([\\s\\S]*?firstChoice\\(\\s*sources\\.pick,\\s*sources\\.saved,\\s*sources\\.participant`,
    ),
    `${resolver} must try the in-session pick, then session storage, then the participant ` +
      "record, before any room-level default.",
  );
}

// ─── An in-meeting pick must actually survive into session storage ───

// readMeetingJoinState discards the whole blob unless its roomId matches, so a pick written
// without one is silently lost on the next read and the participant drops a tier.
assert.match(
  sessionSource,
  /JSON\.stringify\(\{ \.\.\.config, \.\.\.patch, roomId \}\)/,
  "An in-meeting language pick must be stamped with roomId, or readMeetingJoinState " +
    "throws it away on the next read.",
);

// ─── "auto" is a fallback, never a choice, and never reaches the gateway ───

assert.match(
  sessionSource,
  /isResolvedSpeakLanguage\(sourceLanguageRef\.current\)\s*\?\s*sourceLanguageRef\.current\s*:\s*""/,
  "JoinTranslationRoom must not send the 'auto' sentinel as a speak language: the hub " +
    "writes it straight into translationRoom:{id}:speak_languages, where it makes " +
    "_language_hint_for_stt return None and lets STT free-run.",
);
assert.doesNotMatch(
  sessionSource,
  /useState<string>\(\s*savedJoinConfig\.speakLanguage[\s\S]{0,120}?"auto",?\s*\)/,
  "Speak language must not default to the 'auto' sentinel — nothing in the UI offers it, " +
    "so it can only ever arrive as a fallback masquerading as a decision.",
);
assert.match(
  resolverSource,
  /if \(!normalized \|\| normalized === UNRESOLVED_LANGUAGE\) return null;/,
  "A stored 'auto' must fall through to the next source rather than terminate the chain.",
);

console.log("Participant language precedence contract: PASS");
