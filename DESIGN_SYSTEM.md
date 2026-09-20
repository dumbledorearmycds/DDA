# DA Hub — Design System & Visual Direction
**Version:** 2.0 (Premium Mobile Utility Architecture)  
**Target:** Mobile-First Web Application (iOS Safari & Android Chrome primary; Tablet & Desktop responsive)

---

## 1. Executive Summary & Design Vision

### From "Cosmic Purple Skeuomorphism" to "Premium Mobile Utility"
The current user interface relies on heavy 3D beveled borders, neon purple/magenta glows, floating animated background orbs, and dense information layout. This causes visual fatigue, high idle CPU/battery drain, and poor legibility under natural lighting.

The new **"Premium Mobile Utility"** direction elevates DA Hub to feel like a high-end native mobile app (inspired by Apple iOS HIG, modern Supercell game interfaces, and luxury mobile utilities):
- **Refined Luxury Aesthetic:** Deep obsidian/amethyst surfaces, polished warm champagne gold accents, crisp 1px borders, and tactile tactile micro-interactions.
- **Ergonomics & Thumb-Zone:** Critical interactive controls live in the lower 60% of the screen. Primary tap targets exceed 44×44px.
- **Battery & Performance First:** Zero heavy infinite loops on background blur filters; GPU-accelerated transforms for instantaneous 60fps response.
- **Responsive Fluidity:** Flawlessly scales from a 360px compact mobile screen to a 768px tablet grid, up to a 1200px centered desktop workstation.

---

## 2. Color Palette & Token Architecture

All colors are defined via standard CSS custom properties on `:root` and adapt seamlessly via `body.dark-mode` or system preference. Existing token names (`--gold`, `--red`, `--green`, `--panel`, `--line`) are preserved for 100% backward compatibility with existing JavaScript logic.

### 2.1 Core Palette Tokens (CSS Variables)

```css
:root {
  /* ── DA Brand & Metallic Accents ── */
  --gold-light: #FFE082;        /* Highlight shimmer / text hover */
  --gold: #F5C542;              /* Primary champagne gold accent */
  --gold-dark: #C6951A;         /* Gold border / active press state */
  --gold-glow: rgba(245, 197, 66, 0.22);
  --gold-hairline: rgba(245, 197, 66, 0.18);

  /* ── Status & Gameplay Semantics ── */
  --green: #34D399;             /* Success / win / trade accepted */
  --green-dark: #059669;
  --green-surface: rgba(52, 211, 153, 0.12);

  --red: #F87171;               /* Danger / deduct / bomb / errors */
  --red-dark: #DC2626;
  --red-surface: rgba(248, 113, 113, 0.14);
  --bomb-red: #EF4444;

  --purple: #A78BFA;            /* Secondary accent / wizardry */
  --purple-dark: #7C3AED;
  --purple-surface: rgba(167, 139, 250, 0.12);

  --teal: #38BDF8;              /* Info / timer / special badges */
  --pink: #F472B6;              /* Jackpot highlights */

  /* ── Neutral / Surfaces (Dark Theme - Default) ── */
  --bg-canvas: #090614;         /* Base window canvas (OLED deep) */
  --bg-elevated: #110D24;       /* Primary panel / screen background */
  --surface-card: #181330;      /* Standard card surface */
  --surface-card-hover: #221A42;/* Interactive card hover */
  --surface-overlay: #1F173D;   /* Modal / sheet elevated surface */
  --surface-input: #0E0A1E;     /* Text field / form input recess */

  /* ── Hairlines & Borders ── */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-card: rgba(255, 255, 255, 0.11);
  --border-gold: rgba(245, 197, 66, 0.28);
  --line: rgba(245, 197, 66, 0.16);

  /* ── Typography & Content Colors ── */
  --text-primary: #FFFFFF;      /* High contrast headers & values */
  --text-secondary: #D4CDED;    /* Body text, readable labels (WCAG AA) */
  --text-muted: #958BB8;        /* Captions, timestamps, disabled info */
  --text-inverse: #160D2E;      /* Text placed over bright gold buttons */

  /* ── Glass & Blur Overlays ── */
  --glass-bg: rgba(18, 13, 38, 0.82);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: blur(16px);
  --backdrop-scrim: rgba(4, 2, 10, 0.78);

  /* ── Legacy Backward-Compatibility Mappings ── */
  --bg1: var(--bg-canvas);
  --bg2: var(--bg-elevated);
  --panel: var(--surface-card);
  --panel2: var(--surface-overlay);
  --cream: #FFFDF5;
  --card-back: #C2410C;
}
```

