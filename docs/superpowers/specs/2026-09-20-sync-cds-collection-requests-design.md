# Design Specification: Sync CDS and Collection Card Requests

## Date: 2026-09-20
## Author: Antigravity AI

---

## 1. Problem Statement & Goals

Currently in the application, Card Requests can originate from two places:
1. **My Collection (`#panel-coll`)**: Players request cards from their album. Unowned cards cost coins (100 coins for normal, 300 for gold).
2. **CDS Hub (`#panel-cds`)**: Players request missing cards for free within their daily free allowance (or gold free allowance).

### Current Shortcomings
- CDS browse section only inspects requests marked `r.free === true`. If a card is requested via Collection, the CDS browse grid does not reflect it as requested and allows the player to request the same card again through CDS.
- Collection grid and modal checks do not immediately sync when a CDS card request is toggled or cancelled without a full set reload or tab switch.
- Double requests for the same card waste leader review effort and player allowances.

### Goals
1. **Strict Mutual Exclusivity**: A card can only have one pending request at any time, whether initiated from CDS or Collection.
2. **Cross-Grid Status Visibility**:
   - In **My Collection**:
     - If requested via Collection: card chip shows `📬 Requested`.
     - If requested via CDS: card chip shows `📬 Requested (CDS)`.
     - Card action modal (`overlayCardAction`) disables the request button and explains where it was requested (`"You already have a pending request for this card from CDS — check 'My CDS Requests' for status."`).
   - In **CDS Browse Grid**:
     - If requested via CDS: card chip shows `📬 Requested`.
     - If requested via Collection: card chip shows `📬 Requested (Coll)`.
3. **Intuitive Cancellation & Refund Handling**:
   - In CDS Browse grid, tapping a card requested via **CDS** immediately cancels the request and restores the daily free allowance.
   - In CDS Browse grid, tapping a card requested via **Collection** triggers the delete confirmation prompt (`openDeleteRequest`), showing that cancelling will refund the coins spent.
4. **Immediate Reactive Synchronization**: Placing or cancelling a card request in either panel immediately updates both grids (`renderCollGrid`, `renderCdsGrid`), quota displays, and badge counters.
5. **Separate Request Lists**: In accordance with user preference, "My Requests" in Collection continues to list Collection requests, Jackpot entries, and Shop purchases; "My CDS Requests" in CDS continues to list CDS requests.

---

## 2. Architecture & Detailed Logic

### 2.1 Centralized Helper: `getPendingCardRequest(setIdx, cardIdx)`
A single helper to determine active pending request state for the current player:
```javascript
function getPendingCardRequest(setIdx, cardIdx) {
  const pid = window._currentPlayerId || "";
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
```

### 2.2 My Collection Panel (`#panel-coll`)
- **`hydrateCollGridHoles(grid, setIdx)`**:
  - Queries `getPendingCardRequest(setIdx, ci)`.
  - Toggles `.requested` class when pending request exists.
  - Updates action chip:
    - `pending && pending.isCds`: `<div class="card-action-chip chip-pending">📬 Requested (CDS)</div>`
    - `pending && pending.isColl`: `<div class="card-action-chip chip-pending">📬 Requested</div>`
    - (otherwise: standard owned/request chips).
- **`openCardActionModal(sIdx, cIdx)`**:
  - Queries `getPendingCardRequest(sIdx, cIdx)`.
  - When pending:
    - Button text: `"📬 Already Requested"` (disabled).
    - Status message:
      - If `isCds`: `"You already have a pending request for this card from CDS — check 'My CDS Requests' for status."`
      - If `isColl`: `"You already have a pending request for this card — check 'My Requests' for status."`
- **`caSubmitRequest()`**:
  - Uses `getPendingCardRequest(setIdx, cardIdx)` to guard against double requesting.
  - After adding request:
    - Calls `renderCollGrid()`, `renderCdsGrid()`, `updateCollStats()`, `updateCdsFreeCounter()`, `refreshMyReqPill()`, `refreshCdsReqPill()`.

