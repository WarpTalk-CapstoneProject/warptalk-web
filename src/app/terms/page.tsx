import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default function TermsPage() {
  return <LegalDocument kind="terms" />;
}
