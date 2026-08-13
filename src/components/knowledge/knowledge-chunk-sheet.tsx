"use client";

/**
 * One indexed chunk, opened from the listing — and, for the Owner, the place to disagree with it.
 *
 * The page could show what WarpBot believes about the workspace and offered no way to correct
 * it. A fact the extractor got wrong stayed wrong; a chunk that should never have been indexed
 * stayed retrievable. Reading a claim you cannot change is a strange thing to be shown.
 *
 * WHAT IS EDITABLE, AND WHY THE REST IS NOT
 *   The fact and its category are an annotation stored beside the vector, so correcting them
 *   cannot make the vector disagree with itself.
 *
 *   Retrieval is a switch rather than only a delete, because "this is true and I do not want it
 *   quoted" is a real position, and it leaves the row on the page where it stays auditable.
 *
 *   The indexed TEXT is read-only, and this is not an oversight — it is the only field the
 *   vector was computed from. Editing it without re-embedding leaves the assistant retrieving
 *   on the old meaning and displaying the new words, and nothing on screen would look wrong.
 *   The honest options are to fix the source and re-upload it, or to delete the row.
 *
 *   Provenance — which document, which meeting, which chunk index — is a record of where the
 *   text came from. It is not an opinion anyone gets to revise.
 *
 * An Admin sees all of this and none of the controls. The server enforces that independently.
 */

import { useState } from "react";
import { Trash, Warning } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteKnowledgeChunk,
  useUpdateKnowledgeChunk,
} from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { sourceLabel } from "@/lib/knowledge/knowledge-view";
import { cn } from "@/lib/utils";
import { FACT_CATEGORIES } from "@/types/workspace-knowledge";
import type { WorkspaceKnowledgeChunkDto } from "@/types/workspace-knowledge";

const MAX_FACT_LENGTH = 500;

export function KnowledgeChunkSheet({
  workspaceId,
  chunk,
  canEdit,
  onClose,
}: {
  workspaceId: string;
  /** Null closes the sheet. Kept as a prop so the row list owns which row is open. */
  chunk: WorkspaceKnowledgeChunkDto | null;
  /** Owner only. An Admin reads this sheet; the server refuses their writes regardless. */
  canEdit: boolean;
  onClose: () => void;
}) {
  if (!chunk) return null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/*
        Keyed by chunk id so opening a different row REMOUNTS the editor and its fields start
        from that row's own values. The alternative — an effect that copies props into state —
        also fires on a background refetch, and would throw away half-typed corrections every
        time the listing revalidated.
      */}
      <ChunkEditor
        key={chunk.chunkId}
        workspaceId={workspaceId}
        chunk={chunk}
        canEdit={canEdit}
        onClose={onClose}
      />
    </Sheet>
  );
}

