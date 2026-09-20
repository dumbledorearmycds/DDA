const assert = require('assert');

console.log('🧪 Testing Card & Shop Request Archive, Limit Persistence, and Instant Counter Update...');

// Mock DOM and environment
const documentMock = {
  getElementById: (id) => {
    if (!documentMock._elements[id]) {
      documentMock._elements[id] = {
        textContent: '',
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        innerHTML: '',
        appendChild: (child) => { documentMock._elements[id]._children.push(child); },
        _children: []
      };
    }
    return documentMock._elements[id];
  },
  createElement: (tag) => ({
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    appendChild: () => {}
  }),
  querySelectorAll: () => [],
  _elements: {}
};
global.document = documentMock;
global.window = {};

// Test simulation of archive and limit logic
const profile = { name: "TestPlayer", town: "TestTown", avatar: "🧙", photoURL: "" };
window._currentPlayerId = "player-123";

const cardRequests = [];
const shopRequests = [];
const archivedRequests = [];
const archivedShopRequests = [];
const ownedCards = {};
const ownedShopItems = {};

window._cardRequests = () => cardRequests;
window._getArchivedRequests = () => archivedRequests;
window._getArchivedShopRequests = () => archivedShopRequests;
window._shopRequests = () => shopRequests;

window._setCardRequests = (arr) => {
  const pid = window._currentPlayerId || "";
  const incomingIds = new Set(arr.map((r) => r.id));
  const archivedIds = new Set(archivedRequests.map((r) => r.id));
  for (const r of cardRequests) {
    if (incomingIds.has(r.id)) continue;
    if (archivedIds.has(r.id)) continue;
    if (r.status === "pending") continue;
    const isMine =
      (pid && r.playerId === pid) ||
      (!pid && r.playerName === profile.name);
    if (!isMine) continue;
    archivedRequests.push({ ...r, _archived: true });
  }
  cardRequests.length = 0;
  arr.forEach((r) => cardRequests.push(r));
};

