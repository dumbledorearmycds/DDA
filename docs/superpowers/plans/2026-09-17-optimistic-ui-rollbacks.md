# Optimistic UI & Graceful Rollbacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement instantaneous optimistic UI updates across all user actions (Suggestions, Comments, Card Requests, and Leaderboard Approvals) with authoritative reconciliation and graceful, visible rollbacks on network failure.

**Architecture:** A lightweight, centralized runner `runOptimisticAction` encapsulates the apply -> commit -> reconcile -> rollback cycle. UI handlers delegate state mutations to this runner, ensuring immediate DOM updates, text draft preservation, and clear rollback notifications via `showToast`.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Firebase Firestore / Realtime DB, Node.js (`node --check` and testing scripts).

---

### Task 1: Centralized `runOptimisticAction` Helper

**Files:**
- Modify: `index.html:13975` (before suggestions UI begins)
- Test: `tests/test_optimistic_runner.js`

- [ ] **Step 1: Write test for `runOptimisticAction`**

Create `tests/test_optimistic_runner.js`:
```javascript
const assert = require('assert');

// Implement test harness for runOptimisticAction
async function runOptimisticAction({ apply, commit, reconcile, rollback, successMsg, rollbackMsg, showToastFn }) {
  const toast = showToastFn || (() => {});
  try {
    apply();
    if (successMsg) toast(successMsg);
  } catch (err) {
    return false;
  }

  try {
    const result = await commit();
    if (result === false || result === null) {
      throw new Error('Server rejected');
    }
    if (reconcile && result) reconcile(result);
    return true;
  } catch (err) {
    try { rollback(); } catch (rbErr) {}
    if (rollbackMsg) toast(rollbackMsg);
    return false;
  }
}

async function runTests() {
  let toasts = [];
  const toastFn = (msg) => toasts.push(msg);

  // Test 1: Happy path
  let state = 'initial';
  let committed = false;
  const ok1 = await runOptimisticAction({
    apply: () => { state = 'optimistic'; },
    commit: async () => { committed = true; return { data: 'server' }; },
    reconcile: (res) => { state = 'reconciled_' + res.data; },
    rollback: () => { state = 'rolled_back'; },
    successMsg: 'Success!',
    rollbackMsg: 'Failed!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok1, true, 'Happy path should return true');
  assert.strictEqual(committed, true);
  assert.strictEqual(state, 'reconciled_server');
  assert.deepStrictEqual(toasts, ['Success!']);

  // Test 2: Failure and rollback
  toasts = [];
  state = 'initial';
  const ok2 = await runOptimisticAction({
    apply: () => { state = 'optimistic'; },
    commit: async () => { throw new Error('Network error'); },
    rollback: () => { state = 'initial'; },
    successMsg: 'Success!',
    rollbackMsg: 'Rollback!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok2, false, 'Failure path should return false');
  assert.strictEqual(state, 'initial', 'State should be rolled back');
  assert.deepStrictEqual(toasts, ['Success!', 'Rollback!']);

  console.log('✅ runOptimisticAction unit tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node tests/test_optimistic_runner.js`  
Expected: `✅ runOptimisticAction unit tests passed!`

- [ ] **Step 3: Insert `runOptimisticAction` into `index.html`**

Add `runOptimisticAction` at line 13975 of `index.html`:
```javascript
    // ── OPTIMISTIC ACTION RUNNER ───────────────────────────────
    // Standardized optimistic execution: immediately updates the UI, runs
    // the server write in the background, reconciles on success, or rolls
    // back cleanly with a visible warning toast on error.
    async function runOptimisticAction({ apply, commit, reconcile, rollback, successMsg, rollbackMsg }) {
      try {
        apply();
        if (successMsg && typeof showToast === 'function') showToast(successMsg);
      } catch (err) {
        console.error('Optimistic apply failed:', err);
        return false;
      }

      try {
        const result = await commit();
        if (result === false || result === null) {
          throw new Error('Server returned failure or null');
        }
        if (reconcile && result) reconcile(result);
        return true;
      } catch (err) {
        console.warn('Optimistic action failed, rolling back:', err);
        try { rollback(); } catch (rbErr) { console.error('Rollback failed:', rbErr); }
        if (rollbackMsg && typeof showToast === 'function') showToast(rollbackMsg);
        return false;
      }
    }
    window.runOptimisticAction = runOptimisticAction;
```

- [ ] **Step 4: Check syntax**

Run: `python clean_check.py`  
Expected: `ALL 11 SCRIPTS VALIDATED CLEAN! ✅`

- [ ] **Step 5: Check auto_commit**

Check `.agent/config.yml`. If `auto_commit: false`, skip commit.

---

