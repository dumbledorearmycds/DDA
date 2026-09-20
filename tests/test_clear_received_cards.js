const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("=== Testing Clear All Received Cards in Collection & CDS ===");

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Check DOM Elements
assert(html.includes('id="collReqToolbar"'), 'collReqToolbar missing in index.html');
assert(html.includes('id="collClearReceivedBtn"'), 'collClearReceivedBtn missing in index.html');
assert(html.includes('clearAllReceivedCards(\'collection\')'), 'collClearReceivedBtn onclick missing');

assert(html.includes('id="cdsReqToolbar"'), 'cdsReqToolbar missing in index.html');
assert(html.includes('id="cdsClearReceivedBtn"'), 'cdsClearReceivedBtn missing in index.html');
assert(html.includes('clearAllReceivedCards(\'cds\')'), 'cdsClearReceivedBtn onclick missing');

console.log("✅ DOM element IDs and onclick attributes verified.");

// 2. Check CSS definitions
assert(html.includes('.my-req-toolbar'), 'CSS class .my-req-toolbar missing');
assert(html.includes('.btn-clear-received'), 'CSS class .btn-clear-received missing');
assert(html.includes('.btn-clear-received:disabled'), 'CSS class .btn-clear-received:disabled missing');

console.log("✅ CSS classes verified.");

// 3. Check Function definitions
assert(html.includes('function clearAllReceivedCards(scope)'), 'clearAllReceivedCards function missing');
assert(html.includes('window.clearAllReceivedCards = clearAllReceivedCards'), 'window.clearAllReceivedCards export missing');

console.log("✅ JS function signature and window export verified.");

// 4. Functional / Logic Verification
// Simulate the function logic in a controlled sandbox environment
let savedProgress = false;
let savedSharedRequests = false;
let renderedColl = false;
let renderedCds = false;
let toastMessage = "";

const mockWindow = {
  _currentPlayerId: "player-123",
  saveSharedRequests: () => { savedSharedRequests = true; }
};
const mockProfile = { name: "Tester" };
const mockSaveProgress = () => { savedProgress = true; };
const mockShowToast = (msg) => { toastMessage = msg; };
const mockRenderMyRequests = () => { renderedColl = true; };
const mockRenderMyCdsRequests = () => { renderedCds = true; };
const mockRenderCollGrid = () => {};
const mockRefreshMyReqPill = () => {};
const mockRefreshCdsReqPill = () => {};

// Extract clearAllReceivedCards body from index.html
const fnMatch = html.match(/function clearAllReceivedCards\(scope\)\s*\{([\s\S]*?)\r?\n\s*\}\r?\n\s*window\.clearAllReceivedCards/);
assert(fnMatch, "Could not extract clearAllReceivedCards body from index.html");

const fnBody = fnMatch[1];
const clearAllReceivedCards = new Function(
  'scope', 'window', 'profile', 'cardRequests', 'archivedRequests',
  'saveProgress', 'showToast', 'renderMyRequests', 'renderMyCdsRequests',
  'renderCollGrid', 'refreshMyReqPill', 'refreshCdsReqPill',
  fnBody
);

// Test Collection Clear
let testCardReqs = [
  { id: 'c1', playerId: 'player-123', status: 'done', source: 'collection' }, // Should clear
  { id: 'c2', playerId: 'player-123', status: 'pending', source: 'collection' }, // Should keep
  { id: 'c3', playerId: 'player-456', status: 'done', source: 'collection' }, // Other player: keep
  { id: 'c4', playerId: 'player-123', status: 'done', source: 'cds' }, // CDS: keep
  { id: 'c5', playerId: 'player-123', status: 'done', free: true }, // Free CDS: keep
];

let testArchivedReqs = [
  { id: 'a1', playerId: 'player-123', status: 'done', source: 'collection' }, // Should clear
  { id: 'a2', playerId: 'player-123', status: 'done', source: 'cds' }, // CDS: keep
];

clearAllReceivedCards(
  'collection', mockWindow, mockProfile, testCardReqs, testArchivedReqs,
  mockSaveProgress, mockShowToast, mockRenderMyRequests, mockRenderMyCdsRequests,
  mockRenderCollGrid, mockRefreshMyReqPill, mockRefreshCdsReqPill
);

assert.strictEqual(testCardReqs[0]._hidden, true, 'c1 should be _hidden: true');
assert.strictEqual(testCardReqs[1]._hidden, undefined, 'c2 should NOT be hidden (pending)');
assert.strictEqual(testCardReqs[2]._hidden, undefined, 'c3 should NOT be hidden (other player)');
assert.strictEqual(testCardReqs[3]._hidden, undefined, 'c4 should NOT be hidden (is cds)');
assert.strictEqual(testCardReqs[4]._hidden, undefined, 'c5 should NOT be hidden (is free/cds)');
assert.strictEqual(testArchivedReqs[0]._hidden, true, 'a1 should be _hidden: true');
assert.strictEqual(testArchivedReqs[1]._hidden, undefined, 'a2 should NOT be hidden (is cds)');

assert.strictEqual(savedProgress, true, 'saveProgress should have been called');
assert.strictEqual(savedSharedRequests, true, 'saveSharedRequests should have been called');
assert.strictEqual(renderedColl, true, 'renderMyRequests should have been called');
assert(toastMessage.includes('Cleared 2 received card'), `Toast should report 2 cleared, got: ${toastMessage}`);

console.log("✅ Collection scope clear verified successfully!");

// Reset mocks and test CDS Clear
savedProgress = false;
savedSharedRequests = false;
renderedColl = false;
renderedCds = false;
toastMessage = "";

clearAllReceivedCards(
  'cds', mockWindow, mockProfile, testCardReqs, testArchivedReqs,
  mockSaveProgress, mockShowToast, mockRenderMyRequests, mockRenderMyCdsRequests,
  mockRenderCollGrid, mockRefreshMyReqPill, mockRefreshCdsReqPill
);

assert.strictEqual(testCardReqs[3]._hidden, true, 'c4 should be _hidden: true now');
assert.strictEqual(testCardReqs[4]._hidden, true, 'c5 should be _hidden: true now');
assert.strictEqual(testArchivedReqs[1]._hidden, true, 'a2 should be _hidden: true now');
assert.strictEqual(testCardReqs[1]._hidden, undefined, 'c2 should still be unhidden');
assert.strictEqual(testCardReqs[2]._hidden, undefined, 'c3 should still be unhidden');
assert.strictEqual(renderedCds, true, 'renderMyCdsRequests should have been called');
assert(toastMessage.includes('Cleared 3 received card'), `Toast should report 3 cleared, got: ${toastMessage}`);

console.log("✅ CDS scope clear verified successfully!");

console.log("🎉 ALL TESTS PASSED!");
