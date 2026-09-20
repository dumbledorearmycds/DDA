# Sync CDS and Collection Card Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize card requests between CDS and Collection so that a requested card is reflected across both panels, can only be requested once, can be cancelled with coin refunds if requested via Collection, and updates both grids reactively.

**Architecture:** A centralized `getPendingCardRequest(setIdx, cardIdx)` helper acts as the single source of truth for pending card requests. `hydrateCollGridHoles` and `hydrateCdsGridHoles` use this helper to render distinct chips (`📬 Requested (CDS)` vs `📬 Requested (Coll)`). In CDS browse, clicking a Collection-requested card triggers the delete/refund confirmation modal, while clicking a CDS-requested card cancels it immediately. All request state mutations immediately re-render both grids, quotas, and badges.

**Tech Stack:** Vanilla JavaScript, HTML5, CSS3, Node.js (test runner), Python (`clean_check.py` syntax validator), Chrome DevTools MCP.

---

### Task 1: Automated Test Suite for CDS & Collection Sync

**Files:**
- Create: `tests/test_sync_cds_coll_requests.js`

- [ ] **Step 1: Write the failing unit and integration test**

```javascript
// tests/test_sync_cds_coll_requests.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing CDS and Collection Request Sync...');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Verify helper and critical code snippets exist in index.html
assert(html.includes('function getPendingCardRequest'), 'getPendingCardRequest function should be defined');
assert(html.includes('📬 Requested (CDS)'), 'Coll grid should show 📬 Requested (CDS)');
assert(html.includes('📬 Requested (Coll)'), 'CDS grid should show 📬 Requested (Coll)');

// Mock simulation of state and helper behavior
const profile = { name: "TestPlayer", town: "TestTown", avatar: "🧙", photoURL: "" };
let currentPlayerId = "player-123";
global.window = { _currentPlayerId: currentPlayerId };
const cardRequests = [];

function getPendingCardRequest(setIdx, cardIdx) {
  const pid = global.window._currentPlayerId || "";
  const name = profile && profile.name;
  const req = cardRequests.find(
    (r) =>
      r.setIdx === setIdx &&
      r.cardIdx === cardIdx &&
      r.status === "pending" &&
      ((pid && r.playerId === pid) || (!pid && r.playerName === name))
  );
  if (!req) return null;
  const isCds = req.source ? req.source === "cds" : !!req.free;
  return { request: req, isCds, isColl: !isCds };
}

// 1. Initially no pending requests
assert.strictEqual(getPendingCardRequest(0, 1), null, 'Should be null when no request exists');

// 2. Request placed via Collection
cardRequests.push({
  id: "req-coll-1",
  playerId: "player-123",
  playerName: "TestPlayer",
  setIdx: 0,
  cardIdx: 1,
  status: "pending",
  coinsSpent: 100,
  source: "collection",
  free: false
});

let pending = getPendingCardRequest(0, 1);
assert(pending !== null, 'Should find request');
assert.strictEqual(pending.isColl, true, 'Should be flagged as Collection request');
assert.strictEqual(pending.isCds, false, 'Should not be CDS request');

// 3. Request placed via CDS
cardRequests.push({
  id: "req-cds-2",
  playerId: "player-123",
  playerName: "TestPlayer",
  setIdx: 1,
  cardIdx: 2,
  status: "pending",
  coinsSpent: 0,
  source: "cds",
  free: true
});

pending = getPendingCardRequest(1, 2);
assert(pending !== null, 'Should find CDS request');
assert.strictEqual(pending.isCds, true, 'Should be flagged as CDS request');
assert.strictEqual(pending.isColl, false, 'Should not be Collection request');

console.log('✅ All Sync CDS & Collection tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sync_cds_coll_requests.js`
Expected: FAIL with `AssertionError: getPendingCardRequest function should be defined`

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 2: Implement `getPendingCardRequest` and Update Collection Grid & Modal

**Files:**
- Modify: `index.html` (around lines 24750–24850 and 26270–26460)

- [ ] **Step 1: Add `getPendingCardRequest(setIdx, cardIdx)` helper to `index.html`**

Place right before `hydrateCollGridHoles`:
```javascript
        function getPendingCardRequest(setIdx, cardIdx) {
          const pid = window._currentPlayerId || "";
          const name = profile && profile.name;
          const req = cardRequests.find(
            (r) =>
              r.setIdx === setIdx &&
              r.cardIdx === cardIdx &&
              r.status === "pending" &&
              ((pid && r.playerId === pid) || (!pid && r.playerName === name)),
          );
          if (!req) return null;
          const isCds = req.source ? req.source === "cds" : !!req.free;
          return { request: req, isCds, isColl: !isCds };
        }
```

- [ ] **Step 2: Update `hydrateCollGridHoles` in `index.html`**

