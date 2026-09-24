"use client";

import { useState } from "react";
import { PuzzlePiece } from "@phosphor-icons/react";

import { pluginIconSources, pluginInitials, type PluginIconSubject } from "@/lib/assistant/plugin-brand-icons";
import { cn } from "@/lib/utils";

type PluginGlyphSize = "xs" | "sm" | "md" | "lg";

const GLYPH_SIZES: Record<PluginGlyphSize, { box: string; icon: number }> = {
  xs: { box: "size-7 rounded-[7px] text-[10px] font-semibold", icon: 14 },
  sm: { box: "size-8 rounded-lg text-[10px] shadow-sm", icon: 16 },
  md: { box: "size-10 rounded-lg text-xs shadow-sm", icon: 16 },
  lg: { box: "size-14 rounded-lg text-sm shadow-sm", icon: 24 },
};

/**
 * A plugin's icon, everywhere a plugin is drawn: the member's connections page, the workspace
 * Plugins page and its dialogs, WarpBot's Skills menu and mention chips, and /admin/plugins.
 *
 * ONE SOURCE. What to draw is decided by `pluginIconSources` (lib/assistant/plugin-brand-icons.ts):
 * the row's own `avatarUrl` first, then the brand mark this app bundles for the plugin key, then the
 * label's initials. Admin rows used to draw no icon at all and the seeded MCP apps drew letter tiles,
 * because each surface had its own idea of where an icon came from.
 *
 * WHY THE LOAD FAILURE IS TRACKED
 *   An `avatarUrl` an admin typed can point anywhere, so drawing it is a request that can fail —
 *   offline, blocked, or moved. Branching on the field being empty only covers a plugin that never
 *   had an icon; the request *failing* left a broken-image box in the tile. Failures are remembered
 *   by src, so the next candidate is tried, and a plugin whose icon changes gets a fresh attempt
 *   instead of being stuck on its initials until a reload.
 *
 * A LIGHT TILE behind every image: brand marks are designed for a light ground, and Linear's and
 * Notion's are black — on the dark theme's surface they would all but disappear.
 *
 * NOT AN AVATAR. The field is named `avatarUrl` but it is a product logo, not a face, and it must
 * not go through `AvatarImage`: that resolves relative paths onto the API origin, which is right
 * for an uploaded portrait and wrong for `/assets/plugins/…`, which this app serves itself.
 */
export function PluginGlyph({
  plugin,
  size = "md",
  className,
}: {
  /** The label, plus whatever the surface has of the avatar and the key. */
  plugin: PluginIconSubject & { label: string };
  size?: PluginGlyphSize;
  className?: string;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);

  const source = pluginIconSources(plugin).find((candidate) => !failed.includes(candidate)) ?? null;
  const { box, icon } = GLYPH_SIZES[size];
  const initials = pluginInitials(plugin.label);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-border text-ink",
        source ? "bg-white" : "bg-surface-2",
        box,
        className,
      )}
      title={plugin.label}
    >
      {source ? (
        // next/image is not usable here: a remote avatar's host would have to be added to
        // `images.remotePatterns`, and its error path cannot hand over to the next candidate.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={source}
          src={source}
          alt=""
          className="size-full object-contain p-[14%]"
          onError={() => setFailed((current) => (current.includes(source) ? current : [...current, source]))}
        />
      ) : (
        initials || <PuzzlePiece size={icon} weight="duotone" />
      )}
    </span>
  );
}
