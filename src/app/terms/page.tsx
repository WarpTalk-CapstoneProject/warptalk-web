import type { Metadata } from "next";

import { LegalPlaceholder } from "@/components/legal/legal-placeholder";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default function TermsPage() {
  return (
    <LegalPlaceholder
      title="Terms of use"
      summary="The terms that will govern your use of WarpTalk — accounts, workspaces, meetings, and the translation and voice features."
    />
  );
}
