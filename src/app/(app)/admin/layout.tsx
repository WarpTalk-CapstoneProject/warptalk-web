"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKey, ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { canViewAdminPath, firstViewableAdminHref } from "@/lib/admin/staff-permissions";

/**
 * The platform-admin portal's gate (G10).
 *
 * Two questions, in order. The token's "admin" role says whether this person is platform staff
 * at all — it is only a hint, but it is available before anything loads and it keeps ordinary
 * users from ever calling the staff-access endpoint. Then the live answer from the auth service
 * says what they may see: a Support agent opening /admin/plans gets a "not in your role" panel,
 * not a page of 403s.
 *
 * Neither is the boundary. Every endpoint these pages call checks the permission on the server.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isSystemAdmin = useIsSystemAdmin();
  const pathname = usePathname() ?? "/admin";
  const { access, isLoading } = useStaffAccess();
  const t = useTranslations("adminStaff.gate");

  if (!isSystemAdmin || (!isLoading && !access.isStaff)) {
    // Same ground as every other admin surface. The panel is told apart by its border and
    // shadow, not by sitting on a darker field — which is how the rest of the product raises a
    // card.
    return (
      <div className="grid min-h-full place-items-center bg-panel px-6 py-12">
        <div className="max-w-md rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldWarning size={24} weight="duotone" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
            Access denied
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            This portal is restricted to WarpTalk platform administrators.
          </p>
        </div>
      </div>
    );
  }

  // Until the first answer arrives, paint the page's own ground rather than either verdict.
  if (isLoading) return <div className="min-h-full bg-panel" aria-busy="true" />;

  if (!canViewAdminPath(access, pathname)) {
    const fallback = firstViewableAdminHref(access);
    return (
      <div className="grid min-h-full place-items-center bg-panel px-6 py-12">
        <div className="max-w-md rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-surface-2 text-ink-muted">
            <LockKey size={24} weight="duotone" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">{t("noPermissionTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {t("noPermissionBody", { role: access.roleName ?? "" })}
          </p>
          {fallback && fallback !== pathname ? (
            <Link
              href={fallback}
              className="mt-5 inline-flex h-9 items-center rounded-lg border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              {t("goToAllowed")}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
