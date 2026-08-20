import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "public/assets/illustrations/page-placeholders");

const assets = [
  "meetings.png",
  "documents-knowledge.png",
  "glossary.png",
  "members.png",
  "tasks.png",
  "voice-profiles.png",
  "billing.png",
  "no-results.png",
];

for (const asset of assets) {
  const fullPath = path.join(assetRoot, asset);
  const info = await stat(fullPath).catch(() => null);
  assert.ok(info?.isFile(), `missing page placeholder asset: ${asset}`);

  const png = await readFile(fullPath);
  assert.equal(png.readUInt32BE(16), 1254, `unexpected width: ${asset}`);
  assert.equal(png.readUInt32BE(20), 1254, `unexpected height: ${asset}`);
}

const component = await readFile(
  path.join(root, "src/components/workspace/page-placeholder.tsx"),
  "utf8",
);

assert.match(component, /import Image from "next\/image"/);
assert.match(component, /alt=""/);
assert.match(component, /aria-hidden="true"/);
assert.match(component, /PLACEHOLDER_ASSETS/);
assert.match(component, /width=\{1254\}/);
assert.match(component, /height=\{1254\}/);
assert.doesNotMatch(component, /<h1/);

const expectedKinds = [
  "meetings",
  "schedules",
  "history",
  "documents",
  "knowledge",
  "glossary",
  "members",
  "tasks",
  "voice-profiles",
  "billing",
  "no-results",
];
for (const kind of expectedKinds) {
  assert.match(component, new RegExp(`\\b${kind.replace("-", "\\-")}\\b`));
}

assert.match(component, /schedules: PRIMARY_PLACEHOLDER_ASSETS\.meetings/);
assert.match(component, /history: PRIMARY_PLACEHOLDER_ASSETS\.meetings/);
assert.match(component, /knowledge: PRIMARY_PLACEHOLDER_ASSETS\.documents/);

console.log("Page placeholder assets and accessible rendering contract passed.");
