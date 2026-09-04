/**
 * The term pairs somebody types while creating a glossary. WT-558.
 *
 * Creating a glossary and putting a word in it used to be two errands: create an empty set, find
 * it in the list, open it, add a term. This is the rule for doing both at once, kept out of the
 * dialog because two of its three cases are easy to get quietly wrong — and "quietly" is the
 * problem: a term somebody typed and never got is worse than a form that refused them.
 */

import { z } from "zod";

export const initialTermSchema = z.object({
  sourceTerm: z.string(),
  targetTerm: z.string(),
});

export type InitialTermRow = z.infer<typeof initialTermSchema>;

/**
 * A list of pairs, where a HALF-filled row is an error and an empty one is not.
 *
 *  - both sides filled → a term, imported
 *  - both sides empty  → the blank row the dialog opens with; dropped without comment
 *  - exactly one side  → refused. Somebody typed a word and lost the other half of it, and
 *    dropping that silently is how a term a person believes they added does not exist.
 */
export const initialTermsSchema = z
  .array(initialTermSchema)
  .superRefine((rows, ctx) => {
    rows.forEach((row, index) => {
      const source = row.sourceTerm.trim();
      const target = row.targetTerm.trim();
      if (source && !target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "targetTerm"],
          message: "Add the translation, or clear the term.",
        });
      }
      if (!source && target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "sourceTerm"],
          message: "Add the term, or clear the translation.",
        });
      }
    });
  });

/**
 * The rows worth sending, trimmed.
 *
 * Only ever reached with rows the schema accepted, so every row here is either complete or empty;
 * the filter drops the empties. Trimmed because " CEO " and "CEO" are the same term to a person
 * and two different ones to the server's duplicate check.
 */
export function termRowsToImport(
  rows: readonly InitialTermRow[],
): { sourceTerm: string; targetTerm: string }[] {
  return rows
    .map((row) => ({ sourceTerm: row.sourceTerm.trim(), targetTerm: row.targetTerm.trim() }))
    .filter((row) => row.sourceTerm.length > 0 && row.targetTerm.length > 0);
}
