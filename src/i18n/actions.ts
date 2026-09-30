"use server";

import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  isSupportedLocale,
  type Locale,
} from "@/i18n/locale-constants";

/** Persists a person's chosen UI locale. Called by the language switcher. */
export async function setUserLocale(locale: Locale): Promise<void> {
  // A Server Action is a public endpoint: the TypeScript type is not enforced
  // at runtime, so reject anything outside the supported list rather than
  // writing it into the cookie.
  if (!isSupportedLocale(locale)) {
    throw new Error("Unsupported locale");
  }
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });
}
