"use client";

import { useMemo, useState } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  MagnifyingGlass,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Spinner,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAssistantPlugins,
  useDisableAssistantPlugin,
  useDisconnectAssistantPlugin,
  useInstallAssistantPlugin,
  usePluginConnectUrl,
} from "@/hooks/use-assistant";
import { type PluginDisplayTile, toDisplayTiles } from "@/lib/assistant/plugin-tiles";
import { cn } from "@/lib/utils";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

/**
 * Rows needed before the catalog is laid out in two columns.
 *
 * The two-column marketplace this section is modelled on assumes a catalog deep enough to fill
 * both columns. One plugin is seeded, so `md:grid-cols-2` spent half the section on an empty
 * right-hand column that read as a rendering fault rather than as a short catalog. Under this
 * many rows the section becomes a single full-width list instead — deliberate at any depth, and
 * it goes back to two columns on its own once the catalog grows.
 */
const CATALOG_TWO_COLUMN_MINIMUM = 4;

function pluginActionLabel(plugin: AssistantPluginCatalogItemDto) {
  if (plugin.installationStatus === "disabled") return "Enable";
  if (plugin.installationStatus !== "installed") return "Install";
  if (plugin.connectionStatus === "connected") return "Manage";
  if (plugin.connectionStatus === "expired" || plugin.connectionStatus === "revoked") return "Reconnect";
  return "Connect";
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
  isDisconnecting,
  isRemoving,
  onClose,
  onContinue,
  onDisconnect,
  onRemove,
}: {
  plugin: PluginDisplayTile;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isRemoving: boolean;
  onClose: () => void;
  onContinue: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<"disconnect" | "remove" | null>(null);
  const isConnected = plugin.connectionStatus === "connected";
  const isInstalled = plugin.installationStatus === "installed";
  const isPendingBusy = isDisconnecting || isRemoving;

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
          {plugin.sharedConnectionWith.length ? (
            <div className="py-4">
              <h3 className="text-sm font-semibold text-ink">Shares a connection with {plugin.sharedConnectionWith.join(", ")}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                One sign-in covers both. Google&apos;s consent screen lets you grant only what you need — decline the rest there and reconnect later to add it.
              </p>
            </div>
          ) : null}
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

        {isInstalled ? (
          <div className="mt-5 border-t border-border pt-4">
            {pendingAction ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-sm leading-6 text-ink-muted">
                  {pendingAction === "disconnect"
                    ? `Disconnect ${plugin.label}? WarpBot loses access to it until you connect the account again.`
                    : `Remove ${plugin.label}? Its tools disappear from WarpBot and any connected account is disconnected.`}
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPendingBusy}
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isPendingBusy}
                    onClick={() => (pendingAction === "disconnect" ? onDisconnect() : onRemove())}
                  >
                    {isPendingBusy ? <Spinner className="animate-spin" size={14} /> : null}
                    {pendingAction === "disconnect" ? "Disconnect" : "Remove"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-muted">Manage this plugin for your own account</span>
                <div className="flex gap-2">
                  {isConnected ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingAction("disconnect")}
                    >
                      <Plugs size={15} />
                      Disconnect
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingAction("remove")}
                  >
                    <Trash size={15} />
                    Remove
                  </Button>
                </div>
              </div>
            )}
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
  const disconnectPlugin = useDisconnectAssistantPlugin();
  const disablePlugin = useDisableAssistantPlugin();

  const [query, setQuery] = useState("");
  const [selectedPlugin, setSelectedPlugin] = useState<PluginDisplayTile | null>(null);
  const [browserConnect, setBrowserConnect] = useState<{ plugin: PluginDisplayTile; url: string } | null>(null);

  const displayPlugins = useMemo(() => plugins.flatMap(toDisplayTiles), [plugins]);

  const installedPlugins = useMemo(
    () => displayPlugins.filter((plugin) => plugin.installationStatus === "installed"),
    [displayPlugins],
  );

  const filteredPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return displayPlugins;
    return displayPlugins.filter((plugin) =>
      [plugin.label, plugin.description, plugin.key].join(" ").toLowerCase().includes(normalized),
    );
  }, [displayPlugins, query]);

  async function handlePrimaryAction(plugin: PluginDisplayTile) {
    if (plugin.installationStatus !== "installed") {
      await installPlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} installed`);
      return;
    }

    setSelectedPlugin(plugin);
  }

  async function continueToProvider(plugin: PluginDisplayTile) {
    const result = await connectUrl.mutateAsync({ pluginKey: plugin.key });
    setBrowserConnect({ plugin, url: result.url });
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function disconnectSelected(plugin: PluginDisplayTile) {
    await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
    toast.success(`${plugin.label} disconnected`);
    setSelectedPlugin(null);
  }

  async function removeSelected(plugin: PluginDisplayTile) {
    // Disabling the installation leaves the stored provider tokens behind, which is
    // not what "Remove" reads like to the person clicking it.
    if (plugin.connectionStatus === "connected") {
      await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
    }
    await disablePlugin.mutateAsync({ pluginKey: plugin.key });
    toast.success(`${plugin.label} removed`);
    setSelectedPlugin(null);
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
                key={plugin.tileId}
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
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-6">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <PuzzlePiece size={16} weight="duotone" />
              {query.trim()
                ? `No plugins match "${query.trim()}".`
                : "No plugins are available yet."}
            </div>
            {query.trim() ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-x-10 gap-y-3",
              filteredPlugins.length >= CATALOG_TWO_COLUMN_MINIMUM && "md:grid-cols-2",
            )}
          >
            {filteredPlugins.map((plugin) => (
              <div
                key={plugin.tileId}
                className={cn(
                  "grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-2",
                  filteredPlugins.length < CATALOG_TWO_COLUMN_MINIMUM &&
                    "rounded-xl border border-border bg-surface-1 px-3 py-3",
                )}
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
          isDisconnecting={disconnectPlugin.isPending}
          isRemoving={disablePlugin.isPending}
          onClose={() => setSelectedPlugin(null)}
          onContinue={() => void continueToProvider(selectedPlugin)}
          onDisconnect={() => void disconnectSelected(selectedPlugin)}
          onRemove={() => void removeSelected(selectedPlugin)}
        />
      ) : null}
    </div>
  );
}
