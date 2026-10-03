import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { openProviderConsent } from "../open-provider-consent.ts";

const g = globalThis as unknown as { window?: unknown };
const original = g.window;
afterEach(() => {
  g.window = original;
});

describe("openProviderConsent", () => {
  test("reports success, and never passes noopener (it makes window.open return null)", () => {
    const child = { opener: {} as unknown };
    const calls: unknown[][] = [];
    g.window = {
      open: (...args: unknown[]) => {
        calls.push(args);
        return child;
      },
    };
    assert.equal(openProviderConsent("https://accounts.google.com/o/oauth2/v2/auth?x=1"), true);
    assert.deepEqual(calls, [["https://accounts.google.com/o/oauth2/v2/auth?x=1", "_blank"]]);
    assert.equal(child.opener, null);
  });

  test("reports blocked when window.open returns null", () => {
    g.window = { open: () => null };
    assert.equal(openProviderConsent("https://accounts.google.com/x"), false);
  });

  test("refuses non-https and malformed urls without opening", () => {
    let opened = 0;
    g.window = {
      open: () => {
        opened++;
        return {};
      },
    };
    assert.equal(openProviderConsent("http://accounts.google.com/x"), false);
    assert.equal(openProviderConsent("javascript:alert(1)"), false);
    assert.equal(openProviderConsent("not a url"), false);
    assert.equal(opened, 0);
  });
});
