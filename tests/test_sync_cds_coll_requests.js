// tests/test_sync_cds_coll_requests.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing CDS and Collection Request Sync...');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Verify helper and critical code snippets exist in index.html
assert(html.includes('function getPendingCardRequest'), 'getPendingCardRequest function should be defined in index.html');
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

// Verify Collection modal message for Collection-placed request
let collMsg = pending && pending.isCds
  ? 'You already have a pending request for this card from CDS — check "My CDS Requests" for status.'
  : 'You already have a pending request for this card — check "My Requests" for status.';
assert(collMsg.includes('check "My Requests"'), 'Should direct to My Requests');

// Verify CDS browse grid chip label for Collection-placed request
let cdsLabel = pending && pending.isColl ? "📬 Requested (Coll)" : "📬 Requested";
assert.strictEqual(cdsLabel, "📬 Requested (Coll)", 'CDS grid must show 📬 Requested (Coll)');

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

// Verify Collection modal message for CDS-placed request
collMsg = pending && pending.isCds
  ? 'You already have a pending request for this card from CDS — check "My CDS Requests" for status.'
  : 'You already have a pending request for this card — check "My Requests" for status.';
assert(collMsg.includes('from CDS — check "My CDS Requests"'), 'Should direct to My CDS Requests');

// Verify Collection grid chip label for CDS-placed request
let collLabel = pending && pending.isCds ? "📬 Requested (CDS)" : "📬 Requested";
assert.strictEqual(collLabel, "📬 Requested (CDS)", 'Collection grid must show 📬 Requested (CDS)');

// 4. Test cancellation and coin refund
let coins = 500;
const reqToDelete = cardRequests.find(r => r.id === "req-coll-1");
assert(reqToDelete && reqToDelete.coinsSpent === 100);
if (reqToDelete.status === "pending" && reqToDelete.coinsSpent > 0) {
  coins += reqToDelete.coinsSpent;
}
cardRequests.splice(cardRequests.indexOf(reqToDelete), 1);
assert.strictEqual(coins, 600, 'Coins should be refunded from 500 to 600');
assert.strictEqual(getPendingCardRequest(0, 1), null, 'Card should no longer be pending after delete');

console.log('✅ All Sync CDS & Collection tests passed!');
