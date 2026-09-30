"use client";

/** "Who has this permission": the roles that grant it and the staff holding those roles (G10). */

import Link from "next/link";
import { useTranslations } from "next-intl";

import { StaffRoleBadge, StaffStatusBadge } from "@/components/admin/staff/staff-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePermissionHolders } from "@/hooks/use-admin-staff";

export function PermissionHoldersDialog({ code, onOpenChange }: { code: string | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("adminStaff.holders");
  const holders = usePermissionHolders(code);
  const data = holders.data;

  return (
    <Dialog open={code !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <code className="text-[15px]">{code}</code>
          </DialogTitle>
          <DialogDescription>{data?.permission.description ?? t("loading")}</DialogDescription>
        </DialogHeader>

        {holders.isError ? <p className="mt-4 text-[12px] text-destructive">{t("error")}</p> : null}

        {data ? (
          <div className="mt-4 grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            <section>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {t("roles", { count: data.roles.length })}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.roles.map((role) => (
                  <StaffRoleBadge key={role.id} name={role.name} isSuperAdmin={role.slug === "super_admin"} />
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {t("members", { count: data.members.length })}
              </h3>
              {data.members.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink-muted">{t("nobody")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">
                  {data.members.map((member) => (
                    <li key={member.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink">{member.fullName}</p>
                        <p className="truncate text-[11px] text-ink-subtle">
                          {member.email} · {member.roleName}
                        </p>
                      </div>
                      <StaffStatusBadge status={member.status} accountActive={member.accountActive} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Link href="/admin/staff" className="text-[12px] text-ink-muted underline-offset-2 hover:text-ink hover:underline">
              {t("openStaff")}
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
