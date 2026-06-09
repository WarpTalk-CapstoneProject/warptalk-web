"use client";
import type { IconProps } from "@phosphor-icons/react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { WarpTalkBrand } from "@/components/layout/warptalk-brand";

export type RoleSidebarGroup = {
  label: string;
  items: Array<{
    title: string;
    href: string;
    icon: React.ElementType<IconProps>;
    badge?: string;
  }>;
};

type RoleSidebarProps = {
  homeHref: string;
  srLabel: string;
  groups: RoleSidebarGroup[];
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RoleSidebar({ homeHref, srLabel, groups }: RoleSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <aside className="relative z-[2] hidden h-full w-[240px] shrink-0 bg-canvas text-ink border-r border-border md:flex md:flex-col">
      <div className="flex h-[63px] items-center px-5">
        <Link
          href={homeHref}
          className="flex min-w-0 items-center rounded-md text-foreground transition hover:opacity-75"
        >
          <WarpTalkBrand />
          <span className="sr-only">{srLabel}</span>
        </Link>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-2 text-[11px] font-medium text-ink-muted">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-[28px] items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink",
                        isActive ? "bg-surface-2 text-ink font-medium" : "hover:bg-surface-2"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0")} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.badge ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
                            isActive ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex h-[28px] w-full items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <SignOut weight="light" className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
