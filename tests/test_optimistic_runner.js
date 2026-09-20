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

  // Test 3: Commit returning false triggers rollback
  toasts = [];
  state = 'initial';
  const ok3 = await runOptimisticAction({
    apply: () => { state = 'optimistic'; },
    commit: async () => false,
    rollback: () => { state = 'initial'; },
    successMsg: 'Success!',
    rollbackMsg: 'Rejected!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok3, false, 'Reject path should return false');
  assert.strictEqual(state, 'initial', 'State should be rolled back');
  assert.deepStrictEqual(toasts, ['Success!', 'Rejected!']);

  console.log('✅ runOptimisticAction unit tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
