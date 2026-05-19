# Landing Page Documentation

## Aura AI Email Landing Page Experiment (Latest)

**What changed:**
Replaced the existing WarpTalk landing hero at `/` with an Aura AI-native email client landing page experiment. The page is implemented in the existing Next.js app using React, TypeScript, Tailwind CSS, `motion/react`, and `lucide-react`.

**Why it changed:**
The branch is being used to test a premium, cinematic, glassy landing page treatment with a fullscreen looping background video, shiny animated headline, macOS-style menu strip, realistic inbox mockup, liquid-glass cards, logo cloud, testimonials, pricing, and final CTA.

**Files affected:**
- `src/app/page.tsx` - complete Aura landing page implementation
- `src/app/globals.css` - Inter import, brand color token, selection styling, shiny headline animation, liquid-glass utility, and custom pricing section CSS
- `package.json` / `package-lock.json` - added `motion` and `@supabase/supabase-js` dependencies requested by the landing page test spec

**How the page currently works:**
- The root wrapper uses a dark `#0c0c0c` base with a fixed fullscreen CloudFront video behind all content.
- Root-level SVG noise filter powers the animated "Revitalized" headline texture.
- Navbar, hero, menu strip, inbox mockup, feature triage, logo cloud, testimonials, pricing, and final CTA are composed inside `src/app/page.tsx`.
- Pricing uses local React state to toggle monthly/yearly prices.
- Liquid-glass treatment is a shared CSS utility applied to triage cards, testimonials, and the final CTA.

**Important UI behavior:**
- Motion animations use `motion/react` and stagger key areas on initial render or when scrolled into view.
- The inbox mockup keeps its desktop grid fidelity by allowing horizontal overflow on narrow screens rather than compressing the email client beyond readability.
- Pricing cards become horizontal scroll-snap cards below 1024px.

**Known limitations:**
- This is a landing page experiment for "Aura"; copy and branding do not match WarpTalk production positioning.
- The CloudFront video is remote. If the URL becomes unavailable, the page falls back visually to the dark background and overlay.
- `@supabase/supabase-js` is installed per the requested stack but is not used by this static marketing page yet.

**Testing checklist:**
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Open `http://localhost:3000/` and verify the video-backed cinematic page renders.
- [ ] Check desktop sections: navbar, hero, menu bar, inbox mockup, triage, logo cloud, testimonials, pricing, final CTA.
- [ ] Check pricing toggle updates Standard and Pro prices.
- [ ] Check mobile layout for no incoherent text overlap.

This document maintains the state, changes, and logic for the Landing Page.

---

## GlassOverlay — Full-Screen Coverage + Hover Effect (Latest)

**What changed:**
Extended GlassOverlay to cover the **full hero section** (100vw × 100dvh) using Next.js `<Image fill>` + `object-cover`.
Removed all width-constraining classes (`w-[80vw]`, `max-w-[1400px]`, etc.).
The interaction zone also became `absolute inset-0`, matching the full hero bounds.
The cursor-reactive water-surface hover effect (SVG displacement + depression shadow + bubbles) is fully preserved and now operates across the entire viewport.

**Why it changed:**
The previous layout left visible white bands on left/right edges and did not cover the full hero height on short viewports. The image asset (image-b.png) looks best when it spans edge-to-edge as a full-bleed background layer under the text content.

**Files affected:**
- `src/components/landing/GlassOverlay.tsx` — full-screen layout rewrite

**How full-screen scaling works:**

| Technique | Details |
|-----------|---------|
| `<Image fill>` | Next.js `fill` prop makes the `<img>` absolutely-positioned, matching its parent's bounding box |
| `object-cover` | Crops the image to fill the box while preserving aspect ratio — no distortion, no letterboxing |
| Parent `absolute inset-0` | The image container and interaction zone both use `absolute inset-0` to exactly match the hero section's `relative` bounds |
| `sizes="100vw"` | Informs Next.js optimizer to generate the right srcset for a full-viewport image |

**How hover effects stay functional:**
- Mouse position is still computed as `(clientX - rect.left) / rect.width` — the larger rect simply maps to the full viewport now
- Bubble `x/y` coordinates are still stored as `%` values relative to the wrapper, so they automatically position correctly at any screen size
- SVG filter region expanded to `-20% / +140%` to prevent clipping at viewport edges when `scale` is non-zero
- All RAF lerp logic and turbulence anchoring unchanged

