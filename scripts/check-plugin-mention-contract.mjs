import { readFileSync } from "node:fs";
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

const tiles = read("src/lib/assistant/plugin-tiles.ts");
assertIncludes(
  tiles,
  "export function toDisplayTiles",
  "plugin-tiles.ts must export toDisplayTiles.",
);
assertIncludes(
  tiles,
  "tool.resourceKey",
  "toDisplayTiles must group by tool.resourceKey, not a hardcoded provider/tool name.",
);
assertIncludes(
  tiles,
  "groups.size < 2",
  "toDisplayTiles must fall back to a single tile when there is not more than one resource group.",
);
assertIncludes(
  tiles,
  "tileId: `${plugin.key}:${resourceKey}`",
  "A split tile's id must stay derived from the real plugin key plus its resource key.",
);
assertNotIncludes(
  tiles,
  '"google_workspace"',
  "Tile splitting must stay data-driven off resourceKey, not hardcode a plugin key.",
);

const globalWidget = read("src/components/layout/global-chatbot.tsx");
assertIncludes(
  globalWidget,
  "toDisplayTiles",
  "Global WarpBot widget must build its plugin tiles through the shared toDisplayTiles helper.",
);
assertIncludes(
  globalWidget,
  'connectionStatus === "connected"',
  "Global WarpBot widget must only offer a plugin as @mentionable once it is actually connected.",
);
assertIncludes(
  globalWidget,
  'entityType: "plugin"',
  "Global WarpBot widget must send entityType: \"plugin\" for a plugin mention.",
);
assertIncludes(
  globalWidget,
  "entityId: plugin.tileId",
  "A plugin mention's entityId must be the tile id, not the raw catalog key, so a split tile names its own resource.",
);

const assistantTypes = read("src/types/assistant.ts");
assertIncludes(
  assistantTypes,
  '"room" | "document" | "member" | "plugin"',
  "AssistantMentionDto.entityType must include \"plugin\".",
);

console.log("Plugin mention contract passed.");
