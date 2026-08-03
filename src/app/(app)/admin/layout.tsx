"use client";

import { ShieldWarning } from "@phosphor-icons/react/dist/ssr";

import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isSystemAdmin = useIsSystemAdmin();

  if (!isSystemAdmin) {
    return (
      <div className="grid min-h-full place-items-center bg-canvas px-6 py-12">
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

  return <>{children}</>;
}