function ChunkEditor({
  workspaceId,
  chunk,
  canEdit,
  onClose,
}: {
  workspaceId: string;
  chunk: WorkspaceKnowledgeChunkDto;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [fact, setFact] = useState(chunk.fact ?? "");
  const [category, setCategory] = useState<string | null>(chunk.factCategory);
  const [aiRetrieval, setAiRetrieval] = useState(chunk.aiRetrieval);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const update = useUpdateKnowledgeChunk(workspaceId);
  const remove = useDeleteKnowledgeChunk(workspaceId);

  const trimmedFact = fact.trim();
  const nextFact = trimmedFact.length ? trimmedFact : null;
  const nextCategory = nextFact ? category : null;
  const dirty =
    nextFact !== (chunk.fact ?? null) ||
    nextCategory !== (chunk.factCategory ?? null) ||
    aiRetrieval !== chunk.aiRetrieval;
  const tooLong = trimmedFact.length > MAX_FACT_LENGTH;

  async function save() {
    try {
      await update.mutateAsync({
        chunkId: chunk.chunkId,
        update: { fact: nextFact, factCategory: nextCategory, aiRetrieval },
      });
      toast.success("Chunk updated.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this chunk."));
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(chunk.chunkId);
      toast.success("Chunk removed from the index.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove this chunk."));
    }
  }

  return (
    <SheetContent className="flex w-full flex-col gap-0 sm:max-w-[520px]">
      <SheetHeader className="border-b border-hairline">
        <SheetTitle className="text-[15px]">{sourceLabel(chunk)}</SheetTitle>
        <SheetDescription className="text-[12px]">
          {chunk.sourceType === "document" && chunk.chunkIndex != null
            ? `Chunk ${chunk.chunkIndex} of this document, as it was indexed.`
            : "One indexed piece of what this workspace knows."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Field label="Indexed text">
          {chunk.text ? (
            <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-surface-2/50 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
              {chunk.text}
            </p>
          ) : (
            <p className="text-[12px] text-ink-subtle">
              Indexed before the stored payload kept its text.
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            Read-only — the vector was computed from these words. To change
            them, fix the source and upload it again, or delete this chunk.
          </p>
        </Field>

        <Field label="Fact">
          {canEdit ? (
            <>
              <Textarea
                value={fact}
                onChange={(event) => setFact(event.target.value)}
                placeholder="One line this chunk establishes. Leave empty if it establishes none."
                className="min-h-20 text-[12px]"
              />
              <p
                className={cn(
                  "mt-1 text-right text-[11px] tabular-nums",
                  tooLong ? "text-destructive" : "text-ink-subtle",
                )}
              >
                {trimmedFact.length} / {MAX_FACT_LENGTH}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-ink">{chunk.fact ?? "—"}</p>
          )}
        </Field>

        <Field label="Category">
          {canEdit ? (
            <div className="flex flex-wrap gap-1.5">
              <CategoryChip
                label="None"
                selected={category === null}
                disabled={false}
                onClick={() => setCategory(null)}
              />
              {FACT_CATEGORIES.map((value) => (
                <CategoryChip
                  key={value}
                  label={value}
                  selected={category === value}
                  // A category with nothing to categorise puts a blank row under a filter
                  // chip. The server refuses it too; this is why the buttons go quiet.
                  disabled={!nextFact}
                  onClick={() => setCategory(value)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[12px] capitalize text-ink">
              {chunk.factCategory ?? "—"}
            </p>
          )}
          {canEdit && !nextFact ? (
            <p className="mt-1.5 text-[11px] text-ink-subtle">
              Write a fact to categorise it.
            </p>
          ) : null}
        </Field>

        <Field label="WarpBot retrieval">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setAiRetrieval((current) => !current)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-ink">
                  {aiRetrieval
                    ? "Can be used in answers"
                    : "Kept, but never quoted"}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-muted">
                  Turning this off leaves the chunk here to be audited and takes
                  it out of everything WarpBot says.
                </span>
              </span>
              <span
                className={cn(
                  "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
                  aiRetrieval ? "bg-[var(--primary)]" : "bg-surface-4",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[2px] size-[14px] rounded-full bg-white transition-all",
                    aiRetrieval ? "left-[16px]" : "left-[2px]",
                  )}
                />
              </span>
            </button>
          ) : (
            <p className="text-[12px] text-ink">
              {chunk.aiRetrieval
                ? "Can be used in answers"
                : "Kept, but never quoted"}
            </p>
          )}
        </Field>

        <Field label="Where it came from">
          <dl className="grid grid-cols-[128px_1fr] gap-y-1.5 text-[12px]">
            {/* `capitalize` only where the value is one of ours. A filename is the file's own,
                and "MSA-2026.pdf" retitled as "MSA-2026.Pdf" is wrong about a real thing. */}
            <Detail
              label="Source"
              value={chunk.sourceType.replace(/_/g, " ")}
              capitalize
            />
            {chunk.documentName ? (
              <Detail label="Document" value={chunk.documentName} />
            ) : null}
            {chunk.speakerName ? (
              <Detail label="Speaker" value={chunk.speakerName} />
            ) : null}
            <Detail label="Retention" value={chunk.retentionState ?? "—"} capitalize />
            <Detail label="Chunk id" value={chunk.chunkId} mono />
          </dl>
        </Field>
      </div>

      {canEdit ? (
        <div className="border-t border-hairline px-4 py-3">
          {confirmingDelete ? (
            // Two steps, and the second one says what is actually destroyed. Deleting a
            // chunk is not deleting the document, and an Owner should not have to guess
            // which of the two they are about to do.
            <div className="flex flex-col gap-2.5">
              <p className="flex items-start gap-2 text-[12px] text-ink">
                <Warning className="mt-0.5 size-4 shrink-0 text-amber-500" />
                Remove this chunk from the index? The document or meeting it
                came from is not touched, and re-uploading the source will index
                it again.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={destroy}
                >
                  {remove.isPending ? "Removing…" : "Remove chunk"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash className="size-3.5" />
                Delete
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || tooLong || update.isPending}
                  onClick={save}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </SheetContent>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      {children}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-all text-ink",
          capitalize && "capitalize",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
    </>
  );
}

function CategoryChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-transparent bg-foreground text-background"
          : "border-border/60 bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
