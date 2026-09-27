      // Bridge: calls the real module function by name, but uses a DIFFERENT key
      // to detect readiness so it never calls itself recursively.
      // The module sets window.__mod_<name> as a sentinel alongside window.<name>.
      function _callWhenReady(fn, args) {
        const sentinel = "__mod_" + fn;
        if (window[sentinel]) {
          window[fn].apply(null, args);
          return;
        }
        let tries = 0;
        const t = setInterval(() => {
          if (window[sentinel]) {
            clearInterval(t);
            window[fn].apply(null, args);
          }
          if (++tries > 60) clearInterval(t);
        }, 50);
      }
      function toggleLobbyTab(tab) {
        _callWhenReady("toggleLobbyTab", [tab]);
      }
      function doLogin() {
        _callWhenReady("doLogin", []);
      }
      function doRegister() {
        _callWhenReady("doRegister", []);
      }
      function doResetPin() {
        _callWhenReady("doResetPin", []);
      }
      function doLogout() {
        _callWhenReady("doLogout", []);
      }
      function adminResetPin(a, b) {
        _callWhenReady("adminResetPin", [a, b]);
      }

      /* ── SHARED VIEWPORT HEIGHT & KEYBOARD OFFSET HELPER (Android Chrome + iOS Safari 15+) ──
       Replaces static 100vh/100dvh with real-time window.visualViewport.height across all fullscreen rooms.
       Counteracts the iOS visual viewport pan bug (which detaches position:fixed containers when the on-screen
       keyboard appears) by applying translateY(vv.offsetTop). */
      function applyViewportHeight(el) {
        if (!el) return;
        const vv = window.visualViewport;
        if (!vv) {
          el.style.height = "100dvh"; // CSS fallback
          el.style.transform = "";
          return;
        }
        el.style.height = vv.height + "px";
        el.style.transform = vv.offsetTop
          ? `translateY(${vv.offsetTop}px)`
          : "";
        const isKb =
          vv.height < (window.innerHeight ? window.innerHeight * 0.82 : 600);
        el.classList.toggle("keyboard-open", isKb);
      }

      function clearViewportHeight(el) {
        if (!el) return;
        el.style.height = "";
        el.style.transform = "";
      }

      function getActiveFullscreenRoom() {
        const b = document.body.classList;
        if (b.contains("cb-room-active")) {
          const el = document.getElementById("cbScreen");
          if (el && el.classList.contains("cb-fullscreen")) return el;
        }
        if (b.contains("spin-room-active")) {
          const el = document.getElementById("panel-spin");
          if (el && el.classList.contains("active")) return el;
        }
        if (b.contains("pr-room-active")) {
          const el = document.getElementById("panel-pr");
          if (el && el.classList.contains("active")) return el;
        }
        if (b.contains("jj-room-active")) {
          const jj = document.getElementById("jjScreen");
          if (
            jj &&
            jj.classList.contains("jj-fullscreen") &&
            jj.style.display !== "none"
          )
            return jj;
          const jp = document.getElementById("jpScreen");
          if (
            jp &&
            jp.classList.contains("jj-fullscreen") &&
            jp.style.display !== "none"
          )
            return jp;
        }
        return null;
      }

      function updateActiveRoomViewport() {
        const activeRoom = getActiveFullscreenRoom();
        if (activeRoom) {
          applyViewportHeight(activeRoom);
        }
      }

      window.applyViewportHeight = applyViewportHeight;
      window.clearViewportHeight = clearViewportHeight;
      window.getActiveFullscreenRoom = getActiveFullscreenRoom;
      window.updateActiveRoomViewport = updateActiveRoomViewport;

      // Track visualViewport changes (keyboard open/close, scrolling, orientation change)
      if (window.visualViewport) {
        window.visualViewport.addEventListener(
          "resize",
          updateActiveRoomViewport,
        );
        window.visualViewport.addEventListener(
          "scroll",
          updateActiveRoomViewport,
        );
      }
      window.addEventListener("orientationchange", () => {
        requestAnimationFrame(updateActiveRoomViewport);
        setTimeout(updateActiveRoomViewport, 300);
      });
      window.addEventListener("resize", updateActiveRoomViewport);

      // Input focus listener: recalculate viewport height on next frame and after keyboard animation (300ms)
      document.addEventListener("focusin", (e) => {
        const target = e.target;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          requestAnimationFrame(() => {
            updateActiveRoomViewport();
            window.scrollTo(0, 0); // iOS safety: prevent root document scrolling behind room
          });
          setTimeout(() => {
            updateActiveRoomViewport();
            window.scrollTo(0, 0);
          }, 300);
        }
      });

      /* ══ PHASE 3: BODY SCROLL LOCK FOR OVERLAYS & MODALS ══
       Prevents background body scrolling, rubber-banding, and disorientation
       on iOS Safari and Android Chrome when any modal or overlay is open. */
      let _activeOverlays = new Set();
      let _bodyScrollLockY = 0;

      function lockBodyScroll(id) {
        if (id) _activeOverlays.add(id);
        if (_activeOverlays.size === 1) {
          _bodyScrollLockY = window.scrollY || window.pageYOffset || 0;
          document.body.style.position = "fixed";
          document.body.style.top = `-${_bodyScrollLockY}px`;
          document.body.style.left = "0";
          document.body.style.right = "0";
          document.body.style.width = "100%";
          document.body.style.overflow = "hidden";
        }
      }

      function unlockBodyScroll(id) {
        if (id) _activeOverlays.delete(id);
        if (_activeOverlays.size === 0) {
          const scrollY = _bodyScrollLockY;
          document.body.style.position = "";
          document.body.style.top = "";
          document.body.style.left = "";
          document.body.style.right = "";
          document.body.style.width = "";
          document.body.style.overflow = "";
          window.scrollTo(0, scrollY);
        }
      }

      window.lockBodyScroll = lockBodyScroll;
      window.unlockBodyScroll = unlockBodyScroll;

      function initOverlayScrollLockObserver() {
        const overlaySelectors =
          ".overlay, .spin-win-overlay, .pr-result-overlay, .welcome-modal-overlay, #iosInstallModal";
        const checkElement = (el) => {
          const isVisible =
            el.classList.contains("show") ||
            (el.style.display && el.style.display !== "none");
          const id = el.id || el.className;
          if (isVisible) {
            lockBodyScroll(id);
          } else {
            unlockBodyScroll(id);
          }
        };

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((m) => {
            if (
              m.target &&
              m.target.matches &&
              m.target.matches(overlaySelectors)
            ) {
              checkElement(m.target);
            }
          });
        });

        document.querySelectorAll(overlaySelectors).forEach((el) => {
          observer.observe(el, {
            attributes: true,
            attributeFilter: ["class", "style"],
          });
          if (
            el.classList.contains("show") ||
            (el.style.display && el.style.display !== "none")
          ) {
            checkElement(el);
          }
        });
      }

      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          initOverlayScrollLockObserver,
        );
      } else {
        initOverlayScrollLockObserver();
      }

      /* ══ PHASE 4: BACKDROP TAP & ESCAPE DISMISSAL FOR OVERLAYS ══
       Enables touch dismissal when tapping outside modal dialog boxes
       and hardware/keyboard Escape dismissal. */
      /* ══ OVERLAY DISMISSAL HELPER ══ */
      window.daDismissOverlay = function (id, fromPopstate) {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove("show");
          if (
            el.style.display &&
            el.style.display !== "none" &&
            !el.classList.contains("overlay")
          ) {
            el.style.display = "none";
          }
        }
        if (window.unlockBodyScroll) window.unlockBodyScroll(id);
        if (
          !fromPopstate &&
          history.state &&
          history.state.daScreen === "overlay" &&
          history.state.overlayId === id
        ) {
          window._daSuppressNextPop = true;
          history.back();
        }
      };

      window.closeOverlay = function (id, fromPopstate) {
        if (window.daDismissOverlay) {
          window.daDismissOverlay(id, fromPopstate);
        } else {
          const el = document.getElementById(id);
          if (el) el.classList.remove("show");
          if (window.unlockBodyScroll) window.unlockBodyScroll(id);
        }
      };

      function dismissOverlayById(id, fromPopstate) {
        if (window.daDismissOverlay) {
          window.daDismissOverlay(id, fromPopstate);
        } else {
          const el = document.getElementById(id);
          if (el) el.classList.remove("show");
          if (window.unlockBodyScroll) window.unlockBodyScroll(id);
        }
      }

      document.addEventListener("click", (e) => {
        if (!e.target || !e.target.classList) return;
        if (
          e.target.classList.contains("overlay") &&
          e.target.classList.contains("show")
        ) {
          dismissOverlayById(e.target.id);
        } else if (
          e.target.classList.contains("spin-win-overlay") &&
          e.target.classList.contains("show")
        ) {
          e.target.classList.remove("show");
          if (window.unlockBodyScroll) window.unlockBodyScroll(e.target.id);
        } else if (
          e.target.classList.contains("pr-result-overlay") &&
          e.target.classList.contains("show")
        ) {
          e.target.classList.remove("show");
          if (window.unlockBodyScroll) window.unlockBodyScroll(e.target.id);
        } else if (
          e.target.classList.contains("welcome-modal-overlay") &&
          e.target.style.display !== "none"
        ) {
          e.target.style.display = "none";
          if (window.unlockBodyScroll) window.unlockBodyScroll(e.target.id);
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        } else if (
          e.target.id === "iosInstallModal" &&
          e.target.style.display !== "none"
        ) {
          e.target.style.display = "none";
          if (window.unlockBodyScroll)
            window.unlockBodyScroll("iosInstallModal");
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const visibleOverlays = Array.from(
            document.querySelectorAll(".overlay.show"),
          );
          if (visibleOverlays.length) {
            const top = visibleOverlays[visibleOverlays.length - 1];
            dismissOverlayById(top.id);
            return;
          }
          const visibleGameModals = Array.from(
            document.querySelectorAll(
              ".spin-win-overlay.show, .pr-result-overlay.show",
            ),
          );
          if (visibleGameModals.length) {
            const top = visibleGameModals[visibleGameModals.length - 1];
            top.classList.remove("show");
            if (window.unlockBodyScroll) window.unlockBodyScroll(top.id);
            return;
          }
          const visibleWelcome = Array.from(
            document.querySelectorAll(".welcome-modal-overlay"),
          ).filter((el) => el.style.display && el.style.display !== "none");
          if (visibleWelcome.length) {
            const top = visibleWelcome[visibleWelcome.length - 1];
            top.style.display = "none";
            if (window.unlockBodyScroll) window.unlockBodyScroll(top.id);
            window._advancePostLoginQueue && window._advancePostLoginQueue();
            return;
          }
          const iosModal = document.getElementById("iosInstallModal");
          if (
            iosModal &&
            iosModal.style.display &&
            iosModal.style.display !== "none"
          ) {
            iosModal.style.display = "none";
            if (window.unlockBodyScroll)
              window.unlockBodyScroll("iosInstallModal");
          }
        }
      });

      /* ══ BROWSER HISTORY & EVENT ROOM LOCK CONTROLLER ══ */
      window._daCurrentTab = "match";
      window._daNavigatingBack = false;
      window._daSuppressNextPop = false;

      try {
        if (!history.state) {
          history.replaceState({ daScreen: "tab", tab: "match" }, "");
        } else if (history.state.tab) {
          window._daCurrentTab = history.state.tab;
        }
      } catch (e) {}

      window.daPushRoomState = function (roomId) {
        try {
          if (!history.state || history.state.daRoom !== roomId) {
            history.pushState({ daScreen: "room", daRoom: roomId }, "");
          }
        } catch (e) {}
      };

      window.daClearRoomState = function () {
        try {
          if (
            history.state &&
            (history.state.daRoom || history.state.daScreen === "room")
          ) {
            window._daSuppressNextPop = true;
            history.back();
            setTimeout(() => {
              if (
                history.state &&
                (history.state.daRoom || history.state.daScreen === "room")
              ) {
                history.replaceState(
                  { daScreen: "tab", tab: window._daCurrentTab || "match" },
                  "",
                );
              }
            }, 120);
          }
        } catch (e) {}
      };

      window.daPushOverlayState = function (overlayId) {
        try {
          if (!history.state || history.state.overlayId !== overlayId) {
            history.pushState(
              {
                daScreen: "overlay",
                overlayId: overlayId,
                tab: window._daCurrentTab || "match",
              },
              "",
            );
          }
        } catch (e) {}
      };

      function isEventRoomActive() {
        const b = document.body.classList;
        if (b.contains("cb-room-active")) {
          const cb = document.getElementById("cbScreen");
          if (!cb || cb.style.display !== "none") return "cb";
        }
        if (b.contains("jj-room-active")) {
          const jj = document.getElementById("jjScreen");
          if (
            jj &&
            jj.classList.contains("jj-fullscreen") &&
            jj.style.display !== "none"
          )
            return "jj";
          const jp = document.getElementById("jpScreen");
          if (
            jp &&
            jp.classList.contains("jj-fullscreen") &&
            jp.style.display !== "none"
          )
            return "jp";
          return "jj";
        }
        return null;
      }

      window.addEventListener("popstate", (e) => {
        // If back navigation was programmatically triggered to clean up an overlay/room
        if (window._daSuppressNextPop) {
          window._daSuppressNextPop = false;
          return;
        }

        // 1. Check if any overlay/modal is open — back button closes open modals first
        const visibleOverlays = Array.from(
          document.querySelectorAll(".overlay.show"),
        );
        if (visibleOverlays.length) {
          const top = visibleOverlays[visibleOverlays.length - 1];
          dismissOverlayById(top.id, true);
          return;
        }

        const sg = document.getElementById("suggestionsPage");
        if (sg && sg.classList.contains("show")) {
          if (typeof closeSuggestionsPage === "function")
            closeSuggestionsPage(true);
          else sg.classList.remove("show");
          return;
        }

        const gameModals = Array.from(
          document.querySelectorAll(
            ".spin-win-overlay.show, .pr-result-overlay.show",
          ),
        );
        if (gameModals.length) {
          const top = gameModals[gameModals.length - 1];
          top.classList.remove("show");
          if (window.unlockBodyScroll) window.unlockBodyScroll(top.id);
          return;
        }

        const visibleWelcome = Array.from(
          document.querySelectorAll(".welcome-modal-overlay"),
        ).filter((el) => el.style.display && el.style.display !== "none");
        if (visibleWelcome.length) {
          const top = visibleWelcome[visibleWelcome.length - 1];
          top.style.display = "none";
          if (window.unlockBodyScroll) window.unlockBodyScroll(top.id);
          window._advancePostLoginQueue && window._advancePostLoginQueue();
          return;
        }

        const iosModal = document.getElementById("iosInstallModal");
        if (
          iosModal &&
          iosModal.style.display &&
          iosModal.style.display !== "none"
        ) {
          iosModal.style.display = "none";
          if (window.unlockBodyScroll)
            window.unlockBodyScroll("iosInstallModal");
          return;
        }

        // 2. Event Rooms: LOCK back button in Cards Battle, Jumbled Jackpot, Jackpot Event
        const activeEventRoom = isEventRoomActive();
        if (activeEventRoom) {
          try {
            history.pushState(
              { daScreen: "room", daRoom: activeEventRoom },
              "",
            );
          } catch (err) {}
          if (typeof showToast === "function") {
            showToast(
              "⚠️ Back button is locked in event rooms. Use Exit on screen to leave.",
            );
          }
          return;
        }

        // 3. Mini-Games (Spin & Win, Pattern Recall): clean exit back to Mini Games tab
        const b = document.body.classList;
        if (b.contains("spin-room-active")) {
          if (typeof spinExit === "function") spinExit();
          return;
        } else if (b.contains("pr-room-active")) {
          if (typeof prExit === "function") prExit();
          return;
        }

        // 4. Tab / Screen Navigation: return to previously active tab/screen
        if (e.state && e.state.tab) {
          window._daNavigatingBack = true;
          if (typeof switchTabNav === "function") {
            switchTabNav(e.state.tab);
          } else if (typeof switchTab === "function") {
            switchTab(e.state.tab);
          }
          window._daCurrentTab = e.state.tab;
          window._daNavigatingBack = false;
          return;
        }

        // 5. Special Portal fallback (e.g. Admin opened from Lobby)
        if (
          window._openedAdminFromLobby &&
          typeof exitAdminPortal === "function"
        ) {
          exitAdminPortal();
          return;
        }

        // 6. At root screen with no further history state:
        // Browser will handle native exit / back navigation.
      });