### 2.2 Light Mode Palette (`body.light-mode` or `body:not(.dark-mode)` alternate)
When users toggle light mode, the app transitions into an authentic **Magical Parchment & Royal Amethyst** aesthetic rather than generic blinding white:
```css
body.light-mode {
  --bg-canvas: #F5F1E8;         /* Warm antique parchment */
  --bg-elevated: #EDE6D8;       /* Subtle layered parchment */
  --surface-card: #FFFFFF;      /* Crisp card deck white */
  --surface-card-hover: #FAF7F2;
  --surface-overlay: #FFFFFF;
  --surface-input: #F3ECE0;

  --border-subtle: rgba(45, 30, 92, 0.08);
  --border-card: rgba(45, 30, 92, 0.14);
  --border-gold: rgba(184, 140, 30, 0.4);
  --line: rgba(184, 140, 30, 0.25);

  --text-primary: #1F1538;      /* Deep midnight violet */
  --text-secondary: #473B66;    /* Dark lavender body */
  --text-muted: #7E719C;        /* Readable tertiary */
  --text-inverse: #FFFFFF;

  --gold: #D49A10;              /* Deeper gold for light contrast */
  --gold-dark: #9E7005;
  --gold-glow: rgba(212, 154, 16, 0.2);

  --glass-bg: rgba(245, 241, 232, 0.88);
  --glass-border: rgba(45, 30, 92, 0.1);
  --backdrop-scrim: rgba(22, 14, 44, 0.55);
}
```

---

## 3. Typography Hierarchy

### 3.1 Font Selection
To ensure optimal performance and crisp rendering across mobile Retina and Android screens, we select two Google Fonts with modern tabular numbers:
1. **Display & Header Font: `Outfit` (Weights: 600, 700, 800)**
   - Geometric, modern, and punchy.
   - Replaces the outdated, overly cartoonish `Fredoka One` for game headlines, modal titles, and big numeric values.
   - Retains playful warmth while communicating premium mobile quality.
2. **Body & Interface Font: `Plus Jakarta Sans` (Weights: 400, 500, 600, 700)**
   - High x-height, wide apertures, and exceptional readability at small sizes (10px–14px).
   - Clean tabular figure alignment for coin values, countdown timers, and player counters.
   - Full support for Latin characters, numbers, and symbols.
3. *(Lore Heritage Accent)*: `Cinzel` is preserved exclusively for the official DA Crest wordmark and rare legendary card labels.

### 3.2 Responsive Type Scale

| Element | Mobile (< 480px) | Tablet (481–1024px) | Desktop (> 1024px) | Weight | Line Height | Tracking |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero / Game Banner** | 24px (1.5rem) | 30px (1.875rem) | 36px (2.25rem) | 800 | 1.15 | -0.02em |
| **Screen / Modal Title** | 18px (1.125rem)| 22px (1.375rem) | 24px (1.5rem) | 700 | 1.25 | -0.01em |
| **Section Header** | 15px (0.9375rem)| 17px (1.0625rem)| 18px (1.125rem) | 700 | 1.3 | 0 |
| **Card Title / Bold Stat** | 14px (0.875rem)| 15px (0.9375rem)| 16px (1.0rem) | 600 / 700 | 1.35 | 0 |
| **Body / Description** | 13px (0.8125rem)| 14px (0.875rem)| 15px (0.9375rem) | 400 / 500 | 1.5 | +0.01em |
| **Form Inputs** | **16px** *(Safe)* | 15px (0.9375rem)| 15px (0.9375rem) | 500 | 1.4 | 0 |
| **Chip / Badge Label** | 11px (0.6875rem)| 12px (0.75rem) | 12px (0.75rem) | 600 | 1.2 | +0.02em |
| **Micro Caption / Nav** | 10px (0.625rem)| 11px (0.6875rem)| 12px (0.75rem) | 600 / 700 | 1.1 | +0.03em |

