# Product Requirements Document (PRD)
## Spotiwind — *Feel the Music, Ride the Wind*

| Field | Detail |
|---|---|
| **Product** | Spotiwind — Music Streaming Platform |
| **Document Type** | Product Requirements Document |
| **Version** | 1.2 |
| **Last Updated** | August 22, 2026 |
| **Status** | Draft — Ready for Design & Engineering Handoff |
| **Related Documents** | `DESIGN.md` · `DATABASE.md` · `SKILL.md` · `USER-FLOW.md` |
| **v1.2 Change Log** | Local catalog storage moved to **Firebase Storage (Blaze)** — an explicit, accepted paid component. Every other service (Firestore, Auth, Hosting, Functions, Jamendo) still runs free. See §6.4, §8, §12. |

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Brand Foundation](#2-brand-foundation)
3. [Problem Statement & Opportunity](#3-problem-statement--opportunity)
4. [Target Users & Personas](#4-target-users--personas)
5. [Goals & Success Metrics](#5-goals--success-metrics)
6. [Product Scope](#6-product-scope)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [User Roles & Permissions](#9-user-roles--permissions)
10. [Monetization Strategy](#10-monetization-strategy)
11. [Competitive Landscape](#11-competitive-landscape)
12. [Assumptions & Constraints](#12-assumptions--constraints)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Release Roadmap](#14-release-roadmap)
15. [Appendix — Glossary of Branded Terms](#15-appendix--glossary-of-branded-terms)

---

## 1. Executive Summary

Spotiwind is a music streaming platform built around a single sensation: **the feeling of being carried**. Where most streaming apps ask users to actively dig for what to play next, Spotiwind is designed so that music arrives the way wind does — continuously, effortlessly, and shaped by the direction the listener is already moving in.

The product combines the expected pillars of a modern streaming service (on-demand playback, playlists, offline listening, artist catalogs, subscriptions) with a distinct interaction philosophy pulled directly from the brand mark: **fluid motion, layered depth, and a dark, vivid canvas that makes every gradient, waveform, and transition feel alive.** This is not a reskin of an existing player — every core screen and signature feature in this document exists because it reinforces the tagline *"Feel the Music, Ride the Wind."*

This PRD defines the full product surface for Spotiwind: functional requirements, user roles, monetization, and a phased roadmap from MVP to a fully differentiated platform. It is the source of truth for *what* to build. `DESIGN.md` defines *how it should look and feel*, `DATABASE.md` defines *how the data is structured*, `SKILL.md` defines *how it should be engineered*, and `USER-FLOW.md` defines *how users move through it*.

---

## 2. Brand Foundation

### 2.1 Logo & Visual Identity Analysis

The provided Spotiwind logo is the anchor for every product decision in this document. Breaking it down:

- **The mark**: An "S" silhouette that behaves like a ribbon of wind rather than a static letterform — it curls, tapers, and resolves into a circular music-note head. Inside that circle sits a glowing cyan soundwave/equalizer glyph, the only "literal" music symbol in the mark.
- **The motion cue**: To the left of the "S," a trail of dots grows into a dash — a classic speed/wind-trail motif. This is the strongest single signal in the whole mark: **the brand is about movement, not stillness.**
- **The gradient**: A continuous flow from magenta → violet → blue → teal. It never appears as a flat, single color — it is always *in transition*, which mirrors the idea of "riding" something rather than standing on it.
- **The wordmark**: A bold, geometric, rounded sans-serif rendered in a chrome/metallic white-to-silver finish — precise and premium, in deliberate contrast to the looseness of the icon's ribbon.
- **The detail that ties it together**: the dot on the first "i" is solid teal, the dot on the second "i" (in "wind") is solid violet — a quiet callback to the icon's gradient endpoints, applied with restraint.
- **The canvas**: Pure black. Every color in the mark exists specifically *because* the background is black — this is a dark-mode-native brand, not a brand with a dark mode option.
- **The tagline**: "FEEL THE MUSIC, RIDE THE WIND" — two verbs, two senses. *Feel* is sensory/emotional (sound, touch, visual reactivity). *Ride* is kinetic (momentum, direction, letting go of effort).

### 2.2 Brand Essence

| Pillar | What it means for the product |
|---|---|
| **Fluid** | No hard cuts. Screens crossfade, lists stagger in, the player never "jumps." |
| **Vibrant** | Color is earned through the gradient system, not scattered — see `DESIGN.md §5`. |
| **Premium** | Chrome-finish typography, generous spacing, restraint outside the signature moments. |
| **Kinetic** | The product should always feel like it's carrying the listener forward — autoplay, flow-based radio, momentum-based discovery. |
| **Sound-reactive** | Interfaces visibly respond to audio (waveforms, glow, ambient color) rather than sitting inert next to it. |

### 2.3 Mission & Vision

- **Mission**: Make discovering and listening to music feel like movement, not maintenance — reduce the effort between "I want to hear something" and "I'm carried into the right song."
- **Vision**: Become the streaming platform people associate with *flow state* listening — the app you open when you want music to take over, not when you want to manage a library.

### 2.4 Design Signature (carried into DESIGN.md)

Per the brand's own instruction to "ride the wind," the single most deliberate, highest-effort element in the product is the **persistent player bar** — an audio-reactive strip whose gradient border pulses and shifts with the currently playing track, using the Windstream gradient defined in `DESIGN.md`. Everything else in the interface is intentionally quieter so this element reads as the product's signature, not just another component.

---

## 3. Problem Statement & Opportunity

Modern streaming apps have converged on nearly identical patterns: a grid of cover art, a search bar, and algorithmic shelves labeled "Made For You." This creates three recurring frustrations for listeners:

1. **Discovery fatigue** — endless scrolling through shelves that all look and feel the same, with no sense of momentum or direction.
2. **Emotional flatness** — the interface doesn't respond to *what* is playing; a ballad and a rave track sit inside the same static gray chrome.
3. **Decision overhead** — users are asked to make a choice (what to play, what playlist, what mood) at almost every screen, which works against the "put it on and go" use case that dominates real-world listening (commuting, working out, working, relaxing).

**The opportunity**: build a platform where the *default* state is momentum — music that keeps flowing intelligently — and where the interface itself visibly reacts to the audio, so the emotional and the visual experience are the same experience, not two separate layers.

---

## 4. Target Users & Personas

### Persona 1 — Dinda, "The Daily Commuter"
- **Age 24**, marketing associate, urban professional.
- Listens 2+ hours/day during commute, work, and chores.
- **Needs**: reliable offline playback, mood/activity-based playlists, low-friction "just play something good" moments.
- **Frustration with current tools**: has to actively curate to avoid repetitive algorithmic picks.

### Persona 2 — Raka, "The Deep-Dive Enthusiast"
- **Age 29**, sound engineer, self-identifies as an audiophile.
- Explores full discographies, cares about audio quality, credits, and liner-note-level detail (writers, producers, BPM).
- **Needs**: high-quality audio tiers, detailed track metadata, lyrics, deep catalog search/filtering.

### Persona 3 — Sarah, "The Independent Artist"
- **Age 26**, singer-songwriter releasing music independently.
- **Needs**: simple upload flow, understandable analytics (not just raw numbers), a fair, transparent path to monetization and audience growth.

### Persona 4 — Bima, "The Budget-Conscious Student"
- **Age 19**, university student, primary free-tier user.
- **Needs**: a free experience that doesn't feel punishing, a clear and fairly priced upgrade path, social/shareable moments (this persona is the primary driver of virality and referrals).

---

## 5. Goals & Success Metrics

### Business Goals
- Establish Spotiwind as a credible, premium-feeling alternative in its launch market within 12 months.
- Convert free users to paid subscribers at a healthy, sustainable rate without degrading the free experience into a "broken" product.
- Build a two-sided marketplace (listeners + artists) where artists have a reason to launch music on Spotiwind directly, not only distribute to it.

### User Goals
- Spend less time deciding what to play and more time listening.
- Feel that the app understands mood/energy, not just genre.
- Trust that following an artist means never missing a release.

### Key Performance Indicators

| Metric | Target (12 months post-launch) | Measurement |
|---|---|---|
| Monthly Active Users (MAU) | Baseline × 10 growth from launch cohort | Product analytics |
| DAU/MAU ratio (stickiness) | ≥ 25% | Product analytics |
| Free → Premium conversion | ≥ 6% | Billing system |
| Average session length | ≥ 22 minutes | Product analytics |
| 30-day retention (new users) | ≥ 35% | Cohort analysis |
| WindFlow Radio adoption (of listeners who start ≥1 session/week) | ≥ 40% | Feature analytics |
| Monthly churn (paid) | ≤ 4% | Billing system |
| Artist upload → first 100 streams (median time) | ≤ 7 days | Catalog analytics |
| NPS (Net Promoter Score) | ≥ 40 | In-app survey |

---

## 6. Product Scope

### 6.1 MVP — Phase 1 (Launch, Zero-Budget Build)
- Account creation & authentication (email + Google OAuth via Firebase Auth — see §7.1 on deferring Apple sign-in)
- Onboarding taste graph (genres, artists)
- Home feed (personalized shelves)
- Full on-demand player (play/pause/seek/queue/repeat/shuffle)
- Search (tracks, artists, albums, playlists)
- Library (liked songs, saved albums, followed artists, user playlists)
- Playlist creation, editing, and sharing (public/private)
- Catalog sourced from the Jamendo API (international) + a curated local Indonesian catalog (see §6.4) — Free tier only; monetization deferred (see §10.4)
- Basic artist profile pages (for local-catalog artists)
- WindFlow Radio v1 (seeded continuous play from a track/artist)

### 6.2 Phase 2 — Growth
- Premium Duo, Family, and Student plans
- Offline downloads (Premium)
- Collaborative & Tailwind Playlists
- Social layer: follow friends, activity feed, shareable cards
- Artist Dashboard (upload, basic analytics)
- Gust Mode (contextual quick-shuffle for workouts/focus)
- Windsock (live "trending now" indicator)
- Cross-device playback handoff

### 6.3 Phase 3 — Differentiation
- Wind Rewind (annual personalized recap, shareable)
- Windmap (visual mood/genre exploration)
- Advanced artist analytics & promotional tools (Artist Pro)
- Lyrics with synced highlighting
- Adaptive/dynamic UI theming from album art
- Podcast/spoken-word support
- API for third-party integrations (smart speakers, car systems)

### 6.4 Catalog Sourcing Strategy (Zero-Budget Phase)

Rather than pursuing major-label licensing (cost-prohibitive for a zero-budget build), Spotiwind's catalog is assembled from two sources, unified behind a single `tracks` data model (`DATABASE.md §5`) so playback, playlists, and WindFlow Radio treat them identically — the user never needs to know or care which source a track came from.

| Source | Scope | How it works |
|---|---|---|
| **Jamendo API** | International catalog | Spotiwind calls Jamendo's public catalog API directly (client-side); Jamendo hosts and streams the audio from its own infrastructure — Spotiwind stores only metadata (title, artist, duration, genre, license info), never the audio file itself. |
| **Local Indonesian catalog** | Domestic catalog | A pre-assembled collection of Indonesian tracks (supplied outside this document), hosted as actual audio files on **Firebase Storage** (`SKILL.md §7`, `DATABASE.md §9`) with full metadata in Firestore — the one deliberately paid component in the stack, an explicit and separate decision from the Jamendo licensing question below. See §12 for the full reasoning. |

**Important licensing note**: Jamendo's free API tier is scoped to **non-commercial use only** (35,000 requests/month — see §10.4). This aligns naturally with the current zero-budget, pre-monetization phase. If/when Spotiwind activates ads or paid subscriptions, catalog strategy must be revisited — either by securing a commercial agreement with Jamendo, keeping monetized tiers scoped away from Jamendo-sourced tracks, or leaning further into the local catalog and direct artist uploads (§7.8) for any monetized surface.

---

## 7. Functional Requirements

Requirements are grouped by module and tagged with an ID (`FR-<module>.<n>`) for traceability into `USER-FLOW.md` and engineering tickets.

### 7.1 Authentication & Onboarding

**FR-AUTH.1 — Account creation**
*User story:* As a new user, I want to sign up with email or a social account, so I can start listening quickly.
- Support email/password and Google sign-in via Firebase Authentication (free up to 50K MAU regardless of plan — Auth's own quota doesn't add to the Storage-driven Blaze cost in `SKILL.md §12`). Apple sign-in is deferred until there's budget for the required $99/year Apple Developer account (`SKILL.md §3`) — a sequencing choice, not a technical limitation.
- Enforce password strength rules and email verification.
- Guests may preview a limited catalog before creating an account (reduces signup friction).

**FR-AUTH.2 — Taste onboarding**
- After signup, prompt selection of ≥ 3 genres and ≥ 3 artists to seed personalization.
- This step must feel fast (≤ 60 seconds) and skippable, with sensible defaults if skipped.

**FR-AUTH.3 — Session & security**
- JWT-based session with refresh tokens; device-level session management (see `SKILL.md §7`).
- Support account recovery via email and, optionally, phone.

### 7.2 Home & Discovery

**FR-HOME.1 — Personalized shelves**
- Home screen surfaces dynamic shelves (Recently Played, Made for You, New Releases from Followed Artists, WindFlow Radio suggestions, genre-based shelves).
- Shelves reorder based on time of day and listening context where data supports it.

**FR-HOME.2 — WindFlow Radio**
*User story:* As a listener, I want to start an endless, well-sequenced stream from any track, artist, or mood, so I don't have to keep choosing songs.
- Generates a continuous queue based on audio similarity (tempo, energy/"vibe score", genre adjacency) to a seed.
- Refines in real time based on skip/like signals within the session.
- Never repeats a track within a rolling 2-hour window unless the queue is exhausted.

**FR-HOME.3 — Windmap** *(Phase 3)*
- Visual, explorable map of genre/mood adjacency; selecting a node starts a WindFlow session in that space.

### 7.3 Search

**FR-SEARCH.1 — Unified search**
- Single search bar returns categorized results: Tracks, Artists, Albums, Playlists, Users (if social features enabled).
- Live/type-ahead suggestions after 2+ characters, debounced.
- Recent searches stored per-user and clearable.

**FR-SEARCH.2 — Filters**
- Filter results by genre, release year, and duration where applicable.

### 7.4 Music Player

**FR-PLAYER.1 — Core playback controls**
- Play, pause, seek, skip forward/back, shuffle, repeat (off/all/one), volume, queue view/reorder.
- Persistent mini-player across all screens; expandable to a full-screen "Now Playing" view.

**FR-PLAYER.2 — Breeze Transitions**
*User story:* As a listener, I want songs to flow into each other smoothly, so listening feels continuous rather than track-by-track.
- Configurable crossfade (0–12 seconds) between tracks.
- Gapless playback for albums authored to be continuous.
- Visual transition on the Now Playing screen mirrors the audio crossfade (see `DESIGN.md §10`).

**FR-PLAYER.3 — Adaptive streaming quality**
- Automatically adjusts bitrate to network conditions; manual override available (Data Saver / Normal / High / Lossless — Premium only for the top tier).

**FR-PLAYER.4 — Lyrics**
- Time-synced lyrics displayed on Now Playing where available; falls back to static lyrics.

### 7.5 Library

**FR-LIB.1** — Users can like/save tracks, albums, and playlists into a unified Library view, filterable by type.
**FR-LIB.2** — Users can follow artists; followed-artist releases surface in Home and trigger notifications.
**FR-LIB.3** — Offline downloads (Premium) with a managed storage view showing space used.

### 7.6 Playlists

**FR-PL.1** — Create, rename, reorder, and delete playlists; add a custom cover image or auto-generated mosaic cover.
**FR-PL.2** — Public/private/unlisted visibility per playlist.
**FR-PL.3 — Tailwind Playlists (collaborative)** — Multiple users can add/reorder tracks in real time; each contribution is attributed to its adder.
**FR-PL.4** — Share playlists via link or in-app to followers.

### 7.7 Social Features *(Phase 2)*

**FR-SOC.1** — Follow other users; opt-in activity feed showing what followed users are playing/saving.
**FR-SOC.2** — Shareable "now playing" cards (track + branded gradient background) for external social platforms.
**FR-SOC.3 — Windsock** — A small live widget showing trending tracks among a user's network and globally.

### 7.8 Artist Tools

*Positioning note: for the zero-budget MVP, the catalog is seeded via the Jamendo API and a prepared local Indonesian catalog (§6.4), not direct artist self-upload. The requirements below stay valid and become active once Spotiwind is ready to onboard independent artists directly (targeted for Phase 2, alongside real storage/moderation capacity).*

**FR-ART.1 — Upload flow**
- Artists (verified role) can upload singles/albums with metadata (title, genre, release date, credits, explicit flag, cover art).
- Automated audio quality/loudness check before publishing.

**FR-ART.2 — Artist Dashboard**
- Streams over time, top territories, listener demographics (aggregated/anonymized), top playlists driving discovery.

**FR-ART.3 — Artist Pro** *(Phase 3)* — Advanced analytics, pitching new releases for editorial placement, promotional budget tools.

### 7.9 Signature Branded Features (Summary)

| Feature | Module | Description |
|---|---|---|
| **WindFlow Radio** | Discovery | Continuous, self-refining flow-based playback |
| **Breeze Transitions** | Player | Signature crossfade/gapless engine |
| **Gust Mode** | Player | One-tap high-energy shuffle for workouts/focus |
| **Wind Rewind** | Social | Annual personalized recap, shareable |
| **Windmap** | Discovery | Visual mood/genre exploration |
| **Windsock** | Social | Live trending indicator |
| **Tailwind Playlists** | Playlists | Real-time collaborative playlists |

### 7.10 Notifications
**FR-NOTIF.1** — In-app and push notifications for: new release from a followed artist, playlist collaborator activity, subscription/billing events, Wind Rewind availability.
**FR-NOTIF.2** — Granular per-category notification preferences in Settings.

### 7.11 Settings & Account Management
**FR-SET.1** — Profile editing, connected accounts, playback preferences (streaming quality, crossfade length, explicit content filter).
**FR-SET.2** — Subscription management: view plan, change plan, update payment method, cancel (with retention offer step).
**FR-SET.3** — Privacy controls: private session mode (pauses listening history/social visibility), data export/delete request (see `DATABASE.md §9`).

### 7.12 Admin & Moderation
**FR-ADM.1** — Internal dashboard for content moderation (reported tracks/playlists/comments), user account actions (suspend/ban/reinstate), and catalog management (takedowns).
**FR-ADM.2** — Audit log of all administrative actions.

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Player must begin audio playback in ≤ 1s on broadband, ≤ 2.5s on 4G. UI interactions respond in ≤ 200ms. |
| **Availability** | 99.9% uptime target for core playback and auth services. |
| **Scalability** | Firestore, Auth, Hosting, and Functions run within Firebase's Spark free-tier quotas; Firebase Storage runs on Blaze by deliberate choice (full limits/cost table in `SKILL.md §12`) — the one component with real, monitored ongoing cost. |
| **Security** | All traffic over HTTPS/TLS; Firestore Security Rules (`DATABASE.md §6`) as the primary authorization layer in place of a custom backend; local-catalog audio served from Firebase Storage, gated by its own Storage Security Rules (`DATABASE.md §9`) with user-owned paths scoped by UID; passwords and sessions managed by Firebase Authentication; payment handling (once activated, §10.4) via processor tokenization, never stored directly. |
| **Accessibility** | WCAG 2.1 AA minimum: keyboard navigability, screen-reader labels for all player controls, `prefers-reduced-motion` respected (see `DESIGN.md §14`). |
| **Compatibility** | Latest two major versions of Chrome, Safari, Firefox, Edge; responsive from 360px to 4K; iOS 16+/Android 10+ for native apps. |
| **Localization** | UI text externalized for translation from day one; initial launch locale: Indonesian (id-ID) and English (en-US); currency-aware pricing display. |
| **Data Integrity** | Listening history and library data must survive device loss (cloud-synced); no data loss on failed payment retries. |

---

## 9. User Roles & Permissions

| Capability | Guest | Free User | Premium User | Artist | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Browse catalog previews | ✅ | ✅ | ✅ | ✅ | ✅ |
| Full on-demand playback | ❌ | ✅ (with ads) | ✅ | ✅ | ✅ |
| Create playlists | ❌ | ✅ | ✅ | ✅ | ✅ |
| Offline downloads | ❌ | ❌ | ✅ | ✅ | ✅ |
| Skip limit | — | 6/hour | Unlimited | Unlimited | Unlimited |
| Lossless audio | ❌ | ❌ | ✅ (top tier) | ✅ | ✅ |
| Upload music | ❌ | ❌ | ❌ | ✅ | ✅ |
| View artist analytics | ❌ | ❌ | ❌ | ✅ (own catalog) | ✅ (all) |
| Moderate content/users | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 10. Monetization Strategy

### 10.1 Listener Plans

| Plan | Indonesia (IDR) | Global reference (USD) | Notes |
|---|---|---|---|
| **Free** | Rp 0 | $0 | Ad-supported, 96kbps, 6 skips/hour, no offline |
| **Premium Individual** | Rp 49.000/mo | ~$3–4/mo | Ad-free, offline, up to Lossless quality |
| **Premium Duo** | Rp 69.000/mo | ~$5–6/mo | 2 accounts, individual mixes |
| **Premium Family** | Rp 89.000/mo | ~$6–7/mo | Up to 6 accounts, parental controls |
| **Premium Student** | Rp 27.000/mo | ~$2/mo | Verified student status, 50% off Individual |

*Figures above are illustrative launch-pricing suggestions for an Indonesia/SEA-first go-to-market, positioned competitively against existing regional streaming pricing — to be validated with real market research before launch.*

### 10.2 Artist Monetization
- Per-stream royalty pool distributed monthly (standard streaming model).
- **Artist Pro** subscription (Phase 3) for advanced promotional and analytics tooling — priced separately from listener plans.
- Optional direct-support feature (tipping) on artist profiles (Phase 3, exploratory).

### 10.3 Advertising (Free Tier)
- Audio ads between tracks (frequency-capped) and a small number of visual placements on Home; no ads permitted on the player controls themselves or across the Now Playing screen to protect the brand's premium feel.

### 10.4 Current Phase: Zero-Budget & Pre-Monetization

The plans and pricing above remain the target model, but are **not active in the current build phase**. Two things gate turning them on:

1. **Jamendo licensing** — the free Jamendo API tier is restricted to non-commercial use, defined by Jamendo as any use "intended for or directed toward commercial advantage or any monetary compensation, including... advertising" (35,000 requests/month cap). Running ads or charging subscriptions against a catalog that includes Jamendo tracks requires a commercial agreement with Jamendo first (`SKILL.md §7`).
2. **Payment infrastructure** — Stripe/Midtrans/Xendit carry no upfront cost (they only take a per-transaction fee), so billing can be switched on later without ever violating the zero-budget constraint; it's simply sequenced after the product itself is validated.

Until both are addressed, Spotiwind operates as a fully-functional **Free** experience only — which is also the natural fit for the current portfolio/personal-project phase.

---

## 11. Competitive Landscape

| Dimension | **Spotiwind** | Spotify | Apple Music | YouTube Music |
|---|---|---|---|---|
| Core differentiation | Flow-based, sound-reactive UI; wind/motion identity | Broad catalog, mature social features | Deep Apple ecosystem integration, lossless by default | Video + audio catalog crossover |
| Discovery model | WindFlow continuous flow + Windmap visual exploration | Algorithmic playlists (Discover Weekly-style) | Curated editorial + algorithmic | Video-driven recommendations |
| Visual identity | Dark-native, audio-reactive gradient system | Green accent on dark/light | Red accent, minimal | Red/white, video-first |
| Collaborative playlists | Tailwind Playlists (real-time) | Collaborative playlists | Shared playlists | Limited |
| Artist tooling | Dashboard + Artist Pro (Phase 3) | Spotify for Artists | Apple Music for Artists | YouTube Studio |

*This table reflects general, well-known positioning of established platforms for strategic contrast; it is not a claim about current pricing or feature specifics of competitors, which should be re-verified close to launch.*

---

## 12. Assumptions & Constraints
- **Free everywhere, except one explicit exception.** Firestore, Auth, Hosting, and Cloud Functions run on Firebase's Spark free tier; the Jamendo API runs on its free non-commercial tier. **Firebase Storage runs on the paid Blaze plan by deliberate choice** — the one line item this project budgets for, in exchange for keeping the whole stack on a single platform. `SKILL.md §12` lists the exact quotas, real cost expectations, and why linking Blaze for Storage also means the *other* services need active monitoring (Budget Alerts) rather than relying on an automatic free-tier hard-stop.
- **Catalog sourcing is resolved for MVP**, replacing the earlier generic "licensing workstream" assumption: international tracks come from the Jamendo API (non-commercial use only — §10.4), and the domestic catalog is a pre-assembled local Indonesian collection stored on Firebase Storage. Broader label licensing remains a possible future workstream only if Spotiwind moves toward a fully commercial catalog.
- **Firebase Cloud Storage requires the Blaze (paid) plan to provision a bucket at all**, a platform change effective February 3, 2026, regardless of usage volume. This project accepts that requirement rather than routing around it; `DATABASE.md §9` covers how bucket region choice affects whether actual spend stays near $0 or not.
- Initial launch market: Indonesia, expanding to SEA; pricing tiers in §10 are the target model, not active in the current phase.
- MVP assumes a client-heavy, Backend-as-a-Service architecture on Firebase rather than a custom backend server (`SKILL.md §3`) — a deliberate simplification enabled by Firestore's built-in realtime sync and security rules, appropriate to current scale and budget.
- Native mobile apps are assumed to follow the responsive web app in sequencing (web-first MVP), unless business priorities dictate otherwise.

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Jamendo free-tier request cap (35,000/month) exhausted by traffic growth | Medium | Cache Jamendo metadata in Firestore, only call Jamendo live for fresh playback URLs, monitor usage in the Jamendo developer dashboard (`SKILL.md §7`) |
| Activating monetization while relying on Jamendo's non-commercial catalog | High (legal/compliance) | Treated as a hard gate — see §10.4; contact Jamendo for a commercial quote, or restructure catalog before enabling ads/subscriptions |
| Firestore/Auth/Hosting usage quietly starts costing money once Blaze is linked (for Storage), since the automatic free-tier hard-stop no longer applies project-wide | Medium | Denormalized data model to minimize reads (`DATABASE.md`), and a Google Cloud Budget Alert set at $1–3 from day one (`SKILL.md §12`) so any drift is caught immediately |
| Firebase Storage egress cost growing with streaming volume (the accepted paid component) | Medium | US-region bucket keeps a real free allowance (5GB storage / 100GB egress monthly, `DATABASE.md §9`); efficient encoding (128–160kbps); Hosting-cached bandwidth for popular tracks as volume grows |
| WindFlow recommendation quality at low data volume (cold start) | Medium | Use genre/BPM/energy metadata-based similarity before collaborative filtering data matures |
| Feature-name novelty causing user confusion (WindFlow, Gust Mode, etc.) | Low–Medium | Pair every new term with a plain-language subtitle on first use (e.g., "WindFlow Radio — an endless mix built from this song") |
| Over-animation hurting performance/accessibility | Medium | Motion budget defined in `DESIGN.md §10`; respect `prefers-reduced-motion` |

## 14. Release Roadmap

| Phase | Timeframe (indicative) | Focus |
|---|---|---|
| **Phase 0 — Foundation** | Months 0–2 | Architecture, design system build-out, licensing groundwork |
| **Phase 1 — MVP Launch** | Months 2–5 | Core listening experience, Free + Premium Individual, WindFlow v1 |
| **Phase 2 — Growth** | Months 5–9 | Social layer, collaborative playlists, more plan tiers, Artist Dashboard |
| **Phase 3 — Differentiation** | Months 9–14 | Wind Rewind, Windmap, Artist Pro, dynamic theming, podcasts |

## 15. Appendix — Glossary of Branded Terms

| Term | Meaning |
|---|---|
| **WindFlow Radio** | Continuous, self-refining algorithmic radio started from any seed |
| **Breeze Transitions** | The signature crossfade/gapless playback engine |
| **Gust Mode** | One-tap high-energy shuffle mode |
| **Wind Rewind** | Annual personalized listening recap |
| **Windmap** | Visual, explorable map of genre/mood adjacency |
| **Windsock** | Live "trending now" indicator |
| **Tailwind Playlists** | Real-time collaborative playlists |
| **Vibe/Energy Score** | Internal metadata describing a track's tempo/energy for flow-matching |

---
*End of PRD.md — see `DESIGN.md` for the visual and interaction system that brings this scope to life.*
