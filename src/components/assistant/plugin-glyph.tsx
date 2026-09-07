"use client";

import { useState } from "react";
import { PuzzlePiece } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

type PluginGlyphSize = "xs" | "sm" | "md" | "lg";

const GLYPH_SIZES: Record<PluginGlyphSize, { box: string; icon: number }> = {
  xs: { box: "size-7 rounded-[7px] text-[10px] font-semibold", icon: 14 },
  sm: { box: "size-8 rounded-lg text-[10px] shadow-sm", icon: 16 },
  md: { box: "size-10 rounded-lg text-xs shadow-sm", icon: 16 },
  lg: { box: "size-14 rounded-lg text-sm shadow-sm", icon: 24 },
};

/**
 * A plugin's icon, on the marketplace row, in the connect dialog and in WarpBot's Skills menu.
 *
 * WHY THE LOAD FAILURE IS TRACKED
 *   `plugin.avatarUrl` is seeded as a URL on a Google host, so drawing it is a third-party
 *   request made at render time: it fails when the machine is offline, when the host is blocked,
 *   or whenever that seeded path moves. Branching on `avatarUrl` being empty only covers a plugin
 *   that never had an icon at all — the request *failing* left a broken-image box sitting in the
 *   tile, and that is the case that actually happens. Both surfaces had their own copy of the
 *   branch and neither had an `onError`, which is why this lives in one component now.
 *
 *   The failure is remembered as the src that failed rather than as a boolean, so a plugin whose
 *   icon changes gets a fresh attempt instead of being stuck on its initials until a reload.
 *
 * NOT AN AVATAR. The field is named `avatarUrl` but it is a product logo, not a face, and it must
 * not go through `AvatarImage`: that resolves relative paths onto the API origin, which is right
 * for an uploaded portrait and wrong for anything served by the web app itself.
 */
export function PluginGlyph({
  plugin,
  size = "md",
  className,
}: {
  plugin: AssistantPluginCatalogItemDto;
  size?: PluginGlyphSize;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  const source = plugin.avatarUrl?.trim() || null;
  const { box, icon } = GLYPH_SIZES[size];
  const initials = plugin.label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-border bg-surface-2 text-ink",
        box,
        className,
      )}
      title={plugin.label}
    >
      {source && source !== failedSource ? (
        // next/image is not usable here: the host would have to be added to
        // `images.remotePatterns`, and its error path cannot hand over to the markup below.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedSource(source)}
        />
      ) : (
        initials || <PuzzlePiece size={icon} weight="duotone" />
      )}
    </span>
  );
}
