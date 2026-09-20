const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("=== Testing My Collection & CDS Redesign ===");

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify DOM Elements in panel-coll
const expectedCollIds = [
  'panel-coll',
  'collTotal',
  'collProgressFill',
  'collProgressPct',
  'collReqLeft',
  'collReqTotal',
  'collViewCardsBtn',
  'collViewReqBtn',
  'collViewShopBtn',
  'myReqCountPill',
  'collCardsView',
  'collSetTabs',
  'collGrid',
  'collReqView',
  'myReqList',
  'collShopView',
  'collShopGrid'
];

expectedCollIds.forEach(id => {
  assert(html.includes(`id="${id}"`), `Missing expected ID in collection panel: ${id}`);
});

// Assert that active set completion banner was removed
assert(!html.includes('id="collSetBanner"'), 'collSetBanner should have been removed');
console.log(`✅ All ${expectedCollIds.length} Collection panel IDs verified & collSetBanner verified removed.`);

// 2. Verify DOM Elements in panel-cds
const expectedCdsIds = [
  'panel-cds',
  'cdsLockedBanner',
  'cdsStatsRow',
  'cdsFreeLeft',
  'cdsFreeTotal',
  'cdsGoldFreeLeft',
  'cdsViewBrowseBtn',
  'cdsViewReqBtn',
  'cdsReqCountPill',
  'cdsBrowseView',
  'cdsSetTabs',
  'cdsGrid',
  'cdsReqView',
  'cdsReqList'
];

expectedCdsIds.forEach(id => {
  assert(html.includes(`id="${id}"`), `Missing expected ID in CDS panel: ${id}`);
});
assert(!html.includes('class="cds-pool-banner"'), 'cds-pool-banner should have been removed from DOM');
console.log(`✅ All ${expectedCdsIds.length} CDS panel IDs verified & cds-pool-banner verified removed.`);

// 3. Verify CSS classes for redesign
const expectedClasses = [
  '.coll-progress-card',
  '.coll-progress-track',
  '.coll-progress-fill',
  '.coll-quota-row',
  '.coll-quota-pill',
  '.cds-pool-banner',
  '.cds-pool-status',
  '.coll-set-badge',
  '.coll-card',
  '.coll-card-num',
  '.coll-card-art-box',
  '.coll-card-stars',
  '.card-action-chip',
  '.chip-owned',
  '.chip-req',
  '.chip-free',
  '.chip-pending'
];

expectedClasses.forEach(cls => {
  assert(html.includes(cls), `Missing expected CSS class: ${cls}`);
});
console.log(`✅ All ${expectedClasses.length} CSS class selectors verified.`);

// 4. Verify JS functions exist
const expectedFunctions = [
  'function updateCollStats',
  'function renderCollTabs',
  'function _getCollSetFragmentHTML',
  'function hydrateCollGridHoles',
  'function renderCollGrid',
  'function renderCdsTabs',
  'function _getCdsSetFragmentHTML',
  'function hydrateCdsGridHoles',
  'function renderCdsGrid'
];

expectedFunctions.forEach(fn => {
  assert(html.includes(fn), `Missing expected function: ${fn}`);
});
console.log(`✅ All ${expectedFunctions.length} JS functions verified.`);

console.log("🎉 ALL COLLECTION & CDS REDESIGN ASSERTIONS PASSED!");
