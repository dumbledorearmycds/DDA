const assert = require('assert');

// Simulate SETS
const mockSets = [
  {
    name: 'Set 1 – Hogwarts Artifacts',
    cards: [
      { name: 'Gryffindor Sword', gold: true, emoji: '🗡️' },
      { name: 'Elder Wand', gold: true, emoji: '🪄' },
      { name: 'Chocolate Frog', gold: false, emoji: '🐸' }
    ]
  },
  {
    name: 'Set 2 – Spells & Charms',
    cards: [
      { name: 'Patronus', gold: true, emoji: '🦌' },
      { name: 'Lumos', gold: false, emoji: '💡' }
    ]
  }
];

// Fragment Cache Store
const collFragmentCache = {};
const cdsFragmentCache = {};

function getCollSetFragmentHTML(setIdx, sets) {
  if (collFragmentCache[setIdx]) return collFragmentCache[setIdx];
  const set = sets[setIdx];
  if (!set) return '';
  const html = set.cards.map((card, ci) => `
    <div class="coll-card ${card.gold ? 'is-gold' : ''}" data-ci="${ci}">
      <div class="card-badge-hole"></div>
      <div class="card-req-hole"></div>
      <div class="locked-fade">
        <div class="coll-card-art">${card.emoji}</div>
        <div class="coll-card-name">${card.name}</div>
        <div class="coll-card-number">${ci + 1}</div>
      </div>
    </div>
  `).join('');
  collFragmentCache[setIdx] = html;
  return html;
}

function getCdsSetFragmentHTML(setIdx, sets) {
  if (cdsFragmentCache[setIdx]) return cdsFragmentCache[setIdx];
  const set = sets[setIdx];
  if (!set) return '';
  const html = set.cards.map((card, ci) => `
    <div class="coll-card ${card.gold ? 'is-gold' : ''}" data-ci="${ci}">
      <div class="card-badge-hole"></div>
      <div class="card-req-hole"></div>
      <div class="coll-card-art">${card.emoji}</div>
      <div class="coll-card-name">${card.name}</div>
      <div class="coll-card-number">${ci + 1}</div>
    </div>
  `).join('');
  cdsFragmentCache[setIdx] = html;
  return html;
}

// Minimal DOM mock
class MockElement {
  constructor(tag, className = '') {
    this.tagName = tag;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      toggle(cls, val) {
        if (val) this._classes.add(cls);
        else this._classes.delete(cls);
      },
      contains(cls) { return this._classes.has(cls); }
    };
    this.innerHTML = '';
    this.children = [];
    this.dataset = {};
    this.title = '';
  }
  querySelector(sel) {
    return this.children.find(c => c.className && c.className.includes(sel.replace('.', '')));
  }
}

function hydrateCollCardHoles(cardEl, { isOwned, dupes, isNew, alreadyRequested, isGold, reqCost }) {
  cardEl.classList.toggle('unlocked', !!isOwned);
  cardEl.classList.toggle('locked', !isOwned);
  cardEl.classList.toggle('is-new', !!isNew);
  cardEl.classList.toggle('has-dupes', dupes > 0);
  cardEl.classList.toggle('is-gold', !!isGold);
  cardEl.classList.toggle('requested', !!alreadyRequested);

  const badgeHole = cardEl.querySelector('.card-badge-hole');
  if (badgeHole) {
    if (isGold) badgeHole.innerHTML = '<div class="gold-badge">🌟 GOLD</div>';
    else if (isNew) badgeHole.innerHTML = '<div class="new-badge">NEW!</div>';
    else if (dupes > 0) badgeHole.innerHTML = `<div class="dupe-badge">x${dupes + 1}</div>`;
    else badgeHole.innerHTML = '';
  }

  const reqHole = cardEl.querySelector('.card-req-hole');
  if (reqHole) {
    reqHole.innerHTML = alreadyRequested ? '<div class="req-tick">📬</div><div class="req-label">📬 Requested</div>' : '';
  }

  cardEl.title = isOwned ? 'Tap for card actions' : `Tap to request this card • ${reqCost} 🪙`;
}

