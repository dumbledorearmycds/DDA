# Pattern Recall UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the UI of the Pattern Recall memory mini-game in `index.html` to an Arcade Obsidian & Champagne Gold aesthetic with a linear countdown timer and radiant star rune cards, preserving 100% of game logic.

**Architecture:** Update the CSS styling in `index.html` (lines ~15738–16167), refine the DOM structure for linear progress bar in `#panel-pr` (lines ~18151–18255), update `prBuildGrid` to use star emoji `⭐` instead of brain emoji `🧠`, update the timer loop to drive `#prTimerBar` width percentage, and verify complete flow via `chrome-devtools-mcp`.

**Tech Stack:** Vanilla HTML5, CSS3 (3D transforms, linear gradients, backdrop-filter, flex/grid), Vanilla JavaScript (DOM manipulation, visualViewport synchronization), Chrome DevTools MCP.

---

### Task 1: CSS Redesign for Pattern Recall

**Files:**
- Modify: `index.html:15738-16167`

- [ ] **Step 1: Write the updated CSS rules for Pattern Recall**

In `index.html`, replace the existing CSS block for Pattern Recall (from `/* PATTERN RECALL — fullscreen room */` to the end of that section before `#sgVotersOverlay`) with:
- Obsidian dark canvas with ambient radial gradient:
  ```css
  body.pr-room-active #panel-pr.active {
    position: fixed;
    inset: 0;
    z-index: 600;
    margin: 0;
    max-width: 100%;
    width: 100%;
    height: 100%;
    height: 100dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding-left: max(12px, env(safe-area-inset-left));
    padding-right: max(12px, env(safe-area-inset-right));
    padding-top: max(8px, env(safe-area-inset-top));
    padding-bottom: max(14px, env(safe-area-inset-bottom));
    box-sizing: border-box;
    background: radial-gradient(
      circle at 50% -10%,
      #221644 0%,
      #0e0a20 50%,
      #080512 100%
    );
  }
  ```
- Frosted high-contrast ✕ Exit pill (`.pr-exit-btn`) with red/gold accents and active haptic scale.
- Arcade header styling with glowing gold badge.
- Start screen redesign with pulsing floating emblem, frosted stat chips, and 3D arcade Start button.
- In-game HUD status row (`.pr-status-row`) with Stage pill and Pot reward card.
- Sleek Linear Timer (`.pr-timer-wrap`, `.pr-timer-header`, `.pr-timer-track`, `.pr-timer-bar`, `.pr-timer-num`):
  ```css
  .pr-timer-wrap {
    display: flex;
    flex-direction: column;
    background: rgba(18, 12, 38, 0.75);
    border: 1px solid rgba(245, 197, 66, 0.22);
    border-radius: 14px;
    padding: 10px 14px;
    margin-bottom: 14px;
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
  }
  .pr-timer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 7px;
  }
  .pr-timer-title {
    font-size: 0.72rem;
    font-weight: 800;
    color: #cbd5e1;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pr-timer-num {
    font-family: 'Fredoka One', monospace, sans-serif;
    font-size: 0.92rem;
    font-weight: 900;
    color: var(--gold, #F5C542);
    letter-spacing: 0.5px;
  }
  .pr-timer-track {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
  }
  .pr-timer-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #F5C542 0%, #f59e0b 60%, #eab308 100%);
    border-radius: 999px;
    box-shadow: 0 0 12px rgba(245, 197, 66, 0.7);
    transition: width 0.08s linear;
  }
  ```
