/** /admin/account's tabs, read from `?tab=`. Anything unknown is the profile. Pure, for node:test. */
export const ADMIN_ACCOUNT_TABS = ["profile", "connections"] as const;

export type AdminAccountTab = (typeof ADMIN_ACCOUNT_TABS)[number];

export function parseAdminAccountTab(value: string | null | undefined): AdminAccountTab {
  return (ADMIN_ACCOUNT_TABS as readonly string[]).includes(value ?? "") ? (value as AdminAccountTab) : "profile";
}
