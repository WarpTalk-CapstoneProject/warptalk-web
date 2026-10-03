"use client";

/**
 * /admin/account — the staff member's own account, inside the admin portal (3 Oct 2026).
 *
 * The portal had thirty pages about the platform and none about the person using it: no profile,
 * and no way to connect a plugin for their own account - so the platform WarpBot, which runs with
 * no workspace, could not use one at all. Two tabs in the URL (`?tab=profile|connections`):
 *
 *   - Profile: the same form as a member's account settings, without the "workspace access"
 *     section - staff are here as staff, not as a member of whichever workspace was last open.
 *   - My connections: the member Plugins page in its `personal` mode, so nothing is read from or
 *     sent with a workspace. What is connected here is what the platform WarpBot offers.
 */

import { IdentificationCard } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { AdminFilterTabs, AdminPage, AdminPageHeader, type AdminTab } from "@/components/admin/admin-page-chrome";
import { PluginsPageView } from "@/components/assistant/plugins/plugins-page";
import { AccountProfileSettings } from "@/components/features/settings/account-profile-settings";
import { parseAdminAccountTab, type AdminAccountTab } from "@/lib/admin/account-tabs";

export function AdminAccountSettings() {
  const t = useTranslations("adminAccount");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseAdminAccountTab(searchParams.get("tab"));

  const setTab = useCallback(
    (next: AdminAccountTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "profile") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const tabs = useMemo<AdminTab<AdminAccountTab>[]>(
    () => [
      { value: "profile", label: t("tabs.profile") },
      { value: "connections", label: t("tabs.connections") },
    ],
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<IdentificationCard size={14} weight="fill" />}
        title={t("title")}
        description={tab === "connections" ? t("connectionsDescription") : t("description")}
      />
      <AdminFilterTabs tabs={tabs} value={tab} onChange={setTab} label={t("tabsLabel")} />
      <div className="mt-5">
        {tab === "connections" ? <PluginsPageView personal /> : <AccountProfileSettings showWorkspaceAccess={false} />}
      </div>
    </AdminPage>
  );
}
