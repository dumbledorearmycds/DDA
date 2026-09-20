# Pattern Recall UI Redesign — Specification Document

**Topic:** Pattern Recall Mini-Game Room UI Redesign  
**Date:** 2026-09-20  
**Status:** Validated Design Spec  
**Target File:** `index.html`  

---

## 1. Executive Summary

Redesign the user interface of the **Pattern Recall** memory mini-game in `index.html` to deliver a premium, tactile, high-performance mobile arcade experience based on the customized **Option A (Arcade Obsidian & Champagne Gold)** direction generated and refined via Stitch MCP. 

### Core Requirements:
1. **Design System Harmony**: Leverage DA Hub's obsidian canvas (`#090614`), warm champagne gold (`#F5C542`), and amethyst accents.
2. **Linear Animated Countdown Timer**: Replace the circular timer with a sleek, high-visibility linear timer bar with glowing progress fill and a digital seconds readout (`3.0s` / `10.0s`).
3. **Card Tile Symbols**: Completely eliminate the brain icon (`🧠`) from all card faces. The revealed target tiles use a luminous golden star/rune emblem (`⭐` / `★`) with warm gold aura glow and 3D flip physics.
4. **Game Logic Integrity (100% Untouched)**:
   - Level progression (`PR_LEVELS` array with 10 levels, 4 to 13 reveal counts, 3.0s down to 1.75s memory duration, 10.0s answer time).
   - Coin reward pipeline (`coins += amount`, `logCoinTx`, `updateHUD`, `saveProgress`).
   - Daily cooldown tracking (`hasPlayedToday(CD_KEY_PR)`, `checkPrCooldown`).
   - Audio triggers (`SFX.click`, `SFX.flip`, `SFX.win`, `SFX.bomb`, `SFX.coin`, `SFX.gameOver`).
   - Confetti triggers (`spawnConfetti`).
   - Viewport synchronization for mobile Safari/Chrome (`applyViewportHeight`, `clearViewportHeight`).

---

## 2. Visual Theme & CSS Token Architecture

### 2.1 Color & Surface Palette
- **Canvas Backdrop**: `radial-gradient(circle at 50% -10%, #201540 0%, #090614 60%, #05030c 100%)`
- **Surface Cards & Headers**: Deep obsidian glass (`#130e26` / `#140e28`), subtle 1px champagne border (`rgba(245, 197, 66, 0.28)`), and top highlight lip.
- **Gold Accents**:
  - Primary: `#F5C542`
  - Deep / Border: `#C6951A`
  - Shimmer: `#FFE082`
- **Semantic Feedback States**:
  - **Tile Hidden / Back**: Deep obsidian violet gradient (`linear-gradient(145deg, #241a4a, #130e26)`), border `2px solid rgba(192, 132, 252, 0.35)`, 3D bottom drop-shadow `0 5px 0 #0d091d`.
  - **Tile Front (Revealed Target)**: Radiant gold gradient (`linear-gradient(145deg, #F5C542, #b45309)`), border `2px solid #FDE047`, drop-shadow `0 0 18px rgba(245, 197, 66, 0.65), 0 5px 0 #78350f`, star emblem `⭐`.
  - **Tile Selected (Player Pick)**: Luminous neon cyan (`linear-gradient(145deg, #00f2fe, #0891b2)`), border `2px solid #67e8f9`, drop-shadow `0 0 16px rgba(0, 242, 254, 0.6), 0 5px 0 #0e7490`, checkmark `✓`.
  - **Tile Correct Confirmation**: Emerald shimmer (`linear-gradient(145deg, #34d399, #059669)`), border `2px solid #6ee7b7`.
  - **Tile Missed / Wrong**: Ruby crimson (`linear-gradient(145deg, #ef4444, #991b1b)`), border `2px solid #fca5a5`, with grid shake keyframes.

---

## 3. Component Hierarchy & DOM Structure

### 3.1 Room Header (`.pr-topbar`)
- Left: Arcade title pill with `🧠` badge, **`PATTERN RECALL`** in bold gold lettering, and `DA HUB ARCADE` subtitle.
- Right:
  - Frosted help button `❓` triggering `showHowTo('pr')`.
  - Floating high-contrast frosted ruby exit pill `✕ Exit` triggering `prExit()`.

### 3.2 Start Screen (`#prStartScreen`)
- Floating animated 3D brain / arcade icon with ambient glowing halo.
- Title and subtitle: *\"Remember the pattern. Find the hidden tiles.\"*
- Tactile stat chips: `5 LEVELS` and `MAX REWARD 🪙 500`.
- Daily cooldown banner (`#prCooldownBanner`).
- 3D tactile **START GAME** button with bottom drop shadow lip.

