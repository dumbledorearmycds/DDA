const fs = require('fs');

const expectedStars = {
  1: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  2: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  3: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3],
  4: [1, 1, 1, 1, 1, 2, 2, 2, 3, 3],
  5: [1, 1, 1, 1, 2, 2, 2, 3, 3, 4],
  6: [1, 1, 1, 2, 2, 2, 3, 3, 4, 5],
  7: [1, 2, 2, 2, 2, 3, 3, 4, 4, 5],
  8: [2, 2, 2, 2, 2, 3, 3, 4, 5, 5],
  9: [2, 2, 2, 3, 3, 3, 4, 5, 5, 5],
  10: [2, 2, 2, 3, 3, 3, 4, 5, 5, 5],
  11: [2, 2, 3, 3, 3, 4, 4, 5, 5, 5],
  12: [3, 3, 3, 4, 4, 4, 5, 5, 5, 5],
  13: [3, 3, 4, 4, 5, 5, 5, 5, 5, 5],
  14: [4, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  15: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
};

const expectedGold = {
  7: [9],         // Harvester
  8: [9],         // Sleeping Man
  9: [8, 9],      // Mummy, Makeup Artist
  10: [8, 9],     // Knitting, Park Stroll
  11: [8, 9],     // Decorating, Fireworks
  12: [8, 9],     // Trick or Treat, Baking
  13: [7, 8, 9],  // Wreath, Turkey, Parade
  14: [7, 8, 9],  // Sale, Online Deals, Shopping
  15: []          // All silver in reference PDF
};

const content = fs.readFileSync('index.html', 'utf8');

// Extract SETS definition
const sIdx = content.indexOf('const SETS = [');
const setsMatch = content.slice(sIdx).match(/const SETS = \[[\s\S]*?\r?\n\s*\];/);
if (!setsMatch) {
  console.error('Failed to extract SETS from index.html');
  process.exit(1);
}

// Evaluate SETS in a sandbox
const fn = new Function(setsMatch[0] + '\nreturn SETS;');
const sets = fn();

console.log(`Loaded ${sets.length} sets from index.html`);
if (sets.length !== 15) {
  console.error(`Expected 15 sets, got ${sets.length}`);
  process.exit(1);
}

let totalCardsChecked = 0;
let errors = 0;

sets.forEach((set, sIdx) => {
  const setNum = sIdx + 1;
  const expStars = expectedStars[setNum];
  const expGoldIndices = expectedGold[setNum] || [];

  if (set.cards.length !== 10) {
    console.error(`Set ${setNum} (${set.name}) has ${set.cards.length} cards, expected 10`);
    errors++;
  }

  set.cards.forEach((card, cIdx) => {
    totalCardsChecked++;
    const expectedStarCount = expStars[cIdx];
    const isGoldExpected = expGoldIndices.includes(cIdx);

    if (card.stars !== expectedStarCount) {
      console.error(`[ERROR] Set ${setNum} Card ${cIdx + 1} (${card.name}): expected stars ${expectedStarCount}, got ${card.stars}`);
      errors++;
    }

    const actualGold = !!card.gold;
    if (actualGold !== isGoldExpected) {
      console.error(`[ERROR] Set ${setNum} Card ${cIdx + 1} (${card.name}): expected gold=${isGoldExpected}, got gold=${actualGold}`);
      errors++;
    }
  });
});

console.log(`Checked ${totalCardsChecked} cards across 15 sets.`);
if (errors === 0) {
  console.log('🎉 ALL 150 CARDS HAVE 100% CORRECT STARS AND GOLD STATUSES MATCHING REFERENCE DATA!');
} else {
  console.error(`❌ Found ${errors} errors.`);
  process.exit(1);
}
