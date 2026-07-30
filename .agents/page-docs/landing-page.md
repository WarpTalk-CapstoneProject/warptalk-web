# Landing Page Documentation

## Current Route

- Route: `/`
- Source: `src/app/page.tsx`
- Theme direction: dark WarpTalk SaaS hero adapted from the previous `Synapse Dark Hero` layout.

## Latest Changes

The landing page was rebuilt from the previous local-video liquid-glass hero into a dark SaaS hero design, then localized back to WarpTalk copy and branding.

### What Changed

- Added a fullscreen pre-page loader before the landing content fades in:
  - Top-left label: `WalpTalk`
  - Center word sequence: `Translation` -> `Clone Voice` -> `AI`
  - Bottom-right counter from `000` to `100`
  - Bottom progress bar using a blue gradient fill
  - Loader exits before the main landing page opacity fades in
  - Loader locks page scrolling while visible and waits for the document shell/fonts plus the hero video readiness gate before it releases the landing page
- Replaced the local MP4 background with a remote Mux HLS stream:
  - `https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8`
- Added `hls.js` and a memoized `VideoPlayer` component.
- `VideoPlayer` attaches HLS to the video element when supported and falls back to native HLS playback where available.
- `VideoPlayer` performs cleanup on unmount by destroying the HLS instance, pausing the video, removing the `src`, and reloading the element.
- Rebuilt the page structure:
  - Fixed blurred glass navbar
  - WarpTalk navbar logo image from `public/assets/logos/warptalk-logo-darkmode.jpg`
  - Nav links: `About`, `Feature`, `Pricing`, `Contact`
  - Rounded WarpTalk logo container
  - No default active nav item on initial hero view
  - Smooth moving `motion/react` active pill after clicking a nav item
  - Gradient CTA button
  - Three glass product badges: `Real-time Translation`, `AI Summary Analysis`, `Human Voice Cloning`
  - Large animated headline: `Translation that feel native`
  - Product subtext: `Real-time interpretation global teams. Natural conversations. Zero language barriers`
  - Primary and secondary CTA buttons that route to `/login`
  - Static grayscale logo row at the bottom
- Added a dedicated `Feature` storytelling section based on the supplied layout reference:
  - The nav `Feature` anchor now scrolls to this section instead of the hero.
  - The section inverts the reference layout for the dark landing page: black background, white text, white/cyan SVG motion lines.
  - The four opening narrative steps now use one desktop SVG story board so the main trace, branch ingress lines, branch labels, and copy share a fixed coordinate system instead of relying on stacked per-step SVG overlays.
  - A scroll-linked `motion/react` spine animates through that board, inspired by the Lusion-style scroll trace effect.
  - Narrative steps sit close to the shared trace while compact SVG branches enter the wave, crossing, pause, and memory diagrams from continuous connection points below each title.
  - The small branch paths inherit scroll progress from the same story-board spine: each fork begins only when the live spine reaches its junction, grows with the continuing spine, and retracts when the user scrolls upward.
  - Branch tick marks and labels reveal after the branch path reaches them, keeping content such as `live`, `low latency`, `room signal`, `xin chao`, `hello`, `bonjour`, and `konnichiwa` tied to the motion sequence instead of appearing as static copy.
  - The 01/02/03/04 branch animations are now derived from the live spine progress rather than a separate scroll timer, so side branches only begin after the main trace reaches each measured fork point.
  - Nested branch diagrams use a shared trunk plus synchronized child paths; child paths no longer duplicate the trunk, so internal forks split together from the same junction instead of showing one child line before another.
  - Child branch starts use flat caps and a slightly lighter stroke so overlapping split points do not create heavy blobs at nested forks.
  - The standalone midpoint nodes on the pause and memory branches were removed; only meaningful label ticks keep their small dots.
  - The passive spine guide was reduced to a very faint ghost line so unfinished sections no longer read as pre-existing branch paths before the active white trace arrives.
  - Branch diagrams reverse their reveal when they leave view on upward scrolling instead of staying as static lines.
  - The trace lane is shifted farther left with a stronger stroke hierarchy: the main spine is thicker/brighter than the branch lines so users can distinguish the primary scroll path.
  - The SVG canvas is extended slightly to the left so the primary rail sits farther left while the long right-side branch endpoints stay visually balanced with the centered copy.
  - Branch reveal ranges were tightened so the fork paths draw faster once the main spine reaches each junction.
  - The Feature trace starts earlier after the hero and uses a faster shared spine progress so the live rail is already moving when users leave the hero.
  - Branch opacity now fades in across a longer slice of branch progress so side paths draw in gradually instead of popping on at the fork.
  - The four branch progress windows are mapped to measured SVG path-length fork points so side branches do not appear before the live spine reaches each fork.
  - Step titles and index labels were compacted into a cleaner left-to-right editorial grid, with branch baselines routed below the large copy to avoid line/text collisions.
  - Major step headings now reveal from the same branch progress as their SVG fork instead of using independent viewport entrance animation.
  - The Feature story board was expanded into a taller single coordinate system so steps 03, 04, and the shared `System Signals` continuation have more even breathing room and are easier to read at 100% zoom.
  - The lower memory fork and shared `System Signals` rail were shifted deeper in that same coordinate system so step 04 finishes in a readable lower viewport band before the five signal rows enter.
  - The lower story-board scroll mapping now finishes the shared trace faster than the page translation near the System Signals handoff, and the signal list border waits for the rail reveal instead of flashing an empty frame first.
  - The story-board end offset is tuned so the shared live trace reaches the System Signals rail while that block is still inside the readable viewport, keeping the rail and its rows in step with the scroll frame.
  - Step 04 sits deeper in the lower reading band, and each System Signals row now waits for the live rail to pass its SVG dot before its copy and pattern reveal.
  - The deepened 04 fork and the System Signals rail are re-gated from their measured positions on the longer shared spine so neither branch reveal nor row content gets ahead of the live trace.
  - The pause branch was routed below the paragraph copy so the animated line no longer crosses through `The conversation keeps moving...`.
  - Lower branch reveal ranges are gated at the measured fork thresholds of the shared spine, then draw quickly after the junction so 03, 04, and System Signals stay readable without letting side branches outrun the main line.
  - Smaller supporting diagrams such as the pause line and memory fan-out are drawn directly as animated SVG branches to keep the layout closer to the supplied editorial reference.
  - Includes the step copy: `Every voice leaves a trace`, `Meaning crosses over`, `The conversation keeps moving...`, `The room remembers`, and `Voice returns human`.
  - Includes a `System Signals` sequence for `Capture`, `Understand`, `Translate`, `Speak`, and `Remember`.
  - The `System Signals` rail is the lower continuation of the same story-board SVG spine, and its dots plus 01-05 rows are mapped from that shared scroll progress.
  - The step headings, System Signals intro, rail, dots, and rows are all progress-driven so they appear in sequence with the single trace instead of being present before the line reaches them.
  - The lower board spacing gives the 04 memory branch, the System Signals rows, and `Voice returns human` separate reading beats while keeping one continuous SVG trace from the narrative spine into the signal rail.
