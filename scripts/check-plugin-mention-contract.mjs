/**
 * WHAT THIS GUARDS
 *
 *   A plugin is offered in two places — the Plugins settings page and WarpBot's Skills menu /
 *   @mention picker — and they read the same catalog. The regression this was written against is
 *   the two of them disagreeing: one showing a plugin the other does not, or one calling a plugin
 *   usable while the other does not, because each grew its own copy of the derivation.
 *
 *   It was originally written when the catalog shipped a single `google_workspace` row that the
 *   frontend split into a Drive tile and a Calendar tile off `tool.resourceKey`, so it asserted
 *   the split was data-driven, that both surfaces went through the one shared `toDisplayTiles`
 *   helper, and that a mention's entityId was the tile id.
 *
 *   WT-646 removed the split: the catalog now ships `google_drive`, `google_calendar` and
 *   `google_meet` as three real rows, and the `resourceKey` fields are gone from the data. The
 *   assertions about *how* a row is split therefore have nothing left to describe. Everything
 *   they were protecting does still exist, in a new shape, and is asserted below:
 *
 *     - one shared derivation, imported by both surfaces (was toDisplayTiles, now
 *       withEffectiveConnectionStatus) — the actual drift guard;
 *     - identity derived from the catalog, never invented by the frontend (was
 *       `${plugin.key}:${resourceKey}`, now `plugin.key` itself);
 *     - no plugin-specific branching in shared code (unchanged, and now cheaper to violate:
 *       three Google rows is exactly the shape that tempts a hardcoded key);
 *     - only a plugin that is genuinely usable is @mentionable — which is why the scope check
 *       survived the split's removal, see plugin-connection.ts;
 *     - the split cannot quietly come back.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertIncludes(source, token, message) {
  if (!source.includes(token)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, token, message) {
  if (source.includes(token)) {
    throw new Error(message);
  }
}

const SHARED_HELPER = "src/lib/assistant/plugin-connection.ts";
const PLUGINS_PAGE = "src/components/assistant/plugins/plugins-page.tsx";
const GLOBAL_WIDGET = "src/components/layout/global-chatbot.tsx";

const connection = read(SHARED_HELPER);
assertIncludes(
  connection,
  "export function withEffectiveConnectionStatus",
  `${SHARED_HELPER} must export withEffectiveConnectionStatus — the one derivation both plugin surfaces read the catalog through.`,
);
assertIncludes(
  connection,
  "plugin.requiredScopes, plugin.grantedScopes",
  "The effective status must be decided by comparing the plugin's own requiredScopes against the connection's grantedScopes, not by trusting connectionStatus alone.",
);
// A quoted key, not the bare word: the file's own comment names the three rows it exists for.
for (const literal of ['"google_', "'google_"]) {
  assertNotIncludes(
    connection,
    literal,
    "The shared plugin derivation must stay data-driven off the catalog row, not hardcode a plugin key.",
  );
}

// The split is gone. These tokens coming back means a surface has started inventing plugin
// identities again, which is what let the two surfaces disagree in the first place.
if (existsSync(join(root, "src/lib/assistant/plugin-tiles.ts"))) {
  throw new Error(
    "plugin-tiles.ts is back. The catalog ships one row per product now; a display-time split re-introduces ids no backend call accepts.",
  );
}

for (const relativePath of [PLUGINS_PAGE, GLOBAL_WIDGET]) {
  const source = read(relativePath);

  assertIncludes(
    source,
    "withEffectiveConnectionStatus",
    `${relativePath} must read the catalog through the shared withEffectiveConnectionStatus helper, so the two plugin surfaces cannot disagree about which plugins are usable.`,
  );

  // Sharing the derivation is only half of it, and it was the half this file used to check. The
  // two surfaces also have to read the same LISTING: useAssistantPlugins() with no workspace is a
  // different query key AND a different response, because the API annotates rows with that
  // workspace's refusal and has nothing to annotate them with when no workspace is named. The
  // Skills menu called it unscoped, so a workspace with plugins switched off still had them
  // offered there — and install and connect from that menu went through unscoped too, which on
  // the backend meant no policy at all.
  if (!/useAssistantPlugins\(\s*\w/.test(source)) {
    throw new Error(
      `${relativePath} calls useAssistantPlugins() without a workspace. Both plugin surfaces must read the workspace-scoped catalog, or one of them shows rows the other has blocked.`,
    );
  }

  for (const token of ["tileId", "toDisplayTiles", "resourceKey"]) {
    assertNotIncludes(
      source,
      token,
      `${relativePath} must not reintroduce the per-resource tile split ('${token}'): every plugin identity has to be a real catalog key that install/connect/disconnect accepts.`,
    );
  }
}

const globalWidget = read(GLOBAL_WIDGET);
assertIncludes(
  globalWidget,
  'connectionStatus === "connected"',
  "Global WarpBot widget must only offer a plugin as @mentionable once it is actually connected.",
);
assertIncludes(
  globalWidget,
  'entityType: "plugin"',
  'Global WarpBot widget must send entityType: "plugin" for a plugin mention.',
);
assertIncludes(
  globalWidget,
  "entityId: plugin.key",
  "A plugin mention's entityId must be the real catalog key, so the backend can resolve the mention to an installed plugin.",
);

const assistantTypes = read("src/types/assistant.ts");
assertIncludes(
  assistantTypes,
  '"room" | "document" | "member" | "plugin"',
  'AssistantMentionDto.entityType must include "plugin".',
);
for (const token of ["resourceKey", "resourceLabel", "resourceAvatarUrl"]) {
  assertNotIncludes(
    assistantTypes,
    token,
    `McpToolDescriptorDto must not carry '${token}': the backend stopped sending it when google_workspace was split into three catalog rows, so declaring it invites code that reads undefined.`,
  );
}

console.log("Plugin mention contract passed.");