### Task 2: Refactor Suggestions Board Actions (Add, Edit, Delete)

**Files:**
- Modify: `index.html:13990-14270`
- Test: `tests/test_optimistic_suggestions.js`

- [ ] **Step 1: Write tests for Suggestions optimistic flows**

Create `tests/test_optimistic_suggestions.js` to simulate:
- `postSuggestion` instant add, draft clearing, background fail & draft restoration.
- `saveEditSuggestion` instant edit, edit mode closing, rollback on fail.
- `deleteSuggestionUI` instant remove, rollback on fail.

- [ ] **Step 2: Update `postSuggestion` in `index.html`**

Replace lines 13975–14018 with optimistic implementation:
- Read & snapshot draft string.
- Immediately clear textarea `#sgInput`.
- Create entry object with temporary ID.
- Append to `window._suggestions()`, call `renderSuggestionsFeed()`.
- Pass to `runOptimisticAction` with:
  - `commit: () => window.submitSuggestion ? window.submitSuggestion(entry) : false`
  - `rollback: () => { window._setSuggestions(window._suggestions().filter(s => s.id !== entry.id)); if (input) input.value = draft; renderSuggestionsFeed(); }`
  - `successMsg: '📬 Suggestion posted!'`
  - `rollbackMsg: '⚠️ Could not post suggestion — your draft was restored!'`

- [ ] **Step 3: Update `saveEditSuggestion` in `index.html`**

Refactor `saveEditSuggestion(id)`:
- Read `newText`.
- Find target post, snapshot `prevText = post.text` and `prevEditedAt = post.editedAt`.
- Optimistically update `post.text = newText`, `post.editedAt = new Date().toISOString()`, `sgEditingId = null`.
- Call `renderSuggestionsFeed()`.
- Pass to `runOptimisticAction` with:
  - `commit: () => window.editSuggestion ? window.editSuggestion(id, myId, newText) : null`
  - `reconcile: (updated) => { window._setSuggestions(updated); renderSuggestionsFeed(); }`
  - `rollback: () => { post.text = prevText; post.editedAt = prevEditedAt; renderSuggestionsFeed(); }`
  - `successMsg: '✅ Suggestion updated!'`
  - `rollbackMsg: '⚠️ Could not save edit — changes reverted!'`

- [ ] **Step 4: Update `deleteSuggestionUI` in `index.html`**

Refactor `deleteSuggestionUI(id)`:
- Prompt confirmation `confirm('Delete this suggestion? This cannot be undone.')`.
- Find target post and index `const idx = window._suggestions().findIndex(s => s.id === id); const deletedPost = window._suggestions()[idx];`.
- Splice post out, set `sgEditingId = null` if matching, call `renderSuggestionsFeed()`.
- Pass to `runOptimisticAction` with:
  - `commit: () => window.deleteSuggestion ? window.deleteSuggestion(id, myId) : null`
  - `reconcile: (updated) => { window._setSuggestions(updated); renderSuggestionsFeed(); }`
  - `rollback: () => { window._suggestions().splice(idx, 0, deletedPost); renderSuggestionsFeed(); }`
  - `successMsg: '🗑️ Suggestion deleted!'`
  - `rollbackMsg: '⚠️ Could not delete suggestion — post restored!'`

- [ ] **Step 5: Verify with test script and syntax check**

Run: `node tests/test_optimistic_suggestions.js`  
Run: `python clean_check.py`  
Expected: All tests pass and all 11 scripts validate clean.

---

### Task 3: Refactor Comment Thread Actions (Add, Delete)

**Files:**
- Modify: `index.html:14185-14235`
- Test: `tests/test_optimistic_comments.js`

- [ ] **Step 1: Write test for Comment optimistic flows**

Create `tests/test_optimistic_comments.js` to simulate:
- `postComment` instant add, clearing comment draft, and restoring draft if commit fails.
- `deleteCommentUI` instant deletion and restoring comment if commit fails.

- [ ] **Step 2: Update `postComment` in `index.html`**

Refactor `postComment(postId)`:
- Read & snapshot draft string.
- Immediately clear textarea `#sgCommentInput_${postId}`.
- Create comment object.
- Push to `post.comments`, set `sgExpandedId = postId`, call `renderSuggestionsFeed()`.
- Pass to `runOptimisticAction` with:
  - `commit: () => window.submitComment ? window.submitComment(postId, comment) : null`
  - `reconcile: (updated) => { window._setSuggestions(updated); renderSuggestionsFeed(); }`
  - `rollback: () => { post.comments = post.comments.filter(c => c.id !== comment.id); if (input) input.value = draft; renderSuggestionsFeed(); }`
  - `successMsg: '💬 Comment posted!'`
  - `rollbackMsg: '⚠️ Could not post comment — draft restored!'`

