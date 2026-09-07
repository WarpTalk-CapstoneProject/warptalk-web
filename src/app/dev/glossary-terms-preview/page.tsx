"use client";

/**
 * The "First terms" rows of the New glossary dialog. WT-558.
 *
 * The real one lives behind sign-in, a workspace and a dialog, which makes "does the remove
 * button leave you with nothing to type into?" an expensive question to ask. Here it is a page.
 *
 * It uses the SAME field component and the SAME schema as the dialog, so what is on screen here
 * is what is on screen there. Not linked from anywhere.
 */

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { InitialTermsField } from "@/components/glossary/initial-terms-field";
import { initialTermsSchema, termRowsToImport } from "@/lib/glossary/initial-terms";

const schema = z.object({ initialTerms: initialTermsSchema });
type Form = z.infer<typeof schema>;

export default function GlossaryTermsPreviewPage() {
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      initialTerms: [
        // i18n-allow: a glossary term IS language data — an en→vi pair is the thing being shown.
        { sourceTerm: "runway", targetTerm: "đường băng" },
        { sourceTerm: "", targetTerm: "" },
        // Half a row, so the error state is on screen without anyone having to type it.
        { sourceTerm: "taxiway", targetTerm: "" },
      ],
    },
  });
  const initialTerms = useFieldArray({ control: form.control, name: "initialTerms" });
  const watched = form.watch("initialTerms");

  return (
    <div className="min-h-dvh bg-surface-1 p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">New glossary — first terms (WT-558)</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Submit to see validation. Row 3 is deliberately half-filled.
          </p>
        </div>

        <form
          onSubmit={form.handleSubmit(() => {})}
          className="space-y-3 rounded-lg border border-hairline bg-canvas p-4"
        >
          <InitialTermsField
            fields={initialTerms.fields}
            register={form.register}
            errors={form.formState.errors.initialTerms}
            sourceLanguageName="English"
            targetLanguageName="Vietnamese"
            onAppend={() => initialTerms.append({ sourceTerm: "", targetTerm: "" })}
            onRemove={(index) => initialTerms.remove(index)}
          />
          <button
            type="submit"
            className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-on-primary"
          >
            Create glossary
          </button>
        </form>

        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <p className="text-[12px] font-medium text-ink">What would be sent</p>
          <pre
            data-testid="rows-to-import"
            className="mt-2 overflow-x-auto text-[11px] text-ink-muted"
          >
            {JSON.stringify(termRowsToImport(watched ?? []), null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
