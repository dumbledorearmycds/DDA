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

  let post = {
    id: 'post-1',
    text: 'A post',
    comments: [
      { id: 'c-1', text: 'First reply', playerId: 'user-1' }
    ]
  };
  let renderedCount = 0;
  const renderFeed = () => { renderedCount++; };

  // 1. Test postComment - Happy Path
  let inputVal = 'Great suggestion!';
  const newComment = { id: 'c-2', text: inputVal, playerId: 'user-2' };
  const ok1 = await runOptimisticAction({
    apply: () => {
      inputVal = '';
      post.comments.push(newComment);
      renderFeed();
    },
    commit: async () => [{ ...post, comments: [...post.comments] }],
    reconcile: (updated) => { post = updated[0]; renderFeed(); },
    rollback: () => {
      post.comments = post.comments.filter(c => c.id !== newComment.id);
      inputVal = newComment.text;
      renderFeed();
    },
    successMsg: '💬 Comment posted!',
    rollbackMsg: '⚠️ Could not post comment — draft restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok1, true);
  assert.strictEqual(inputVal, '');
  assert.strictEqual(post.comments.length, 2);
  assert.strictEqual(toasts[toasts.length - 1], '💬 Comment posted!');

  // 2. Test postComment - Server Failure & Rollback
  inputVal = 'A failing reply';
  const failComment = { id: 'c-3', text: inputVal, playerId: 'user-2' };
  const ok2 = await runOptimisticAction({
    apply: () => {
      inputVal = '';
      post.comments.push(failComment);
      renderFeed();
    },
    commit: async () => null, // server fails
    rollback: () => {
      post.comments = post.comments.filter(c => c.id !== failComment.id);
      inputVal = failComment.text;
      renderFeed();
    },
    successMsg: '💬 Comment posted!',
    rollbackMsg: '⚠️ Could not post comment — draft restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok2, false);
  assert.strictEqual(inputVal, 'A failing reply', 'Comment draft must be restored on failure');
  assert.strictEqual(post.comments.length, 2, 'Failed comment must be removed');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not post comment — draft restored!');

  // 3. Test deleteCommentUI - Failure & Rollback
  const commentToDelete = post.comments[1];
  const idx = 1;
  const ok3 = await runOptimisticAction({
    apply: () => {
      post.comments.splice(idx, 1);
      renderFeed();
    },
    commit: async () => null, // deletion failed
    rollback: () => {
      post.comments.splice(idx, 0, commentToDelete);
      renderFeed();
    },
    successMsg: '🗑️ Comment deleted!',
    rollbackMsg: '⚠️ Could not delete comment — comment restored!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok3, false);
  assert.strictEqual(post.comments.length, 2, 'Deleted comment must be restored');
  assert.strictEqual(post.comments[1].id, 'c-2');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not delete comment — comment restored!');

  console.log('✅ Comments optimistic tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
