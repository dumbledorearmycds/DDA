# Optimistic UI & Graceful Rollbacks Design Specification

**Date**: 2026-09-17  
**Status**: Approved  
**Target Codebase**: `index.html` (Single-file PWA, Vanilla JS + CSS)  
**Target Platform**: Android Chrome (latest) & iOS Safari (iOS 15+) PWA  

---

## 1. Executive Summary

This specification establishes an optimistic UI architecture with visible, graceful rollback error handling across all user-interactive and admin operations in DA Hub (`index.html`). 

Currently, several key actions (posting suggestions, editing suggestions, deleting suggestions, posting thread comments, deleting thread comments, and approving leaderboard scores) wait for asynchronous network roundtrips (`await`) to Firebase Firestore before reflecting changes on the screen. On mobile connections, this induces visible lag (100ms–1500ms), blocks button states (e.g. "Posting…"), and degrades perceived responsiveness.

By introducing a lightweight, centralized runner (`runOptimisticAction`), the UI updates immediately in the frame of interaction. Background network promises reconcile state upon success or cleanly roll back state and restore user draft inputs with clear, prominent toast notifications upon failure.

---

## 2. Architectural Design

### 2.1 The `runOptimisticAction` Runner

A centralized, standardized helper function added to the core script scope:

```javascript
async function runOptimisticAction({ apply, commit, reconcile, rollback, successMsg, rollbackMsg }) {
  // 1. Instant local mutation & immediate render
  try {
    apply();
    if (successMsg && typeof showToast === 'function') {
      showToast(successMsg);
    }
  } catch (err) {
    console.error('Optimistic apply failed:', err);
    return false;
  }

  // 2. Background server execution
  try {
    const result = await commit();
    if (result === false || result === null) {
      throw new Error('Server returned failure or null');
    }
    // 3. Silent authoritative reconciliation
    if (reconcile && result) {
      reconcile(result);
    }
    return true;
  } catch (err) {
    console.warn('Optimistic action failed, rolling back:', err);
    // 4. Graceful rollback & visible alert
    try {
      rollback();
    } catch (rbErr) {
      console.error('Rollback execution failed:', rbErr);
    }
    if (rollbackMsg && typeof showToast === 'function') {
      showToast(rollbackMsg);
    }
    return false;
  }
}
```

### 2.2 Guiding Principles

1. **Zero Perceived Latency**: Buttons never freeze on "Posting…", inputs clear immediately, and new cards/comments appear in the DOM instantly.
2. **User Draft Protection**: When submitting or editing text (suggestions and comments), drafts are retained in memory. If a network write fails, the typed draft is placed back into the input field so the user never loses their thoughts.
3. **Transparent Rollbacks**: Rollbacks are accompanied by clear, descriptive toast messages (prefixed with `⚠️`) explicitly stating what was reverted, preventing confusing silent reversions.
4. **Collision Resistance**: In-flight flags prevent duplicate rapid taps on the same item while a background promise is active.

---

## 3. Detailed Component Specifications

### 3.1 Suggestions Board (`#panel-suggest`)

#### 3.1.1 Add Suggestion (`postSuggestion`)
* **Trigger**: Tap "Post Suggestion" (`#sgSubmitBtn`).
* **Optimistic `apply()`**:
  * Snapshot draft text: `const draft = input.value.trim()`.
  * Clear textarea: `input.value = ''`.
  * Generate temporary local entry:
    ```javascript
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      playerName: profile.name || 'Unknown',
      townName: profile.town || '',
      avatar: profile.avatar,
      photoURL: _lightPhoto(profile.photoURL),
      playerId: window._currentPlayerId || '',
      text: draft,
      votes: {},
      comments: [],
      timestamp: new Date().toISOString()
    };
    ```
  * Prepend/append to `window._suggestions()` and invoke `renderSuggestionsFeed()`.
  * Toast: `showToast('📬 Suggestion posted!')`.
* **Background `commit()`**: Calls `window.submitSuggestion(entry)`.
* **`rollback()` on failure**:
  * Filter out `entry.id` from `window._suggestions()`.
  * Restore draft text to `#sgInput`: `input.value = draft`.
  * Re-render `renderSuggestionsFeed()`.
  * Rollback Toast: `showToast('⚠️ Could not post suggestion — your draft was restored!')`.

