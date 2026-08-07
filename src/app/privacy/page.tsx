import type { Metadata } from "next";

import { LegalPlaceholder } from "@/components/legal/legal-placeholder";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <LegalPlaceholder
      title="Privacy policy"
      summary="What WarpTalk collects, how long it keeps it, and what happens to the audio, transcripts, and voice models produced by a meeting."
    />
  );
}
