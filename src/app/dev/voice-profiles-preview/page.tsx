"use client";

/**
 * The Voice Profiles layout, rendered against fixtures.
 *
 * WHY IT EXISTS
 *   Every row on `/[workspaceSlug]/settings`-adjacent pages needs a session; this one needs a
 *   session AND a voice catalogue warmed by the AI worker AND a profile part-way through
 *   cloning. None of that is reachable from a laptop, so the only way to LOOK at this page has
 *   been to deploy it — which is how it accrued a metric strip hardcoded to "vi-VN", three
 *   independent language dropdowns and a `status` string printed raw into a badge.
 *
 *   The fixtures below make the states that are hard to reach on purpose: a profile that is
 *   cloning, one whose clone failed, one currently dubbing the reader, and a catalogue voice set
 *   as their listening default.
 *
 * IT IS NOT THE PAGE
 *   It renders the page's LAYOUT and ROWS, not its data layer. It cannot catch a wrong query key
 *   or a mis-mapped DTO — only what the split, the rail and the lines look like once data
 *   arrives, at whatever width the main region happens to be.
 */

import { useEffect } from "react";
import { CheckCircle, DotsThree, Play, Plus } from "@phosphor-icons/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { VoiceChip, VoiceLine } from "@/components/voice/voice-line";
import {
  WorkspaceFilterPill,
  WorkspaceListModule,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceRailModule,
  WorkspaceSplit,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";

const PROFILES = [
  { name: "My presenting voice", language: "Vietnamese", tone: "ready", status: "Ready", detail: "", dubbing: true },
  { name: "Podcast voice", language: "English", tone: "ready", status: "Ready", detail: "", dubbing: false },
  { name: "Conference voice", language: "English", tone: "pending", status: "Cloning", detail: "usually under a minute", dubbing: false },
  { name: "Old demo take", language: "English", tone: "failed", status: "Couldn't clone", detail: "", dubbing: false },
] as const;

const LIBRARY = [
  { name: "Ava", gender: "Female", listening: true },
  { name: "Brooke", gender: "Female", listening: false },
  { name: "Daniel", gender: "Male", listening: false },
  { name: "Linh", gender: "Female", listening: false },
  { name: "Minh", gender: "Male", listening: false },
] as const;

/**
 * The three widths the main region actually takes: full page, one meeting side panel open, both
 * open. All three are rendered at once — the split's breakpoints are container queries, and the
 * only honest way to check a container query is to put the component in containers of each size.
 */
const WIDTHS = [
  { label: "Full width", width: "100%" },
  { label: "One side panel open — 860px", width: "860px" },
  { label: "Both side panels open — 520px", width: "520px" },
] as const;

export default function VoiceProfilesPreviewPage() {
  // ?theme=light / ?theme=dark. Both themes have to be looked at, and the machine doing the
  // looking follows the OS — which pins it to one of them and hides every regression in the
  // other. A dev preview that can only show one theme is half a preview.
  const { setTheme } = useTheme();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") setTheme(requested);
  }, [setTheme]);

  return (
    <div className="flex min-h-dvh flex-col gap-8 bg-canvas p-6">
      {WIDTHS.map((option) => (
        <section key={option.label} className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
            {option.label}
          </h2>
          <Frame width={option.width} />
        </section>
      ))}
    </div>
  );
}

