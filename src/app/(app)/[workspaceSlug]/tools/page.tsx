"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowsDownUp,
  BookOpen,
  Brain,
  CalendarBlank,
  CaretDown,
  CaretUp,
  ChartBar,
  ChatsCircle,
  Check,
  Copy,
  FileMagnifyingGlass,
  FileText,
  Info,
  Lightbulb,
  MagnifyingGlass,
  MagnifyingGlassPlus,
  PaperPlaneRight,
  Plus,
  PuzzlePiece,
  ShieldCheck,
  TerminalWindow,
  Translate,
  Users,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  WARPBOT_TOOLS_CATALOG,
} from "@/lib/assistant/warpbot-tools-catalog";
import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";

type MainTab = "skills" | "connectors" | "plugins";
type SubFilter = "discover" | "yours" | "admin";
type SortOption = "name-asc" | "name-desc" | "category";

function renderToolGlyph(iconName: string, className = "size-4 text-ink-muted") {
  switch (iconName) {
    case "Brain":
      return <Brain className={className} weight="duotone" />;
    case "VideoCamera":
      return <VideoCamera className={className} weight="duotone" />;
    case "CalendarBlank":
      return <CalendarBlank className={className} weight="duotone" />;
    case "Info":
      return <Info className={className} weight="duotone" />;
    case "ChatsCircle":
      return <ChatsCircle className={className} weight="duotone" />;
    case "Translate":
      return <Translate className={className} weight="duotone" />;
    case "BookOpen":
      return <BookOpen className={className} weight="duotone" />;
    case "Lightbulb":
      return <Lightbulb className={className} weight="duotone" />;
    case "MagnifyingGlassPlus":
      return <MagnifyingGlassPlus className={className} weight="duotone" />;
    case "FileText":
      return <FileText className={className} weight="duotone" />;
    case "FileMagnifyingGlass":
      return <FileMagnifyingGlass className={className} weight="duotone" />;
    case "Users":
      return <Users className={className} weight="duotone" />;
    case "ChartBar":
      return <ChartBar className={className} weight="duotone" />;
    default:
      return <TerminalWindow className={className} weight="duotone" />;
  }
}

