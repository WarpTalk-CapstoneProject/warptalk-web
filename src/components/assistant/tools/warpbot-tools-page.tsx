"use client";

/**
 * /{slug}/tools — what WarpBot can do here, in three sections on one page:
 *
 *   Built in           the worker's own tools (static catalog until GET /api/v1/assistant/tools)
 *   Web search         OpenAI's hosted search; its on/off switch is not readable from the client
 *   From your plugins  tools of connected plugins WarpBot is actually offered here
 *
 * See .agents/page-docs/warpbot-tools.md.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  CaretDown,
  ChartBar,
  ChatsCircle,
  FileText,
  Globe,
  Lightbulb,
  MagnifyingGlass,
  PaperPlaneRight,
  PuzzlePiece,
  Translate,
  Users,
  VideoCamera,
  X,
} from "@phosphor-icons/react";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { Input } from "@/components/ui/input";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspaceFilterPill,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { useAssistantPlugins } from "@/hooks/use-assistant";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { pluginToolsOfferedToWarpBot } from "@/lib/assistant/warpbot-plugin-tools";
import { toolPolicyOf } from "@/lib/assistant/tool-policy";
import {
  filterBuiltInTools,
  foldSearchText,
  visibleBuiltInTools,
  visibleToolCategories,
  WARPBOT_BUILT_IN_TOOLS,
  type WarpBotBuiltInTool,
  type WarpBotToolCategory,
} from "@/lib/assistant/warpbot-tools-catalog";
import { cn } from "@/lib/utils";
import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { McpToolDescriptorDto } from "@/types/assistant";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1";

const CATEGORY_ICON: Record<WarpBotToolCategory, typeof VideoCamera> = {
  meetings: VideoCamera,
  knowledge: Lightbulb,
  documents: FileText,
  glossary: BookOpen,
  translation: Translate,
  workspace: Users,
  conversation: ChatsCircle,
  platform: ChartBar,
};

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-ink-muted">
      {children}
    </span>
  );
}

function ChangesDataBadge() {
  const t = useTranslations("warpbotTools.badges");
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">
      {t("changesData")}
    </span>
  );
}

function TryButton({ prompt }: { prompt: string }) {
  const t = useTranslations("warpbotTools");
  const askWarpBot = useAssistantWidgetStore((state) => state.askWarpBot);
  return (
    <button
      type="button"
      onClick={() => {
        askWarpBot(prompt);
        toast.success(t("tryToast"));
      }}
      aria-label={t("row.tryAria", { prompt })}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 text-[12px] font-medium text-ink transition-colors hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      <PaperPlaneRight className="size-3.5" weight="bold" aria-hidden />
      {t("row.tryInWarpBot")}
    </button>
  );
}

function BuiltInToolRow({ tool }: { tool: WarpBotBuiltInTool }) {
  const t = useTranslations("warpbotTools");
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const Icon = CATEGORY_ICON[tool.category];

  return (
    <li className="py-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <ToolIcon>
          <Icon className="size-4" weight="duotone" aria-hidden />
        </ToolIcon>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-medium text-ink">{tool.displayName}</span>
            <code className="font-mono text-[11px] text-ink-subtle">{tool.name}</code>
            {tool.effect === "write" ? <ChangesDataBadge /> : null}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-ink-muted">{tool.description}</span>
        </span>
        <CaretDown
          aria-hidden
          className={cn("mt-2 size-3.5 shrink-0 text-ink-subtle transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded ? (
        <div id={panelId} className="ml-[52px] mr-2 mb-2 space-y-3 pt-1">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">{tool.details}</p>
          {tool.audience === "host" ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink">{t("row.hostOnly")}</p>
          ) : null}
          {tool.audience === "platform_admin" ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink">{t("row.platformOnly")}</p>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t("row.samplePrompts")}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {tool.samplePrompts.map((prompt) => (
                <li
                  key={prompt}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-[12.5px] text-ink">&ldquo;{prompt}&rdquo;</span>
                  <TryButton prompt={prompt} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function PluginToolRow({ tool }: { tool: McpToolDescriptorDto }) {
  const t = useTranslations("warpbotTools.badges");
  const asksFirst = toolPolicyOf(tool) === "approval";
  return (
    <li className="flex items-start gap-3 px-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium text-ink">{tool.label || tool.name}</span>
          <code className="font-mono text-[11px] text-ink-subtle">{tool.name}</code>
          {tool.effect === "write" ? <ChangesDataBadge /> : null}
          {asksFirst ? <span className="text-[11px] text-ink-subtle">{t("asksFirst")}</span> : null}
        </span>
        {tool.description ? (
          <span className="mt-0.5 block text-[12px] text-ink-muted">{tool.description}</span>
        ) : null}
      </span>
    </li>
  );
}

export function WarpBotToolsPage() {
  const t = useTranslations("warpbotTools");
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceRole();
  const canManagePlugins = role === "owner" || role === "admin";
  // Platform staff exactly as the /admin portal decides it (admin/layout.tsx): the token's
  // auth.roles "admin" hint AND staff access confirmed by GET /auth/staff-access. Hidden while
  // that answer is still loading, so a non-staff viewer never sees the platform tool flash in.
  const hasStaffHint = useIsSystemAdmin();
  const staffAccess = useStaffAccess();
  const isPlatformStaff = hasStaffHint && !staffAccess.isLoading && staffAccess.access.isStaff;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WarpBotToolCategory | null>(null);

  const categories = visibleToolCategories({ isPlatformStaff });
  const activeCategory = category && categories.includes(category) ? category : null;

  const builtInTools = useMemo(
    () =>
      filterBuiltInTools(visibleBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { isPlatformStaff }), {
        category: activeCategory,
        query,
      }),
    [activeCategory, isPlatformStaff, query],
  );

  const needle = foldSearchText(query);
  const webSearchMatches =
    !needle ||
    [t("webSearch.name"), t("webSearch.rowDescription"), "web_search", "web search"].some((text) =>
      foldSearchText(text).includes(needle),
    );

  const pluginsQuery = useAssistantPlugins(workspaceId ?? undefined);
  const offeredGroups = useMemo(
    () => pluginToolsOfferedToWarpBot(pluginsQuery.data ?? []),
    [pluginsQuery.data],
  );
  const visibleGroups = useMemo(() => {
    if (!needle) return offeredGroups;
    return offeredGroups
      .map((group) => {
        const pluginMatches = foldSearchText(group.plugin.label).includes(needle);
        const tools = pluginMatches
          ? group.tools
          : group.tools.filter((tool) =>
              [tool.name, tool.label, tool.description].some((text) => foldSearchText(text ?? "").includes(needle)),
            );
        return { ...group, tools };
      })
      .filter((group) => group.tools.length > 0);
  }, [needle, offeredGroups]);

  const manageLink = canManagePlugins && workspaceSlug ? (
    <Link
      href={`/${workspaceSlug}/settings/plugins`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-primary hover:underline",
        FOCUS_RING,
      )}
    >
      {t("plugins.manage")}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  ) : null;

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-ink">{t("title")}</h1>
            <p className="text-[12px] text-ink-muted">{t("subtitle")}</p>
          </div>
        }
        actions={
          <div className="relative">
            <MagnifyingGlass
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-56 pl-8 pr-8 text-[12px]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearch")}
                className={cn(
                  "absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-subtle hover:text-ink",
                  FOCUS_RING,
                )}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
        }
      />

      <WorkspaceBody className="space-y-4 pt-1">
        <WorkspaceSection title={t("builtIn.title")} description={t("builtIn.description")}>
          <div
            role="group"
            aria-label={t("categoryFilterLabel")}
            className="-mx-1 mb-2 flex flex-wrap gap-1.5 px-1"
          >
            <WorkspaceFilterPill
              label={t("categories.all")}
              selected={activeCategory === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((id) => (
              <WorkspaceFilterPill
                key={id}
                label={t(`categories.${id}`)}
                selected={activeCategory === id}
                onClick={() => setCategory(id)}
              />
            ))}
          </div>
          {builtInTools.length > 0 ? (
            <ul className="divide-y divide-border">
              {builtInTools.map((tool) => (
                <BuiltInToolRow key={tool.name} tool={tool} />
              ))}
            </ul>
          ) : (
            <p className="px-2 py-6 text-center text-[12.5px] text-ink-muted">{t("builtIn.empty")}</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t("webSearch.title")} description={t("webSearch.description")}>
          {webSearchMatches ? (
            // The switch is ASSISTANT_CHAT_WEB_SEARCH_ENABLED (deploy) AND the platform flag
            // flags.warpbot_web_search for this workspace, read by the AI worker per turn. Neither
            // is exposed to a workspace member's client, so this row never claims On or Off.
            <div className="flex items-start gap-3 px-2 py-2.5">
              <ToolIcon>
                <Globe className="size-4" weight="duotone" aria-hidden />
              </ToolIcon>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-medium text-ink">{t("webSearch.name")}</span>
                  <code className="font-mono text-[11px] text-ink-subtle">web_search</code>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{t("webSearch.rowDescription")}</p>
                <p className="mt-2 text-[12px] text-ink-subtle">{t("webSearch.unknownNote")}</p>
              </div>
            </div>
          ) : (
            <p className="px-2 py-4 text-center text-[12.5px] text-ink-muted">{t("webSearch.empty")}</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title={t("plugins.title")}
          description={t("plugins.description")}
          actions={manageLink}
        >
          {pluginsQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label={t("plugins.loading")}>
              <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
              <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
            </div>
          ) : pluginsQuery.isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-[12.5px] text-ink-muted">{t("plugins.error")}</p>
              <button
                type="button"
                onClick={() => void pluginsQuery.refetch()}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border border-border px-3 text-[12px] font-medium text-ink hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                {t("plugins.retry")}
              </button>
            </div>
          ) : offeredGroups.length === 0 ? (
            <WorkspaceEmptyState
              icon={<PuzzlePiece className="size-6" weight="duotone" aria-hidden />}
              title={t("plugins.emptyTitle")}
              description={t("plugins.emptyDescription")}
              action={
                <Link
                  href="/settings/plugins"
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface-1 px-3 text-[12px] font-medium text-ink hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  {t("plugins.openConnections")}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              }
            />
          ) : visibleGroups.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-ink-muted">{t("plugins.noMatches")}</p>
          ) : (
            <ul className="space-y-3">
              {visibleGroups.map(({ plugin, tools }) => (
                <li key={plugin.key} className="rounded-lg border border-border">
                  <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
                    <PluginGlyph plugin={plugin} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink">{plugin.label}</p>
                      <p className="text-[11.5px] text-ink-subtle">
                        {t("plugins.toolCount", { count: tools.length })}
                      </p>
                    </div>
                  </div>
                  <ul className="divide-y divide-border px-1">
                    {tools.map((tool) => (
                      <PluginToolRow key={tool.name} tool={tool} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </WorkspaceBody>
    </WorkspacePage>
  );
}
