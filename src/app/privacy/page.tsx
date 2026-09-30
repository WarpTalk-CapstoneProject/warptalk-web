import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return <LegalDocument kind="privacy" />;
}
