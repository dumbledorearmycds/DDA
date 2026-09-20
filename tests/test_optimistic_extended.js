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

  // 1. Test Card Request Sync - Failure & Rollback
  let cardRequests = [
    { id: 'req-1', playerId: 'p-1', cardIdx: 0 }
  ];
  const prevRequests = cardRequests.slice();
  const newReq = { id: 'req-2', playerId: 'p-1', cardIdx: 5 };

  const ok1 = await runOptimisticAction({
    apply: () => {
      cardRequests.unshift(newReq);
    },
    commit: async () => false, // saveSharedRequests fails
    rollback: () => {
      cardRequests = prevRequests.slice();
    },
    successMsg: '🎁 Requested card!',
    rollbackMsg: '⚠️ Card request sync failed — changes reverted!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok1, false);
  assert.strictEqual(cardRequests.length, 1);
  assert.strictEqual(cardRequests[0].id, 'req-1');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Card request sync failed — changes reverted!');

  // 2. Test Leaderboard Score Approval - Happy Path
  let elPendingCache = {
    jj: [{ playerId: 'p-1', score: 100 }, { playerId: 'p-2', score: 80 }]
  };
  const prevCache = elPendingCache.jj.slice();
  const ok2 = await runOptimisticAction({
    apply: () => {
      elPendingCache.jj = elPendingCache.jj.filter(e => e.playerId !== 'p-1');
    },
    commit: async () => true,
    rollback: () => {
      elPendingCache.jj = prevCache;
    },
    successMsg: '✅ Approved!',
    rollbackMsg: '⚠️ Could not approve — state reverted!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok2, true);
  assert.strictEqual(elPendingCache.jj.length, 1);
  assert.strictEqual(elPendingCache.jj[0].playerId, 'p-2');
  assert.strictEqual(toasts[toasts.length - 1], '✅ Approved!');

  // 3. Test Leaderboard Score Approval - Failure & Rollback
  const prevCache2 = elPendingCache.jj.slice();
  const ok3 = await runOptimisticAction({
    apply: () => {
      elPendingCache.jj = elPendingCache.jj.filter(e => e.playerId !== 'p-2');
    },
    commit: async () => false, // server rejected
    rollback: () => {
      elPendingCache.jj = prevCache2;
    },
    successMsg: '✅ Approved!',
    rollbackMsg: '⚠️ Could not approve — state reverted!',
    showToastFn: toastFn
  });
  assert.strictEqual(ok3, false);
  assert.strictEqual(elPendingCache.jj.length, 1);
  assert.strictEqual(elPendingCache.jj[0].playerId, 'p-2', 'State must revert on approval failure');
  assert.strictEqual(toasts[toasts.length - 1], '⚠️ Could not approve — state reverted!');

  console.log('✅ Extended optimistic tests passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
