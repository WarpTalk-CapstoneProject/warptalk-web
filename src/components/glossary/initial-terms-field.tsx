"use client";

/**
 * "First terms" — the rows inside the New glossary dialog. WT-558.
 *
 * A separate component so it can be looked at without an authenticated workspace and a dialog
 * three clicks deep (see /dev/glossary-terms-preview). A dynamic list is the kind of UI that
 * breaks in ways a unit test of its validation rule cannot see: rows that do not line up, a
 * remove button that empties the section, an error message with no row attached to it.
 *
 * The rule about which rows are valid is NOT here — it is in lib/glossary/initial-terms, so the
 * dialog's schema and this field cannot disagree about what a half-filled row means.
 */

import { Plus, Trash } from "@phosphor-icons/react";
import type { FieldErrors, Path, UseFormRegister } from "react-hook-form";

import { Input } from "@/components/ui/input";

/** Only the slice of the host form this field owns. */
type FormWithInitialTerms = {
  initialTerms: { sourceTerm: string; targetTerm: string }[];
};

/**
 * Generic over the WHOLE form, because `UseFormRegister<T>` is invariant in T: a register bound
 * to the create-glossary form is not assignable to one bound to this slice, however compatible
 * the shapes look. `fields` is narrowed to the only thing this component reads off a field array
 * — the react-key — for the same reason.
 */
export function InitialTermsField<TForm extends FormWithInitialTerms>({
  fields,
  register,
  errors,
  sourceLanguageName,
  targetLanguageName,
  onAppend,
  onRemove,
}: {
  fields: readonly { id: string }[];
  register: UseFormRegister<TForm>;
  errors: FieldErrors<FormWithInitialTerms>["initialTerms"];
  sourceLanguageName: string;
  targetLanguageName: string;
  onAppend: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-md border border-hairline p-3" data-testid="initial-terms-field">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-ink">First terms</p>
        <p className="text-[11px] text-ink-muted">Optional — you can add more later</p>
      </div>

      <div className="mt-2 space-y-2">
        {fields.map((field, index) => {
          const rowError = errors?.[index];
          return (
            <div key={field.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <Input
                  placeholder={`Term in ${sourceLanguageName}`}
                  data-testid={`initial-term-source-${index}`}
                  className="flex-1"
                  {...register(`initialTerms.${index}.sourceTerm` as Path<TForm>)}
                />
                <span aria-hidden className="pt-2 text-[12px] text-ink-subtle">
                  →
                </span>
                <Input
                  placeholder={`Use this in ${targetLanguageName}`}
                  data-testid={`initial-term-target-${index}`}
                  className="flex-1"
                  {...register(`initialTerms.${index}.targetTerm` as Path<TForm>)}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  // The last row is cleared, not removed. A section with no rows offers nothing
                  // to type into, and "+ Add term" becomes the only way back into the thing the
                  // reader opened the dialog to do.
                  disabled={fields.length === 1}
                  aria-label={`Remove term ${index + 1}`}
                  className="mt-1 shrink-0 cursor-pointer rounded-md p-1 text-ink-subtle transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash size={14} />
                </button>
              </div>
              {rowError ? (
                <p className="text-[11px] text-red-600">
                  {rowError.sourceTerm?.message ?? rowError.targetTerm?.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAppend}
        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary-hover"
      >
        <Plus size={12} />
        Add term
      </button>
    </div>
  );
}