**Known limitations:**
- `object-cover` will crop the image's top/bottom on ultra-wide screens (e.g. 21:9). This is intentional — the alternative (`object-contain`) would leave blank bars.
- The displacement filter at full-screen scale may be slightly heavier on GPU than the previous centred-crop version. `MAX_DISPLACEMENT` (12px) is kept conservative.

**Testing checklist:**
- [ ] Image covers full hero (no white bands left/right or top/bottom)
- [ ] Aspect ratio not distorted at 375px / 768px / 1280px / 1920px / 2560px widths
- [ ] Mouse-over triggers ripple distortion and depression shadow
- [ ] Bubbles spawn and rise from cursor position
- [ ] Mouse-leave fades all effects smoothly
- [ ] "Start translating now" CTA button remains clickable (z-20 layer unblocked)
- [ ] HeroSection.tsx unchanged

---

## GlassOverlay — Cursor-Reactive Water-Surface Hover Effect (Previous)

**What changed:**
Removed the `motion-safe:animate-[float_6s_ease-in-out_infinite]` floating animation from the GlassOverlay component and replaced it with an interactive water-surface hover effect driven entirely by CSS + JavaScript (no Three.js / WebGL).

**Why it changed:**
The floating animation was a passive visual. The new hover interaction makes the hero feel alive and tactile — responding directly to cursor position.

**Files affected:**
- `src/components/landing/GlassOverlay.tsx` — complete rewrite of animation/interaction logic
- `src/app/globals.css` — `@keyframes float` and `.animate-float` remain but are no longer used by GlassOverlay (kept for other potential usages)

**How it works:**

| Layer | Technique | Purpose |
|-------|-----------|---------|
| **SVG Displacement** | `feTurbulence` + `feDisplacementMap` SVG filter | Warps image pixels locally to simulate water surface depression |
| **Depression Shadow** | Radial gradient `<div>` overlay | Dark ellipse centered at cursor simulates the shadow ring of a real indent |
| **Bubble Particles** | Timed DOM `<span>` elements + CSS `@keyframes` | Rising glossy circles mimic air bubbles released by surface contact |

**Key implementation details:**
- `feDisplacementMap.scale` is mutated imperatively via a `ref` (not React state) inside a `requestAnimationFrame` loop — zero re-renders per frame.
- Displacement is lerped toward `MAX_DISPLACEMENT` (12px) on hover and back to 0 on leave using a configurable `LERP_FACTOR` (0.08).
- `feTurbulence.baseFrequency` is shifted with cursor `(nx, ny)` so the ripple pattern *originates at the cursor*, not at a fixed grid. This is the key trick for the "water indent at cursor" illusion.
- The SVG `seed` attribute is randomly varied (~12% of mouse-move events) for an organic, non-repeating texture.
- Bubbles are spawned every 300ms via `setInterval`, capped at 8 concurrent, with slight `x/y` jitter. They are removed via `setTimeout` after `mouseLeave`.
- `pointer-events-none` on the outer div, `pointer-events-auto` only on the image wrapper — hero CTA button (z-20) remains fully clickable.

**Important UI Behavior:**
- Image is completely static (no transform, no translation) by default.
- The image is never rotated or treated as a 3D object.
- Effect fades out smoothly on mouse-leave via the RAF lerp loop.
- Bubble animation uses inline `<style>` scoped to the component render tree, not global CSS.
- `mix-blend-multiply` is preserved at the outer shell level for consistent rendering with the halftone background.

**Known Limitations:**
- SVG filter performance on very large viewports may cause slight lag on lower-end GPUs. `MAX_DISPLACEMENT` is kept at 12px to minimise filter area workload.
- The `seed` state change triggers a minor React re-render (~12% of mouse-move events). This is acceptable as it only re-renders the SVG defs, not the image.
- The effect is desktop-only (hover). No touch interaction is currently implemented.

**Testing checklist:**
- [ ] Image renders statically without any floating on load
- [ ] Mouse over image → subtle ripple distortion appears at cursor
- [ ] Radial dark shadow tracks cursor smoothly
- [ ] Small bubbles rise from hover area and fade out
- [ ] Mouse leave → all effects fade/clear smoothly
- [ ] Hero "Start translating now" button is still clickable (not blocked by overlay)
- [ ] Layout unchanged at sm / md / lg / xl breakpoints
- [ ] `mix-blend-multiply` compositing with halftone background unchanged

