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
 * buttons follow it rather than a role string read here.
 *
 * TRANSITION: a workspace that never touched this list is still on the old "Allow personal plugins"
 * default, so the server reports every marketplace plugin as added (or none, if the switch was off).
 * The first change here turns that into an explicit list without taking any other plugin away.
 */

import { useMemo, useState } from "react";
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
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import {
  useAddWorkspacePlugin,
  useCreatePrivatePlugin,
  useDecidePluginRequest,
  useRemoveWorkspacePlugin,
  useUpdatePrivatePlugin,
  useWorkspacePlugins,
} from "@/hooks/use-workspace-plugins";
import { getErrorMessage } from "@/lib/api/errors";
import {
  describeMembersUsed,
  validatePrivatePluginDraft,
  workspacePluginSubtitle,
  type PrivatePluginDraft,
  type PrivatePluginDraftErrors,
} from "@/lib/assistant/plugin-availability";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspacePluginItemDto, WorkspacePluginRequestDto } from "@/types/assistant";

type OpenDialog =
  | { kind: "marketplace" }
  | { kind: "mcp" }
  | { kind: "manage"; pluginKey: string }
  | null;

const EMPTY_DRAFT: PrivatePluginDraft = { label: "", mcpServerUrl: "", description: "" };

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

function PrivatePluginForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: PrivatePluginDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: PrivatePluginDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<PrivatePluginDraftErrors>({});

  const field = (key: keyof PrivatePluginDraft) => ({
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
  const facts = [
    describeMembersUsed(plugin.membersUsedCount),
    addedByName ? `added by ${addedByName}` : null,
    isPrivate ? "only this workspace" : null,
  ].filter(Boolean);

  return (
    <DialogFrame label={`Manage ${plugin.label}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 text-center">
        <PluginGlyph plugin={plugin} size="lg" />
        <div>
          <h2 className="text-lg font-semibold">{plugin.label}</h2>
          <p className="mt-1 text-sm text-ink-muted">{facts.join(" · ")}</p>
        </div>
      </div>

      {isPrivate && canManage ? (
        <PrivatePluginForm
          initial={{
            label: plugin.label,
            mcpServerUrl: plugin.mcpServerUrl ?? "",
            description: plugin.description,
          }}
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
  const membersQuery = useWorkspaceMembers(roleLoaded && isOwnerOrAdmin ? workspaceId ?? undefined : undefined, 1, 100);
  const addPlugin = useAddWorkspacePlugin(workspaceId);
  const removePlugin = useRemoveWorkspacePlugin(workspaceId);
  const createPrivate = useCreatePrivatePlugin(workspaceId);
  const updatePrivate = useUpdatePrivatePlugin(workspaceId);
  const decide = useDecidePluginRequest(workspaceId);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const overview = overviewQuery.data;
  const canManage = overview?.canManage ?? false;

  const nameOf = useMemo(() => {
    const members = membersQuery.data?.items ?? [];
    return (userId: string | null | undefined) => {
      if (!userId) return null;
      const member = members.find((entry) => entry.userId === userId);
      return member ? member.fullName || member.email : null;
    };
  }, [membersQuery.data]);

  const managed = dialog?.kind === "manage"
    ? overview?.inWorkspace.find((plugin) => plugin.key === dialog.pluginKey) ?? null
    : null;

  async function add(plugin: WorkspacePluginItemDto) {
    setBusyKey(plugin.key);
    try {
      await addPlugin.mutateAsync(plugin.key);
      toast.success(`${plugin.label} added to ${workspaceName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Could not add ${plugin.label}.`));
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
      toast.error(getErrorMessage(error, `Could not remove ${plugin.label}.`));
    }
  }

  async function createMcp(draft: PrivatePluginDraft) {
    try {
      const created = await createPrivate.mutateAsync({
        label: draft.label.trim(),
        mcpServerUrl: draft.mcpServerUrl.trim(),
        description: draft.description.trim() || undefined,
      });
      setDialog(null);
      toast.success(`${created.label} added to ${workspaceName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add the plugin."));
    }
  }

  async function savePrivate(plugin: WorkspacePluginItemDto, draft: PrivatePluginDraft) {
    try {
      await updatePrivate.mutateAsync({
        pluginKey: plugin.key,
        request: {
          label: draft.label.trim(),
          description: draft.description.trim(),
          mcpServerUrl: draft.mcpServerUrl.trim(),
        },
      });
      toast.success(`${draft.label.trim()} saved`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Could not save ${plugin.label}.`));
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
      toast.error(getErrorMessage(error, "Could not update the request."));
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
      </div>
      {withMenu && canManage ? <AddPluginMenu onPick={(kind) => setDialog({ kind })} /> : null}
    </header>
  );

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
      </>
    );
  } else {
    body = (
      <>
        {header(true)}

        {overview.isCurated ? null : (
          // The transition, said out loud: nothing here was chosen yet, it is the old default.
          <p className="-mt-4 text-xs text-ink-muted">
            Every marketplace plugin is available here until you change this list.
          </p>
        )}

        {overview.pendingRequests.length ? (
          <section className="flex flex-col gap-3">
            <SectionHead title="Requests" note={`${overview.pendingRequests.length} waiting`} />
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
                      Manage
                    </Button>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No plugins yet. Add one from the marketplace below.</p>
          )}
        </section>

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
      </>
    );
  }

  return (
    <WorkspacePage>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-ink")}>{body}</div>
      </div>

      {dialog?.kind === "marketplace" && overview ? (
        <MarketplaceDialog
          candidates={overview.marketplace}
          busyKey={busyKey}
          onAdd={(plugin) => void add(plugin)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === "mcp" ? (
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
          addedByName={nameOf(managed.addedBy)}
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