- Added a WarpTalk pricing section using the requested `c3` cinematic pricing card treatment:
  - `Free`, `Standard`, and `Pro` cards
  - WarpTalk-specific features for real-time translation, AI summaries, and voice cloning
  - Yearly pricing toggle
  - Large decorative `Translation / Native` watermark
  - Compact desktop sizing so the watermark and pricing cards fit in one viewport below the navbar.
- Added a WarpTalk-branded footer section adapted from the requested Kresna footer reference:
  - White `section.footer-section` surface with two rounded cards
  - Left card uses the requested autoplaying video background with no overlay
  - Left card uses the local WarpTalk icon and `WarpTalk` wordmark instead of the Kresna mark
  - Right card contains navigation/company links, floating lucky badge, copyright, and subscribe form
  - Faded SVG `WarpTalk` watermark uses the same getBBox-based viewBox fitting behavior as the requested HTML reference
  - Compact desktop spacing so the footer card content and watermark fit in one viewport below the navbar.
- Added Google Font imports for `DM Sans` and `Caveat` to support the footer typography.
- Uses `motion/react` staggered fade-in-up animations for the hero content.

### Files Affected

- `src/app/page.tsx`
- `src/app/globals.css`
- `package.json`
- `package-lock.json`

## Current UI Structure

1. Root black hero surface.
2. Absolute HLS video container:
   - `inset-0`
   - fills the full hero viewport
   - `opacity-100`
   - no dark overlay
3. Fixed top glass navbar with anchors for `#about`, `#features`, `#pricing`, and `#contact`.
4. Centered hero content with staggered animation.
5. Bottom static logo marquee row using placeholder SVG marks.
6. Feature trace section (`#features`) with:
   - Scroll-linked SVG path drawing
   - Four narrative steps
   - Five system signal rows
   - Final waveform and room-understanding copy
7. Pricing section (`#pricing`) with:
   - Cinematic glass pricing cards
   - Yearly toggle state
   - WarpTalk pricing plan copy
8. Footer contact section (`#contact`) with:
   - Video card
   - Navigation/company columns
   - Floating lucky badge
   - Subscribe form
   - Faded WarpTalk watermark

## Important UI Behavior

