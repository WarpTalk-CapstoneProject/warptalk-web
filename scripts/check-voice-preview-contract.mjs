#!/usr/bin/env node
/**
 * A voice you can hear before a meeting, and the four ways that quietly stops working.
 *
 * WHY THIS CHECK EXISTS
 *
 * Every previous failure on this feature's neighbours was the same shape: the code was written,
 * it was correct, and nothing called it. An uploaded recording was listed as an active profile
 * while the pipeline never read the choice (WT-396). A merged voice picker shipped and was
 * unreachable. A workspace glossary was built end to end and deleted for having no door.
 *
 * The preview is the same shape of thing — a component, a service call, and two surfaces that
 * have to keep referencing it — so it is checked the same way.
 *
 * The fourth assertion is not a wiring one and is the least obvious. The endpoint answers with
 * WAV bytes, and axios will happily decode a binary body as UTF-8 text unless it is told not to.
 * Dropping `responseType: "blob"` does not fail: it returns a corrupted string that becomes a
 * Blob nothing can decode, so the button spins, "plays", and is silent. That is indistinguishable
 * from the provider having refused, which is the exact confusion this feature exists to end.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

/** 1. The button itself. */
const BUTTON = "src/components/voice/voice-preview-button.tsx";
const button = read(BUTTON);
if (!button) {
  failures.push(`${BUTTON} is missing — nothing can offer a preview without it.`);
}

/** 2. The service call behind it, and the response type that makes the bytes survive. */
const SERVICE = "src/services/voice-profile.service.ts";
const service = read(SERVICE);
if (!service) {
  failures.push(`${SERVICE} is missing.`);
} else {
  if (!service.includes("API.voiceProfiles.preview")) {
    failures.push(
      `${SERVICE} no longer calls API.voiceProfiles.preview. The button would have no endpoint ` +
        `to reach.`,
    );
  }
  if (!/responseType:\s*"blob"/.test(service)) {
    failures.push(
      `The preview request does not ask for responseType: "blob". axios decodes the WAV body as ` +
        `text without it, so the button plays silence instead of the voice — and silence is what ` +
        `a refused render looks like too.`,
    );
  }
}

/** 3. The endpoint it points at. */
const ENDPOINTS = "src/lib/api/endpoints.ts";
const endpoints = read(ENDPOINTS);
if (!endpoints) {
  failures.push(`${ENDPOINTS} is missing.`);
} else if (!endpoints.includes("/auth/voice-profiles/preview")) {
  failures.push(
    `${ENDPOINTS} no longer defines the voice preview route. The backend endpoint would still ` +
      `exist and nothing would call it.`,
  );
}

/** 4. Both doors. A component nothing renders is the failure this file is modelled on. */
const SURFACES = [
  [
    "src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx",
    "the voice profile list — where somebody checks an uploaded recording before trusting it",
  ],
  [
    "src/components/voice/my-dub-voice-picker.tsx",
    "the dub-voice picker — where somebody decides how they will sound",
  ],
];

for (const [path, why] of SURFACES) {
  const source = read(path);
  if (!source) {
    failures.push(`${path} is missing.`);
    continue;
  }
  if (!source.includes("VoicePreviewButton")) {
    failures.push(
      `${path} no longer renders VoicePreviewButton, so ${why} has no way to hear anything.`,
    );
  }
}

if (failures.length > 0) {
  console.error("FAIL voice preview contract\n");
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}

console.log("PASS voice preview button, its service, its endpoint and both surfaces agree");
