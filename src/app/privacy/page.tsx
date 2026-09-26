import type { Metadata } from "next";

import { LegalDraft } from "@/components/legal/legal-draft";
import {
  PRIVACY_LAST_UPDATED_NOTE,
  PRIVACY_REVIEW_NOTES,
  PRIVACY_SECTIONS,
} from "@/content/legal/privacy-draft";

export const metadata: Metadata = {
  title: "Privacy policy (draft)",
};

// WT-835: draft content pending @Tú's review — see legal-draft.tsx for the ground rules.
export default function PrivacyPage() {
  return (
    <LegalDraft
      title="Privacy policy"
      lastUpdatedNote={PRIVACY_LAST_UPDATED_NOTE}
      sections={PRIVACY_SECTIONS}
      reviewNotes={PRIVACY_REVIEW_NOTES}
    />
  );
}
