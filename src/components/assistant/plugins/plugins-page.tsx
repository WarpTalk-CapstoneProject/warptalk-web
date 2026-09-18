"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Warning,
  X,
} from "@phosphor-icons/react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { openProviderConsent } from "@/lib/assistant/open-provider-consent";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { WarpTalkBrand } from "@/components/layout/warptalk-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/api/errors";
import {
  useAssistantPlugins,
  useDisableAssistantPlugin,
  useDisconnectAssistantPlugin,
  useConnectPluginWithApiKey,
  useInstallAssistantPlugin,
  usePluginConnectUrl,
} from "@/hooks/use-assistant";
import { useRequestPlugin } from "@/hooks/use-workspace-plugins";
import { memberPluginAction, PLUGIN_REQUEST_REASON_MAX } from "@/lib/assistant/plugin-availability";
import {
  formatPluginLabelList,
  pluginWorkspaceBlock,
  pluginsSharingConnection,
  scopesSatisfied,
  withEffectiveConnectionStatus,
  type PluginWorkspaceBlock,
} from "@/lib/assistant/plugin-connection";
import { isDesktopApp } from "@/lib/desktop/bridge";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type {
  AssistantPluginCatalogItemDto,
  AssistantPluginConnectionStatus,
} from "@/types/assistant";

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
  // WT-687: one action, as in Claude's connector directory. Installing is a step on the way to
  // connecting, not a separate decision the user has to make first — see handlePrimaryAction.
  if (plugin.installationStatus !== "installed") return "Connect";
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
 * this page's: a user whose workspace switched plugins off under an already-connected one still
 * holds a live OAuth grant, and hiding the row would leave them no way to revoke it. So install
 * and connect are refused here and disconnect and remove are not.
 *
 * `block.reason` is the backend's own sentence, printed verbatim. `block.remedy` is the part a
 * member can act on: a workspace configures exactly one thing — whether its members may use
 * plugins at all — so there is one refusal, and asking an Owner or Admin to switch plugins back on
 * is the only next step there is. It is null when the reason could not be classified, in which
 * case nobody is told to go and ask for something that would not help.
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

/**
 * How far a consent round trip has got, as far as this page can honestly tell.
 *
 * Everything but `awaiting` is TERMINAL. The banner used to have only the first state, so a user
 * who cancelled at Google — or who granted Drive and unticked Calendar — came back to a page still
 * cheerfully telling them to finish something that had already finished. A dead end is worse than
 * bad news, and "nothing arrived" is bad news we can actually state.
 */
type ConsentPhase =
  /** Consent is open somewhere and we have not looked at the catalog since. */
  | "awaiting"
  /** `window.open` was refused, so nothing was ever opened. See openProviderConsent. */
  | "blocked"
  /** The user came back and the catalog still shows no connection: cancelled, or it failed. */
  | "unconfirmed"
  /** A grant exists, but this plugin's own scopes were declined on the consent screen. */
  | "partial";

const CONSENT_NOTICE_COPY: Record<
  ConsentPhase,
  { headline: (label: string) => string; detail: string | null; action: string }
> = {
  awaiting: {
    headline: (label) => `Finish connecting ${label} in your browser`,
    detail: null,
    action: "Open browser",
  },
  blocked: {
    headline: (label) => `Your browser blocked the ${label} sign-in window`,
    detail: "Allow pop-ups for WarpTalk, or open it yourself.",
    action: "Open browser",
  },
  unconfirmed: {
    headline: (label) => `WarpTalk did not receive a ${label} connection`,
    detail: "If you closed or cancelled the provider page, nothing was changed.",
    action: "Try again",
  },
  partial: {
    headline: (label) => `${label} is still missing a permission it needs`,
    detail: "Your account is connected, but a permission this plugin asks for was not approved.",
    action: "Try again",
  },
};

