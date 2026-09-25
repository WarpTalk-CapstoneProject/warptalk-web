import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "@/i18n/locale";
import { DEFAULT_LOCALE } from "@/i18n/locale-constants";
import {
  getMessageFallback,
  mergeWithFallback,
  onIntlError,
  type Messages,
} from "@/i18n/message-fallback";

/**
 * Namespaces available in `messages/{locale}/*.json`. Add a file here as a
 * page/feature area gets migrated onto the translation catalog — see
 * `.agents/page-docs/i18n-localization.md` for the full workflow.
 */
const NAMESPACES = [
  "common",
  "auth",
  "landing",
  "legal",
  "validation",
  "home",
  "dashboard",
  "tasks",
  "voiceProfiles",
  "knowledge",
  "aiChat",
  "glossary",
  "documents",
  "settingsWorkspace",
  "settingsSecurity",
  "settingsMemberRoles",
  "settingsFeatures",
  "settingsPluginActivity",
  "settingsAuditLog",
  "settingsSessions",
  "settingsPreferences",
  "settingsProfile",
  "settingsNotifications",
  "settingsConnectedAccounts",
  "rooms",
  "artifacts",
  "members",
  "pluginsPage",
  "workspacePlugins",
  "schedules",
  "settingsBilling",
  "settingsBillingUsage",
  "settingsBillingInvoices",
  "adminChrome",
  "adminMisc",
  "adminOps",
  "adminWorkspaces",
  "adminUsers",
  "adminSubscriptions",
  "adminAnnouncements",
  "adminCms",
  "adminPlansSettings",
  "adminGlobalGlossary",
  "adminPlugins",
  "adminBillingLedger",
  "adminLists",
  "adminStaff",
  "adminProviders",
  "download",
] as const;

async function loadMessages(locale: string): Promise<Messages> {
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
  const localeMessages = await loadMessages(locale);
  // English is the source of truth: a key forgotten in vi/ja renders in English
  // rather than as its key path.
  const messages =
    locale === DEFAULT_LOCALE
      ? localeMessages
      : mergeWithFallback(await loadMessages(DEFAULT_LOCALE), localeMessages);
  return {
    locale,
    messages,
    getMessageFallback,
    onError: onIntlError,
  };
});