#### 3.1.2 Edit Suggestion (`saveEditSuggestion`)
* **Trigger**: Tap "Save" button (`#sgEditInput_${id}`).
* **Optimistic `apply()`**:
  * Locate `post = window._suggestions().find(s => s.id === id)`.
  * Snapshot previous state: `const prevText = post.text; const prevEditedAt = post.editedAt;`.
  * Update post: `post.text = newText; post.editedAt = new Date().toISOString();`.
  * Clear editing state: `sgEditingId = null;`.
  * Invoke `renderSuggestionsFeed()`.
  * Toast: `showToast('✅ Suggestion updated!')`.
* **Background `commit()`**: Calls `window.editSuggestion(id, myId, newText)`.
* **`reconcile(updated)`**: `window._setSuggestions(updated); renderSuggestionsFeed();`.
* **`rollback()` on failure**:
  * Revert `post.text = prevText; post.editedAt = prevEditedAt;`.
  * Invoke `renderSuggestionsFeed()`.
  * Rollback Toast: `showToast('⚠️ Could not save edit — changes reverted!')`.

#### 3.1.3 Delete Suggestion (`deleteSuggestionUI`)
* **Trigger**: Tap "Delete" button (`🗑️`).
* **Optimistic `apply()`**:
  * Locate post and index: `const idx = window._suggestions().findIndex(s => s.id === id); const deletedPost = window._suggestions()[idx];`.
  * Splice out post: `window._suggestions().splice(idx, 1);`.
  * If `sgEditingId === id`, set `sgEditingId = null;`.
  * Invoke `renderSuggestionsFeed()`.
  * Toast: `showToast('🗑️ Suggestion deleted!')`.
* **Background `commit()`**: Calls `window.deleteSuggestion(id, myId)`.
* **`reconcile(updated)`**: `window._setSuggestions(updated); renderSuggestionsFeed();`.
* **`rollback()` on failure**:
  * Re-insert `deletedPost` at `idx`: `window._suggestions().splice(idx, 0, deletedPost);`.
  * Invoke `renderSuggestionsFeed()`.
  * Rollback Toast: `showToast('⚠️ Could not delete suggestion — post restored!')`.

---

### 3.2 Threaded Comments (`.sg-comment`)

#### 3.2.1 Add Comment (`postComment`)
* **Trigger**: Tap "Reply" (`#sgCommentSendBtn_${postId}`).
* **Optimistic `apply()`**:
  * Snapshot draft text: `const draft = input.value.trim()`.
  * Clear textarea: `input.value = ''`.
  * Build comment object:
    ```javascript
    const comment = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      playerName: profile.name || 'Unknown',
      avatar: profile.avatar,
      photoURL: _lightPhoto(profile.photoURL),
      playerId: myId,
      text: draft,
      timestamp: new Date().toISOString()
    };
    ```
  * Append to `post.comments` and ensure `sgExpandedId = postId`.
  * Invoke `renderSuggestionsFeed()`.
  * Toast: `showToast('💬 Comment posted!')`.
* **Background `commit()`**: Calls `window.submitComment(postId, comment)`.
* **`reconcile(updated)`**: `window._setSuggestions(updated); renderSuggestionsFeed();`.
* **`rollback()` on failure**:
  * Remove comment from `post.comments`.
  * Restore draft text into `#sgCommentInput_${postId}`: `input.value = draft`.
  * Invoke `renderSuggestionsFeed()`.
  * Rollback Toast: `showToast('⚠️ Could not post comment — draft restored!')`.

#### 3.2.2 Delete Comment (`deleteCommentUI`)
* **Trigger**: Tap "Delete" on comment (`🗑️`).
* **Optimistic `apply()`**:
  * Locate comment: `const idx = post.comments.findIndex(c => c.id === commentId); const deletedComment = post.comments[idx];`.
  * Splice out: `post.comments.splice(idx, 1);`.
  * Invoke `renderSuggestionsFeed()`.
  * Toast: `showToast('🗑️ Comment deleted!')`.
* **Background `commit()`**: Calls `window.deleteComment(postId, commentId, myId)`.
* **`reconcile(updated)`**: `window._setSuggestions(updated); renderSuggestionsFeed();`.
* **`rollback()` on failure**:
  * Re-insert: `post.comments.splice(idx, 0, deletedComment);`.
  * Invoke `renderSuggestionsFeed()`.
  * Rollback Toast: `showToast('⚠️ Could not delete comment — comment restored!')`.