> [!IMPORTANT]
> **iOS Safari Auto-Zoom Fix:** Form `<input>`, `<select>`, and `<textarea>` elements on mobile must have a calculated font-size of at least **16px** (`1rem`) to prevent iOS Safari from jarringly zooming the entire page viewport upon focus.

---

## 4. Spacing, Ergonomics & Layout Grid

### 4.1 Spacing Scale
Built on a consistent 4px / 8px incremental scale:
- `space-1`: `4px`  (tight badge gaps, icon padding)
- `space-2`: `8px`  (inline item spacing, chip padding)
- `space-3`: `12px` (compact card content padding)
- `space-4`: `16px` (standard card padding, screen gutters)
- `space-5`: `20px` (modal padding, section vertical separation)
- `space-6`: `24px` (container margins, header padding)
- `space-8`: `32px` (major section dividing room)
- `space-12`: `48px` (desktop layout breathing space)

### 4.2 Safe Area Insets & Thumb Zones
- **Bottom Navigation Height:** `64px` + `env(safe-area-inset-bottom, 0px)`
- **Top Bar Height:** `54px` + `env(safe-area-inset-top, 0px)`
- **Thumb Zone Compliance:** Primary action buttons (Spin, Roll, Trade, Submit) are locked to the lower 60% of the mobile viewport.
- **Minimum Tap Targets:** All buttons, nav items, and interactive chips have a minimum hit area of `44px × 44px` with `-webkit-tap-highlight-color: transparent`.

---

## 5. Component Guidelines

### 5.1 Buttons
Buttons transition from heavy 3D beveled shadows to modern, tactile, elevated pills with subtle highlight borders and springy active states.

- **Primary Action (Gold / Win / CTA):**
  - Background: `linear-gradient(135deg, #FDE68A 0%, #F5C542 50%, #D97706 100%)`
  - Text: `#1A1000` (bold 700 weight for maximum contrast)
  - Border: `1px solid rgba(255, 255, 255, 0.35)`
  - Shadow: `0 4px 14px rgba(245, 197, 66, 0.28), 0 1px 2px rgba(0, 0, 0, 0.3)`
  - Active Press: `transform: scale(0.96); box-shadow: 0 2px 6px rgba(245, 197, 66, 0.2)`
- **Secondary / Surface Action:**
  - Background: `rgba(255, 255, 255, 0.08)` (glass pill)
  - Text: `var(--text-primary)`
  - Border: `1px solid var(--border-card)`
  - Active: `background: rgba(255, 255, 255, 0.14); transform: scale(0.96)`
- **Destructive / Red Action:**
  - Background: `linear-gradient(135deg, #F87171 0%, #EF4444 60%, #B91C1C 100%)`
  - Text: `#FFFFFF`
  - Shadow: `0 4px 14px rgba(239, 68, 68, 0.25)`
- **Success / Green Action:**
  - Background: `linear-gradient(135deg, #34D399 0%, #10B981 60%, #047857 100%)`
  - Text: `#06311E`

### 5.2 Cards & Panels
- **Border Radius:** `16px` for small cards, `20px` for featured event/game banners, `24px` for modals.
- **Surface Styling:** Dark semi-translucent glass `rgba(24, 19, 48, 0.85)` with `1px solid var(--border-card)`.
- **Light Contrast Inset:** A subtle `inset 0 1px 0 rgba(255, 255, 255, 0.08)` gives cards a machined, premium Apple-like physical depth without heavy shadows.
- **Card Grids:**
  - Mobile (< 480px): 3 columns for card collection.
  - Tablet (481px–1024px): 4 to 5 columns.
  - Desktop (> 1024px): 6 columns.

### 5.3 Modals & Dialogs
- **Backdrop:** Deep cinematic blur scrim (`background: rgba(5, 3, 15, 0.76); backdrop-filter: blur(8px)`).
- **Mobile Experience:** Renders as an ergonomic bottom-sheet or centered responsive modal that never exceeds `88vh`.
- **Scroll Behavior:** Sticky header (Title + Close Button), scrollable body (`overflow-y: auto`), sticky bottom action bar.
- **Dismissibility:**
  1. Tapping the backdrop closes the modal.
  2. Pressing `Escape` key closes the modal.
  3. Clear, unambiguous `✕` close button in top-right corner.

