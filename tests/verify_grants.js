const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const assertions = [
  { desc: 'Selection Hub element exists', pattern: 'id="gcHubView"' },
  { desc: 'Coins panel element exists', pattern: 'id="gcCoinsPanel"' },
  { desc: 'Aura panel element exists', pattern: 'id="gcAuraPanel"' },
  { desc: 'Open Coins trigger exists', pattern: "gcOpenChannel('coins')" },
  { desc: 'Open Aura trigger exists', pattern: "gcOpenChannel('aura')" },
  { desc: 'Return to Hub trigger exists', pattern: "gcOpenChannel('hub')" },
  { desc: 'Coins preset chips row exists', pattern: 'id="gcCoinsPresetRow"' },
  { desc: 'Aura preset chips row exists', pattern: 'id="gcAuraPresetRow"' },
  { desc: 'Selected player preview card (coins) exists', pattern: 'id="gcSelectedPreview"' },
  { desc: 'Selected player preview card (aura) exists', pattern: 'id="gcAuraSelectedPreview"' },
  { desc: 'Grants session count badge exists', pattern: 'id="gcHubSessionCount"' },
  { desc: 'gcOpenChannel function definition exists', pattern: 'function gcOpenChannel(' },
  { desc: 'gcSelectPresetCoins function definition exists', pattern: 'function gcSelectPresetCoins(' },
  { desc: 'gcSelectPresetAura function definition exists', pattern: 'function gcSelectPresetAura(' },
  { desc: 'gcAddReasonTag function definition exists', pattern: 'function gcAddReasonTag(' }
];

let failed = 0;
assertions.forEach(a => {
  if (html.includes(a.pattern)) {
    console.log(`✅ PASS: ${a.desc}`);
  } else {
    console.error(`❌ FAIL: ${a.desc} (pattern: ${a.pattern})`);
    failed++;
  }
});

if (failed === 0) {
  console.log('\n🎉 ALL 15 VERIFICATION CHECKS PASSED CLEANLY!');
} else {
  console.error(`\n❌ ${failed} checks failed.`);
  process.exit(1);
}
