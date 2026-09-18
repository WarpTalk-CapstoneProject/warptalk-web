"use client";

/**
 * Workspace → Plugins: which plugins members of this workspace can connect (plugin marketplace,
 * owner decision 2026-09-17).
 *
 * Three tiers. A system admin curates the marketplace (/admin/plugins). The workspace Owner adds
 * marketplace plugins to the workspace here, or adds a private MCP server only this workspace sees.
 * A member asks the Owner for anything else from their own Plugins page, and those requests land in
 * "Requests" below.
 *
 * It reuses the personal Plugins page's vocabulary on purpose — the same header, the same sections
 * with a hairline under the heading, the same two-column rows and the same centred dialog — so the
 * Owner's page and the member's page read as two views of one catalog.
 *
 * WHO: Owner and Admin can open it (the sidebar shows it to both); only the Owner can change it. The
 * server decides both from the workspace service; `canManage` on the response is its answer, and the
 * buttons follow it (see `canManageWorkspacePlugins` for a response without it). An Admin gets the
 * same page with every action taken away, including the request buttons and the sidebar's count.
 *
 * TRANSITION: a workspace that never touched this list is still on the old "Allow personal plugins"
 * default, so the server reports every marketplace plugin as added (or none, if the switch was off).
 * The first change here turns that into an explicit list without taking any other plugin away.
 */

import { useId, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Lock,
  Plugs,
  Plus,
  SquaresFour,
  Spinner,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WorkspacePage } from "@/components/workspace/page-chrome";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import {
  useAddWorkspacePlugin,
  useCreatePrivatePlugin,
  useDecidePluginRequest,
  useRemoveWorkspacePlugin,
  useUpdatePrivatePlugin,
  useWorkspaceMemberNames,
  useWorkspacePlugins,
} from "@/hooks/use-workspace-plugins";
import {
  canManageWorkspacePlugins,
  createPrivatePluginRequest,
  pluginAddedByName,
  privatePluginUpdateRequest,
  validatePrivatePluginDraft,
  workspacePluginFacts,
  workspacePluginSubtitle,
  workspacePluginsTransitionNote,
  type PrivatePluginDraft,
  type PrivatePluginDraftErrors,
} from "@/lib/assistant/plugin-availability";
import { pluginErrorMessage } from "@/lib/assistant/plugin-errors";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { PluginAuthMode, WorkspacePluginItemDto, WorkspacePluginRequestDto } from "@/types/assistant";

type OpenDialog =
  | { kind: "marketplace" }
  | { kind: "mcp" }
  | { kind: "manage"; pluginKey: string }
  | null;

const EMPTY_DRAFT: PrivatePluginDraft = { label: "", mcpServerUrl: "", description: "", authMode: "oauth" };
const NO_NAMES: Readonly<Record<string, string>> = {};

/** The two ways a member can connect a private MCP server — the same choice the admin form offers. */
const AUTH_CHOICES: ReadonlyArray<{ mode: PluginAuthMode; title: string; note: string }> = [
  {
    mode: "oauth",
    title: "Sign in with OAuth",
    note: "Each member signs in on the server's own page.",
  },
  {
    mode: "api_key",
    title: "Each member pastes an API key",
    note: "For servers without OAuth. The key is checked against the server and stored encrypted.",
  },
];

function timeAgo(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDistanceToNow(date, { addSuffix: true });
}

/** The personal Plugins page's dialog frame, so both pages open the same shape. */
function DialogFrame({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-ink shadow-2xl"
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4"
        >
          <X size={16} />
        </Button>
        {children}
      </section>
    </div>
  );
}

function AddPluginMenu({
  onPick,
  align = "end",
}: {
  onPick: (kind: "marketplace" | "mcp") => void;
  align?: "end" | "center";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Plus size={14} />
        Add plugin
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[220px]">
        <DropdownMenuItem onClick={() => onPick("marketplace")} className="cursor-pointer gap-2.5">
          <SquaresFour size={16} />
          From marketplace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("mcp")} className="cursor-pointer gap-2.5">
          <Plugs size={16} />
          With MCP
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
    </div>
  );
}