- 3D tactile memory tile grid (`.pr-grid`, `.pr-tile`, `.pr-tile-face`, `.pr-tile-back`, `.pr-tile-front`):
  - `.pr-tile-back`: Deep obsidian violet gradient, `2px solid rgba(192, 132, 252, 0.35)`, 3D bottom drop shadow `0 5px 0 #0d091d, 0 8px 14px rgba(0,0,0,0.5)`, font size `1.3rem`.
  - `.pr-tile-front`: Radiant champagne gold gradient (`#F5C542` to `#b45309`), `2px solid #FDE047`, drop shadow `0 0 18px rgba(245,197,66,0.65), 0 5px 0 #78350f`, font size `1.6rem`.
  - `.pr-tile.selected .pr-tile-back`: Neon cyan gradient (`#00f2fe` to `#0891b2`), border `2px solid #67e8f9`, drop shadow `0 0 16px rgba(0,242,254,0.6), 0 5px 0 #0e7490`.
  - `.pr-tile.reveal-correct .pr-tile-back`: Emerald green gradient (`#34d399` to `#059669`), border `2px solid #6ee7b7`.
  - `.pr-tile.reveal-missed .pr-tile-back`: Ruby red gradient (`#ef4444` to `#991b1b`), border `2px solid #fca5a5`.
- Primary CTA submit button (`.pr-submit-btn`):
  - 3D arcade push button in champagne gold gradient with bottom lip `box-shadow: 0 5px 0 #92400e`.
- Modal result overlay (`.pr-result-overlay`, `.pr-result-modal`):
  - Glassmorphic popup with backdrop blur (`16px`), floating victory icon, prominent coin reward counter, and 3D action buttons.

- [ ] **Step 2: Apply CSS changes to index.html**

Use `replace_file_content` to apply the updated CSS block into `index.html`.

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: true`: commit changes.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 2: HTML Structure Update for Linear Timer in `#panel-pr`

**Files:**
- Modify: `index.html:18151-18255`

- [ ] **Step 1: Inspect and prepare the DOM structure for `#panel-pr`**

Ensure that:
1. `#prStartScreen` has the refreshed title, subtitle, stat chips (`5 LEVELS`, `MAX REWARD 🪙 500`), daily cooldown banner (`#prCooldownBanner`), and `#prStartBtn`.
2. `#prGameScreen` contains:
   - `#prStatusLevel` & `#prStatusReward` inside `.pr-status-row`.
   - `#prInstruction` text banner.
   - `#prTimerWrap` updated to the linear timer structure:
     ```html
     <div class="pr-timer-wrap" id="prTimerWrap" style="display: none">
       <div class="pr-timer-header">
         <span class="pr-timer-title"><span>⏳</span> Time Remaining</span>
         <span class="pr-timer-num" id="prTimerNum">3.0s</span>
       </div>
       <div class="pr-timer-track">
         <div class="pr-timer-bar" id="prTimerBar" style="width: 100%"></div>
       </div>
     </div>
     ```
   - `#prGrid` grid container.
   - `#prSubmitBtn` button.
3. `#prResultOverlay` contains `#prResultIcon`, `#prResultTitle`, `#prResultSub`, `#prResultReward`, and `#prResultBtns`.

- [ ] **Step 2: Apply HTML changes to index.html**

Use `replace_file_content` to update `#panel-pr` in `index.html`.

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: true`: commit changes.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 3: JavaScript Adaptation for Linear Timer & Star Card Icon

**Files:**
- Modify: `index.html:29513-29640`

- [ ] **Step 1: Update `prBuildGrid` to use Star Symbol instead of Brain**

In `prBuildGrid(cfg)`:
Change:
```javascript
'<div class="pr-tile-face pr-tile-back">&#10068;</div>' +
'<div class="pr-tile-face pr-tile-front">&#129504;</div>' +
```
to:
```javascript
'<div class="pr-tile-face pr-tile-back">&#10068;</div>' +
'<div class="pr-tile-face pr-tile-front">&#11088;</div>' +
```
`&#11088;` is the glowing golden star `⭐` (U+2B50), replacing the brain emoji on all card faces as requested.

- [ ] **Step 2: Update `prRunMemoryTimer` and `prRunAnswerTimer` to drive `#prTimerBar`**

