#!/usr/bin/env node
/**
 * Platform-scope WarpBot must stay wired end to end, and must stay apart from the workspace one.
 *
 * WHY THIS EXISTS
 *   The owner report: on /admin the widget said "WarpBot answers about one workspace" and was
 *   dead for a platform admin. The fix is a second conversation STORE (AssistantService's
 *   /assistant/platform/conversations, behind the system-admin policy) answered by read-only
 *   platform admin tools. This repo's defining defect is the complete mechanism wired to nothing,
 *   so the pieces a unit test of any one file cannot see are pinned here, against each other:
 *
 *   1. The widget decides its mode with assistantScopeFor and shows the "Platform" chip and the
 *      suggested prompts in platform mode.
 *   2. A platform turn is created and sent through the PLATFORM hooks, and a workspace turn
 *      through the workspace ones — never one conversation id through the other store.
 *   3. The platform send carries text only. No page context, @mentions, attachments or plugin
 *      switches: each names workspace content.
 *   4. The platform routes are their own, not the workspace routes with an empty workspace id.
 *   5. Answer chips know the "admin" kind the platform worker cites with, or every platform
 *      citation would render as an unlinked "Knowledge base" chip.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
/** Comments quote the forbidden shapes while explaining them; assertions run on code only. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const WIDGET = "src/components/layout/global-chatbot.tsx";
const SCOPE = "src/lib/assistant/assistant-scope.ts";
const ENDPOINTS = "src/lib/api/endpoints.ts";
const SERVICE = "src/services/assistant.service.ts";
const HOOKS = "src/hooks/use-assistant.ts";
const SOURCES = "src/lib/assistant/answer-sources.ts";
const CHIP = "src/components/assistant/answer-sources.tsx";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const widget = code(read(WIDGET));
const scope = code(read(SCOPE));
const endpoints = code(read(ENDPOINTS));
const service = code(read(SERVICE));
const hooks = code(read(HOOKS));
const sources = code(read(SOURCES));
const chip = code(read(CHIP));

// 1. Mode, chip, prompts.
expect(/assistantScopeFor\(\{\s*pathname,\s*isSystemAdmin\s*\}\)/.test(widget),
  `${WIDGET}: the mode must come from assistantScopeFor({ pathname, isSystemAdmin }).`);
expect(/useIsSystemAdmin\(\)/.test(widget) && /usePathname\(\)/.test(widget),
  `${WIDGET}: the mode needs both the route and the platform role.`);
expect(/\{PLATFORM_SCOPE_LABEL\}/.test(widget),
  `${WIDGET}: platform mode must render the "Platform" chip (PLATFORM_SCOPE_LABEL).`);
expect(/PLATFORM_SUGGESTED_PROMPTS\.map\(/.test(widget),
  `${WIDGET}: platform mode must offer PLATFORM_SUGGESTED_PROMPTS.`);
expect(/isSystemAdmin\s*&&\s*isAdminPortalPath\(/.test(scope),
  `${SCOPE}: platform mode must require BOTH the system-admin role and an /admin path.`);
for (const prompt of [
  "Revenue this month vs last",
  "Workspaces running low on credits",
  "Any failing pipeline stages today?",
]) {
  expect(scope.includes(`"${prompt}"`), `${SCOPE}: missing suggested prompt "${prompt}".`);
}

// 2. Each scope through its own hooks.
expect(/composerReadiness\(\{[\s\S]*?scope:\s*assistantScope[\s\S]*?\}\)/.test(widget),
  `${WIDGET}: composerReadiness must be told the scope, or /admin stays blocked on "no workspace".`);
expect(/readiness\.scope === "platform"\s*\?\s*await createPlatformConversation\.mutateAsync\(\)\s*:\s*await createConversation\.mutateAsync\(readiness\.workspaceId\)/.test(widget),
  `${WIDGET}: a platform turn must create a PLATFORM conversation; a workspace turn a workspace one.`);
expect(/if \(platformTurn\) \{\s*await sendPlatformMessage\.mutateAsync\(\{ conversationId: convId, content \}\);/.test(widget),
  `${WIDGET}: a platform turn must be sent through sendPlatformMessage with text only.`);
expect(/usePlatformAssistantConversations\(\s*historyMenuOpen && isPlatformScope/.test(widget),
  `${WIDGET}: platform history must be listed from the platform store, only in platform mode.`);
expect(/useAssistantConversations\(\s*historyMenuOpen && !isPlatformScope \? activeWorkspaceId : null/.test(widget),
  `${WIDGET}: workspace history must never be fetched in platform mode.`);
expect(/isPlatformScope \? loadPlatformConversation : loadConversation/.test(widget),
  `${WIDGET}: reopening a conversation must read the store of the current scope.`);
expect(/lastScopeRef\.current === assistantScope/.test(widget),
  `${WIDGET}: crossing between /admin and a workspace must close the open thread.`);

// 3 + 4. Platform routes and a text-only send.
expect(/conversations:\s*"\/assistant\/platform\/conversations"/.test(endpoints),
  `${ENDPOINTS}: platform conversations must have their own route.`);
const platformService = service.slice(service.indexOf("platform: {"));
expect(platformService.length > 0 && !/API\.assistant\.(conversations|conversation\(|sendMessage\()/.test(platformService.split("\n  },")[0]),
  `${SERVICE}: assistantService.platform must call only API.assistant.platform.* routes.`);
expect(/API\.assistant\.platform\.sendMessage\(conversationId\),\s*\{ content \},/.test(service),
  `${SERVICE}: the platform send body must be { content } and nothing else.`);
expect(/ASSISTANT_KEYS\.platformConversations/.test(hooks) && /platformConversations: \["assistant", "platform", "conversations"\]/.test(hooks),
  `${HOOKS}: the platform list needs its own query key root.`);

// 5. Admin citations.
expect(/"admin",\s*\];/.test(sources) || /KNOWN_KINDS[\s\S]*"admin"/.test(sources),
  `${SOURCES}: KNOWN_KINDS must include "admin" (mirrors SOURCE_KINDS in citations.py).`);
expect(/if \(source\.kind === "admin"\) \{\s*return isAdminPath\(source\.ref\) \? source\.ref : null;/.test(sources),
  `${SOURCES}: an admin chip may link only to a validated /admin path.`);
expect(/admin:\s*ShieldCheck/.test(chip), `${CHIP}: the admin kind needs its icon.`);

if (failures.length) {
  console.error("Platform WarpBot contract FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Platform WarpBot contract: ok");
