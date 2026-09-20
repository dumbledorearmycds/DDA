const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Mock DOM minimal environment
const elements = {};
function createMockEl(id) {
  return {
    id,
    style: { display: '' },
    textContent: '',
    value: '',
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this.classes.add(c);
          else this.classes.delete(c);
        } else {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        }
      }
    },
    focus() {}
  };
}

const mockIds = [
  'gcHubView', 'gcCoinsPanel', 'gcAuraPanel', 'gcHubSessionCount',
  'gcSelectedPreview', 'gcAuraSelectedPreview', 'gcPreviewAv', 'gcPreviewName',
  'gcPreviewMeta', 'gcPreviewBalance', 'gcAuraPreviewAv', 'gcAuraPreviewName',
  'gcAuraPreviewMeta', 'gcAuraPreviewBalance', 'gcCoinsExecuteBtn', 'gcAuraExecuteBtn',
  'gcCustomAmount', 'gcAuraCustomAmount', 'gcNoteInput', 'gcAuraNoteInput',
  'gcStatus', 'gcAuraStatus', 'gcPlayerIdInput', 'gcAuraPlayerIdInput',
  'gcModeAll', 'gcModeOne', 'gcOneSection', 'gcAuraDirGrant', 'gcAuraDirDeduct'
];

mockIds.forEach(id => {
  elements[id] = createMockEl(id);
});

global.document = {
  getElementById(id) {
    if (!elements[id]) elements[id] = createMockEl(id);
    return elements[id];
  },
  querySelectorAll(sel) {
    return [];
  }
};

global.showToast = (msg) => {};
global.confirm = () => true;
global._waitForMod = (mod, fn) => { /* mock async call */ };

// Extract gc-related variables and functions from index.html
const gcCodeMatch = html.match(/\/\/\s*═+\s*\n\s*\/\/\s*GRANTS PORTAL \(COINS & AURA\)[\s\S]*?(?=\/\/\s*═+\s*\n\s*\/\/\s*PLAYER STATS)/);
if (!gcCodeMatch) {
  console.error('Could not isolate Grants Portal script section');
  process.exit(1);
}

eval(gcCodeMatch[0]);

console.log('Testing gcOpenChannel("hub")...');
gcOpenChannel('hub');
if (elements['gcHubView'].style.display !== '' || elements['gcCoinsPanel'].style.display !== 'none' || elements['gcAuraPanel'].style.display !== 'none') {
  throw new Error('Hub visibility mismatch');
}
console.log('✅ Hub view active, child panels hidden');

console.log('Testing gcOpenChannel("coins")...');
gcOpenChannel('coins');
if (elements['gcHubView'].style.display !== 'none' || elements['gcCoinsPanel'].style.display !== '' || elements['gcAuraPanel'].style.display !== 'none') {
  throw new Error('Coins panel visibility mismatch');
}
console.log('✅ Coins panel active, Hub and Aura hidden');

console.log('Testing gcOpenChannel("aura")...');
gcOpenChannel('aura');
if (elements['gcHubView'].style.display !== 'none' || elements['gcCoinsPanel'].style.display !== 'none' || elements['gcAuraPanel'].style.display !== '') {
  throw new Error('Aura panel visibility mismatch');
}
console.log('✅ Aura panel active, Hub and Coins hidden');

console.log('Testing gcSelectPresetCoins(10000)...');
gcSelectPresetCoins(10000, createMockEl('btn'));
if (elements['gcCoinsExecuteBtn'].textContent !== '✨ Grant 10,000 🪙') {
  throw new Error('Coin button text failed to update: ' + elements['gcCoinsExecuteBtn'].textContent);
}
console.log('✅ Coin preset chip updated button text');

console.log('Testing gcAddReasonTag()...');
gcAddReasonTag('🏆 Tournament Prize', 'gcNoteInput');
if (elements['gcNoteInput'].value !== '🏆 Tournament Prize') {
  throw new Error('Failed to set reason tag');
}
gcAddReasonTag('⭐ VIP Reward', 'gcNoteInput');
if (elements['gcNoteInput'].value !== '🏆 Tournament Prize · ⭐ VIP Reward') {
  throw new Error('Failed to append reason tag: ' + elements['gcNoteInput'].value);
}
console.log('✅ Reason tags set and append properly');

console.log('\n🎉 ALL LOGIC AND STATE TRANSITION TESTS PASSED!');
