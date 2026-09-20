# DA Hub — Mobile UI/UX, Viewport & Scroll Performance Audit Report

**Target Platforms**: Android Chrome (latest) & iOS Safari (iOS 15+) PWA  
**Codebase Analyzed**: `index.html` (Single-file HTML/CSS/JS, ~18,660 lines)  
**Audit Phase**: Phase 1 — Comprehensive Inspection (Pre-implementation)

---

## Executive Summary

A systematic code inspection of **DA Hub** was conducted across 5 critical mobile dimensions:
1. **Viewport & Keyboard Correctness**: 4 out of 5 fullscreen rooms rely solely on static CSS `100dvh` without any JS `visualViewport` height tracking or iOS viewport pan compensation. Only Cards Battle implements a local height synchronization routine (`cbWireKeyboardScrollLock()`), leaving Spin & Win, Pattern Recall, Jumbled Jackpot, and Jackpot Event vulnerable to layout overflow, invisible inputs, and viewport detaching when the virtual keyboard deploys.
2. **Scroll Smoothness & Containment**: 14 of 17 scroll containers completely lack `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`, causing rubber-banding and scroll-chaining to the root document. Furthermore, synchronous layout reads (`scrollWidth`, `clientWidth`, `scrollLeft`) inside native `scroll` listeners induce continuous layout thrashing during drag-scrolls and duration-wheel flicks. There is currently **no body scroll lock** when overlays are displayed.
3. **Touch UX & Tap Target Ergonomics**: Over 60 interactive controls fail Apple's recommended minimum 44×44px hit target, with critical buttons having touch heights as low as 24px–28px. 27 interactive elements have `:hover` states without `:active` mobile feedback, and `touch-action: manipulation` is missing across all buttons except a single voting button, risking 300ms double-tap delays.
4. **Modal & Dialog Architecture**: **Zero** of the 22 modal/overlay containers in the application dismiss on backdrop tap, and there is **zero** `Escape` key handling.
5. **Layout Shift & Visual Stability**: Unreserved element heights (notably `#cbCard` during winner reveal, `#sessionRestoreScreen` before auth check, and dynamic announcement bars) cause jarring content shifts and jumpy viewport reflows.

---

## 1. Viewport Audit

### 1.1 Fullscreen Room Matrix

| Fullscreen Room | DOM Element & Class Trigger | Current Height Strategy | Shrinks on Keyboard? | Safe-Area Inset Handling | iOS Visual Viewport Pan Bug Handled? | Orientation Change Handled? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Spin & Win** | `#panel-spin.active`<br>`body.spin-room-active` | `height: 100%; height: 100dvh;` (CSS only) | ❌ **No** (Static CSS; lacks JS VisualViewport binding) | ⚠️ Partial: `max(12px, env(safe-area-inset-left/right))` & `top/bottom` (L1170–1173) | ❌ **No** (`translateY` compensation missing) | ❌ **No** (No resize/orientation listener) |
| **Pattern Recall** | `#panel-pr.active`<br>`body.pr-room-active` | `height: 100%; height: 100dvh;` (CSS only) | ❌ **No** (Static CSS; lacks JS VisualViewport binding) | ⚠️ Partial: `max(12px, env(safe-area-inset-left/right))` & `top/bottom` (L7660–7663) | ❌ **No** (Missing) | ❌ **No** (Missing) |
| **Cards Battle** | `#cbScreen.cb-fullscreen`<br>`body.cb-room-active` | CSS `100dvh` fallback + JS `vv.height` | ✅ **Yes** (Dynamically synced via `cbWireKeyboardScrollLock`) | ⚠️ Flawed: Sets `top/bottom` insets but omits `left/right` safe areas (L1667) | ✅ **Yes** (`transform: translateY(vv.offsetTop)px` applied at L17730) | ✅ **Yes** (Listens to `vv.resize` and `vv.scroll`) |
| **Jumbled Jackpot** | `.jj-screen.jj-fullscreen`<br>`body.jj-room-active` | `height: 100%; height: 100dvh;` (CSS only) | ❌ **No** (Input in answer box pushes layout up offscreen) | ⚠️ Partial: Insets applied, but bottom padding hardcoded to `max(40px, env(...))` (L1703) | ❌ **No** (Missing) | ❌ **No** (Missing) |
| **Jackpot Event** | `.jj-screen.jj-fullscreen`<br>`body.jj-room-active` | `height: 100%; height: 100dvh;` (CSS only) | ❌ **No** (Multiple answer inputs cause viewport detachment) | ⚠️ Same as JJ | ❌ **No** (Missing) | ❌ **No** (Missing) |

