import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(
  join(root, "src/app/(app)/[workspaceSlug]/settings/plugins/page.tsx"),
  "utf8",
);

const forbidden = [
  "activeWorkspaceId",
  "Public",
  "Personal",
  "const plugins = [",
  "const pluginCatalog = [",
];

for (const token of forbidden) {
  if (page.includes(token)) {
    throw new Error(`Plugins page must not contain '${token}'.`);
  }
}

for (const token of ["useAssistantPlugins", "useInstallAssistantPlugin", "usePluginConnectUrl"]) {
  if (!page.includes(token)) {
    throw new Error(`Plugins page must use API hook '${token}'.`);
  }
}

console.log("Plugin marketplace contract passed.");
