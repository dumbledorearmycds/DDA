const assert = require('assert');

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

  let suggestions = [
    { id: 'post-1', text: 'First post', playerId: 'user-1', editedAt: null, votes: {}, comments: [] }
  ];
  let renderedCount = 0;
  const renderFeed = () => { renderedCount++; };

  // 1. Test postSuggestion - Happy Path
  let inputVal = 'New awesome idea';
  const newPost = { id: 'post-2', text: inputVal, playerId: 'user-1', comments: [] };
  const ok1 = await runOptimisticAction({
    apply: () => {
      inputVal = '';
      suggestions.push(newPost);
      renderFeed();
    },
    commit: async () => true, // server succeeds
    rollback: () => {
      suggestions = suggestions.filter(s => s.id !== newPost.id);
      inputVal = newPost.text;
      renderFeed();
    },
    successMsg: '📬 Suggestion posted!',
    rollbackMsg: '⚠️ Could not post suggestion — your draft was restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok1, true);
  assert.strictEqual(inputVal, '');
  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[1].id, 'post-2');
  assert.strictEqual(toasts[toasts.length - 1], '📬 Suggestion posted!');

  // 2. Test postSuggestion - Server Failure & Rollback
  inputVal = 'Failed idea';
  const failedPost = { id: 'post-3', text: inputVal, playerId: 'user-1', comments: [] };
  const ok2 = await runOptimisticAction({
    apply: () => {
      inputVal = '';
      suggestions.push(failedPost);
      renderFeed();
    },
    commit: async () => false, // server fails
    rollback: () => {
      suggestions = suggestions.filter(s => s.id !== failedPost.id);
      inputVal = failedPost.text;
      renderFeed();
    },
    successMsg: '📬 Suggestion posted!',
    rollbackMsg: '⚠️ Could not post suggestion — your draft was restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok2, false);
  assert.strictEqual(inputVal, 'Failed idea', 'Draft must be restored on failure');
  assert.strictEqual(suggestions.find(s => s.id === 'post-3'), undefined, 'Failed post must be removed');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not post suggestion — your draft was restored!');

  // 3. Test saveEditSuggestion - Happy Path
  const postToEdit = suggestions[0];
  const prevText = postToEdit.text;
  const ok3 = await runOptimisticAction({
    apply: () => {
      postToEdit.text = 'Edited text';
      renderFeed();
    },
    commit: async () => suggestions.map(s => s.id === postToEdit.id ? { ...s, text: 'Edited text' } : s),
    reconcile: (updated) => { suggestions = updated; renderFeed(); },
    rollback: () => {
      postToEdit.text = prevText;
      renderFeed();
    },
    successMsg: '✅ Suggestion updated!',
    rollbackMsg: '⚠️ Could not save edit — changes reverted!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok3, true);
  assert.strictEqual(suggestions[0].text, 'Edited text');
  assert.strictEqual(suggestions.length, 2);

  // 4. Test saveEditSuggestion - Failure & Rollback
  const ok4 = await runOptimisticAction({
    apply: () => {
      postToEdit.text = 'Broken edit';
      renderFeed();
    },
    commit: async () => null, // server error
    rollback: () => {
      postToEdit.text = 'Edited text'; // revert to previous
      renderFeed();
    },
    successMsg: '✅ Suggestion updated!',
    rollbackMsg: '⚠️ Could not save edit — changes reverted!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok4, false);
  assert.strictEqual(suggestions[0].text, 'Edited text', 'Text must revert on edit error');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not save edit — changes reverted!');

  // 5. Test deleteSuggestionUI - Failure & Rollback
  const deletedPost = suggestions[0];
  const idx = 0;
  const ok5 = await runOptimisticAction({
    apply: () => {
      suggestions.splice(idx, 1);
      renderFeed();
    },
    commit: async () => null, // deletion failed
    rollback: () => {
      suggestions.splice(idx, 0, deletedPost);
      renderFeed();
    },
    successMsg: '🗑️ Suggestion deleted!',
    rollbackMsg: '⚠️ Could not delete suggestion — post restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok5, false);
  assert.strictEqual(suggestions.length, 2, 'Post must be restored');
  assert.strictEqual(suggestions[0].id, 'post-1');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not delete suggestion — post restored!');

  console.log('✅ Suggestions optimistic tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
