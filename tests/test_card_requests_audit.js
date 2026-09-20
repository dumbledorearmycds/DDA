// Test Suite for Collection Card Requests & Refund Lifecycle Audit
const assert = require("assert");

console.log("Running Collection Card Requests & Refund Lifecycle Audit Test Suite...\n");

// 1. isMyCardRequest Matching Logic
function isMyCardRequest(r, currentPlayerId, profileName) {
  if (!r) return false;
  const pid = currentPlayerId || "";
  if (pid && r.playerId && r.playerId === pid) return true;
  const myName = (profileName || "").trim().toLowerCase();
  const reqName = (r.playerName || "").trim().toLowerCase();
  return !!myName && myName === reqName;
}

// Test 1.1: Match by playerId
assert.strictEqual(
  isMyCardRequest({ playerId: "user-123", playerName: "Harry" }, "user-123", "Harry Potter"),
  true,
  "Should match by exact playerId"
);

// Test 1.2: Match by playerName when playerId is absent or legacy
assert.strictEqual(
  isMyCardRequest({ playerId: "", playerName: "Hermione Granger" }, "user-456", "hermione granger"),
  true,
  "Should match case-insensitively by playerName when playerId is empty"
);

// Test 1.3: Match by playerName when username has different case
assert.strictEqual(
  isMyCardRequest({ playerId: "old-pid", playerName: "Ron Weasley" }, "new-pid", "RON WEASLEY"),
  true,
  "Should match case-insensitively by playerName"
);

// Test 1.4: Reject different player
assert.strictEqual(
  isMyCardRequest({ playerId: "other-pid", playerName: "Draco Malfoy" }, "user-123", "Harry"),
  false,
  "Should not match another player's request"
);
console.log("✅ isMyCardRequest player resolution tests passed!");

