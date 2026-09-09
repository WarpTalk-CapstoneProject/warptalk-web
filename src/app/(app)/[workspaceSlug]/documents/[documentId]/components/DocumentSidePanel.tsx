"use client";

/**
 * Everything about the document that is not the document, in one panel.
 *
 * WHAT THIS REPLACED, AND WHY BOTH CARDS HAD TO GO
 *   Two stacked cards — "Document Properties" and "Access Policies & Rules" — each with its own
 *   border, header and shadow. Two frames for one subject, and the second one carried a bug that
 *   made it unusable: the member pickers were `absolute … z-50` divs inside a sidebar that is
 *   `lg:overflow-y-auto`, and z-index cannot lift anything out of an overflow clip. Clicking
 *   "Inherited only +" opened a list that was drawn underneath the card and could not be read.
 *
 *   The pickers are Popovers now, which render through a portal and are therefore outside the
 *   scroll container entirely. That is the fix; raising the z-index further never could be.
 *
 * THE SHAPE
 *   A grey card underneath, and ONE white card sitting on it. The grey is the sub-layer: it
 *   carries the header and a thin margin all round, and the white card on top is the content.
 *   That inset of grey is what makes the white read as *inside* something rather than as another
 *   card stacked beside its neighbour — which is the whole difference between this and the two
 *   bordered cards it replaces.
 */

import { useMemo, useState } from "react";
import { Check, Lock, Plus, Sparkle, X } from "@phosphor-icons/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { isImageExtension } from "@/constants/workspace-document";
import { cn } from "@/lib/utils";
import { documentActorName } from "@/lib/documents/document-actor";
import {
  DOCUMENT_PERMISSIONS,
  DOCUMENT_PERMISSION_HINTS,
  DOCUMENT_PERMISSION_LABELS,
  isUserPolicy,
  type DocumentPermission,
} from "@/lib/workspace/document-access-policy";

interface WorkspaceMemberItem {
  userId: string;
  fullName: string;
  email: string;
  roleName: string;
  membershipType?: string;
}

interface PolicyItem {
  id: string;
  subjectType: string;
  subjectId?: string | null;
  subjectKey?: string | null;
  permission?: string | null;
  effect: string;
}

interface WorkspaceDocumentData {
  id: string;
  status: string;
  sizeBytes: number;
  fileExtension: string;
  ingestionStatus: string;
  isAiAllowed: boolean;
  uploadedBy?: string | null;
  createdAt: string;
}

/**
 * One section of the white card.
 *
 * Not its own card: sections are separated by a hairline and a small caption, the way the
 * reference groups a list by day. Giving each one its own border would put three frames on
 * screen for one subject, which is what this panel was rebuilt to stop.
 */
function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-3.5 py-3", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{value}</span>
    </div>
  );
}

/**
 * The member picker.
 *
 * A Popover rather than an absolutely-positioned div: the sidebar this sits in scrolls, and an
 * absolute child of a scroll container is clipped by it however high its z-index. This one is
 * portalled to the body and positioned against its trigger, so it opens over the page.
 */
