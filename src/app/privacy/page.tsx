import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPlaceholder } from "@/components/legal/legal-placeholder";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  return <LegalPlaceholder title={t("title")} summary={t("summary")} />;
}