### 1.2 Overlays & Modals Height Matrix

| Overlay / Modal Container | Current Height Strategy | Keyboard Shrink | Safe Area Inset Handling | Viewport Detach / Pan Defense |
| :--- | :--- | :--- | :--- | :--- |
| **Global Overlays** (`.overlay`: `#lbViewOverlay`, `#howToOverlay`, `#coinHistoryOverlay`, `#sgVotersOverlay`, `#overlayPsPhoto`, etc.) | `position: fixed; inset: 0;` | ❌ No (flex-centered, keyboard overlays content) | ❌ None on `.modal` dialogs | ❌ No pan compensation |
| **Game Overlays** (`#spinWinOverlay`, `#jackpotWinOverlay`, `#prResultOverlay`) | `position: fixed; inset: 0;` | ❌ No | ❌ None | ❌ No pan compensation |
| **Admin Welcome Modals** (`.welcome-modal-overlay`: `#coinGrantModal`, `#coinDeductModal`, `#progressResetModal`, `#auraGrantModal`, etc.) | `position: fixed; inset: 0;` | ❌ No | ❌ None | ❌ No pan compensation |
| **Session Restore Screen** (`#sessionRestoreScreen`) | `position: fixed; inset: 0;` (L4455) | N/A (non-interactive loading) | ❌ None | N/A |

### 1.3 Key Architectural Deficiencies Identified
1. **The "Island" VisualViewport Implementation**: `cbWireKeyboardScrollLock()` (L17681–17755) is exclusively hardcoded to `#cbScreen` and `#cbUnifiedInput`. It handles the iOS Visual Viewport Pan bug (`translateY(vv.offsetTop)`) and tracks keyboard resize, but none of the other 4 rooms (Jumbled Jackpot, Jackpot Event, Spin & Win, Pattern Recall) benefit from this utility. In Jumbled Jackpot, focusing the answer input (`#jjAnswerInput`) on iOS Safari triggers visual viewport upward shifting, detaching the question bar and pushing the input behind the keyboard.
2. **Missing Landscape/Notch Horizontal Safe Areas in Cards Battle**: `#cbScreen.cb-fullscreen` (L1667) applies `padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom))`, completely discarding `env(safe-area-inset-left)` and `env(safe-area-inset-right)`. When an iPhone 14 Pro or Pixel 7 is held horizontally, the player columns and chat controls are clipped directly by the dynamic island / camera punch hole.
3. **Lack of Centralized Viewport Height Dispatcher**: No centralized `applyViewportHeight(el)` exists. Changes in viewport size (e.g. orientation flip, URL bar collapsing on scroll, or keyboard opening) require a single generalized observer rather than isolated game-specific event listeners.

---

## 2. Scroll Audit

### 2.1 Scroll Container Inventory

