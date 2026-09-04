/**
 * What to tell an Owner when their Max Active Rooms setting is not the number that applies.
 *
 * WT-562, reported as "the Enterprise plan's concurrent-room limit is inconsistent". The notice
 * said, verbatim:
 *
 *     Your plan allows 5 concurrent rooms (plan:enterpise2), so 5 is what applies.
 *
 * Two things wrong with one sentence. It printed an internal identifier at an Owner — a
 * MISSPELLED one, from a retired duplicate plan row — and it asserted "your plan allows" for a
 * number that does not always come from a plan at all.
 *
 * The ceiling arrives with its provenance (`plan:<slug>`, `workspace_override`,
 * `platform_default`), and those three mean genuinely different things to the person reading:
 * one is what they bought, one is what they themselves set, one is what applies because nothing
 * has been bought yet. Saying "your plan" for all three is wrong twice out of three times.
 *
 * The slug itself is never shown. It names a row in the billing catalogue, it is not a product
 * name, and this defect is the proof: the one an Owner saw was a typo.
 */

export type RoomCeilingNotice = {
  /** Null when the setting IS the effective limit and there is nothing to explain. */
  message: string | null;
};

/**
 * `source` is the entitlement's provenance as the resolver reports it. Unknown or missing
 * provenance falls back to the claim that can always be made — that this is the limit in force —
 * rather than guessing at where it came from.
 */
export function describeRoomCeiling(input: {
  ceiling: number | null | undefined;
  configured: number | null | undefined;
  source?: string | null;
}): RoomCeilingNotice {
  const { ceiling, configured, source } = input;

  // Nothing to say unless the box asks for more than is actually permitted. Equal is not a
  // conflict, and a ceiling above the setting means the setting is the tighter of the two and is
  // exactly what applies.
  if (
    ceiling === null
    || ceiling === undefined
    || configured === null
    || configured === undefined
    || ceiling >= configured
  ) {
    return { message: null };
  }

  const tail =
    `, so ${ceiling} is what applies. A higher number here has no effect — `
    + "this setting can only lower the limit.";

  if (source?.startsWith("plan:")) {
    return { message: `Your plan allows ${ceiling} concurrent rooms${tail}` };
  }

  if (source === "platform_default") {
    // No plan is in force. Telling them "your plan allows" would send an Owner to Billing to
    // look for a limit their plan does not impose.
    return {
      message:
        `Until this workspace has an active plan it is limited to ${ceiling} concurrent rooms${tail}`,
    };
  }

  // `workspace_override` lands here, and so does anything unrecognised. The workspace's own
  // override cannot be looser than the plan, so if it is the binding limit then the workspace
  // set it — which is not something to attribute to a plan.
  return { message: `This workspace is limited to ${ceiling} concurrent rooms${tail}` };
}

/**
 * What to tell an Owner about their plan's per-meeting language limit. WT-500.
 *
 * Lives beside describeRoomCeiling because the two share the provenance vocabulary — `plan:<slug>`
 * and `platform_default` mean the same things here, and an Owner should not meet two different
 * explanations of the same three sources.
 *
 * THE SENTENCE IS DIFFERENT, THOUGH, AND DELIBERATELY SO.
 *   The room ceiling overrides the setting beside it: a bigger number in the box does nothing.
 *   This one does not. Allowed Target Translation Languages is the list a meeting may choose FROM;
 *   `max_languages` is how many it may choose AT ONCE. Permitting six languages and running
 *   three-language meetings is a coherent setup, so this must not tell an Owner their list is
 *   being ignored — it is not.
 *
 *   What it must do is make a quota visible that previously fired only at the point of creating a
 *   meeting, with nothing on this screen to connect the refusal to. That was the whole report.
 */
export function describeLanguageCeiling(input: {
  /** From `maxLanguagesCeiling` — null when no plan quota is in force. */
  ceiling: number | null | undefined;
  /** How many languages the workspace currently permits. */
  allowedCount: number | null | undefined;
  source?: string | null;
}): RoomCeilingNotice {
  const { ceiling, allowedCount, source } = input;

  // Silent unless the allowlist is wider than a single meeting may use. Permitting exactly as
  // many as the plan allows, or fewer, needs no explanation.
  if (
    ceiling === null
    || ceiling === undefined
    || allowedCount === null
    || allowedCount === undefined
    || ceiling <= 0
    || allowedCount <= ceiling
  ) {
    return { message: null };
  }

  const tail =
    ` per meeting. You may permit more here — a single meeting simply cannot use `
    + `more than ${ceiling} at once.`;

  if (source?.startsWith("plan:")) {
    return { message: `Your plan allows ${ceiling} target languages${tail}` };
  }

  if (source === "platform_default") {
    return {
      message:
        `Until this workspace has an active plan it is limited to ${ceiling} target languages${tail}`,
    };
  }

  return { message: `This workspace is limited to ${ceiling} target languages${tail}` };
}
