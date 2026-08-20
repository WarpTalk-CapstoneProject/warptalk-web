import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

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
  assert.equal(png.readUInt32BE(16), 760, `unexpected width: ${asset}`);
  assert.equal(png.readUInt32BE(20), 760, `unexpected height: ${asset}`);

  // THE BUG THIS FILE NOW CATCHES.
  //
  // These shipped once as colour type 2 — RGB, no alpha — flattened onto a (247,247,248)
  // matte. Nothing failed: they were valid PNGs of the right size, and the component leaned on
  // `mix-blend-multiply` to hide the matte, which only works against pure white. On this
  // surface every illustration sat in a visible grey square.
  //
  // Byte 25 of a PNG is the IHDR colour type. 6 is RGBA, 4 is greyscale+alpha; anything else
  // has no alpha channel and cannot sit on a coloured surface without a box around it.
  const colourType = png.readUInt8(25);
  assert.ok(
    colourType === 6 || colourType === 4,
    `${asset} has no alpha channel (PNG colour type ${colourType}) — it will render as a ` +
      `rectangle of its export matte, not as artwork`,
  );

  const { data: rgba, info: rgbaInfo } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cornerAlpha = [
    rgba[3],
    rgba[(rgbaInfo.width - 1) * 4 + 3],
    rgba[(rgbaInfo.height - 1) * rgbaInfo.width * 4 + 3],
    rgba[(rgbaInfo.width * rgbaInfo.height - 1) * 4 + 3],
  ];
  assert.ok(
    cornerAlpha.every((alpha) => alpha === 0),
    `${asset} has an alpha channel but its canvas background is still opaque`,
  );

  // Size is a design decision, not an accident: displayed at 280–380 CSS px, so 760 covers a
  // 2x screen and nothing more. The first version was 1254px and ~1MB each, 8.1MB of repo.
  assert.ok(
    info.size < 600 * 1024,
    `${asset} is ${Math.round(info.size / 1024)}KB — over the 600KB an empty-state drawing needs`,
  );
}

const component = await readFile(
  path.join(root, "src/components/workspace/page-placeholder.tsx"),
  "utf8",
);

assert.match(component, /import Image from "next\/image"/);
assert.match(component, /alt=""/);
assert.match(component, /aria-hidden="true"/);
assert.match(component, /PLACEHOLDER_ASSETS/);
assert.match(component, /width=\{760\}/);
assert.match(component, /height=\{760\}/);
assert.doesNotMatch(component, /<h1/);

// The blend mode was a workaround for the missing alpha channel. With real transparency it is
// not merely redundant — it darkens whatever the illustration is laid over.
//
// Checked against the className attributes rather than the whole file: the comment in that
// component names the class it removed, and explaining a mistake must not count as making it.
const classNames = [...component.matchAll(/className=\{?"([^"]*)"/g)].map((m) => m[1]);
assert.ok(
  classNames.every((value) => !value.includes("mix-blend")),
  "page-placeholder must not use a blend mode: the PNGs carry real alpha now",
);

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
