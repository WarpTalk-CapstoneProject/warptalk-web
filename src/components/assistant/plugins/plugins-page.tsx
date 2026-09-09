"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  Lock,
  MagnifyingGlass,
  Plugs,
  PlugsConnected,
  Prohibit,
  PuzzlePiece,
  ShieldCheck,
  Spinner,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { openProviderConsent } from "@/lib/assistant/open-provider-consent";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { WarpTalkBrand } from "@/components/layout/warptalk-brand";
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
import {
  CONNECT_CHANNEL,
  type ConnectOutcome,
  connectNotice,
  isConnectChannelMessage,
  readConnectOutcome,
} from "@/lib/assistant/connect-outcome";
import { isDesktopApp } from "@/lib/desktop/bridge";
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
        onClick={() => openProviderConsent(url)}
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

/**
 * What this plugin will be able to do, one line per tool.
 *
 * Built from the catalog rather than written per plugin: every tool already carries a human
 * `label` and an `effect`, so the list stays true to what the plugin can actually call and a new
 * catalog row needs no copy. Read tools come first and write tools last, which puts the heaviest
 * permission closest to the button that grants it.
 *
 * An MCP row has an empty tool list until its first successful connect - `tools_json` is a cache
 * of `tools/list` - so there is a real case where this can say nothing, and it says that instead
 * of rendering an empty box.
 */
function PermissionList({ plugin }: { plugin: PluginDisplayTile }) {
  const permissions = useMemo(() => {
    const seen = new Set<string>();
    return plugin.tools
      .map((tool) => ({ label: tool.label || tool.name, effect: tool.effect }))
      .filter((permission) => {
        if (seen.has(permission.label)) return false;
        seen.add(permission.label);
        return true;
      })
      .sort((a, b) => Number(a.effect === "write") - Number(b.effect === "write"));
  }, [plugin.tools]);

  if (!permissions.length) {
    return (
      <p className="mt-6 rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm leading-6 text-ink-muted">
        This plugin publishes its permissions when you connect. The provider&apos;s consent screen lists
        exactly what it is asking for before you approve.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Authorizing allows this plugin to
      </h3>
      <ul className="flex flex-col gap-2.5">
        {permissions.map((permission) => (
          <li key={permission.label} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3">
            <Check size={15} weight="bold" className="mt-1 text-emerald-600" />
            <span className="text-sm leading-6 text-ink">{permission.label}</span>
            <span
              className={cn(
                "mt-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                permission.effect === "write"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border bg-surface-1 text-ink-subtle",
              )}
            >
              {permission.effect}
            </span>
          </li>
        ))}
      </ul>
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

        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-xl border border-border bg-surface-1">
              <WarpTalkBrand compact className="h-6 w-[27px]" />
            </div>
            <span aria-hidden className="flex w-12 items-center gap-1.5 text-ink-subtle">
              <span className="h-px flex-1 border-t border-dashed border-border" />
              <ShieldCheck size={15} />
              <span className="h-px flex-1 border-t border-dashed border-border" />
            </span>
            <PluginGlyph plugin={plugin} size="lg" />
          </div>
          <div>
            <h2 className="text-lg font-medium leading-snug tracking-tight">
              <span className="font-semibold">WarpBot</span> by WarpTalk wants access to your{" "}
              {plugin.label}
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              You will sign in and confirm this on the provider&apos;s own page.
            </p>
          </div>
        </div>

        <PermissionList plugin={plugin} />

        <div className="mt-5 flex flex-col gap-2.5 border-t border-border pt-4">
          <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
            <Prohibit size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            WarpTalk is not owned or operated by this provider.
          </p>
          <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
            <Lock size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            Tokens stay encrypted. Every <span className="font-medium text-ink">write</span> action asks you first.
          </p>
          {plugin.sharedConnectionWith.length ? (
            <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
              <PlugsConnected size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
              One sign-in also covers{" "}
              <span className="font-medium text-ink">{plugin.sharedConnectionWith.join(", ")}</span>. You can
              grant only part of it and come back for the rest.
            </p>
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
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // A finished connect arrives as a full page load carrying what happened, so the query is read
  // once at mount and held from there. The effect below then strips it: left in the URL it would
  // replay the message on every refresh, and ride along in any link copied out of the address bar.
  const [outcome, setOutcome] = useState<ConnectOutcome | null>(() => readConnectOutcome(searchParams));

  useEffect(() => {
    if (searchParams.has("status")) router.replace(pathname);
  }, [pathname, router, searchParams]);

  // The consent finishes in a second tab, which cannot reach this one directly - it was opened
  // with `noopener`. It broadcasts the outcome on its way to the plugins page, so the tab the
  // user started from stops showing a plugin as unconnected the moment the other one finishes.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CONNECT_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isConnectChannelMessage(event.data)) return;
      setOutcome(event.data.outcome);
      void refetch();
    };

    return () => channel.close();
  }, [refetch]);

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
      try {
        await installPlugin.mutateAsync({ pluginKey: plugin.key });
        toast.success(`${plugin.label} installed`);
      } catch {
        // Without this the button simply does nothing on a 500: the label never changes, no
        // toast appears, and the only trace is an unhandled rejection in the console.
        toast.error(`Could not install ${plugin.label}.`);
      }
      return;
    }

    setSelectedPlugin(plugin);
  }

  async function continueToProvider(plugin: PluginDisplayTile) {
    try {
      const result = await connectUrl.mutateAsync({
        pluginKey: plugin.key,
        // Sealed into the OAuth state by the API. The desktop app hands consent to the system
        // browser, so this is the only moment the flow still knows where it started.
        client: isDesktopApp() ? "desktop" : "web",
      });
      setBrowserConnect({ plugin, url: result.url });
      openProviderConsent(result.url);
    } catch {
      toast.error(`Could not start the ${plugin.label} connection.`);
    }
  }

  async function disconnectSelected(plugin: PluginDisplayTile) {
    try {
      await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} disconnected`);
      setSelectedPlugin(null);
    } catch {
      toast.error(`Could not disconnect ${plugin.label}.`);
    }
  }

  async function removeSelected(plugin: PluginDisplayTile) {
    // Disabling the installation leaves the stored provider tokens behind, which is
    // not what "Remove" reads like to the person clicking it.
    try {
      if (plugin.connectionStatus === "connected") {
        await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
      }
      await disablePlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} removed`);
      setSelectedPlugin(null);
    } catch {
      // Two calls, and the first can land while the second throws - which leaves the plugin
      // disconnected but still installed. Saying so beats a silent half-removal.
      toast.error(`Could not finish removing ${plugin.label}.`);
    }
  }

  const outcomePlugin = outcome?.pluginKey
    ? displayPlugins.find((plugin) => plugin.key === outcome.pluginKey) ?? null
    : null;
  const notice = outcome ? connectNotice(outcome, outcomePlugin?.label ?? "This plugin") : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-ink">
      {notice ? (
        <div
          role="status"
          className={cn(
            "grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border px-4 py-3",
            notice.tone === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          <WarningCircle size={17} weight="fill" className="mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{notice.title}</p>
            <p className="text-sm leading-6 opacity-90">{notice.detail}</p>
            {outcome?.reference ? (
              <p className="font-mono text-[11px] opacity-80">ref {outcome.reference}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {notice.action && outcomePlugin ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedPlugin(outcomePlugin)}
              >
                {notice.action === "grant" ? "Grant access" : "Try again"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss message"
              onClick={() => setOutcome(null)}
            >
              <X size={14} />
            </Button>
          </div>
        </div>
      ) : null}

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
