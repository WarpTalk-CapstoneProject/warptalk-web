import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { userMessageDisplayText } from "../confirmation-answer.ts";

describe("WarpBot — a confirmation answer shows the choice, never its token", () => {
  test("the worker's shape shows the choice alone", () => {
    const sent =
      "Google Meet: Create\n\nConfirm the google_calendar_create_meet_event plugin action. confirmationToken: CfDJ8abc";
    assert.equal(userMessageDisplayText(sent), "Create");
  });

  test("always allow and cancel read as themselves", () => {
    assert.equal(
      userMessageDisplayText(
        "Google Meet: Always allow\n\nConfirm the google_calendar_create_meet_event plugin action and always allow it from now on. confirmationToken: t alwaysAllow: true",
      ),
      "Always allow",
    );
    assert.equal(
      userMessageDisplayText("Google Meet: Cancel\n\nDo not run the save_issue plugin action."),
      "Cancel",
    );
  });

  test("older one-line answers are replaced by the choice they encode", () => {
    assert.equal(
      userMessageDisplayText("Confirm plugin action: Confirm the save_issue plugin action. confirmationToken: t"),
      "Confirm",
    );
    assert.equal(
      userMessageDisplayText(
        "Confirm plugin action: Confirm the save_issue plugin action and always allow it from now on. confirmationToken: t alwaysAllow: true",
      ),
      "Always allow",
    );
    assert.equal(
      userMessageDisplayText("Confirm plugin action: Do not run the save_issue plugin action."),
      "Cancel",
    );
  });

  test("an ordinary message is left alone", () => {
    const text = "Confirm the plan with Nhi before Friday";
    assert.equal(userMessageDisplayText(text), text);
    assert.equal(userMessageDisplayText(""), "");
  });
});
