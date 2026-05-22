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
  - Branch diagrams reverse their reveal when they leave view on upward scrolling instead of staying as static lines.
  - Smaller supporting diagrams such as the pause line and memory fan-out are drawn directly as animated SVG branches to keep the layout closer to the supplied editorial reference.
  - Includes the step copy: `Every voice leaves a trace`, `Meaning crosses over`, `The conversation keeps moving...`, `The room remembers`, and `Voice returns human`.
  - Includes a `System Signals` sequence for `Capture`, `Understand`, `Translate`, `Speak`, and `Remember`, with a motion connector from the trace lane into the descending SVG rail and staggered row reveals.
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
- The `System Signals` rail is a grid-level motion SVG with its own incoming connector; it draws downward first while row cards reveal with staggered motion beside it.
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
- [x] Verify `System Signals` receives an incoming SVG connector, draws a straight rail, and reveals five rows in order.
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
