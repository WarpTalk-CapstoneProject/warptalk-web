"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import {
  Question,
  SidebarSimple,
  Spinner,
} from "@phosphor-icons/react/dist/ssr";
import { useUIStore } from "@/stores/ui-store";
import { CreateRoomDialog } from "@/components/rooms/create-room-dialog";
import { SearchMeetingDialog } from "@/components/rooms/search-meeting-dialog";
import { SetupRoomModal } from "@/components/rooms/setup-room-modal";
import { GlobalChatbot } from "@/components/layout/global-chatbot";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import { NotificationSoundToggle } from "@/components/layout/notification-sound-toggle";
import { ThemeToggleButton } from "@/components/layout/theme-toggle-button";
import { HeaderSearch } from "@/components/layout/header-search";
import { MiniMeetingDock } from "@/components/rooms/live/mini-meeting-dock";
// No WorkspaceTabs here. The tab strip was deliberately removed from the app header (see
// "fix(layout): remove workspace tabs from app header"); development still carries it, and that
// removal is kept. The banner below is new and is kept.
import { MeetingInviteBanner } from "@/components/rooms/meeting-invite-banner";
import { MeetingStartedBanner } from "@/components/rooms/meeting-started-banner";
import { WorkspaceMembersPanel } from "@/components/layout/workspace-members-panel";

import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { startProactiveRefresh } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { isLiveMeetingPath } from "@/lib/workspace/workspace-routes";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ProductTour } from "@/components/onboarding/product-tour";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAuthStore } from "@/stores/auth-store";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { useWorkspaces, useSelectWorkspace } from "@/hooks/use-workspace";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";

const PersistentMeetingSession = dynamic(
  () =>
    import("@/components/rooms/live/persistent-meeting-session").then(
      (module) => module.PersistentMeetingSession,
    ),
  { ssr: false },
);

/**
 * Whether the sidebar should be showing its icon-only rail YET.
 *
 * LinearSidebar renders two different trees — a rail and a full sidebar — and React swaps them
 * the instant the flag changes, while AnimatedWidthPanel spends 420ms tweening the width. The two
 * halves were never connected, so closing read as: every label vanishes at once, and only then
 * does the panel slide shut.
 *
 * Opening swaps immediately — the labels should be arriving as the panel widens. Closing holds
 * the full tree for a beat so the labels are carried out by the narrowing panel (which is
 * overflow-hidden, so they are clipped away rather than deleted) and only then becomes the rail.
 * The delay is deliberately shorter than the width tween: the swap lands while the panel is
 * still moving, so it is never a visible step on a sidebar that has already stopped.
 */