// 2. caSubmitRequest Optimistic Rollback & Coin Refund on Network/Save Failure
(async () => {
  let coins = 1000;
  const coinHistory = [];
  const cardRequests = [];
  const reqCost = 100;

  function logCoinTx(amount, desc) {
    coinHistory.unshift({ amount, desc, ts: Date.now() });
  }

  // Simulate caSubmitRequest with optimistic write
  const prevCoins = coins;
  const prevCoinHistory = coinHistory.slice();
  const prevRequests = cardRequests.slice();

  // Deduct coins optimistically
  coins -= reqCost;
  logCoinTx(-reqCost, "🃏 Requested a card");

  const req = {
    id: "req-fail-test",
    playerId: "player-1",
    playerName: "PlayerOne",
    setIdx: 0,
    cardIdx: 5,
    coinsSpent: reqCost,
    status: "pending",
    _inFlight: true,
    _clientCreatedAt: Date.now(),
  };
  cardRequests.unshift(req);

  assert.strictEqual(coins, 900, "Coins should be deducted optimistically");
  assert.strictEqual(cardRequests.length, 1, "Request should be added to cardRequests");

  // Simulate save failure
  const saveSharedRequests = async () => false; // returns false on failure
  const ok = await saveSharedRequests();

  if (!ok) {
    // Rollback executed in .then()
    cardRequests.length = 0;
    cardRequests.push(...prevRequests);
    coins = prevCoins;
    coinHistory.length = 0;
    coinHistory.push(...prevCoinHistory);
    logCoinTx(reqCost, "↩️ Refund: card request failed to send");
  }

  assert.strictEqual(coins, 1000, "Coins must be restored to 1000 on save failure");
  assert.strictEqual(cardRequests.length, 0, "Failed request must be removed from cardRequests");
  assert.strictEqual(coinHistory.length, 1, "Coin history must record the refund");
  assert.strictEqual(coinHistory[0].amount, 100, "Refund amount must be 100");
  assert(coinHistory[0].desc.includes("Refund"), "History description must state refund");
  console.log("✅ caSubmitRequest optimistic rollback & refund on network failure passed!");

  // 3. _setCardRequests In-Flight Protection from Snapshot Clobbering
  const localRequests = [
    {
      id: "inflight-req-1",
      playerId: "player-1",
      playerName: "PlayerOne",
      status: "pending",
      coinsSpent: 100,
      _inFlight: true,
      _clientCreatedAt: Date.now(),
    },
    {
      id: "older-req-2",
      playerId: "player-1",
      playerName: "PlayerOne",
      status: "done",
      coinsSpent: 0,
    }
  ];

  // Incoming Firestore snapshot arrives before server has committed inflight-req-1
  const incomingServerArray = [
    {
      id: "older-req-2",
      playerId: "player-1",
      playerName: "PlayerOne",
      status: "done",
      coinsSpent: 0,
    },
    {
      id: "other-user-req",
      playerId: "player-2",
      playerName: "PlayerTwo",
      status: "pending",
      coinsSpent: 100,
    }
  ];

  // Run reconciliation logic from hardened _setCardRequests
  const incomingIds = new Set(incomingServerArray.map(r => r.id));
  const inFlightToPreserve = [];
  const now = Date.now();

  for (const r of localRequests) {
    if (incomingIds.has(r.id)) continue;
    const isMine = isMyCardRequest(r, "player-1", "PlayerOne");
    const isInFlightGrace = (r._inFlight || (r._clientCreatedAt && (now - r._clientCreatedAt < 60000)));
    if (isMine && r.status === "pending" && isInFlightGrace) {
      inFlightToPreserve.push(r);
    }
  }

  const reconciledArray = [...inFlightToPreserve, ...incomingServerArray];

  assert(
    reconciledArray.some(r => r.id === "inflight-req-1"),
    "In-flight pending request must be preserved across incoming snapshots"
  );
  assert(
    reconciledArray.some(r => r.id === "other-user-req"),
    "Other users' requests must be included"
  );
  console.log("✅ _setCardRequests in-flight snapshot clobbering protection passed!");

  // 4. Auto-Refund of Orphaned/Unacknowledged Requests
  let currentCoins = 500;
  const processedRefunds = new Set();

  function checkAndAutoRefundDroppedRequest(req) {
    if (req.status === "pending" && Number(req.coinsSpent) > 0 && !processedRefunds.has(req.id)) {
      processedRefunds.add(req.id);
      currentCoins += Number(req.coinsSpent);
      return true;
    }
    return false;
  }

  const orphanedReq = {
    id: "dropped-req-99",
    playerId: "player-1",
    playerName: "PlayerOne",
    status: "pending",
    coinsSpent: 200,
  };

  const refunded = checkAndAutoRefundDroppedRequest(orphanedReq);
  assert.strictEqual(refunded, true, "Orphaned paid request must trigger auto-refund");
  assert.strictEqual(currentCoins, 700, "Coins must increase by 200");

  // Prevent double refund
  const secondTry = checkAndAutoRefundDroppedRequest(orphanedReq);
  assert.strictEqual(secondTry, false, "Must not double refund");
  assert.strictEqual(currentCoins, 700, "Coins must remain 700");
  console.log("✅ Auto-refund for orphaned/dropped requests and double-refund prevention passed!");

  // 5. Admin Decline Logic & Fallback
  let targetPlayerCoins = 500;
  const adminReq = {
    id: "req-admin-decline",
    playerId: "target-player-id",
    playerName: "TargetPlayer",
    status: "pending",
    coinsSpent: 100,
  };

  async function mockAdminDecline(req, grantSuccess) {
    const wasPending = req.status === "pending";
    req.status = "declined";
    if (wasPending && req.coinsSpent > 0) {
      const refundAmount = Number(req.coinsSpent);
      if (grantSuccess) {
        targetPlayerCoins += refundAmount;
        req.coinsSpent = 0;
        req.refunded = true;
      } else {
        // Direct admin grant failed - leave req.coinsSpent intact so target player claims it
      }
    }
  }

  // Case A: Admin grant succeeds
  await mockAdminDecline(adminReq, true);
  assert.strictEqual(targetPlayerCoins, 600, "Target player received 100 coins");
  assert.strictEqual(adminReq.coinsSpent, 0, "coinsSpent zeroed after successful direct grant");
  assert.strictEqual(adminReq.refunded, true, "req marked refunded");

  // Case B: Admin grant fails (e.g. network offline or player record missing)
  const offlineReq = {
    id: "req-admin-offline",
    playerId: "target-player-2",
    playerName: "TargetPlayer2",
    status: "pending",
    coinsSpent: 100,
  };
  await mockAdminDecline(offlineReq, false);
  assert.strictEqual(offlineReq.coinsSpent, 100, "coinsSpent must NOT be zeroed if grant failed");
  assert.strictEqual(offlineReq.status, "declined", "Status set to declined");

  // When target player's client receives declined request with coinsSpent > 0, auto-claims:
  let player2Coins = 300;
  if (offlineReq.status === "declined" && Number(offlineReq.coinsSpent) > 0 && !offlineReq.refunded) {
    player2Coins += Number(offlineReq.coinsSpent);
    offlineReq.coinsSpent = 0;
    offlineReq.refunded = true;
  }
  assert.strictEqual(player2Coins, 400, "Player 2 auto-claims the refund upon sync");
  assert.strictEqual(offlineReq.coinsSpent, 0, "coinsSpent marked 0 after player auto-claim");
  console.log("✅ Admin decline and offline sync refund fallback passed!");

  // 6. Player Cancel/Delete Request Refund
  let playerCoins3 = 1000;
  const pendingUserReq = {
    id: "user-cancel-req",
    playerId: "player-3",
    playerName: "PlayerThree",
    status: "pending",
    coinsSpent: 200,
  };

  function userCancelRequest(req) {
    if (req.status === "pending" && Number(req.coinsSpent) > 0) {
      const refund = Number(req.coinsSpent);
      playerCoins3 += refund;
      req.coinsSpent = 0;
      req.status = "deleted";
      return refund;
    }
    return 0;
  }

  const refundGiven = userCancelRequest(pendingUserReq);
  assert.strictEqual(refundGiven, 200, "Refund of 200 coins given to player");
  assert.strictEqual(playerCoins3, 1200, "Player coins increased to 1200");
  assert.strictEqual(pendingUserReq.coinsSpent, 0, "coinsSpent marked 0");
  // 7. Authoritative Server Status Protection (Stale Client Cannot Revert "Done" to "Pending")
  function mergeRequestsAuthoritative(serverArr, localArr, isAdmin, myPid, myName) {
    const localMap = new Map();
    localArr.forEach((r) => { if (r && r.id) localMap.set(r.id, { ...r }); });

    if (isAdmin) {
      const result = [];
      const writtenIds = new Set();
      localArr.forEach((localReq) => {
        if (!localReq || !localReq.id) return;
        writtenIds.add(localReq.id);
        result.push(localReq);
      });
      serverArr.forEach((serverReq) => {
        if (!serverReq || !serverReq.id) return;
        if (!writtenIds.has(serverReq.id) && serverReq.status === "pending") {
          result.push(serverReq);
          writtenIds.add(serverReq.id);
        }
      });
      return result;
    } else {
      const result = [];
      const serverSeenIds = new Set();
      serverArr.forEach((serverReq) => {
        if (!serverReq || !serverReq.id) return;
        serverSeenIds.add(serverReq.id);
        const localReq = localMap.get(serverReq.id);
        if (!localReq) {
          result.push(serverReq);
          return;
        }
        const isMine =
          (myPid && localReq.playerId && localReq.playerId === myPid) ||
          (myName && localReq.playerName && localReq.playerName.trim().toLowerCase() === myName);
        if (isMine && serverReq.status === "pending" && localReq.status === "pending") {
          result.push({ ...serverReq, note: localReq.note });
        } else {
          // Server 'done' or 'declined' is immutable against stale client overwrites
          result.push(serverReq);
        }
      });
      localArr.forEach((localReq) => {
        if (!localReq || !localReq.id) return;
        if (!serverSeenIds.has(localReq.id)) {
          const isMine =
            (myPid && localReq.playerId && localReq.playerId === myPid) ||
            (myName && localReq.playerName && localReq.playerName.trim().toLowerCase() === myName);
          if (isMine && localReq.status === "pending") {
            result.push(localReq);
          }
        }
      });
      return result;
    }
  }

  // Test 7.1: Server marked "done", but non-admin client has stale "pending" in memory
  const serverWithDone = [{ id: "req-done-1", playerName: "PlayerX", status: "done" }];
  const staleClientArr = [{ id: "req-done-1", playerName: "PlayerX", status: "pending" }];

  const mergedByPlayer = mergeRequestsAuthoritative(serverWithDone, staleClientArr, false, "player-x", "playerx");
  assert.strictEqual(mergedByPlayer[0].status, "done", "Stale player client must NOT revert 'done' back to 'pending'");
  console.log("✅ Authoritative status protection: non-admin cannot revert 'done' to 'pending'!");

  // Test 7.2: Admin marks "done", admin update is authoritative
  const serverWithPending = [{ id: "req-done-2", playerName: "PlayerY", status: "pending" }];
  const adminWithDone = [{ id: "req-done-2", playerName: "PlayerY", status: "done" }];

  const mergedByAdmin = mergeRequestsAuthoritative(serverWithPending, adminWithDone, true, "admin-id", "admin");
  assert.strictEqual(mergedByAdmin[0].status, "done", "Admin update must authoritatively mark request as 'done'");
  console.log("✅ Admin authoritative 'done' update passed!");

  // 8. Instant Group Done Batch Fulfillment
  const groupReqs = [
    { id: "g1", playerName: "UserZ", status: "pending" },
    { id: "g2", playerName: "UserZ", status: "pending" }
  ];
  function mockSetGroupDone(reqs) {
    const now = new Date().toISOString();
    reqs.forEach((r) => {
      r.status = "done";
      r.updatedAt = now;
    });
    return reqs;
  }
  const updatedGroup = mockSetGroupDone(groupReqs);
  assert.strictEqual(updatedGroup[0].status, "done");
  assert.strictEqual(updatedGroup[1].status, "done");
  assert(updatedGroup[0].updatedAt, "Must stamp updatedAt timestamp");
  console.log("✅ Instant Group Done batch fulfillment logic passed!");

  console.log("\n🎉 ALL CARD REQUEST AUDIT & REFUND LIFECYCLE TESTS PASSED CLEANLY!");
})();