| Scroller Selector / Element | `overscroll-behavior` | `-webkit-overflow-scrolling` | Can Accidentally Trap Page Scroll? | Hidden Scrollbar Status | Layout Thrash on Scroll (`offsetTop`, etc.) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`#cbScores`** (`.cb-players-col`) | ❌ None (`auto`) | ❌ None | ⚠️ Yes (chains scroll to body when list ends) | Visible (6px track) | ✅ None |
| **`#cbFeed`** (`.cb-chat-col`) | ❌ None (`auto`) | ❌ None | ⚠️ Yes (rapid scrolling chains to body) | Visible (6px track) | ⚠️ Reads `feed.scrollTop` in scroll listener |
| **`.jp-pick-grid`** (Jackpot card selection) | ❌ None (`auto`) | ❌ None | ⚠️ Yes (nested inside room scroller) | Visible | ✅ None |
| **`.ch-list`** (Coin History modal) | ❌ None (`auto`) | ❌ None | ⚠️ Yes (nested inside modal; chains to page) | Visible | ✅ None |
| **`.sg-feed`** (Suggestions list) | ✅ `contain` | ✅ `touch` | ✅ Low risk | Visible | ✅ None |
| **`.dur-wheel`** (Duration wheel picker) | ❌ None (`auto`) | ✅ `touch` | ⚠️ Yes (fast flick scrolls page behind) | ✅ Hidden via `scrollbar-width: none` | ⚠️ Un-throttled scroll read of `wheel.scrollTop` |
| **`.lb-inline-list`** (Inline leaderboard) | ❌ None (`auto`) | ❌ None | ⚠️ Yes (max-height: 220px traps vertical swipe) | Styled (4px thumb) | ✅ None |
| **`.coll-set-tabs`** (Set tabs scroller) | ❌ None (`auto`) | ❌ None | ⚠️ Horizontal swipe can catch body scroll | ✅ Hidden via `::-webkit-scrollbar { display:none }` | 🔴 **High Thrash**: `updateArrows` reads `scrollWidth`, `clientWidth`, `scrollLeft` synchronously on scroll |
| **`.req-cards-strip`** (Card request strip) | ❌ None (`auto`) | ❌ None | ⚠️ Uncontained horizontal drag | ✅ Hidden | ✅ None |
| **`.el-answers-list`** (Event answers list) | ❌ None (`auto`) | ❌ None | ⚠️ Chains scroll | Visible | ✅ None |
| **`.gc-player-pick-list`** (Player select) | ❌ None (`auto`) | ❌ None | ⚠️ Nested inside admin panel | Visible | ✅ None |
| **`.modal-howto`** (How-to scroll modal) | ❌ None (`auto`) | ❌ None | ⚠️ Chains to body | Visible | ✅ None |
| **`body.spin-room-active #panel-spin`** | ✅ `contain` | ✅ `touch` | ⚠️ Can trap if wheel overflows | Visible | ✅ None |
| **`body.pr-room-active #panel-pr`** | ✅ `contain` | ✅ `touch` | ⚠️ Contained | Visible | ✅ None |
| **`.jj-screen.jj-fullscreen`** | ✅ `contain` | ✅ `touch` | ⚠️ Contained | Visible | ✅ None |

### 2.2 Deep Dive into Scroll Mechanics
1. **Layout Thrash in `initSetTabsScrollers()` (L11257–11261, L11297)**:
   ```javascript
   const updateArrows = () => {
     const maxScroll = track.scrollWidth - track.clientWidth; // Forced layout read!
     if (btnLeft) btnLeft.classList.toggle('is-hidden', maxScroll <= 2 || track.scrollLeft <= 2);
     if (btnRight) btnRight.classList.toggle('is-hidden', maxScroll <= 2 || track.scrollLeft >= maxScroll - 2);
   };
   track.addEventListener('scroll', updateArrows); // Attached with NO rAF throttling
   ```
   Every touch scroll tick invokes `track.scrollWidth` and `track.clientWidth`, recalculating box geometries mid-scroll and causing frame drops on mobile GPUs.
2. **Wheel Picker Overscroll & Snap Flaws (`.dur-wheel`) (L18272–18276)**:
   - CSS has `scroll-snap-type: y mandatory`, but lacks `scroll-snap-stop: always`. When users flick quickly on iOS/Android, momentum scrolling skips multiple snap points uncontrollably.
   - The scroll handler reads `wheel.scrollTop` without `requestAnimationFrame`.
   - `cdResettleWheel()` sets `wheel.scrollTop = idx * ROW_H` directly instead of using modern `scrollTo({ top, behavior: 'auto' })`.
3. **Background Body Scroll Leaks on Overlays**:
   When any `.overlay.show` is open, background elements on `<body>` remain scrollable. Moving a finger over any part of the modal backdrop drags the underlying page, leading to disorientation when the modal is closed. There is no `lockBodyScroll()` or `unlockBodyScroll()` implementation.

---

## 3. Touch UX & Accessibility Audit

### 3.1 Undersized Tap Targets (< 44×44px Apple Guideline)

