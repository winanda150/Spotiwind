# Design System
## Spotiwind — *Feel the Music, Ride the Wind*

| Field | Detail |
|---|---|
| **Product** | Spotiwind — Music Streaming Platform |
| **Document Type** | Design System & UX Guidelines |
| **Version** | 1.0 |
| **Last Updated** | August 22, 2026 |
| **Status** | Draft — Ready for Design & Engineering Handoff |
| **Related Documents** | `PRD.md` · `DATABASE.md` · `SKILL.md` · `USER-FLOW.md` |

---

## Table of Contents
1. [Design Philosophy](#1-design-philosophy)
2. [Source Analysis: The Logo](#2-source-analysis-the-logo)
3. [Logo Usage Guidelines](#3-logo-usage-guidelines)
4. [Color System](#4-color-system)
5. [Typography](#5-typography)
6. [Spacing & Layout Grid](#6-spacing--layout-grid)
7. [Iconography](#7-iconography)
8. [Component Library](#8-component-library)
9. [The Signature Element: The Player Bar](#9-the-signature-element-the-player-bar)
10. [Motion & Micro-interactions](#10-motion--micro-interactions)
11. [Imagery & Album Art Treatment](#11-imagery--album-art-treatment)
12. [Sound & Haptic Notes](#12-sound--haptic-notes)
13. [Dark Mode as Default](#13-dark-mode-as-default)
14. [Accessibility](#14-accessibility)
15. [Key Screen Concepts](#15-key-screen-concepts)
16. [UX Writing Voice](#16-ux-writing-voice)
17. [Design Tokens Reference](#17-design-tokens-reference)

---

## 1. Design Philosophy

Everything in this system is derived from one asset: the Spotiwind logo. Nothing here is a default template — every choice below is traceable back to a specific detail in the mark (§2). Three principles govern all decisions:

1. **Motion is content, not decoration.** The logo's wind-trail and ribbon "S" are not static illustration — they depict movement. The interface must carry that same kinetic quality: things flow, stagger, and cross-fade rather than snap or reload.
2. **Color is earned, not scattered.** The Windstream gradient (§4) is a *signature*, used with intent on a small number of high-meaning surfaces (the player, key CTAs, active states) — not smeared across every card and button. Everything else stays disciplined and dark so the gradient still means something when it appears.
3. **The interface listens.** Because the brand's own tagline is "Feel the Music," the product should visibly react to audio — waveforms, glow, and (later) ambient color pulled from what's playing — so the visual and emotional experience are the same experience.

The single **signature element** this system spends its boldness on is the **persistent, audio-reactive Player Bar** (§9). Everything else — navigation, cards, forms — is intentionally quiet so the player reads as the one unmistakable, unmissable piece of the product.

---

## 2. Source Analysis: The Logo

| Element observed | Design implication |
|---|---|
| Ribbon-like "S" that curls into a music-note head | Rounded, flowing corner radii throughout; nothing sharp or purely rectilinear |
| Left-to-right dot-to-dash "wind trail" | The system's core motion signature — used for loading states, page-transition entrances, and hover trails |
| Cyan soundwave/equalizer glyph inside the note head | Waveform bars become a reusable UI motif (loaders, visualizers, voice/level indicators) |
| Continuous magenta → violet → blue → teal gradient | The **Windstream gradient** — the product's single most valuable visual asset |
| Chrome/metallic wordmark finish | Headline typography uses a subtle light-to-silver gradient fill on hero moments only (not body text) |
| Teal dot / violet dot on the two "i"s | Two-color accent pairing reused for dual-state indicators (e.g., like/unlike, online/offline) |
| Pure black canvas | Dark is the *only* mode for v1 — not a toggleable option (§13) |
| Thin vertical divider between icon and wordmark | Hairline dividers used sparingly as structural, not decorative, separators |
| Letter-spaced, small-caps tagline | Overline/eyebrow text style for section labels across the product |

---

## 3. Logo Usage Guidelines

- **Clear space**: maintain padding equal to the height of the icon's circular note-head on all sides; never crop the wind-trail dots.
- **Minimum size**: icon-only lockup no smaller than 24px; full lockup (icon + wordmark) no smaller than 120px wide.
- **Backgrounds**: primary lockup is designed for `--surface-0` (pure black) or `--surface-1`. On any lighter or photographic background, use the single-color (white) fallback version — never place the full-color gradient mark on a light background; it loses contrast integrity.
- **Don'ts**: never recolor the gradient, never stretch/skew the mark, never separate the soundwave glyph from the note-head circle, never place the wordmark without the icon in primary brand contexts (app icon, splash) — the icon alone is acceptable in constrained UI (favicon, avatar fallback).

---

## 4. Color System

### 4.1 The Windstream Gradient (primary brand asset)

| Stop | Name | Hex | Role |
|---|---|---|---|
| 0% | Solar Magenta | `#FF2D78` | Warm anchor — used at gradient starts |
| 35% | Electric Violet | `#9B4DFF` | Bridge tone |
| 65% | Wind Blue | `#4C6EF5` | Bridge tone |
| 100% | Aurora Teal | `#1FE8C4` | Cool anchor — used for "active/positive" states |

```css
--gradient-windstream: linear-gradient(135deg, #FF2D78 0%, #9B4DFF 35%, #4C6EF5 65%, #1FE8C4 100%);
```

**Where the gradient is allowed to appear** (and nowhere else, by design): the Player Bar progress fill and glow, primary CTA buttons, the active-state ring on the currently playing item, onboarding hero moments, and Wind Rewind. If a new surface wants the gradient, ask whether it's truly a primary action or a decoration — decoration doesn't qualify.

### 4.2 Core Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-magenta` | `#FF2D78` | Gradient stop; sparing standalone accent |
| `--color-violet` | `#9B4DFF` | Gradient stop; secondary accent, "wind" dot |
| `--color-blue` | `#4C6EF5` | Gradient stop; links, info state |
| `--color-teal` | `#1FE8C4` | Gradient stop; success state, "liked" state, primary "i" dot |

### 4.3 Dark Surface Elevation Scale

Modeled as layered depth — each step up is a surface slightly "closer" to the listener.

| Token | Hex | Usage |
|---|---|---|
| `--surface-0` | `#000000` | App background (matches logo canvas exactly) |
| `--surface-1` | `#0D0D12` | Section backgrounds, sidebar |
| `--surface-2` | `#16161D` | Cards, list rows |
| `--surface-3` | `#1E1E27` | Modals, popovers, raised cards on hover |
| `--surface-4` | `#292933` | Highest elevation — active/pressed states |

### 4.4 Text Tokens

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#F5F5F7` | Headlines, primary body text |
| `--text-secondary` | `#9A9AA5` | Metadata, captions, secondary labels |
| `--text-disabled` | `#55555F` | Disabled controls |
| `--text-chrome-start` → `--text-chrome-end` | `#FFFFFF` → `#C4C9D4` | Hero headline fill only (mirrors wordmark chrome finish) |

### 4.5 Semantic Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#1FE8C4` (reuses Aurora Teal) | Confirmations, "liked," successful payment |
| `--color-warning` | `#FFB020` | Non-blocking warnings (e.g., approaching skip limit) |
| `--color-error` | `#FF4D5E` | Errors, destructive actions |
| `--color-info` | `#4C6EF5` (reuses Wind Blue) | Informational banners |

### 4.6 Contrast & Accessibility Notes
- `--text-primary` on `--surface-0` through `--surface-3` exceeds WCAG AA (≥ 4.5:1) at body sizes.
- Gradient text (chrome or Windstream) is reserved for headline sizes (≥ 24px / bold) where large-text contrast rules apply, and is never used for body copy or button labels below 18px.
- Never rely on the magenta/teal pairing alone to convey meaning (e.g., like vs. dislike) — always pair with an icon or label for colorblind users.

---

## 5. Typography

### 5.1 Typeface Pairing

| Role | Typeface | Rationale |
|---|---|---|
| **Display / Headings** | **Sora** (700/800) | Geometric with softly rounded terminals — echoes the wordmark's rounded, confident letterforms without copying any specific existing streaming brand's font |
| **Body / UI** | **Inter** (400/500/600) | Neutral, extremely legible at small sizes, pairs cleanly under a characterful display face |
| **Numerals / Data** | **JetBrains Mono** (500) | Tabular figures for timestamps, durations, and stats where digit alignment matters |

Both Sora and Inter are open-source (SIL Open Font License) and available via Google Fonts — no licensing blockers for a fast-moving build.

### 5.2 Type Scale

| Token | Size / Line-height | Weight | Face | Usage |
|---|---|---|---|---|
| `display-xl` | 56px / 64px | 800 | Sora | Marketing hero only |
| `display-lg` | 40px / 48px | 800 | Sora | Section heroes, Now Playing title |
| `h1` | 32px / 40px | 700 | Sora | Page titles |
| `h2` | 24px / 32px | 700 | Sora | Section headers (e.g., shelf titles) |
| `h3` | 18px / 26px | 600 | Sora | Card titles |
| `body-lg` | 16px / 24px | 400/500 | Inter | Primary body copy |
| `body-sm` | 14px / 20px | 400 | Inter | Secondary text, list metadata |
| `caption` | 12px / 16px | 500 | Inter | Timestamps, fine print |
| `overline` | 11px / 16px, +0.12em tracking | 600, uppercase | Inter | Eyebrow labels — direct callback to the tagline's letter-spaced small caps |

### 5.3 Usage Rules
- Never mix Sora into paragraph-length body copy — it's a display face, not a reading face.
- The chrome gradient fill (§4.4) may only be applied to `display-xl`/`display-lg` weights.
- Minimum body text size across the product: 14px (accessibility floor for a music app viewed on mobile in motion, e.g., commuting).

---

## 6. Spacing & Layout Grid

### 6.1 Spacing Scale (4px base unit)

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |

### 6.2 Grid & Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| `mobile` | 360–767px | Single column, bottom tab nav, mini-player docked above tab bar |
| `tablet` | 768–1023px | 2-column shelves, collapsible sidebar |
| `desktop` | 1024–1439px | Persistent sidebar (240px) + 12-col content grid |
| `wide` | 1440px+ | Sidebar (280px) + content max-width 1200px, centered |

### 6.3 Radius Scale

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 6px | Inputs, small chips |
| `--radius-md` | 12px | Cards, buttons |
| `--radius-lg` | 20px | Modals, large cards, Now Playing artwork frame |
| `--radius-full` | 999px | Pills, avatar, play button |

Radii lean rounded across the whole system — a direct extension of the logo's ribbon curves; nothing in the UI should read as hard-edged or purely rectilinear.

---

## 7. Iconography

- **Style**: line icons, 1.75px stroke, rounded caps and joins (never sharp miters) — consistent with the logo's soft ribbon geometry.
- **Library**: Lucide (open-source, matches this stroke style out of the box) for standard UI icons; a small custom icon set for music-specific glyphs not covered by a generic library (waveform, crossfade/breeze symbol, radio/flow symbol).
- **Sizes**: 16px (inline/dense UI), 20px (default controls), 24px (primary navigation), 32px+ (player transport controls).
- **The waveform glyph** (pulled directly from the logo's soundwave) is the one icon allowed to use the Windstream gradient fill instead of a flat color — reserved for loading states and audio-active indicators.

---

## 8. Component Library

### 8.1 Buttons

| Variant | Style | States |
|---|---|---|
| **Primary** | Windstream gradient fill, `--text-primary` label, `--radius-full` | hover: brightness +6%, subtle glow (`box-shadow` using teal at low opacity); active: scale 0.98; disabled: `--surface-3` fill, `--text-disabled` label |
| **Secondary** | Transparent fill, 1.5px `--surface-4` border, `--text-primary` label | hover: border becomes 1.5px gradient (via border-image or padding-box trick); active: `--surface-2` fill |
| **Ghost** | No border/fill, `--text-secondary` label | hover: `--text-primary`, subtle `--surface-2` background |
| **Icon button** | Circular, `--radius-full`, transparent by default | hover: `--surface-2` background; active/toggled (e.g., liked): icon fills with `--color-teal` |

### 8.2 Cards (Album / Playlist / Artist)

- Base: `--surface-2`, `--radius-md`, artwork fills top ~80% at 1:1 ratio (artist cards use circular crop).
- Hover: lift via `transform: translateY(-4px)`, background steps to `--surface-3`, a play button fades in centered on the artwork with a soft gradient-tinted shadow beneath it.
- Title: `h3`; subtitle (artist/track count): `body-sm` in `--text-secondary`.

### 8.3 Navigation

- **Desktop sidebar** (240–280px): logo lockup at top, primary nav (Home, Search, Library), divider, user's playlists list, Windstream-gradient underline indicates the active route (thin, 2px, animated to slide between items rather than snapping).
- **Mobile bottom tab bar**: 4–5 icon+label tabs, docked above the mini-player; active tab icon fills solid with the icon's associated accent (Home: white, Search: white, Library: white) — reserve gradient exclusively for the player, not nav state, to keep the signature element unrivaled.

### 8.4 Forms & Inputs

- Fields: `--surface-2` background, `--radius-sm`, 1px `--surface-4` border; focus state: border becomes `--color-teal` at 1.5px plus a soft outer glow — never a harsh blue browser-default ring.
- Labels: `body-sm`, `--text-secondary`, positioned above the field (not placeholder-only, for accessibility).

### 8.5 Modals & Sheets

- Desktop: centered modal, `--surface-3`, `--radius-lg`, backdrop blur over dimmed `--surface-0` at 70% opacity.
- Mobile: bottom sheet, slides up with the "wind ease" curve (§10), draggable handle at top.

### 8.6 Toasts / Notifications
- Slide in from the top-right (desktop) or top (mobile) using the wind-trail motion (dot-to-dash entrance, §10), auto-dismiss after 4s, manually dismissible.

### 8.7 Loading States
- Never a generic spinner. Default loading indicator is a **3–5 bar equalizer pulse** using the waveform glyph, animating bar heights out of phase — reinforces "the product is always about sound," even while idle.

### 8.8 Tags / Genre Chips
- `--radius-full`, `--surface-2` fill, `body-sm` label; selected state fills with a flattened mid-point of the Windstream gradient (`--color-violet` at reduced opacity) rather than the full gradient, keeping the full gradient reserved for the signature moments.

---

## 9. The Signature Element: The Player Bar

This is the one place the system spends its full visual budget, per the restraint principle in §1.

- **Structure**: docked bottom bar (desktop: full width above nothing; mobile: above the tab bar) containing mini artwork, track/artist text, transport controls, and a progress track.
- **The gradient border**: a 2px top border rendered in the Windstream gradient, animated to slowly drift left-to-right (≈20s loop) while a track plays, and paused/dimmed to 40% opacity when playback is paused.
- **The progress fill**: rendered in the same gradient, clipped to elapsed time — visually, the listener is always seeing "how much wind has carried them" through the track.
- **Audio-reactive glow**: a soft blurred glow beneath the bar (12–20px blur, low opacity) using the gradient's current dominant stop, subtly pulsing in sync with playback (amplitude-driven where technically feasible; a steady slow pulse as a fallback).
- **Expansion**: tapping/clicking the bar expands to the full-screen Now Playing view via a Breeze Transition (crossfade + slight scale, §10) — never a hard route change.

---

## 10. Motion & Micro-interactions

### 10.1 Easing & Duration

```css
--ease-wind: cubic-bezier(0.16, 1, 0.3, 1); /* fast start, long soft settle — "carried, then set down" */
--duration-fast: 150ms;   /* icon toggles, hover */
--duration-base: 250ms;   /* card hover, small transitions */
--duration-slow: 400ms;   /* page/screen transitions, modals */
```

### 10.2 Signature Motion Patterns

| Pattern | Where used | Behavior |
|---|---|---|
| **Wind-trail entrance** | Toasts, list items on first load, onboarding steps | Elements enter as a small dot, translating and growing into full size/opacity — a literal callback to the logo's dot-to-dash trail |
| **Breeze Transition** | Track changes, screen navigation, mini-player → full player | Cross-fade + 2–4% scale, never a hard cut or slide-replace |
| **Staggered shelf reveal** | Home shelves on load | Cards fade/translate in with an 40–60ms stagger, left to right |
| **Gradient drift** | Player bar border, active-track ring | Slow (~20s) linear-gradient position animation while audio is playing |
| **Waveform pulse** | Loading states, voice/level indicators | Bars animate height out of phase, 3 concurrent easing curves for organic (non-robotic) motion |

### 10.3 Motion Budget & Restraint
Per the frontend design principle of orchestrated moments over scattered effects: **one** animated element per screen may use the full Windstream gradient drift (the player). Card hovers, nav states, and buttons use only transform/opacity/simple color transitions — no secondary gradient animations competing with the player for attention.

### 10.4 Reduced Motion
When `prefers-reduced-motion: reduce` is detected: disable gradient drift and waveform pulse animation (render static), keep transitions but cut duration to ≤ 100ms, remove parallax/scale effects entirely.

---

## 11. Imagery & Album Art Treatment

- **Aspect ratios**: 1:1 for album/playlist artwork (industry standard, avoids letterboxing); artist images cropped circular in cards, 3:1 banner on artist profile headers.
- **Legibility overlay**: any text laid over artwork (e.g., playlist headers) sits on a bottom-to-top gradient scrim from `--surface-0` at 90% to transparent — never a flat dark box.
- **Future state — dynamic theming (Phase 3)**: extract a dominant color from the currently playing artwork and tint the Now Playing screen's background gradient accordingly, always clamped so it never fully replaces the brand's Windstream identity — it accents it.

---

## 12. Sound & Haptic Notes

- **UI sound** (optional, user-toggleable, off by default on shared/public devices): a very short (<80ms), soft "air" whoosh on major transitions like opening Now Playing — never on frequent actions like scrolling or hovering.
- **Haptics (mobile)**: light tap on like/save, slightly stronger tap confirming a completed action (e.g., playlist created) — reinforces the "feel" half of the tagline in a literal, physical sense.

---

## 13. Dark Mode as Default

Spotiwind ships **dark-only in v1.** This is a deliberate identity decision, not a missing feature: the entire Windstream gradient system is calibrated for a pure black canvas exactly as in the source logo, and a light-mode inversion would break the premium/nightlife feeling the brand is built on. If a light mode is ever required (e.g., accessibility need, platform requirement), treat it as a distinct, secondary design pass — not a simple color inversion — using `--surface-0` → light neutral, and desaturating the gradient rather than placing it at full saturation on white.

---

## 14. Accessibility

- Minimum contrast 4.5:1 for body text, 3:1 for large text/icons, verified against every `--surface` token.
- All player controls carry explicit `aria-label`s ("Play," "Pause," "Skip to next track," "Currently playing: [track] by [artist]").
- Visible focus states on every interactive element: a 2px `--color-teal` outline offset by 2px — never removed, only restyled.
- `prefers-reduced-motion` fully respected (§10.4).
- Color is never the sole carrier of meaning (liked/unliked, playing/paused always paired with icon shape changes, not color alone).
- Lyrics and any auto-generated descriptions available to screen readers in reading order, not just visually synced.

---

## 15. Key Screen Concepts

**Home** — Sidebar (desktop) or top greeting (mobile) + horizontally scrollable shelves ("Continue riding the wind," "Made for you," "New from artists you follow"). First shelf is always WindFlow-driven, reinforcing the flow-first philosophy immediately.

**Now Playing (full screen)** — Large artwork (rounded `--radius-lg`, soft ambient glow behind it), title in `display-lg` with chrome fill, transport controls, waveform-based seek bar, synced lyrics toggle, queue drawer accessible via a wind-trail icon.

**Search** — Prominent input with live category tabs (Tracks/Artists/Albums/Playlists) appearing only once a query is entered; empty state shows genre chips ("Browse by mood") rather than a blank page.

**Library** — Filterable grid/list toggle; empty states use direct, inviting language ("Nothing here yet — like a song to start your library") rather than a bare icon.

**Playlist Detail** — Banner header with scrim-treated artwork mosaic, track list below with hover-reveal play buttons, collaborative avatars shown inline for Tailwind Playlists.

**Artist Profile** — Banner image, follow button (primary gradient button), popular tracks, discography grid, "About" section, monthly listener count.

---

## 16. UX Writing Voice

- Plain, active verbs: "Play," "Save," "Follow" — never "Submit" or system-speak like "Initiate playback."
- Buttons and their resulting confirmations share vocabulary: a playlist "Created" toast follows a "Create playlist" action, not "Playlist successfully generated."
- Empty and error states explain what happened and what to do next, in the product's own voice — never an apology, never vague ("Couldn't load this playlist — check your connection and try again," not "Something went wrong").
- Branded feature names (WindFlow Radio, Gust Mode, etc.) always carry a plain-language subtitle on first exposure, e.g. *"WindFlow Radio — an endless mix built from this song."*

---

## 17. Design Tokens Reference

A consolidated, dev-ready token sheet for direct use in implementation.

```css
:root {
  /* Brand Gradient */
  --color-magenta: #FF2D78;
  --color-violet: #9B4DFF;
  --color-blue: #4C6EF5;
  --color-teal: #1FE8C4;
  --gradient-windstream: linear-gradient(135deg, #FF2D78 0%, #9B4DFF 35%, #4C6EF5 65%, #1FE8C4 100%);

  /* Surfaces */
  --surface-0: #000000;
  --surface-1: #0D0D12;
  --surface-2: #16161D;
  --surface-3: #1E1E27;
  --surface-4: #292933;

  /* Text */
  --text-primary: #F5F5F7;
  --text-secondary: #9A9AA5;
  --text-disabled: #55555F;
  --text-chrome-start: #FFFFFF;
  --text-chrome-end: #C4C9D4;

  /* Semantic */
  --color-success: #1FE8C4;
  --color-warning: #FFB020;
  --color-error: #FF4D5E;
  --color-info: #4C6EF5;

  /* Typography */
  --font-display: 'Sora', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-full: 999px;

  /* Motion */
  --ease-wind: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
}
```

---
*End of DESIGN.md — see `DATABASE.md` for the schema that powers these screens, and `USER-FLOW.md` to see these components in sequence.*
