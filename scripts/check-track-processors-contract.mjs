import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hook = await readFile(
  new URL("../src/hooks/use-track-processors.ts", import.meta.url),
  "utf8",
);
const roomPage = await readFile(
  new URL("../src/app/(app)/room/[id]/page.tsx", import.meta.url),
  "utf8",
);

assert.match(hook, /onNoiseSuppressionError\?: \(error: unknown\) => void/);
assert.match(hook, /await localAudioTrack\.setProcessor\(krispRef\.current\)/);
assert.match(hook, /onNoiseSuppressionError\?\.\(error\)/);
assert.match(roomPage, /onNoiseSuppressionError=\{handleNoiseSuppressionError\}/);
assert.match(roomPage, /setNoiseSuppressionEnabled\(false\)/);
assert.match(roomPage, /Browser noise suppression remains enabled/);

console.log("Track processor fallback contract passed.");
