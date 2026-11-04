/**
 * Township Aerial Challenge — Main Application Entry
 * Initializes game instance, responsive resize handling, and automatic fullscreen request.
 */

import { config, getResponsiveGameDimensions } from './config.js';
import { OrientationManager, triggerFullscreenAndLandscape } from './OrientationManager.js';

export const orientationManager = new OrientationManager('orientation-overlay');

export const game = new Phaser.Game(config);

if (typeof window !== 'undefined') {
  window.game = game;

  // Window resize handler for dynamic 20:9 edge-to-edge scaling
  const handleResize = () => {
    if (game && game.scale) {
      const { width, height } = getResponsiveGameDimensions();
      game.scale.resize(width, height);
    }
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));

  // Trigger automatic fullscreen + landscape lock on first interaction
  let initialTriggerDone = false;
  const onInitialGesture = () => {
    if (initialTriggerDone) return;
    initialTriggerDone = true;
    triggerFullscreenAndLandscape();
  };
  window.addEventListener('pointerdown', onInitialGesture, { passive: true, once: true });
  window.addEventListener('touchstart', onInitialGesture, { passive: true, once: true });
  window.addEventListener('click', onInitialGesture, { passive: true, once: true });
}
