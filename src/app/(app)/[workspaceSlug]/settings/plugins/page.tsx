"use client";

import { useMemo, useState } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  MagnifyingGlass,
  PlugsConnected,
  PuzzlePiece,
  Spinner,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAssistantPlugins,
  useInstallAssistantPlugin,
  usePluginConnectUrl,
} from "@/hooks/use-assistant";
import { cn } from "@/lib/utils";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

function pluginActionLabel(plugin: AssistantPluginCatalogItemDto) {
  if (plugin.installationStatus === "disabled") return "Enable";
  if (plugin.installationStatus !== "installed") return "Install";
  if (plugin.connectionStatus === "connected") return "Manage";
  if (plugin.connectionStatus === "expired" || plugin.connectionStatus === "revoked") return "Reconnect";
  return "Connect";
}

function PluginGlyph({
  plugin,
  size = "md",
}: {
  plugin: AssistantPluginCatalogItemDto;
  size?: "sm" | "md" | "lg";
}) {
  const initials = plugin.label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-ink shadow-sm",
        size === "sm" && "size-8 text-[10px]",
        size === "md" && "size-10 text-xs",
        size === "lg" && "size-14 text-sm",
      )}
      title={plugin.label}
    >
      {plugin.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={plugin.avatarUrl} alt="" className="size-full rounded-lg object-cover" />
      ) : (
        initials || <PuzzlePiece size={size === "lg" ? 24 : 16} weight="duotone" />
      )}
    </div>
  );
}

function ConnectionNotice({
  plugin,
  url,
  onDismiss,
}: {
  plugin: AssistantPluginCatalogItemDto;
  url: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed left-1/2 top-3 z-[70] flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 text-ink shadow-lg">
      <PluginGlyph plugin={plugin} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        Finish connecting {plugin.label} in your browser
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        Open browser
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss connection notice"
        onClick={onDismiss}
      >
        <X size={14} />
      </Button>
    </div>
  );
}

function ConnectPluginDialog({
  plugin,
  isConnecting,
  onClose,
  onContinue,
}: {
  plugin: AssistantPluginCatalogItemDto;
  isConnecting: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const isConnected = plugin.connectionStatus === "connected";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4">
      <section className="relative w-full max-w-[560px] rounded-2xl border border-border bg-popover p-6 text-ink shadow-2xl">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close plugin dialog"
          onClick={onClose}
          className="absolute right-4 top-4"
        >
          <X size={16} />
        </Button>

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-xl border border-border bg-surface-2 text-ink">
              <PlugsConnected size={26} weight="duotone" />
            </div>
            <span className="text-ink-subtle">...</span>
            <PluginGlyph plugin={plugin} size="lg" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Connect {plugin.label}</h2>
            <p className="mt-1 text-sm text-ink-muted">Developed for WarpTalk</p>
          </div>
        </div>

        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface-1 px-4">
          <div className="py-4">
            <h3 className="text-sm font-semibold text-ink">This page will redirect to your provider</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              You will sign in and confirm permissions on the provider page.
            </p>
          </div>
          <div className="py-4">
            <h3 className="text-sm font-semibold text-ink">Private and secure</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              WarpBot uses connected app data only to answer your request or perform the action you confirm.
              OAuth credentials stay encrypted in WarpTalk backend services.
            </p>
          </div>
          <div className="py-4">
            <h3 className="text-sm font-semibold text-ink">You are in control of your data</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              You can disconnect this plugin from your personal settings. Write actions require confirmation before execution.
            </p>
          </div>
        </div>

        <Button
          type="button"
          disabled={isConnecting}
          onClick={onContinue}
          className="mt-6 h-10 w-full"
        >
          {isConnecting ? <Spinner className="animate-spin" size={16} /> : null}
          Continue to {plugin.label}
          <ArrowSquareOut size={16} />
        </Button>

        {isConnected ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-600">
            <CheckCircle size={15} weight="fill" />
            Connected as {plugin.connectedAccountEmail ?? "this account"}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function PluginsPage() {
  const { data: plugins = [], isLoading, isError, refetch } = useAssistantPlugins();
  const installPlugin = useInstallAssistantPlugin();
  const connectUrl = usePluginConnectUrl();

  const [query, setQuery] = useState("");
  const [selectedPlugin, setSelectedPlugin] = useState<AssistantPluginCatalogItemDto | null>(null);
  const [browserConnect, setBrowserConnect] = useState<{ plugin: AssistantPluginCatalogItemDto; url: string } | null>(null);

  const installedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.installationStatus === "installed"),
    [plugins],
  );

  const filteredPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return plugins;
    return plugins.filter((plugin) =>
      [plugin.label, plugin.description, plugin.key].join(" ").toLowerCase().includes(normalized),
    );
  }, [plugins, query]);

  async function handlePrimaryAction(plugin: AssistantPluginCatalogItemDto) {
    if (plugin.installationStatus !== "installed") {
      await installPlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} installed`);
      return;
    }

    setSelectedPlugin(plugin);
  }

  async function continueToProvider(plugin: AssistantPluginCatalogItemDto) {
    const result = await connectUrl.mutateAsync({ pluginKey: plugin.key });
    setBrowserConnect({ plugin, url: result.url });
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-ink">
      {browserConnect ? (
        <ConnectionNotice
          plugin={browserConnect.plugin}
          url={browserConnect.url}
          onDismiss={() => setBrowserConnect(null)}
        />
      ) : null}

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Plugins</h1>
        <p className="text-xs text-ink-muted">Work with WarpBot across your favorite tools.</p>
      </header>

      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={16} />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plugins"
          className="h-9 rounded-full bg-surface-1 pl-9 text-sm"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-ink">Installed</h2>
        </div>
        {installedPlugins.length ? (
          <div className="flex flex-wrap gap-3">
            {installedPlugins.map((plugin) => (
              <button
                type="button"
                key={plugin.key}
                onClick={() => setSelectedPlugin(plugin)}
                className="rounded-lg transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                title={plugin.label}
              >
                <PluginGlyph plugin={plugin} />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <PlugsConnected size={16} weight="duotone" />
            No plugins installed yet.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-ink">Featured</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
            <Spinner className="animate-spin" size={16} />
            Loading plugins...
          </div>
        ) : isError ? (
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardContent className="flex items-center justify-between gap-3 px-0">
              <span className="text-sm text-destructive">Could not load plugins.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
            {filteredPlugins.map((plugin) => (
              <div
                key={plugin.key}
                className="grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-2"
              >
                <PluginGlyph plugin={plugin} />
                <button
                  type="button"
                  onClick={() => setSelectedPlugin(plugin)}
                  className="min-w-0 text-left"
                >
                  <div className="truncate text-sm font-semibold text-ink">{plugin.label}</div>
                  <div className="truncate text-xs text-ink-muted">{plugin.description}</div>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={installPlugin.isPending || connectUrl.isPending}
                  onClick={() => void handlePrimaryAction(plugin)}
                >
                  {pluginActionLabel(plugin)}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedPlugin ? (
        <ConnectPluginDialog
          plugin={selectedPlugin}
          isConnecting={connectUrl.isPending}
          onClose={() => setSelectedPlugin(null)}
          onContinue={() => void continueToProvider(selectedPlugin)}
        />
      ) : null}
    </div>
  );
}