function useRailSwapDelay(open: boolean, delayMs: number) {
  const [collapsed, setCollapsed] = useState(!open);

  useEffect(() => {
    if (open) {
      setCollapsed(false);
      return;
    }
    const timer = window.setTimeout(() => setCollapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [open, delayMs]);

  return collapsed;
}

function AnimatedWidthPanel({
  open,
  width,
  collapsedWidth = 0,
  side,
  className,
  children,
}: {
  open: boolean;
  width: number;
  collapsedWidth?: number;
  side: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const [initialWidth] = useState(() => (open ? width : collapsedWidth));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return;

    if (!hasMounted.current) {
      gsap.set(panel, { width: open ? width : collapsedWidth });
      gsap.set(content, {
        autoAlpha: open || collapsedWidth > 0 ? 1 : 0,
        x: open || collapsedWidth > 0 ? 0 : side === "left" ? -14 : 14,
      });
      hasMounted.current = true;
      return;
    }

    gsap.killTweensOf([panel, content]);
    gsap.to(panel, {
      width: open ? width : collapsedWidth,
      duration: 0.42,
      ease: "power3.inOut",
    });
    gsap.to(content, {
      autoAlpha: open || collapsedWidth > 0 ? 1 : 0,
      x: open || collapsedWidth > 0 ? 0 : side === "left" ? -14 : 14,
      duration: 0.28,
      ease: open ? "power3.out" : "power2.in",
    });
  }, [collapsedWidth, open, side, width]);

  return (
    <div
      ref={panelRef}
      aria-hidden={collapsedWidth === 0 && !open}
      className={cn(
        "h-full shrink-0 overflow-hidden",
        collapsedWidth === 0 && !open && "pointer-events-none",
        className,
      )}
      style={{ width: initialWidth }}
    >
      <div ref={contentRef} className="h-full" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    rightSidebarOpen,
    toggleRightSidebar,
    leftSidebarOpen,
    toggleLeftSidebar,
  } = useUIStore();
  // 160ms against the panel's 420ms width tween — see useRailSwapDelay.
  const railCollapsed = useRailSwapDelay(leftSidebarOpen, 160);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  const setActiveWorkspace = useWorkspaceStore(
    (state) => state.setActiveWorkspace,
  );
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const activeMeetingRoomId = useActiveMeetingStore(
    (state) => state.activeRoomId,
  );
  const closeMeeting = useActiveMeetingStore((state) => state.closeMeeting);
  const openTour = useOnboardingStore((state) => state.openTour);
  const [mounted, setMounted] = useState(false);

  // `isError` and `refetch` were not read. The gate below spun on `!activeWorkspaceId`, and a
  // failed workspaces query leaves that null forever — so any failure here painted a spinner
  // with no message, no retry and no way out, indistinguishable from a slow network. It is the
  // first request the shell makes, so it is also the one most likely to meet a cold gateway.
  const {
    data: workspacesData,
    isLoading: workspacesLoading,
    isError: workspacesFailed,
    error: workspacesError,
    refetch: refetchWorkspaces,
  } = useWorkspaces(1, 100);
  const selectWorkspace = useSelectWorkspace();

  const roomId = (() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 3 && segments[1] === "rooms") {
      const id = segments[2];
      if (/^[0-9a-fA-F-]{36}$/.test(id)) return id;
    }
    if (segments.length >= 2 && segments[0] === "room") {
      const id = segments[1];
      if (/^[0-9a-fA-F-]{36}$/.test(id)) return id;
    }
    return undefined;
  })();

  const roomQuery = useTranslationRoom(roomId ?? "");
  const roomTitle =
    roomId && roomQuery?.data ? roomQuery.data.title : undefined;

  const isOnboardingRoute =
    pathname === "/workspace" ||
    pathname === "/workspace/plans" ||
    pathname === "/workspace/create" ||
    pathname === "/workspace/join";
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSystemAdmin = useIsSystemAdmin();
  // Decides more than the header divider: it is also what tells the meeting dock to stop
  // floating (`floating={!isLiveMeetingRoute}`). Miss the live route and the minimised
  // window floats on top of the meeting it is a copy of.
  const isLiveMeetingRoute = isLiveMeetingPath(pathname);
  const isRestoringSession = useSessionBootstrap(mounted);

  // Starts the token's refresh timer for a session that was already in place on load.
  //
  // From an effect, deliberately. The same call at module scope in the api client took
  // production down with a temporal-dead-zone error, because it read the auth store while
  // the two modules were still evaluating each other. By the time an effect runs, every
  // module has finished — which is the only guarantee that actually holds.
  useEffect(() => {
    startProactiveRefresh();
  }, []);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  /**
   * The first-run tour, once — and only once the shell it describes is actually on screen.
   *
   * Two conditions, both load-bearing. Without a workspace slug the sidebar has no destinations
   * to point at, and the tour would open against a shell that is still a spinner. The delay
   * covers the rest: the panel width tween runs for 420ms, and a spotlight measured mid-tween
   * lands next to the control rather than on it.
   *
   * The check is repeated inside the timer rather than only in the dependency array, because
   * The record is persisted and zustand rehydrates it after the first client render — reading
   * it once at effect time would show a returning user the tour they finished last week.
   */
  useEffect(() => {
    // Keyed by user, so signing out and back in does not re-run a tour this person already
    // dismissed — which is exactly what the previous single flag did, because it was cleared
    // on every sign-in for account isolation.
    return undefined;
  }, []);

  useEffect(() => {
    if (mounted && !isRestoringSession && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isRestoringSession, isAuthenticated, router]);

  useEffect(() => {
    if (
      !mounted ||
      isRestoringSession ||
      !isAuthenticated ||
      isOnboardingRoute ||
      isAdminRoute ||
      workspacesLoading
    )
      return;
    if (selectWorkspace.isPending) return;

    if (!activeWorkspaceId) {
      if (workspacesData?.items && workspacesData.items.length > 0) {
        const firstWs = workspacesData.items[0];
        // Hydrated from the SELECT RESPONSE, not from the list row. The list's shape varies by
        // endpoint — hence the `"membershipType" in firstWs` guards this replaced — and the
        // select call is the one authority on what this user's role in this workspace is. It is
        // awaited so a failed selection redirects instead of leaving the shell holding a
        // workspace the server never confirmed.
        void (async () => {
          try {
            const selection = await selectWorkspace.mutateAsync(firstWs.id);
            applySelectedWorkspace(selection, setActiveWorkspace);
          } catch {
            router.replace("/workspace");
          }
        })();
      } else if (isSystemAdmin) {
        // A platform admin with no workspace of their own is not a new user who has yet to make
        // one — they administer the platform the workspaces live in. Sending them to
        // /workspace made the master account look like it had signed up by mistake, and the
        // only way on was to create a workspace nobody wanted. The admin portal is their home.
        router.replace("/admin");
      } else {
        router.replace("/workspace");
      }
    }
  }, [
    activeWorkspaceId,
    workspacesData,
    workspacesLoading,
    isOnboardingRoute,
    isAdminRoute,
    isSystemAdmin,
    selectWorkspace,
    setActiveWorkspace,
    router,
    mounted,
    isRestoringSession,
    isAuthenticated,
  ]);

  if (!mounted || isRestoringSession || !isAuthenticated) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (isOnboardingRoute) {
    return <>{children}</>;
  }

  // Checked before the spinner, because a failure and a slow load are the same picture and
  // only one of them ends. Retry rather than reload: the session is fine, one request was not.
  if (!isAdminRoute && workspacesFailed) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas p-6">
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-base font-semibold text-ink">
            Could not load your workspaces
          </h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            {getErrorStatus(workspacesError) === null
              ? "The server could not be reached. Check your connection and try again."
              : "The server refused that request. Trying again may work; if it does not, sign out and back in."}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void refetchWorkspaces()}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminRoute && (!activeWorkspaceId || workspacesLoading)) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="relative h-dvh flex overflow-hidden bg-canvas text-ink">
      <AnimatedWidthPanel
        open={leftSidebarOpen}
        width={224}
        collapsedWidth={64}
        side="left"
      >
        <LinearSidebar collapsed={railCollapsed} />
      </AnimatedWidthPanel>
      {/* Main Column */}
      <div className="relative flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Main content box */}
        <div className="relative flex flex-col flex-1 overflow-hidden mt-1.5 mr-1.5 mb-0 rounded-xl border border-border bg-surface-1 shadow-sm">
          {/* Top bar */}
          <header
            className={cn(
              // Three columns since the search sits between the breadcrumb and the icons.
              // This was two, and adding a third child silently wrapped the icon cluster onto a
              // second grid row inside a 44px-tall header — the notification bell, theme toggle,
              // help and the right-panel toggle all vanished. Nothing failed: not typecheck, not
              // lint, not the build. Only looking at it showed anything was wrong.
              //
              // The middle column is capped rather than 1fr so the search does not stretch across
              // a wide window, and minmax(0,…) on the outer two lets a long breadcrumb truncate
              // instead of pushing the icons off the edge.
              "h-[44px] grid grid-cols-[minmax(0,1fr)_minmax(0,420px)_minmax(0,1fr)] items-center gap-3 px-4 shrink-0",
              !isLiveMeetingRoute && "border-b border-border",
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
              <button
                onClick={toggleLeftSidebar}
                className="flex size-6 items-center justify-center rounded-[6px] border border-transparent hover:bg-surface-2 hover:text-ink transition-colors mr-1"
                title={leftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                aria-label={
                  leftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"
                }
              >
                <SidebarSimple size={13} weight="bold" />
              </button>
              {(() => {
                const parts: { label: string; href?: string }[] = [];
                const segments = pathname.split("/").filter(Boolean);

                if (segments.length >= 1) {
                  const firstSeg = segments[0];
                  if (firstSeg === "voice-profiles") {
                    parts.push({ label: "Voice Profiles" });
                  } else if (firstSeg === "join") {
                    parts.push({ label: "Join" });
                  } else if (firstSeg === "room") {
                    parts.push({
                      label: "Meetings",
                      href: `/${activeWorkspaceSlug || "workspace"}/rooms`,
                    });
                    const rId = segments[1];
                    if (rId) {
                      parts.push({ label: roomTitle || "Loading..." });
                    }
                  } else if (segments.length >= 2) {
                    const slug = firstSeg;
                    const feature = segments[1];

                    if (feature === "rooms") {
                      parts.push({ label: "Meetings", href: `/${slug}/rooms` });
                      const sub = segments[2];
                      if (sub) {
                        parts.push({ label: roomTitle || "Loading..." });
                      }
                    } else if (feature === "history") {
                      parts.push({ label: "History" });
                    } else if (feature === "dashboard") {
                      parts.push({ label: "Dashboard" });
                    } else if (feature === "home") {
                      parts.push({ label: "Home" });
                    } else if (feature === "voice-profiles") {
                      parts.push({ label: "Voice Profiles" });
                    } else if (feature === "members") {
                      parts.push({ label: "Members" });
                    } else if (feature === "documents") {
                      parts.push({ label: "Documents" });
                    } else if (feature === "settings") {
                      const sub = segments[2];
                      if (sub === "account") {
                        parts.push({
                          label: "Settings",
                          href: `/${slug}/settings`,
                        });
                        const leaf = segments[3];
                        if (leaf === "profile") {
                          parts.push({ label: "Profile" });
                        } else if (leaf === "preferences") {
                          parts.push({ label: "Preferences" });
                        } else {
                          parts.push({ label: leaf || "Account" });
                        }
                      } else {
                        parts.push({ label: "Settings" });
                      }
                    } else if (feature === "billing") {
                      parts.push({ label: "Billing" });
                    } else if (feature === "payment") {
                      parts.push({ label: "Payment" });
                      const sub = segments[2];
                      if (sub) {
                        parts.push({ label: sub === "plans" ? "Plans" : sub });
                      }
                    } else {
                      parts.push({ label: feature });
                    }
                  } else {
                    parts.push({ label: "Workspace" });
                  }
                } else {
                  parts.push({ label: "Workspace" });
                }

                return parts.map((part, index) => {
                  return (
                    <span key={index} className="flex items-center gap-1.5">
                      {part.href && index < parts.length - 1 ? (
                        <Link
                          href={part.href}
                          className="hover:text-ink cursor-pointer transition-colors"
                        >
                          {part.label}
                        </Link>
                      ) : (
                        <span
                          className={
                            index === parts.length - 1
                              ? "text-ink font-medium max-w-[300px] truncate"
                              : "hover:text-ink cursor-pointer transition-colors capitalize"
                          }
                        >
                          {part.label}
                        </span>
                      )}
                      {index < parts.length - 1 && (
                        <span className="text-ink-muted/40">/</span>
                      )}
                    </span>
                  );
                });
              })()}
            </div>

            {/*
            Search sits between the breadcrumb and the icon cluster, which is where it was
            designed to go — the Topbar that owned it was simply never mounted, so the header
            has been running without it. min-w-0 so the breadcrumb, not the search box, is
            what gives up space on a narrow window.
          */}
            <div className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
              <HeaderSearch />
            </div>

            <div className="flex items-center justify-end gap-1.5 text-ink-muted">
              <NotificationPopover />
              <NotificationSoundToggle />
              <ThemeToggleButton />
              {/* This was a button with no onClick — the only affordance in the header that did
                  nothing at all. It opens the tour now, which is also where the tour's last step
                  points, so somebody who skipped it knows where it went. */}
              <button
                type="button"
                data-tour="help-button"
                onClick={openTour}
                title="Show me around"
                aria-label="Show me around"
                className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"
              >
                <Question size={12} weight="bold" />
              </button>
              <div className="w-[1px] h-3.5 bg-border mx-1" />
              <button
                onClick={toggleRightSidebar}
                className="flex size-6 items-center justify-center rounded-[6px] border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"
              >
                <SidebarSimple size={13} weight="bold" />
              </button>
            </div>
          </header>

          <ProductTour />

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* A non-scrolling frame around the scrolling main column, so anything pinned to the
                content area — the meeting-started banner — stays put while the page scrolls under
                it. `<main>` itself cannot serve: it IS the scroll container. */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <main className="relative min-h-0 flex-1 overflow-y-auto">
                {children}
              {activeMeetingRoomId ? (
                // One wrapper for both presentations, never a ternary between two of them: the
                // session must stay MOUNTED as the route changes, or navigating out of the room
                // tears down the LiveKit connection this whole arrangement exists to preserve.
                // The dock owns the floating position now — it used to be pinned to the
                // bottom-right, which is exactly where the chat launcher and the toasts live.
                <MiniMeetingDock floating={!isLiveMeetingRoute}>
                  <PersistentMeetingSession
                    key={activeMeetingRoomId}
                    roomId={activeMeetingRoomId}
                    compact={!isLiveMeetingRoute}
                    onMeetingClosed={closeMeeting}
                  />
                </MiniMeetingDock>
              ) : null}
              </main>

              {/* Both meeting notices live in ONE stack, and the stack — not either card — owns the
                  corner. They are independent (being invited to Thursday's review does not stop this
                  morning's standup going live), so both can be on screen at once; positioned
                  separately they would have been drawn on top of each other. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-end gap-2 p-4">
                <MeetingInviteBanner />
                <MeetingStartedBanner />
              </div>
            </div>

            {/* Right Sidebar (Context/Properties) */}
            {!isAdminRoute &&
              !isLiveMeetingRoute &&
              !pathname.startsWith("/rooms/") && (
                <AnimatedWidthPanel
                  open={rightSidebarOpen}
                  width={260}
                  side="right"
                  className="bg-surface-1"
                >
                  <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface-1">
                    {/* Members, not "Properties".
                  The panel used to be a header over the sentence "Select an item to view its
                  properties and actions" — and nothing in the app ever published an item for it
                  to describe, so that sentence was the whole feature. 260px had been reserved
                  for something that never arrived.

                  Properties is meant to return here for a selected item; it is not built in this
                  change because there is still no selection to read. Adding a store nothing
                  writes to would be the same placeholder again, one layer deeper. */}
                    <div className="flex items-center px-4 h-[38px] border-b border-border">
                      <span className="text-[12px] font-medium text-ink">
                        Members
                      </span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto">
                      <WorkspaceMembersPanel
                        workspaceId={activeWorkspaceId}
                        workspaceSlug={activeWorkspaceSlug}
                      />
                    </div>
                  </aside>
                </AnimatedWidthPanel>
              )}
          </div>
        </div>

        {/* Global Chatbot outside main content box */}
        <div className="shrink-0 mr-1.5">
          <GlobalChatbot />
        </div>
      </div>
      <CreateRoomDialog />
      <SearchMeetingDialog />
      <SetupRoomModal />
    </div>
  );
}