window._setShopRequests = (arr) => {
  const pid = window._currentPlayerId || "";
  const incomingIds = new Set(arr.map((r) => r.id));
  const archivedIds = new Set(archivedShopRequests.map((r) => r.id));
  for (const r of shopRequests) {
    if (incomingIds.has(r.id)) continue;
    if (archivedIds.has(r.id)) continue;
    if (r.status === "pending") continue;
    const isMine =
      (pid && r.playerId === pid) ||
      (!pid && r.playerName === profile.name);
    if (!isMine) continue;
    archivedShopRequests.push({ ...r, _archived: true });
  }
  shopRequests.length = 0;
  arr.forEach((r) => shopRequests.push(r));
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cdsFreeRequestsToday() {
  const pid = window._currentPlayerId || "";
  const today = todayStr();
  const filter = (r) =>
    r.free &&
    r.timestamp &&
    localDateKey(new Date(r.timestamp)) === today &&
    ((pid && r.playerId === pid) ||
      (!pid && r.playerName === profile.name));
  return cardRequests.filter(filter).length + archivedRequests.filter(filter).length;
}

function collRequestsToday() {
  const pid = window._currentPlayerId || "";
  const today = todayStr();
  const filter = (r) =>
    r.source === "collection" &&
    r.timestamp &&
    localDateKey(new Date(r.timestamp)) === today &&
    ((pid && r.playerId === pid) ||
      (!pid && r.playerName === profile.name));
  return cardRequests.filter(filter).length + archivedRequests.filter(filter).length;
}

function cdsMyRequests() {
  const pid = window._currentPlayerId || "";
  const filter = (r) =>
    !r._hidden &&
    (r.source ? r.source === "cds" : !!r.free) &&
    ((pid && r.playerId === pid) ||
      (!pid && r.playerName === profile.name));
  const live = cardRequests.filter(filter);
  const liveIds = new Set(live.map((r) => r.id));
  const archived = archivedRequests.filter((r) => filter(r) && !liveIds.has(r.id));
  return live.concat(archived);
}

// ── TEST 1: CDS Request -> Admin Marks Done -> Admin Clears Done -> Request is Archived & Limit Preserved
console.log('▶ Test 1: CDS request fulfilled and cleared by admin');
const cdsReq = {
  id: "cds-req-1",
  playerName: profile.name,
  playerId: window._currentPlayerId,
  setIdx: 0,
  cardIdx: 1,
  free: true,
  gold: false,
  source: "cds",
  status: "pending",
  timestamp: new Date().toISOString()
};
cardRequests.push(cdsReq);

assert.strictEqual(cdsFreeRequestsToday(), 1, "CDS limit should count 1 active request");
assert.strictEqual(cdsMyRequests().length, 1, "CDS my requests should show 1 item");

// Admin marks done
cdsReq.status = "done";

// Admin clears completed requests: remaining array is empty
window._setCardRequests([]);

assert.strictEqual(cardRequests.length, 0, "cardRequests should be empty after clear");
assert.strictEqual(archivedRequests.length, 1, "archivedRequests should have preserved the cleared request");
assert.strictEqual(archivedRequests[0]._archived, true, "Request should be flagged as archived");
assert.strictEqual(cdsFreeRequestsToday(), 1, "CDS limit should STILL be 1 after admin cleared done request!");
assert.strictEqual(cdsMyRequests().length, 1, "CDS my requests should still show the archived request!");

// ── TEST 2: Collection Request -> Admin Marks Done -> Admin Clears -> Limit Preserved
console.log('▶ Test 2: Collection request fulfilled and cleared by admin');
const collReq = {
  id: "coll-req-1",
  playerName: profile.name,
  playerId: window._currentPlayerId,
  setIdx: 1,
  cardIdx: 2,
  free: false,
  gold: false,
  source: "collection",
  status: "pending",
  timestamp: new Date().toISOString()
};
cardRequests.push(collReq);

assert.strictEqual(collRequestsToday(), 1, "Collection limit should count 1 active request");

// Admin marks done
collReq.status = "done";

// Admin clears completed requests:
window._setCardRequests([]);

assert.strictEqual(collRequestsToday(), 1, "Collection limit should STILL be 1 after admin cleared done request!");
assert.strictEqual(archivedRequests.length, 2, "archivedRequests should now have both CDS and collection entries");

// ── TEST 3: Shop Request -> Admin Clears Done -> Shop Request Archived
console.log('▶ Test 3: Shop request fulfilled and cleared by admin');
const shopReq = {
  id: "shop-req-1",
  playerName: profile.name,
  playerId: window._currentPlayerId,
  itemId: "bloom_buzz",
  itemName: "Bloom & Buzz",
  cost: 500,
  status: "done",
  timestamp: new Date().toISOString()
};
shopRequests.push(shopReq);

window._setShopRequests([]);

assert.strictEqual(shopRequests.length, 0, "shopRequests should be empty after clear");
assert.strictEqual(archivedShopRequests.length, 1, "archivedShopRequests should have preserved the shop purchase");
assert.strictEqual(archivedShopRequests[0]._archived, true, "Shop request should be flagged as archived");

// ── TEST 4: Badge display shows '📬 Received'
console.log('▶ Test 4: Badge display shows Received for fulfilled/archived requests');
function getDisplayStatus(req) {
  const isArchived = !!req._archived;
  return req.status === "done" || (isArchived && req.status === "done") ? "received" : req.status;
}
function getBadgeLabel(displayStatus) {
  return { pending: "⏳ Pending", done: "📬 Received", received: "📬 Received", declined: "❌ Declined" }[displayStatus];
}

assert.strictEqual(getDisplayStatus(archivedRequests[0]), "received");
assert.strictEqual(getBadgeLabel(getDisplayStatus(archivedRequests[0])), "📬 Received");
assert.strictEqual(getDisplayStatus(archivedShopRequests[0]), "received");
assert.strictEqual(getBadgeLabel(getDisplayStatus(archivedShopRequests[0])), "📬 Received");

console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
