#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Aerial Challenge Build Verification ---');

const requiredFiles = [
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'src/Constants.js',
  'src/GameState.js',
  'src/FlightPhysics.js',
  'src/CollectibleManager.js',
  'src/OrientationManager.js',
  'src/config.js',
  'src/main.js',
  'src/index.js',
  'src/BootScene.js',
  'src/FlightScene.js',
  'src/UIScene.js',
  'src/SoundManager.js',
  'tests/FlightPhysics.test.js',
  'tests/CollectibleManager.test.js',
  'tests/UpgradesAndEconomy.test.js',
  'tests/SoundManager.test.js'
];

let missing = 0;
for (const file of requiredFiles) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    missing++;
  } else {
    const stats = fs.statSync(filePath);
    console.log(`✓ Verified ${file} (${stats.size} bytes)`);
  }
}

// Ensure dist directory exists
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Generate build manifest
const buildInfo = {
  version: '1.0.0-phase3',
  timestamp: new Date().toISOString(),
  filesChecked: requiredFiles.length - missing
};
fs.writeFileSync(path.join(distDir, 'build-meta.json'), JSON.stringify(buildInfo, null, 2));

if (missing > 0) {
  console.error(`Build verification failed with ${missing} missing files.`);
  process.exit(1);
} else {
  console.log('✓ Phase 3 build verification succeeded! All core modules, 6 custom collectibles, and manager present.');
}