| Component / Element | Selector | Measured Size / Padding | Issue |
| :--- | :--- | :--- | :--- |
| **Coin Chip History Trigger** | `#coinHistoryTrigger` / `.res-chip` | `padding: 2px 6px` | Height ~24px; tap frequently misses or activates parent |
| **Suggest Chip** | `#suggestChip` | `32×32px` (inline style L8449) | 12px below Apple's 44px standard |
| **Mute Sound Toggle** | `#muteBtn` | `32×32px` (inline style L8455) | 12px below Apple's 44px standard |
| **Close Announcement Banner** | `.gab-close` | `padding: 2px 4px`, font ~12px | Hit area < 20×20px |
| **Bottom Navigation Items** | `.bn-item` (7 items) | Width ~14vw (~45px on 320px screen), icon 18px | On screens < 500px, 7 items are cramped and hitboxes bleed into neighbors |
| **Spin Exit Button** | `.spin-exit-btn` | `padding: 6px 12px` (L1178) | Height ~26px |
| **Pattern Recall Exit Button** | `.pr-exit-btn` | `padding: 6px 12px` (L7669) | Height ~26px |
| **Cards Battle Exit/End Buttons** | `.cb-exit-btn`, `.cb-end-btn` | `padding: 6px 10px` | Height ~26px |
| **Cards Battle Timer Chips** | `.cb-timer-btn` | `padding: 5px 14px` | Height ~28px |
| **Jackpot Number Input** | `.jp-input-num` | `width: 20px` | Unusable tap target on touchscreens |
| **Set Scroll Arrows** | `.coll-set-scroll-btn` | `28×28px` | Small targets for switching sets |
| **Leaderboard Refresh Buttons** | `.lb-refresh-btn` | `28×28px` | Hard to tap without zooming |
| **How-To Info Buttons** | `.how-to-btn`, `.how-to-btn-flex` | `30×30px` to `32×32px` | Undersized round icons |
| **Suggestions Up/Down Vote** | `.sg-vote-btn` | `40×40px` | Borderline; fails 44px standard |
| **Admin Clear Selected Player** | `.gc-selected-clear` | `padding: 2px 6px` | ~18×18px hitbox |
| **Admin Player Remove Button** | `.ps-remove-btn` | `24×24px` | Destructive action with tiny target |

### 3.2 Hover-Only Feedback (Missing `:active` State)
The following 27 interactive rules implement `:hover` without a corresponding `:active` state, meaning mobile users receive zero visual touch feedback on tap:
1. `.topbar-profile:hover` (HUD profile trigger)
2. `.tab-btn:hover:not(.active)` (Navigation tabs)
3. `.card-wrap:not(.flipped):hover .card-inner` (Card flipping)
4. `.jj-back-btn:hover` (JJ room exit button)
5. `.jp-pick-card:hover` (Jackpot card selection)
6. `.ps-player-card:hover` (Player stats item)
7. `.ps-remove-btn:hover` (Player delete action)
8. `.ps-player-av.editable:hover`
9. `.ps-player-av.editable:hover .ps-av-edit-badge`
10. `.gc-selected-clear:hover`
11. `.admin-subnav-btn:hover:not(.active)`
12. `.gab-close:hover` (Banner dismiss)
13. `.social-member-card:hover`
14. `.coll-set-btn:hover:not(.active)`
15. `.coll-card.locked:hover`
16. `.coll-card.unlocked:hover`
17. `.admin-filter-btn:hover:not(.active)`
18. `.req-item:hover`
19. `.req-subitem:hover`
20. `.hud-pill.profile-pill:hover`
21. `.uid-copy-btn:hover`
22. `.coll-view-btn:hover:not(.active)`
23. `.shop-card:hover`
24. `.lb-refresh-btn:hover`
25. `.sg-edit-btn:hover`
26. `.sg-voters-btn:hover`
27. `.sg-comment-btn:hover`

### 3.3 Tap Highlight & Touch Action
- **`-webkit-tap-highlight-color: transparent;`**: Present globally on `*` (L45).
- **`touch-action: manipulation;`**: **Missing everywhere** except `.sg-vote-btn` (L7529). All standard buttons (`.btn`, `.bn-item`, `.spin-btn`, `.coll-set-btn`, room controls) lack `touch-action: manipulation`. On iOS Safari and Chrome mobile, this triggers double-tap-to-zoom heuristics and introduces 300ms gesture delays on interactive buttons.

