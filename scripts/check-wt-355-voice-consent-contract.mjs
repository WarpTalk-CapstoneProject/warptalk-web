import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [page, service, types] = await Promise.all([
  read("src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx"),
  read("src/services/voice-profile.service.ts"),
  read("src/types/voice-profile.ts"),
]);

const consentFields = [
  "ownVoiceConfirmed",
  "aiUseConfirmed",
  "syntheticVoiceAcknowledged",
  "noImpersonationConfirmed",
  "retentionAcknowledged",
];

const checks = [
  ["WT-355 page uses Add voice profile entry copy", page.includes("Add voice profile")],
  ["WT-355 page uses Set up voice profile modal title", page.includes("Set up voice profile")],
  ["WT-355 page renders consent agreement section", page.includes("Voice consent agreement")],
  ["WT-355 page uses Agree & save voice profile CTA", page.includes("Agree & save voice profile")],
  ["WT-355 page uses Complete consent to continue helper", page.includes("Complete consent to continue")],
  ["WT-355 page uses delete-profile retention acknowledgement", page.includes("I understand I can delete this voice profile later.")],
  ["WT-355 page imports Checkbox component", page.includes("@/components/ui/checkbox")],
  [
    "WT-355 service appends every consent field to FormData",
    consentFields.every((field) => service.includes(`formData.append("${field}"`)),
  ],
  [
    "WT-355 type exposes every consent field",
    consentFields.every((field) => types.includes(`${field}: boolean`)),
  ],
  [
    "WT-355 type exposes consent response metadata",
    ["consentStatus?", "consentTextVersion?", "consentGrantedAt?"].every((field) =>
      types.includes(field),
    ),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) process.exitCode = 1;