Replace old `alreadyRequested` check with `getPendingCardRequest`:
```javascript
            const pendingReq = getPendingCardRequest(setIdx, ci);
            const alreadyRequested = !!pendingReq;

            div.classList.toggle("unlocked", isOwned);
            div.classList.toggle("locked", !isOwned);
            div.classList.toggle("is-new", isNew);
            div.classList.toggle("has-dupes", dupes > 0);
            div.classList.toggle("is-gold", isGold);
            div.classList.toggle("requested", alreadyRequested);
```
And inside `const reqHole = div.querySelector(".card-req-hole");`:
```javascript
            if (reqHole) {
              if (alreadyRequested) {
                const label = pendingReq && pendingReq.isCds ? "📬 Requested (CDS)" : "📬 Requested";
                reqHole.innerHTML = `<div class="card-action-chip chip-pending">${label}</div>`;
              } else if (isOwned) {
                reqHole.innerHTML = dupes > 0
                  ? '<div class="card-action-chip chip-owned">Tradeable</div>'
                  : '<div class="card-action-chip chip-owned">✅ In Deck</div>';
              } else {
                reqHole.innerHTML = `<div class="card-action-chip chip-req">🪙 ${reqCost} Request</div>`;
              }
            }
```

- [ ] **Step 3: Update `openCardActionModal` and `caSubmitRequest` in `index.html`**

In `openCardActionModal(sIdx, cIdx)`:
```javascript
          const pendingReq = getPendingCardRequest(sIdx, cIdx);
          const alreadyRequested = !!pendingReq;
```
When `alreadyRequested`:
```javascript
          if (alreadyRequested) {
            reqBtn.textContent = "📬 Already Requested";
            reqBtn.disabled = true;
            reqBtn.style.opacity = ".6";
            reqBtn.style.cursor = "default";
            statusMsg.textContent = pendingReq && pendingReq.isCds
              ? 'You already have a pending request for this card from CDS — check "My CDS Requests" for status.'
              : 'You already have a pending request for this card — check "My Requests" for status.';
          }
```
In `caSubmitRequest()`:
```javascript
          const pendingReq = getPendingCardRequest(setIdx, cardIdx);
          if (pendingReq) {
            showToast(
              pendingReq.isCds
                ? "📬 You already have a pending CDS request for this card!"
                : "📬 You already have a pending request for this card!"
            );
            return;
          }
```
And in `caSubmitRequest()` after creating request:
```javascript
          renderCollGrid(); // refresh to show requested state
          if (typeof renderCdsGrid === "function") renderCdsGrid();
          updateCollStats(); // update "X of Y requests left" counter immediately
          if (typeof updateCdsFreeCounter === "function") updateCdsFreeCounter();
          updateProfileStats();
          refreshMyReqPill();
          if (typeof refreshCdsReqPill === "function") refreshCdsReqPill();
```

- [ ] **Step 4: Verify syntax**

Run: `python clean_check.py`
Expected: `ALL SCRIPTS VALIDATED CLEAN! ✅`

- [ ] **Step 5: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 3: Update CDS Grid Hydration, Tap Interaction & Cancellation in `index.html`

**Files:**
- Modify: `index.html` (around lines 25260–25495 and 25935–26075)

- [ ] **Step 1: Update `hydrateCdsGridHoles` in `index.html`**

Replace old `pendingFreeReq` check with:
```javascript
            const pendingReq = getPendingCardRequest(setIdx, ci);
            const isRequested = !!pendingReq;

            div.classList.toggle("unlocked", isOwned);
            div.classList.toggle("locked", !isOwned);
            div.classList.toggle("requested", isRequested);
            div.classList.toggle("is-gold", isGold);
```
And update `reqHole` rendering:
```javascript
            const reqHole = div.querySelector(".card-req-hole");
            if (reqHole) {
              if (isRequested) {
                const label = pendingReq && pendingReq.isColl ? "📬 Requested (Coll)" : "📬 Requested";
                reqHole.innerHTML =
                  `<div class="card-action-chip chip-pending">${label}</div>`;
              } else if (isGold) {
                const remaining = Math.max(
                  0,
                  CDS_GOLD_FREE_LIMIT - goldUsedToday,
                );
                reqHole.innerHTML = `<div class="card-action-chip chip-req">🌟 ${remaining}/${CDS_GOLD_FREE_LIMIT} Gold</div>`;
              } else if (isOwned) {
                reqHole.innerHTML =
                  '<div class="card-action-chip chip-owned">✅ In Deck</div>';
              } else {
                reqHole.innerHTML =
                  '<div class="card-action-chip chip-free">🎁 Request Free</div>';
              }
            }

            div.title = isRequested
              ? (pendingReq && pendingReq.isColl
                  ? "Requested via Collection • Tap to cancel and refund coins"
                  : "Tap to cancel this request")
              : isGold
                ? goldLimitReached
                  ? `🌟 You've used your ${CDS_GOLD_FREE_LIMIT} free gold requests today.`
                  : `🌟 Gold card — counts toward both your free limit and your ${CDS_GOLD_FREE_LIMIT}-per-day gold limit.`
                : "Tap to request this card free";
