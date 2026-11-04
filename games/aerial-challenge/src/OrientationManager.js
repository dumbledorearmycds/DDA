/**
 * Township Aerial Challenge — Orientation & Fullscreen Manager
 * Enforces landscape mode on mobile, auto-requests navigationUI: 'hide' fullscreen,
 * and shows a friendly cartoon overlay if portrait.
 */

export async function triggerFullscreenAndLandscape() {
  try {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen({ navigationUI: 'hide' });
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch {
    // Ignore browser policy rejections
  }
}

export function releaseFullscreenAndOrientation() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
    }
  } catch (e) {}
  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (e) {}
}

export class OrientationManager {
  constructor(overlayElementId = 'orientation-overlay') {
    this.overlay = typeof document !== 'undefined' ? document.getElementById(overlayElementId) : null;
    this.isPortrait = false;
    this._hasTriggeredGesture = false;
    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    this.checkOrientation();

    const onOrientationSwitch = () => {
      const isPortrait = this.checkOrientation();
      if (!isPortrait) {
        triggerFullscreenAndLandscape();
      }
    };

    window.addEventListener('resize', onOrientationSwitch);
    window.addEventListener('orientationchange', () => {
      onOrientationSwitch();
      setTimeout(onOrientationSwitch, 50);
      setTimeout(onOrientationSwitch, 150);
    });

    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', onOrientationSwitch);
    }

    // Auto fullscreen on first interaction once only
    const onFirstUserGesture = () => {
      if (this._hasTriggeredGesture) return;
      this._hasTriggeredGesture = true;
      triggerFullscreenAndLandscape();
    };

    window.addEventListener('pointerdown', onFirstUserGesture, { passive: true, once: true });
    window.addEventListener('touchstart', onFirstUserGesture, { passive: true, once: true });
    window.addEventListener('click', onFirstUserGesture, { passive: true, once: true });

    if (this.overlay) {
      this.overlay.addEventListener('pointerdown', onFirstUserGesture, { passive: true, once: true });
      this.overlay.addEventListener('touchstart', onFirstUserGesture, { passive: true, once: true });
      this.overlay.addEventListener('click', onFirstUserGesture, { passive: true, once: true });
    }
  }

  checkOrientation() {
    if (typeof window === 'undefined') return false;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const isMobile = width <= 1024 || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

    // Detect portrait
    const wasPortrait = this.isPortrait;
    this.isPortrait = isMobile && (height > width);

    if (this.overlay) {
      if (this.isPortrait) {
        this.overlay.classList.add('active');
      } else {
        this.overlay.classList.remove('active');
      }
    }

    // Switched from portrait to landscape (or first time in landscape) -> trigger fullscreen instantly!
    if (!this.isPortrait) {
      triggerFullscreenAndLandscape();
    }

    return this.isPortrait;
  }

  async requestLandscapeLock() {
    return triggerFullscreenAndLandscape();
  }
}
