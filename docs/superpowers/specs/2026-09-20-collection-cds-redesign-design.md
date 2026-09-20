# Design Specification: My Collection & CDS Hub Redesign

## Date: 2026-09-20
## Author: Antigravity AI
## Reference: Stitch MCP Project `7493429195486760217`, Screen `3d052c5331ab4fe0b38ae14b2f8c8190`

---

## 1. Problem Statement & Goals
The existing "My Collection" and "Card Distribution System (CDS)" panels in `index.html` were functional but had several mobile usability and visual design shortcomings:
- Card tiles looked flat and lacked tactile depth, punchy rarity indicators, or intuitive visual feedback when pressed.
- Gold-tier cards were difficult to distinguish between owned vs unowned/locked states.
- Set progression was hidden behind a simple dropdown or flat pill list without completion percentages or reward incentives.
- Quotas (daily card requests and CDS free allowances) were presented as plain text rather than engaging dashboard chips.
- Mobile layout needed tight, thumb-friendly 3-column spacing with 44px+ hit targets to prevent mis-clicks.

### Goals
1. **Modernize Aesthetics**: Adopt the Stitch MCP reference design ("Pastoral Radiant + Arcane Gold") featuring tactile 3D game cards, gold borders, subtle sheen animations, and glowing progress indicators.
2. **Mobile Ergonomics**: Deliver 1-thumb touch navigation with smooth horizontal set scrollers, tactile pill buttons (`active: scale(0.96)`), and responsive 3-column card layouts.
3. **Preserve Compatibility**: Retain all DOM element IDs and event bindings (`ownedCards`, `cardRequests`, `renderCollGrid`, `renderCdsGrid`, `cdsToggleRequest`, `openCardActionModal`, etc.) so no game mechanics or Firestore models break.

---

## 2. Architecture & Components

### 2.1 My Collection (`#panel-coll`)
- **Header & Progress Quota**:
  - Album Completion Pill: Displays `112 / 150 Cards (74%)` with mini glowing track.
  - Quota Dashboard: 2-column card showing `Requests Left Today` and `Reset Timer`.
- **View Switcher (Segmented Control)**:
  - Three pills: `[🃏 My Cards]`, `[📬 My Requests]` (with count badge), and `[🛍️ Coin Shop]`.
- **Horizontal Set Navigation (`#collSetTabs`)**:
  - Horizontal drag/scroll pill tabs with completion status (e.g. `10/10 ⭐ Done`, `9/10 In Progress`).
- **Active Set Reward Banner**:
  - Highlights the current set name, completion progress bar, and grand prize (e.g., 1,200 Coins + 20 Gems).
- **3-Column Card Grid (`#collGrid`)**:
  - Tactile card frame (`.coll-card`).
  - Top-left card number (`#011`), top-right dupe badge (`x3 Dupes`) or `NEW!` indicator.
  - Card art container (aspect-ratio 1:1, rounded, subtle inset shadow).
  - High-contrast card title and star rating.
  - Gold cards feature shining gold border and warm gradient background when owned, but muted amber hairline when locked.
  - Status chip at base: `Tradeable`, `Owned`, or `Request (🪙 Cost)`.

### 2.2 CDS Distribution Hub (`#panel-cds`)
- **Header & Cooperative Pool Banner**:
  - CDS Hub header with "Auto-Fulfill Online" status tag.
  - Daily Free Allowance Chips: `🎁 5/5 Free Left Today`, `🌟 2/2 Gold Left Today`.
- **View Switcher (Segmented Control)**:
  - Two pills: `[🎁 Browse Cards]`, `[📬 My CDS Requests]` (with pending badge).
- **Horizontal Set Navigation (`#cdsSetTabs`)**:
  - Matches the collection set navigation for intuitive cross-panel consistency.
- **3-Column Card Grid (`#cdsGrid`)**:
  - Each card provides a direct 1-tap free request trigger:
    - Missing cards display `🎁 Request Free` or `🌟 Gold Free`.
    - Pending requests display `📬 Requested` (tapping cancels the request).
    - Owned cards display `✅ In Deck`.

---

## 3. Data Flow & State Management

All existing functions remain intact with zero breaking changes:
- `renderCollGrid()` / `hydrateCollGridHoles(grid, setIdx)`
- `renderCdsGrid()` / `hydrateCdsGridHoles(grid, setIdx)`
- `renderCollTabs()` / `renderCdsTabs()`
- `openCardActionModal(setIdx, cardIdx)`
- `cdsToggleRequest(setIdx, cardIdx)`
- `setCollView(view, btn)` / `setCdsView(view, btn)`

---

## 4. Verification Plan

1. **Syntax & Script Integrity**: Run `python clean_check.py` to confirm all 11 script blocks in `index.html` compile with 0 syntax errors.
2. **DOM Element Integrity**: Run node automated tests to verify all critical IDs exist (`collGrid`, `cdsGrid`, `collSetTabs`, `cdsSetTabs`, `cdsFreeLeft`, `collTotal`, etc.).
3. **Behavioral Test**: Verify clicking a card in Collection opens `openCardActionModal` and clicking an unowned card in CDS toggles `cdsToggleRequest`.
4. **Visual Companion Review**: Live preview served at `http://localhost:50273`.
