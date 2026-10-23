      // ══ PWA SERVICE WORKER REGISTRATION ══
      window.forceHardRefresh = async function () {
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.unregister();
            }
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            for (const key of keys) {
              await caches.delete(key);
            }
          }
        } catch (e) {}
        window.location.href = window.location.pathname + '?forceUpdate=' + Date.now();
      };

      if ('serviceWorker' in navigator) {
        const wasControlled = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
          try { reg.update(); } catch (e) {}
        });
        let _swReloading = false;
        window._swReloading = false;
        window._swUpdatePending = false;

        function isBusyWithGameOrTransaction() {
          try {
            // Only busy if an async login network call is currently in flight!
            if (window._isLoginInProgress) return true;
            const srs = document.getElementById("sessionRestoreScreen");
            if (srs && srs.style.display !== "none") return true;

            // 1. Wheel is spinning
            if (window.wheelSpinning) return true;
            if (
              window.spinWheelController &&
              typeof window.spinWheelController.isSpinning === "function" &&
              window.spinWheelController.isSpinning()
            ) {
              return true;
            }

            // 2. Active Pattern Recall or Spin & Win game run
            const bodyClasses = document.body ? document.body.classList : null;
            if (bodyClasses && (bodyClasses.contains("pr-room-active") || bodyClasses.contains("spin-room-active"))) {
              return true;
            }

            // 3. Pending uncommitted transactions or Firestore saves in flight
            if (
              typeof window.hasPendingTransactions === "function" &&
              window.hasPendingTransactions()
            ) {
              return true;
            }
            if (window._isSaveInProgress) return true;

            // 4. Any victory modal or win celebration overlay open
            const openModal = document.querySelector(
              ".spin-win-overlay.show, .pr-result-overlay.show, .jackpot-overlay.show"
            );
            if (openModal) return true;

            // 5. Active multiplayer room
            if (window._cbInRoom || window._currentRoomId) return true;
          } catch (e) {}
          return false;
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // If this is the initial registration claiming the fresh client, do not reload!
          if (!wasControlled) {
            console.log("[PWA SW] Service Worker claimed client on initial install. Skipping reload.");
            return;
          }

          if (_swReloading || window._swReloading) return;

          // If the user is in the lobby (not logged in), reload immediately so they get the fresh version
          const lobby = document.getElementById("lobbyScreen");
          const srs = document.getElementById("sessionRestoreScreen");
          const isLobbyVisible = lobby && lobby.style.display !== "none" && !window._progressLoaded;
          if (isLobbyVisible && (!srs || srs.style.display === "none")) {
            console.log("[PWA SW] New version ready in lobby. Refreshing cleanly...");
            _swReloading = true;
            window._swReloading = true;
            window.location.reload();
            return;
          }

          // If the user is actively in a game, spinning, or in an event room, defer reload
          if (isBusyWithGameOrTransaction()) {
            console.log(
              "[PWA SW] Update ready but user is actively in a game or transaction. Deferring reload."
            );
            window._swUpdatePending = true;
            return;
          }

          // When user is actively browsing the app, do NOT force-reload and wipe their session!
          // Instead, mark update pending and show a non-intrusive toast with a tap-to-refresh action
          console.log("[PWA SW] Service worker updated. Notifying user without interrupting session.");
          window._swUpdatePending = true;
          if (typeof window.showToast === "function") {
            window.showToast("✨ App updated! Tap here to reload.", {
              type: "success",
              icon: "✨",
              onClick: () => {
                _swReloading = true;
                window._swReloading = true;
                window.location.reload();
              }
            });
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

        let _lastSwVisibilityCheck = 0;
        // Listen for tab visibility changes
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            wasHidden = true;
          } else if (document.visibilityState === 'visible') {
            // Only act if tab genuinely transitioned from background (never on initial load)
            if (!wasHidden) return;
            wasHidden = false;

            // Throttle service worker update checks on rapid app-switching (minimum 60s between checks)
            const now = Date.now();
            if (now - _lastSwVisibilityCheck > 60000) {
              _lastSwVisibilityCheck = now;
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then((reg) => {
                  if (reg) reg.update();
                }).catch(() => {});
              }
            }
          }
        });
      })();
