"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "@phosphor-icons/react/dist/ssr";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setUserLocale } from "@/i18n/actions";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locale-constants";

/**
 * Switches the UI display language (chrome text only — buttons, labels,
 * toasts). Unrelated to a meeting's spoken/translated language, which is
 * chosen per room via `src/lib/language/languages.ts`.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common.languageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("srLabel")}
        disabled={isPending}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/50 px-3 text-sm font-medium text-ink-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60",
          className,
        )}
      >
        <Globe size={16} weight="regular" />
        <span>{t(locale)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {SUPPORTED_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleSelect(code)}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span>{t(code)}</span>
            {code === locale ? <Check size={14} weight="bold" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