### 3.3 In-Game HUD & Linear Timer (`#prGameScreen`)
- **Status Row (`.pr-status-row`)**:
  - Left: Stage badge (`#prStatusLevel`, e.g. `LEVEL 1`).
  - Right: Reward badge (`#prStatusReward`, e.g. `🪙 30`).
- **Instruction Banner (`#prInstruction`)**:
  - Memory Phase: *\"Memorize the pattern…\"*
  - Recall Phase: *\"REMEMBER THE PATTERN — Select X tiles (10s!)\"*
- **Linear Timer Widget (`#prTimerWrap`)**:
  - Top telemetry line: `⏳ TIME REMAINING` label on the left, `#prTimerNum` (e.g. `3.0s`) on the right in high-visibility tabular font.
  - Linear progress track: Sleek rounded pill bar with inner shadow.
  - Progress fill: `#prTimerBar` with width dynamically set to `pct + '%'` and animated linear-gradient fill.

### 3.4 Tactile Memory Tile Grid (`#prGrid`)
- Preserves CSS grid layout dynamic column counts (`repeat(cfg.cols, 1fr)`).
- 3D perspective flip cards (`preserve-3d`, `rotateY(180deg)`).
- Back face: `pr-tile-back` with etched `❓` rune.
- Front face: `pr-tile-front` with radiant `⭐` star rune (no brain icon).
- Selected face: Cyan neon fill with `✓`.

### 3.5 Primary Action Button (`#prSubmitBtn`)
- Wide ergonomic push button in champagne gold gradient with 3D mechanical press physics (`box-shadow: 0 5px 0 #92400e`).
- Disabled state: Gracefully dimmed glass with smooth transitions.

### 3.6 Result Overlays (`#prResultOverlay`)
- Backdrop blur modal (`pr-result-modal`).
- Floating victory/defeat icon (`#prResultIcon`: `✅`, `🏆`, `💀`).
- Title, subtitle, and prominent coin counter (`#prResultReward`).
- Action buttons (`NEXT LEVEL →`, `COLLECT COINS & EXIT`, `TRY AGAIN`, `EXIT`).

---

## 4. Game Logic & State Safety

1. **DOM IDs & Classes Maintained**:
   - `#panel-pr`, `pr-room-active`, `pr-wrap`, `pr-topbar`, `prExitBtn`
   - `#prStartScreen`, `#prStartBtn`, `#prCooldownBanner`, `#prCooldownTimer`
   - `#prGameScreen`, `#prStatusLevel`, `#prStatusReward`, `#prInstruction`
   - `#prTimerWrap`, `#prTimerNum`, `#prGrid`, `#prSubmitBtn`
   - `#prResultOverlay`, `#prResultIcon`, `#prResultTitle`, `#prResultSub`, `#prResultReward`, `#prResultBtns`
2. **Timer Adaptation**:
   - `prRunMemoryTimer` and `prRunAnswerTimer` will update both `#prTimerNum` (text content) and `#prTimerBar` (width percentage `pct.toFixed(1) + '%'`), maintaining full compatibility with the existing interval loop.
3. **Card Face Update**:
   - `prBuildGrid` will render `'<div class="pr-tile-face pr-tile-front">&#11088;</div>'` (⭐ U+2B50) instead of `&#129504;` (🧠), fulfilling the user's explicit requirement.

---

## 5. Verification Plan

### Tooling: Chrome DevTools MCP (`ServerName: "chrome-devtools-mcp"`)
1. **Launch Local Server**:
   - Ensure local dev server is active or serve `index.html`.
2. **Page Navigation & Selection**:
   - Navigate to the page using `navigate_page`.
3. **Start Screen Inspection**:
   - Switch to Mini-Games tab and open Pattern Recall (`prOpen()`).
   - Take screenshot of start screen.
4. **Gameplay Verification**:
   - Click "START GAME" (`prStartGame()`).
   - Verify linear timer smoothly counts down during memory phase.
   - Verify revealed cards display radiant star (`⭐`) instead of brain icon (`🧠`).
   - Verify recall phase initiates at 10.0s.
   - Click required number of tiles, verify glowing cyan selection.
   - Click "SUBMIT ANSWER" and verify level completion modal.
5. **Exit Verification**:
   - Click "COLLECT COINS & EXIT", verify coins HUD increment and clean return to Mini-Games hub.