### 2.3 CDS Panel (`#panel-cds`)
- **`hydrateCdsGridHoles(grid, setIdx)`**:
  - Queries `getPendingCardRequest(setIdx, ci)`.
  - Toggles `.requested` class when pending request exists.
  - Updates action chip:
    - `pending && pending.isColl`: `<div class="card-action-chip chip-pending">📬 Requested (Coll)</div>`
    - `pending && pending.isCds`: `<div class="card-action-chip chip-pending">📬 Requested</div>`
    - (otherwise: standard `🌟 Gold Free`, `🎁 Request Free`, or `✅ In Deck` chips).
  - Tooltip:
    - `pending && pending.isColl`: `"Requested via Collection • Tap to cancel and refund coins"`
    - `pending && pending.isCds`: `"Tap to cancel this request"`
- **CDS Grid Tap Handler (`renderCdsGrid` click delegation & `cdsToggleRequest`)**:
  - Queries `getPendingCardRequest(cdsSetIdx, ci)`.
  - Case 1: `pending && pending.isColl`:
    - Opens delete confirmation dialog `openDeleteRequest(pending.request.id)` where user can confirm cancellation and coin refund.
  - Case 2: `pending && pending.isCds`:
    - Calls `cdsToggleRequest(cdsSetIdx, ci)` to cancel immediately, restore free quota, and display toast.
  - Case 3: Not requested:
    - Calls `cdsToggleRequest(cdsSetIdx, ci)` to submit a new free CDS request if limits allow.
- **`cdsToggleRequest()`**:
  - When cancelling or adding a request:
    - Calls `renderCdsGrid()`, `renderCollGrid()`, `updateCdsFreeCounter()`, `updateCollStats()`, `refreshMyReqPill()`, `refreshCdsReqPill()`.

### 2.4 Cancellation Confirmation & Refunds
- **`openDeleteRequest(reqId)`**:
  - If the request is pending and `coinsSpent > 0`, adds a note: `<br><small style="opacity:.85; color:var(--gold)">🪙 ${req.coinsSpent} coins will be refunded to your balance.</small>`.
- **`confirmDeleteRequest()`**:
  - Removes request from `cardRequests`.
  - Refunds `coinsSpent` if `> 0`.
  - Calls `renderCollGrid()`, `renderCdsGrid()`, `renderMyRequests()`, `renderMyCdsRequests()`, `updateCollStats()`, `updateCdsFreeCounter()`, `refreshMyReqPill()`, `refreshCdsReqPill()`.

---

## 3. Verification Plan

### Automated Tests
1. Script syntax check: `python clean_check.py` to ensure all script blocks remain 100% syntactically valid.
2. Unit tests via Node.js: Create `tests/test_sync_cds_coll_requests.js` to simulate:
   - Requesting a card in Collection -> verifying it appears as `📬 Requested (Coll)` in CDS browse grid and prevents requesting in CDS.
   - Requesting a card in CDS -> verifying it appears as `📬 Requested (CDS)` in Collection grid and disables request button in `openCardActionModal`.
   - Tapping Collection-requested card in CDS browse -> verifying delete modal opens and confirming cancellation refunds coins.
   - Tapping CDS-requested card in CDS browse -> verifying immediate cancellation and quota restoration.
   - Ensuring "My Requests" and "My CDS Requests" lists retain their independent filtering.

### Manual Verification
- Browser testing using `chrome-devtools-mcp` on local server:
  - Open Collection, request an unowned card.
  - Switch to CDS browse grid: verify that card displays `📬 Requested (Coll)`.
  - Click that card in CDS browse: verify confirmation dialog appears with refund amount.
  - Cancel it: verify coins refunded, both grids return to available state.
  - Request a card in CDS browse: verify it shows `📬 Requested` in CDS.
  - Switch to Collection: verify it shows `📬 Requested (CDS)`.