export default function WarpBotCustomizePage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug || "workspace";

  const [activeMainTab, setActiveMainTab] = useState<MainTab>("skills");
  const [activeSubFilter, setActiveSubFilter] = useState<SubFilter>("discover");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const askWarpBot = useAssistantWidgetStore((state) => state.askWarpBot);

  const filteredTools = useMemo(() => {
    let list = [...WARPBOT_TOOLS_CATALOG];

    // Filter by sub filter
    if (activeSubFilter === "yours") {
      list = list.filter((t) => !t.isAdminOnly);
    } else if (activeSubFilter === "admin") {
      list = list.filter((t) => t.isAdminOnly);
    }

    // Filter by search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((tool) => {
        return (
          tool.id.toLowerCase().includes(q) ||
          tool.name.toLowerCase().includes(q) ||
          tool.shortDescription.toLowerCase().includes(q) ||
          tool.categoryLabel.toLowerCase().includes(q) ||
          tool.samplePrompts.some((p) => p.toLowerCase().includes(q))
        );
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "name-asc") return a.id.localeCompare(b.id);
      if (sortBy === "name-desc") return b.id.localeCompare(a.id);
      if (sortBy === "category") return a.category.localeCompare(b.category);
      return 0;
    });

    return list;
  }, [activeSubFilter, searchQuery, sortBy]);

  const toggleSort = () => {
    setSortBy((prev) => (prev === "name-asc" ? "name-desc" : prev === "name-desc" ? "category" : "name-asc"));
  };

  const handleTryPrompt = (prompt: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    askWarpBot(prompt);
    toast.success("Loaded prompt into WarpBot chat panel!");
  };

  const handleCopyPrompt = async (prompt: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(prompt);
      toast.success("Prompt copied to clipboard");
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch {
      toast.error("Failed to copy prompt");
    }
  };

  return (
    <div className="min-h-screen bg-[#111110] text-[#ececed] selection:bg-primary/30">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
        {/* Title */}
        <h1 className="text-3xl font-semibold tracking-tight text-white">Customize</h1>

        {/* Top Controls Bar matching Claude UI */}
        <div className="mt-6 flex flex-col gap-4 border-b border-[#262624] pb-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left Tabs Group */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Primary Pills */}
            <div className="inline-flex items-center gap-1 rounded-full bg-[#1e1e1d] p-1 border border-[#2a2a28]">
              <button
                type="button"
                onClick={() => setActiveMainTab("skills")}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
                  activeMainTab === "skills"
                    ? "bg-[#2d2d2b] text-white shadow-xs"
                    : "text-[#949491] hover:text-white"
                }`}
              >
                Skills
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab("connectors")}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
                  activeMainTab === "connectors"
                    ? "bg-[#2d2d2b] text-white shadow-xs"
                    : "text-[#949491] hover:text-white"
                }`}
              >
                Connectors
              </button>
              <Link
                href={`/${workspaceSlug}/settings/plugins`}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
                  activeMainTab === "plugins"
                    ? "bg-[#2d2d2b] text-white shadow-xs"
                    : "text-[#949491] hover:text-white"
                }`}
              >
                Plugins
              </Link>
            </div>

            {/* Vertical Separator */}
            <div className="h-5 w-px bg-[#2a2a28]" />

            {/* Sub-filter Pills (Yours / Discover / Admin) */}
            <div className="inline-flex items-center gap-1 rounded-full bg-[#1e1e1d] p-1 border border-[#2a2a28]">
              <button
                type="button"
                onClick={() => setActiveSubFilter("yours")}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
                  activeSubFilter === "yours"
                    ? "bg-[#2d2d2b] text-white shadow-xs"
                    : "text-[#949491] hover:text-white"
                }`}
              >
                Yours
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("discover")}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
                  activeSubFilter === "discover"
                    ? "bg-[#2d2d2b] text-white shadow-xs"
                    : "text-[#949491] hover:text-white"
                }`}
              >
                Discover
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("admin")}
                className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                  activeSubFilter === "admin"
                    ? "bg-[#2d2d2b] text-purple-300 shadow-xs"
                    : "text-[#949491] hover:text-purple-300"
                }`}
              >
                Admin Only
              </button>
            </div>
          </div>

          {/* Right Controls: Search, Sort, Add Button */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#757572]"
                weight="bold"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills and plugins"
                className="w-full rounded-lg border border-[#2a2a28] bg-[#1a1a19] py-1.5 pr-8 pl-9 text-[13px] text-white placeholder:text-[#6e6e6b] transition-colors focus:border-[#40403d] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#757572] hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Sort Button */}
            <button
              type="button"
              onClick={toggleSort}
              title={`Sort by: ${sortBy}`}
              className="flex size-8 items-center justify-center rounded-lg border border-[#2a2a28] bg-[#1a1a19] text-[#949491] transition-colors hover:border-[#383835] hover:text-white"
            >
              <ArrowsDownUp className="size-4" weight="bold" />
            </button>

            {/* Add Button matching Claude UI */}
            <Link
              href={`/${workspaceSlug}/settings/plugins`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a28] bg-white px-3 py-1.5 text-[13px] font-medium text-black transition-colors hover:bg-neutral-200"
            >
              <Plus className="size-3.5" weight="bold" />
              <span>Add</span>
              <CaretDown className="size-3 text-neutral-600" weight="bold" />
            </Link>
          </div>
        </div>

        {/* Connectors / Plugins Tab Placeholder */}
        {activeMainTab === "connectors" && (
          <div className="mt-8 rounded-xl border border-[#262624] bg-[#181817] p-8 text-center">
            <PuzzlePiece className="mx-auto size-10 text-[#757572]" weight="duotone" />
            <h3 className="mt-3 text-[16px] font-semibold text-white">Remote Model Context Protocol (MCP) Connectors</h3>
            <p className="mt-1 text-[13.5px] text-[#949491] max-w-md mx-auto">
              WarpBot connects directly to external MCP servers to execute custom tools and synchronize remote context.
            </p>
            <Link
              href={`/${workspaceSlug}/settings/plugins`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#383835] bg-[#222220] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#2d2d2a]"
            >
              Manage Plugins & Connectors
            </Link>
          </div>
        )}

        {/* Skills / Tools List matching Claude List View */}
        {activeMainTab === "skills" && (
          <div className="mt-2 divide-y divide-[#21211f]">
            {filteredTools.length > 0 ? (
              filteredTools.map((tool) => {
                const isExpanded = expandedToolId === tool.id;
                return (
                  <div
                    key={tool.id}
                    onClick={() => setExpandedToolId(isExpanded ? null : tool.id)}
                    className="group cursor-pointer py-3.5 transition-colors hover:bg-[#161615]/80 px-2 rounded-lg"
                  >
                    {/* Main Row */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: Icon + Content */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Square Icon Glyph */}
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a28] bg-[#1a1a19] text-[#a0a09d] group-hover:border-[#3a3a37] group-hover:text-white transition-colors">
                          {renderToolGlyph(tool.iconName, "size-4.5")}
                        </div>

                        {/* Title and Byline */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[14px] text-white tracking-tight">
                              {tool.id}
                            </span>
                            {tool.isAdminOnly && (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10.5px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/25">
                                <ShieldCheck weight="fill" className="size-3" />
                                Admin Master
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#8e8e8b] truncate">
                            <span className="text-[#a8a8a5] shrink-0">by WarpTalk AI</span>
                            <span className="shrink-0 text-[#555552]">·</span>
                            <span className="truncate">{tool.shortDescription}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleTryPrompt(tool.samplePrompts[0], e)}
                          className="rounded-lg border border-[#30302d] bg-[#1f1f1e] px-3.5 py-1 text-[13px] font-medium text-white transition-colors hover:border-[#444440] hover:bg-[#2a2a28]"
                        >
                          Try in WarpBot
                        </button>
                        <div className="text-[#666663] group-hover:text-white transition-colors">
                          {isExpanded ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Details Section */}
                    {isExpanded && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3.5 ml-12 rounded-xl border border-[#2a2a28] bg-[#181817] p-4 text-[13px] text-[#b3b3af] space-y-3 cursor-default"
                      >
                        <div>
                          <span className="font-semibold text-white">{tool.name}</span>
                          <span className="ml-2 text-[12px] text-[#82827e]">({tool.categoryLabel})</span>
                          <p className="mt-1 text-[#a3a39e] leading-relaxed">{tool.detailedDescription}</p>
                        </div>

                        {/* Parameters */}
                        {tool.parametersSummary.length > 0 && (
                          <div className="rounded-lg border border-[#252523] bg-[#131312] p-2.5">
                            <span className="text-[11px] font-semibold text-[#7e7e7a] uppercase tracking-wider">
                              Inputs & Parameters
                            </span>
                            <ul className="mt-1 space-y-0.5">
                              {tool.parametersSummary.map((param, idx) => (
                                <li key={idx} className="flex items-start gap-1.5 text-[12px] text-[#9c9c97]">
                                  <span className="text-primary font-mono">•</span>
                                  <span>{param}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Sample Prompts */}
                        <div>
                          <span className="text-[11px] font-semibold text-[#7e7e7a] uppercase tracking-wider">
                            Sample Prompts
                          </span>
                          <div className="mt-1.5 space-y-1.5">
                            {tool.samplePrompts.map((prompt, pIdx) => {
                              const isCopied = copiedPrompt === prompt;
                              return (
                                <div
                                  key={pIdx}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-[#282826] bg-[#1c1c1b] px-3 py-1.5 text-[12.5px]"
                                >
                                  <span className="italic text-[#d0d0cc] truncate">&ldquo;{prompt}&rdquo;</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyPrompt(prompt, e)}
                                      title="Copy prompt"
                                      className="flex size-6 items-center justify-center rounded border border-[#2f2f2c] bg-[#161615] text-[#858581] hover:text-white transition-colors"
                                    >
                                      {isCopied ? (
                                        <Check className="size-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleTryPrompt(prompt, e)}
                                      className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary hover:bg-primary hover:text-white transition-colors"
                                    >
                                      <PaperPlaneRight weight="bold" className="size-3" />
                                      <span>Use Prompt</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center text-[#7a7a76]">
                <p className="text-[14px]">No tools found matching your current filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveSubFilter("discover");
                  }}
                  className="mt-3 text-[13px] text-primary hover:underline"
                >
                  Clear search filter
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
