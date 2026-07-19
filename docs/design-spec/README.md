# Handoff: Filmapp — Søk, Detaljside og Watchlist

## Overview
Mobil web-app-design for å søke opp filmer/serier, se detaljer (bilde, beskrivelse, IMDb/Rotten Tomatoes-rating, strømmetjenester) og legge dem til i en watchlist. Mørkt, fargerikt tema (indigo/plum/teal-gradient) med lyse/gradient-knapper.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these HTML designs in the target codebase's existing environment** (React Native, native iOS/Android, or web framework — whatever the app already uses) using its established patterns and libraries. If no environment exists yet, choose the most appropriate framework and implement the designs there.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, and copy are final for this design pass. Recreate pixel-perfectly using the target codebase's component library where one exists; otherwise build to these exact specs.

## Screens / Views

All screens share a 390×844 mobile viewport, a shared bottom tab bar (Søk / Watchlist), and the same background: `linear-gradient(165deg, oklch(0.24 0.1 300) 0%, oklch(0.19 0.09 265) 30%, oklch(0.16 0.07 220) 60%, oklch(0.13 0.03 60) 100%)` (indigo → blue → teal → near-black, diagonal).

**Unntak (post-hifi, issue #44):** Søk-skjermens tom-tilstand (screen 1, before any search) uses a distinct "plakatvegg" (poster wall) background instead — a rotated 4×4 grid of 16 colored placeholder tiles (`.cf-poster`, one gradient per tile) under a dark readability haze (`.cf-haze`), implemented as `.cf-bg`/`.cf-posters`/`.cf-poster`/`.cf-haze` in `src/index.css` and the `PosterWallBackground` component. All other screens/states (search results, detail, watchlist) keep the shared gradient above unchanged.

### 1. Søk (Search / empty state)
- **Purpose**: Entry point. Minimal — just search and voice search, no browsing content.
- **Layout**: Full-height column. Content area splits into two flex zones: a centered middle zone (logo + search field, vertically centered via `flex:1; justify-content:center`) and a bottom-pinned row (search button + mic button), separated so the field can sit mid-screen while the buttons stay anchored near the bottom tab bar.
- **Components**:
  - "CineFind" wordmark, Space Grotesk 700, 26px, gradient text fill (magenta → blue, see Design Tokens).
  - Search input (pill), background `oklch(0.3 0.06 270 / 0.4)`, 1px border `oklch(0.55 0.1 280 / 0.5)`, radius 16px, padding 14×16px. Placeholder "Søk etter film eller serie", 15px, `oklch(0.8 0.03 280)`. Left icon: simple magnifying-glass built from a circle + rotated line (no icon font).
  - Button row: primary "Søk" button (flex:1, gradient fill magenta→blue, dark text, radius 14px, 14px padding, 15px/700 bold) + circular 52px mic button (outline capsule + base line, same outline color as search icon) for voice-to-text.
- **Bottom tab bar**: fixed, 78px, translucent surface with blur, "Søk" active (bold, magenta), "Watchlist" inactive (star icon dimmed).

### 2. Søkeresultater (Search results)
- **Purpose**: Show results for a query ("sci-fi", 4 hits).
- **Layout**: Search bar (filled, showing the typed query) → result count → 2-column grid (`grid-template-columns: 1fr 1fr`, 16px gap; a `compactGrid` toggle switches this to 3 columns).
- **Card**: poster image (2:3 aspect, 14px radius, 1px hue-tinted ring), title (13.5px/600), meta line (11.5px/600, colored by the item's genre hue) below. Top-right circular badge over the poster shows a ★ star (gold) toggle for watchlist state — filled background in the item's hue when added.
- **Data shown**: Solvind (2027, Sci-fi/Drama, in watchlist), Glassbyen (series, 3 seasons), Stjernefall (2023), Marsbarn (2026).

### 3. Detaljside (Detail page)
- **Purpose**: Full info on one title, entry point to add to watchlist.
- **Layout**: Full-bleed hero image (420px tall) with a bottom gradient scrim, back arrow (←) top-left in a translucent circle, title overlaid bottom-left of the hero. Below: meta line, two rating badges side by side, description paragraph, "Tilgjengelig på" streaming-service badge row. CTA fixed to the bottom.
- **Components**:
  - Hero: `<image-slot>` placeholder, "bilde fra filmen".
  - Title: "Solvind", Space Grotesk 700, 30px.
  - Meta: "2027 · Sci-fi, Drama · 2t 18 min", 13.5px, `oklch(0.72 0.04 270)`.
  - Rating badge 1 (IMDb): ★ gold icon + "7.9 /10" + "IMDb" label, pill card `oklch(0.28 0.08 85 / 0.25)` bg, gold-tinted border.
  - Rating badge 2 (Rotten Tomatoes): circular "R" mark (not the real logo — a generic red badge) + "88%" + "Rotten Tom." label, red-tinted card.
  - Description (14.5px/1.55 line-height): fictional Norwegian synopsis (see Files for exact copy).
  - Streaming badges: "Netflix", "HBO Max", "Disney+", "Viaplay" — plain text pills, each with a distinct hue-tinted border/background (no logos — text-only placeholders per service).
  - CTA: "＋ Legg til i watchlist", full-width, gradient fill (same as Søk button), radius 16px, 15px/700 bold, fixed above the safe area with a fade-out gradient behind it.

### 4. Watchlist (Min liste)
- **Purpose**: Manage saved titles.
- **Layout**: Header "Min liste" + item count. Vertical list of rows.
- **Row**: 60×90 poster thumb (10px radius, hue ring) + title (14.5px/700) + meta (12px/600, hued) + circular 34px ★ button (gold fill) at the trailing edge to remove/toggle.
- **Data shown**: Solvind, Glassbyen, Nattogget, Det Siste Kartet — each with a distinct accent hue used consistently across screens 2–4 for that title.

## Interactions & Behavior
- Static prototype — no live navigation wired up. Buttons/icons are visual only; implement standard tap targets (min 44px) and navigation: Søk → Søkeresultater → Detaljside → (add to) → Watchlist.
- Search field on screen 1 should support both typed text and a voice-to-text flow triggered by the mic button (visual affordance only in this design; actual STT integration is up to the target platform).
- The ★ badge on cards/rows toggles "in watchlist" state — filled hue background when active, translucent dark background when not.
- No hover states specified (mobile-first, touch target design). Standard press/active-state dimming is expected on tap.

## State Management
- `watchlist: Item[]` — titles the user has saved, drives screen 4 and the filled/unfilled star state on cards elsewhere.
- `searchQuery: string`, `searchResults: Item[]` — screen 2.
- `selectedTitle: Item` — screen 3, whichever title the user tapped into.
- Item shape: `{ title, year, genre, length/episodes, poster, imdbRating, rtRating, description, streamingServices: string[], hue }` — `hue` is a per-title accent color used for its poster ring, meta text, and watchlist icon everywhere it appears.

## Design Tokens
- **Background gradient** (all screens): `linear-gradient(165deg, oklch(0.24 0.1 300) 0%, oklch(0.19 0.09 265) 30%, oklch(0.16 0.07 220) 60%, oklch(0.13 0.03 60) 100%)`
- **Primary gradient (buttons, wordmark, CTA)**: `linear-gradient(90deg, oklch(0.78 0.14 340), oklch(0.75 0.13 250))` (magenta → blue)
- **Gold (ratings, star icons)**: tweakable, default `#d9b568`
- **Accent (legacy prop, kept for future tweaks)**: default `#e4536b`
- **Per-title hues** (drive poster rings / meta text / watchlist icon per item): blue `oklch(0.6 0.15 250)`, violet `oklch(0.6 0.16 290)`, teal `oklch(0.62 0.13 190)`, amber `oklch(0.68 0.14 75)`, coral `oklch(0.62 0.17 25)`
- **Surface (cards, inputs)**: `oklch(0.3 0.06 270 / 0.4)` translucent over the background
- **Text**: near-white `oklch(0.96 0.02 60)` primary, hue-tinted secondary text per item
- **Typography**: Space Grotesk 600/700 for headings/wordmark; Manrope 400–800 for body/UI. Both loaded from Google Fonts.
- **Radius scale**: 10–16px on cards/buttons, 44px on the phone frame itself (not needed in a real app shell), 50% (circular) on icon buttons and badges.
- **Card grid gap**: 16px. Poster aspect ratio: 2:3.

## Assets
- All posters and the hero image are placeholders (drag-and-drop image slots in the prototype, ids like `poster-solvind`, `poster-glass`, `detail-hero`, etc.) — replace with real artwork.
- No icon library used — search/mic/star/back icons are drawn from basic shapes (circles, lines, text glyphs ★ ← ＋) rather than an icon font or SVG set, so the target app is free to swap in its own icon system.
- Streaming service names are shown as plain text badges, not real logos.

## Files
- `Filmapp.dc.html` — the full design source (all 4 screens, inline-styled, single file).
- `image-slot.js` — drag-and-drop placeholder component used for posters/hero art in the prototype (not needed in production — replace with real `<img>`/native image components).
- `screenshots/01-sok.png`, `02-sokeresultater.png`, `03-detaljside.png`, `04-watchlist.png` — reference renders of each screen.