### 5.4 Form Inputs & Search Fields
- **Container Height:** `46px` on mobile, `42px` on desktop.
- **Surface:** `background: var(--surface-input); border: 1px solid var(--border-subtle); border-radius: 12px;`
- **Focus State:** `border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-glow);`
- **Helper text & placeholders:** Clear `#958BB8` placeholder with high contrast.

---

## 6. Motion & Performance Guidelines

### 6.1 Transition Timing & Easing
All interface motion is strictly functional, purposeful, and optimized to run on the GPU (affecting only `transform` and `opacity` to avoid browser layout thrashing).

| Motion Type | Duration | Timing Function | Usage |
| :--- | :--- | :--- | :--- |
| **Tap / Press Response** | `120ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Buttons, nav tabs, card clicks |
| **State Toggle / Chip** | `180ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Mute toggle, coin dot, filters |
| **Modal / Sheet In** | `260ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Slide up & scale in (Apple spring) |
| **Modal / Sheet Out** | `200ms` | `cubic-bezier(0.4, 0, 1, 1)` | Fade & slide down |
| **Tab / View Fade** | `180ms` | `ease-out` | Switching between games/CDS/social |

### 6.2 Elimination of Battery-Draining Infinite Loops
- ❌ **Removed:** 3 infinite floating blur orbs (`.bg-orb` on 16s loops with 60px filter blur).
- ❌ **Removed:** 50+ continuously calculating DOM star particles (`.star` opacity/scale loops).
- ❌ **Removed:** Permanent infinite coin pulsing glow (`coinGlow 3s infinite`) and crest glow (`crestGlow 3.5s infinite`).
- ❌ **Removed:** Infinite bottom-nav active icon bobbing (`bob 1.6s infinite`).
- ✅ **Added:** High-performance static radial vignette gradient with subtle static CSS stars.
- ✅ **Added:** Micro-interaction badges (dots appear with a crisp single entrance animation, rather than pulsing forever).
- ✅ **Added:** Full support for `@media (prefers-reduced-motion: reduce)` disabling non-essential transitions.

---

## 7. Responsive Breakpoint Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ Mobile (< 480px)                                            │
│ • Minimal topbar (DA crest, coins, suggest, profile, mute)  │
│ • Full-width main container                                 │
│ • Fixed 5-tab bottom navigation with safe-area spacing      │
│ • Touch targets ≥ 44px                                      │
├─────────────────────────────────────────────────────────────┤
│ Tablet (481px – 1024px)                                     │
│ • Max-width 720px – 900px centered layout                   │
│ • Grid expansions (collection: 4-5 cols)                    │
│ • Nav adapts into top bar or floating bottom dock          │
├─────────────────────────────────────────────────────────────┤
│ Desktop / Laptop (> 1024px)                                 │
│ • Centered app container (max-width: 1140px)                │
│ • Left-side navigation rail or expanded top header bar      │
│ • Bottom nav hidden or docked                               │
│ • Rich hover states on all cards, buttons, and chips        │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. UX & Usability Innovations (Included Proposals)

1. **Native-Like Bottom Sheet Modals:** On mobile, convert oversized centered dialogs into smooth slide-up bottom sheets with an intuitive drag handle.
2. **Replacement of Native `confirm()` and `prompt()`:** Replace browser-native alert dialogs with a unified `<div id="customDialogModal">` that maintains app theme, allows custom button text, and supports Enter/Esc keys.
3. **Haptic Feedback Hooks:** Micro-vibration `navigator.vibrate?.(8)` on coin collection, spin trigger, and button press (Android Chrome).
4. **Empty State Component System:** Standardized visual template (`.empty-state-card`) with custom vector/emoji illustration, clear explanation, and primary action button.
5. **Universal Safe Game Room Exits:** Clear, frosted, high-contrast floating `✕ Exit` pill anchored safely at top-right for all fullscreen modes (Spin & Win, Cards Battle, Jumbled Jackpot, Pattern Recall).
6. **Card Trade Request Bottom Bar:** Quick-filter chips for Collection (All, Missing, Duplicates, Star Tier) that instantly narrow the view without lag.