**Notes for future maintainers:**
- To increase ripple intensity: raise `MAX_DISPLACEMENT` (try 16–20).
- To add mobile support: implement `touchmove` handlers using the same `handleMouseMove` logic with `Touch.clientX/Y`.
- The `@keyframes float` rule in `globals.css` is still present but unused by GlassOverlay. It can be safely removed if no other component uses `.animate-float`.

---

## Hero Section Update (Previous)

**What changed:**
Refactored the Hero Section visuals to use the provided source assets directly as background and foreground models. Updated the implementation of `HalftoneBackground` and `GlassOverlay` components to exactly match the target layout aesthetics while ensuring a premium, monochrome feel. 

**Why it changed:**
The components needed to perfectly reflect the target design composition, isolating models from their background without reinterpreting them into abstract shapes.

**Files affected:**
- `src/components/landing/HeroSection.tsx`
- `src/components/landing/HalftoneBackground.tsx`
- `src/components/landing/GlassOverlay.tsx`

**How it works:**
- **HalftoneBackground:** Renders `image-a.png` directly with `object-contain` (not `object-cover`) to preserve the full source composition including side models. `opacity-[0.38]` is used instead of `0.15` to keep the dot field crisp and visible. The harmful radial gradient mask has been completely removed — it was systematically erasing the side models because they live at the outer edges of the image. `mix-blend-multiply` is applied only once at the container level.
- **GlassOverlay:** Scaled up significantly: `w-[85vw] max-w-[1400px]` on desktop to ensure the glass form overlaps the center of Image A. `mix-blend-multiply` is applied only at the top container level, not stacked on inner divs and the `<Image>` itself.
- **HeroSection:** `className` constraint removed from `HalftoneBackground` prop — the `150vw/120vw` override was forcing `absolute inset-0` to stretch past the component's natural bounds incorrectly. The component now fills the `absolute inset-0` naturally.

**Root causes of the 30% zoom dependency:**
- At 30% zoom, the browser renders `100vw` as only 30% of the physical screen. So a `140vw` wrapper appeared as `140% × 30% = 42%` of actual screen — looking correct only because of the zoom compensation.
- At 100% zoom, `140vw` only reaches 140% of the viewport, which was not enough for Image B's long horizontal form to span edge-to-edge.

**UX scale correction — models scaled DOWN for comfortable viewing:**
- Previous attempt pushed vw values to 200–260vw which made Image B dominate the entire viewport, overwhelming text and removing breathing room.
- Final balanced values:
  - Image A: `w-[110vw] → w-[130vw]`, `max-w-[2400px]`, `opacity-[0.35]` — subtle left/right wave presence
  - Image B: `w-[80vw] → w-[100vw]`, `max-w-[1400px]`, `opacity-[0.9]` — glass form occupies ~80–100% of viewport width, stays as focal centerpiece without overwhelming
- HeroSection: `justify-center` restored. Content div uses `-mt-[8vh]` to shift text slightly upward relative to center so the glass model has visual breathing room below.

**Important UI Behavior:**
- The background and overlay both maintain their original visual proportions without stretching.
- The checkerboard previews are completely neutralized via CSS (`filter: brightness(1.08) contrast(1.15)`) + `mix-blend-multiply`.
- The hero is fully responsive and feels like an unconstrained, premium landing page environment.
- Animations automatically disable for users who prefer reduced motion.

**Known Limitations:**
- Generating halftone dots on the client side requires pixel iteration; it's optimized by only running once per mount.
- Image assets (A and B) should be kept at reasonable resolutions to avoid memory bottlenecks during canvas sampling.

## Bug Fixes (Hydration & Static Assets)

**What changed:**
- Renamed image assets from `Image A.png`/`Image B.png` to `image-a.png`/`image-b.png` and updated their references.
- Updated `middleware.ts` config matcher to allow static image files through without an authentication redirect.
- Added `suppressHydrationWarning` to the `<body>` element in `src/app/layout.tsx`.
- Added `h-auto` class to `GlassOverlay` to fix Next.js image aspect ratio warnings.

**Why it changed:**
- Next.js and browser environments can fail to resolve assets with spaces if they are not heavily URL-encoded.
- The `middleware.ts` was previously intercepting `.png` files that were placed in the root of `/public` and redirecting them to `/login`.
- The user had a browser extension (like ColorZilla) injecting `cz-shortcut-listen="true"` into the body tag before React hydrated, causing a Hydration Mismatch error.
- Next.js requires explicit `height: auto` (or `h-auto` in Tailwind) when an image's width is controlled by CSS to maintain its original aspect ratio.