function ConnectionNotice({
  plugin,
  phase,
  onAct,
  onDismiss,
}: {
  plugin: AssistantPluginCatalogItemDto;
  phase: ConsentPhase;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const copy = CONSENT_NOTICE_COPY[phase];

  return (
    <div
      data-testid="plugin-consent-notice"
      data-phase={phase}
      className="fixed left-1/2 top-3 z-[70] flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 text-ink shadow-lg"
    >
      <PluginGlyph plugin={plugin} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{copy.headline(plugin.label)}</p>
        {copy.detail ? (
          <p className="truncate text-xs text-ink-muted">{copy.detail}</p>
        ) : null}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onAct}>
        {copy.action}
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
 * catalog row needs no copy of its own. Read tools come first and write tools last, which puts the
 * heaviest permission closest to the button that grants it.
 *
 * An MCP row has an empty tool list until its first successful connect - `tools_json` is a cache
 * of `tools/list` - so there is a real case where this can say nothing, and it says that instead
 * of rendering an empty box.
 */
function PermissionList({ plugin }: { plugin: AssistantPluginCatalogItemDto }) {
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
  providerConnectionStatus,
  sharedConnectionPlugins,
  grantReusedFrom,
  isConnecting,
  isDisconnecting,
  isRemoving,
  onClose,
  onContinue,
  onSubmitApiKey,
  onDisconnect,
  onRemove,
}: {
  /** Mapped through `withEffectiveConnectionStatus` — what this dialog may CLAIM about the plugin. */
  plugin: AssistantPluginCatalogItemDto;
  /**
   * The catalog row's own `connectionStatus`, undowngraded — whether an OAuth grant EXISTS.
   *
   * The two answers part company whenever a user ticks one Google product and unticks another:
   * the grant is live, and the plugin whose scope was declined still reads `not_connected` because
   * it genuinely does not work. Which question is being asked decides which one to read. "Can this
   * plugin do anything?" is the effective status, and it drives the labels above. "Is there a grant
   * to revoke?" is this one, and it drives Disconnect — because a user who unticked a box is
   * exactly the user who most needs the button that ends the grant, and reading the downgraded
   * status here took it away from them.
   */
  providerConnectionStatus: AssistantPluginConnectionStatus;
  /** The other installed rows this plugin's OAuth grant also backs. */
  sharedConnectionPlugins: AssistantPluginCatalogItemDto[];
  /**
   * A connected sibling's grant already covers every scope this plugin needs, so Connect links it
   * on the server without a trip to the provider. The dialog must not promise a sign-in page then,
   * and it names this sibling so the reused account has a visible origin.
   */
  grantReusedFrom: AssistantPluginCatalogItemDto | null;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isRemoving: boolean;
  onClose: () => void;
  onContinue: () => void;
  /** `api_key` rows only. Resolves to an error to show under the field, or null once connected. */
  onSubmitApiKey: (apiKey: string) => Promise<string | null>;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<"disconnect" | "remove" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const usesApiKey = plugin.authMode === "api_key";
  const isConnected = plugin.connectionStatus === "connected";
  const hasProviderGrant = providerConnectionStatus === "connected";
  /** Signed in, but this plugin's own permission was declined — the case Continue actually fixes. */
  const isPartiallyGranted = hasProviderGrant && !isConnected;
  const isInstalled = plugin.installationStatus === "installed";
  const isPendingBusy = isDisconnecting || isRemoving;
  const workspaceBlock = pluginWorkspaceBlock(plugin);
  const coveredByExistingGrant = grantReusedFrom !== null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4">
      <section className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-ink shadow-2xl">
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
              {isConnected
                ? `WarpBot can use ${plugin.label} for you.`
                : usesApiKey
                  ? `Paste an API key from your own ${plugin.label} account.`
                  : grantReusedFrom
                  ? `Uses the sign-in you already gave WarpTalk for ${grantReusedFrom.label}. No new sign-in.`
                  : "You will sign in and confirm this on the provider's own page."}
            </p>
          </div>
        </div>

        {/* The per-tool Allow / Ask / Block editor (WT-687) was taken out of this dialog: it read as
            clutter. Server defaults still apply — reads run, writes ask — and a write can still be
            set to "Always allow" from its confirmation card in the chat. */}
        <PermissionList plugin={plugin} />

        <div className="mt-5 flex flex-col gap-2.5 border-t border-border pt-4">
          <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
            <Prohibit size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            WarpTalk is not owned or operated by this provider.
          </p>
          <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
            <Lock size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            {/* One text node for the flex row: bare text beside a <span> becomes three flex items,
                which laid "Tokens stay encrypted. Every", "write" and "action asks you first." out
                as three columns. "Every write action asks" stopped being unconditional in WT-687,
                so the sentence names the exception. */}
            <span>
              Tokens stay encrypted. <span className="font-medium text-ink">Write</span> actions ask you
              first unless you allow them.
            </span>
          </p>
          {sharedConnectionPlugins.length ? (
            <p className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted">
              <PlugsConnected size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
              {/* Each plugin is connected on its own; the sign-in is what they share. Connecting
                  one never switches the others on, and disconnecting one never takes them down. */}
              <span>
                <span className="font-medium text-ink">
                  {formatPluginLabelList(sharedConnectionPlugins.map((sibling) => sibling.label))}
                </span>{" "}
                can reuse this sign-in, but each plugin is connected and disconnected on its own.
              </span>
            </p>
          ) : null}
        </div>

        {workspaceBlock ? (
          <WorkspaceBlockNotice block={workspaceBlock} className="mt-6" />
        ) : null}

        {/* Not offered once the plugin is connected: "Continue to ..." beside "Connected as ..."
            read as an unfinished connection. Partially granted still gets it — that is the case
            Continue actually fixes. */}
        {isConnected ? null : usesApiKey ? (
          // The key goes straight to the server, which checks it against the MCP server before
          // saving. It is never stored here and never read back: a connected row shows no field.
          <form
            className={cn("flex flex-col gap-2", workspaceBlock ? "mt-3" : "mt-6")}
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = apiKey.trim();
              if (!trimmed) {
                setApiKeyError("Paste an API key first.");
                return;
              }
              setApiKeyError(null);
              void onSubmitApiKey(trimmed).then((error) => {
                if (error) setApiKeyError(error);
                else setApiKey("");
              });
            }}
          >
            <label htmlFor="plugin-api-key" className="text-left text-xs font-medium text-ink">
              {plugin.label} API key
            </label>
            <Input
              id="plugin-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              disabled={isConnecting || workspaceBlock !== null}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (apiKeyError) setApiKeyError(null);
              }}
              aria-invalid={apiKeyError ? true : undefined}
              data-testid="plugin-api-key-input"
            />
            {apiKeyError ? (
              <p role="alert" className="text-left text-xs text-destructive">
                {apiKeyError}
              </p>
            ) : (
              <p className="text-left text-xs text-ink-muted">
                Only you use this key. Disconnect deletes it.
              </p>
            )}
            <Button
              type="submit"
              disabled={isConnecting || workspaceBlock !== null || !apiKey.trim()}
              className="mt-1 h-10 w-full"
            >
              {isConnecting ? <Spinner className="animate-spin" size={16} /> : null}
              Connect {plugin.label}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            // Connecting is what workspace policy actually refuses. Disconnect and Remove below stay
            // live on a blocked row on purpose — see WorkspaceBlockNotice.
            disabled={isConnecting || workspaceBlock !== null}
            onClick={onContinue}
            className={cn("h-10 w-full", workspaceBlock ? "mt-3" : "mt-6")}
          >
            {isConnecting ? <Spinner className="animate-spin" size={16} /> : null}
            {coveredByExistingGrant ? (
              <>Connect {plugin.label}</>
            ) : (
              <>
                Continue to {plugin.label}
                <ArrowSquareOut size={16} />
              </>
            )}
          </Button>
        )}

        {isConnected ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-emerald-600">
            <CheckCircle size={15} weight="fill" />
            {/* No provider email anywhere in the UI: on a machine already signed into Google it was
                a developer's personal address, and it read as WarpTalk's own identity. */}
            Connected to WarpTalk
          </div>
        ) : isPartiallyGranted ? (
          // Without this line the dialog is incoherent: it offers Disconnect, which only exists
          // when there is something to disconnect, while claiming nothing is connected. Saying
          // which half is true is also the only way the user learns that Continue re-runs consent
          // rather than starting from nothing.
          <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-amber-700 dark:text-amber-500">
            <Warning size={15} weight="fill" className="shrink-0" />
            Signed in, but a permission{" "}
            {plugin.label} needs was not approved. Continue to approve it.
          </div>
        ) : null}

        {isInstalled ? (
          <div className="mt-5 border-t border-border pt-4">
            {pendingAction ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-sm leading-6 text-ink-muted">
                  {pendingAction === "disconnect"
                    ? `Disconnect ${plugin.label}? WarpBot loses access to it until you connect the account again.`
                    : `Remove ${plugin.label}? Its tools disappear from WarpBot and it is disconnected.`}
                </p>
                {/* No sibling warning any more: a disconnect ends this plugin's connection only.
                    The shared grant is revoked by the server when the last plugin on it goes. */}
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
                  {/* The grant, not the plugin's usability — see providerConnectionStatus. */}
                  {hasProviderGrant ? (
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

/**
 * Asking the workspace Owner for a plugin the workspace has not added (plugin marketplace,
 * 2026-09-17). The same shape as ConnectPluginDialog on purpose — WarpTalk on one side, the plugin
 * on the other — because it is the same moment for the member: they want this plugin.
 */
function RequestPluginDialog({
  plugin,
  workspaceName,
  isSending,
  onClose,
  onSend,
}: {
  plugin: AssistantPluginCatalogItemDto;
  workspaceName: string | null;
  isSending: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Ask for ${plugin.label}`}
        data-testid="plugin-request-dialog"
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-ink shadow-2xl"
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close request dialog"
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
            <h2 className="text-lg font-semibold leading-snug tracking-tight">Ask for {plugin.label}</h2>
            <p className="mx-auto mt-1.5 max-w-[400px] text-sm text-ink-muted">
              Only a workspace owner can add plugins to {workspaceName?.trim() || "this workspace"}.
              They&apos;ll get a notification, and you&apos;ll hear back either way.
            </p>
          </div>
        </div>

        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSend(reason);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>
              Why do you need it? <span className="font-normal text-ink-muted">Optional</span>
            </span>
            <Textarea
              value={reason}
              maxLength={PLUGIN_REQUEST_REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              placeholder={`e.g. Use ${plugin.label} with meeting action items`}
              className="min-h-20 bg-surface-1 text-sm"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSending}>
              {isSending ? <Spinner className="animate-spin" size={14} /> : null}
              Send request
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

/**
 * How long after opening consent a focus event is still assumed to be the browser's, not the user's.
 *
 * A tab that opens behind the current one hands focus straight back, and a focus event in that same
 * breath is not somebody returning from Google — it is somebody who has not left yet. Settling on it
 * would stamp "did not receive a connection" over a flow that has not started.
 */
/**
 * What the assistant service says happened, for the tab that comes back from the provider.
 *
 * Consent opens in a second tab, so the callback's redirect lands THERE, not in the tab the user
 * started in. That tab mounts this page fresh, with no `consent` state and nothing to settle — so
 * before WT-646's callback contract it could only show the catalog and let the user infer the rest.
 * The service now redirects to /settings/plugins?plugin=<key>&connected=1 on success, or
 * ?plugin=<key>&error=<slug> when it could not finish, and these are those slugs. The original tab
 * still settles on focus; the two mechanisms answer different tabs and neither replaces the other.
 */
const CONSENT_CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "You cancelled the sign-in, so nothing was connected.",
  permission_denied: "That sign-in link had already been used or expired. Start the connection again.",
  unknown_plugin: "That plugin is no longer available.",
  plugin_not_installed: "That plugin is not installed for this account. Install it, then connect.",
  connection_required: "The provider did not return lasting access. Connect again and approve the request.",
  // Deliberately not "try again in a moment": no amount of retrying fixes a client secret that is
  // not set, and saying otherwise sends the user round the consent screen for as long as they are
  // willing. The reference is what turns this into something an operator can act on.
  provider_configuration: "WarpTalk's connection to this provider is not configured correctly. Nothing is wrong with your account.",
  provider_unavailable: "The provider could not complete the sign-in. Try again in a moment.",
  // The generic fallback below would say "start the connection again", which is the one thing that
  // cannot work here: signing in again with the same second account produces the same refusal. One
  // account connects per provider and every plugin from that provider shares it, so the remedy is
  // to end the connection that exists before starting another.
  provider_account_mismatch:
    "You signed in with a different account than the one already connected. Disconnect the connected account first, then connect this one.",
};

const CONSENT_ROUND_TRIP_FLOOR_MS = 1500;

export default function PluginsPage() {
  // The catalog is personal — a plugin is installed and connected by a person — but the workspace
  // the user is browsing from decides whether its members may use plugins at all, and only a listing
  // that NAMES that workspace comes back carrying its verdict. Without this the block notice, the
  // disabled Add button and the "Manage" label below are all unreachable code, because
  // `workspacePolicyBlockReason` is absent on every row of an unscoped listing.
  //
  // Read from the store rather than from the route: /settings/plugins is deliberately not
  // workspace-shaped (the [workspaceSlug] route redirects here), and the store is where the rest of
  // the shell reads the active workspace on routes like this one.
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);

  const { data: plugins = [], isLoading, isError, refetch } = useAssistantPlugins(workspaceId);
  const installPlugin = useInstallAssistantPlugin();
  const connectUrl = usePluginConnectUrl();
  const connectWithApiKey = useConnectPluginWithApiKey();
  const disconnectPlugin = useDisconnectAssistantPlugin();
  const disablePlugin = useDisableAssistantPlugin();
  const requestPlugin = useRequestPlugin(workspaceId);
  // The row whose Request dialog is open, by key for the same reason as selectedPluginKey below.
  const [requestPluginKey, setRequestPluginKey] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  // The KEY, not the row. Holding the object froze the dialog at the moment it opened: it kept
  // rendering the pre-consent snapshot after the catalog had refetched, so a plugin the user had
  // just connected still offered "Continue to ..." and no way to disconnect it.
  const [selectedPluginKey, setSelectedPluginKey] = useState<string | null>(null);
  const [consent, setConsent] = useState<
    { pluginKey: string; url: string; phase: ConsentPhase; openedAt: number } | null
  >(null);

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

  // Looked up in the live list every render, so the dialog moves with the catalog. It is the RAW
  // row: the dialog needs both answers — see the ConnectPluginDialog props — and mapping the one it
  // shows is cheaper than carrying two rows around.
  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.key === selectedPluginKey) ?? null,
    [plugins, selectedPluginKey],
  );

  const requestPluginRow = useMemo(
    () => plugins.find((plugin) => plugin.key === requestPluginKey) ?? null,
    [plugins, requestPluginKey],
  );

  const consentPluginKey = consent?.pluginKey ?? null;
  const consentPlugin = useMemo(
    () => plugins.find((plugin) => plugin.key === consentPluginKey) ?? null,
    [plugins, consentPluginKey],
  );

  // Which other installed plugins can reuse this plugin's sign-in, because a grant is keyed by
  // provider. Derived from the catalog, never from a list of Google keys.
  const sharedConnectionPlugins = useMemo(
    () => (selectedPlugin ? pluginsSharingConnection(selectedPlugin, catalogPlugins) : []),
    [selectedPlugin, catalogPlugins],
  );

  // Mirrors the server's shortcut in ConnectAsync: a connected sibling whose grant already carries
  // every scope this plugin needs means Connect links it without leaving WarpTalk. Read off the RAW
  // rows, because it is a question about the grant, not about whether the sibling is usable.
  // The sibling itself, not a yes/no: the dialog has to say WHICH plugin's sign-in is reused, or an
  // email the user never typed on this page reads as WarpTalk borrowing some other account.
  const grantReusedFrom = useMemo(() => {
    if (!selectedPlugin || selectedPlugin.connectionStatus === "connected") return null;
    // A key is the user's own; no sibling's grant can stand in for it.
    if (selectedPlugin.authMode === "api_key") return null;
    return pluginsSharingConnection(selectedPlugin, plugins).find(
      (sibling) =>
        sibling.connectionStatus === "connected"
        && scopesSatisfied(selectedPlugin.requiredScopes, sibling.grantedScopes),
    ) ?? null;
  }, [selectedPlugin, plugins]);

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
        await installPlugin.mutateAsync({ pluginKey: plugin.key, workspaceId });
      } catch {
        // Without this the button simply does nothing on a 500: the label never changes, no
        // toast appears, and the only trace is an unhandled rejection in the console.
        toast.error(`Could not connect ${plugin.label}.`);
        return;
      }
      // WT-687: straight on to the connect dialog rather than stopping at "installed". Consent is
      // not opened from here: the install awaited, and Safari and Firefox drop the click's
      // pop-up permission across an await. The dialog's Continue is a fresh click that keeps it.
    }

    setSelectedPluginKey(plugin.key);
  }

  async function continueToProvider(plugin: AssistantPluginCatalogItemDto) {
    try {
      const result = await connectUrl.mutateAsync({
        pluginKey: plugin.key,
        // Sealed into the OAuth state by the API. The desktop app hands consent to the system
        // browser, so this is the only moment the flow still knows where it started.
        client: isDesktopApp() ? "desktop" : "web",
        workspaceId,
      });
      // The provider's grant already covered this plugin, so the server connected it on the spot.
      // There is no consent round trip to wait for, only a catalog to re-read.
      if (result.connected || !result.url) {
        await refetch();
        toast.success(`${plugin.label} connected`);
        return;
      }
      // `openProviderConsent` reports a blocked pop-up by returning false, and it is the whole
      // reason it has a return value: Safari and Firefox drop the user-gesture grant across the
      // await above. Telling the user to finish something in a window that never opened is the
      // dead end that check exists to catch, so the phase says which of the two happened.
      const opened = openProviderConsent(result.url);
      setConsent({
        pluginKey: plugin.key,
        url: result.url,
        phase: opened ? "awaiting" : "blocked",
        openedAt: Date.now(),
      });
    } catch {
      toast.error(`Could not start the ${plugin.label} connection.`);
    }
  }

  /** Resolves to the message to show under the key field, or null once the plugin is connected. */
  async function submitApiKey(plugin: AssistantPluginCatalogItemDto, apiKey: string): Promise<string | null> {
    try {
      await connectWithApiKey.mutateAsync({ pluginKey: plugin.key, apiKey, workspaceId });
      await refetch();
      toast.success(` connected`);
      return null;
    } catch (error) {
      // The API answers a refused key with a plain-text body, which getErrorMessage does not read.
      const body = isAxiosError(error) ? error.response?.data : undefined;
      return typeof body === "string" && body.trim()
        ? body
        : getErrorMessage(error, `Could not connect . Check the key and try again.`);
    }
  }

  /**
   * Read the outcome of a consent round trip off the catalog, once the user is back.
   *
   * The callback's redirect DOES say what happened — `?plugin=<key>&connected=1`, or
   * `?plugin=<key>&error=<slug>` — but it says it to the tab consent opened, not to this one. See
   * CONSENT_CALLBACK_ERRORS above for that half. In THIS tab nothing navigates and no parameter
   * ever arrives, so the catalog is the only source of truth about what happened.
   *
   * `refetch` rather than `invalidateQueries`, because `staleTime: 60_000` is exactly the window a
   * consent round trip fits inside: a user who connects and returns within the minute would
   * otherwise be handed the pre-consent answer out of cache.
   */
  const settleConsent = useCallback(
    async (pluginKey: string) => {
      const { data: rows } = await refetch();
      // A refetch that failed says nothing about the consent. Reported as unsettled so the caller
      // tries again on the next focus rather than announcing a failure nobody observed.
      if (!rows) return false;

      const settle = (phase: ConsentPhase | null) =>
        setConsent((current) => {
          if (current?.pluginKey !== pluginKey || current.phase !== "awaiting") return current;
          return phase === null ? null : { ...current, phase };
        });

      const row = rows.find((plugin) => plugin.key === pluginKey);
      // The row left the catalog while consent was open — deactivated by an operator, say. There
      // is nothing left to report an outcome about.
      if (!row) settle(null);
      else if (row.connectionStatus !== "connected") settle("unconfirmed");
      else if (!scopesSatisfied(row.requiredScopes, row.grantedScopes)) settle("partial");
      else {
        settle(null);
        toast.success(`${row.label} connected`);
      }
      return true;
    },
    [refetch],
  );

  // Announced once, in the tab the provider redirected. No state: the outcome is read straight
  // out of the address bar and spoken, so holding it would only invite a second render to say it
  // twice. The ref is what stops a re-render re-announcing it before the URL has been stripped.
  const consentCallbackAnnounced = useRef(false);

  useEffect(() => {
    if (consentCallbackAnnounced.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const error = status === "error" ? (params.get("reason") ?? "provider_unavailable") : null;
    const connected = status === "connected" || status === "partial";
    if (!error && !connected) {
      consentCallbackAnnounced.current = true;
      return;
    }
    // Wait for the catalog: the message names the plugin, and on a cold mount that name is not
    // known yet. A failed load falls through to the generic wording rather than staying silent.
    if (isLoading) return;

    consentCallbackAnnounced.current = true;
    const pluginKey = params.get("plugin");
    const row = plugins.find((plugin) => plugin.key === pluginKey);
    const label = row?.label ?? "The plugin";

    if (error) {
      // The reference only exists on a failure, and only there is it worth reading out: it is the
      // one string a user can quote that turns "it did not work" into a line an operator can find.
      const reference = params.get("ref");
      toast.error(
        (CONSENT_CALLBACK_ERRORS[error] ??
          `${label} could not be connected. Start the connection again.`) +
          (reference ? ` (ref ${reference})` : ""),
      );
    } else if (status === "partial" || (row && !scopesSatisfied(row.requiredScopes, row.grantedScopes))) {
      // Connected, but the consent screen declined a permission this plugin needs. Saying
      // "connected" here would be the same lie the card takes care not to tell.
      toast.warning(`${label} is connected, but a permission it needs was not approved.`);
    } else {
      toast.success(`${label} connected`);
    }

    // Strip it, so a reload does not re-announce an outcome the user has seen and the slug does
    // not travel on if they share the URL.
    params.delete("plugin");
    params.delete("status");
    params.delete("reason");
    params.delete("ref");
    params.delete("client");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [isLoading, plugins]);

  // A chat surface sent the user here to paste a key (pluginApiKeyPageHref): open that plugin's
  // dialog once the catalog has it, then strip the hint so a reload does not reopen it.
  const apiKeyHintHandled = useRef(false);
  useEffect(() => {
    if (apiKeyHintHandled.current || isLoading) return;
    apiKeyHintHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") !== "api_key") return;
    const pluginKey = params.get("plugin");
    if (plugins.some((plugin) => plugin.key === pluginKey)) setSelectedPluginKey(pluginKey);
    params.delete("connect");
    params.delete("plugin");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [isLoading, plugins]);

  useEffect(() => {
    if (consent?.phase !== "awaiting") return;
    const { pluginKey, openedAt } = consent;
    let settling = false;

    function onReturn() {
      if (settling || document.visibilityState !== "visible") return;
      if (Date.now() - openedAt < CONSENT_ROUND_TRIP_FLOOR_MS) return;
      settling = true;
      void settleConsent(pluginKey).then((settled) => {
        if (!settled) settling = false;
      });
    }

    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [consent, settleConsent]);

  async function sendPluginRequest(plugin: AssistantPluginCatalogItemDto, reason: string) {
    if (!workspaceId) return;
    try {
      await requestPlugin.mutateAsync({ pluginKey: plugin.key, reason });
      setRequestPluginKey(null);
      toast.success("Request sent to your workspace owner");
    } catch {
      toast.error(`Could not ask for ${plugin.label}.`);
    }
  }

  async function disconnectSelected(plugin: AssistantPluginCatalogItemDto) {
    try {
      await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} disconnected`);
      setSelectedPluginKey(null);
    } catch {
      toast.error(`Could not disconnect ${plugin.label}.`);
    }
  }

  /** @param plugin The RAW catalog row — see the connectionStatus read below. */
  async function removeSelected(plugin: AssistantPluginCatalogItemDto) {
    // Disabling the installation leaves the stored provider tokens behind, which is
    // not what "Remove" reads like to the person clicking it.
    //
    // Read off the raw row rather than the effective status on purpose. A user who unticked one
    // product at Google's consent screen has a live grant and a plugin that reads not_connected,
    // and taking the effective status here skipped the disconnect for exactly that user: "Remove"
    // would disable the installation and leave the OAuth grant standing, which is the outcome the
    // paragraph above says this code exists to prevent.
    try {
      if (plugin.connectionStatus === "connected") {
        await disconnectPlugin.mutateAsync({ pluginKey: plugin.key });
      }
      await disablePlugin.mutateAsync({ pluginKey: plugin.key });
      toast.success(`${plugin.label} removed`);
      setSelectedPluginKey(null);
    } catch {
      // Two calls, and the first can land while the second throws - which leaves the plugin
      // disconnected but still installed. Saying so beats a silent half-removal.
      toast.error(`Could not finish removing ${plugin.label}.`);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-ink">
      {consent && consentPlugin ? (
        <ConnectionNotice
          plugin={consentPlugin}
          phase={consent.phase}
          // Re-open the URL we already hold while the flow is still live; mint a fresh one to start
          // over. A consent URL carries a one-shot `state`, so retrying a round trip that already
          // came back is a new flow, not a second click on the old one.
          onAct={() =>
            consent.phase === "awaiting" || consent.phase === "blocked"
              ? void openProviderConsent(consent.url)
              : void continueToProvider(consentPlugin)
          }
          onDismiss={() => setConsent(null)}
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
                onClick={() => setSelectedPluginKey(plugin.key)}
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
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
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
              // The marketplace's verdict, when the server sends one: a plugin the workspace has not
              // added becomes a Request, and the old block notice is not rendered beside it.
              const action = memberPluginAction(plugin, workspaceName);
              const hasAvailability = plugin.workspaceAvailability != null;

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
                      onClick={() =>
                        action.kind === "connect" ? setSelectedPluginKey(plugin.key) : undefined
                      }
                      className="min-w-0 text-left"
                    >
                      <div className="truncate text-sm font-semibold text-ink">{plugin.label}</div>
                      <div className="truncate text-xs text-ink-muted">{action.subtitle ?? plugin.description}</div>
                    </button>
                    {action.kind === "request" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!workspaceId || requestPlugin.isPending}
                        onClick={() => setRequestPluginKey(plugin.key)}
                      >
                        Request
                      </Button>
                    ) : action.kind === "requested" ? (
                      <Button type="button" size="sm" variant="outline" disabled>
                        Requested
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={installPlugin.isPending || connectUrl.isPending || isBlockedFromAdding}
                        onClick={() => void handlePrimaryAction(plugin)}
                      >
                        {pluginActionLabel(plugin)}
                      </Button>
                    )}
                    {action.caption ? (
                      <span
                        data-testid="plugin-availability-caption"
                        className="col-start-2 col-end-4 -mt-1.5 text-[11.5px] text-ink-subtle"
                      >
                        {action.caption}
                      </span>
                    ) : null}
                  </div>
                  {/* A server older than the marketplace sends no availability, only the sentence. */}
                  {workspaceBlock && !hasAvailability ? <WorkspaceBlockNotice block={workspaceBlock} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {requestPluginRow ? (
        <RequestPluginDialog
          plugin={requestPluginRow}
          workspaceName={workspaceName}
          isSending={requestPlugin.isPending}
          onClose={() => setRequestPluginKey(null)}
          onSend={(reason) => void sendPluginRequest(requestPluginRow, reason)}
        />
      ) : null}

      {selectedPlugin ? (
        <ConnectPluginDialog
          plugin={withEffectiveConnectionStatus(selectedPlugin)}
          providerConnectionStatus={selectedPlugin.connectionStatus}
          sharedConnectionPlugins={sharedConnectionPlugins}
          grantReusedFrom={grantReusedFrom}
          isConnecting={connectUrl.isPending || connectWithApiKey.isPending}
          isDisconnecting={disconnectPlugin.isPending}
          isRemoving={disablePlugin.isPending}
          onClose={() => setSelectedPluginKey(null)}
          onContinue={() => void continueToProvider(selectedPlugin)}
          onSubmitApiKey={(apiKey) => submitApiKey(selectedPlugin, apiKey)}
          onDisconnect={() => void disconnectSelected(selectedPlugin)}
          onRemove={() => void removeSelected(selectedPlugin)}
        />
      ) : null}
    </div>
  );
}
