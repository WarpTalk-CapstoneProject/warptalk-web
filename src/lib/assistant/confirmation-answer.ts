/**
 * What a user's answer to a plugin confirmation card reads as in their own bubble.
 *
 * The answer is an ordinary chat message, so it has to carry the tool name and the confirmation
 * token for the model to act on. It used to be shown as sent: "Confirm plugin action: Confirm the
 * google_calendar_create_meet_event plugin action. confirmationToken: CfDJ8…" — a token in the
 * user's own words. The worker now leads each option with the human choice ("Create") and puts the
 * machine line in its own paragraph, and the bubble shows the choice alone: it is what the person
 * pressed, and the card above already says what it applies to.
 *
 * Display only. The stored message is unchanged, because the model reads it back from history.
 */
const MACHINE_LINE = /(?:Confirm|Do not run) the [\w.:-]+ plugin action[^\n]*/;

function choiceOf(machineLine: string): string {
  if (machineLine.startsWith("Do not run")) return "Cancel";
  return /alwaysAllow:\s*true/.test(machineLine) ? "Always allow" : "Confirm";
}

export function userMessageDisplayText(content: string): string {
  if (!content) return content;
  const machine = MACHINE_LINE.exec(content);
  if (!machine) return content;

  // The worker's shape: "Create\n\n<machine line>", possibly with the card's header in front of
  // the choice ("Google Meet: Create") because that is how the card formats an answer.
  const [firstLine = ""] = content.split("\n");
  const lead = firstLine.includes(machine[0]) ? "" : firstLine.trim();
  if (lead) {
    const afterHeader = lead.split(": ").pop()?.trim();
    return afterHeader || lead;
  }
  return choiceOf(machine[0]);
}
