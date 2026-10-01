"use client";

/**
 * /{slug}/tools — what WarpBot can do here, in three sections on one page, all from ONE read:
 * GET /api/v1/assistant/tools?workspaceId= (`useWarpBotTools`).
 *
 *   Built in           `builtIn` — the worker's own registry (its manifest), dressed with copy
 *   Web search         `webSearch.state` — on / off / unavailable / unknown
 *   From your plugins  `plugins` — exactly the plugin tools WarpBot is offered right now
 *
 * The server decides who sees what (platform-staff tools, blocked plugin tools); the page only
 * draws it. See .agents/page-docs/warpbot-tools.md.
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
  Wrench,
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
import { useAssistantPlugins, useWarpBotTools } from "@/hooks/use-assistant";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { strictestToolPolicy } from "@/lib/assistant/tool-policy";
import {
  builtInToolsFromManifest,
  filterBuiltInTools,
  foldSearchText,
  toolCategoriesOf,
  WEB_SEARCH_SAMPLE_PROMPT,
  type WarpBotBuiltInTool,
  type WarpBotToolCategory,
} from "@/lib/assistant/warpbot-tools-catalog";
import { cn } from "@/lib/utils";
import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WarpBotPluginToolDto, WarpBotWebSearchState } from "@/types/assistant";

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
  other: Wrench,
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
          {tool.details ? (
            <p className="text-[12.5px] leading-relaxed text-ink-muted">{tool.details}</p>
          ) : null}
          {tool.audience === "host" ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink">{t("row.hostOnly")}</p>
          ) : null}
          {tool.audience === "platform_staff" ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink">{t("row.platformOnly")}</p>
          ) : null}
          {tool.samplePrompts.length > 0 ? (
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
          ) : null}
          {!tool.details && tool.samplePrompts.length === 0 && tool.audience === "member" ? (
            <p className="text-[12px] text-ink-subtle">{t("row.noMoreDetails")}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PluginToolRow({ tool }: { tool: WarpBotPluginToolDto }) {
  const t = useTranslations("warpbotTools.badges");
  // What WarpBot will do: the stricter of the member's choice and the workspace rule. Blocked
  // tools never reach this list — the server leaves them out.
  const asksFirst = strictestToolPolicy(tool.policy, tool.workspacePolicy ?? null) === "approval";
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

const WEB_SEARCH_BADGE: Record<Exclude<WarpBotWebSearchState, "unknown">, string> = {
  on: "border-success/40 bg-success/10 text-success",
  off: "border-border bg-surface-2 text-ink-muted",
  unavailable: "border-border bg-surface-2 text-ink-subtle",
};

function WebSearchStateBadge({ state }: { state: WarpBotWebSearchState }) {
  const t = useTranslations("warpbotTools.webSearch.state");
  if (state === "unknown") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        WEB_SEARCH_BADGE[state],
      )}
    >
      {t(state)}
    </span>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations("warpbotTools");
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p className="text-[12.5px] text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex h-7 items-center rounded-full border border-border px-3 text-[12px] font-medium text-ink hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        {t("plugins.retry")}
      </button>
    </div>
  );
}

export function WarpBotToolsPage() {
  const t = useTranslations("warpbotTools");
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceRole();
  const canManagePlugins = role === "owner" || role === "admin";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WarpBotToolCategory | null>(null);

  // One read for all three sections. Platform-staff tools and blocked plugin tools are filtered by
  // the server, so there is no client-side staff check here.
  const toolsQuery = useWarpBotTools(workspaceId);
  const data = toolsQuery.data;
  const isLoading = !data && (toolsQuery.isLoading || !workspaceId);
  const isError = !data && toolsQuery.isError;
  const retry = () => void toolsQuery.refetch();

  const allBuiltIn = useMemo(
    () => (data?.manifestAvailable ? builtInToolsFromManifest(data.builtIn ?? []) : []),
    [data],
  );
  const categories = useMemo(() => toolCategoriesOf(allBuiltIn), [allBuiltIn]);
  const activeCategory = category && categories.includes(category) ? category : null;

  const builtInTools = useMemo(
    () => filterBuiltInTools(allBuiltIn, { category: activeCategory, query }),
    [activeCategory, allBuiltIn, query],
  );

  const needle = foldSearchText(query);
  const webSearchState: WarpBotWebSearchState = data?.webSearch?.state ?? "unknown";
  const webSearchMatches =
    !needle ||
    [t("webSearch.name"), t("webSearch.rowDescription"), "web_search", "web search"].some((text) =>
      foldSearchText(text).includes(needle),
    );

  // Only for each plugin's icon (`avatarUrl`); which plugins and tools are listed comes from
  // `data.plugins`. Shares the widget's cache; if it fails the glyph falls back to brand/initials.
  const pluginCatalog = useAssistantPlugins(workspaceId ?? undefined);
  const avatarByKey = useMemo(
    () => new Map((pluginCatalog.data ?? []).map((plugin) => [plugin.key, plugin.avatarUrl ?? null])),
    [pluginCatalog.data],
  );
  const offeredGroups = useMemo(
    () =>
      (data?.plugins ?? [])
        .filter((group) => group.tools.length > 0)
        .map((group) => ({
          plugin: { key: group.pluginKey, label: group.label, avatarUrl: avatarByKey.get(group.pluginKey) ?? null },
          tools: group.tools,
        })),
    [avatarByKey, data],
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
          {isLoading ? (
            <SectionSkeleton label={t("builtIn.loading")} />
          ) : isError ? (
            <SectionError message={t("builtIn.error")} onRetry={retry} />
          ) : !data?.manifestAvailable ? (
            // The worker's manifest is missing (worker down or not yet started). Say so — never
            // fall back to the copy in warpbot-tools-catalog.ts as if it were the list.
            <div role="status" className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-3">
              <Wrench className="mt-0.5 size-4 shrink-0 text-ink-subtle" weight="duotone" aria-hidden />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink">{t("builtIn.unavailableTitle")}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">{t("builtIn.unavailableDescription")}</p>
              </div>
            </div>
          ) : (
            <>
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
                <p className="px-2 py-6 text-center text-[12.5px] text-ink-muted">
                  {allBuiltIn.length === 0 ? t("builtIn.none") : t("builtIn.empty")}
                </p>
              )}
            </>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t("webSearch.title")} description={t("webSearch.description")}>
          {isLoading ? (
            <SectionSkeleton label={t("webSearch.loading")} />
          ) : webSearchMatches ? (
            // `webSearch.state` from the server: the worker's own ceiling (provider key + deploy
            // switch, from its manifest) AND the platform flag flags.warpbot_web_search. `unknown`
            // (no manifest, or the read failed) keeps the neutral note and claims neither.
            <div className="flex items-start gap-3 px-2 py-2.5">
              <ToolIcon>
                <Globe className="size-4" weight="duotone" aria-hidden />
              </ToolIcon>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-medium text-ink">{t("webSearch.name")}</span>
                  <code className="font-mono text-[11px] text-ink-subtle">web_search</code>
                  <WebSearchStateBadge state={webSearchState} />
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{t("webSearch.rowDescription")}</p>
                <p className="mt-2 text-[12px] text-ink-subtle">
                  {webSearchState === "on"
                    ? t("webSearch.onNote")
                    : webSearchState === "off"
                      ? t("webSearch.offNote")
                      : webSearchState === "unavailable"
                        ? t("webSearch.unavailableNote")
                        : t("webSearch.unknownNote")}
                </p>
                {webSearchState === "on" ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[12.5px] text-ink">&ldquo;{WEB_SEARCH_SAMPLE_PROMPT}&rdquo;</span>
                    <TryButton prompt={WEB_SEARCH_SAMPLE_PROMPT} />
                  </div>
                ) : null}
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
          {isLoading ? (
            <SectionSkeleton label={t("plugins.loading")} />
          ) : isError ? (
            <SectionError message={t("plugins.error")} onRetry={retry} />
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
