import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "@/i18n/locale";

/**
 * Namespaces available in `messages/{locale}/*.json`. Add a file here as a
 * page/feature area gets migrated onto the translation catalog — see
 * `.agents/page-docs/i18n-localization.md` for the full workflow.
 */
const NAMESPACES = ["common", "auth", "landing", "legal", "validation"] as const;

async function loadMessages(locale: string) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const mod = await import(`../../messages/${locale}/${namespace}.json`);
      return [namespace, mod.default] as const;
    })
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: await loadMessages(locale),
  };
});
