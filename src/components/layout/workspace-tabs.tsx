"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { motion } from "motion/react";
import {
  CreditCard,
  FileText,
  GearSix,
  House,
  List,
  Plus,
  Scroll,
  SquaresFour,
  Users,
  Waveform,
  X,
} from "@phosphor-icons/react/dist/ssr";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { type WorkspaceTab, useWorkspaceTabsStore } from "@/stores/workspace-tabs-store";

gsap.registerPlugin(Flip);

export type TabOption = WorkspaceTab & {
  description: string;
  icon: React.ElementType;
};

export function buildWorkspacePath(slug: string, segment: string) {
  return `/${slug}/${segment}`;
}

export function buildTabOptions(slug: string): TabOption[] {
  return [
    {
      id: "home",
      title: "Home",
      href: buildWorkspacePath(slug, "home"),
      description: "Workspace start page",
      icon: House,
    },
    {
      id: "meetings",
      title: "Meetings",
      href: buildWorkspacePath(slug, "rooms"),
      description: "Live and scheduled rooms",
      icon: SquaresFour,
    },
    {
      id: "transcripts",
      title: "Transcripts",
      href: buildWorkspacePath(slug, "ai-summaries"),
      description: "Summaries and retained artifacts",
      icon: Scroll,
    },
    {
      id: "voice-profiles",
      title: "Voice Profiles",
      href: "/voice-profiles",
      description: "Voice and clone settings",
      icon: Waveform,
    },
    {
      id: "members",
      title: "Members",
      href: buildWorkspacePath(slug, "members"),
      description: "People and roles",
      icon: Users,
    },
    {
      id: "documents",
      title: "Documents",
      href: buildWorkspacePath(slug, "documents"),
      description: "Knowledge and reference files",
      icon: FileText,
    },
    {
      id: "billing",
      title: "Billing",
      href: buildWorkspacePath(slug, "billing"),
      description: "Plan and invoices",
      icon: CreditCard,
    },
    {
      id: "settings",
      title: "Settings",
      href: buildWorkspacePath(slug, "settings"),
      description: "Workspace configuration",
      icon: GearSix,
    },
  ];
}

export function resolveCurrentTab(pathname: string, options: TabOption[]): WorkspaceTab | null {
  const match = options.find((option) => {
    if (option.href === "/voice-profiles") return pathname === option.href;
    return pathname === option.href || pathname.startsWith(`${option.href}/`);
  });

  if (match) {
    return {
      id: match.id,
      title: match.title,
      href: match.href,
      closable: match.closable,
    };
  }

  return null;
}