function MemberPicker({
  label,
  members,
  isChosen,
  onChoose,
  tone,
}: {
  label: string;
  members: WorkspaceMemberItem[];
  isChosen: (userId: string) => boolean;
  onChoose: (userId: string, fullName: string) => void;
  tone: "allow" | "deny";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={label}
            aria-label={label}
            className="ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border border-hairline text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Plus className="size-3" />
          </button>
        }
      />
      <PopoverContent align="end" className="max-h-64 w-72 overflow-y-auto p-1">
        {members.length === 0 ? (
          <p className="p-3 text-center text-xs text-ink-muted">No members found</p>
        ) : (
          members.map((member) => {
            const chosen = isChosen(member.userId);
            const external = member.membershipType?.toLowerCase() === "external";
            return (
              <button
                key={member.userId}
                type="button"
                onClick={() => {
                  onChoose(member.userId, member.fullName);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-ink">{member.fullName}</span>
                  <span className="flex items-center gap-1 truncate text-[10px] text-ink-muted">
                    <span className="truncate">{member.email}</span>
                    {member.email ? <span aria-hidden>·</span> : null}
                    <span className={external ? "font-semibold text-amber-600" : ""}>
                      {external ? "External" : member.roleName || "Member"}
                    </span>
                  </span>
                </span>
                {chosen ? (
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      tone === "allow" ? "text-primary" : "text-destructive",
                    )}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The chips + picker row shared by the allowed and blocked lists. */
function PolicyList({
  label,
  emptyLabel,
  policies,
  members,
  tone,
  canManage,
  onRemove,
  onChoose,
}: {
  label: string;
  emptyLabel: string;
  policies: PolicyItem[];
  members: WorkspaceMemberItem[];
  tone: "allow" | "deny";
  canManage: boolean;
  onRemove: (policyId: string) => void;
  onChoose: (userId: string, fullName: string) => void;
}) {
  const chosenIds = useMemo(
    () => new Set(policies.map((policy) => policy.subjectId ?? "")),
    [policies],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-surface-2/70 p-1.5">
        {policies.length === 0 ? (
          <span className="pl-1 text-[11px] text-ink-subtle">{emptyLabel}</span>
        ) : (
          policies.map((policy) => {
            const member = members.find((m) => m.userId === policy.subjectId);
            return (
              // A plain white chip with a hairline and a square-ish radius. It used to be a
              // tinted violet pill, which read as a status — a colour that means something —
              // when it is only a name. The one thing worth colouring here is the DENY list,
              // and that is carried by the small dot rather than by flooding the chip.
              <span
                key={policy.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 py-1 pl-2 pr-1.5 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                {tone === "deny" ? (
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" />
                ) : null}
                <span className="max-w-[140px] truncate">
                  {member ? member.fullName : "User"}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Remove ${member ? member.fullName : "user"}`}
                    onClick={() => onRemove(policy.id)}
                    className="cursor-pointer rounded p-0.5 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <X className="size-2.5" />
                  </button>
                ) : null}
              </span>
            );
          })
        )}
        {canManage ? (
          <MemberPicker
            label={label}
            members={members}
            isChosen={(userId) => chosenIds.has(userId)}
            onChoose={onChoose}
            tone={tone}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Which permission the Allowed / Blocked lists below are talking about.
 *
 * The panel used to have no such control because it could only ever write `view`. With three
 * permissions there are three separate lists of people, and showing them stacked would be six
 * chip rows for a decision that is almost always about one of them — so the lists are one set at
 * a time and this picks the set.
 */
function PermissionTabs({
  value,
  onChange,
  disabled,
}: {
  value: DocumentPermission;
  onChange: (permission: DocumentPermission) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label="Permission"
        className="inline-flex w-full items-center gap-0.5 rounded-lg border border-hairline bg-surface-2/70 p-0.5"
      >
        {DOCUMENT_PERMISSIONS.map((permission) => (
          <button
            key={permission}
            type="button"
            role="tab"
            aria-selected={value === permission}
            disabled={disabled}
            onClick={() => onChange(permission)}
            className={cn(
              "flex-1 cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              value === permission
                ? "bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {DOCUMENT_PERMISSION_LABELS[permission]}
          </button>
        ))}
      </div>
      <p className="px-0.5 text-[10px] leading-tight text-ink-subtle">
        {DOCUMENT_PERMISSION_HINTS[value]}
      </p>
    </div>
  );
}

export function DocumentSidePanel({
  doc,
  membersList,
  formatBytes,
  canManagePolicies,
  isExternalAllowed,
  isSubmitting,
  policiesList,
  toggleExternalAccess,
  allowUser,
  blockUser,
  removePolicy,
  memberAccess,
  setMemberAccess,
  onToggleAiIndexing,
  isAiIndexingBusy,
}: {
  doc: WorkspaceDocumentData;
  membersList: WorkspaceMemberItem[];
  formatBytes: (bytes: number) => string;
  canManagePolicies: boolean;
  isExternalAllowed: boolean;
  isSubmitting: boolean;
  policiesList: PolicyItem[];
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  allowUser: (userId: string, userName: string, permission: DocumentPermission) => Promise<void>;
  blockUser: (userId: string, userName: string, permission: DocumentPermission) => Promise<void>;
  removePolicy: (policyId: string) => Promise<void>;
  memberAccess: (permission: DocumentPermission) => "allow" | "deny" | null;
  setMemberAccess: (
    permission: DocumentPermission,
    effect: "allow" | "deny" | null,
  ) => Promise<void>;
  onToggleAiIndexing: (allowed: boolean) => Promise<void>;
  isAiIndexingBusy: boolean;
}) {
  // WT-551: null when there is nobody to name — an uploader who left the workspace, or one
  // past the page of members this panel fetched. It used to fall back to the literal word
  // "Uploader", which this row renders as if it were somebody's name.
  const uploaderName = documentActorName(membersList, doc.uploadedBy);

  const [permission, setPermission] = useState<DocumentPermission>("view");

  const status = doc.status?.toLowerCase() ?? "";
  const allowed = policiesList.filter((p) => isUserPolicy(p, permission, "allow"));
  const blocked = policiesList.filter((p) => isUserPolicy(p, permission, "deny"));

  // An image has no text to index, so the switch would be a promise the pipeline cannot keep —
  // the upload dialog already refuses for the same reason.
  const aiUnavailable = isImageExtension(doc.fileExtension);

  return (
    // THE GREY CARD IS THE ONE UNDERNEATH. Header sits directly on it, with a thin margin all
    // round the white card below — that inset is what makes the white read as content INSIDE
    // something rather than as one more card stacked beside its neighbour.
    <div className="rounded-2xl border border-hairline bg-surface-2 p-1.5 shadow-sm">
      {/* Title and state, on the grey. No rule under it and no heavy weight: the divider and the
          bold header the old card had were two more lines competing with the content, and the
          white card starting below already says where the header ends. */}
      <div className="flex items-center justify-between gap-3 px-2.5 py-2">
        <h2 className="text-[13px] font-semibold text-ink">Document</h2>
        {/* White, square-ish, hairline — the same chip the members get. Status earns one accent
            and only one: a dot. A fully tinted pill made every state shout equally. */}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              status === "public" || status === "active"
                ? "bg-emerald-500"
                : status.includes("pending")
                  ? "bg-amber-500"
                  : status === "rejected"
                    ? "bg-destructive"
                    : "bg-ink-subtle",
            )}
          />
          {doc.status}
        </span>
      </div>

      {/* The white card: one frame, sections divided inside it. */}
      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface-1">
        <Section title="Properties">
          <div className="flex flex-col divide-y divide-hairline/60">
            <Row label="File size" value={formatBytes(doc.sizeBytes)} />
            <Row
              label="Format"
              value={<span className="uppercase">{doc.fileExtension.replace(".", "") || "—"}</span>}
            />
            <Row
              label="Ingestion"
              value={<span className="capitalize">{doc.ingestionStatus.toLowerCase()}</span>}
            />
            <Row label="Uploaded by" value={uploaderName ?? "—"} />
            <Row
              label="Uploaded"
              value={new Date(doc.createdAt).toLocaleDateString()}
            />
          </div>
        </Section>

        <Section title="Assistant">
          {/* THE SWITCH THAT ONLY EXISTED AT UPLOAD TIME.
              `isAiAllowed` was asked once, in the upload dialog, and after that it was read for a
              badge and never written again — so a document handed to the assistant by mistake
              could not be taken back from any screen. The endpoint has always been there
              (PATCH /documents/{id}, PatchDocumentRequest.IsAiAllowed) and turning it off also
              deletes the document's vectors, which is the part that makes this a real revocation
              rather than a label. */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-2 p-2.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <Sparkle className="size-3.5 shrink-0 text-ink-muted" />
                AI indexing
              </span>
              <span className="text-[10px] leading-tight text-ink-muted">
                {aiUnavailable
                  ? "Images have no text for the assistant to read"
                  : doc.isAiAllowed
                    ? "The assistant may answer from this document"
                    : "Turning this on re-indexes the document"}
              </span>
            </span>
            <Switch
              checked={doc.isAiAllowed}
              disabled={!canManagePolicies || isAiIndexingBusy || aiUnavailable}
              onCheckedChange={(checked: boolean) => void onToggleAiIndexing(checked)}
            />
          </div>
          {!canManagePolicies ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-subtle">
              Only workspace owners and admins can change this.
            </p>
          ) : null}
        </Section>

        <Section title="Access">
          {canManagePolicies ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-2 p-2.5">
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-ink">External users</span>
                  <span className="text-[10px] leading-tight text-ink-muted">
                    Let guests outside the workspace read this
                  </span>
                </span>
                <Switch
                  checked={isExternalAllowed}
                  disabled={isSubmitting}
                  onCheckedChange={(checked: boolean) => void toggleExternalAccess(checked)}
                />
              </div>

              {/* THE RULE FOR EVERYONE ELSE.
                  The panel could name a person and it could name guests, and it could not say
                  the thing most policies are actually about: whether ordinary members of this
                  workspace may see this document. The server has always evaluated Role policies
                  (DocumentAccessEvaluator matches SubjectKey against the caller's role name);
                  nothing on any screen had ever written one.

                  Three states, not a switch. "Not set" is the default every document starts in
                  and it is NOT the same as Blocked: with no rule the document's own status
                  decides, and an explicit DENY overrides that. A two-way control would make
                  clearing a rule look like forbidding it. */}
              <MemberAccessControl
                permission={permission}
                value={memberAccess(permission)}
                disabled={isSubmitting}
                onChange={(next) => void setMemberAccess(permission, next)}
              />

              <PermissionTabs
                value={permission}
                onChange={setPermission}
                disabled={isSubmitting}
              />

              <PolicyList
                label="Allowed"
                emptyLabel="Inherited only"
                policies={allowed}
                members={membersList}
                tone="allow"
                canManage={canManagePolicies}
                onRemove={(id) => void removePolicy(id)}
                onChoose={(userId, name) => void allowUser(userId, name, permission)}
              />

              <PolicyList
                label="Blocked"
                emptyLabel="No blocks active"
                policies={blocked}
                members={membersList}
                tone="deny"
                canManage={canManagePolicies}
                onRemove={(id) => void removePolicy(id)}
                onChoose={(userId, name) => void blockUser(userId, name, permission)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-hairline p-4 text-center">
              <Lock className="size-4 text-ink-muted" />
              <span className="text-xs font-medium text-ink-muted">Configuration locked</span>
              <p className="text-[10px] leading-relaxed text-ink-subtle">
                Only workspace owners and admins can change who may read this.
              </p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}


/**
 * Whether ordinary members may exercise one permission on this document.
 *
 * Only the Member role is offered — see DOCUMENT_POLICY_ROLE. A rule naming Owner or Admin would
 * be evaluated too, which means it would work, which means the obvious thing to do with it is
 * lock yourself out of your own document.
 */
function MemberAccessControl({
  permission,
  value,
  disabled,
  onChange,
}: {
  permission: DocumentPermission;
  value: "allow" | "deny" | null;
  disabled: boolean;
  onChange: (next: "allow" | "deny" | null) => void;
}) {
  const options: Array<{ key: "allow" | "deny" | null; label: string }> = [
    { key: null, label: "Not set" },
    { key: "allow", label: "Allowed" },
    { key: "deny", label: "Blocked" },
  ];

  return (
    <div className="rounded-md border border-hairline bg-surface-2 p-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-ink">Workspace members</span>
        <span className="text-[10px] leading-tight text-ink-muted">
          {value === null
            ? `Members follow the document's own status for ${DOCUMENT_PERMISSION_LABELS[permission].toLowerCase()}`
            : value === "allow"
              ? `Every member may ${DOCUMENT_PERMISSION_LABELS[permission].toLowerCase()} this`
              : `No member may ${DOCUMENT_PERMISSION_LABELS[permission].toLowerCase()} this, whatever else allows it`}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            aria-pressed={value === option.key}
            className={cn(
              "flex-1 rounded border px-2 py-1 text-[10px] transition-colors disabled:opacity-60",
              value === option.key
                ? "border-transparent bg-surface-3 font-medium text-ink"
                : "border-hairline bg-surface-1 text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