---

## 4. Modal & Overlay Audit

### 4.1 Complete Inventory of Overlays (22 Total)

| Overlay ID | DOM Line | Purpose | Dismiss on Backdrop Tap? | Dismiss on Escape Key? | Scroll Lock on Body? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#lbViewOverlay` | L7226 | Leaderboard modal | ❌ No | ❌ No | ❌ No |
| `#howToOverlay` | L7236 | How-To Guide modal | ❌ No | ❌ No | ❌ No |
| `#coinHistoryOverlay` | L7416 | Coin History modal | ❌ No | ❌ No | ❌ No |
| `#sgVotersOverlay` | L7803 | Suggestions voters list | ❌ No | ❌ No | ❌ No |
| `#spinWinOverlay` | L8775 | Spin & Win prize modal | ❌ No | ❌ No | ❌ No |
| `#jackpotWinOverlay`| L8791 | Lottery win modal | ❌ No | ❌ No | ❌ No |
| `#prResultOverlay` | L8856 | Pattern Recall level/win | ❌ No | ❌ No | ❌ No |
| `#overlayPsPhoto` | L9935 | Player photo upload | ❌ No | ❌ No | ❌ No |
| `#overlayCardAction` | L9959 | Card trade/action | ❌ No | ❌ No | ❌ No |
| `#overlayReqSent` | L9977 | Request confirmation | ❌ No | ❌ No | ❌ No |
| `#overlayEditReq` | L9987 | Edit card request | ❌ No | ❌ No | ❌ No |
| `#overlayDeleteReq`| L10006| Delete card request | ❌ No | ❌ No | ❌ No |
| `#overlayEditJp` | L10017| Edit jackpot entry | ❌ No | ❌ No | ❌ No |
| `#overlayGameOver` | L10030| House of Cards game over| ❌ No | ❌ No | ❌ No |
| `#overlayBombWarning`| L10041| Bomb trap warning | ❌ No | ❌ No | ❌ No |
| `#overlayWin` | L10052| Level win modal | ❌ No | ❌ No | ❌ No |
| `#overlayCollect` | L10062| Card collection modal | ❌ No | ❌ No | ❌ No |
| `#coinGrantModal` | L18526| Admin coin grant popup | ❌ No | ❌ No | ❌ No |
| `#coinDeductModal` | L18549| Admin coin deduct popup | ❌ No | ❌ No | ❌ No |
| `#progressResetModal`| L18564| Progress reset popup | ❌ No | ❌ No | ❌ No |
| `#auraGrantModal` | L18577| Admin Aura grant popup | ❌ No | ❌ No | ❌ No |
| `#auraDeductModal` | L18596| Admin Aura deduct popup | ❌ No | ❌ No | ❌ No |

### 4.2 Overlay Analysis Findings
1. **Zero Backdrop Tap Handling**:
   In `index.html`, all modals are toggled strictly through `showOverlay(id)` / `closeOverlay(id)` (L10959–10960):
   ```javascript
   function showOverlay(id) { document.getElementById(id).classList.add('show'); }
   function closeOverlay(id) { document.getElementById(id).classList.remove('show'); }
   ```
   No click or touch event listener inspects `e.target === overlay` to trigger closure. A user tapping outside the dialog box receives no response, breaking standard mobile modal mental models.
2. **Zero Keyboard Accessibility / Escape Key**:
   Only one `keydown` listener exists in the entire file (L7037), and it strictly handles `e.key === 'Enter'` on the lobby form. Pressing `Escape` on an external keyboard or Android hardware back fails to dismiss active overlays.
3. **No Focus Trapping**:
   Opening a modal does not trap focus or restrict tab index; screen readers and keyboards can focus background controls while the overlay is visually active.

---

## 5. Layout-Shift & Dynamic Reflow Audit

