      // ══ PWA SERVICE WORKER REGISTRATION ══
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          try { reg.update(); } catch (e) {}
        });
        let _swReloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!_swReloading) {
            _swReloading = true;
            window.location.reload();
          }
        });
      }

      // ══ PWA INSTALL BANNER LOGIC ══
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

      const installBtn = document.getElementById('install-btn');
      let savedPrompt = null;

      if (!isStandalone && installBtn) {
        const isIOS =
          /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
          // iOS (Safari): show install button immediately if not in standalone mode
          installBtn.style.display = 'block';
          installBtn.addEventListener('click', () => {
            alert("To install, tap the Share button and select 'Add to Home Screen'.");
          });
        } else {
          // Android / Chrome
          window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            savedPrompt = event;
            installBtn.style.display = 'block';
          });

          installBtn.addEventListener('click', async () => {
            if (!savedPrompt) return;
            savedPrompt.prompt();
            const choice = await savedPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
              installBtn.style.display = 'none';
              savedPrompt = null;
            }
          });

          window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            savedPrompt = null;
          });
        }
      }

      // ══ AUTO-REFRESH ON TAB VISIBILITY (BACKGROUND TAB CACHE FIX) ══
      (function initVisibilityAutoRefresh() {
        // Minimum time the tab must be in the background before returning triggers a reload (10s)
        const MIN_BACKGROUND_TIME_MS = 10000;
        // Cooldown between automatic reloads to prevent reload loops (30s)
        const RELOAD_COOLDOWN_MS = 30000;
        const STORAGE_KEY = 'dda_last_visibility_reload';

        let wasHidden = false;
        let hiddenAt = 0;
        let lastInputAt = 0;

        // Track active user typing / keystrokes
        window.addEventListener('input', () => { lastInputAt = Date.now(); }, { passive: true });
        window.addEventListener('keydown', () => { lastInputAt = Date.now(); }, { passive: true });

        // Safeguard: detect whether user is currently typing or has unsaved form text
        function hasActiveInputOrUnsavedChanges() {
          // 1. User typed within the last 5 seconds
          if (Date.now() - lastInputAt < 5000) {
            return true;
          }

          // 2. An input/textarea or editable element is currently focused
          const active = document.activeElement;
          if (active) {
            const tag = (active.tagName || '').toLowerCase();
            if (tag === 'textarea' || active.isContentEditable) {
              return true;
            }
            if (tag === 'input') {
              const type = (active.type || 'text').toLowerCase();
              const nonTextTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'range', 'color'];
              if (!nonTextTypes.includes(type)) {
                return true;
              }
            }
          }

          // 3. Any textual input or textarea has unsaved user modifications
          const inputs = document.querySelectorAll('input, textarea');
          for (const el of inputs) {
            const tag = el.tagName.toLowerCase();
            const type = (el.type || 'text').toLowerCase();

            if (tag === 'textarea') {
              if (el.value !== el.defaultValue && (el.value || '').trim().length > 0) {
                return true;
              }
            } else if (tag === 'input') {
              const isTextual = ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(type);
              if (isTextual && el.value !== el.defaultValue && (el.value || '').trim().length > 0) {
                return true;
              }
            }
          }

          return false;
        }

        // Listen for tab visibility changes
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            wasHidden = true;
          } else if (document.visibilityState === 'visible') {
            // Only act if tab genuinely transitioned from background (never on initial load)
            if (!wasHidden) return;
            wasHidden = false;

            // Check for service worker updates in background without forcing a page reload
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistration().then((reg) => {
                if (reg) reg.update();
              }).catch(() => {});
            }
          }
        });
      })();
