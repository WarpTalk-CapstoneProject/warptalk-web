import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const loginPage = readFileSync(
  new URL("../src/app/(auth)/login/page.tsx", import.meta.url),
  "utf8",
);
const globalsCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

assert.match(
  loginPage,
  /login-auth-page/,
  "Login page must own a light color-scheme scope so dark app theme styles do not bleed into auth fields.",
);

assert.equal(
  (loginPage.match(/login-auth-field/g) ?? []).length,
  2,
  "Both login email and password inputs must use the login-auth-field class.",
);

assert.match(
  globalsCss,
  /\.login-auth-field\s*\{[\s\S]*?background-color:\s*#ffffff\s*!important;[\s\S]*?color:\s*#000000\s*!important;[\s\S]*?-webkit-text-fill-color:\s*#000000;/,
  "Login inputs must force an opaque white surface and black text before autofill applies.",
);

assert.match(
  globalsCss,
  /\.login-auth-field:-webkit-autofill/,
  "Login inputs must explicitly target Chromium's committed autofill pseudo-class.",
);

assert.match(
  globalsCss,
  /\.login-auth-field:autofill/,
  "Login inputs must also target the standard autofill pseudo-class.",
);

assert.match(
  globalsCss,
  /-webkit-box-shadow:\s*0 0 0 1000px #ffffff inset !important;/,
  "Chromium autofill must be covered by an inset white shadow because its internal background can win the normal background property.",
);

assert.match(
  globalsCss,
  /-webkit-text-fill-color:\s*#000000 !important;/,
  "Chromium autofill text must be forced black; normal color does not reliably affect autofill text.",
);

console.log("Login autofill contract: PASS");