function hydrateCdsCardHoles(cardEl, { isOwned, pendingFreeReq, isGold, goldLimitReached, goldUsedToday, goldFreeLimit }) {
  cardEl.classList.toggle('unlocked', !!isOwned);
  cardEl.classList.toggle('locked', !isOwned);
  cardEl.classList.toggle('requested', !!pendingFreeReq);
  cardEl.classList.toggle('is-gold', !!isGold);

  const badgeHole = cardEl.querySelector('.card-badge-hole');
  if (badgeHole) {
    badgeHole.innerHTML = isGold ? '<div class="gold-badge">🌟 GOLD</div>' : '';
  }

  const reqHole = cardEl.querySelector('.card-req-hole');
  if (reqHole) {
    if (pendingFreeReq) {
      reqHole.innerHTML = '<div class="req-tick">📬</div><div class="req-label">📬 Requested</div>';
    } else if (isGold) {
      const remaining = Math.max(0, goldFreeLimit - goldUsedToday);
      reqHole.innerHTML = `<div class="req-label" style="color:#ffd700">${remaining}/${goldFreeLimit} gold free</div>`;
    } else if (isOwned) {
      reqHole.innerHTML = '<div class="req-label" style="opacity:.6">✅ Owned</div>';
    } else {
      reqHole.innerHTML = '';
    }
  }

  cardEl.title = pendingFreeReq ? 'Tap to cancel this request' : 'Tap to request this card free';
}

function runTests() {
  // Test 1: Fragment generation & Caching
  const html0 = getCollSetFragmentHTML(0, mockSets);
  assert(html0.includes('Gryffindor Sword'));
  assert(html0.includes('data-ci="0"'));
  assert(html0.includes('card-badge-hole'));
  assert(html0.includes('card-req-hole'));

  // Cache hit
  const html0_again = getCollSetFragmentHTML(0, mockSets);
  assert.strictEqual(html0, html0_again, 'Second call should return exact cached string');

  // Test 2: Selective Hydration for Collection Grid
  const cardDiv = new MockElement('div', 'coll-card is-gold');
  cardDiv.dataset.ci = '0';
  const badgeHole = new MockElement('div', 'card-badge-hole');
  const reqHole = new MockElement('div', 'card-req-hole');
  cardDiv.children.push(badgeHole, reqHole);

  hydrateCollCardHoles(cardDiv, {
    isOwned: true,
    dupes: 1,
    isNew: false,
    alreadyRequested: true,
    isGold: true,
    reqCost: 200
  });

  assert.strictEqual(cardDiv.classList.contains('unlocked'), true);
  assert.strictEqual(cardDiv.classList.contains('locked'), false);
  assert.strictEqual(cardDiv.classList.contains('has-dupes'), true);
  assert.strictEqual(cardDiv.classList.contains('requested'), true);
  assert(badgeHole.innerHTML.includes('🌟 GOLD'));
  assert(reqHole.innerHTML.includes('📬 Requested'));
  assert.strictEqual(cardDiv.title, 'Tap for card actions');

  // Test 3: CDS Card Holes Hydration
  const cdsCardDiv = new MockElement('div', 'coll-card is-gold');
  cdsCardDiv.dataset.ci = '0';
  const cdsBadgeHole = new MockElement('div', 'card-badge-hole');
  const cdsReqHole = new MockElement('div', 'card-req-hole');
  cdsCardDiv.children.push(cdsBadgeHole, cdsReqHole);

  hydrateCdsCardHoles(cdsCardDiv, {
    isOwned: false,
    pendingFreeReq: false,
    isGold: true,
    goldLimitReached: false,
    goldUsedToday: 1,
    goldFreeLimit: 3
  });

  assert.strictEqual(cdsCardDiv.classList.contains('unlocked'), false);
  assert.strictEqual(cdsCardDiv.classList.contains('locked'), true);
  assert(cdsBadgeHole.innerHTML.includes('🌟 GOLD'));
  assert(cdsReqHole.innerHTML.includes('2/3 gold free'));

  console.log('✅ All Fragment Caching & Selective Hydration unit tests passed!');
}

runTests();
