# Landing Page Documentation

## Current Route

- Route: `/`
- Source: `src/app/page.tsx`
- Theme direction: dark WarpTalk SaaS hero adapted from the previous `Synapse Dark Hero` layout.

## Latest Changes

The landing page was rebuilt from the previous local-video liquid-glass hero into a dark SaaS hero design, then localized back to WarpTalk copy and branding.

### What Changed

- Replaced the local MP4 background with a remote Mux HLS stream:
  - `https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8`
- Added `hls.js` and a memoized `VideoPlayer` component.
- `VideoPlayer` attaches HLS to the video element when supported and falls back to native HLS playback where available.
- `VideoPlayer` performs cleanup on unmount by destroying the HLS instance, pausing the video, removing the `src`, and reloading the element.
- Rebuilt the page structure:
  - Fixed blurred glass navbar
  - WarpTalk navbar logo image from `public/assets/logos/warptalk-logo-darkmode.jpg`
  - Nav links: `About`, `Feature`, `Pricing`, `Contact`
  - Active gradient-border `Feature`
  - Gradient CTA button
  - Three glass integration badges
  - Large animated headline: `Translation that feel native`
  - Product subtext: `Real-time interpretation global teams. Natural conversations. Zero language barriers`
  - Primary and secondary CTA buttons
  - Static grayscale logo row at the bottom
- Uses `motion/react` staggered fade-in-up animations for the hero content.

### Files Affected

- `src/app/page.tsx`
- `package.json`
- `package-lock.json`

## Current UI Structure

1. Root black hero surface.
2. Absolute HLS video container:
   - `h-[80vh]`
   - `bottom-[35vh]`
   - `opacity-100`
   - no dark overlay
3. Fixed top glass navbar.
4. Centered hero content with staggered animation.
5. Bottom static logo marquee row using placeholder SVG marks.

## Important UI Behavior

- The background video is intentionally not darkened by overlays.
- The HLS stream requires browser/network access to `stream.mux.com`.
- Badges, headline, subtext, and buttons animate in with a staggered fade-up sequence.
- Navbar links are hidden below the `md` breakpoint.

## Known Limitations

- The logo row uses placeholder SVG/text marks until official partner/customer logos exist.
- The navbar logo is cropped from a square JPG asset; use a transparent horizontal logo asset if one becomes available.
- HLS playback depends on remote Mux stream availability.

## Testing Checklist

- [x] Run ESLint on `src/app/page.tsx`.
- [x] Open `/` and verify the Mux HLS background video plays.
- [x] Verify navbar glass blur, WarpTalk logo, and active `Feature` gradient border.
- [x] Verify headline and subtext match the requested WarpTalk copy.
- [x] Verify staggered fade-up animation on badges, headline, subtext, and buttons.
- [ ] Verify bottom placeholder logo row is visible and low-opacity grayscale.