---

### 3.3 Card Requests Sync (`cdsToggleRequest` & `saveSharedRequests`)

* **Enhancement to `window.saveSharedRequests`**:
  * Return `true` on successful `setDoc`, return `false` on catch.
* **Optimistic `cdsToggleRequest(setIdx, cardIdx)`**:
  * Snapshot previous array: `const prevRequests = cardRequests.slice();`.
  * Modify `cardRequests` (add or cancel request).
  * Save progress locally: `saveProgress()`.
  * Re-render UI immediately (`renderCdsGrid()`, `updateCdsFreeCounter()`, `refreshMyReqPill()`, `refreshCdsReqPill()`).
  * Toast: `showToast('🎁 Requested card!')` or `showToast('↩️ Cancelled request.')`.
  * Dispatches `window.saveSharedRequests()`.
  * If write fails:
    * Revert `cardRequests = prevRequests`.
    * Save progress locally.
    * Re-render grid and pills.
    * Rollback Toast: `showToast('⚠️ Card request sync failed — changes reverted!')`.

---

### 3.4 Leaderboard Score Approvals (`elApproveOne`)

* **Trigger**: Tap "Approve" button in Event Logs panel.
* **Optimistic `apply()`**:
  * Snapshot `const prevCache = Array.isArray(elPendingCache[game]) ? [...elPendingCache[game]] : [];`.
  * Update cached state: mark target `playerId` as approved / remove from pending list.
  * Invoke `elRenderEntryLog()`.
  * Toast: `showToast('✅ Approved!')`.
* **Background `commit()`**: Calls `window.lbApproveEntry(game, playerId)`.
* **`reconcile()`**: Re-fetch pending cache from server in background (`elFetchPending(game)`).
* **`rollback()` on failure**:
  * Revert `elPendingCache[game] = prevCache`.
  * Invoke `elRenderEntryLog()`.
  * Rollback Toast: `showToast('⚠️ Could not approve score — state reverted!')`.

---

### 3.5 Admin Batch Clears (`clearDoneRequests`, `clearDoneShopRequests`)

* **Optimistic Flow**:
  * Snapshot target array.
  * Filter out completed entries immediately.
  * Render list and stats immediately with confirmation toast.
  * If background save fails, restore the array, re-render, and display warning toast.

---

## 4. Verification & Testing Matrix

| Scenario | User Action | Expected Instant UI | Expected Rollback on Failure |
| :--- | :--- | :--- | :--- |
| **Add Suggestion** | Type text, click Post | Input clears immediately, card appears in feed, toast "📬 Suggestion posted!" | Card removed from feed, text restored into input, toast "⚠️ Could not post suggestion — your draft was restored!" |
| **Edit Suggestion** | Edit text, click Save | Edit mode closes, card text updates immediately, toast "✅ Suggestion updated!" | Card text reverts to previous text, toast "⚠️ Could not save edit — changes reverted!" |
| **Delete Suggestion** | Click Delete icon, confirm | Card disappears from feed immediately, toast "🗑️ Suggestion deleted!" | Card reappears at original index, toast "⚠️ Could not delete suggestion — post restored!" |
| **Add Comment** | Type comment, click Reply | Input clears immediately, comment appears in thread, toast "💬 Comment posted!" | Comment removed from thread, draft restored into input, toast "⚠️ Could not post comment — draft restored!" |
| **Delete Comment** | Click comment Delete icon | Comment disappears immediately, toast "🗑️ Comment deleted!" | Comment reappears in thread, toast "⚠️ Could not delete comment — comment restored!" |
| **Card Request** | Tap card to request | Card highlights, badge updates, counter decrements | Card unhighlights, counter increments, toast "⚠️ Card request sync failed — changes reverted!" |
| **Approve Score** | Click Approve in Admin | Entry marked approved immediately, toast "✅ Approved!" | Entry reverts to unapproved, toast "⚠️ Could not approve score — state reverted!" |
| **Syntax Validation** | Run `python clean_check.py` | 11/11 script blocks pass cleanly with zero errors | N/A |
