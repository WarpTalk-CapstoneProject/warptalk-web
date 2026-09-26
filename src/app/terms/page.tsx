import type { Metadata } from "next";

import { LegalDraft } from "@/components/legal/legal-draft";
import {
  TERMS_LAST_UPDATED_NOTE,
  TERMS_REVIEW_NOTES,
  TERMS_SECTIONS,
} from "@/content/legal/terms-draft";

export const metadata: Metadata = {
  title: "Terms of use (draft)",
};

// WT-836: draft content pending @Tú's review — see legal-draft.tsx for the ground rules.
export default function TermsPage() {
  return (
    <LegalDraft
      title="Terms of use"
      lastUpdatedNote={TERMS_LAST_UPDATED_NOTE}
      sections={TERMS_SECTIONS}
      reviewNotes={TERMS_REVIEW_NOTES}
    />
  );
}