- [ ] **Step 3: Update `deleteCommentUI` in `index.html`**

Refactor `deleteCommentUI(postId, commentId)`:
- Prompt confirmation `confirm('Delete this comment? This cannot be undone.')`.
- Find target comment and index in `post.comments`.
- Splice comment out, call `renderSuggestionsFeed()`.
- Pass to `runOptimisticAction` with:
  - `commit: () => window.deleteComment ? window.deleteComment(postId, commentId, myId) : null`
  - `reconcile: (updated) => { window._setSuggestions(updated); renderSuggestionsFeed(); }`
  - `rollback: () => { post.comments.splice(idx, 0, deletedComment); renderSuggestionsFeed(); }`
  - `successMsg: '🗑️ Comment deleted!'`
  - `rollbackMsg: '⚠️ Could not delete comment — comment restored!'`

- [ ] **Step 4: Verify with test script and syntax check**

Run: `node tests/test_optimistic_comments.js`  
Run: `python clean_check.py`

---

### Task 4: Extended Actions (Card Requests Sync & Leaderboard Approvals)

**Files:**
- Modify: `index.html:11640-11644` (`saveSharedRequests`)
- Modify: `index.html:18580-18656` (`cdsToggleRequest`)
- Modify: `index.html:19973-19977` (`elApproveOne`)
- Test: `tests/test_optimistic_extended.js`

- [ ] **Step 1: Write tests for extended optimistic flows**

Create `tests/test_optimistic_extended.js` to simulate:
- `saveSharedRequests` returning boolean status on setDoc resolution/rejection.
- `cdsToggleRequest` reverting cardRequests snapshot if `saveSharedRequests` returns false.
- `elApproveOne` updating cache immediately and restoring cache if `lbApproveEntry` fails.

- [ ] **Step 2: Update `window.saveSharedRequests` in Script 0**

Modify `saveSharedRequests` at line 11640:
```javascript
    window.saveSharedRequests = async function () {
      try {
        await setDoc(REQ_DOC, { cardRequests: window._cardRequests() });
        return true;
      } catch (e) {
        console.warn('Firebase write failed:', e);
        return false;
      }
    };
```

- [ ] **Step 3: Update `cdsToggleRequest` in Script 8**

Wrap the background write in `runOptimisticAction` or snapshot check:
- Snapshot `const prevRequests = cardRequests.slice()`.
- Mutate `cardRequests` (add or cancel), call `saveProgress()`, `renderCdsGrid()`, `updateCdsFreeCounter()`, `refreshMyReqPill()`, `refreshCdsReqPill()`.
- Call `window.saveSharedRequests()`. If false:
  - Revert `cardRequests.length = 0; cardRequests.push(...prevRequests);`.
  - Call `saveProgress()`, `renderCdsGrid()`, `updateCdsFreeCounter()`, `refreshMyReqPill()`, `refreshCdsReqPill()`.
  - Show toast: `showToast('⚠️ Card request sync failed — changes reverted!')`.

- [ ] **Step 4: Update `elApproveOne` in Script 8**

Refactor `elApproveOne(game, playerId)`:
- Snapshot `const prevCache = Array.isArray(elPendingCache[game]) ? [...elPendingCache[game]] : [];`.
- Optimistically update `elPendingCache[game]` (filter out `playerId`), call `elRenderEntryLog()`.
- Dispatches `runOptimisticAction`:
  - `commit: () => window.lbApproveEntry ? window.lbApproveEntry(game, playerId) : false`
  - `reconcile: () => { elFetchPending(game).then(() => elRenderEntryLog()); }`
  - `rollback: () => { elPendingCache[game] = prevCache; elRenderEntryLog(); }`
  - `successMsg: '✅ Approved!'`
  - `rollbackMsg: '⚠️ Could not approve — state reverted!'`

- [ ] **Step 5: Verify with test script and syntax check**

Run: `node tests/test_optimistic_extended.js`  
Run: `python clean_check.py`

---

### Task 5: Master Verification & End-to-End Test Suite

**Files:**
- Test: `tests/run_all_tests.js`

- [ ] **Step 1: Run comprehensive test suite**

Run: `node tests/run_all_tests.js`  
Verify:
1. `test_optimistic_runner.js`: PASS
2. `test_optimistic_suggestions.js`: PASS
3. `test_optimistic_comments.js`: PASS
4. `test_optimistic_extended.js`: PASS

- [ ] **Step 2: Run `python clean_check.py`**

Verify all 11 script tags in `index.html` validate clean with `node --check`.

- [ ] **Step 3: Check git status**

Confirm no untracked/broken temporary files are left in the repository.