```

- [ ] **Step 2: Update CDS click listener in `renderCdsGrid`**

```javascript
          if (!_cdsGridDelegated) {
            grid.addEventListener("click", (e) => {
              const card = e.target.closest(".coll-card[data-ci]");
              if (!card) return;
              const ci = parseInt(card.dataset.ci, 10);
              if (isNaN(ci)) return;
              const set = SETS[cdsSetIdx];
              if (!set || !set.cards[ci]) return;
              const isGold = !!set.cards[ci].gold;

              const pendingReq = getPendingCardRequest(cdsSetIdx, ci);

              // If requested via Collection, prompt to cancel with refund
              if (pendingReq && pendingReq.isColl) {
                openDeleteRequest(pendingReq.request.id);
                return;
              }

              const isPendingCds = pendingReq && pendingReq.isCds;
              const goldUsedToday = cdsGoldFreeRequestsToday();
              const goldLimitReached =
                isGold && goldUsedToday >= CDS_GOLD_FREE_LIMIT;

              if (isGold && goldLimitReached && !isPendingCds) {
                showToast(
                  `🌟 You've already used your ${CDS_GOLD_FREE_LIMIT} free gold-card requests today!`,
                );
                return;
              }
              cdsToggleRequest(cdsSetIdx, ci);
            });
            _cdsGridDelegated = true;
          }
```

- [ ] **Step 3: Update `cdsToggleRequest` and cross-grid calls**

In `cdsToggleRequest(setIdx, cardIdx)`:
```javascript
          const pendingReq = getPendingCardRequest(setIdx, cardIdx);
          if (pendingReq && pendingReq.isColl) {
            openDeleteRequest(pendingReq.request.id);
            return;
          }
```
When cancelling a CDS request:
```javascript
            renderCdsGrid();
            renderCollGrid();
            updateCdsFreeCounter();
            updateCollStats();
            refreshMyReqPill();
            refreshCdsReqPill();
            if (cdsView === "requests") renderMyCdsRequests();
            if (collView === "requests") renderMyRequests();
```
When placing a CDS request:
```javascript
          renderCdsGrid();
          renderCollGrid();
          updateCdsFreeCounter();
          updateCollStats();
          refreshMyReqPill();
          refreshCdsReqPill();
          if (cdsView === "requests") renderMyCdsRequests();
          if (collView === "requests") renderMyRequests();
```

- [ ] **Step 4: Update `openDeleteRequest` and `confirmDeleteRequest` in `index.html`**

In `openDeleteRequest(reqId)`:
```javascript
          const refundNote = req.status === "pending" && req.coinsSpent > 0
            ? `<br><small style="opacity:.85; color:var(--gold)">🪙 ${req.coinsSpent} coins will be refunded to your balance.</small>`
            : (req.status === "pending" ? '<br><small style="opacity:.7">Your DA leader won\'t see it anymore.</small>' : "");
          document.getElementById("deleteReqBody").innerHTML =
            `Delete your request for <strong>${card.emoji} ${card.name}</strong>?${refundNote}`;
```
In `confirmDeleteRequest()`:
Ensure that `renderCdsGrid()`, `updateCdsFreeCounter()`, and `refreshCdsReqPill()` are invoked when a card request is deleted.

- [ ] **Step 5: Verify syntax**

Run: `python clean_check.py`
Expected: `ALL SCRIPTS VALIDATED CLEAN! ✅`

- [ ] **Step 6: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."

---

### Task 4: Execute Automated Tests & Verify with Chrome DevTools

**Files:**
- Test: `tests/test_sync_cds_coll_requests.js`
- Test: `tests/test_coll_cds_redesign.js`
- Test: `tests/test_card_shop_request_archive.js`

- [ ] **Step 1: Run unit and integration tests**

Run: `node tests/test_sync_cds_coll_requests.js`
Expected: `✅ All Sync CDS & Collection tests passed!`

Run: `node tests/test_coll_cds_redesign.js`
Expected: `🎉 ALL COLLECTION & CDS REDESIGN ASSERTIONS PASSED!`

Run: `node tests/test_card_shop_request_archive.js`
Expected: `🎉 ALL CARD & SHOP REQUEST ARCHIVE TESTS PASSED!`

- [ ] **Step 2: Start local server and test with Chrome DevTools MCP**

Start local static server if not already running.
Use `chrome-devtools-mcp` tools (`navigate_page`, `evaluate_script`, `take_screenshot`):
- Navigate to application.
- Test Collection card request -> verify CDS browse shows `📬 Requested (Coll)`.
- Click card in CDS browse -> verify delete modal appears with coin refund text.
- Confirm deletion -> verify coins are refunded and card reverts to unrequested state.
- Test CDS card request -> verify Collection card shows `📬 Requested (CDS)`.
- Open Collection card action modal -> verify button shows "Already Requested" and explains CDS origin.

- [ ] **Step 3: Commit (if auto_commit enabled)**

Check `.agent/config.yml` for `auto_commit` setting.
If `auto_commit: false`: skip commit and staging. Print: "Skipping commit (auto_commit: false)."
