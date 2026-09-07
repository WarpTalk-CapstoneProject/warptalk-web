"use client";

import { useMemo, useState } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  MagnifyingGlass,
  Plugs,
  PlugsConnected,
  Prohibit,
  PuzzlePiece,
  Spinner,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { openProviderConsent } from "@/lib/assistant/open-provider-consent";

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
import {
  formatPluginLabelList,
  pluginWorkspaceBlock,
  pluginsSharingConnection,
  sharedConnectionWarning,
  withEffectiveConnectionStatus,
  type PluginWorkspaceBlock,
} from "@/lib/assistant/plugin-connection";
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
  // An installed row the workspace refuses cannot be connected or reconnected, so offering either
  // word would be an instruction that leads to a refusal. "Manage" is the honest one: the dialog
  // it opens still lets the plugin be disconnected and removed.
  if (pluginWorkspaceBlock(plugin)) return "Manage";
  if (plugin.connectionStatus === "connected") return "Manage";
  if (plugin.connectionStatus === "expired" || plugin.connectionStatus === "revoked") return "Reconnect";
  return "Connect";
}

/**
 * A row the workspace's plugin policy refuses.
 *
 * The row stays on the page rather than disappearing, which is the backend's choice as much as
 * this page's: a user whose workspace narrowed its allowlist under an already-connected plugin
 * still holds a live OAuth grant, and hiding the row would leave them no way to revoke it. So
 * install and connect are refused here and disconnect and remove are not.
 *
 * `block.reason` is the backend's own sentence, printed verbatim. `block.remedy` is the part a
 * member can act on, and it differs by refusal: a workspace that permits some plugins but not this
 * one is fixed by an admin adding one key, and a workspace with personal plugins switched off
 * entirely is not. It is null when the reason could not be classified, in which case nobody is
 * told to go and ask for something that would not help.
 */