### 5.1 Card Battle Winner Reveal (`#cbCard`)
- **Location**: L1531–1546 (CSS), L17441–17466 (JS).
- **Issue**: During normal gameplay, `#cbCard` contains short monospace text (`"W I Z A R D"` or `"— — —"`), styled with `min-height: 60px; font-size: clamp(1.15rem, 5vw, 1.6rem)`. When a round is solved, `cbRenderGame()` injects `🏆 [Avatar] Player won "CardName"!` and adds `.cb-winner` (`font-size: clamp(1rem, 4.2vw, 1.35rem)`).
- **Impact**: On phones (< 380px wide), the text wraps onto 2–3 lines, expanding `#cbCard`'s rendered height from 60px to 96px–112px. Because `.cb-question-bar` has `flex-shrink: 0`, this height increase violently pushes the `.cb-battle-grid` (chat and scores) down, causing a layout shift (CLS) right when users are attempting to read the chat or tap the input bar.
- **Fix**: Set a stable `min-height: 84px` (or calculate sufficient baseline padding) so the container doesn't reflow upon text insertion.

### 5.2 Toast Notifications (`showToast`)
- **Location**: L10513–10519.
- **Issue 1 (Timer Truncation)**: Timeout is hardcoded to `2600ms`. Longer messages (e.g. `🎉 Booked Golden Snitch #2! Your DA leader has been notified to deliver it in-game.` [84 chars]) vanish before mobile users can read them.
- **Issue 2 (Overlap Thrashing)**: Rapid successive toasts append new fixed elements at identical coordinates (`bottom: 24px; left: 50%`) without queueing or spacing, causing illegible text stacking.
- **Fix**: Dynamically calculate duration based on character count (`Math.max(2600, Math.min(6000, 1500 + msg.length * 60))`), and stack or replace active toasts.

### 5.3 Session Restore Flash (`#sessionRestoreScreen`)
- **Location**: CSS L4455, HTML L7220.
- **Issue**: `#sessionRestoreScreen` is styled with `display: flex; position: fixed; inset: 0; z-index: 99999;` in CSS and has **no inline `style="display:none"`**. On every page load, the session restore overlay is painted immediately. In `checkSession()` (L6998), if no session exists, it calls `sessionRestoreScreen.style.display = 'none'`.
- **Impact**: First-time visitors and logged-out users experience an unsightly flash of the loading screen on every initial render before the lobby appears.
- **Fix**: Set `style="display:none"` in HTML by default, and only display it synchronously if `localStorage.getItem('da_session')` is verified.

### 5.4 Global Announcement Banner (`#globalAnnounceBanner`)
- **Location**: CSS L2942–2954, HTML L8428.
- **Issue 1 (Perpetual CPU Load)**: Line 2952 applies `animation: pulseStreak 2s ease infinite;`. This forces continuous composite layer invalidations and battery drain on mobile devices.
- **Issue 2 (Layout Jolt)**: When an announcement is loaded from Firestore, `.global-announce-bar.show` flips from `display: none` to `display: flex` with zero height reservation, pushing the entire page content down abruptly.
- **Fix**: Convert `pulseStreak` to a one-shot entrance animation, and animate `max-height`/`opacity` smoothly or preserve entrance stability.

### 5.5 Inconsistent Empty States
Multiple screens render stark, unstyled, or inconsistent empty states that lack icons or clear calls to action:
- `#jjNoGames`, `#jpNoGames`, `#cbNoGames`: Plain text `<div class="cb-muted">No open rooms yet — create one!</div>` (missing graphic and CTA button).
- `.ch-empty`: Plain text `🪙 No coin activity yet — go play a game!` (missing CTA button to games).
- `.ps-empty`: Plain text `Tap Refresh to load player data` without structured icon or button.
- Unifying all empty states to a standardized `<div class="da-empty-state"><div class="empty-icon">...</div><p class="empty-desc">...</p><button class="btn btn-gold ...">...</button></div>` pattern will eliminate visual inconsistencies.

---

## 6. Functional & UI Anomalies Identified for Phases 2–5

### 6.1 Pattern Recall Reward Mismatch & HOW-TO Divergence
- **Configuration (L14398–14404)**:
  `PR_LEVELS` has test values: `{ reward: 1 }, { reward: 2 }, { reward: 3 }, { reward: 4 }, { reward: 5 }`.
- **Hardcoded Button (L14622)**:
  `collectBtn.textContent = isFinal ? '🪙 COLLECT 500 COINS & EXIT' : '🪙 COLLECT & EXIT';`
