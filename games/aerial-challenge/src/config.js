/**
 * Township Aerial Challenge — Phaser Game Configuration
 * Responsive full-viewport landscape scaling (zero left/right black bars).
 */

import { SCALE } from './Constants.js';
import { BootScene } from './BootScene.js';
import { FlightScene } from './FlightScene.js';
import { UIScene } from './UIScene.js';

export const getResponsiveGameDimensions = () => {
  const vh = 720;
  const aspect = (typeof window !== 'undefined' && window.innerWidth && window.innerHeight)
    ? window.innerWidth / window.innerHeight
    : 16 / 9;
  const vw = Math.max(1280, Math.round(vh * Math.min(2.4, Math.max(1.33, aspect))));
  return { width: vw, height: vh };
};

const initialDims = getResponsiveGameDimensions();

export const config = {
  type: Phaser.CANVAS,
  width: initialDims.width,
  height: initialDims.height,
  parent: 'game-container',
  backgroundColor: '#3d9bf3',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialDims.width,
    height: initialDims.height
  },
  physics: {
    default: false
  },
  scene: [BootScene, FlightScene, UIScene],
  input: {
    activePointers: 2
  }
};