function WorkspaceBlockNotice({
  block,
  className,
}: {
  block: PluginWorkspaceBlock;
  className?: string;
}) {
  return (
    <div
      data-testid="workspace-policy-block"
      className={cn(
        "flex items-start gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2 text-left",
        className,
      )}
    >
      <Prohibit size={16} weight="fill" className="mt-0.5 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <p className="text-xs font-medium leading-5 text-ink">{block.reason}</p>
        {block.remedy ? (
          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{block.remedy}</p>
        ) : null}
      </div>
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

function ConnectPluginDialog({
  plugin,
  sharedConnectionPlugins,
  isConnecting,
  isDisconnecting,
  isRemoving,
  onClose,
  onContinue,
  onDisconnect,
  onRemove,
}: {
  plugin: AssistantPluginCatalogItemDto;
  /** The other installed rows this plugin's OAuth grant also backs. */
  sharedConnectionPlugins: AssistantPluginCatalogItemDto[];
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
  const workspaceBlock = pluginWorkspaceBlock(plugin);
  // Both confirmations need it: "Remove" disconnects on its way out, so it ends the shared grant
  // for exactly the same set of plugins that "Disconnect" does.
  const sharedWarning = sharedConnectionWarning(sharedConnectionPlugins);

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

        {workspaceBlock ? (
          <WorkspaceBlockNotice block={workspaceBlock} className="mt-6" />
        ) : null}

        <Button
          type="button"
          // Connecting is what workspace policy actually refuses. Disconnect and Remove below stay
          // live on a blocked row on purpose — see WorkspaceBlockNotice.
          disabled={isConnecting || workspaceBlock !== null}
          onClick={onContinue}
          className={cn("h-10 w-full", workspaceBlock ? "mt-3" : "mt-6")}
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
                {/* The collateral this dialog used to keep to itself. A connection is keyed by
                    provider, so ending it ends every plugin behind the same grant — a user
                    disconnecting Drive to tidy up silently lost Calendar and Meet with it. */}
                {sharedWarning ? (
                  <p
                    data-testid="shared-connection-warning"
                    className="flex items-start gap-2 text-sm leading-6 text-amber-700 dark:text-amber-500"
                  >
                    <Warning size={16} weight="fill" className="mt-1 shrink-0" />
                    <span>{sharedWarning}</span>
                  </p>
                ) : null}
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
  const [selectedPlugin, setSelectedPlugin] = useState<AssistantPluginCatalogItemDto | null>(null);
  const [browserConnect, setBrowserConnect] =
    useState<{ plugin: AssistantPluginCatalogItemDto; url: string } | null>(null);

  // One pass over the catalog, so the action label, the connect dialog's "Connected as ..." line
  // and everything below read the same status — see plugin-connection.ts for why a connected
  // Google account can still leave an individual plugin unusable.
  //
  // ORDERING
  //   Operator curation first (`isFeatured`, then `sortOrder`), label last. All three arrive from
  //   the catalog now; before WT-646 they stopped at the admin DTO, and this page sorted by label
  //   alone because that was the only ordering it could honestly produce.
  //
  //   Every field is still read defensively: a server older than WT-646 sends none of them, and
  //   `undefined` must degrade to "not featured, unordered" rather than to NaN comparisons that
  //   scramble the list. `category` is null on every row today, so nothing groups by it yet.
  //
  const catalogPlugins = useMemo(
    () =>
      plugins
        .map(withEffectiveConnectionStatus)
        .sort((a, b) => {
          if ((a.isFeatured ?? false) !== (b.isFeatured ?? false)) return a.isFeatured ? -1 : 1;
          const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          return order !== 0 ? order : a.label.localeCompare(b.label);
        }),
    [plugins],
  );

  const installedPlugins = useMemo(
    () => catalogPlugins.filter((plugin) => plugin.installationStatus === "installed"),
    [catalogPlugins],
  );

  // Which other installed plugins go down with this one, because a connection is keyed by provider
  // and one grant backs several rows. Derived from the catalog, never from a list of Google keys.
  const sharedConnectionPlugins = useMemo(
    () => (selectedPlugin ? pluginsSharingConnection(selectedPlugin, catalogPlugins) : []),
    [selectedPlugin, catalogPlugins],
  );

  // Purely local: it narrows the catalog already fetched above. There is no marketplace search
  // behind it, and the empty state must not pretend otherwise.
  const filteredPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return catalogPlugins;
    return catalogPlugins.filter((plugin) =>
      [plugin.label, plugin.description, plugin.key].join(" ").toLowerCase().includes(normalized),
    );
  }, [catalogPlugins, query]);

  async function handlePrimaryAction(plugin: AssistantPluginCatalogItemDto) {
    // Second lock on the one thing workspace policy refuses, so a stale render cannot fire an
    // install the backend is going to reject. Deliberately narrow: a blocked row that IS installed
    // still opens the dialog, because that dialog is where Disconnect and Remove live and a
    // blocked plugin may be holding a live OAuth grant the user needs to revoke.
    if (plugin.installationStatus !== "installed" && pluginWorkspaceBlock(plugin)) return;

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

  async function continueToProvider(plugin: AssistantPluginCatalogItemDto) {
    try {
      const result = await connectUrl.mutateAsync({ pluginKey: plugin.key });
      setBrowserConnect({ plugin, url: result.url });
      openProviderConsent(result.url);
    } catch {
      toast.error(`Could not start the ${plugin.label} connection.`);
    }
  }

  async function disconnectSelected(plugin: AssistantPluginCatalogItemDto) {
    try {
      await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
      // The confirmation named the siblings; the receipt names them too, so the record of what
      // just happened is not narrower than what happened.
      const alsoDisconnected = sharedConnectionPlugins.map((sibling) => sibling.label);
      toast.success(
        alsoDisconnected.length
          ? `${plugin.label} disconnected, along with ${formatPluginLabelList(alsoDisconnected)}`
          : `${plugin.label} disconnected`,
      );
      setSelectedPlugin(null);
    } catch {
      toast.error(`Could not disconnect ${plugin.label}.`);
    }
  }

  async function removeSelected(plugin: AssistantPluginCatalogItemDto) {
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
          placeholder="Filter plugins"
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
          {/* Was "Featured", above the entire catalog, when nothing selected the rows under it.
              `isFeatured` reaches this page now and drives the ordering, so featured rows really
              do come first — but they are still every row in one list, and heading the whole list
              "Featured" would be the same untrue claim as before. A separate featured band is a
              layout change (it has its own empty, filtered and two-column cases) and belongs with
              whoever designs it, not smuggled in behind a sort. */}
          <h2 className="text-sm font-semibold text-ink">All plugins</h2>
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
                ? `No plugin in this catalog matches "${query.trim()}".`
                : "No plugins are available yet."}
            </div>
            {query.trim() ? (
              <>
                {/* The box above narrows the list on this page. Saying "no results" alone would
                    read as "WarpTalk has searched and found nothing", which it has not done. */}
                <p className="text-xs text-ink-subtle">
                  This filters the plugins WarpTalk offers today. It does not search a wider marketplace.
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setQuery("")}>
                  Clear filter
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-x-10 gap-y-3",
              filteredPlugins.length >= CATALOG_TWO_COLUMN_MINIMUM && "md:grid-cols-2",
            )}
          >
            {filteredPlugins.map((plugin) => {
              const workspaceBlock = pluginWorkspaceBlock(plugin);
              // Blocked rows are still listed and still openable — the dialog behind them is the
              // only way to revoke a grant this workspace no longer permits. What policy refuses
              // is adding the plugin, so that is the only button that goes dead.
              const isInstalled = plugin.installationStatus === "installed";
              const isBlockedFromAdding = workspaceBlock !== null && !isInstalled;

              return (
                <div
                  key={plugin.key}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg px-1 py-2",
                    filteredPlugins.length < CATALOG_TWO_COLUMN_MINIMUM &&
                      "rounded-xl border border-border bg-surface-1 px-3 py-3",
                  )}
                >
                  <div className="grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3">
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
                      disabled={installPlugin.isPending || connectUrl.isPending || isBlockedFromAdding}
                      onClick={() => void handlePrimaryAction(plugin)}
                    >
                      {pluginActionLabel(plugin)}
                    </Button>
                  </div>
                  {workspaceBlock ? <WorkspaceBlockNotice block={workspaceBlock} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedPlugin ? (
        <ConnectPluginDialog
          plugin={selectedPlugin}
          sharedConnectionPlugins={sharedConnectionPlugins}
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