function Frame({ width }: { width: string }) {
  return (
      <div
        style={{ width, maxWidth: "100%" }}
        className="overflow-hidden rounded-[14px] border border-border"
      >
        <WorkspacePage className="h-auto">
          <WorkspaceToolbar
            filters={
              <>
                <WorkspaceFilterPill label="All voices" selected onClick={() => {}} />
                <WorkspaceFilterPill label="Mine" count={4} selected={false} onClick={() => {}} />
                <WorkspaceFilterPill label="Library" selected={false} onClick={() => {}} />
                <WorkspaceFilterPill
                  label="Needs attention"
                  count={2}
                  selected={false}
                  onClick={() => {}}
                />
              </>
            }
            actions={
              <WorkspacePrimaryButton icon={<Plus size={13} weight="bold" />}>
                Create profile
              </WorkspacePrimaryButton>
            }
          />

          <WorkspaceSplit
            className="overflow-visible"
            rail={
              <>
                <WorkspaceRailModule
                  title="Cloning you in a meeting"
                  badge={
                    <VoiceChip tone="ready">
                      <CheckCircle size={11} weight="fill" />
                      Allowed
                    </VoiceChip>
                  }
                  description="A meeting may build a voice model from the first seconds of your speech and dub you in it. That model is biometric data, is used only to dub what you say, and stops being used the moment you withdraw this."
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] text-ink-subtle">
                      18/08/2026 · terms 2026-08-13.v1
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[12px] text-destructive hover:text-destructive"
                    >
                      Withdraw
                    </Button>
                  </div>
                </WorkspaceRailModule>

                <WorkspaceRailModule
                  title="You are dubbed in"
                  description="How you sound to people listening in another language."
                >
                  <Button
                    variant="outline"
                    className="h-8 w-full justify-between px-3 text-[12.5px] font-medium"
                  >
                    My presenting voice
                  </Button>
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12px] text-ink-muted">
                      <Play size={13} weight="fill" />
                      Hear it
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-ink-muted">
                      Clone me live instead
                    </Button>
                  </div>
                </WorkspaceRailModule>

                <WorkspaceRailModule
                  title="Voices you hear"
                  description="Used for a speaker in Vietnamese who has not picked a voice of their own."
                >
                  <p className="text-[13px] font-medium text-ink">Ava</p>
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12px] text-ink-muted">
                      <Play size={13} weight="fill" />
                      Hear it
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-ink-muted">
                      Clear
                    </Button>
                  </div>
                </WorkspaceRailModule>

                <WorkspaceRailModule title="Your voices">
                  <p className="flex items-baseline gap-2">
                    <span className="text-[22px] leading-[1.1] font-semibold tracking-tight text-ink tabular-nums">
                      4
                    </span>
                    <span className="text-[12px] text-ink-subtle">profiles, 2 usable today</span>
                  </p>
                  <div className="flex h-1 overflow-hidden rounded-full bg-surface-3">
                    <span className="bg-emerald-500" style={{ width: "50%" }} />
                    <span className="bg-amber-500" style={{ width: "25%" }} />
                    <span className="bg-destructive" style={{ width: "25%" }} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />2 ready
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-amber-500" />1 cloning
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-destructive" />1 failed
                    </span>
                  </div>
                </WorkspaceRailModule>
              </>
            }
          >
            <WorkspaceListModule title="Your voices" count={4}>
              {PROFILES.map((profile) => (
                <VoiceLine
                  key={profile.name}
                  tone={profile.tone}
                  name={profile.name}
                  badge={profile.dubbing ? <VoiceChip tone="active">Dubbing you</VoiceChip> : undefined}
                  secondary={profile.language}
                  statusText={[profile.status, profile.detail].filter(Boolean).join(" · ")}
                  status={
                    <>
                      {profile.tone === "ready" ? (
                        <span>Ready</span>
                      ) : (
                        <VoiceChip tone={profile.tone === "failed" ? "failed" : "pending"}>
                          {profile.status}
                        </VoiceChip>
                      )}
                      <span className="truncate">{profile.detail}</span>
                    </>
                  }
                  actions={
                    <>
                      {profile.tone === "ready" ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted">
                          <Play size={13} weight="fill" />
                        </Button>
                      ) : null}
                      {profile.tone === "failed" ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-primary">
                          Re-record
                        </Button>
                      ) : null}
                      <span className="grid size-7 place-items-center rounded-md text-ink-subtle">
                        <DotsThree size={16} weight="bold" />
                      </span>
                    </>
                  }
                />
              ))}
            </WorkspaceListModule>

            <WorkspaceListModule
              title="Library voices"
              count={LIBRARY.length}
              actions={
                <Button variant="outline" className="h-[28px] w-[152px] justify-between rounded-full px-3 text-[12.5px]">
                  Vietnamese
                </Button>
              }
            >
              {LIBRARY.map((voice) => (
                <VoiceLine
                  key={voice.name}
                  tone="library"
                  name={voice.name}
                  badge={voice.listening ? <VoiceChip tone="active">You hear this</VoiceChip> : undefined}
                  secondary={voice.gender}
                  statusText={voice.listening ? "Your default" : undefined}
                  actions={
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted">
                        <Play size={13} weight="fill" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-primary">
                        {voice.listening ? "Clear" : "Use"}
                      </Button>
                    </>
                  }
                />
              ))}
            </WorkspaceListModule>
          </WorkspaceSplit>
        </WorkspacePage>
      </div>
  );
}