function PluginRow({
  plugin,
  subtitle,
  action,
}: {
  plugin: WorkspacePluginItemDto;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2">
      <PluginGlyph plugin={plugin} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{plugin.label}</div>
        <div className="truncate text-xs text-ink-muted">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

function RequestRow({
  request,
  requesterName,
  canManage,
  busy,
  onDecide,
}: {
  request: WorkspacePluginRequestDto;
  requesterName: string;
  canManage: boolean;
  busy: boolean;
  onDecide: (decision: "approve" | "decline") => void;
}) {
  return (
    <div
      data-testid="plugin-request-row"
      className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3 px-1 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
    >
      <PluginGlyph plugin={{ label: request.pluginLabel, avatarUrl: request.pluginAvatarUrl }} />
      <div className="min-w-0">
        <p className="text-sm text-ink">
          <span className="font-semibold">{requesterName}</span>{" "}
          <span className="text-ink-muted">asked for</span>{" "}
          <span className="font-semibold">{request.pluginLabel}</span>{" "}
          <span className="text-ink-muted">· {timeAgo(request.createdAt)}</span>
        </p>
        {request.reason ? (
          <p className="mt-1 text-xs text-ink-muted">&ldquo;{request.reason}&rdquo;</p>
        ) : null}
      </div>
      {/* An Admin reads the request and nothing else: no button that the server would refuse. */}
      {canManage ? (
        <div className="col-start-2 flex gap-1.5 self-center sm:col-start-auto">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onDecide("decline")}>
            Decline
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => onDecide("approve")}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MarketplaceDialog({
  candidates,
  busyKey,
  onAdd,
  onClose,
}: {
  candidates: WorkspacePluginItemDto[];
  busyKey: string | null;
  onAdd: (plugin: WorkspacePluginItemDto) => void;
  onClose: () => void;
}) {
  return (
    <DialogFrame label="Add from marketplace" onClose={onClose}>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-lg font-semibold">Add from marketplace</h2>
        <p className="max-w-[400px] text-sm text-ink-muted">
          Members can connect it with their own accounts as soon as it&apos;s added.
        </p>
      </div>
      {candidates.length ? (
        <div className="mt-4 flex flex-col">
          {candidates.map((plugin) => (
            <PluginRow
              key={plugin.key}
              plugin={plugin}
              subtitle={plugin.description}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyKey !== null}
                  onClick={() => onAdd(plugin)}
                >
                  {busyKey === plugin.key ? <Spinner className="animate-spin" size={14} /> : null}
                  Add
                </Button>
              }
            />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-ink-muted">
          Everything in the marketplace is already in this workspace.
        </p>
      )}
    </DialogFrame>
  );
}

/**
 * How members connect a private server. Sent as `authMode`; an edit sends it only when changed
 * (see `privatePluginUpdateRequest`), because switching it can leave existing connections unusable.
 */
function AuthModeChoice({
  value,
  initial,
  onChange,
}: {
  value: PluginAuthMode;
  /** The saved mode when editing, to say what changing it means; null when creating. */
  initial: PluginAuthMode | null;
  onChange: (mode: PluginAuthMode) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid="private-plugin-auth-mode">
      <legend className="mb-1.5 text-sm font-medium">How members connect</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {AUTH_CHOICES.map(({ mode, title, note }) => (
          <label
            key={mode}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
              value === mode ? "border-primary bg-primary/5" : "border-border bg-surface-1 hover:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="mt-1 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{note}</span>
            </span>
          </label>
        ))}
      </div>
      {initial !== null && value !== initial ? (
        <span className="text-xs text-ink-muted">
          Members who already connected it may need to connect again.
        </span>
      ) : null}
    </fieldset>
  );
}

function PrivatePluginForm({
  initial,
  savedAuthMode,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: PrivatePluginDraft;
  /** The plugin's saved mode when editing; null when creating. */
  savedAuthMode: PluginAuthMode | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: PrivatePluginDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<PrivatePluginDraftErrors>({});

  const field = (key: "label" | "mcpServerUrl" | "description") => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
    "aria-invalid": errors[key] ? true : undefined,
  });

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const found = validatePrivatePluginDraft(draft);
        setErrors(found);
        if (Object.keys(found).length === 0) onSubmit(draft);
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input placeholder="Internal CRM" className="bg-surface-1" {...field("label")} />
        {errors.label ? <span className="text-xs font-normal text-destructive">{errors.label}</span> : null}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        MCP server URL
        <Input
          placeholder="https://mcp.example.com/mcp"
          inputMode="url"
          className="bg-surface-1"
          {...field("mcpServerUrl")}
        />
        {errors.mcpServerUrl ? (
          <span className="text-xs font-normal text-destructive">{errors.mcpServerUrl}</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Description <span className="font-normal text-ink-muted">Optional</span>
        </span>
        <Input placeholder="What WarpBot can do with it" className="bg-surface-1" {...field("description")} />
        {errors.description ? (
          <span className="text-xs font-normal text-destructive">{errors.description}</span>
        ) : null}
      </label>
      <AuthModeChoice
        value={draft.authMode}
        initial={savedAuthMode}
        onChange={(authMode) => setDraft((current) => ({ ...current, authMode }))}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner className="animate-spin" size={14} /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ManageDialog({
  plugin,
  workspaceName,
  addedByName,
  canManage,
  removing,
  saving,
  onRemove,
  onSave,
  onClose,
}: {
  plugin: WorkspacePluginItemDto;
  workspaceName: string;
  addedByName: string | null;
  canManage: boolean;
  removing: boolean;
  saving: boolean;
  onRemove: () => void;
  onSave: (draft: PrivatePluginDraft) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const isPrivate = plugin.availability === "private";
  const savedAuthMode: PluginAuthMode = plugin.authMode ?? "oauth";

  return (
    <DialogFrame label={`Manage ${plugin.label}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 text-center">
        <PluginGlyph plugin={plugin} size="lg" />
        <div>
          <h2 className="text-lg font-semibold">{plugin.label}</h2>
          {/* Usage, not connections: connections are personal and the server cannot count them
              per workspace, so "N of M connected" would be a number it made up. */}
          <p className="mt-1 text-sm text-ink-muted">{workspacePluginFacts(plugin, addedByName)}</p>
        </div>
      </div>

      {isPrivate && canManage ? (
        <PrivatePluginForm
          initial={{
            label: plugin.label,
            mcpServerUrl: plugin.mcpServerUrl ?? "",
            description: plugin.description,
            authMode: savedAuthMode,
          }}
          savedAuthMode={savedAuthMode}
          submitLabel="Save"
          busy={saving}
          onSubmit={onSave}
          onCancel={onClose}
        />
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        {confirming ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
            <p className="text-sm leading-6 text-ink-muted">
              {isPrivate
                ? `Remove ${plugin.label}? Members can no longer see or use it, in ${workspaceName} or anywhere else.`
                : `Remove ${plugin.label} from ${workspaceName}? WarpBot stops using it here. Members keep their own connection and can disconnect it from Plugins.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={removing} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={removing} onClick={onRemove}>
                {removing ? <Spinner className="animate-spin" size={14} /> : null}
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {canManage ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                <Trash size={15} />
                Remove from workspace
              </Button>
            ) : (
              <span className="text-xs text-ink-muted">Only the workspace owner can change this.</span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </DialogFrame>
  );
}

export function WorkspacePluginsPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceName = useWorkspaceStore((state) => state.activeWorkspaceName) || "this workspace";
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const overviewQuery = useWorkspacePlugins(workspaceId, roleLoaded && isOwnerOrAdmin);
  const addPlugin = useAddWorkspacePlugin(workspaceId);
  const removePlugin = useRemoveWorkspacePlugin(workspaceId);
  const createPrivate = useCreatePrivatePlugin(workspaceId);
  const updatePrivate = useUpdatePrivatePlugin(workspaceId);
  const decide = useDecidePluginRequest(workspaceId);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const overview = overviewQuery.data;
  const canManage = canManageWorkspacePlugins(overview, role);

  // Everyone the page names: who asked, and who added a plugin the server did not name itself.
  const peopleToName = useMemo(
    () =>
      overview
        ? [
            ...overview.pendingRequests.map((request) => request.requestedBy),
            ...overview.inWorkspace.filter((plugin) => !plugin.addedByName?.trim()).map((plugin) => plugin.addedBy),
          ]
        : [],
    [overview],
  );
  const namesQuery = useWorkspaceMemberNames(workspaceId, peopleToName, roleLoaded && isOwnerOrAdmin);
  const memberNames = namesQuery.data ?? NO_NAMES;
  const nameOf = (userId: string | null | undefined) => (userId ? memberNames[userId] ?? null : null);

  const managed = dialog?.kind === "manage"
    ? overview?.inWorkspace.find((plugin) => plugin.key === dialog.pluginKey) ?? null
    : null;

  async function add(plugin: WorkspacePluginItemDto) {
    setBusyKey(plugin.key);
    try {
      await addPlugin.mutateAsync(plugin.key);
      toast.success(`${plugin.label} added to ${workspaceName}`);
    } catch (error) {
      toast.error(pluginErrorMessage(error, `Could not add ${plugin.label}.`));
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(plugin: WorkspacePluginItemDto) {
    try {
      await removePlugin.mutateAsync(plugin.key);
      setDialog(null);
      toast.success(`Removed from ${workspaceName}`);
    } catch (error) {
      toast.error(pluginErrorMessage(error, `Could not remove ${plugin.label}.`));
    }
  }

  async function createMcp(draft: PrivatePluginDraft) {
    try {
      const created = await createPrivate.mutateAsync(createPrivatePluginRequest(draft));
      setDialog(null);
      toast.success(`${created.label} added to ${workspaceName}`);
    } catch (error) {
      toast.error(pluginErrorMessage(error, "Could not add the plugin."));
    }
  }

  async function savePrivate(plugin: WorkspacePluginItemDto, draft: PrivatePluginDraft) {
    try {
      await updatePrivate.mutateAsync({
        pluginKey: plugin.key,
        request: privatePluginUpdateRequest(plugin, draft),
      });
      toast.success(`${draft.label.trim()} saved`);
    } catch (error) {
      toast.error(pluginErrorMessage(error, `Could not save ${plugin.label}.`));
    }
  }

  async function decideRequest(request: WorkspacePluginRequestDto, decision: "approve" | "decline") {
    const who = nameOf(request.requestedBy) ?? "The member";
    setBusyRequestId(request.id);
    try {
      await decide.mutateAsync({ requestId: request.id, decision });
      toast.success(
        decision === "approve"
          ? `${request.pluginLabel} added · ${who} was notified`
          : `${who} was told it wasn't added`,
      );
    } catch (error) {
      toast.error(pluginErrorMessage(error, "Could not update the request."));
    } finally {
      setBusyRequestId(null);
    }
  }

  const header = (withMenu: boolean) => (
    <header className="flex flex-col items-start justify-between gap-4 sm:flex-row">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Plugins</h1>
        <p className="text-xs text-ink-muted">
          Choose which plugins members of {workspaceName} can connect. Each member signs in with their own account.
        </p>
        {canManage ? null : (
          <p data-testid="workspace-plugins-read-only" className="text-xs text-ink-subtle">
            You can see this list. Only the workspace owner can change it.
          </p>
        )}
      </div>
      {withMenu && canManage ? <AddPluginMenu onPick={(kind) => setDialog({ kind })} /> : null}
    </header>
  );

  const transitionNote = overview ? workspacePluginsTransitionNote(overview) : null;
  // The transition, said out loud: nothing here was chosen yet, it is the old default — and which
  // old default, because "every plugin is available" is false for a workspace that had them off.
  const transition = transitionNote ? (
    <p data-testid="workspace-plugins-transition" className="-mt-4 text-xs text-ink-muted">
      {transitionNote}
    </p>
  ) : null;

  // Shown on the empty page too: the empty state's menu is one way in, and a list of what can be
  // added is the other. Hiding it left an Owner with nothing added nothing to look at.
  const marketplaceSection = overview ? (
    <section className="flex flex-col gap-3">
      <SectionHead title="Marketplace" note="Published by WarpTalk" />
      {overview.marketplace.length ? (
        <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {overview.marketplace.map((plugin) => (
            <PluginRow
              key={plugin.key}
              plugin={plugin}
              subtitle={plugin.description}
              action={
                canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyKey !== null}
                    onClick={() => void add(plugin)}
                  >
                    {busyKey === plugin.key ? <Spinner className="animate-spin" size={14} /> : null}
                    Add
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Everything in the marketplace is already in this workspace.</p>
      )}
    </section>
  ) : null;

  let body: React.ReactNode;
  if (!workspaceId) {
    body = null;
  } else if (!roleLoaded || (isOwnerOrAdmin && overviewQuery.isLoading)) {
    body = (
      <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
        <Spinner className="animate-spin" size={16} />
        Loading plugins...
      </div>
    );
  } else if (!isOwnerOrAdmin || (overviewQuery.error as { response?: { status?: number } } | null)?.response?.status === 403) {
    body = (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Lock size={22} className="text-ink-muted" />
        <p className="text-sm font-medium text-ink">Only workspace owners and admins can see this page</p>
        <p className="text-xs text-ink-muted">Ask for a plugin from your own Plugins page instead.</p>
      </div>
    );
  } else if (overviewQuery.isError || !overview) {
    body = (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-destructive">
          <Warning size={16} />
          Could not load this workspace&apos;s plugins.
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void overviewQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (overview.inWorkspace.length === 0 && overview.pendingRequests.length === 0) {
    body = (
      <>
        {header(false)}
        {transition}
        <div data-testid="workspace-plugins-empty" className="flex flex-col items-center gap-3.5 px-4 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-[10px] border border-border bg-surface-2 text-ink">
            <SquaresFour size={22} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Add a plugin to this workspace</p>
          {canManage ? (
            <AddPluginMenu align="center" onPick={(kind) => setDialog({ kind })} />
          ) : (
            <p className="text-xs text-ink-muted">Only the workspace owner can add plugins.</p>
          )}
        </div>
        {marketplaceSection}
      </>
    );
  } else {
    body = (
      <>
        {header(true)}
        {transition}

        {overview.pendingRequests.length ? (
          <section className="flex flex-col gap-3">
            <SectionHead title="Requests" note={`${overview.pendingRequests.length} waiting`} />
            {canManage ? null : (
              <p className="text-xs text-ink-muted">Only the workspace owner can add or decline these.</p>
            )}
            <div className="flex flex-col divide-y divide-hairline">
              {overview.pendingRequests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  requesterName={nameOf(request.requestedBy) ?? "A member"}
                  canManage={canManage}
                  busy={busyRequestId !== null}
                  onDecide={(decision) => void decideRequest(request, decision)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionHead
            title="In this workspace"
            note={`${overview.inWorkspace.length} plugin${overview.inWorkspace.length === 1 ? "" : "s"}`}
          />
          {overview.inWorkspace.length ? (
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              {overview.inWorkspace.map((plugin) => (
                <PluginRow
                  key={plugin.key}
                  plugin={plugin}
                  subtitle={workspacePluginSubtitle(plugin)}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: "manage", pluginKey: plugin.key })}
                    >
                      {canManage ? "Manage" : "View"}
                    </Button>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No plugins yet. Add one from the marketplace below.</p>
          )}
        </section>

        {marketplaceSection}
      </>
    );
  }

  return (
    <WorkspacePage>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-ink")}>{body}</div>
      </div>

      {dialog?.kind === "marketplace" && overview && canManage ? (
        <MarketplaceDialog
          candidates={overview.marketplace}
          busyKey={busyKey}
          onAdd={(plugin) => void add(plugin)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === "mcp" && canManage ? (
        <DialogFrame label="Add your own MCP server" onClose={() => setDialog(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-xl border border-border bg-surface-1 text-ink">
              <Plugs size={24} />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Add your own MCP server</h2>
              <p className="mt-1 text-sm text-ink-muted">Only members of {workspaceName} will see it.</p>
            </div>
          </div>
          <PrivatePluginForm
            initial={EMPTY_DRAFT}
            savedAuthMode={null}
            submitLabel="Add plugin"
            busy={createPrivate.isPending}
            onSubmit={(draft) => void createMcp(draft)}
            onCancel={() => setDialog(null)}
          />
        </DialogFrame>
      ) : null}

      {managed ? (
        <ManageDialog
          key={managed.key}
          plugin={managed}
          workspaceName={workspaceName}
          addedByName={pluginAddedByName(managed, memberNames)}
          canManage={canManage}
          removing={removePlugin.isPending}
          saving={updatePrivate.isPending}
          onRemove={() => void remove(managed)}
          onSave={(draft) => void savePrivate(managed, draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </WorkspacePage>
  );
}
