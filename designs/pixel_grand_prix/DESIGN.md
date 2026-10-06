---
name: Pixel Grand Prix
colors:
  surface: '#11131c'
  surface-dim: '#11131c'
  surface-bright: '#373943'
  surface-container-lowest: '#0c0e17'
  surface-container-low: '#191b24'
  surface-container: '#1d1f29'
  surface-container-high: '#282933'
  surface-container-highest: '#32343e'
  on-surface: '#e1e1ef'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e1e1ef'
  inverse-on-surface: '#2e303a'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ffb2b8'
  on-secondary: '#67001d'
  secondary-container: '#ff506e'
  on-secondary-container: '#5b0018'
  tertiary: '#fff6d1'
  on-tertiary: '#373100'
  tertiary-container: '#f3db00'
  on-tertiary-container: '#6b5f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffdadb'
  secondary-fixed-dim: '#ffb2b8'
  on-secondary-fixed: '#40000f'
  on-secondary-fixed-variant: '#91002d'
  tertiary-fixed: '#fde400'
  tertiary-fixed-dim: '#dec800'
  on-tertiary-fixed: '#201c00'
  on-tertiary-fixed-variant: '#504700'
  background: '#11131c'
  on-background: '#e1e1ef'
  surface-variant: '#32343e'
typography:
  display-xl:
    fontFamily: Space Mono
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.05em
  display-xl-mobile:
    fontFamily: Space Mono
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.04em
  display-lg:
    fontFamily: Space Mono
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Mono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-md:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  label-sm:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.12em
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels the hypercharged adrenaline of late-80s and 90s arcade coin-op cabinets, re-engineered for competitive multiplayer web and mobile platforms. The aesthetic fuses sharp pixelated raster geometry with high-voltage neon CRT luminescence. It rejects muted minimalism in favor of visceral arcade maximalism: high-octane contrast, chunky stepped borders, glowing telemetry readouts, scanline overlays, and tactile push-button interfaces that feel like physical microswitched hardware.

Targeting competitive speedrunners, retro-gaming aficionados, and arcade racing enthusiasts, the interface delivers intense immediacy, lightning-fast feedback loops, and an uncompromising arcade tournament atmosphere. Every interaction triggers sharp, punchy visual cues—evoking the thrill of inserting a coin, dropping the hammer on the accelerator, and clipping apexes under glowing cybernetic city skylines.

## Colors

The palette is engineered around high-contrast arcade luminescence set against dense asphalt night tones:

- **Primary (`#00F0FF` - Neon Cyan):** Primary HUD targeting, digital readouts, player 1 telemetry, tachometer mid-range, active borders, and digital interactive states.
- **Secondary (`#FF0055` - Hot Turbo Magenta):** Nitro triggers, critical alerts, redline rev indicators, rival indicators, primary action triggers, and speed boosts.
- **Tertiary (`#FFE600` - Electric Yellow):** Lap counters, coin/credit tokens, warning flags, drift multiplier tiers, and podium placement banners.
- **Auxiliary Accent (`#00FF66` - Nitro Green):** Full nitro tanks, green light start sequences, positive delta times, and connection/ping bars.
- **Neutral Canvas & Surfaces:**
  - Base Asphalt: `#0F111A` (canvas base, deep void)
  - Chassis Dark Slate: `#181B26` (telemetry cards, panel containers)
  - Pit Lane Charcoal: `#222638` (elevated HUD boxes, inactive rails, segmented track backgrounds)
  - Cyber Chrome / Signal White: `#FFFFFF` and `#E2E8F0` (ultra-high contrast numerals, tachometer needles, peak speed text)

Ensure functional states maintain stark luminance contrast against asphalt surfaces. Never employ muted pastel shades or soft low-contrast transitions. All glows are sharp, saturated neon blooms rather than diffuse photographic vignettes.

## Typography

The typographic hierarchy balances mechanical arcade grit with high-speed readability under motion:

- **Monospaced Display & Telemetry (`Space Mono`):** Used for game scores, digital speedometers, delta lap times, credits/coin badges, and arcade uppercase section headings. Monospaced character widths guarantee zero layout jitter during high-frequency numeric updates (such as rapid speed changes from 0 to 320 KPH).
- **Techno Grotesque Body & Subtitles (`Space Grotesk`):** Delivers clean geometric forms for match stats, server browser listings, car tuning descriptions, and multi-line lobby chat while echoing the angular retro-futuristic mood.
- **Styling Rules:**
  - Headlines and labels must render in uppercase (`text-transform: uppercase`).
  - Critical metrics and telemetry figures leverage tabular alignment and tight tracking to simulate custom LED/VFD displays.
  - Optical antialiasing is tuned for crisp, rasterized edge definitions; never use blurry anti-aliasing techniques that soften pixel edges.

## Layout & Spacing

The layout is structured around an arcade cockpit paradigm: tight, modular, and optimized for extreme low-latency situational awareness.

- **HUD Grid & Responsive Behavior:**
  - **Mobile:** 4-column compact grid with 16px outer margins and 16px gutters. Telemetry shifts to perimeter corners (Top-Left: Lap/Position; Top-Right: Mini-map/Ping; Bottom corners: Virtual Steering D-Pad & Turbo/Brake pedals).
  - **Tablet & Landscape Handhelds:** 8-column layout. Gauges bracket the primary track viewport symmetrically.
  - **Desktop / Ultrawide Arcade View:** 12-column layout with 24px gutters, constrained to a maximum content width of 1440px to preserve instantaneous peripheral recognition.
