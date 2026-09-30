import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPlaceholder } from "@/components/legal/legal-placeholder";

export const metadata: Metadata = {
  title: "Terms of use",
};

export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  return <LegalPlaceholder title={t("title")} summary={t("summary")} />;
}
