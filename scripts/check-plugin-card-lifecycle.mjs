// The two in-chat plugin cards are turn-scoped, and nothing but a user click used to say so.
// A Connect card that outlives its turn is not cosmetic: it sits under a successful answer, it
// survives New chat, and pressing it there opens an OAuth flow the current turn never asked for.
// The two cards could also stack, one per error code, even though "press Connect" and "no button
// will help" cannot both be true of the same failure.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "src/components/layout/global-chatbot.tsx"), "utf8");

function assertIncludes(token, message) {
  if (!source.includes(token)) throw new Error(message);
}

assertIncludes(
  "const clearPluginCards = useCallback(",
  "global-chatbot must clear both plugin cards from one place.",
);

// Turn boundaries: start, success, failure — plus both ways of changing conversation.
const clearCalls = source.match(/clearPluginCards\(\)/g) ?? [];
if (clearCalls.length < 5) {
  throw new Error(
    `Plugin cards must be cleared on every turn and conversation boundary; found ${clearCalls.length} clearPluginCards() calls, expected at least 5.`,
  );
}

// Exclusivity is enforced, not assumed of the worker: one payload carrying both keys must not
// render both cards, and the operator-setup card is the one that wins.
assertIncludes(
  "if (pluginSetup) {",
  "The operator-setup card must be chosen explicitly, not set unconditionally.",
);
assertIncludes(
  "} else if (pluginConnection) {",
  "The connect card must be the else branch of the operator-setup card, so the two cannot both render.",
);

console.log("Plugin card lifecycle contract passed.");