- **Contradiction**: Level 5 completion states "COLLECT 500 COINS", but actually credits only 5 coins to Firestore/HUD! Production rewards (30, 75, 150, 300, 500) must be restored, and the button label must dynamically bind to `cfg.reward`.
- **HOW-TO Guide (L7300–7307)**: States "Clear all 5 levels for the maximum 500 coins" but omits intermediate tier values (30/75/150/300/500).

### 6.2 Bottom Navigation Overcrowding (7 Items)
- **Current Structure (L8482–8507)**: Contains 7 items: Games, CDS, Social, Match (House of Cards), Collection, Profile, Admin.
- On mobile viewports under 500px, 7 columns compress each button to under 45px width with illegible text labels and overlapping touch hitboxes.
- **Required Consolidation**:
  1. Events (Cards Battle, JJ, JP, HOC)
  2. Games (Spin & Win, Pattern Recall)
  3. Collection (Cards, CDS, Requests)
  4. Social (Members, Leaderboard, Suggestions)
  5. Profile (Player details, settings, and locked Admin access row).

### 6.3 Missing `inputmode="numeric"` on Numeric/PIN Inputs
The following inputs require numeric entry but fail to trigger the native mobile numeric keypad:
- `#adminPinInput` (L9436): `type="password" maxlength="4"` (lacks `inputmode="numeric"` and `pattern="[0-9]*"`)
- `#gcCustomAmount` (L9751): `type="number"` (lacks `inputmode="numeric"`)
- `#gcAuraCustomAmount` (L9816): `type="number"` (lacks `inputmode="numeric"`)
- `#loginPin`, `#regPin`, `#regPin2`, `#resetNewPin`, `#resetNewPin2` in the lobby: already have `inputmode="numeric"`, but need `pattern="[0-9]*"` for older iOS Safari numeric keypad trigger.

### 6.4 Blocking Native `prompt()` in `psDeductCoins()`
- **Location**: L15714–15718:
  ```javascript
  function psDeductCoins(pid, name) {
    const amtStr = prompt(`Deduct coins from ${name} (${pid}).\nHow many coins to deduct?`, '50');
    ...
  }
  ```
- **Issue**: Synchronous `window.prompt()` halts UI execution, breaks out of PWA standalone fullscreen aesthetic, and frequently glitches on iOS Safari PWA mode. Must be replaced with an in-app themed glass modal.

### 6.5 Android Back Button Navigation Trap
- When a user enters Spin & Win, Pattern Recall, Cards Battle, Jumbled Jackpot, or Jackpot Event, no `history.pushState()` entry is created.
- When an Android user taps the physical or gesture Back button, the browser navigates away from the PWA entirely instead of gracefully exiting the active game room.
- Implementing `history.pushState({ room: activeRoom }, '')` and a `window.addEventListener('popstate', ...)` handler will provide standard native Android back-navigation.

### 6.6 CSS Keyframe Redundancies
- `@keyframes popIn`: Defined twice (L65 and L762). L762 silently overwrites L65 with differing rotate transforms.
- `@keyframes pulse`: Used at L4467 (`#sessionRestoreScreen .sr-icon`), but not declared until L4695.

---

## 7. Next Steps & Phase Progression

With Phase 1 complete, the codebase has been thoroughly mapped without modifying any source files. Upon your approval, we will proceed systematically through:

1. **Phase 2**: Implement centralized `applyViewportHeight()`, wire `visualViewport` resize/scroll + iOS `translateY` offset pan compensation across all 5 rooms, and verify safe-area insets.
2. **Phase 3**: Add `overscroll-behavior: contain` and momentum scrolling to all 17 containers, throttle scroll listeners via `rAF`, add `scroll-snap-stop: always` to `.dur-wheel`, and implement `lockBodyScroll()` / `unlockBodyScroll()` for overlays.
3. **Phase 4**: Fix Critical, High, Medium, and Polish UI/UX issues (PR rewards, 5-tab bottom nav, backdrop dismissal, numeric inputs, themed prompt modal, Android Back button, session restore flash, keyframe cleanup, empty states, card rarity signals, and toast duration scaling).
4. **Phase 5**: Touch target expansion (≥ 44×44px) and accessibility pass.
5. **Phase 6**: Verification and documentation (`CHANGELOG.md`).

Awaiting your approval to proceed to Phase 2.

