const fs = require('fs');

const starsData = {
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

let content = fs.readFileSync('index.html', 'utf8');

// Find the SETS block
const sIdx = content.indexOf('const SETS = [');
if (sIdx === -1) {
  console.error('Could not find const SETS = [');
  process.exit(1);
}

const setsMatch = content.slice(sIdx).match(/const SETS = \[[\s\S]*?\r?\n\s*\];/);
if (!setsMatch) {
  console.error('Could not match SETS block');
  process.exit(1);
}

const oldSetsBlock = setsMatch[0];
console.log('Old SETS block character count:', oldSetsBlock.length);

// We need to parse each set and each card, and insert stars: X into each card
// Let's split by set:
// Each set starts with name: "Set X – ..." or similar
// Let's match each set block
let updatedSetsBlock = oldSetsBlock;

// To be completely safe and surgical, we can iterate through each set 1..15
// and within each set, iterate through its 10 cards.
// Each card has:
//   name: "Card Name",
//   emoji: "...",
//   img: "...",
//   bonus: ...,
//   bg: "...",
// We can insert `stars: N,\r\n` right before `bonus:` or after `img:`.

// Let's verify we can find all 15 sets in order:
const setRegex = /\{\s*name:\s*"Set (\d+)\s*[–-]\s*([^"]+)"[\s\S]*?cards:\s*\[([\s\S]*?)\]\s*,\s*\}/g;
let match;
let setCount = 0;
let cardCount = 0;

// Let's rebuild the SETS block
const newSetsBlock = oldSetsBlock.replace(setRegex, (fullSetMatch, setNumStr, setName, cardsBlock) => {
  const setNum = parseInt(setNumStr, 10);
  setCount++;
  const starsList = starsData[setNum];
  if (!starsList) {
    throw new Error('No stars data for set ' + setNum);
  }

  // Split cardsBlock into individual card blocks
  // Each card is { ... }
  let cardIdx = 0;
  const newCardsBlock = cardsBlock.replace(/\{\s*name:\s*"([^"]+)"[\s\S]*?\}/g, (cardMatch, cardName) => {
    const stars = starsList[cardIdx];
    cardIdx++;
    cardCount++;

    // Check if stars is already present
    let updatedCard = cardMatch;
    if (/stars:\s*\d+,?/.test(updatedCard)) {
      updatedCard = updatedCard.replace(/stars:\s*\d+,?/, `stars: ${stars},`);
    } else {
      // Insert stars: N before bonus:
      updatedCard = updatedCard.replace(/(\s*)(bonus:\s*\d+,)/, `$1stars: ${stars},$1$2`);
    }

    // In set 15, remove gold: true if present to match silver frames from PDF
    if (setNum === 15) {
      updatedCard = updatedCard.replace(/\r?\n\s*gold:\s*true,/, '');
    }

    return updatedCard;
  });

  if (cardIdx !== 10) {
    throw new Error(`Set ${setNum} (${setName}) did not have 10 cards, found ${cardIdx}`);
  }

  return fullSetMatch.replace(cardsBlock, newCardsBlock);
});

console.log(`Processed ${setCount} sets and ${cardCount} cards.`);
if (setCount !== 15 || cardCount !== 150) {
  console.error(`Mismatch in counts: ${setCount} sets, ${cardCount} cards`);
  process.exit(1);
}

// Replace in content
content = content.replace(oldSetsBlock, newSetsBlock);

// Also update line 22872:
// const stars = "⭐".repeat(Math.min(c.bonus, 5)); -> const stars = "⭐".repeat(c.stars || Math.min(c.bonus, 5));
const oldFruitStars = 'const stars = "⭐".repeat(Math.min(c.bonus, 5));';
const newFruitStars = 'const stars = "⭐".repeat(c.stars || Math.min(c.bonus, 5));';
if (content.includes(oldFruitStars)) {
  content = content.replace(oldFruitStars, newFruitStars);
  console.log('Updated fruit card front face star line.');
} else {
  console.log('Fruit card star line already updated or not found.');
}

fs.writeFileSync('index.html', content, 'utf8');
console.log('Successfully written updated index.html!');