- **Rhythm & Grid Snapping:**
  - All margins, paddings, and gap distances strictly adhere to a 4px base stepping (4, 8, 16, 24, 40px).
  - Elements snap directly to hard pixel boundaries to preserve crisp scanline alignment and pixel art fidelity.

## Elevation & Depth

This system avoids naturalistic diffuse shadows and soft gradients in favor of hard-edged 8-bit stepped bevels, offset drop-shadow blocks, and intense luminescent bloom.

- **Hard Bevels & Stepped Offsets:** Depth is achieved through 2px to 4px hard offsets (`box-shadow: 4px 4px 0px #000000`). Pressed or active states collapse the offset to `0px 0px 0px`, physically moving the element down and right to emulate a heavy arcade switch bottoming out.
- **Neon Bloom & Emissive Glows:** Active indicators and laser wireframes project short, concentrated glowing coronas (`box-shadow: 0 0 8px rgba(0, 240, 255, 0.6), inset 0 0 4px rgba(0, 240, 255, 0.4)`).
- **CRT Scanlines & Grille Textures:** Top-tier containers, screen modals, and HUD viewports employ micro-pattern scanline backgrounds (repeating 1px horizontal dark stripes at 15% opacity) coupled with high-frequency pixel grain overlays to mimic authentic Trinitron arcade displays.
- **Layer Stacking Hierarchy:**
  - Level 0: Track surface / Asphalt canvas (`#0F111A`).
  - Level 1: Telemetry panel backplates (`#181B26`) with 1px `#222638` hard pixel borders.
  - Level 2: Interactive gauges, race cards, and weapon/nitro inventory grids.
  - Level 3: Overlays, pause menus, countdown banners (`READY... GO!`), and winner podium podiums surrounded by vibrant neon frames.

## Shapes

The shape vocabulary is strictly non-rounded and purely orthogonal. Rounded radii are prohibited across all UI components.

- **Chunky Pixel Corners:** All corners are strictly 90-degree right angles (`border-radius: 0px`). Where diagonal dynamic energy is required, use stepped 45-degree chamfers (clipped corners formed using SVG path masks or CSS `clip-path: polygon(...)` in strict 4px or 8px geometric increments).
- **Pixel Grid Border Lines:** Borders must consistently measure 2px or 4px in thickness, never 1px hairline or subpixel values, reinforcing physical raster scan displays.
- **Slanted Speed Cuts:** Telemetry badges, tachometer meters, and nitro meters use forward-slanted parallelograms (skew angles of `-12deg` to `-15deg`) to communicate forward velocity and aerodynamic thrust.

## Components

### Buttons & Arcade Pedals
- **Primary / Turbo Button:** Solid Hot Turbo Magenta (`#FF0055`) background with Signal White monospace uppercase text. Features a 4px hard solid black drop-shadow (`box-shadow: 4px 4px 0 #000`). Hover adds a `#00F0FF` outline. Active/press state translates the button (`transform: translate(4px, 4px)`) and removes the shadow.
- **Secondary / HUD Button:** Dark Slate (`#181B26`) fill, 2px border in Neon Cyan (`#00F0FF`), glowing text with 0.1em letter spacing.
- **Mobile Virtual Touch Triggers:** Circular/octagonal chunky hit zones with high-contrast inner stroke icons (pedal chevron, nitro flame icon), reacting to touch with instantaneous neon color inversion.

### Chips & Telemetry Badges
- Slanted or rectangular badges showing ping, current position (`P1`, `P4`), and lap count (`LAP 2/3`).
- Background: Pitch black (`#05060A`) with a 2px Electric Yellow (`#FFE600`) or Nitro Green (`#00FF66`) border.
- Monospace numerals paired with micro uppercase labels in `label-sm`.

### Tachometer & Speed Readouts
- Massive monospace numerals in Signal White with segmented LED-style background bars.
- Rev gauge built with 16 distinct segmented rectangular blocks transitioning dynamically:
  - Low RPM: Neon Cyan (`#00F0FF`)
  - Mid RPM: Electric Yellow (`#FFE600`)
  - Redline: Pulsing Hot Turbo Magenta (`#FF0055`) with a 200ms blink rate.

### Cards & Lobby Rooms
- Asphalt charcoal containers (`#181B26`) framed by a 2px border in `#222638`.
- Header bar features a contrasting solid strip (e.g., solid `#00F0FF` background with `#0F111A` inverse text for room name).
- Hard 4px black shadow anchor. Subtle CRT scanline pseudo-element overlay on image thumbnails.

### Input Fields & Search Bars
- Background: Base `#0F111A`, with a 2px inner or outer Neon Cyan outline when focused.
- Blinking solid block cursor (width 8px, height 16px) emulating retro terminal and arcade high-score entry prompts.
- Text: High-contrast white monospace text.

### Checkboxes, Radios, and Toggles
- Custom pixel-art square boxes (`18px x 18px`).
- Unchecked: `#181B26` with 2px `#222638` border.
- Checked: Centered `8px x 8px` solid block in Nitro Green (`#00FF66`) or Hot Turbo Magenta (`#FF0055`). No fluid checkmark animations; transitions are instant cuts.

### Countdown Banners & Modal Overlays
- Full-bleed letterbox black bars (`#000000`, 85% opacity) with scrolling horizontal speed lines across the screen.
- Large centerpiece display text (`FINAL LAP!`, `WRONG WAY!`, `NEW RECORD!`) utilizing `display-xl` framed with hazard diagonal warning stripes (alternating `#FFE600` and `#0F111A`).