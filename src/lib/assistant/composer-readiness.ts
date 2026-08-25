/**
 * WT-541: whether WarpBot's composer can send, and what to say when it cannot.
 *
 * An admin opens WarpBot from the admin portal, types, presses send — and nothing happens. No
 * error, no message, the text still sitting in the box.
 *
 * `sendMessage` began:
 *
 *     if ((!content && attachments.length === 0) || !activeWorkspaceId) return;
 *
 * while the send button was disabled only on the empty half of that condition. So the button
 * looked alive, the guard swallowed the turn, and the two disagreed about the same question.
 *
 * The admin portal lives outside `[workspaceSlug]`, so nothing there ever sets an active
 * workspace. An admin who signs in and goes straight to `/admin` has none — and every WarpBot
 * conversation is created against a workspace id, because the assistant's tools, its history and
 * its retrieval are all workspace-scoped. There is genuinely nothing to send to.
 *
 * The Chat History trigger beside it already had this right — `disabled={!activeWorkspaceId}`.
 * This is the same rule, asked once, so a control the server cannot accept never looks alive.
 */

export type ComposerBlocker = "no-workspace" | "empty";

/**
 * A discriminated union, so the caller cannot ask "can I send?" and then re-derive the workspace
 * id it needs. The id travels WITH the yes — which is what stops the guard and the button from
 * growing a second, half-written copy of this rule, exactly as they had.
 */
export type ComposerReadiness =
  | { canSend: true; workspaceId: string; blocker: null; hint: null }
  | { canSend: false; workspaceId: null; blocker: ComposerBlocker; hint: string };

const HINTS: Record<ComposerBlocker, string> = {
  "no-workspace":
    "WarpBot answers about one workspace. Open a workspace to start a conversation.",
  empty: "Type a message, or attach a file.",
};

export function composerReadiness(input: {
  text: string;
  attachmentCount: number;
  activeWorkspaceId: string | null | undefined;
}): ComposerReadiness {
  // Reported BEFORE the empty check, and deliberately.
  //
  // It is the blocker that survives whatever the person types next, so saying it while the box
  // is still empty is the one chance to explain the dead button before they compose a question
  // into it and lose the text. "Type a message" on a composer that could not send the message
  // anyway is a lie of omission.
  if (!input.activeWorkspaceId) {
    return {
      canSend: false,
      workspaceId: null,
      blocker: "no-workspace",
      hint: HINTS["no-workspace"],
    };
  }

  // WT-474: an attachment on its own is a question ("what is this?"), so a turn carrying only
  // files is allowed to go.
  if (input.text.trim().length === 0 && input.attachmentCount === 0) {
    return { canSend: false, workspaceId: null, blocker: "empty", hint: HINTS.empty };
  }

  return { canSend: true, workspaceId: input.activeWorkspaceId, blocker: null, hint: null };
}
