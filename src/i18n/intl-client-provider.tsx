"use client";

import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessageFallback, onIntlError } from "@/i18n/message-fallback";

/**
 * `NextIntlClientProvider` with the missing-message handlers attached.
 * Functions cannot cross the Server -> Client boundary as props, so the root
 * layout renders this wrapper instead of passing them itself.
 */
export function IntlClientProvider(
  props: Omit<ComponentProps<typeof NextIntlClientProvider>, "getMessageFallback" | "onError">,
) {
  return (
    <NextIntlClientProvider {...props} getMessageFallback={getMessageFallback} onError={onIntlError} />
  );
}