- The background video is intentionally not darkened by overlays.
- The hero video is full-screen behind the entire first viewport instead of only occupying the upper band.
- The loader keeps the landing content hidden until its counter finishes and required landing readiness gates complete, then the page fades in.
- While the loader is active, the document/body scrolling surfaces are locked so refresh and wheel gestures cannot skip into the landing page early.
- The HLS stream requires browser/network access to `stream.mux.com`.
- Badges, headline, subtext, and buttons animate in with a staggered fade-up sequence.
- Any landing CTA related to getting started routes to `/login`.
- Navbar links are hidden below the `md` breakpoint.
- Landing anchors use an 80px scroll margin so the fixed navbar does not cover section starts while pricing/footer still fit in the viewport.
- Nav items are not active on initial hero view. Clicking `About`, `Feature`, `Pricing`, or `Contact` sets the active item and moves a shared layout pill between links.
- The `Feature` section uses `useScroll` path progress to draw the shared story-board spine and the lower waveform as the user scrolls.
- The opening `Feature` trace follows `scrollYProgress` directly inside the fixed desktop story board so the spine and branch connection points stay locked to the same visual coordinate system at 100% zoom.
- The opening `Feature` branch diagrams live in the same SVG story board as the trace lane, keeping the small branches continuous while leaving the title blocks clear on desktop.
- Branch progress is range-mapped from the shared spine path at the four fork junctions, so short horizontal lines stop at their endpoints while the spine keeps moving down to later forks.
- The `System Signals` rail is drawn as the lower tail of the same story-board SVG spine; its dots and row visibility are driven by the board scroll progress instead of standalone viewport animations.
  - The `System Signals` copy appears first, dots light in order, each row divider is an animated SVG path, and row content is gated until after its horizontal path has crossed the rail dot.
  - The `System Signals` intro copy is positioned above the first row so the rail dots can appear before row content without overlapping `Capture`.
  - Signal rail dots now finish their sequential reveal early, before the horizontal row lines draw across them.
- The pricing yearly toggle only updates the displayed price text; it does not yet start checkout.
- Footer social icons, footer nav links, and subscribe button use hover-only transitions.
- Footer watermark viewBox is recalculated after fonts are ready and on resize.
- Footer has `scroll-margin-top` so the fixed navbar does not cover it when users jump to `#contact`.

## Known Limitations

- The logo row uses placeholder SVG/text marks until official partner/customer logos exist.
- The navbar logo is cropped from a square JPG asset; use a transparent horizontal logo asset if one becomes available.
- HLS playback depends on remote Mux stream availability.
- Pricing buttons are presentational and are not wired to a payment or plan selection flow.
- Footer social links are visual placeholders and do not yet navigate to real WarpTalk social URLs.
- Footer subscribe input is presentational and not wired to a mailing-list endpoint.

## Testing Checklist

- [x] Run ESLint on `src/app/page.tsx`.
- [x] Open `/` and verify the Mux HLS background video plays.
- [x] Verify navbar glass blur and rounded WarpTalk logo container.
- [x] Verify navbar starts with no active item and the active pill moves after clicking nav links.
- [x] Verify headline and subtext match the requested WarpTalk copy.
- [x] Verify staggered fade-up animation on badges, headline, subtext, and buttons.
- [x] Verify bottom placeholder logo row is visible and low-opacity grayscale.
- [x] Verify `Feature` nav scrolls to the new trace section and activates the moving nav pill.
- [x] Verify feature section uses black background, white content, SVG trace path, and five system signal rows.
- [x] Verify the desktop story board keeps branch connectors and title copy aligned without crossing the main Feature step glyphs.
- [x] Verify the desktop `Meaning crosses over` branch remains horizontal with language labels on the crossing SVG line.
- [x] Verify step headings sit closer to the shared spine and animated branch ingress paths lead into the compact diagrams.
- [x] Verify branch diagrams retract when scrolled out of view upward.
- [x] Verify `System Signals` continues from the shared SVG spine, draws a straight rail, and reveals five rows in order.
- [x] Verify the main trace remains visible through the lower `Voice returns human` and `When the room understands` Feature content.
- [x] Verify footer layout, video card, WarpTalk logo treatment, and watermark on desktop.
- [x] Verify loader appears before the page and exits after the progress reaches 100.
- [x] Verify loader locks page scrolling while visible and waits for the landing readiness gate.
- [x] Verify all landing `Get Started` CTAs navigate to `/login`.
- [x] Verify pricing cards render and yearly toggle updates prices.
- [x] Verify hero video fills the full viewport.
- [x] Verify pricing watermark/cards fit within the viewport after clicking `Pricing`.
- [x] Verify footer wrapper/watermark fit within the viewport after clicking `Contact`.
- [ ] Verify footer stacks cleanly below `860px` and subscribe row fits below `560px`.
