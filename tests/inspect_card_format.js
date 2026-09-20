const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

const sIdx = content.indexOf('const SETS = [');
const eIdx = content.indexOf('];\n\n        // ─── CARD ART HELPER', sIdx);
const setsStr = content.slice(sIdx, eIdx + 2);

const matchFirst = setsStr.match(/cards:\s*\[\s*(\{[^}]+\})/);
console.log('First card in Set 1:\n' + matchFirst[1]);

const matchHarvester = setsStr.match(/(\{[^}]+Harvester[^}]+\})/);
console.log('\nHarvester card:\n' + matchHarvester[1]);

const matchDance = setsStr.match(/(\{[^}]+Dance[^}]+\})/);
console.log('\nDance card:\n' + matchDance[1]);