In `prRunMemoryTimer(durationMs)`:
```javascript
function prRunMemoryTimer(durationMs) {
  const timerWrap = document.getElementById("prTimerWrap");
  const barEl = document.getElementById("prTimerBar");
  const numEl = document.getElementById("prTimerNum");
  timerWrap.style.display = "flex";
  if (barEl) barEl.style.width = "100%";
  const start = Date.now();
  prClearTimer();
  prTimerHandle = setInterval(() => {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, durationMs - elapsed);
    const pct = (remaining / durationMs) * 100;
    if (barEl) barEl.style.width = pct.toFixed(1) + "%";
    if (numEl) numEl.textContent = (remaining / 1000).toFixed(1) + "s";
    if (remaining <= 0) {
      prClearTimer();
      timerWrap.style.display = "none";
      prEndMemoryPhase();
    }
  }, 50);
}
```

In `prRunAnswerTimer(durationMs)`:
```javascript
function prRunAnswerTimer(durationMs) {
  const timerWrap = document.getElementById("prTimerWrap");
  const barEl = document.getElementById("prTimerBar");
  const numEl = document.getElementById("prTimerNum");
  timerWrap.style.display = "flex";
  if (barEl) barEl.style.width = "100%";
  const start = Date.now();
  prClearTimer();
  prTimerHandle = setInterval(() => {
    if (prState.phase !== "recall") {
      prClearTimer();
      return;
    }
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, durationMs - elapsed);
    const pct = (remaining / durationMs) * 100;
    if (barEl) barEl.style.width = pct.toFixed(1) + "%";
    if (numEl) numEl.textContent = (remaining / 1000).toFixed(1) + "s";
    if (remaining <= 0) {
      prClearTimer();
      timerWrap.style.display = "none";
      prAnswerTimeUp();
    }
  }, 50);
}
```

- [ ] **Step 3: Verify all other game functions remain untouched**

Verify that:
- `prOpen`, `prExit`, `prStartGame`, `prStartLevel`
- `prTileClick`, `prSubmitAnswer`, `prWrongAnswer`, `prLevelComplete`, `prNextLevel`, `prCollectAndExit`, `prGameOver`, `prTryAgain`, `prEndSession`
remain completely intact with zero change to coin payouts, level definitions, sound effects, or cooldown mechanics.

- [ ] **Step 4: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: true`: commit changes.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 4: Browser Testing & Verification with Chrome DevTools MCP

**Tools:**
- Chrome DevTools MCP (`call_mcp_tool` with `ServerName: "chrome-devtools-mcp"`)

- [ ] **Step 1: Verify web server is running and navigate to page**
  - Use `list_pages` or `new_page` / `navigate_page` to open the local web app in Chrome DevTools.
- [ ] **Step 2: Navigate to Pattern Recall game room**
  - Execute script via `evaluate_script` to open Pattern Recall (`prOpen()`).
  - Capture screenshot with `take_screenshot` to verify Start Screen UI.
- [ ] **Step 3: Trigger game start and test memory phase**
  - Execute `prStartGame()` or click `#prStartBtn`.
  - Capture screenshot during memory phase:
    - Verify linear timer bar is counting down smoothly.
    - Verify cards reveal golden star (`⭐`) instead of brain icon (`🧠`).
- [ ] **Step 4: Test recall phase and tile selection**
  - Wait for memory phase to finish (recall phase starts).
  - Verify linear timer resets to 10.0s countdown.
  - Click tiles via script or click tool; verify glowing neon cyan selected states.
  - Verify `#prSubmitBtn` becomes enabled when target count is selected.
- [ ] **Step 5: Test submission & result modal**
  - Click `#prSubmitBtn`.
  - Verify result overlay appears with proper styling, coin counter, and action buttons.
  - Click "COLLECT COINS & EXIT" and verify clean return to Mini-Games hub.
  - Capture screenshot of completed verification.