export function WorkspaceTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const slug = activeWorkspaceSlug || "workspace";
  const scope = activeWorkspaceSlug || "global";
  const options = useMemo(() => buildTabOptions(slug), [slug]);
  const tabsByScope = useWorkspaceTabsStore((state) => state.tabsByScope);
  const addTab = useWorkspaceTabsStore((state) => state.addTab);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const reorderTabs = useWorkspaceTabsStore((state) => state.reorderTabs);
  const tabs = useMemo(() => tabsByScope[scope] ?? [], [scope, tabsByScope]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionIconRef = useRef<HTMLSpanElement | null>(null);
  const activeLayoutId = useId();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const activeTab = useMemo(
    () =>
      tabs.find((tab) => pathname === tab.href || (tab.href !== "/" && pathname.startsWith(`${tab.href}/`))) ??
      resolveCurrentTab(pathname, options),
    [options, pathname, tabs]
  );

  useLayoutEffect(() => {
    if (!flipStateRef.current) return;

    Flip.from(flipStateRef.current, {
      duration: 0.28,
      ease: "power2.out",
      absolute: false,
      scale: true,
    });
    flipStateRef.current = null;
  }, [tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-workspace-tab]",
        { autoAlpha: 0, y: -4, scale: 0.98 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.22,
          ease: "power2.out",
          stagger: 0.025,
          overwrite: true,
        }
      );
    }, list);

    return () => ctx.revert();
  }, [tabs.length]);

  useEffect(() => {
    const actionMenu = actionMenuRef.current;
    const actionIcon = actionIconRef.current;
    if (!actionMenu || !actionIcon) return;

    gsap.fromTo(
      actionIcon,
      { autoAlpha: 0.5, scale: 0.78, filter: "blur(5px)", rotate: actionsOpen ? -12 : 12 },
      { autoAlpha: 1, scale: 1, filter: "blur(0px)", rotate: 0, duration: 0.22, ease: "back.out(1.8)" }
    );

    gsap.fromTo(
      actionMenu.querySelectorAll("[data-tab-action]"),
      {
        autoAlpha: actionsOpen ? 0 : 1,
        x: actionsOpen ? -6 : 0,
        scale: actionsOpen ? 0.72 : 1,
        filter: actionsOpen ? "blur(5px)" : "blur(0px)",
      },
      {
        autoAlpha: actionsOpen ? 1 : 0,
        x: actionsOpen ? 0 : -4,
        scale: actionsOpen ? 1 : 0.82,
        filter: actionsOpen ? "blur(0px)" : "blur(4px)",
        duration: 0.22,
        ease: actionsOpen ? "back.out(1.8)" : "power2.in",
        stagger: actionsOpen ? 0.035 : 0.02,
        pointerEvents: actionsOpen ? "auto" : "none",
      }
    );
  }, [actionsOpen]);

  function handleAdd(option: TabOption) {
    addTab(scope, {
      id: option.id,
      title: option.title,
      href: option.href,
      closable: option.closable,
    });
    router.push(option.href);
  }

  function captureTabsState() {
    const list = listRef.current;
    if (!list) return;

    flipStateRef.current = Flip.getState(list.querySelectorAll("[data-workspace-tab]"));
  }

  function moveTab(dragId: string, overId: string) {
    if (dragId === overId) return;

    const fromIndex = tabs.findIndex((tab) => tab.id === dragId);
    const toIndex = tabs.findIndex((tab) => tab.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextTabs = [...tabs];
    const [movedTab] = nextTabs.splice(fromIndex, 1);
    nextTabs.splice(toIndex, 0, movedTab);
    captureTabsState();
    reorderTabs(scope, nextTabs);
  }

  function handleClose(tab: WorkspaceTab, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (tab.closable === false) return;

    const tabIndex = tabs.findIndex((item) => item.id === tab.id);
    const fallback = tabs[tabIndex - 1] ?? tabs[tabIndex + 1];
    closeTab(scope, tab.id);

    if (activeTab?.id === tab.id && fallback) {
      router.push(fallback.href);
    }
  }

  function handleCloseActiveTab() {
    if (!activeTab || activeTab.closable === false) return;

    const tabIndex = tabs.findIndex((item) => item.id === activeTab.id);
    const fallback = tabs[tabIndex - 1] ?? tabs[tabIndex + 1];
    closeTab(scope, activeTab.id);
    setActionsOpen(false);

    if (fallback) {
      router.push(fallback.href);
    }
  }

  if (!tabs.length) return null;

  return (
    <div className="h-[36px] shrink-0 border-b border-border bg-surface-1 px-3">
      <div className="flex h-full min-w-0 items-center gap-1.5 overflow-hidden">
        <div
          ref={listRef}
          className="relative flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-border bg-surface-2/60 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        >
          {tabs.map((tab) => {
            const isActive =
              activeTab?.id === tab.id ||
              pathname === tab.href ||
              (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));

            return (
              <Link
                key={`${scope}-${tab.id}`}
                href={tab.href}
                data-workspace-tab
                draggable
                onDragStart={(event) => {
                  draggingIdRef.current = tab.id;
                  setDraggingId(tab.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", tab.id);
                  gsap.to(event.currentTarget, {
                    scale: 0.98,
                    autoAlpha: 0.68,
                    duration: 0.16,
                    ease: "power2.out",
                  });
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (draggingIdRef.current) moveTab(draggingIdRef.current, tab.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragEnd={(event) => {
                  draggingIdRef.current = null;
                  setDraggingId(null);
                  gsap.to(event.currentTarget, {
                    scale: 1,
                    autoAlpha: 1,
                    duration: 0.2,
                    ease: "power2.out",
                  });
                }}
                className={cn(
                  "group relative z-10 flex h-6 min-w-[66px] max-w-[124px] shrink-0 cursor-grab items-center justify-center gap-1 rounded-[7px] px-2 text-[11px] font-medium outline-none transition-colors active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/40",
                  draggingId === tab.id && "text-ink-subtle",
                  isActive ? "text-ink" : "text-ink-muted hover:text-ink"
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId={activeLayoutId}
                    className="absolute inset-0 z-[-1] rounded-[7px] border border-border bg-surface-1 shadow-sm"
                    transition={{ type: "spring", duration: 0.42, bounce: 0.14 }}
                  />
                ) : null}
                <span className="truncate px-1.5">{tab.title}</span>
                {tab.closable !== false ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={(event) => handleClose(tab, event)}
                    draggable={false}
                    className="absolute right-1.5 grid size-3.5 place-items-center rounded-[5px] text-ink-subtle opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                  >
                    <X size={9} weight="bold" />
                  </button>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div ref={actionMenuRef} className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={actionsOpen ? "Hide tab actions" : "Show tab actions"}
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
            className="grid size-7 place-items-center rounded-[8px] border border-border bg-surface-2/60 text-ink-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span ref={actionIconRef} className="grid place-items-center">
              <List size={13} weight="bold" />
            </span>
          </button>

          <button
            type="button"
            data-tab-action
            aria-label="Close active tab"
            onClick={handleCloseActiveTab}
            disabled={!activeTab || activeTab.closable === false}
            className="pointer-events-none grid size-7 place-items-center rounded-[8px] border border-border bg-surface-2/60 text-ink-muted opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-30"
          >
            <X size={12} weight="bold" />
          </button>

          <DropdownMenu onOpenChange={(open) => open && setActionsOpen(true)}>
            <DropdownMenuTrigger
              data-tab-action
              className="pointer-events-none grid size-7 place-items-center rounded-[8px] border border-border bg-surface-2/60 text-ink-muted opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Plus size={12} weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-[10px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Create new view</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {options.map((option) => {
                  const Icon = option.icon;
                  const exists = tabs.some((tab) => tab.href === option.href);

                  return (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => handleAdd(option)}
                      className="cursor-pointer gap-2 px-2 py-2"
                    >
                      <span className="grid size-7 place-items-center rounded-[7px] border border-border bg-surface-1 text-primary">
                        <Icon size={15} weight="duotone" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{option.title}</span>
                        <span className="block truncate text-[11px] text-ink-muted">{option.description}</span>
                      </span>
                      {exists ? <span className="text-[11px] text-ink-subtle">Open</span> : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
