      // ═══════════════════════════════════════════════════════════
      // FIREBASE — Username + PIN auth (no email required)
      // ═══════════════════════════════════════════════════════════
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
      import {
        getFirestore,
        doc,
        getDoc,
        setDoc,
        updateDoc,
        deleteDoc,
        collection,
        query,
        where,
        orderBy,
        limit,
        getDocs,
        onSnapshot,
        runTransaction,
        writeBatch,
        arrayUnion,
        increment,
        enableNetwork,
      } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
      import {
        getStorage,
        ref as storageRef,
        uploadString,
        uploadBytes,
        getDownloadURL,
        deleteObject,
      } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
      import {
        getDatabase as getRtdb,
        ref as rtdbRef,
        set as rtdbSet,
        get as rtdbGet,
        update as rtdbUpdate,
        remove as rtdbRemove,
        query as rtdbQuery,
        orderByChild as rtdbOrderByChild,
        equalTo as rtdbEqualTo,
        onDisconnect,
        runTransaction as rtdbTransaction,
        onValue as rtdbOnValue,
      } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

      const firebaseConfig = {
        apiKey: "AIzaSyCQSXJxOec2eh-pSYyF5JsJeAWngIzwMTA",
        authDomain: "dacds-aae0c.firebaseapp.com",
        projectId: "dacds-aae0c",
        storageBucket: "dacds-aae0c.firebasestorage.app",
        messagingSenderId: "1004512421631",
        appId: "1:1004512421631:web:f6a7bcfe4fcee38a94ceca",
        measurementId: "G-9MMZHC1YGL",
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const storage = getStorage(app);
      const _presenceRdb = getRtdb(app, "https://dacds-aae0c-default-rtdb.asia-southeast1.firebasedatabase.app");
      window._presenceRdb = _presenceRdb;
      window._rtdbRef = rtdbRef;
      window._rtdbGet = rtdbGet;
      window._rtdbSet = rtdbSet;
      window._rtdbUpdate = rtdbUpdate;
      window._rtdbRemove = rtdbRemove;
      window._rtdbQuery = rtdbQuery;
      window._rtdbOrderByChild = rtdbOrderByChild;
      window._rtdbEqualTo = rtdbEqualTo;
      window._rtdbTransaction = rtdbTransaction;
      window._rtdbOnValue = rtdbOnValue;

      const REQ_DOC = doc(db, "da_hub", "requests");
      const CARD_REQS_COL = collection(db, "da_card_requests");
      const JP_DOC = doc(db, "da_hub", "jackpotEntries");
      const JJ_ENTRIES_DOC = doc(db, "da_hub", "jjEntries");
      const EC_DOC = doc(db, "da_hub", "eventControls"); // ← new
      const SHOP_REQ_DOC = doc(db, "da_hub", "shopRequests"); // ← Shop purchase log (Bloom and Buzz, etc.)
      const SUGGEST_DOC = doc(db, "da_hub", "suggestions"); // ← Player-submitted site suggestions/feedback
      const GLOBAL_SPIN_DOC = doc(db, "da_hub", "globalSpin"); // ← Global synced Spin & Win jackpot counter (resets every 100 spins)
      const AURA_RESET_DOC = doc(db, "da_hub", "auraWeeklyReset"); // ← Marker doc: records when admin last manually reset Aura
      const GRANT_HISTORY_DOC = doc(db, "da_hub", "grantHistory"); // ← Shared Admin Grant History (last 50 grants)
      const USERS_COL = collection(db, "da_users");

      let _currentPlayerId = null; // "DA-XXXXX"
      function userDoc() {
        const pid = _currentPlayerId || window._currentPlayerId;
        return pid ? doc(db, "da_users", pid) : null;
      }

      function _getAdminAttribution() {
        let name = "";
        let pid = window._currentPlayerId || _currentPlayerId || "";
        let photoURL = "";
        let avatar = "🧙";
        try {
          if (typeof window._getProfile === "function") {
            const p = window._getProfile();
            if (p) {
              if (p.name && String(p.name).trim()) name = String(p.name).trim();
              if (p.playerId) pid = p.playerId;
              if (p.photoURL) photoURL = p.photoURL;
              if (p.avatar) avatar = p.avatar;
            }
          }
          if (window.profile && typeof window.profile === "object") {
            if (!name && window.profile.name && String(window.profile.name).trim()) {
              name = String(window.profile.name).trim();
            }
            if (!pid && window.profile.playerId) pid = window.profile.playerId;
            if (!photoURL && window.profile.photoURL) photoURL = window.profile.photoURL;
            if (window.profile.avatar) avatar = window.profile.avatar;
          }
          if (!photoURL && pid && window._playerPhotoMap && window._playerPhotoMap[pid]) {
            photoURL = window._playerPhotoMap[pid];
          }
          if (!name && window._currentUsername && String(window._currentUsername).trim()) {
            const u = String(window._currentUsername).trim();
            name = u.charAt(0).toUpperCase() + u.slice(1);
          }
          if (!name) {
            try {
              const savedAcc = localStorage.getItem("da_active_account");
              if (savedAcc) {
                const parsed = JSON.parse(savedAcc);
                if (parsed && (parsed.name || parsed.username)) {
                  name = (parsed.name || parsed.username).trim();
                }
                if (parsed && parsed.photoURL) photoURL = parsed.photoURL;
                if (parsed && parsed.avatar) avatar = parsed.avatar;
              }
            } catch (e) {}
          }
        } catch (e) {}
        if (!name || name.toLowerCase() === "null" || name.toLowerCase() === "undefined" || name.toLowerCase() === "leader") {
          name = "Admin";
        }
        return { name, pid, photoURL, avatar };
      }
      window._getAdminAttribution = _getAdminAttribution;

      function _lookupPlayerName(playerId) {
        if (!playerId) return "";
        try {
          if (window._adminPlayersCache && Array.isArray(window._adminPlayersCache.players)) {
            const p = window._adminPlayersCache.players.find((x) => x && x.playerId === playerId);
            if (p) {
              const n = (p.profile?.name || p.username || "").trim();
              if (n) return n;
            }
          }
          if (window._gcPlayersList && Array.isArray(window._gcPlayersList)) {
            const p = window._gcPlayersList.find((x) => x && x.playerId === playerId);
            if (p) {
              const n = (p.profile?.name || p.username || "").trim();
              if (n) return n;
            }
          }
          if (window._gcAuraPlayersList && Array.isArray(window._gcAuraPlayersList)) {
            const p = window._gcAuraPlayersList.find((x) => x && x.playerId === playerId);
            if (p) {
              const n = (p.profile?.name || p.username || "").trim();
              if (n) return n;
            }
          }
        } catch (e) {}
        return "";
      }
      window._lookupPlayerName = _lookupPlayerName;

      // ── UI Visibility Helpers (Declared early to ensure global availability) ──
      function showLobby() {
        const srs = document.getElementById("sessionRestoreScreen");
        if (srs) srs.style.display = "none";
        const lobby = document.getElementById("lobbyScreen");
        if (lobby) lobby.style.display = "flex";
        const app = document.getElementById("appBody");
        if (app) app.style.display = "none";
        const fModal = document.getElementById("freezeAccountOverlay");
        if (fModal) {
          fModal.classList.remove("show");
          fModal.style.display = "none";
        }
      }
      function hideLobby() {
        const srs = document.getElementById("sessionRestoreScreen");
        if (srs) srs.style.display = "none";
        const lobby = document.getElementById("lobbyScreen");
        if (lobby) lobby.style.display = "none";
        const app = document.getElementById("appBody");
        if (app) app.style.display = "block";
      }
      window.showLobby = showLobby;
      window.hideLobby = hideLobby;

      window._progressLoaded = false;
      let _activeLiveUnsubs = [];
      function _trackUnsub(unsub) {
        if (typeof unsub === "function") _activeLiveUnsubs.push(unsub);
        return unsub;
      }
      window._unsubscribeLiveListeners = function () {
        if (window.stopGlobalSpinListener) window.stopGlobalSpinListener();
        if (window.stopGlobalPatternListener) window.stopGlobalPatternListener();
        if (window.stopAllAdminListeners) window.stopAllAdminListeners();
        if (window.stopLiveUserDocListener) window.stopLiveUserDocListener();
        if (window.stopLiveEventControlsListener) window.stopLiveEventControlsListener();
        if (window.stopPlayerLiveRequestsListener) window.stopPlayerLiveRequestsListener();
        if (window.stopMultiplayerListeners) window.stopMultiplayerListeners();
        _activeLiveUnsubs.forEach((unsub) => {
          try {
            unsub();
          } catch (e) {}
        });
        _activeLiveUnsubs = [];
      };

      // ── Generate unique Player ID ─────────────────────────────
      function genPlayerId() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let id = "DA-";
        for (let i = 0; i < 5; i++)
          id += chars[Math.floor(Math.random() * chars.length)];
        return id;
      }

      // Secure PIN hash using SHA-256 with fallback and backward-compatibility
      async function hashPin(pin) {
        if (!pin) return "";
        try {
          const enc = new TextEncoder();
          const data = enc.encode("da_pin_salt_v2_" + pin + "_hub");
          const buf = await crypto.subtle.digest("SHA-256", data);
          const arr = Array.from(new Uint8Array(buf));
          return "sha256:" + arr.map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch (e) {
          return btoa("da_" + pin + "_hub");
        }
      }

      async function verifyPin(pin, storedHash) {
        if (!pin || !storedHash) return false;
        // Check legacy base64 hash first for backward-compatibility
        if (storedHash === btoa("da_" + pin + "_hub")) {
          return true;
        }
        const currentHash = await hashPin(pin);
        return storedHash === currentHash;
      }

      // ── REGISTER ─────────────────────────────────────────────
      window.__mod_doRegister = true;
      window.doRegister = async function () {
        if (window.resetClientInMemoryState) window.resetClientInMemoryState();
        const username = document.getElementById("regUsername").value.trim();
        const pin = document.getElementById("regPin").value.trim();
        const pin2 = document.getElementById("regPin2").value.trim();
        const err = document.getElementById("regError");
        const regSuccessEl = document.getElementById("regSuccess");
        if (regSuccessEl) regSuccessEl.classList.remove("show");
        setLobbyError("regError", "");
        if (!username) {
          setLobbyError("regError", "Please enter a username.");
          return;
        }
        if (username.length < 3) {
          setLobbyError("regError", "Username must be at least 3 characters.");
          return;
        }
        if (!pin) {
          setLobbyError("regError", "Please enter a PIN.");
          return;
        }
        if (!/^\d{4}$/.test(pin)) {
          setLobbyError("regError", "PIN must be exactly 4 digits.");
          return;
        }
        if (pin !== pin2) {
          setLobbyError("regError", "PINs do not match!");
          return;
        }

        // Enforce 2-account device registration limit
        try {
          const rawDevAccs = localStorage.getItem("da_device_created_accounts");
          const devAccs = rawDevAccs ? JSON.parse(rawDevAccs) : [];
          if (Array.isArray(devAccs) && devAccs.length >= 2) {
            setLobbyError(
              "regError",
              "⚠️ Device limit reached: You can only create up to 2 accounts on this device. Use Switch Account to log in to an existing account.",
            );
            return;
          }
        } catch (e) {}

        setLobbyLoading(true);
        try {
          // Check username taken
          const q = query(
            USERS_COL,
            where("username_lower", "==", username.toLowerCase()),
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            setLobbyError("regError", "Username already taken. Try another!");
            setLobbyLoading(false);
            return;
          }
          // Generate unique ID
          let playerId,
            exists = true;
          while (exists) {
            playerId = genPlayerId();
            const d = await getDoc(doc(db, "da_users", playerId));
            exists = d.exists();
          }
          const computedPinHash = await hashPin(pin);
          // Create user doc
          await setDoc(doc(db, "da_users", playerId), {
            playerId,
            username,
            username_lower: username.toLowerCase(),
            pinHash: computedPinHash,
            profile: { name: username, town: "", avatar: "🧙" },
            coins: 0,
            coinHistory: [],
            cardsWon: 0,
            ownedCards: {},
            aura: 0,
            lastActive: Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            txSeq: 0,
          });
          // Track device account registration
          try {
            const rawDevAccs = localStorage.getItem("da_device_created_accounts");
            const devAccs = rawDevAccs ? JSON.parse(rawDevAccs) : [];
            if (!devAccs.some((a) => a.playerId === playerId || (a.username && a.username.toLowerCase() === username.toLowerCase()))) {
              devAccs.push({ playerId, username, createdAt: new Date().toISOString() });
              localStorage.setItem("da_device_created_accounts", JSON.stringify(devAccs));
            }
          } catch (e) {}
          // Show success + Player ID, then redirect to the Login tab (no auto-login)
          document.getElementById("regSuccessId").textContent = playerId;
          document.getElementById("regSuccess").classList.add("show");
          setLobbyLoading(false); // re-enable UI now that write succeeded
          setTimeout(() => {
            try {
              window.toggleLobbyTab("login");
              const lu = document.getElementById("loginUsername");
              if (lu) lu.value = username;
              const lp = document.getElementById("loginPin");
              if (lp) lp.focus();
            } catch (e2) {
              console.error("redirect to login error:", e2);
            }
          }, 2200);
          return; // success path — don't fall into catch
        } catch (e) {
          console.error(e);
          setLobbyError("regError", e.message || "Registration failed. Please try again.");
          setLobbyLoading(false);
        }
      };

      // ── LOGIN ─────────────────────────────────────────────────
      window.__mod_doLogin = true;
      window.doLogin = async function () {
        const username = document.getElementById("loginUsername").value.trim();
        const pin = document.getElementById("loginPin").value.trim();
        setLobbyError("loginError", "");
        if (!username || !pin) {
          setLobbyError("loginError", "Please fill in all fields.");
          return;
        }
        setLobbyLoading(true);
        window._isLoginInProgress = true;
        try {
          const q = query(
            USERS_COL,
            where("username_lower", "==", username.toLowerCase()),
          );
          let snap;
          try {
            snap = await getDocs(q);
          } catch (firstErr) {
            console.warn("First getDocs attempt failed, forcing network reconnect:", firstErr);
            if (typeof enableNetwork === "function") {
              try { await enableNetwork(db); } catch (ne) {}
            }
            await new Promise((r) => setTimeout(r, 600));
            snap = await getDocs(q);
          }
          if (snap.empty) {
            setLobbyError("loginError", "Username not found.");
            setLobbyLoading(false);
            window._isLoginInProgress = false;
            return;
          }
          const userData = snap.docs[0].data();
          if (userData && userData.disabled) {
            setLobbyError("loginError", "This account has been deactivated.");
            setLobbyLoading(false);
            window._isLoginInProgress = false;
            return;
          }
          const matches = await verifyPin(pin, userData.pinHash);
          if (!matches) {
            setLobbyError("loginError", "Wrong PIN. Try again.");
            setLobbyLoading(false);
            window._isLoginInProgress = false;
            return;
          }
          // Transparently upgrade legacy base64 hash to SHA-256
          if (userData.pinHash === btoa("da_" + pin + "_hub")) {
            try {
              const upgradedHash = await hashPin(pin);
              await updateDoc(doc(db, "da_users", userData.playerId), {
                pinHash: upgradedHash,
              });
            } catch (upErr) {
              console.warn("Could not upgrade PIN hash:", upErr);
            }
          }
          if (window.resetClientInMemoryState) window.resetClientInMemoryState();
          window._forceShowBdayWish = true;
          try {
            localStorage.removeItem("da_dismissed_announcement_" + userData.playerId);
            sessionStorage.removeItem("da_dismissed_announcement_" + userData.playerId);
          } catch (e) {}
          finishLogin(userData.playerId, userData.username, false, userData);
        } catch (e) {
          console.error("doLogin error:", e);
          const errDetail = (e && (e.message || e.code || String(e))) || "Check connection.";
          const htmlMsg = `<span>⚠️ ${escapeHtml(errDetail)}</span><br><button type="button" class="btn-text" onclick="window.forceHardRefresh && window.forceHardRefresh()" style="margin-top:6px; color:#f5c542; text-decoration:underline; font-size:0.85rem; background:none; border:none; cursor:pointer;">🔄 Tap here to update &amp; reconnect</button>`;
          setLobbyError("loginError", htmlMsg, true);
          setLobbyLoading(false);
        } finally {
          window._isLoginInProgress = false;
        }
      };

      // ── RESET PIN (self-service, no old PIN required) ─────────
      // Identity check uses Username + Player ID together, since the Player ID
      // is only ever shown once to the account owner at registration time.
      window.__mod_doResetPin = true;
      window.doResetPin = async function () {
        const username = document.getElementById("resetUsername").value.trim();
        const playerId = document
          .getElementById("resetPlayerId")
          .value.trim()
          .toUpperCase();
        const newPin = document.getElementById("resetNewPin").value.trim();
        const newPin2 = document.getElementById("resetNewPin2").value.trim();
        setLobbyError("resetError", "");
        document.getElementById("resetSuccess").classList.remove("show");
        if (!username || !playerId) {
          setLobbyError(
            "resetError",
            "Please enter your username and Player ID.",
          );
          return;
        }
        if (!/^\d{4}$/.test(newPin)) {
          setLobbyError("resetError", "New PIN must be exactly 4 digits.");
          return;
        }
        if (newPin !== newPin2) {
          setLobbyError("resetError", "New PINs do not match!");
          return;
        }

        // FINDING-SEC-01 Guard: Verify that this device is authorized for this account
        // (device created the account, has it saved locally, or was previously logged in)
        let isAuthorizedDevice = false;
        try {
          const rawDev = localStorage.getItem("da_device_created_accounts");
          const devAccs = rawDev ? JSON.parse(rawDev) : [];
          if (Array.isArray(devAccs) && devAccs.includes(playerId)) {
            isAuthorizedDevice = true;
          }
          if (!isAuthorizedDevice) {
            const rawSaved = localStorage.getItem("da_saved_accounts");
            const savedAccs = rawSaved ? JSON.parse(rawSaved) : [];
            if (Array.isArray(savedAccs) && savedAccs.some(a => a && (a.playerId === playerId || a.pid === playerId))) {
              isAuthorizedDevice = true;
            }
          }
          if (!isAuthorizedDevice) {
            const rawSess = localStorage.getItem("da_session");
            const sess = rawSess ? JSON.parse(rawSess) : null;
            if (sess && (sess.playerId === playerId || sess.pid === playerId)) {
              isAuthorizedDevice = true;
            }
          }
        } catch (authErr) {}

        if (!isAuthorizedDevice) {
          setLobbyError(
            "resetError",
            "Device verification required: Self-service PIN reset is only allowed on the device where this account was registered. Please contact your DA Leader to reset your PIN."
          );
          return;
        }

        setLobbyLoading(true);
        try {
          const snap = await getDoc(doc(db, "da_users", playerId));
          if (!snap.exists()) {
            setLobbyError("resetError", "Player ID not found.");
            setLobbyLoading(false);
            return;
          }
          const userData = snap.data();
          if ((userData.username_lower || "") !== username.toLowerCase()) {
            setLobbyError("resetError", "Username and Player ID do not match.");
            setLobbyLoading(false);
            return;
          }
          const updatedPinHash = await hashPin(newPin);
          await updateDoc(doc(db, "da_users", playerId), {
            pinHash: updatedPinHash,
          });
          document.getElementById("resetSuccess").classList.add("show");
          setLobbyLoading(false);
          setTimeout(() => {
            window.toggleLobbyTab("login");
            const lu = document.getElementById("loginUsername");
            if (lu) lu.value = userData.username;
            const lp = document.getElementById("loginPin");
            if (lp) lp.focus();
          }, 1800);
        } catch (e) {
          console.error(e);
          setLobbyError("resetError", "Reset failed. Check connection.");
          setLobbyLoading(false);
        }
      };

      // ── DEVICE ACCOUNTS & INSTANT SWITCHING ─────────────────────
      window.getDeviceSavedAccounts = function () {
        try {
          const raw = localStorage.getItem("da_saved_accounts");
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      };

      window.saveDeviceAccount = function (data) {
        if (!data || !data.playerId) return;
        try {
          let list = window.getDeviceSavedAccounts();
          const idx = list.findIndex((a) => a.playerId === data.playerId);
          const item = {
            playerId: data.playerId,
            username: data.username || (idx >= 0 ? list[idx].username : ""),
            name: data.name || (idx >= 0 ? list[idx].name : data.username || ""),
            town: data.town || (idx >= 0 ? list[idx].town : ""),
            dob: data.dob || (idx >= 0 ? list[idx].dob : ""),
            avatar: data.avatar || (idx >= 0 ? list[idx].avatar : "🧙"),
            photoURL: data.photoURL || (idx >= 0 ? list[idx].photoURL : ""),
            updatedAt: Date.now(),
          };
          if (idx >= 0) {
            if (data.name) list[idx].name = data.name;
            if (data.town) list[idx].town = data.town;
            if (typeof data.dob !== "undefined") list[idx].dob = data.dob;
            if (data.avatar) list[idx].avatar = data.avatar;
            if (typeof data.photoURL !== "undefined") list[idx].photoURL = data.photoURL;
            if (data.username) list[idx].username = data.username;
            list[idx].updatedAt = Date.now();
          } else {
            // Keep at most 2 accounts remembered for instant switching
            if (list.length >= 2) {
              list.shift();
            }
            list.push(item);
          }
          localStorage.setItem("da_saved_accounts", JSON.stringify(list));
        } catch (e) {}
        if (typeof window.updateSwitchAccountUI === "function") {
          window.updateSwitchAccountUI();
        }
      };

      window.getOtherSavedAccount = function () {
        const curPid = window._currentPlayerId;
        const list = window.getDeviceSavedAccounts();
        return list.find((a) => a.playerId && a.playerId !== curPid) || null;
      };

      window.updateSwitchAccountUI = function () {
        const btn = document.getElementById("btnSwitchAccount");
        const lbl = document.getElementById("btnSwitchAccountLabel");
        if (!btn || !lbl) return;
        const other = window.getOtherSavedAccount();
        if (other) {
          const targetName = other.town
            ? `to ${other.town}`
            : `to ${other.name || other.username}`;
          lbl.textContent = `Switch ${targetName}`;
          btn.title = `Switch to ${other.name || other.username} (${other.town || "Town"})`;
        } else {
          lbl.textContent = "Switch / Add Account";
          btn.title = "Log in to a second account on this device";
        }
      };

      window._isSwitchingAccount = false;

      window.executeAccountSwitch = async function (targetAccount) {
        if (window._isSwitchingAccount) return;
        if (!targetAccount || !targetAccount.playerId) return;

        window._isSwitchingAccount = true;

        const overlay = document.getElementById("overlayAccountSwitch");
        const headline = document.getElementById("swHeadline");
        const subtext = document.getElementById("swSubtext");
        const pBar = document.getElementById("swProgressBar");
        const pLabel = document.getElementById("swStepLabel");
        const pPercent = document.getElementById("swPercent");

        const origAvatar = document.getElementById("swOriginAvatar");
        const origName = document.getElementById("swOriginName");
        const origTown = document.getElementById("swOriginTown");

        const destAvatar = document.getElementById("swDestAvatar");
        const destName = document.getElementById("swDestName");
        const destTown = document.getElementById("swDestTown");
        const destAvatarWrap = document.getElementById("swDestAvatarWrap");

        // Current active account info for Origin Card
        const curName =
          (typeof profile === "object" && profile && profile.name) ||
          window._currentUsername ||
          "Operative";
        const curTown =
          (typeof profile === "object" && profile && profile.town) ||
          "Current Town";
        const curAv =
          (typeof profile === "object" && profile && profile.avatar) || "🧙";
        const curPhoto =
          (typeof profile === "object" && profile && profile.photoURL) || "";

        if (origAvatar) {
          origAvatar.innerHTML = curPhoto
            ? `<img src="${curPhoto}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">`
            : curAv;
        }
        if (origName) origName.textContent = curName;
        if (origTown) origTown.textContent = curTown;

        // Destination account info
        const tName = targetAccount.name || targetAccount.username || "Operative";
        const tTown = targetAccount.town || "Town";
        const tAv = targetAccount.avatar || "🧙";
        const tPhoto = targetAccount.photoURL || "";

        if (destAvatar) {
          destAvatar.innerHTML = tPhoto
            ? `<img src="${tPhoto}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">`
            : tAv;
        }
        if (destName) destName.textContent = tName;
        if (destTown) destTown.textContent = tTown;

        if (destAvatarWrap) {
          destAvatarWrap.innerHTML = tPhoto
            ? `<img src="${tPhoto}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
            : tAv;
        }

        if (headline) headline.textContent = `Switching to ${tTown}...`;
        if (subtext)
          subtext.textContent = `Synchronizing Floo Network & spell vaults...`;
        if (pBar) pBar.style.width = "20%";
        if (pLabel) pLabel.textContent = "Decoupling current session...";
        if (pPercent) pPercent.textContent = "20%";

        // Show overlay with smooth opacity fade-in
        if (overlay) {
          overlay.style.display = "flex";
          void overlay.offsetHeight;
          overlay.style.opacity = "1";
        }

        await new Promise((r) => setTimeout(r, 260));

        if (pBar) pBar.style.width = "50%";
        if (pLabel) pLabel.textContent = "Purging memory state...";
        if (pPercent) pPercent.textContent = "50%";

        // Flush any unsaved changes for the outgoing account BEFORE purging memory state
        if (window._progressLoaded && typeof window.saveProgress === "function") {
          try {
            await window.saveProgress(true);
          } catch (e) {
            console.warn("Failed to flush outgoing progress before account switch:", e);
          }
        }

        // Reset client in-memory state cleanly
        if (window.resetClientInMemoryState) {
          window.resetClientInMemoryState();
        }

        await new Promise((r) => setTimeout(r, 180));

        if (pBar) pBar.style.width = "75%";
        if (pLabel)
          pLabel.textContent = `Channeling cloud data for ${tTown}...`;
        if (pPercent) pPercent.textContent = "75%";

        try {
          // Set session for target account
          const targetSessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
          _currentPlayerId = targetAccount.playerId;
          window._currentPlayerId = targetAccount.playerId;
          window._currentSessionId = targetSessionId;
          try {
            sessionStorage.setItem("da_current_session_id", targetSessionId);
          } catch (e) {}
          window._cdPrefixStr = targetAccount.playerId + "_";
          window._cdPrefix = targetAccount.playerId + "_";
          window._currentUsername = targetAccount.username || "";
          window._progressLoaded = false;

          try {
            localStorage.setItem(
              "da_session",
              JSON.stringify({
                playerId: targetAccount.playerId,
                username: targetAccount.username,
                sessionId: targetSessionId,
              }),
            );
          } catch (e) {}

          // Await full user login and cloud data initialization from Firestore!
          if (typeof window._onUserLoggedIn === "function") {
            await window._onUserLoggedIn(
              targetAccount.playerId,
              targetAccount.username,
            );
          } else if (typeof window.loadProgress === "function") {
            await window.loadProgress();
          }
        } catch (err) {
          console.error("Error during account switch:", err);
        }

        if (pBar) pBar.style.width = "92%";
        if (pLabel) pLabel.textContent = "Updating interface & profile...";
        if (pPercent) pPercent.textContent = "92%";

        // Update HUD and Profile screen completely
        if (typeof updateHUD === "function") updateHUD();
        if (typeof applyProfileToHUD === "function") applyProfileToHUD();
        if (typeof openProfile === "function") openProfile();
        if (typeof window.updateSwitchAccountUI === "function") {
          window.updateSwitchAccountUI();
        }

        // If Spin & Win room/panel is open, refresh cooldown & live listener for the new account
        try {
          const spinPanel = document.getElementById("panel-spin");
          const isSpinActive =
            document.body.classList.contains("spin-room-active") ||
            (spinPanel && spinPanel.classList.contains("active"));
          if (isSpinActive) {
            if (typeof checkSpinCooldown === "function") checkSpinCooldown();
            if (typeof startGlobalSpinListener === "function") startGlobalSpinListener();
            const spinCoinsEl = document.getElementById("spinCoinsDisplay");
            if (
              spinCoinsEl &&
              typeof formatCoins === "function" &&
              typeof window._getCoins === "function"
            ) {
              spinCoinsEl.textContent = formatCoins(window._getCoins());
            }
          }
        } catch (e) {}

        // If Pattern Recall room is open, refresh cooldown & live listener for the new account
        try {
          const prPanel = document.getElementById("panel-pr");
          const isPrActive =
            document.body.classList.contains("pr-room-active") ||
            (prPanel && prPanel.classList.contains("active"));
          if (isPrActive) {
            if (typeof checkPrCooldown === "function") checkPrCooldown();
            if (typeof startGlobalPatternListener === "function") startGlobalPatternListener();
          }
        } catch (e) {}

        await new Promise((r) => setTimeout(r, 220));

        if (pBar) pBar.style.width = "100%";
        if (pLabel) pLabel.textContent = `✅ Ready! Welcome to ${tTown}!`;
        if (pPercent) pPercent.textContent = "100%";

        await new Promise((r) => setTimeout(r, 320));

        // Fade out overlay
        if (overlay) {
          overlay.style.opacity = "0";
          await new Promise((r) => setTimeout(r, 360));
          overlay.style.display = "none";
        }

        window._isSwitchingAccount = false;

        if (typeof showToast === "function") {
          showToast(`🔄 Switched to ${tTown || tName}! ⚡`);
        }
      };

      window.handleSwitchAccountClick = async function () {
        if (window._isSwitchingAccount) return;
        const other = window.getOtherSavedAccount();
        if (other) {
          const displayName = other.town
            ? `${other.town} (${other.name || other.username})`
            : other.name || other.username;
          if (!confirm(`Switch account to ${displayName}?`)) return;
          return window.executeAccountSwitch(other);
        } else {
          if (
            confirm(
              "No second account saved on this device yet. Would you like to log in to another account now?",
            )
          ) {
            if (window._progressLoaded && typeof window.saveProgress === "function") {
              try {
                await window.saveProgress(true);
              } catch (e) {
                console.warn("Failed to flush progress before account switch:", e);
              }
            }
            _currentPlayerId = null;
            window._currentPlayerId = null;
            window._currentUsername = "";
            window._progressLoaded = false;
            try {
              localStorage.removeItem("da_session");
            } catch (e) {}
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            showLobby();
            if (typeof toggleLobbyTab === "function") toggleLobbyTab("login");
          }
        }
      };

      window.quickSwitchAccount = function () {
        if (window._isSwitchingAccount) return;
        const other = window.getOtherSavedAccount();
        if (!other) {
          if (typeof showToast === "function") {
            showToast(
              "💡 Only 1 account saved on this device. Log in to your second account once in Profile to enable fast switching!",
            );
          }
          return;
        }
        return window.executeAccountSwitch(other);
      };

      function finishLogin(playerId, username, forceRemember, preloadedUserData, customSessionId) {
        _currentPlayerId = playerId;
        window._currentPlayerId = playerId;
        if (typeof window.profile === "object" && window.profile) {
          window.profile.playerId = playerId;
        }
        window._cdPrefixStr = playerId + "_";
        window._cdPrefix = playerId + "_";
        window._currentUsername = username || "";
        window._progressLoaded = false;
        window._preloadedUserData = preloadedUserData || null;

        const sessionId = customSessionId || ("sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
        window._currentSessionId = sessionId;
        try {
          sessionStorage.setItem("da_current_session_id", sessionId);
        } catch (e) {}

        // Persist session in localStorage — always save (Remember Me checked by default, or forced on register)
        const rememberEl = document.getElementById("rememberMe");
        const shouldRemember =
          forceRemember || !rememberEl || rememberEl.checked;
        try {
          if (shouldRemember) {
            localStorage.setItem(
              "da_session",
              JSON.stringify({ playerId, username, sessionId }),
            );
          } else {
            localStorage.removeItem("da_session");
          }
        } catch (e) {}
        window.saveDeviceAccount({
          playerId,
          username,
        });
        hideLobby();
        window._onUserLoggedIn(playerId, username);
      }

      // ── LOGOUT ────────────────────────────────────────────────
      window.__mod_doLogout = true;
      window.doLogout = async function () {
        if (!confirm("Log out of DA Hub?")) return;
        if (typeof window.hideFreezeModal === "function") {
          window.hideFreezeModal();
        }
        if (typeof window.stopLiveUserDocListener === "function") {
          try { window.stopLiveUserDocListener(); } catch (e) {}
        }
        window._accountFrozen = false;
        window._freezeData = null;
        if (window._progressLoaded && typeof window.saveProgress === "function") {
          try {
            await window.saveProgress(true);
          } catch (e) {
            console.warn("doLogout flush progress error:", e);
          }
        }
        const prevPid = _currentPlayerId || window._currentPlayerId;
        _currentPlayerId = null;
        window._currentPlayerId = null;
        window._currentSessionId = null;
        window._cdPrefixStr = "guest_";
        window._cdPrefix = "guest_";
        window._currentUsername = "";
        window._progressLoaded = false;
        _lastCommittedProtectedHash = null;
        try {
          localStorage.removeItem("da_session");
          if (prevPid) {
            localStorage.removeItem("da_dismissed_announcement_" + prevPid);
            sessionStorage.removeItem("da_dismissed_announcement_" + prevPid);
            sessionStorage.removeItem("da_away_modal_shown_" + prevPid);
          }
          localStorage.removeItem("da_dismissed_announcement_guest");
          sessionStorage.removeItem("da_dismissed_announcement_guest");
          sessionStorage.removeItem("da_current_session_id");
          sessionStorage.removeItem("da_current_tab");
        } catch (e) {}
        if (window.resetClientInMemoryState) {
          window.resetClientInMemoryState();
        }
        showLobby();
      };

      // ── SESSION RESTORE ───────────────────────────────────────
      window.__mod_tryRestoreSession = true;
      window.tryRestoreSession = async function () {
        try {
          const raw = localStorage.getItem("da_session");
          if (!raw) {
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          let sessionObj;
          try {
            sessionObj = JSON.parse(raw);
          } catch (pe) {
            localStorage.removeItem("da_session");
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          if (!sessionObj || typeof sessionObj !== "object") {
            localStorage.removeItem("da_session");
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          const playerId = (sessionObj.playerId || sessionObj.pid || sessionObj.id || "").trim();
          const username = (sessionObj.username || sessionObj.name || "").trim();
          if (!playerId) {
            localStorage.removeItem("da_session");
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          const sessionId = sessionObj.sessionId || ("sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
          if (!sessionObj.sessionId) {
            sessionObj.sessionId = sessionId;
            try {
              localStorage.setItem("da_session", JSON.stringify(sessionObj));
            } catch (e) {}
          }
          // Verify still valid in Firestore with realistic mobile timeout (10s) to prevent hanging on flaky mobile networks
          const getDocPromise = getDoc(doc(db, "da_users", playerId));
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("tryRestoreSession: Firestore getDoc timeout (10000ms)")), 10000)
          );
          const snap = await Promise.race([getDocPromise, timeoutPromise]);
          if (!snap.exists()) {
            localStorage.removeItem("da_session");
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          const d = snap.data();
          if (d && d.disabled) {
            localStorage.removeItem("da_session");
            if (window.resetClientInMemoryState) window.resetClientInMemoryState();
            return false;
          }
          const actualUsername = (d && d.username) || username;
          finishLogin(playerId, actualUsername, false, d, sessionId);
          return true;
        } catch (e) {
          console.warn("tryRestoreSession aborted:", e);
          if (window.resetClientInMemoryState) window.resetClientInMemoryState();
          return false;
        }
      };

      // ── SAVE / LOAD USER PROGRESS (Hardened with WAL & Auto-Reconciliation) ──
      let _saveProgressTimeout = null;
      let _pendingSaveResolve = [];
      let _lastOwnWriteTs = 0; // Fix 3: self-echo guard for startLiveUserDocListener
      let _saveQueue = Promise.resolve();
      let _isSaveInProgress = false;
      let _saveRetryTimer = null;
      let _saveRetryCount = 0;
      const MAX_SAVE_RETRIES = 3;
      let _lastCommittedProtectedHash = null;

      function _calculateProtectedHash(coins, history, cardsWon, ownedCards, shopItems, cooldowns, refunds) {
        return JSON.stringify({
          c: typeof coins === "number" ? coins : 0,
          hl: Array.isArray(history) ? history.length : 0,
          ht: (Array.isArray(history) && history[0] && history[0].ts) || "",
          cw: typeof cardsWon === "number" ? cardsWon : 0,
          oc: ownedCards && typeof ownedCards === "object" ? ownedCards : {},
          os: shopItems && typeof shopItems === "object" ? shopItems : {},
          cd: cooldowns && typeof cooldowns === "object" ? cooldowns : {},
          rf: Array.isArray(refunds) ? refunds : [],
        });
      }

      window._isSaveInProgress = false;

      // Sanitization helper: strips embedded base64 data URIs from archived requests
      // to keep user document payload under 25 KB (down from 770+ KB)
      function _sanitizeArchivedRequests(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.slice(0, 40).map((r) => {
          if (!r || typeof r !== "object") return r;
          const clean = { ...r };
          if (typeof clean.photoURL === "string" && clean.photoURL.startsWith("data:")) {
            clean.photoURL = "";
          }
          if (typeof clean.sentByPhoto === "string" && clean.sentByPhoto.startsWith("data:")) {
            clean.sentByPhoto = "";
          }
          return clean;
        });
      }

      window.hasPendingTransactions = function () {
        if (_isSaveInProgress) return true;
        const pid = _currentPlayerId || window._currentPlayerId;
        if (!pid) return false;
        try {
          const rawQ = localStorage.getItem("da_uncommitted_tx_" + pid);
          if (rawQ) {
            const q = JSON.parse(rawQ);
            return Array.isArray(q) && q.length > 0;
          }
        } catch (e) {}
        return false;
      };

      if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
          console.log("[saveProgress] Network reconnected, flushing pending saves...");
          if (typeof window.saveProgress === "function") {
            window.saveProgress(true);
          }
        });
        window.addEventListener("pagehide", () => {
          if (typeof window.flushPendingSave === "function") {
            window.flushPendingSave();
          }
        });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden" && typeof window.flushPendingSave === "function") {
            window.flushPendingSave();
          }
        });
      }

      window.flushPendingSave = async function () {
        if (typeof window.flushProfileAutoSave === "function") {
          try { window.flushProfileAutoSave(true); } catch (e) {}
        }
        if (_saveProgressTimeout) {
          clearTimeout(_saveProgressTimeout);
          _saveProgressTimeout = null;
          return await window.saveProgress(true);
        }
        return true;
      };

      window.cancelPendingSave = function () {
        if (_saveProgressTimeout) {
          clearTimeout(_saveProgressTimeout);
          _saveProgressTimeout = null;
        }
        const waiters = _pendingSaveResolve.slice();
        _pendingSaveResolve = [];
        waiters.forEach((cb) => {
          try { cb(false); } catch (e) {}
        });
      };

      window.saveProgress = function (immediate = false) {
        if (window._accountFrozen) {
          console.warn("saveProgress blocked: Account is frozen.");
          return Promise.resolve(false);
        }
        if (!userDoc() || !window._progressLoaded) {
          console.warn("saveProgress skipped: user not loaded or session invalid.");
          return Promise.resolve(false);
        }

        const targetDoc = userDoc();
        const targetPlayer = window._currentPlayerId;

        return new Promise((resolve) => {
          _pendingSaveResolve.push(resolve);

          const doSave = () => {
            if (_saveProgressTimeout) {
              clearTimeout(_saveProgressTimeout);
              _saveProgressTimeout = null;
            }
            const waiters = _pendingSaveResolve.slice();
            _pendingSaveResolve = [];

            if (!targetDoc || !window._progressLoaded || window._currentPlayerId !== targetPlayer) {
              console.warn("saveProgress aborted: player changed or session unloaded.");
              waiters.forEach((cb) => {
                try { cb(false); } catch (e) {}
              });
              return;
            }

            // Snapshot all data synchronously at the time save is triggered
            const curCoins = typeof window._getCoins === "function" ? window._getCoins() : 0;
            const curHistory = typeof window._getCoinHistory === "function" ? window._getCoinHistory() : [];
            const rawArchivedReqs = typeof window._getArchivedRequests === "function" ? window._getArchivedRequests() : [];
            const rawArchivedShop = typeof window._getArchivedShopRequests === "function" ? window._getArchivedShopRequests() : [];
            const curCardsWon = typeof window._getCardsWon === "function" ? window._getCardsWon() : 0;
            const curOwnedCards = typeof window._getOwnedCards === "function" ? window._getOwnedCards() : {};
            const curOwnedShopItems = window._getOwnedShopItems ? window._getOwnedShopItems() : {};
            const curCooldowns = window._getDailyCooldowns ? window._getDailyCooldowns() : {};
            const curDismissed = window._getDismissedReqIds ? window._getDismissedReqIds() : [];
            const curRefunds = window._getClaimedRefundReqIds ? window._getClaimedRefundReqIds() : [];
            let curProfile = window._getProfile ? window._getProfile() : {};
            if (curProfile && !curProfile.name && window._currentUsername) {
              curProfile = { ...curProfile, name: window._currentUsername };
            }

            const curProtectedHash = _calculateProtectedHash(
              curCoins,
              curHistory,
              curCardsWon,
              curOwnedCards,
              curOwnedShopItems,
              curCooldowns,
              curRefunds
            );
            const hasProtectedChange = (_lastCommittedProtectedHash === null || curProtectedHash !== _lastCommittedProtectedHash);

            let payload;
            if (hasProtectedChange) {
              payload = {
                coins: curCoins,
                coinHistory: (curHistory || []).slice(0, 100),
                cardsWon: curCardsWon,
                ownedCards: curOwnedCards,
                ownedShopItems: curOwnedShopItems,
                dailyCooldowns: curCooldowns,
                archivedRequests: _sanitizeArchivedRequests(rawArchivedReqs),
                archivedShopRequests: _sanitizeArchivedRequests(rawArchivedShop),
                dismissedReqIds: curDismissed,
                claimedRefundReqIds: curRefunds,
                profile: curProfile,
                updatedAt: new Date().toISOString(),
                txSeq: increment(1),
              };
            } else {
              payload = {
                archivedRequests: _sanitizeArchivedRequests(rawArchivedReqs),
                archivedShopRequests: _sanitizeArchivedRequests(rawArchivedShop),
                dismissedReqIds: curDismissed,
                profile: curProfile,
                updatedAt: new Date().toISOString(),
              };
            }

            _saveQueue = _saveQueue.then(async () => {
              _isSaveInProgress = true;
              window._isSaveInProgress = true;

              try {
                if (!targetDoc || !window._progressLoaded || window._currentPlayerId !== targetPlayer) {
                  console.warn("saveProgress aborted: player changed or session unloaded before write.");
                  waiters.forEach((cb) => {
                    try { cb(false); } catch (e) {}
                  });
                  return false;
                }

                _lastOwnWriteTs = Date.now();
                window.syncSocialSummaryToRtdb && window.syncSocialSummaryToRtdb();

                await updateDoc(targetDoc, payload);
                if (hasProtectedChange) {
                  _lastCommittedProtectedHash = curProtectedHash;
                }

                // Commit confirmed: clear uncommitted queue in localStorage
                try {
                  const pid = targetPlayer;
                  if (pid) {
                    localStorage.removeItem("da_uncommitted_tx_" + pid);
                    localStorage.setItem("da_last_committed_coins_" + pid, String(curCoins));
                  }
                  if (_saveRetryTimer) {
                    clearTimeout(_saveRetryTimer);
                    _saveRetryTimer = null;
                  }
                  _saveRetryCount = 0;
                } catch (cErr) {}

                waiters.forEach((cb) => {
                  try { cb(true); } catch (e) {}
                });
                return true;
              } catch (e) {
                console.warn("saveProgress failed, keeping uncommitted tx in WAL queue:", e);
                const errCode = (e && (e.code || e.name)) || "";
                const errMsg = (e && e.message) || "";
                const isNonRetryable =
                  errCode === "permission-denied" ||
                  errCode === "invalid-argument" ||
                  errCode === "not-found" ||
                  errMsg.includes("permission") ||
                  errMsg.includes("PERMISSION_DENIED") ||
                  errMsg.includes("Resource exhausted");

                if (isNonRetryable) {
                  console.error("saveProgress non-retryable error, halting retries to protect quota:", e);
                  _saveRetryCount = 0;
                } else if (_saveRetryCount >= MAX_SAVE_RETRIES) {
                  console.warn("saveProgress: max retries (3) reached. Halting retry loop to protect Spark write quota.");
                  _saveRetryCount = 0;
                } else if (!_saveRetryTimer && targetPlayer) {
                  _saveRetryCount++;
                  const backoffMs = Math.min(10000, 2000 * Math.pow(2, _saveRetryCount - 1));
                  _saveRetryTimer = setTimeout(() => {
                    _saveRetryTimer = null;
                    if (window._progressLoaded && window._currentPlayerId === targetPlayer) {
                      window.saveProgress(true);
                    }
                  }, backoffMs);
                }
                waiters.forEach((cb) => {
                  try { cb(false); } catch (e) {}
                });
                return false;
              } finally {
                _isSaveInProgress = false;
                window._isSaveInProgress = false;
              }
            });
          };

          if (immediate) {
            doSave();
          } else {
            if (_saveProgressTimeout) clearTimeout(_saveProgressTimeout);
            _saveProgressTimeout = setTimeout(doSave, 1000);
          }
        });
      };

      window.loadProgress = async function (cachedData) {
        if (!userDoc()) {
          window._progressLoaded = false;
          return false;
        }
        try {
          let d = cachedData || window._preloadedUserData || null;
          window._preloadedUserData = null;
          if (!d) {
            try {
              const snap = await getDoc(userDoc());
              if (snap && typeof snap.exists === "function" && snap.exists()) {
                d = snap.data();
              }
            } catch (snapErr) {
              console.warn("loadProgress getDoc failed, retrying with enableNetwork:", snapErr);
              if (typeof enableNetwork === "function") {
                try { await enableNetwork(db); } catch (ne) {}
              }
              await new Promise((r) => setTimeout(r, 600));
              const snap = await getDoc(userDoc());
              if (snap && typeof snap.exists === "function" && snap.exists()) {
                d = snap.data();
              }
            }
          }
          if (d) {
            if (d.username) window._currentUsername = d.username;

            // ── ACCOUNT FREEZE CHECK ──
            if (d.frozen === true) {
              window._accountFrozen = true;
              window._freezeData = {
                frozen: true,
                frozenBy: d.frozenBy || "Admin",
                frozenByPhoto: d.frozenByPhoto || "",
                frozenByAvatar: d.frozenByAvatar || "🧙",
                frozenByPid: d.frozenByPid || "",
                frozenAt: d.frozenAt || "",
                frozenReason: d.frozenReason || d.reason || "Account under administrative review",
              };
              if (typeof window.showFreezeModal === "function") {
                window.showFreezeModal(window._freezeData);
              }
            } else if (window._accountFrozen) {
              window._accountFrozen = false;
              window._freezeData = null;
              if (typeof window.hideFreezeModal === "function") {
                window.hideFreezeModal();
              }
            }

            // ── WAL RECONCILIATION: Recover any transactions dropped during unexpected reloads/crashes ──
            const pid = _currentPlayerId || window._currentPlayerId;
            let finalCoins = typeof d.coins === "number" ? d.coins : 0;
            let finalHistory = Array.isArray(d.coinHistory) ? d.coinHistory.slice() : [];
            let needsResave = false;

            if (pid) {
              try {
                const rawQueue = localStorage.getItem("da_uncommitted_tx_" + pid);
                if (rawQueue) {
                  const uncommitted = JSON.parse(rawQueue);
                  if (Array.isArray(uncommitted) && uncommitted.length > 0) {
                    let reconciledDelta = 0;
                    const docUpdatedMs = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;

                    uncommitted.forEach((tx) => {
                      if (!tx || typeof tx.delta !== "number") return;
                      // Guard: Never reconcile cloud-originated admin grants or deductions!
                      if (tx.reason && (tx.reason.includes("Granted by") || tx.reason.includes("Deducted by"))) return;
                      // Check if already present in d.coinHistory
                      const alreadyInHistory = finalHistory.some((h) =>
                        h &&
                        h.reason === tx.reason &&
                        Math.abs(new Date(h.ts).getTime() - (tx.ts || 0)) < 15000
                      );
                      // If transaction occurred at/after doc was last updated and is missing from history
                      if (!alreadyInHistory && (tx.ts || 0) >= docUpdatedMs - 2000) {
                        reconciledDelta += tx.delta;
                        finalHistory.unshift({
                          delta: tx.delta,
                          reason: tx.reason || "Reconciled transaction",
                          balance: finalCoins + reconciledDelta,
                          ts: new Date(tx.ts || Date.now()).toISOString(),
                          _reconciled: true,
                        });
                      }
                    });

                    if (reconciledDelta !== 0) {
                      finalCoins += reconciledDelta;
                      needsResave = true;
                      console.log(`[loadProgress] Reconciled ${reconciledDelta} uncommitted coins from local WAL queue.`);
                      if (typeof window.showToast === "function") {
                        window.showToast(
                          `💾 Reconciled ${reconciledDelta >= 0 ? "+" : ""}${reconciledDelta} coins from your previous session!`,
                        );
                      }
                    }
                    localStorage.removeItem("da_uncommitted_tx_" + pid);
                  }
                }
              } catch (recErr) {
                console.warn("[loadProgress] Reconciliation error:", recErr);
              }
            }

            if (typeof finalCoins === "number" && typeof window._setCoins === "function") {
              window._setCoins(finalCoins);
            }
            if (typeof window._setCoinHistory === "function") {
              window._setCoinHistory(finalHistory);
            }
            if (typeof d.cardsWon === "number" && typeof window._setCardsWon === "function") {
              window._setCardsWon(d.cardsWon);
            }
            if (d.ownedCards && typeof d.ownedCards === "object" && typeof window._setOwnedCards === "function") {
              window._setOwnedCards(d.ownedCards);
            }
            if (
              d.ownedShopItems &&
              typeof d.ownedShopItems === "object" &&
              typeof window._setOwnedShopItems === "function"
            ) {
              window._setOwnedShopItems(d.ownedShopItems);
            }
            if (Array.isArray(d.archivedRequests) && typeof window._setArchivedRequests === "function") {
              window._setArchivedRequests(d.archivedRequests);
            }
            if (Array.isArray(d.archivedShopRequests) && typeof window._setArchivedShopRequests === "function") {
              window._setArchivedShopRequests(d.archivedShopRequests);
            }
            if (d.profile && typeof d.profile === "object") {
              if (!d.profile.name && d.username) d.profile.name = d.username;
              if (d.designation && !d.profile.designation) d.profile.designation = d.designation;
              if (typeof window._setProfile === "function") window._setProfile(d.profile);
            }
            if (Array.isArray(d.dismissedReqIds) && typeof window._setDismissedReqIds === "function") {
              window._setDismissedReqIds(d.dismissedReqIds);
            }
            if (Array.isArray(d.claimedRefundReqIds) && typeof window._setClaimedRefundReqIds === "function") {
              window._setClaimedRefundReqIds(d.claimedRefundReqIds);
            }
            const activePid = _currentPlayerId || window._currentPlayerId;
            if (activePid) {
              window._cdPrefixStr = activePid + "_";
              window._cdPrefix = activePid + "_";
              window._currentPlayerId = activePid;
              _currentPlayerId = activePid;
              if (typeof window.profile === "object" && window.profile) {
                window.profile.playerId = activePid;
              }
            }
            if (d.dailyCooldowns && typeof d.dailyCooldowns === "object") {
              if (typeof window._setDailyCooldowns === "function") {
                window._setDailyCooldowns(d.dailyCooldowns);
              }
              if (d.dailyCooldowns.claimed_cycles && typeof d.dailyCooldowns.claimed_cycles === "object") {
                window._claimedCyclesMap = Object.assign({}, d.dailyCooldowns.claimed_cycles);
                window._claimedJpCycles = window._claimedJpCycles || {};
                Object.keys(d.dailyCooldowns.claimed_cycles).forEach(function (k) {
                  window._claimedJpCycles[k] = true;
                });
              }
              if (d.dailyCooldowns.pr_claimed_cycles && typeof d.dailyCooldowns.pr_claimed_cycles === "object") {
                window._claimedPrCyclesMap = Object.assign({}, d.dailyCooldowns.pr_claimed_cycles);
                window._claimedPrJpCycles = window._claimedPrJpCycles || {};
                Object.keys(d.dailyCooldowns.pr_claimed_cycles).forEach(function (k) {
                  window._claimedPrJpCycles[k] = true;
                });
              }
            }

            if (typeof d.aura === "number") window.aura = d.aura;
            if (typeof d.cardsSent === "number") window.cardsSent = d.cardsSent;
            const unameLower = (d.username || (d.profile && d.profile.name) || "").trim().toLowerCase();
            const isAuthAdmin = ["roomi", "naveen", "ron", "hogwarts", "arhane"].includes(unameLower);
            if (d.isAdmin === true && isAuthAdmin) {
              if (window.profile && typeof window.profile === "object") window.profile.isAdmin = true;
            } else {
              if (window.profile && typeof window.profile === "object") window.profile.isAdmin = false;
            }
            const isUnlocked =
              (typeof window._adminUnlocked === "function" && window._adminUnlocked() === true) ||
              (typeof adminUnlocked !== "undefined" && adminUnlocked === true);
            if (isUnlocked && typeof window.markCurrentPlayerAsAdmin === "function") {
              try { window.markCurrentPlayerAsAdmin(); } catch (e) {}
            }

            // Successfully populated from cloud!
            window._progressLoaded = true;
            _lastCommittedProtectedHash = _calculateProtectedHash(
              finalCoins,
              finalHistory,
              d.cardsWon,
              d.ownedCards,
              d.ownedShopItems,
              d.dailyCooldowns,
              d.claimedRefundReqIds
            );
            if (typeof window.saveDeviceAccount === "function") {
              try {
                window.saveDeviceAccount({
                  playerId: activePid,
                  username: d.username || window._currentUsername,
                  name: (d.profile && d.profile.name) || d.username || "",
                  town: (d.profile && d.profile.town) || "",
                  dob: (d.profile && d.profile.dob) || "",
                  avatar: (d.profile && d.profile.avatar) || "🧙",
                  photoURL: (d.profile && d.profile.photoURL) || "",
                });
              } catch (e) {}
            }

            // Detect pending coin grant from admin — store for modal, then clear from Firestore
            if (typeof d.pendingGrant === "number" && d.pendingGrant > 0) {
              window._pendingCoinGrant = d.pendingGrant;
              window._pendingCoinGrantNote = d.pendingGrantNote || "";
              window._pendingCoinGrantSender = d.pendingGrantSender || "";
              // Clear immediately so it only shows once
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingGrant: 0,
                    pendingGrantNote: "",
                    pendingGrantSender: "",
                    pendingGrantSenderPid: "",
                  });
                }
              } catch (e) {
                console.warn("Could not clear pendingGrant:", e);
              }
              if (!Array.isArray(d.coinHistory) || !d.coinHistory.length) {
                if (typeof window.logCoinTx === "function") {
                  const sName = window._pendingCoinGrantSender || "your DA leader";
                  window.logCoinTx(
                    d.pendingGrant,
                    window._pendingCoinGrantNote
                      ? `🎁 Granted by ${sName} — ${window._pendingCoinGrantNote}`
                      : `🎁 Granted by ${sName}`,
                    true, // skipWal = true so loadProgress does not double-credit via WAL reconciliation
                  );
                }
              }
            }
            // Detect pending coin deduction made by admin while the player was away
            if (typeof d.pendingDeduct === "number" && d.pendingDeduct > 0) {
              window._pendingCoinDeduct = d.pendingDeduct;
              window._pendingCoinDeductSender = d.pendingDeductSender || "";
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingDeduct: 0,
                    pendingDeductSender: "",
                  });
                }
              } catch (e) {
                console.warn("Could not clear pendingDeduct:", e);
              }
            }
            // Detect a full progress reset done by the DA leader while the player was away
            if (d.pendingReset === true) {
              window._pendingReset = true;
              try {
                if (userDoc()) await updateDoc(userDoc(), { pendingReset: false });
              } catch (e) {
                console.warn("Could not clear pendingReset:", e);
              }
            }
            // Detect pending Aura grant from admin while the player was away
            if (
              typeof d.pendingAuraGrant === "number" &&
              d.pendingAuraGrant > 0
            ) {
              window._pendingAuraGrant = d.pendingAuraGrant;
              window._pendingAuraGrantNote = d.pendingAuraGrantNote || "";
              window._pendingAuraGrantSender = d.pendingAuraGrantSender || "";
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingAuraGrant: 0,
                    pendingAuraGrantNote: "",
                    pendingAuraGrantSender: "",
                    pendingAuraGrantSenderPid: "",
                  });
                }
              } catch (e) {
                console.warn("Could not clear pendingAuraGrant:", e);
              }
            }
            // Detect pending Aura deduction from admin while the player was away
            if (
              typeof d.pendingAuraDeduct === "number" &&
              d.pendingAuraDeduct > 0
            ) {
              window._pendingAuraDeduct = d.pendingAuraDeduct;
              window._pendingAuraDeductSender = d.pendingAuraDeductSender || "";
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingAuraDeduct: 0,
                    pendingAuraDeductSender: "",
                  });
                }
              } catch (e) {
                console.warn("Could not clear pendingAuraDeduct:", e);
              }
            }
            // Detect pending Card grant from admin while the player was away
            if (d.pendingCardGrant && d.pendingCardGrant.token) {
              window._pendingCardGrant = d.pendingCardGrant;
              try {
                if (userDoc()) await updateDoc(userDoc(), { pendingCardGrant: null });
              } catch (e) {
                console.warn("Could not clear pendingCardGrant:", e);
              }
            }
            if (needsResave && typeof window.saveProgress === "function") {
              window.saveProgress(true);
            }
            return true;
          } else {
            window._progressLoaded = false;
            showToast("⚠️ Account progress not found.");
            return false;
          }
        } catch (e) {
          window._progressLoaded = false;
          console.error("loadProgress failed:", e);
          const errDetail = (e && (e.message || e.code || String(e))) || "Check connection.";
          showToast(`⚠️ Could not load cloud progress: ${errDetail}`);
          return false;
        }
      };

      // ── FETCH FRESH COIN HISTORY (for the coin history modal) ─
      // Reads directly from Firestore so admin-side grants/deductions (which write
      // coinHistory to the target player's doc without going through this device's
      // local state) are reflected immediately when the player opens the modal.
      window.__mod_fetchCoinHistory = true;
      window.fetchCoinHistory = async function () {
        if (!userDoc()) return [];
        try {
          const snap = await getDoc(userDoc());
          if (snap.exists()) {
            const hist = Array.isArray(snap.data().coinHistory)
              ? snap.data().coinHistory
              : [];
            window._setCoinHistory(hist);
            return hist;
          }
        } catch (e) {
          console.warn("fetchCoinHistory failed:", e);
        }
        // On error, fall back to local state rather than an empty list — but never
        // fall back to a stale PREVIOUS account's data (loadProgress already resets
        // this on every login, so local state here always belongs to the current player).
        return window._getCoinHistory ? window._getCoinHistory() : [];
      };

      // ── PRESENCE: lightweight heartbeat so other players can see who's
      // online in the Social tab. Bumps `lastActive` on our own doc right away,
      // then again every PRESENCE_INTERVAL_MS while the app stays open. This is
      // a separate field from `updatedAt` (which tracks progress saves) so
      // Fix 2: Presence heartbeat via RTDB (saves ~900 Firestore writes/day)
      const PRESENCE_INTERVAL_MS = 120 * 1000; // 2 min
      let _presenceTimer = null;
      window.__mod_startPresenceHeartbeat = true;
      window.startPresenceHeartbeat = function () {
        if (_presenceTimer) clearInterval(_presenceTimer);
        const pid = _currentPlayerId;
        if (!pid) return;
        const presRef = rtdbRef(_presenceRdb, "presence/" + pid);
        const bump = async () => {
          if (!_currentPlayerId || document.hidden) return;
          try {
            await rtdbSet(presRef, { lastActive: Date.now(), online: true });
            rtdbSet(rtdbRef(_presenceRdb, "socialSummary/" + _currentPlayerId + "/online"), true).catch(() => {});
            rtdbSet(rtdbRef(_presenceRdb, "socialSummary/" + _currentPlayerId + "/lastActive"), Date.now()).catch(() => {});
          } catch (e) { /* non-critical */ }
        };
        // Mark offline on disconnect so stale sessions clear
        try {
          onDisconnect(presRef).set({ lastActive: Date.now(), online: false });
          onDisconnect(rtdbRef(_presenceRdb, "socialSummary/" + pid + "/online")).set(false);
        } catch (e) {}
        bump();
        _presenceTimer = setInterval(bump, PRESENCE_INTERVAL_MS);
      };
      window.stopPresenceHeartbeat = function () {
        if (_presenceTimer) {
          clearInterval(_presenceTimer);
          _presenceTimer = null;
        }
        if (_currentPlayerId && _presenceRdb) {
          try {
            const presRef = rtdbRef(_presenceRdb, "presence/" + _currentPlayerId);
            rtdbSet(presRef, { lastActive: Date.now(), online: false });
            rtdbSet(rtdbRef(_presenceRdb, "socialSummary/" + _currentPlayerId + "/online"), false).catch(() => {});
            rtdbSet(rtdbRef(_presenceRdb, "socialSummary/" + _currentPlayerId + "/lastActive"), Date.now()).catch(() => {});
          } catch (e) {}
        }
      };

      // ── SOCIAL SUMMARY SYNC (Realtime Database) ───────────────
      // Keeps public member card in RTDB so the Social tab downloads a tiny ~7KB tree
      // without querying any full Firestore user docs.
      window.syncSocialSummaryToRtdb = function (override) {
        const pid = _currentPlayerId;
        if (!pid || !_presenceRdb) return;
        try {
          const pName = (typeof profile === "object" && profile && profile.name) || (typeof username === "string" && username) || "Unknown";
          const pAvatar = (typeof profile === "object" && profile && profile.avatar) || "🧙";
          const pPhoto = (typeof profile === "object" && profile && profile.photoURL) || "";
          const pDob = (typeof profile === "object" && profile && profile.dob) || "";
          if (!window._playerPhotoMap) window._playerPhotoMap = {};
          if (!window._playerPhotoByNameMap) window._playerPhotoByNameMap = {};
          if (pPhoto) {
            window._playerPhotoMap[pid] = pPhoto;
            window._playerPhotoByNameMap[String(pName).trim().toLowerCase()] = pPhoto;
          }
          const curCoins = typeof window._getCoins === "function" ? window._getCoins() : (typeof coins === "number" ? coins : 0);
          const curAura = typeof window.aura === "number" ? window.aura : 0;
          const curCardsSent = typeof window.cardsSent === "number" ? window.cardsSent : 0;
          const isAdm = typeof _isAdminAuthorized === "function" ? _isAdminAuthorized() : false;
          const pDesig = (typeof profile === "object" && profile && (profile.designation || profile.desig)) || null;

          const data = {
            id: pid,
            playerId: pid,
            name: pName,
            avatar: pAvatar,
            photoURL: pPhoto,
            dob: pDob,
            coins: curCoins,
            aura: curAura,
            cardsSent: curCardsSent,
            isAdmin: isAdm,
            lastActive: Date.now(),
            online: !document.hidden,
            ...(pDesig ? { designation: pDesig } : {}),
            ...(override || {})
          };
          rtdbUpdate(rtdbRef(_presenceRdb, "socialSummary/" + pid), data).catch(() => {});
        } catch (e) {}
      };

      // ── ADMIN: Authorization helper ───────────────────────────
      function _isAdminAuthorized() {
        if (typeof window._adminUnlocked === "function" && window._adminUnlocked() === true) return true;
        if (typeof adminUnlocked !== "undefined" && adminUnlocked === true) return true;
        const wrap = document.getElementById("adminWrap");
        if (wrap && wrap.classList.contains("unlocked")) return true;
        const curProfile = (typeof profile === "object" && profile) || window._currentProfile;
        if (curProfile && curProfile.isAdmin === true) {
          try {
            const pin = localStorage.getItem("da_admin_pin");
            if (pin === "696969" || pin === "76664") return true;
          } catch (e) {}
        }
        return false;
      }
      window._isAdminAuthorized = _isAdminAuthorized;

      // ── ADMIN & PLAYER PRESENCE (Realtime Database — 0 Firestore reads) ──
      let _adminPresenceRtdbRef = null;
      let _adminPresenceResetTimer = null;
      let _adminPresenceLiveUnsub = null;
      let _playerPresenceLiveUnsub = null;

      window.setAdminPresenceState = function (action = "viewing", meta = {}) {
        const pid = _currentPlayerId || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
        if (!pid || !_presenceRdb) return;
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) return;

        const adminName = (typeof profile === "object" && profile && profile.name) || (typeof username === "string" && username) || "Admin";
        const adminAvatar = (typeof profile === "object" && profile && profile.avatar) || "🧙";
        const adminPhoto = (typeof profile === "object" && profile && profile.photoURL) || "";

        _adminPresenceRtdbRef = rtdbRef(_presenceRdb, "presence/admin/" + pid);
        const data = {
          pid: pid,
          name: adminName,
          avatar: adminAvatar,
          photoURL: adminPhoto,
          online: true,
          lastActive: Date.now(),
          action: action, // "viewing" | "sending"
          lastSentAt: action === "sending" ? Date.now() : (meta.lastSentAt || null),
          ...meta
        };

        rtdbSet(_adminPresenceRtdbRef, data).catch((err) => {
          console.warn("RTDB setAdminPresenceState failed:", err);
        });
        try {
          onDisconnect(_adminPresenceRtdbRef).remove();
        } catch (e) {}

        if (action === "sending") {
          if (_adminPresenceResetTimer) clearTimeout(_adminPresenceResetTimer);
          _adminPresenceResetTimer = setTimeout(() => {
            _adminPresenceResetTimer = null;
            const adminPanel = document.getElementById("panel-admin");
            if (adminPanel && adminPanel.classList.contains("active")) {
              window.setAdminPresenceState("viewing");
            }
          }, 15000);
        }
      };

      window.removeAdminPresence = function () {
        if (_adminPresenceResetTimer) {
          clearTimeout(_adminPresenceResetTimer);
          _adminPresenceResetTimer = null;
        }
        const pid = _currentPlayerId || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
        if (pid && _presenceRdb) {
          try {
            rtdbRemove(rtdbRef(_presenceRdb, "presence/admin/" + pid)).catch(() => {});
          } catch (e) {}
        }
      };

      window.startLiveAdminPresenceListener = function (onUpdate) {
        if (_adminPresenceLiveUnsub) return _adminPresenceLiveUnsub;
        if (!_presenceRdb || typeof rtdbOnValue !== "function") return null;
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) return null;

        try {
          const adminRef = rtdbRef(_presenceRdb, "presence/admin");
          _adminPresenceLiveUnsub = rtdbOnValue(
            adminRef,
            (snap) => {
              const val = snap.val() || {};
              const now = Date.now();
              const admins = Object.values(val).filter((a) => {
                return a && a.pid && a.online !== false && a.lastActive && (now - a.lastActive < 4 * 60 * 1000);
              });
              if (typeof onUpdate === "function") {
                onUpdate(admins);
              } else if (typeof window.renderAdminActiveBar === "function") {
                window.renderAdminActiveBar(admins);
              }
            },
            (err) => {
              console.warn("RTDB presence/admin listener error:", err);
            }
          );
          return _adminPresenceLiveUnsub;
        } catch (e) {
          console.warn("startLiveAdminPresenceListener failed:", e);
          return null;
        }
      };

      window.stopLiveAdminPresenceListener = function () {
        if (_adminPresenceLiveUnsub) {
          try { _adminPresenceLiveUnsub(); } catch (e) {}
          _adminPresenceLiveUnsub = null;
        }
        window.removeAdminPresence();
      };

      window.startLivePlayerPresenceListener = function (onUpdate) {
        if (_playerPresenceLiveUnsub) return _playerPresenceLiveUnsub;
        if (!_presenceRdb || typeof rtdbOnValue !== "function") return null;
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) return null;

        try {
          const presRef = rtdbRef(_presenceRdb, "presence");
          _playerPresenceLiveUnsub = rtdbOnValue(
            presRef,
            (snap) => {
              const val = snap.val() || {};
              if (typeof onUpdate === "function") {
                onUpdate(val);
              } else if (typeof window.onPlayerPresenceUpdate === "function") {
                window.onPlayerPresenceUpdate(val);
              }
            },
            (err) => {
              console.warn("RTDB player presence listener error:", err);
            }
          );
          return _playerPresenceLiveUnsub;
        } catch (e) {
          console.warn("startLivePlayerPresenceListener failed:", e);
          return null;
        }
      };

      window.stopLivePlayerPresenceListener = function () {
        if (_playerPresenceLiveUnsub) {
          try { _playerPresenceLiveUnsub(); } catch (e) {}
          _playerPresenceLiveUnsub = null;
        }
      };

      // ── ADMIN: Reset a player's PIN ───────────────────────────
      window.__mod_adminResetPin = true;
      window.adminResetPin = async function (playerId, playerName) {
        if (!_isAdminAuthorized()) {
          alert("Unauthorized: Admin PIN required.");
          return false;
        }
        const newPin = prompt(
          `Reset PIN for ${playerName}.\nEnter new 4-digit PIN:`,
        );
        if (!newPin) return false;
        if (!/^\d{4}$/.test(newPin)) {
          alert("PIN must be 4 digits.");
          return false;
        }
        try {
          const newHash = await hashPin(newPin);
          await updateDoc(doc(db, "da_users", playerId), {
            pinHash: newHash,
          });
          showToast("🔐 PIN reset for " + playerName + "!");
          return true;
        } catch (e) {
          showToast("❌ Reset failed.");
          return false;
        }
      };

      // ── ADMIN: shared helper — build a capped coinHistory array (newest first,
      // max 100 entries) for a direct Firestore write, used by the admin grant/
      // deduct functions below since they mutate another player's doc directly
      // (not through the local `coins` variable / logCoinTx on this device).
      function _buildCoinHistoryEntry(existing, delta, reason, newBalance) {
        const arr = Array.isArray(existing) ? existing.slice(0, 99) : [];
        arr.unshift({
          delta,
          reason: reason || "Coins updated",
          ts: new Date().toISOString(),
          balance: newBalance,
        });
        return arr;
      }

      // ── ADMIN: Shared Grant History (persistent across all admins) ──
      async function _recordGrantHistoryEntry(entry) {
        if (!entry) return;
        try {
          const adminAttr = _getAdminAttribution();
          const adminPid = entry.adminPid || adminAttr.pid || "";
          const adminName = entry.adminName || adminAttr.name || "Admin";
          const resolvedPlayerName = entry.targetName || entry.mode || _lookupPlayerName(entry.targetPlayerId) || "";
          const fullEntry = {
            id:
              entry.id ||
              "grant_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
            type: entry.type || "coins",
            direction: entry.direction || "grant",
            targetType: entry.targetType || "one",
            targetPlayerId: entry.targetPlayerId || "",
            targetName: resolvedPlayerName,
            mode: resolvedPlayerName || "Specific Player",
            amount: typeof entry.amount === "number" ? entry.amount : 0,
            status: entry.status || (entry.direction === "deduct" ? "deducted" : "completed"),
            result: entry.result || (entry.direction === "deduct" ? "Deducted" : "Sent"),
            note: (entry.note || "").trim(),
            adminName: adminName,
            adminPid: adminPid,
            timestamp: entry.timestamp || new Date().toISOString(),
            ts: typeof entry.ts === "number" ? entry.ts : Date.now(),
          };

          // OPTIMISTIC SYNCHRONOUS UI UPDATE (0ms):
          // Immediately display in the admin grant history feed without waiting for network or Firestore
          if (typeof window._prependLocalGrantEntry === "function") {
            try {
              window._prependLocalGrantEntry(fullEntry);
            } catch (e) {}
          }

          let updatedGrants = [];
          try {
            await runTransaction(db, async (tx) => {
              const snap = await tx.get(GRANT_HISTORY_DOC);
              const existing =
                snap.exists() && Array.isArray(snap.data().grants)
                  ? snap.data().grants
                  : [];
              const filtered = existing.filter((g) => g && g.id !== fullEntry.id);
              updatedGrants = [fullEntry, ...filtered].slice(0, 50);
              tx.set(
                GRANT_HISTORY_DOC,
                {
                  grants: updatedGrants,
                  lastUpdated: new Date().toISOString(),
                },
                { merge: true },
              );
            });
          } catch (txErr) {
            console.warn(
              "runTransaction on grantHistory failed, falling back to setDoc:",
              txErr,
            );
            const snap = await getDoc(GRANT_HISTORY_DOC);
            const existing =
              snap.exists() && Array.isArray(snap.data().grants)
                ? snap.data().grants
                : [];
            const filtered = existing.filter((g) => g && g.id !== fullEntry.id);
            updatedGrants = [fullEntry, ...filtered].slice(0, 50);
            await setDoc(
              GRANT_HISTORY_DOC,
              {
                grants: updatedGrants,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true },
            );
          }

          if (
            _presenceRdb &&
            typeof rtdbSet === "function" &&
            typeof rtdbRef === "function"
          ) {
            try {
              rtdbSet(rtdbRef(_presenceRdb, "grantHistory"), updatedGrants).catch(
                () => {},
              );
            } catch (e) {}
          }

          if (typeof window._updateLocalGrantHistory === "function") {
            window._updateLocalGrantHistory(updatedGrants);
          }
        } catch (e) {
          console.warn("Failed to record grant history entry:", e);
          if (typeof window._prependLocalGrantEntry === "function") {
            window._prependLocalGrantEntry(entry);
          }
        }
      }

      async function _updateGrantHistoryEntryStatus(id, updates) {
        if (!id || !updates) return;
        try {
          if (typeof window._patchLocalGrantEntry === "function") {
            try {
              window._patchLocalGrantEntry(id, updates);
            } catch (e) {}
          }
          let updatedGrants = [];
          try {
            await runTransaction(db, async (tx) => {
              const snap = await tx.get(GRANT_HISTORY_DOC);
              const existing =
                snap.exists() && Array.isArray(snap.data().grants)
                  ? snap.data().grants
                  : [];
              let matched = false;
              updatedGrants = existing.map((g) => {
                if (g && g.id === id) {
                  matched = true;
                  return { ...g, ...updates, lastUpdated: new Date().toISOString() };
                }
                return g;
              });
              if (!matched) return;
              tx.set(
                GRANT_HISTORY_DOC,
                {
                  grants: updatedGrants,
                  lastUpdated: new Date().toISOString(),
                },
                { merge: true },
              );
            });
          } catch (txErr) {
            const snap = await getDoc(GRANT_HISTORY_DOC);
            const existing =
              snap.exists() && Array.isArray(snap.data().grants)
                ? snap.data().grants
                : [];
            updatedGrants = existing.map((g) => {
              if (g && g.id === id) {
                return { ...g, ...updates, lastUpdated: new Date().toISOString() };
              }
              return g;
            });
            await setDoc(
              GRANT_HISTORY_DOC,
              {
                grants: updatedGrants,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true },
            );
          }

          if (
            _presenceRdb &&
            typeof rtdbSet === "function" &&
            typeof rtdbRef === "function"
          ) {
            try {
              rtdbSet(rtdbRef(_presenceRdb, "grantHistory"), updatedGrants).catch(() => {});
            } catch (e) {}
          }

          if (typeof window._updateLocalGrantHistory === "function") {
            window._updateLocalGrantHistory(updatedGrants);
          }
        } catch (e) {
          console.warn("Failed to update grant history entry status:", e);
        }
      }
      window._updateGrantHistoryEntryStatus = _updateGrantHistoryEntryStatus;

      // ═══════════════════════════════════════════════════════════
      // DURABLE ADMIN OUTBOX QUEUE (Guaranteed Delivery Engine)
      // Ensures grants and deductions reach the player at any cost,
      // persisting across network dropouts, app restarts, or page reloads.
      // ═══════════════════════════════════════════════════════════
      const ADMIN_OUTBOX_STORAGE_KEY = "da_admin_outbox_queue";
      let _adminOutboxProcessing = false;
      let _adminOutboxRetryTimer = null;

      function _getAdminOutboxQueue() {
        try {
          const raw = localStorage.getItem(ADMIN_OUTBOX_STORAGE_KEY);
          if (!raw) return [];
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return [];
        }
      }

      function _saveAdminOutboxQueue(queue) {
        try {
          if (!Array.isArray(queue) || queue.length === 0) {
            localStorage.removeItem(ADMIN_OUTBOX_STORAGE_KEY);
          } else {
            localStorage.setItem(ADMIN_OUTBOX_STORAGE_KEY, JSON.stringify(queue.slice(0, 100)));
          }
        } catch (e) {}
      }

      function _enqueueAdminOutbox(job) {
        if (!job || !job.opId) return;
        const queue = _getAdminOutboxQueue();
        if (!queue.some((j) => j.opId === job.opId)) {
          queue.push({
            ...job,
            attempts: job.attempts || 0,
            enqueuedAt: job.enqueuedAt || Date.now(),
          });
          _saveAdminOutboxQueue(queue);
        }
      }

      function _dequeueAdminOutbox(opId) {
        if (!opId) return;
        const queue = _getAdminOutboxQueue();
        const next = queue.filter((j) => j.opId !== opId);
        _saveAdminOutboxQueue(next);
      }

      function _scheduleAdminOutboxRetry(delayMs) {
        if (_adminOutboxRetryTimer) clearTimeout(_adminOutboxRetryTimer);
        const delay = typeof delayMs === "number" ? delayMs : 2500;
        _adminOutboxRetryTimer = setTimeout(() => {
          _adminOutboxRetryTimer = null;
          _processAdminOutboxQueue();
        }, delay);
      }

      async function _processAdminOutboxQueue() {
        if (_adminOutboxProcessing) return;
        const queue = _getAdminOutboxQueue();
        if (queue.length === 0) return;

        _adminOutboxProcessing = true;
        let hasNetworkFailures = false;

        try {
          for (const job of queue) {
            try {
              if (job.type === "aura") {
                if (job.action === "grant") {
                  const res = await window.adminGrantAuraOne(
                    job.playerId,
                    job.amount,
                    job.note,
                    { opId: job.opId, isRetry: true, skipHistory: true }
                  );
                  if (res === null || (res && !res.queued)) {
                    _dequeueAdminOutbox(job.opId);
                  } else if (res && res.queued) {
                    hasNetworkFailures = true;
                  }
                } else if (job.action === "deduct") {
                  const res = await window.adminDeductAuraOne(
                    job.playerId,
                    job.amount,
                    job.note,
                    { opId: job.opId, isRetry: true, skipHistory: true }
                  );
                  if (res === null || (res && !res.queued)) {
                    _dequeueAdminOutbox(job.opId);
                  } else if (res && res.queued) {
                    hasNetworkFailures = true;
                  }
                }
              } else if (job.action === "grant") {
                const res = await window.adminGrantCoinsOne(
                  job.playerId,
                  job.amount,
                  job.note,
                  { opId: job.opId, isRetry: true, skipHistory: true }
                );
                if (res === null || (res && !res.queued)) {
                  _dequeueAdminOutbox(job.opId);
                } else if (res && res.queued) {
                  hasNetworkFailures = true;
                }
              } else if (job.action === "deduct") {
                const res = await window.adminDeductCoinsOne(
                  job.playerId,
                  job.amount,
                  job.note,
                  { opId: job.opId, isRetry: true, skipHistory: true }
                );
                if (res === null || (res && !res.queued)) {
                  _dequeueAdminOutbox(job.opId);
                } else if (res && res.queued) {
                  hasNetworkFailures = true;
                }
              } else if (job.type === "bulk_player_grant") {
                const userRef = doc(db, "da_users", job.playerId);
                const receiptRef = doc(db, "da_users", job.playerId, "bulkGrantReceipts", job.bulkGrantId);
                const res = await runTransaction(db, async (tx) => {
                  const [userSnap, receiptSnap] = await Promise.all([tx.get(userRef), tx.get(receiptRef)]);
                  if (!userSnap.exists()) return "not_found";
                  if (receiptSnap.exists()) return "already_granted";

                  const d = userSnap.data() || {};
                  if (d.frozen === true) return "frozen_skipped";
                  const curCoins = typeof d.coins === "number" ? d.coins : 0;
                  const newCoins = curCoins + job.amount;
                  const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
                  const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;
                  const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;
                  const now = new Date().toISOString();

                  const isReversal = !!(job.note && /reversal/i.test(job.note));
                  let newPendingDeduct = curPendingDeduct;
                  let newPendingGrant = curPendingGrant;

                  if (isReversal && curPendingDeduct > 0) {
                    const offset = Math.min(curPendingDeduct, job.amount);
                    newPendingDeduct = curPendingDeduct - offset;
                    const remaining = job.amount - offset;
                    newPendingGrant = curPendingGrant + remaining;
                  } else {
                    newPendingGrant = curPendingGrant + job.amount;
                  }

                  const newHistory = _buildCoinHistoryEntry(
                    d.coinHistory,
                    job.amount,
                    job.note ? `🎁 Granted by ${job.adminName} — ${job.note}` : `🎁 Granted by ${job.adminName}`,
                    newCoins
                  );

                  tx.update(userRef, {
                    coins: newCoins,
                    coinHistory: newHistory,
                    pendingGrant: newPendingGrant,
                    pendingGrantNote: job.note || "",
                    pendingGrantSender: job.adminName,
                    pendingGrantSenderPid: job.adminPid,
                    pendingDeduct: newPendingDeduct,
                    pendingDeductSender: newPendingDeduct > 0 ? (d.pendingDeductSender || "") : "",
                    pendingDeductSenderPid: newPendingDeduct > 0 ? (d.pendingDeductSenderPid || "") : "",
                    updatedAt: now,
                    txSeq: curTxSeq + 1,
                  });

                  tx.set(receiptRef, {
                    bulkGrantId: job.bulkGrantId,
                    amount: job.amount,
                    grantedAt: now,
                    adminPid: job.adminPid,
                  });

                  return "granted";
                });

                if (res === "granted" || res === "already_granted" || res === "not_found" || res === "frozen_skipped") {
                  _dequeueAdminOutbox(job.opId);
                }
              } else if (job.type === "bulk_player_deduct") {
                const userRef = doc(db, "da_users", job.playerId);
                const receiptRef = doc(db, "da_users", job.playerId, "bulkDeductReceipts", job.bulkDeductId);
                const res = await runTransaction(db, async (tx) => {
                  const [userSnap, receiptSnap] = await Promise.all([tx.get(userRef), tx.get(receiptRef)]);
                  if (!userSnap.exists()) return "not_found";
                  if (receiptSnap.exists()) return "already_deducted";

                  const d = userSnap.data() || {};
                  if (d.frozen === true) return "frozen_skipped";
                  const curCoins = typeof d.coins === "number" ? d.coins : 0;
                  const newCoins = Math.max(0, curCoins - job.amount);
                  const actualDeducted = curCoins - newCoins;
                  const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
                  const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;
                  const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;
                  const now = new Date().toISOString();

                  let newPendingGrant = curPendingGrant;
                  let newPendingDeduct = curPendingDeduct;

                  if (curPendingGrant > 0) {
                    const offset = Math.min(curPendingGrant, actualDeducted);
                    newPendingGrant = curPendingGrant - offset;
                    const remaining = actualDeducted - offset;
                    newPendingDeduct = curPendingDeduct + remaining;
                  } else {
                    newPendingDeduct = curPendingDeduct + actualDeducted;
                  }

                  let deductSender = job.adminName;
                  let deductSenderPid = job.adminPid;
                  if (curPendingDeduct > 0 && d.pendingDeductSender && d.pendingDeductSender !== job.adminName) {
                    deductSender = "DA Leadership";
                    deductSenderPid = "admin";
                  }

                  const newHistory = _buildCoinHistoryEntry(
                    d.coinHistory,
                    -actualDeducted,
                    job.note ? `⚠️ Deducted by ${job.adminName} — ${job.note}` : `⚠️ Deducted by ${job.adminName}`,
                    newCoins
                  );

                  tx.update(userRef, {
                    coins: newCoins,
                    coinHistory: newHistory,
                    pendingGrant: newPendingGrant,
                    pendingGrantSender: newPendingGrant > 0 ? (d.pendingGrantSender || "") : "",
                    pendingGrantSenderPid: newPendingGrant > 0 ? (d.pendingGrantSenderPid || "") : "",
                    pendingGrantNote: newPendingGrant > 0 ? (d.pendingGrantNote || "") : "",
                    pendingDeduct: newPendingDeduct,
                    pendingDeductSender: newPendingDeduct > 0 ? deductSender : "",
                    pendingDeductSenderPid: newPendingDeduct > 0 ? deductSenderPid : "",
                    updatedAt: now,
                    txSeq: curTxSeq + 1,
                  });

                  tx.set(receiptRef, {
                    bulkDeductId: job.bulkDeductId,
                    amount: actualDeducted,
                    deductedAt: now,
                    adminPid: job.adminPid,
                  });

                  return "deducted";
                });

                if (res === "deducted" || res === "already_deducted" || res === "not_found" || res === "frozen_skipped") {
                  _dequeueAdminOutbox(job.opId);
                }
              }
            } catch (jobErr) {
              hasNetworkFailures = true;
            }
          }
        } finally {
          _adminOutboxProcessing = false;
          const remaining = _getAdminOutboxQueue();
          if (remaining.length > 0 && hasNetworkFailures) {
            _scheduleAdminOutboxRetry(5000);
          }
        }
      }

      if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
          _processAdminOutboxQueue();
        });
        setTimeout(() => {
          _processAdminOutboxQueue();
        }, 1500);
      }

      window.__mod_loadGrantHistory = true;
      window.loadGrantHistory = async function () {
        try {
          const snap = await getDoc(GRANT_HISTORY_DOC);
          if (snap.exists() && Array.isArray(snap.data().grants)) {
            return snap.data().grants.slice(0, 50);
          }
        } catch (e) {
          console.warn("Firebase read failed (grantHistory):", e);
        }
        if (
          _presenceRdb &&
          typeof rtdbGet === "function" &&
          typeof rtdbRef === "function"
        ) {
          try {
            const rSnap = await rtdbGet(rtdbRef(_presenceRdb, "grantHistory"));
            if (rSnap.exists() && Array.isArray(rSnap.val())) {
              return rSnap.val().slice(0, 50);
            }
          } catch (e) {}
        }
        return [];
      };

      let _grantHistoryLiveUnsub = null;
      window.startLiveGrantHistoryAdminListener = function (callback) {
        if (_grantHistoryLiveUnsub) return _grantHistoryLiveUnsub;
        if (
          typeof window._isAdminAuthorized === "function" &&
          !window._isAdminAuthorized()
        ) {
          return null;
        }
        try {
          _grantHistoryLiveUnsub = onSnapshot(
            GRANT_HISTORY_DOC,
            (snap) => {
              if (!snap.exists()) return;
              const data = snap.data();
              if (Array.isArray(data.grants)) {
                const grants = data.grants.slice(0, 50);
                if (typeof callback === "function") {
                  callback(grants);
                } else if (
                  typeof window.onGrantHistoryUpdated === "function"
                ) {
                  window.onGrantHistoryUpdated(grants);
                }
              }
            },
            (err) => {
              console.warn("Live grant history listener error:", err);
            },
          );
          return _trackUnsub(_grantHistoryLiveUnsub);
        } catch (e) {
          console.warn("Could not start live grant history listener:", e);
          return null;
        }
      };

      window.stopLiveGrantHistoryAdminListener = function () {
        if (_grantHistoryLiveUnsub) {
          try {
            _grantHistoryLiveUnsub();
          } catch (e) {}
          _grantHistoryLiveUnsub = null;
        }
      };

      window.seedInitialGrantHistoryFromPlayers = async function (players) {
        if (!Array.isArray(players) || players.length === 0) return [];
        try {
          const snap = await getDoc(GRANT_HISTORY_DOC);
          if (
            snap.exists() &&
            Array.isArray(snap.data().grants) &&
            snap.data().grants.length > 0
          ) {
            return snap.data().grants.slice(0, 50);
          }
          const seeded = [];
          players.forEach((p) => {
            const pid = p.playerId || p.id || "";
            const pName = p.profile?.name || p.username || pid || "Player";
            const ch = Array.isArray(p.coinHistory) ? p.coinHistory : [];
            ch.forEach((entry) => {
              if (!entry || !entry.reason) return;
              const reason = String(entry.reason);
              if (
                reason.includes("🎁 Granted") ||
                reason.includes("Granted by")
              ) {
                let parsedAdmin = "Admin";
                const m = reason.match(/Granted by ([^—–-]+)/i);
                if (m && m[1]) {
                  const candidate = m[1].replace(/your DA leader/i, "").trim();
                  if (candidate && !/leader/i.test(candidate)) parsedAdmin = candidate;
                }
                const rawNote = reason
                  .replace(/^🎁\s*Granted by [^—–-]+(\s*[—–-]\s*)?/i, "")
                  .trim();
                seeded.push({
                  id:
                    "legacy_" +
                    pid +
                    "_" +
                    (entry.ts || Math.random().toString(36).slice(2, 7)),
                  type: "coins",
                  direction: "grant",
                  targetType: "one",
                  targetPlayerId: pid,
                  targetName: pName,
                  mode: pName,
                  amount: Math.abs(entry.delta || 0),
                  result: "Sent",
                  note: rawNote,
                  adminName: parsedAdmin,
                  adminPid: "",
                  timestamp: entry.ts || new Date().toISOString(),
                  ts: entry.ts ? new Date(entry.ts).getTime() : 0,
                });
              } else if (
                reason.includes("Deducted by") ||
                reason.includes("⚠️ Deducted") ||
                (typeof entry.delta === "number" &&
                  entry.delta < 0 &&
                  reason.toLowerCase().includes("deduct"))
              ) {
                let parsedAdmin = "Admin";
                const m = reason.match(/Deducted by ([^—–-]+)/i);
                if (m && m[1]) {
                  const candidate = m[1].replace(/your DA leader/i, "").trim();
                  if (candidate && !/leader/i.test(candidate)) parsedAdmin = candidate;
                }
                const rawNote = reason
                  .replace(/^(?:⚠️\s*)?Deducted by [^—–-]+(\s*[—–-]\s*)?/i, "")
                  .trim();
                seeded.push({
                  id:
                    "legacy_deduct_" +
                    pid +
                    "_" +
                    (entry.ts || Math.random().toString(36).slice(2, 7)),
                  type: "coins",
                  direction: "deduct",
                  targetType: "one",
                  targetPlayerId: pid,
                  targetName: pName,
                  mode: pName,
                  amount: Math.abs(entry.delta || 0),
                  result: "Deducted",
                  note: rawNote || "Balance adjustment",
                  adminName: parsedAdmin,
                  adminPid: "",
                  timestamp: entry.ts || new Date().toISOString(),
                  ts: entry.ts ? new Date(entry.ts).getTime() : 0,
                });
              }
            });
          });

          if (seeded.length > 0) {
            seeded.sort((a, b) => (b.ts || 0) - (a.ts || 0));
            const top50 = seeded.slice(0, 50);
            await setDoc(
              GRANT_HISTORY_DOC,
              {
                grants: top50,
                lastUpdated: new Date().toISOString(),
              },
              { merge: true },
            );
            return top50;
          }
        } catch (e) {
          console.warn("Could not seed initial grant history:", e);
        }
        return [];
      };

      // ── ADMIN: Grant coins to ALL players ─────────────────────
      window.__mod_adminGrantCoinsAll = true;
      let _adminGrantAllInProgress = false;
      window.adminGrantCoinsAll = async function (amount, note, onProgress) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminGrantCoinsAll attempt.");
          return -1;
        }
        if (!amount || amount <= 0) return 0;
        if (_adminGrantAllInProgress) {
          console.warn("adminGrantCoinsAll already in progress, ignoring duplicate call.");
          return -1;
        }
        _adminGrantAllInProgress = true;

        // Screen wake lock to prevent mobile devices from sleeping/suspending mid-grant
        let wakeLock = null;
        if (typeof navigator !== "undefined" && "wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
          try {
            wakeLock = await navigator.wakeLock.request("screen");
          } catch (wlErr) {
            console.warn("Screen wakeLock unavailable:", wlErr);
          }
        }

        try {
          const admin = _getAdminAttribution();
          const snap = await getDocs(USERS_COL);
          if (!snap || snap.empty) {
            return 0;
          }

          // Durable bulk-grant operation ID with expiration protection
          const activeBulkKey = "da_active_bulk_grant_id";
          const activeBulkTimeKey = "da_active_bulk_grant_ts";
          let bulkGrantId = "";
          let bulkGrantTs = 0;
          try {
            bulkGrantId = localStorage.getItem(activeBulkKey) || "";
            bulkGrantTs = parseInt(localStorage.getItem(activeBulkTimeKey) || "0", 10);
          } catch (e) {}

          // If the stored bulkGrantId is older than 30 minutes, consider it stale/expired and create a fresh one
          const STALE_BULK_GRANT_MS = 30 * 60 * 1000;
          if (!bulkGrantId || !bulkGrantTs || (Date.now() - bulkGrantTs > STALE_BULK_GRANT_MS)) {
            bulkGrantId = "bg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
            try {
              localStorage.setItem(activeBulkKey, bulkGrantId);
              localStorage.setItem(activeBulkTimeKey, String(Date.now()));
            } catch (e) {}
          }

          let count = 0;
          let alreadyGrantedCount = 0;
          const failedPlayers = [];
          const rtdbUpdates = {};
          const now = new Date().toISOString();
          const totalDocs = snap.docs.length;

          // Record in Admin Grant History immediately (0ms optimistic UI display)
          _recordGrantHistoryEntry({
            id: bulkGrantId,
            type: "coins",
            direction: "grant",
            targetType: "all",
            mode: "All players",
            targetName: "All players",
            targetPlayerId: "ALL",
            amount: amount,
            status: "pending",
            result: `Sending to ${totalDocs} players…`,
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: now,
            ts: Date.now(),
          }).catch(() => {});

          // Helper: Grant to a single player with automatic retry (up to 3 attempts with jittered backoff)
          const MAX_RETRIES = 3;
          async function processPlayerWithRetry(docSnap) {
            const playerId = docSnap.id;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const res = await runTransaction(db, async (tx) => {
                  const userRef = doc(db, "da_users", playerId);
                  const receiptRef = doc(db, "da_users", playerId, "bulkGrantReceipts", bulkGrantId);

                  const [userDocSnap, receiptDocSnap] = await Promise.all([
                    tx.get(userRef),
                    tx.get(receiptRef),
                  ]);

                  if (!userDocSnap.exists()) {
                    return { status: "not_found" };
                  }
                  if (receiptDocSnap.exists()) {
                    // Idempotency: already granted to this player under this bulkGrantId
                    return { status: "already_granted" };
                  }

                  const d = userDocSnap.data() || {};
                  if (d.frozen === true) {
                    return { status: "frozen_skipped" };
                  }
                  const curCoins = typeof d.coins === "number" ? d.coins : 0;
                  const newCoins = curCoins + amount;
                  const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
                  const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;
                  const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;

                  const isReversal = !!(note && /reversal/i.test(note));
                  let newPendingDeduct = curPendingDeduct;
                  let newPendingGrant = curPendingGrant;

                  if (isReversal && curPendingDeduct > 0) {
                    const offset = Math.min(curPendingDeduct, amount);
                    newPendingDeduct = curPendingDeduct - offset;
                    const remaining = amount - offset;
                    newPendingGrant = curPendingGrant + remaining;
                  } else {
                    newPendingGrant = curPendingGrant + amount;
                  }

                  const newHistory = _buildCoinHistoryEntry(
                    d.coinHistory,
                    amount,
                    note
                      ? `🎁 Granted by ${admin.name} — ${note}`
                      : `🎁 Granted by ${admin.name}`,
                    newCoins,
                  );

                  tx.update(userRef, {
                    coins: newCoins,
                    coinHistory: newHistory,
                    pendingGrant: newPendingGrant,
                    pendingGrantNote: note || "",
                    pendingGrantSender: admin.name,
                    pendingGrantSenderPid: admin.pid,
                    pendingDeduct: newPendingDeduct,
                    pendingDeductSender: newPendingDeduct > 0 ? (d.pendingDeductSender || "") : "",
                    pendingDeductSenderPid: newPendingDeduct > 0 ? (d.pendingDeductSenderPid || "") : "",
                    updatedAt: now,
                    txSeq: curTxSeq + 1,
                  });

                  tx.set(receiptRef, {
                    bulkGrantId: bulkGrantId,
                    amount: amount,
                    grantedAt: now,
                    adminPid: admin.pid,
                  });

                  return { status: "granted", newCoins };
                });

                if (res && res.status === "granted") {
                  count++;
                  rtdbUpdates[`socialSummary/${playerId}/coins`] = res.newCoins;
                  return;
                } else if (res && res.status === "already_granted") {
                  alreadyGrantedCount++;
                  return;
                } else if (res && res.status === "not_found") {
                  return;
                }
              } catch (err) {
                lastError = err;
                if (attempt < MAX_RETRIES) {
                  await new Promise((r) => setTimeout(r, 80 * attempt + Math.random() * 50));
                }
              }
            }

            console.error(`adminGrantCoinsAll failed permanently for ${playerId}:`, lastError);
            failedPlayers.push({ playerId, error: lastError ? lastError.message : "unknown" });
          }

          // Sliding-window parallel queue: keeps 16 parallel workers continuously busy
          // Processed smoothly in 2-3 seconds with zero socket flooding or connection resets
          const CONCURRENCY = 16;
          let docIdx = 0;
          let completedCount = 0;
          const workers = Array.from({ length: Math.min(CONCURRENCY, totalDocs) }, async () => {
            while (docIdx < totalDocs) {
              const currentDoc = snap.docs[docIdx++];
              if (!currentDoc) break;
              await processPlayerWithRetry(currentDoc);
              completedCount++;
              if (typeof onProgress === "function") {
                try {
                  onProgress(completedCount, totalDocs);
                } catch (progErr) {}
              }
            }
          });

          await Promise.all(workers);

          // Operation complete: clear durable active operation ID
          try {
            localStorage.removeItem(activeBulkKey);
            localStorage.removeItem(activeBulkTimeKey);
          } catch (e) {}

          // If any players encountered transient contention, queue them in the durable outbox for guaranteed delivery
          if (failedPlayers.length > 0) {
            failedPlayers.forEach((f) => {
              _enqueueAdminOutbox({
                opId: `bg_${bulkGrantId}_${f.playerId}`,
                bulkGrantId: bulkGrantId,
                type: "bulk_player_grant",
                action: "grant",
                playerId: f.playerId,
                amount: amount,
                note: note || "",
                adminName: admin.name,
                adminPid: admin.pid,
                createdAt: Date.now(),
                attempts: 0,
              });
            });
            _scheduleAdminOutboxRetry(2000);
          }

          // Synchronize Realtime Database socialSummary in one multi-path update (non-blocking)
          if (_presenceRdb && typeof rtdbUpdate === "function" && Object.keys(rtdbUpdates).length > 0) {
            rtdbUpdate(rtdbRef(_presenceRdb), rtdbUpdates).catch((rtdbErr) => {
              console.warn("RTDB socialSummary bulk coins update failed:", rtdbErr);
            });
          }

          if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

          // Update shared persistent grant history with confirmed counts
          const resultSummary = alreadyGrantedCount > 0
            ? `${count} players (+${alreadyGrantedCount} already granted)`
            : `${count} players`;

          _updateGrantHistoryEntryStatus(bulkGrantId, {
            status: "completed",
            result: resultSummary,
          }).catch(() => {
            _recordGrantHistoryEntry({
              id: bulkGrantId,
              type: "coins",
              direction: "grant",
              targetType: "all",
              mode: "All players",
              targetName: "All players",
              targetPlayerId: "ALL",
              amount: amount,
              status: "completed",
              result: resultSummary,
              note: note || "",
              adminName: admin.name,
              adminPid: admin.pid,
              timestamp: new Date().toISOString(),
              ts: Date.now(),
            }).catch((ghErr) => console.warn("Background grant history error:", ghErr));
          });

          return {
            count,
            alreadyGrantedCount,
            total: totalDocs,
            failedPlayers,
          };
        } catch (e) {
          console.error("adminGrantCoinsAll failed:", e);
          _updateGrantHistoryEntryStatus(bulkGrantId, {
            status: "failed",
            result: "Failed: " + (e.message || String(e)),
          }).catch(() => {});
          return -1;
        } finally {
          try {
            if (wakeLock) await wakeLock.release();
          } catch (e) {}
          _adminGrantAllInProgress = false;
        }
      };

      // ── ADMIN: Deduct coins from ALL players ───────────────────
      window.__mod_adminDeductCoinsAll = true;
      let _adminDeductAllInProgress = false;
      window.adminDeductCoinsAll = async function (amount, note, onProgress) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductCoinsAll attempt.");
          return -1;
        }
        if (!amount || amount <= 0) return 0;
        if (_adminDeductAllInProgress) {
          console.warn("adminDeductCoinsAll already in progress, ignoring duplicate call.");
          return -1;
        }
        _adminDeductAllInProgress = true;

        // Screen wake lock to prevent mobile devices from sleeping/suspending mid-deduction
        let wakeLock = null;
        if (typeof navigator !== "undefined" && "wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
          try {
            wakeLock = await navigator.wakeLock.request("screen");
          } catch (wlErr) {
            console.warn("Screen wakeLock unavailable:", wlErr);
          }
        }

        try {
          const admin = _getAdminAttribution();
          const snap = await getDocs(USERS_COL);
          if (!snap || snap.empty) {
            return 0;
          }

          // Durable bulk-deduct operation ID with expiration protection
          const activeBulkKey = "da_active_bulk_deduct_id";
          const activeBulkTimeKey = "da_active_bulk_deduct_ts";
          let bulkDeductId = "";
          let bulkDeductTs = 0;
          try {
            bulkDeductId = localStorage.getItem(activeBulkKey) || "";
            bulkDeductTs = parseInt(localStorage.getItem(activeBulkTimeKey) || "0", 10);
          } catch (e) {}

          const STALE_BULK_DEDUCT_MS = 30 * 60 * 1000;
          if (!bulkDeductId || !bulkDeductTs || (Date.now() - bulkDeductTs > STALE_BULK_DEDUCT_MS)) {
            bulkDeductId = "bd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
            try {
              localStorage.setItem(activeBulkKey, bulkDeductId);
              localStorage.setItem(activeBulkTimeKey, String(Date.now()));
            } catch (e) {}
          }

          let count = 0;
          let alreadyDeductedCount = 0;
          const failedPlayers = [];
          const rtdbUpdates = {};
          const now = new Date().toISOString();
          const totalDocs = snap.docs.length;

          // Record in Admin Grant History immediately (0ms optimistic UI display)
          _recordGrantHistoryEntry({
            id: bulkDeductId,
            type: "coins",
            direction: "deduct",
            targetType: "all",
            mode: "All players",
            targetName: "All players",
            targetPlayerId: "ALL",
            amount: amount,
            status: "pending",
            result: `Deducting from ${totalDocs} players…`,
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: now,
            ts: Date.now(),
          }).catch(() => {});

          // Helper: Deduct from a single player with automatic retry (up to 3 attempts with jittered backoff)
          const MAX_RETRIES = 3;
          async function processPlayerWithRetry(docSnap) {
            const playerId = docSnap.id;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const res = await runTransaction(db, async (tx) => {
                  const userRef = doc(db, "da_users", playerId);
                  const receiptRef = doc(db, "da_users", playerId, "bulkDeductReceipts", bulkDeductId);

                  const [userDocSnap, receiptDocSnap] = await Promise.all([
                    tx.get(userRef),
                    tx.get(receiptRef),
                  ]);

                  if (!userDocSnap.exists()) {
                    return { status: "not_found" };
                  }
                  if (receiptDocSnap.exists()) {
                    // Idempotency: already deducted from this player under this bulkDeductId
                    return { status: "already_deducted" };
                  }

                  const d = userDocSnap.data() || {};
                  if (d.frozen === true) {
                    return { status: "frozen_skipped" };
                  }
                  const curCoins = typeof d.coins === "number" ? d.coins : 0;
                  const newCoins = Math.max(0, curCoins - amount);
                  const actualDeducted = curCoins - newCoins;
                  const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
                  const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;
                  const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;

                  let newPendingGrant = curPendingGrant;
                  let newPendingDeduct = curPendingDeduct;

                  if (curPendingGrant > 0) {
                    const offset = Math.min(curPendingGrant, actualDeducted);
                    newPendingGrant = curPendingGrant - offset;
                    const remaining = actualDeducted - offset;
                    newPendingDeduct = curPendingDeduct + remaining;
                  } else {
                    newPendingDeduct = curPendingDeduct + actualDeducted;
                  }

                  let deductSender = admin.name;
                  let deductSenderPid = admin.pid;
                  if (curPendingDeduct > 0 && d.pendingDeductSender && d.pendingDeductSender !== admin.name) {
                    deductSender = "DA Leadership";
                    deductSenderPid = "admin";
                  }

                  const newHistory = _buildCoinHistoryEntry(
                    d.coinHistory,
                    -actualDeducted,
                    note
                      ? `⚠️ Deducted by ${admin.name} — ${note}`
                      : `⚠️ Deducted by ${admin.name}`,
                    newCoins,
                  );

                  tx.update(userRef, {
                    coins: newCoins,
                    coinHistory: newHistory,
                    pendingGrant: newPendingGrant,
                    pendingGrantSender: newPendingGrant > 0 ? (d.pendingGrantSender || "") : "",
                    pendingGrantSenderPid: newPendingGrant > 0 ? (d.pendingGrantSenderPid || "") : "",
                    pendingGrantNote: newPendingGrant > 0 ? (d.pendingGrantNote || "") : "",
                    pendingDeduct: newPendingDeduct,
                    pendingDeductSender: newPendingDeduct > 0 ? deductSender : "",
                    pendingDeductSenderPid: newPendingDeduct > 0 ? deductSenderPid : "",
                    updatedAt: now,
                    txSeq: curTxSeq + 1,
                  });

                  tx.set(receiptRef, {
                    bulkDeductId: bulkDeductId,
                    amount: actualDeducted,
                    deductedAt: now,
                    adminPid: admin.pid,
                  });

                  return { status: "deducted", newCoins };
                });

                if (res && res.status === "deducted") {
                  count++;
                  rtdbUpdates[`socialSummary/${playerId}/coins`] = res.newCoins;
                  return;
                } else if (res && res.status === "already_deducted") {
                  alreadyDeductedCount++;
                  return;
                } else if (res && res.status === "not_found") {
                  return;
                }
              } catch (err) {
                lastError = err;
                if (attempt < MAX_RETRIES) {
                  await new Promise((r) => setTimeout(r, 80 * attempt + Math.random() * 50));
                }
              }
            }

            console.error(`adminDeductCoinsAll failed permanently for ${playerId}:`, lastError);
            failedPlayers.push({ playerId, error: lastError ? lastError.message : "unknown" });
          }

          // Sliding-window parallel queue: keeps 16 parallel workers continuously busy
          const CONCURRENCY = 16;
          let docIdx = 0;
          let completedCount = 0;
          const workers = Array.from({ length: Math.min(CONCURRENCY, totalDocs) }, async () => {
            while (docIdx < totalDocs) {
              const currentDoc = snap.docs[docIdx++];
              if (!currentDoc) break;
              await processPlayerWithRetry(currentDoc);
              completedCount++;
              if (typeof onProgress === "function") {
                try {
                  onProgress(completedCount, totalDocs);
                } catch (progErr) {}
              }
            }
          });

          await Promise.all(workers);

          // Clear durable active operation ID
          try {
            localStorage.removeItem(activeBulkKey);
            localStorage.removeItem(activeBulkTimeKey);
          } catch (e) {}

          // Enqueue any failed players in outbox
          if (failedPlayers.length > 0) {
            failedPlayers.forEach((f) => {
              _enqueueAdminOutbox({
                opId: `bd_${bulkDeductId}_${f.playerId}`,
                bulkDeductId: bulkDeductId,
                type: "bulk_player_deduct",
                action: "deduct",
                playerId: f.playerId,
                amount: amount,
                note: note || "",
                adminName: admin.name,
                adminPid: admin.pid,
                createdAt: Date.now(),
                attempts: 0,
              });
            });
            _scheduleAdminOutboxRetry(2000);
          }

          // Synchronize Realtime Database socialSummary in one multi-path update (non-blocking)
          if (_presenceRdb && typeof rtdbUpdate === "function" && Object.keys(rtdbUpdates).length > 0) {
            rtdbUpdate(rtdbRef(_presenceRdb), rtdbUpdates).catch((rtdbErr) => {
              console.warn("RTDB socialSummary bulk coins deduction update failed:", rtdbErr);
            });
          }

          if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

          // Update shared persistent grant history with confirmed counts
          const resultSummary = alreadyDeductedCount > 0
            ? `${count} players (+${alreadyDeductedCount} already deducted)`
            : `${count} players`;

          _updateGrantHistoryEntryStatus(bulkDeductId, {
            status: "completed",
            result: resultSummary,
          }).catch(() => {
            _recordGrantHistoryEntry({
              id: bulkDeductId,
              type: "coins",
              direction: "deduct",
              targetType: "all",
              mode: "All players",
              targetName: "All players",
              targetPlayerId: "ALL",
              amount: amount,
              status: "completed",
              result: resultSummary,
              note: note || "",
              adminName: admin.name,
              adminPid: admin.pid,
              timestamp: new Date().toISOString(),
              ts: Date.now(),
            }).catch((ghErr) => console.warn("Background grant history error:", ghErr));
          });

          return {
            count,
            alreadyDeductedCount,
            total: totalDocs,
            failedPlayers,
          };
        } catch (e) {
          console.error("adminDeductCoinsAll failed:", e);
          _updateGrantHistoryEntryStatus(bulkDeductId, {
            status: "failed",
            result: "Failed: " + (e.message || String(e)),
          }).catch(() => {});
          return -1;
        } finally {
          try {
            if (wakeLock) await wakeLock.release();
          } catch (e) {}
          _adminDeductAllInProgress = false;
        }
      };

      // ── ADMIN: Grant coins to ONE specific player ──────────────
      window.__mod_adminGrantCoinsOne = true;
      window.adminGrantCoinsOne = async function (playerId, amount, note, options) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminGrantCoinsOne attempt.");
          return false;
        }
        if (!playerId || !amount || amount <= 0) return false;
        const admin = _getAdminAttribution();
        const opId = (options && options.opId) || ("op_grant_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
        const isRetry = !!(options && options.isRetry);
        const skipHistory = !!(options && options.skipHistory);

        // Resolve recipient name immediately from memory cache if available
        let recipientName = _lookupPlayerName(playerId) || playerId;

        // 1. Immediately record in Grant History with status "pending" (YELLOW)
        if (!isRetry) {
          _recordGrantHistoryEntry({
            id: opId,
            type: "coins",
            direction: "grant",
            targetType: "one",
            targetPlayerId: playerId,
            targetName: recipientName,
            mode: recipientName,
            amount: amount,
            status: "pending",
            result: "Pending",
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: new Date().toISOString(),
            ts: Date.now(),
          }).catch((err) => console.warn("Background grant history error:", err));
        }

        // Persist in durable outbox for guaranteed delivery if network contentious
        if (!isRetry) {
          _enqueueAdminOutbox({
            opId,
            type: "coins",
            action: "grant",
            playerId,
            amount,
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            createdAt: Date.now(),
            attempts: 0,
          });
        }

        const ref = doc(db, "da_users", playerId);
        const receiptRef = doc(db, "da_users", playerId, "singleGrantReceipts", opId);
        let lastError = null;

        // Up to 2 immediate attempts with jittered retry
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const txResult = await runTransaction(db, async (tx) => {
              const [snap, receiptSnap] = await Promise.all([
                tx.get(ref),
                tx.get(receiptRef),
              ]);

              if (!snap.exists()) return null; // player not found
              const d = snap.data();
              if (d.frozen === true) {
                return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
              }
              const cur = typeof d.coins === "number" ? d.coins : 0;
              const name = d.profile?.name || d.username || playerId;
              recipientName = name;

              // Idempotency check: if this operation ID was already committed, abort safely without re-granting!
              if (receiptSnap.exists()) {
                return { status: "already_processed", newCoins: cur, name };
              }

              const newCoins = cur + amount;
              const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
              const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;
              const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;
              const now = new Date().toISOString();

              const isReversal = !!(note && /reversal/i.test(note));
              let newPendingDeduct = curPendingDeduct;
              let newPendingGrant = curPendingGrant;

              if (isReversal && curPendingDeduct > 0) {
                // If this grant is explicitly reversing a deduction, offset pendingDeduct!
                const offset = Math.min(curPendingDeduct, amount);
                newPendingDeduct = curPendingDeduct - offset;
                const remaining = amount - offset;
                newPendingGrant = curPendingGrant + remaining;
              } else {
                newPendingGrant = curPendingGrant + amount;
              }

              const newHistory = _buildCoinHistoryEntry(
                d.coinHistory,
                amount,
                note
                  ? `🎁 Granted by ${admin.name} — ${note}`
                  : `🎁 Granted by ${admin.name}`,
                newCoins,
              );

              tx.update(ref, {
                coins: newCoins,
                coinHistory: newHistory,
                pendingGrant: newPendingGrant,
                pendingGrantNote: note || "",
                pendingGrantSender: admin.name,
                pendingGrantSenderPid: admin.pid,
                pendingDeduct: newPendingDeduct,
                pendingDeductSender: newPendingDeduct > 0 ? (d.pendingDeductSender || "") : "",
                pendingDeductSenderPid: newPendingDeduct > 0 ? (d.pendingDeductSenderPid || "") : "",
                updatedAt: now,
                txSeq: curTxSeq + 1,
              });

              tx.set(receiptRef, {
                opId: opId,
                type: "grant",
                amount: amount,
                grantedAt: now,
                adminName: admin.name,
                adminPid: admin.pid,
              });

              return { status: "granted", newCoins, name };
            });

            if (txResult === null) {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Not found",
              }).catch(() => {});
              return null; // Player not found (intentional, don't retry)
            }

            if (txResult && txResult.status === "frozen") {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Account is frozen",
              }).catch(() => {});
              return txResult;
            }

            if (txResult && (txResult.status === "granted" || txResult.status === "already_processed")) {
              _dequeueAdminOutbox(opId);

              const finalCoins = txResult.newCoins;
              const finalName = txResult.name;

              // Transition status in Grant History to completed / Received (GREEN)
              _updateGrantHistoryEntryStatus(opId, {
                status: "completed",
                result: "Received",
                targetName: finalName,
                mode: finalName,
              }).catch(() => {});

              // Non-blocking RTDB update
              if (window._presenceRdb && window._rtdbRef && window._rtdbSet) {
                window._rtdbSet(window._rtdbRef(window._presenceRdb, "socialSummary/" + playerId + "/coins"), finalCoins).catch(() => {});
              }
              if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

              return { name: finalName, newCoins: finalCoins, opId, success: true };
            }
          } catch (e) {
            lastError = e;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 120));
            }
          }
        }

        // Connection/network drop: queued in durable outbox for guaranteed delivery in background
        _scheduleAdminOutboxRetry();
        _updateGrantHistoryEntryStatus(opId, {
          status: "pending",
          result: "Queued",
        }).catch(() => {});
        console.warn("adminGrantCoinsOne queued in outbox for guaranteed delivery:", lastError);
        return { name: recipientName, newCoins: null, queued: true, opId, success: false, error: lastError ? (lastError.message || String(lastError)) : "Network failure" };
      };

      // ── ADMIN: Grant Aura to ONE specific player ───────────────
      window.__mod_adminGrantAuraOne = true;
      window.adminGrantAuraOne = async function (playerId, amount, note, options) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminGrantAuraOne attempt.");
          return false;
        }
        if (!playerId || !amount || amount <= 0) return false;
        const admin = _getAdminAttribution();
        const opId = (options && options.opId) || ("op_aura_grant_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
        const isRetry = !!(options && options.isRetry);
        const skipHistory = !!(options && options.skipHistory);

        // Resolve recipient name immediately from memory cache if available
        let recipientName = _lookupPlayerName(playerId) || playerId;

        // 1. Immediately record in Grant History with status "pending" (YELLOW)
        if (!isRetry) {
          _recordGrantHistoryEntry({
            id: opId,
            type: "aura",
            direction: "grant",
            targetType: "one",
            targetPlayerId: playerId,
            targetName: recipientName,
            mode: recipientName,
            amount: amount,
            status: "pending",
            result: "Pending",
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: new Date().toISOString(),
            ts: Date.now(),
          }).catch((err) => console.warn("Background aura grant history error:", err));
        }

        // Persist in durable outbox for guaranteed delivery if network contentious
        if (!isRetry) {
          _enqueueAdminOutbox({
            opId,
            type: "aura",
            action: "grant",
            playerId,
            amount,
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            createdAt: Date.now(),
            attempts: 0,
          });
        }

        const ref = doc(db, "da_users", playerId);
        const receiptRef = doc(db, "da_users", playerId, "singleGrantReceipts", opId);
        let lastError = null;

        // Up to 2 immediate attempts with jittered retry
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const txResult = await runTransaction(db, async (tx) => {
              const [snap, receiptSnap] = await Promise.all([
                tx.get(ref),
                tx.get(receiptRef),
              ]);

              if (!snap.exists()) return null; // player not found
              const d = snap.data();
              if (d.frozen === true) {
                return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
              }
              const cur = typeof d.aura === "number" ? d.aura : 0;
              const name = d.profile?.name || d.username || playerId;
              recipientName = name;

              // Idempotency check: if this operation ID was already committed, abort safely without re-granting!
              if (receiptSnap.exists()) {
                return { status: "already_processed", newAura: cur, name };
              }

              const newAura = cur + amount;
              const existingPending = typeof d.pendingAuraGrant === "number" ? d.pendingAuraGrant : 0;
              const now = new Date().toISOString();

              tx.update(ref, {
                aura: newAura,
                pendingAuraGrant: existingPending + amount,
                pendingAuraGrantNote: note || "",
                pendingAuraGrantSender: admin.name,
                pendingAuraGrantSenderPid: admin.pid,
                updatedAt: now,
              });

              tx.set(receiptRef, {
                opId: opId,
                type: "aura_grant",
                amount: amount,
                grantedAt: now,
                adminName: admin.name,
                adminPid: admin.pid,
              });

              return { status: "granted", newAura, name };
            });

            if (txResult === null) {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Not found",
              }).catch(() => {});
              return null; // Player not found (intentional, don't retry)
            }

            if (txResult && txResult.status === "frozen") {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Account is frozen",
              }).catch(() => {});
              return txResult;
            }

            if (txResult && (txResult.status === "granted" || txResult.status === "already_processed")) {
              _dequeueAdminOutbox(opId);

              const finalAura = txResult.newAura;
              const finalName = txResult.name;

              // Transition status in Grant History to completed / Received (GREEN)
              _updateGrantHistoryEntryStatus(opId, {
                status: "completed",
                result: "Received",
                targetName: finalName,
                mode: finalName,
              }).catch(() => {});

              // Non-blocking RTDB update
              if (window._presenceRdb && window._rtdbRef && window._rtdbSet) {
                window._rtdbSet(window._presenceRdb && window._rtdbRef(window._presenceRdb, "socialSummary/" + playerId + "/aura"), finalAura).catch(() => {});
              }
              if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

              return { name: finalName, newAura: finalAura, opId, success: true };
            }
          } catch (e) {
            lastError = e;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 120));
            }
          }
        }

        // Connection/network drop: queued in durable outbox for guaranteed delivery in background
        _scheduleAdminOutboxRetry();
        _updateGrantHistoryEntryStatus(opId, {
          status: "pending",
          result: "Queued",
        }).catch(() => {});
        console.warn("adminGrantAuraOne queued in outbox for guaranteed delivery:", lastError);
        return { name: recipientName, newAura: null, queued: true, opId, success: false, error: lastError ? (lastError.message || String(lastError)) : "Network failure" };
      };

      // ── ADMIN: Deduct Aura from ONE specific player ────────────
      window.__mod_adminDeductAuraOne = true;
      window.adminDeductAuraOne = async function (playerId, amount, note, options) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductAuraOne attempt.");
          return false;
        }
        if (!playerId || !amount || amount <= 0) return false;
        const admin = _getAdminAttribution();
        const opId = (options && options.opId) || ("op_aura_deduct_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
        const isRetry = !!(options && options.isRetry);
        const skipHistory = !!(options && options.skipHistory);

        // Resolve recipient name immediately from memory cache if available
        let recipientName = _lookupPlayerName(playerId) || playerId;

        // 1. Immediately record in Grant History with status "pending" (YELLOW)
        if (!isRetry) {
          _recordGrantHistoryEntry({
            id: opId,
            type: "aura",
            direction: "deduct",
            targetType: "one",
            targetPlayerId: playerId,
            targetName: recipientName,
            mode: recipientName,
            amount: amount,
            status: "pending",
            result: "Pending",
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: new Date().toISOString(),
            ts: Date.now(),
          }).catch((err) => console.warn("Background aura deduct history error:", err));
        }

        // Persist in durable outbox for guaranteed deduction if network contentious
        if (!isRetry) {
          _enqueueAdminOutbox({
            opId,
            type: "aura",
            action: "deduct",
            playerId,
            amount,
            note: note || "",
            adminName: admin.name,
            adminPid: admin.pid,
            createdAt: Date.now(),
            attempts: 0,
          });
        }

        const ref = doc(db, "da_users", playerId);
        const receiptRef = doc(db, "da_users", playerId, "singleGrantReceipts", opId);
        let lastError = null;

        // Up to 2 immediate attempts with jittered retry
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const txResult = await runTransaction(db, async (tx) => {
              const [snap, receiptSnap] = await Promise.all([
                tx.get(ref),
                tx.get(receiptRef),
              ]);

              if (!snap.exists()) return null; // player not found
              const d = snap.data();
              if (d.frozen === true) {
                return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
              }
              const cur = typeof d.aura === "number" ? d.aura : 0;
              const name = d.profile?.name || d.username || playerId;
              recipientName = name;

              // Idempotency check: if this operation ID was already committed, abort safely without re-deducting!
              if (receiptSnap.exists()) {
                return { status: "already_processed", newAura: cur, name, actualDeducted: 0 };
              }

              const newAura = Math.max(0, cur - amount);
              const actualDeducted = cur - newAura;
              const existingPending = typeof d.pendingAuraDeduct === "number" ? d.pendingAuraDeduct : 0;
              const now = new Date().toISOString();

              if (actualDeducted > 0) {
                tx.update(ref, {
                  aura: newAura,
                  pendingAuraDeduct: existingPending + actualDeducted,
                  pendingAuraDeductSender: admin.name,
                  pendingAuraDeductSenderPid: admin.pid,
                  updatedAt: now,
                });
              }

              tx.set(receiptRef, {
                opId: opId,
                type: "aura_deduct",
                amount: actualDeducted,
                deductedAt: now,
                adminName: admin.name,
                adminPid: admin.pid,
              });

              return { status: "deducted", newAura, name, actualDeducted };
            });

            if (txResult === null) {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Not found",
              }).catch(() => {});
              return null; // Player not found (intentional, don't retry)
            }

            if (txResult && txResult.status === "frozen") {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Account is frozen",
              }).catch(() => {});
              return txResult;
            }

            if (txResult && (txResult.status === "deducted" || txResult.status === "already_processed")) {
              _dequeueAdminOutbox(opId);

              const finalAura = txResult.newAura;
              const finalName = txResult.name;

              // Transition status in Grant History to deducted / Deducted (RED)
              _updateGrantHistoryEntryStatus(opId, {
                status: "deducted",
                result: "Deducted",
                targetName: finalName,
                mode: finalName,
              }).catch(() => {});

              // Non-blocking RTDB update
              if (window._presenceRdb && window._rtdbRef && window._rtdbSet) {
                window._rtdbSet(window._presenceRdb && window._rtdbRef(window._presenceRdb, "socialSummary/" + playerId + "/aura"), finalAura).catch(() => {});
              }
              if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

              return { name: finalName, newAura: finalAura, opId, success: true };
            }
          } catch (e) {
            lastError = e;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 120));
            }
          }
        }

        // Connection/network drop: queued in durable outbox for guaranteed delivery in background
        _scheduleAdminOutboxRetry();
        _updateGrantHistoryEntryStatus(opId, {
          status: "pending",
          result: "Queued",
        }).catch(() => {});
        console.warn("adminDeductAuraOne queued in outbox for guaranteed delivery:", lastError);
        return { name: recipientName, newAura: null, queued: true, opId, success: false, error: lastError ? (lastError.message || String(lastError)) : "Network failure" };
      };

      // ── AURA RESET — admin-triggered only ──────────────────────
      // Aura is never reset automatically. The admin resets it manually from the
      // dashboard (Grant Aura panel → Force Reset Aura Now), which zeroes aura for
      // every player and records when it last happened via AURA_RESET_DOC.

      // Actually zero out aura and cardsSent for every player in both Firestore and RTDB.
      async function _resetAuraForAllPlayers() {
        const snap = await getDocs(USERS_COL);
        const now = new Date().toISOString();

        // 1. Batch-update all player documents in Firestore
        let batch = writeBatch(db);
        let opCount = 0;
        const allBatchPromises = [];

        for (const docSnap of snap.docs) {
          const d = docSnap.data() || {};
          const needsReset =
            d.aura !== 0 ||
            d.cardsSent !== 0 ||
            (typeof d.pendingAuraGrant === "number" && d.pendingAuraGrant > 0) ||
            (typeof d.pendingAuraDeduct === "number" && d.pendingAuraDeduct > 0) ||
            d.pendingAuraReset !== true;

          if (needsReset) {
            batch.set(
              doc(db, "da_users", docSnap.id),
              {
                aura: 0,
                cardsSent: 0,
                pendingAuraGrant: 0,
                pendingAuraDeduct: 0,
                pendingAuraReset: true,
                updatedAt: now,
              },
              { merge: true },
            );
            opCount++;
            if (opCount >= 400) {
              allBatchPromises.push(batch.commit());
              batch = writeBatch(db);
              opCount = 0;
            }
          }
        }
        if (opCount > 0) {
          allBatchPromises.push(batch.commit());
        }
        if (allBatchPromises.length > 0) {
          await Promise.all(allBatchPromises);
        }

        // 2. Synchronize Realtime Database socialSummary so the community leaderboard & Social tab are immediately zeroed
        if (_presenceRdb && typeof rtdbUpdate === "function") {
          try {
            const rtdbUpdates = {};
            // Zero out every player document found in Firestore
            for (const docSnap of snap.docs) {
              rtdbUpdates[`${docSnap.id}/aura`] = 0;
              rtdbUpdates[`${docSnap.id}/cardsSent`] = 0;
            }

            // Also check existing RTDB socialSummary entries to ensure no orphaned player is missed
            if (typeof rtdbGet === "function") {
              try {
                const rtdbSnap = await rtdbGet(rtdbRef(_presenceRdb, "socialSummary"));
                if (rtdbSnap && rtdbSnap.exists()) {
                  const sVal = rtdbSnap.val() || {};
                  Object.keys(sVal).forEach((pid) => {
                    rtdbUpdates[`${pid}/aura`] = 0;
                    rtdbUpdates[`${pid}/cardsSent`] = 0;
                  });
                }
              } catch (rtdbFetchErr) {
                console.warn("RTDB socialSummary prefetch error:", rtdbFetchErr);
              }
            }

            if (Object.keys(rtdbUpdates).length > 0) {
              await rtdbUpdate(rtdbRef(_presenceRdb, "socialSummary"), rtdbUpdates);
            }
          } catch (rtdbErr) {
            console.warn("RTDB _resetAuraForAllPlayers update failed:", rtdbErr);
          }
        }

        return snap.size;
      }

      // ── ADMIN: Fetch info about the last weekly Aura reset (for the dashboard) ──
      window.__mod_getAuraResetInfo = true;
      window.getAuraResetInfo = async function () {
        try {
          const snap = await getDoc(AURA_RESET_DOC);
          return snap.exists() ? snap.data() : null;
        } catch (e) {
          console.error("getAuraResetInfo failed:", e);
          return null;
        }
      };

      // ── ADMIN: Reset Aura & cardsSent to 0 for every player (manual, admin-triggered only) ──
      window.__mod_adminForceAuraResetNow = true;
      window.adminForceAuraResetNow = async function () {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminForceAuraResetNow attempt.");
          return -1;
        }
        try {
          const now = new Date().toISOString();
          const count = await _resetAuraForAllPlayers();
          await setDoc(
            AURA_RESET_DOC,
            { lastResetAt: now },
            { merge: true },
          );
          if (window._invalidateAdminPlayersCache) {
            window._invalidateAdminPlayersCache();
          }
          if (typeof window !== "undefined") {
            window.aura = 0;
            window.cardsSent = 0;
          }
          if (typeof profile === "object" && profile) {
            profile.aura = 0;
            profile.cardsSent = 0;
          }
          if (typeof window.syncSocialSummaryToRtdb === "function") {
            window.syncSocialSummaryToRtdb({ aura: 0, cardsSent: 0 });
          }
          return count;
        } catch (e) {
          console.error("adminForceAuraResetNow failed:", e);
          return -1;
        }
      };

      // ── ADMIN: Mark current player as admin in their da_users document ──
      window.__mod_markCurrentPlayerAsAdmin = true;
      window.markCurrentPlayerAsAdmin = async function () {
        const pid =
          _currentPlayerId ||
          (typeof profile === "object" && profile && profile.playerId) ||
          "";
        if (!pid) return false;
        const myName = (
          (typeof profile === "object" && profile && profile.name) ||
          window._currentUser ||
          ""
        ).trim().toLowerCase();
        const AUTHORITATIVE_ADMINS = ["roomi", "naveen", "ron", "hogwarts", "arhane"];
        if (!AUTHORITATIVE_ADMINS.includes(myName)) {
          console.warn("User is not in the authoritative admin whitelist:", myName);
          return false;
        }
        try {
          await updateDoc(doc(db, "da_users", pid), {
            isAdmin: true,
            lastAdminUnlockedAt: new Date().toISOString(),
          });
          if (typeof profile === "object" && profile) profile.isAdmin = true;
          return true;
        } catch (err) {
          console.warn("Could not mark player as admin in Firestore:", err);
          return false;
        }
      };

      // ── ADMIN: Record cards sent and grant 1 Aura point per card sent ──
      window.__mod_recordAdminCardsSentAndAura = true;
      window.recordAdminCardsSentAndAura = async function (adminPid, count) {
        if (!adminPid) {
          adminPid = _currentPlayerId || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
        }
        if (!adminPid || !count || count === 0) return false;
        try {
          const userRef = doc(db, "da_users", adminPid);
          await updateDoc(userRef, {
            cardsSent: increment(count),
            aura: increment(count),
            updatedAt: new Date().toISOString(),
          });
          const isCurrent = _currentPlayerId === adminPid || window._currentPlayerId === adminPid;
          if (isCurrent) {
            window.aura = Math.max(0, (typeof window.aura === "number" ? window.aura : 0) + count);
            window.cardsSent = Math.max(0, (typeof window.cardsSent === "number" ? window.cardsSent : 0) + count);
            if (typeof profile === "object" && profile) {
              profile.aura = window.aura;
              profile.cardsSent = window.cardsSent;
            }
            if (typeof updateHUD === "function") updateHUD();
            if (typeof window.syncSocialSummaryToRtdb === "function") {
              window.syncSocialSummaryToRtdb({
                cardsSent: window.cardsSent,
                aura: window.aura,
              });
            }
          }
          if (_presenceRdb && typeof rtdbUpdate === "function") {
            const rUpdates = {};
            if (isCurrent) {
              rUpdates[`socialSummary/${adminPid}/cardsSent`] = window.cardsSent;
              rUpdates[`socialSummary/${adminPid}/aura`] = window.aura;
            }
            if (Object.keys(rUpdates).length > 0) {
              rtdbUpdate(rtdbRef(_presenceRdb), rUpdates).catch(() => {});
            }
          }
          if (Array.isArray(window._cachedCommunityMembers)) {
            const m = window._cachedCommunityMembers.find((p) => (p.playerId || p.id) === adminPid);
            if (m) {
              m.cardsSent = Math.max(0, (typeof m.cardsSent === "number" ? m.cardsSent : 0) + count);
              m.aura = Math.max(0, (typeof m.aura === "number" ? m.aura : 0) + count);
            }
          }
          return true;
        } catch (err) {
          console.warn("Failed to record admin cards sent / aura:", err);
          return false;
        }
      };

      // ── ADMIN: Deduct coins from ONE specific player ───────────
      window.__mod_adminDeductCoinsOne = true;
      window.adminDeductCoinsOne = async function (playerId, amount, note, options) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductCoinsOne attempt.");
          return false;
        }
        if (!playerId || !amount || amount <= 0) return false;
        const admin = _getAdminAttribution();
        const opId = (options && options.opId) || ("op_deduct_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
        const isRetry = !!(options && options.isRetry);
        const skipHistory = !!(options && options.skipHistory);

        // Resolve recipient name immediately from memory cache if available
        let recipientName = _lookupPlayerName(playerId) || playerId;

        // 1. Immediately record in Grant History with status "pending" (YELLOW)
        if (!isRetry) {
          _recordGrantHistoryEntry({
            id: opId,
            type: "coins",
            direction: "deduct",
            targetType: "one",
            targetPlayerId: playerId,
            targetName: recipientName,
            mode: recipientName,
            amount: amount,
            status: "pending",
            result: "Pending",
            note: note || "Balance adjustment",
            adminName: admin.name,
            adminPid: admin.pid,
            timestamp: new Date().toISOString(),
            ts: Date.now(),
          }).catch((err) => console.warn("Background deduct history error:", err));
        }

        // Persist in durable outbox for guaranteed deduction if network contentious
        if (!isRetry) {
          _enqueueAdminOutbox({
            opId,
            type: "coins",
            action: "deduct",
            playerId,
            amount,
            note: note || "Balance adjustment",
            adminName: admin.name,
            adminPid: admin.pid,
            createdAt: Date.now(),
            attempts: 0,
          });
        }

        const ref = doc(db, "da_users", playerId);
        const receiptRef = doc(db, "da_users", playerId, "singleGrantReceipts", opId);
        let lastError = null;

        // Up to 2 immediate attempts with jittered retry
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const txResult = await runTransaction(db, async (tx) => {
              const [snap, receiptSnap] = await Promise.all([
                tx.get(ref),
                tx.get(receiptRef),
              ]);

              if (!snap.exists()) return null; // player not found
              const d = snap.data();
              if (d.frozen === true) {
                return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
              }
              const cur = typeof d.coins === "number" ? d.coins : 0;
              const name = d.profile?.name || d.username || playerId;
              recipientName = name;

              // Idempotency check: if this operation ID was already committed, abort safely without re-deducting!
              if (receiptSnap.exists()) {
                return { status: "already_processed", newCoins: cur, name, actualDeducted: 0 };
              }

              const newCoins = Math.max(0, cur - amount);
              const actualDeducted = cur - newCoins; // can't go below 0
              const curTxSeq = typeof d.txSeq === "number" && Number.isInteger(d.txSeq) ? d.txSeq : 0;
              const now = new Date().toISOString();

              if (actualDeducted > 0) {
                const curPendingGrant = typeof d.pendingGrant === "number" ? d.pendingGrant : 0;
                const curPendingDeduct = typeof d.pendingDeduct === "number" ? d.pendingDeduct : 0;

                let newPendingGrant = curPendingGrant;
                let newPendingDeduct = curPendingDeduct;

                if (curPendingGrant > 0) {
                  const offset = Math.min(curPendingGrant, actualDeducted);
                  newPendingGrant = curPendingGrant - offset;
                  const remaining = actualDeducted - offset;
                  newPendingDeduct = curPendingDeduct + remaining;
                } else {
                  newPendingDeduct = curPendingDeduct + actualDeducted;
                }

                let deductSender = admin.name;
                let deductSenderPid = admin.pid;
                if (curPendingDeduct > 0 && d.pendingDeductSender && d.pendingDeductSender !== admin.name) {
                  deductSender = "DA Leadership";
                  deductSenderPid = "admin";
                }

                const newHistory = _buildCoinHistoryEntry(
                  d.coinHistory,
                  -actualDeducted,
                  note ? `⚠️ Deducted by ${admin.name} — ${note}` : `⚠️ Deducted by ${admin.name}`,
                  newCoins,
                );

                tx.update(ref, {
                  coins: newCoins,
                  coinHistory: newHistory,
                  pendingGrant: newPendingGrant,
                  pendingGrantSender: newPendingGrant > 0 ? (d.pendingGrantSender || "") : "",
                  pendingGrantSenderPid: newPendingGrant > 0 ? (d.pendingGrantSenderPid || "") : "",
                  pendingGrantNote: newPendingGrant > 0 ? (d.pendingGrantNote || "") : "",
                  pendingDeduct: newPendingDeduct,
                  pendingDeductSender: newPendingDeduct > 0 ? deductSender : "",
                  pendingDeductSenderPid: newPendingDeduct > 0 ? deductSenderPid : "",
                  updatedAt: now,
                  txSeq: curTxSeq + 1,
                });
              }

              tx.set(receiptRef, {
                opId: opId,
                type: "deduct",
                amount: actualDeducted,
                deductedAt: now,
                adminName: admin.name,
                adminPid: admin.pid,
              });

              return { status: "deducted", newCoins, name, actualDeducted };
            });

            if (txResult === null) {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Not found",
              }).catch(() => {});
              return null; // Player not found (intentional, don't retry)
            }

            if (txResult && txResult.status === "frozen") {
              _dequeueAdminOutbox(opId);
              _updateGrantHistoryEntryStatus(opId, {
                status: "failed",
                result: "Account is frozen",
              }).catch(() => {});
              return txResult;
            }

            if (txResult && (txResult.status === "deducted" || txResult.status === "already_processed")) {
              _dequeueAdminOutbox(opId);

              const finalCoins = txResult.newCoins;
              const finalName = txResult.name;

              // Transition status in Grant History to deducted / Deducted (RED)
              _updateGrantHistoryEntryStatus(opId, {
                status: "deducted",
                result: "Deducted",
                targetName: finalName,
                mode: finalName,
              }).catch(() => {});

              // Non-blocking RTDB update
              if (window._presenceRdb && window._rtdbRef && window._rtdbSet) {
                window._rtdbSet(window._rtdbRef(window._presenceRdb, "socialSummary/" + playerId + "/coins"), finalCoins).catch(() => {});
              }
              if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();

              return { name: finalName, newCoins: finalCoins, actualDeducted: txResult.actualDeducted, opId, success: true };
            }
          } catch (e) {
            lastError = e;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 120));
            }
          }
        }

        // Connection/network drop: queued in durable outbox for guaranteed delivery in background
        _scheduleAdminOutboxRetry();
        _updateGrantHistoryEntryStatus(opId, {
          status: "pending",
          result: "Queued",
        }).catch(() => {});
        console.warn("adminDeductCoinsOne queued in outbox for guaranteed delivery:", lastError);
        return { name: recipientName, newCoins: null, queued: true, opId, success: false, error: lastError ? (lastError.message || String(lastError)) : "Network failure" };
      };

      // ── ADMIN: Grant a card directly to ONE specific player ─────────
      window.__mod_adminGrantCardOne = true;
      window.adminGrantCardOne = async function (
        playerId,
        setIdx,
        cardIdx,
        isDupe,
        note,
      ) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminGrantCardOne attempt.");
          return false;
        }
        if (!playerId || setIdx === undefined || cardIdx === undefined) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return null; // player not found
            const d = snap.data();
            if (d.frozen === true) {
              return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
            }
            const owned =
              d.ownedCards && typeof d.ownedCards === "object"
                ? { ...d.ownedCards }
                : {};
            const key = setIdx + "-" + cardIdx;
            const existing = owned[key];
            const curCardsWon = typeof d.cardsWon === "number" ? d.cardsWon : 0;

            const wasOwned = !!(existing && existing.owned);
            if (wasOwned) {
              owned[key] = {
                ...existing,
                owned: true,
                dupes: (existing.dupes || 0) + 1,
                isNew: true,
              };
            } else {
              owned[key] = {
                owned: true,
                dupes: isDupe ? 1 : 0,
                isNew: true,
              };
            }

            const now = new Date().toISOString();
            const admin = _getAdminAttribution();
            const cardInfo = {
              setIdx: Number(setIdx),
              cardIdx: Number(cardIdx),
              isDupe: wasOwned || !!isDupe,
              note: note || "",
              fromAdmin: true,
              token: now,
              senderName: admin.name || "Admin",
              senderPid: admin.pid || "",
            };

            tx.update(ref, {
              ownedCards: owned,
              cardsWon: curCardsWon + 1,
              pendingCardGrant: cardInfo,
              updatedAt: now,
              txSeq: (typeof d.txSeq === "number" ? d.txSeq : 0) + 1,
            });

            // If the admin is granting to THEMSELVES, sync local state immediately:
            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            if (playerId === myPid) {
              if (window._setOwnedCards) window._setOwnedCards(owned);
              if (window._setCardsWon) window._setCardsWon(curCardsWon + 1);
              if (typeof window.updateHUD === "function") window.updateHUD();
              if (typeof window.updateCollStats === "function") window.updateCollStats();
              if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              if (typeof window.saveProgress === "function") window.saveProgress();
            }

            const cardRecipientName = d.profile?.name || d.username || playerId;
            _recordGrantHistoryEntry({
              type: "card",
              direction: "grant",
              targetType: "one",
              targetPlayerId: playerId,
              targetName: cardRecipientName,
              mode: cardRecipientName,
              amount: 1,
              result: "Card Sent",
              note: note || "",
              adminName: admin.name,
              adminPid: admin.pid,
            }).catch(() => {});

            return {
              name: cardRecipientName,
              wasOwned,
              cardInfo,
            };
          });
        } catch (e) {
          console.error("adminGrantCardOne failed:", e);
          return false;
        }
      };

      // ── ADMIN: Deduct one copy of a card from a player's collection ──
      // Called when a card request is marked "done" (fulfilled). If the player
      // has duplicate copies of the card, one duplicate is removed and they keep
      // the base card. If they have only 1 card, the card is removed from their
      // collection.
      window.__mod_adminDeductCardFromPlayer = true;
      window.adminDeductCardFromPlayer = async function (
        playerId,
        setIdx,
        cardIdx,
      ) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductCardFromPlayer attempt.");
          return false;
        }
        if (!playerId || setIdx === undefined || cardIdx === undefined) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return null; // player not found
            const d = snap.data();
            if (d.frozen === true) {
              return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
            }
            const owned =
              d.ownedCards && typeof d.ownedCards === "object"
                ? { ...d.ownedCards }
                : {};
            const key = setIdx + "-" + cardIdx;
            const entry = owned[key];
            const name = d.profile?.name || d.username || playerId;

            if (!entry || !entry.owned) {
              return { name, result: "not-owned" };
            }

            let result;
            if (entry.dupes && entry.dupes > 0) {
              owned[key] = { ...entry, dupes: entry.dupes - 1 };
              result = "dupe-removed";
            } else {
              delete owned[key];
              result = "card-removed";
            }

            const now = new Date().toISOString();
            tx.update(ref, {
              ownedCards: owned,
              pendingCardRemoval: { setIdx: Number(setIdx), cardIdx: Number(cardIdx), result, token: now },
              updatedAt: now,
              txSeq: (typeof d.txSeq === "number" ? d.txSeq : 0) + 1,
            });

            return { name, result, owned };
          });

          // Post-transaction local sync if admin is fulfilling their OWN request on their own device:
          if (txRes && (txRes.result === "dupe-removed" || txRes.result === "card-removed")) {
            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            if (playerId === myPid && txRes.owned) {
              if (window._setOwnedCards) window._setOwnedCards(txRes.owned);
              if (typeof _collFragmentCache === "object" && _collFragmentCache) {
                delete _collFragmentCache[setIdx];
              }
              if (typeof window.updateHUD === "function") window.updateHUD();
              if (typeof window.updateCollStats === "function") window.updateCollStats();
              if (typeof window.renderCollTabs === "function") window.renderCollTabs();
              if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              if (typeof window.saveProgress === "function") window.saveProgress(true);
            }
          }

          return txRes;
        } catch (e) {
          console.error("adminDeductCardFromPlayer failed:", e);
          if (e && (e.code === "resource-exhausted" || (e.message && e.message.includes("Quota exceeded")))) {
            return { quotaExceeded: true };
          }
          return false;
        }
      };

      // ── ADMIN: Deduct multiple cards in batch from one player (for Mark All Done) ──
      window.__mod_adminDeductCardsBatchFromPlayer = true;
      window.adminDeductCardsBatchFromPlayer = async function (playerId, cardList) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductCardsBatchFromPlayer attempt.");
          return false;
        }
        if (!playerId || !Array.isArray(cardList) || cardList.length === 0) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return null;
            const d = snap.data();
            if (d.frozen === true) {
              return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
            }
            const owned =
              d.ownedCards && typeof d.ownedCards === "object"
                ? { ...d.ownedCards }
                : {};
            const name = d.profile?.name || d.username || playerId;
            let deductedCount = 0;
            let lastResult = "not-owned";
            let lastSet = 0;
            let lastCard = 0;

            cardList.forEach(({ setIdx, cardIdx }) => {
              const key = setIdx + "-" + cardIdx;
              const entry = owned[key];
              if (entry && entry.owned) {
                if (entry.dupes && entry.dupes > 0) {
                  owned[key] = { ...entry, dupes: entry.dupes - 1 };
                  lastResult = "dupe-removed";
                } else {
                  delete owned[key];
                  lastResult = "card-removed";
                }
                deductedCount++;
                lastSet = setIdx;
                lastCard = cardIdx;
              }
            });

            const now = new Date().toISOString();
            if (deductedCount > 0) {
              const updatePayload = {
                ownedCards: owned,
                pendingCardRemoval: {
                  setIdx: Number(lastSet),
                  cardIdx: Number(lastCard),
                  result: lastResult,
                  count: deductedCount,
                  token: now,
                },
                updatedAt: now,
                txSeq: (typeof d.txSeq === "number" ? d.txSeq : 0) + 1,
              };
              tx.update(ref, updatePayload);
            }

            return { name, deductedCount, owned };
          });

          // Post-transaction local sync if admin is fulfilling their OWN request on their own device:
          if (txRes && txRes.deductedCount > 0) {
            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            if (playerId === myPid && txRes.owned) {
              if (window._setOwnedCards) window._setOwnedCards(txRes.owned);
              if (typeof _collFragmentCache === "object" && _collFragmentCache) {
                cardList.forEach(({ setIdx }) => delete _collFragmentCache[setIdx]);
              }
              if (typeof window.updateHUD === "function") window.updateHUD();
              if (typeof window.updateCollStats === "function") window.updateCollStats();
              if (typeof window.renderCollTabs === "function") window.renderCollTabs();
              if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              if (typeof window.saveProgress === "function") window.saveProgress(true);
            }
          }

          return txRes;
        } catch (e) {
          console.error("adminDeductCardsBatchFromPlayer failed:", e);
          if (e && (e.code === "resource-exhausted" || (e.message && e.message.includes("Quota exceeded")))) {
            return { quotaExceeded: true };
          }
          return false;
        }
      };

      // ── ADMIN: Restore a card back to a player if request is reverted to Pending ──
      window.__mod_adminRestoreCardToPlayer = true;
      window.adminRestoreCardToPlayer = async function (playerId, setIdx, cardIdx) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminRestoreCardToPlayer attempt.");
          return false;
        }
        if (!playerId || setIdx === undefined || cardIdx === undefined) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return null;
            const d = snap.data();
            if (d.frozen === true) {
              return { status: "frozen", error: "Account is frozen", name: d.profile?.name || d.username || playerId };
            }
            const owned =
              d.ownedCards && typeof d.ownedCards === "object"
                ? { ...d.ownedCards }
                : {};
            const key = setIdx + "-" + cardIdx;
            const entry = owned[key];
            const name = d.profile?.name || d.username || playerId;

            if (entry && entry.owned) {
              owned[key] = { ...entry, dupes: (entry.dupes || 0) + 1 };
            } else {
              owned[key] = { owned: true, dupes: 0, isNew: true };
            }

            const now = new Date().toISOString();
            tx.update(ref, {
              ownedCards: owned,
              updatedAt: now,
              txSeq: (typeof d.txSeq === "number" ? d.txSeq : 0) + 1,
            });

            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            if (playerId === myPid) {
              if (window._setOwnedCards) window._setOwnedCards(owned);
              if (typeof window.updateHUD === "function") window.updateHUD();
              if (typeof window.updateCollStats === "function") window.updateCollStats();
              if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              if (typeof window.saveProgress === "function") window.saveProgress();
            }
            return { name, restored: true };
          });
        } catch (e) {
          console.error("adminRestoreCardToPlayer failed:", e);
          if (e && (e.code === "resource-exhausted" || (e.message && e.message.includes("Quota exceeded")))) {
            return { quotaExceeded: true };
          }
          return false;
        }
      };

      // ── ADMIN: Decrement a player's booked shop-item count by 1 (e.g. after
      //    delivering one Bloom and Buzz slot in the real Township game) ────
      window.__mod_adminDeductShopItemFromPlayer = true;
      window.adminDeductShopItemFromPlayer = async function (playerId, itemId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeductShopItemFromPlayer attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          const snap = await getDoc(ref);
          if (!snap.exists()) return null; // player not found
          const d = snap.data();
          if (d.frozen === true) {
            return { name: d.profile?.name || d.username || playerId, result: "frozen", error: "Account is frozen" };
          }
          const shopItems =
            d.ownedShopItems && typeof d.ownedShopItems === "object"
              ? { ...d.ownedShopItems }
              : {};
          const entry = shopItems[itemId];
          const name = d.profile?.name || d.username || playerId;

          if (!entry || !entry.count || entry.count <= 0) {
            return { name, result: "not-owned" };
          }

          const newCount = entry.count - 1;
          if (newCount <= 0) {
            // Keep purchaseCount/cycleStartAt (pricing-tier tracking) even once
            // all booked slots are delivered — the price only resets after the
            // SHOP_CYCLE_DAYS window, not when slots are marked "Given".
            const { count, owned, ...rest } = entry;
            if (Object.keys(rest).length > 0) {
              shopItems[itemId] = { ...rest, count: 0, owned: false };
            } else {
              delete shopItems[itemId];
            }
          } else {
            shopItems[itemId] = { ...entry, count: newCount, owned: true };
          }

          const now = new Date().toISOString();
          await updateDoc(ref, {
            ownedShopItems: shopItems,
            pendingShopItemRemoval: { itemId, newCount, token: now },
            updatedAt: now,
            txSeq: increment(1),
          });
          return { name, result: "removed", newCount };
        } catch (e) {
          console.error("adminDeductShopItemFromPlayer failed:", e);
          return false;
        }
      };

      // ── ADMIN: Fully clear one shop item's booking for a player — for fixing a
      //    stuck/orphaned "Booked" badge that has no matching Shop Request row
      //    (e.g. left over from a shared-doc write race before the save fix
      //    above). Wipes count, owned, AND the pricing tier for that item. Does
      //    NOT refund coins — the admin should grant coins separately if the
      //    player actually paid for the now-cleared booking.
      window.__mod_adminClearShopItemForPlayer = true;
      window.adminClearShopItemForPlayer = async function (playerId, itemId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminClearShopItemForPlayer attempt.");
          return false;
        }
        if (!playerId || !itemId) return false;
        try {
          const ref = doc(db, "da_users", playerId);
          const snap = await getDoc(ref);
          if (!snap.exists()) return null; // player not found
          const d = snap.data();
          if (d.frozen === true) {
            return { name: d.profile?.name || d.username || playerId, result: "frozen", error: "Account is frozen" };
          }
          const shopItems =
            d.ownedShopItems && typeof d.ownedShopItems === "object"
              ? { ...d.ownedShopItems }
              : {};
          if (!shopItems[itemId]) {
            return true;
          }
          delete shopItems[itemId];
          await updateDoc(ref, {
            ownedShopItems: shopItems,
            updatedAt: new Date().toISOString(),
            txSeq: increment(1),
          });
          return true;
        } catch (e) {
          console.error("adminClearShopItemForPlayer failed:", e);
          return false;
        }
      };

      // ── ADMIN: Reset shop pricing back to the base tier for ALL players ──
      // Only touches purchaseCount/cycleStartAt (the pricing-tier tracking) —
      // never touches `count` (booked-but-not-yet-delivered slots) or `owned`,
      // so in-flight bookings are unaffected. Also drops a `pendingShopPriceReset`
      // token on each doc so any online players get their local price display
      // refreshed immediately via the live user-doc listener.
      window.__mod_adminResetShopPricingAll = true;
      window.adminResetShopPricingAll = async function () {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminResetShopPricingAll attempt.");
          return -1;
        }
        try {
          const snap = await getDocs(USERS_COL);
          let count = 0;
          const now = new Date().toISOString();
          for (const docSnap of snap.docs) {
            const d = docSnap.data();
            const shopItems =
              d.ownedShopItems && typeof d.ownedShopItems === "object"
                ? d.ownedShopItems
                : {};
            const itemIds = Object.keys(shopItems);
            if (itemIds.length === 0) continue;

            let changed = false;
            const resetItems = {};
            itemIds.forEach((itemId) => {
              const entry = shopItems[itemId] || {};
              if (
                (entry.purchaseCount && entry.purchaseCount > 0) ||
                entry.cycleStartAt
              )
                changed = true;
              resetItems[itemId] = {
                ...entry,
                purchaseCount: 0,
                cycleStartAt: null,
              };
            });
            if (!changed) continue;

            await updateDoc(doc(db, "da_users", docSnap.id), {
              ownedShopItems: resetItems,
              pendingShopPriceReset: { token: now },
              updatedAt: now,
              txSeq: increment(1),
            });
            count++;
          }
          return count;
        } catch (e) {
          console.error("adminResetShopPricingAll failed:", e);
          return -1;
        }
      };

      // ── ADMIN / SOCIAL: Load players for Player Stats and Social directory ──
      // If called by an unauthorized client (e.g. social members list), sensitive
      // credentials (pinHash and pin) are stripped so players cannot inspect or
      // crack each others' authentication keys.
      let _adminPlayersCache = null;
      let _adminPlayersCacheTs = 0;
      const ADMIN_PLAYERS_CACHE_TTL = 60 * 1000; // 60s cache to prevent rapid multi-tab reads
      window._invalidateAdminPlayersCache = function () {
        _adminPlayersCache = null;
        _adminPlayersCacheTs = 0;
      };

      window.__mod_adminLoadAllPlayers = true;
      window.adminLoadAllPlayers = async function (force = false) {
        try {
          const now = Date.now();
          if (!force && _adminPlayersCache && now - _adminPlayersCacheTs < ADMIN_PLAYERS_CACHE_TTL) {
            return _adminPlayersCache;
          }
          const snap = await getDocs(USERS_COL);
          const isAdmin = _isAdminAuthorized();
          const list = snap.docs
            .map((d) => {
              const data = d.data();
              if (!isAdmin) {
                delete data.pinHash;
                delete data.pin;
              }
              return { id: d.id, ...data };
            })
            .filter((p) => p && !p.disabled && !p.deletedAt);
          if (!window._playerPhotoMap) window._playerPhotoMap = {};
          list.forEach((p) => {
            if (p.profile && p.profile.photoURL) {
              window._playerPhotoMap[p.id] = p.profile.photoURL;
            }
          });
          _adminPlayersCache = list;
          _adminPlayersCacheTs = now;
          return list;
        } catch (e) {
          console.error("adminLoadAllPlayers failed:", e);
          return _adminPlayersCache || [];
        }
      };

      window.loadPlayerPhotos = async function () {
        // Redundant read prevention: avatars are already mapped on-demand via
        // adminLoadAllPlayers() or card requests. Neutralized to preserve daily read quota.
        return;
      };

      // ── ADMIN: Reset a specific player's full progress ─────────
      window.__mod_adminResetPlayerProgress = true;
      window.adminResetPlayerProgress = async function (playerId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminResetPlayerProgress attempt.");
          return false;
        }
        try {
          await updateDoc(doc(db, "da_users", playerId), {
            coins: 0,
            cardsWon: 0,
            ownedCards: {},
            ownedShopItems: {},
            pendingReset: true,
            updatedAt: new Date().toISOString(),
            txSeq: increment(1),
          });
          if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();
          return true;
        } catch (e) {
          console.error("adminResetPlayerProgress failed:", e);
          return false;
        }
      };

      // ── ADMIN: Set (or clear) a player's profile photo ─────────
      window.__mod_adminSetPlayerPhoto = true;
      window.adminSetPlayerPhoto = async function (playerId, photoURL) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminSetPlayerPhoto attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          await updateDoc(doc(db, "da_users", playerId), {
            "profile.photoURL": photoURL || "",
            updatedAt: new Date().toISOString(),
          });
          return true;
        } catch (e) {
          console.error("adminSetPlayerPhoto failed:", e);
          return false;
        }
      };

      // ── ADMIN: Set (or clear) a player's designation ────────────
      window.__mod_adminSetPlayerDesignation = true;
      window.adminSetPlayerDesignation = async function (playerId, designation) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminSetPlayerDesignation attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          let desigPayload = null;
          if (designation && designation !== "none" && designation !== "clear") {
            if (typeof designation === "string") {
              const trimmed = designation.trim();
              if (trimmed && trimmed.toLowerCase() !== "none" && trimmed.toLowerCase() !== "clear") {
                desigPayload = { title: trimmed, icon: "🏷️", type: "jaadu" };
              }
            } else if (typeof designation === "object") {
              const title = String(designation.title || "").trim();
              if (title && title.toLowerCase() !== "none" && title.toLowerCase() !== "clear") {
                desigPayload = {
                  title: title,
                  icon: String(designation.icon || "🏷️").trim() || "🏷️",
                  type: String(designation.type || "jaadu").trim() || "jaadu"
                };
              }
            }
          }

          // If cleared, store "none" so getPlayerDesignation knows it was explicitly cleared
          const desigToStore = desigPayload || "none";

          await updateDoc(doc(db, "da_users", playerId), {
            designation: desigToStore,
            "profile.designation": desigToStore,
            updatedAt: new Date().toISOString(),
          });

          // Sync to RTDB socialSummary for instant 0-read updates on online clients
          if (_presenceRdb && rtdbRef && rtdbUpdate) {
            try {
              await rtdbUpdate(rtdbRef(_presenceRdb, "socialSummary/" + playerId), {
                designation: desigToStore,
              });
            } catch (rtdbErr) {
              console.warn("RTDB designation sync warning:", rtdbErr);
            }
          }

          // Update in-memory collections so UI updates immediately without refetch
          if (Array.isArray(window._cachedCommunityMembers)) {
            const m = window._cachedCommunityMembers.find((p) => (p.playerId || p.id) === playerId);
            if (m) m.designation = desigToStore;
          }
          if (typeof _socialMembers !== "undefined" && Array.isArray(_socialMembers)) {
            const m = _socialMembers.find((p) => (p.playerId || p.id) === playerId);
            if (m) m.designation = desigToStore;
          }
          if (window._adminPlayersCache && Array.isArray(window._adminPlayersCache)) {
            const m = window._adminPlayersCache.find((p) => (p.playerId || p.id) === playerId);
            if (m) {
              m.designation = desigToStore;
              if (m.profile) m.profile.designation = desigToStore;
            }
          }
          if (typeof _psPlayers !== "undefined" && Array.isArray(_psPlayers)) {
            const m = _psPlayers.find((p) => (p.playerId || p.id) === playerId);
            if (m) {
              m.designation = desigToStore;
              if (m.profile) m.profile.designation = desigToStore;
            }
          }
          if (playerId === window._currentPlayerId && typeof profile === "object" && profile) {
            profile.designation = desigToStore;
          }

          // Re-render Social Leaderboard & Player Stats if active
          if (typeof socialRenderList === "function") socialRenderList();
          if (typeof psRenderList === "function") psRenderList();

          return true;
        } catch (e) {
          console.error("adminSetPlayerDesignation failed:", e);
          return false;
        }
      };

      // ── ADMIN: Upload a device photo to Firebase Storage ────────
      window.__mod_adminUploadPlayerPhoto = true;
      window.adminUploadPlayerPhoto = async function (playerId, dataURL) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminUploadPlayerPhoto attempt.");
          return null;
        }
        if (!playerId || !dataURL) return null;
        try {
          const fileRef = storageRef(storage, `playerPhotos/${playerId}.jpg`);
          await uploadString(fileRef, dataURL, "data_url");
          const url = await getDownloadURL(fileRef);
          await updateDoc(doc(db, "da_users", playerId), {
            "profile.photoURL": url,
            updatedAt: new Date().toISOString(),
          });
          return url;
        } catch (e) {
          console.error("adminUploadPlayerPhoto failed:", e);
          return null;
        }
      };

      // ── ADMIN: Remove a player's photo ──────────────────────────
      window.__mod_adminRemovePlayerPhoto = true;
      window.adminRemovePlayerPhoto = async function (playerId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminRemovePlayerPhoto attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          try {
            await deleteObject(
              storageRef(storage, `playerPhotos/${playerId}.jpg`),
            );
          } catch (e) {
            /* no Storage file for this player — fine */
          }
          await updateDoc(doc(db, "da_users", playerId), {
            "profile.photoURL": "",
            updatedAt: new Date().toISOString(),
          });
          return true;
        } catch (e) {
          console.error("adminRemovePlayerPhoto failed:", e);
          return false;
        }
      };

      // ── PLAYER: Upload own profile photo to Firebase Storage ─────
      window.__mod_uploadMyProfilePhoto = true;
      window.uploadMyProfilePhoto = async function (dataURL) {
        const pid = _currentPlayerId || window._currentPlayerId;
        if (!pid || !dataURL) return null;
        
        let storageUrl = null;
        try {
          const fileRef = storageRef(storage, `playerPhotos/${pid}.jpg`);
          const uploadPromise = (async () => {
            await uploadString(fileRef, dataURL, "data_url");
            return await getDownloadURL(fileRef);
          })();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Storage timeout")), 2500),
          );
          storageUrl = await Promise.race([uploadPromise, timeoutPromise]);
        } catch (storageErr) {
          console.warn("Storage upload skipped or timed out, using direct profile storage fallback:", storageErr.message || storageErr);
        }

        let finalUrl = storageUrl;
        if (!finalUrl && dataURL) {
          // If storage upload was skipped or failed, ensure the fallback dataURL is compressed to avatar size (< 25KB)
          // to prevent Firestore 1MB document limit exhaustion and excessive read bandwidth (FINDING-DATA-02).
          try {
            if (typeof document !== "undefined") {
              const img = new Image();
              const loadPromise = new Promise((res, rej) => {
                img.onload = () => res();
                img.onerror = () => rej(new Error("Image decode failed"));
                img.src = dataURL;
              });
              await loadPromise;
              const canvas = document.createElement("canvas");
              const size = 120; // 120x120 avatar thumbnail
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext("2d");
              const minSide = Math.min(img.width, img.height);
              const sx = (img.width - minSide) / 2;
              const sy = (img.height - minSide) / 2;
              ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
              const compressed = canvas.toDataURL("image/jpeg", 0.72);
              if (compressed && compressed.length < 25000) {
                finalUrl = compressed;
              }
            }
          } catch (compErr) {
            console.warn("Avatar compression failed:", compErr);
          }
        }

        if (!finalUrl) {
          console.warn("uploadMyProfilePhoto: photo could not be safely stored or compressed under 25KB.");
          return null;
        }

        try {
          await updateDoc(doc(db, "da_users", pid), {
            "profile.photoURL": finalUrl,
            updatedAt: new Date().toISOString(),
          });
          if (window._getProfile) {
            const p = window._getProfile();
            p.photoURL = finalUrl;
            if (window._setProfile) window._setProfile(p);
          }
          return finalUrl;
        } catch (e2) {
          console.error("uploadMyProfilePhoto fallback failed:", e2);
          return null;
        }
      };

      // ── PLAYER: Remove own profile photo ────────────────────────
      window.__mod_removeMyProfilePhoto = true;
      window.removeMyProfilePhoto = async function () {
        const pid = _currentPlayerId || window._currentPlayerId;
        if (!pid) return false;
        try {
          try {
            await deleteObject(storageRef(storage, `playerPhotos/${pid}.jpg`));
          } catch (e) {}
          await updateDoc(doc(db, "da_users", pid), {
            "profile.photoURL": "",
            updatedAt: new Date().toISOString(),
          });
          if (window._getProfile) {
            const p = window._getProfile();
            p.photoURL = "";
            if (window._setProfile) window._setProfile(p);
          }
          return true;
        } catch (e) {
          console.error("removeMyProfilePhoto failed:", e);
          return false;
        }
      };

      // ── ADMIN: Freeze / Unfreeze a player's account ───────────
      window.__mod_adminFreezePlayer = true;
      window.adminFreezePlayer = async function (playerId, options) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminFreezePlayer attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          const isFreeze = !!(options && options.frozen);
          const reason = (options && (options.reason || options.frozenReason)) || "";
          const adminAttr = _getAdminAttribution();
          const adminName = (options && options.adminName) || adminAttr.name || "Admin";
          const adminPhoto = (options && typeof options.adminPhoto === "string")
            ? options.adminPhoto
            : (adminAttr.photoURL || (typeof profile === "object" && profile && profile.photoURL) || "");
          const adminAvatar = (options && options.adminAvatar)
            || adminAttr.avatar
            || ((typeof profile === "object" && profile && profile.avatar) || "🧙");
          const adminPid = (options && options.adminPid) || adminAttr.pid || "";
          const now = new Date().toISOString();

          const userRef = doc(db, "da_users", playerId);
          const updatePayload = {
            playerId: playerId,
            frozen: isFreeze,
            updatedAt: now,
          };
          if (isFreeze) {
            updatePayload.frozenBy = adminName;
            updatePayload.frozenByPhoto = adminPhoto;
            updatePayload.frozenByAvatar = adminAvatar;
            updatePayload.frozenByPid = adminPid;
            updatePayload.frozenAt = now;
            updatePayload.frozenReason = reason || "Account under administrative review";
          } else {
            updatePayload.unfrozenBy = adminName;
            updatePayload.unfrozenAt = now;
            updatePayload.frozenBy = "";
            updatePayload.frozenByPhoto = "";
            updatePayload.frozenByAvatar = "";
            updatePayload.frozenReason = "";
          }

          await updateDoc(userRef, updatePayload);

          // Update memory cache if present
          if (_adminPlayersCache && Array.isArray(_adminPlayersCache)) {
            const p = _adminPlayersCache.find((x) => x && (x.id === playerId || x.playerId === playerId));
            if (p) {
              p.frozen = isFreeze;
              if (isFreeze) {
                p.frozenBy = adminName;
                p.frozenByPhoto = adminPhoto;
                p.frozenByAvatar = adminAvatar;
                p.frozenByPid = adminPid;
                p.frozenAt = now;
                p.frozenReason = reason || "Account under administrative review";
              } else {
                p.frozenBy = "";
                p.frozenByPhoto = "";
                p.frozenByAvatar = "";
                p.frozenReason = "";
                p.unfrozenBy = adminName;
                p.unfrozenAt = now;
              }
            }
          }

          return {
            success: true,
            frozen: isFreeze,
            adminName,
            adminPhoto,
            adminAvatar,
            adminPid,
            reason: isFreeze ? (reason || "Account under administrative review") : "",
            timestamp: now,
          };
        } catch (e) {
          console.error("adminFreezePlayer failed:", e);
          return false;
        }
      };

      // ── CHECK LIVE FREEZE STATUS (for player manual refresh button) ────
      window.checkLiveFreezeStatus = async function () {
        const pid = window._currentPlayerId || _currentPlayerId;
        if (!pid) return { frozen: false };
        try {
          const snap = await getDoc(doc(db, "da_users", pid));
          if (snap.exists()) {
            const d = snap.data();
            if (d.frozen === true) {
              return {
                frozen: true,
                frozenBy: d.frozenBy || "Admin",
                frozenByPhoto: d.frozenByPhoto || "",
                frozenByAvatar: d.frozenByAvatar || "🧙",
                frozenByPid: d.frozenByPid || "",
                frozenAt: d.frozenAt || "",
                frozenReason: d.frozenReason || d.reason || "Account under administrative review",
              };
            }
          }
          return { frozen: false };
        } catch (e) {
          console.warn("checkLiveFreezeStatus error:", e);
          return { frozen: window._accountFrozen || false };
        }
      };

      // ── ADMIN: Remove a player's account (Firestore + Realtime Database) ───────────
      window.__mod_adminDeletePlayer = true;
      window.adminDeletePlayer = async function (playerId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized adminDeletePlayer attempt.");
          return false;
        }
        if (!playerId) return false;
        try {
          // 1. Soft-disable the user document in Firestore da_users
          const userRef = doc(db, "da_users", playerId);
          try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
              const d = snap.data();
              const curCoins = typeof d.coins === "number" ? d.coins : 0;
              const now = new Date().toISOString();
              const updatePayload = {
                playerId: playerId,
                disabled: true,
                deletedAt: now,
                username_lower: "__disabled_" + playerId.toLowerCase(),
                updatedAt: now,
              };
              if (curCoins > 0) {
                updatePayload.coins = 0;
                updatePayload.txSeq = (typeof d.txSeq === "number" ? d.txSeq : 0) + 1;
              }
              await updateDoc(userRef, updatePayload);
            }
          } catch (docErr) {
            console.warn("Soft-disable da_users doc warning:", docErr);
          }

          // 2. Remove player from Realtime Database socialSummary and presence
          if (_presenceRdb && typeof rtdbRemove === "function" && typeof rtdbRef === "function") {
            try {
              await rtdbRemove(rtdbRef(_presenceRdb, "socialSummary/" + playerId));
            } catch (rtdbErr) {
              console.warn("RTDB socialSummary remove warning:", rtdbErr);
            }
            try {
              await rtdbRemove(rtdbRef(_presenceRdb, "presence/" + playerId));
            } catch (rtdbErr2) {
              console.warn("RTDB presence remove warning:", rtdbErr2);
            }
          }

          // 3. Remove player from rolling 24-hr leaderboard documents (da_hub/lb_* and da_hub/lbpending_*)
          const lbDocs = ["lb_jj", "lb_jp", "lbpending_jj", "lbpending_jp"];
          for (const lbId of lbDocs) {
            try {
              const ref = doc(db, "da_hub", lbId);
              const lbSnap = await getDoc(ref);
              if (lbSnap.exists()) {
                const entries = lbSnap.data().entries || [];
                const filtered = entries.filter((e) => (e.playerId || e.id) !== playerId);
                if (filtered.length !== entries.length) {
                  await updateDoc(ref, { entries: filtered });
                }
              }
            } catch (lbErr) {
              console.warn("LB doc update warning:", lbId, lbErr);
            }
          }

          // 4. Invalidate and purge from in-memory caches
          if (window._invalidateAdminPlayersCache) window._invalidateAdminPlayersCache();
          if (window._adminPlayersCache && Array.isArray(window._adminPlayersCache)) {
            window._adminPlayersCache = window._adminPlayersCache.filter(
              (p) => (p.playerId || p.id) !== playerId
            );
          }
          if (window._playerPhotoMap) {
            delete window._playerPhotoMap[playerId];
          }

          // 5. Instantly purge from community leaderboard state if in memory
          if (typeof _socialMembers !== "undefined" && Array.isArray(_socialMembers)) {
            _socialMembers = _socialMembers.filter((p) => (p.playerId || p.id) !== playerId);
          }
          if (window._socialMembers && Array.isArray(window._socialMembers)) {
            window._socialMembers = window._socialMembers.filter((p) => (p.playerId || p.id) !== playerId);
          }
          if (typeof socialRenderList === "function") {
            try { socialRenderList(); } catch (e) {}
          }

          return true;
        } catch (e) {
          console.error("adminDeletePlayer failed:", e);
          return false;
        }
      };

      // ── SHARED REQUESTS ───────────────────────────────────────
      // Authoritative merge logic:
      // - Admin updates (marking Done, Declined, Undo, or clearing) are strictly authoritative.
      // - Non-admin players can NEVER overwrite a server status of 'done' or 'declined' back to 'pending'.
      // - Concurrent player submissions are preserved without clobbering.
      // Internal execution queue to serialize rapid concurrent requests into smooth batches
      let _sharedReqsSyncPromise = null;
      let _sharedReqsQueued = false;
      let _sharedReqsWaiters = [];

      async function _doSharedRequestsSync() {
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const localArr = window._cardRequests ? window._cardRequests() : [];
        const modMap = window._adminModifiedReqs || new Map();
        const dismissedSet = new Set(window._getDismissedReqIds ? window._getDismissedReqIds() : []);

        const writtenModIds = [];
        const writtenCancelledIds = [];

        try {
          const batch = writeBatch(db);
          let opCount = 0;

          // 1. Delete ONLY cancelled pending requests from da_card_requests (never done/declined records!)
          const cancelledPending = window._cancelledPendingReqIds;
          if (cancelledPending && cancelledPending.size) {
            for (const id of cancelledPending) {
              if (!id) continue;
              batch.delete(doc(db, "da_card_requests", id));
              writtenCancelledIds.push(id);
              opCount++;
            }
          }

          // 2. Persist admin modifications (Done, Declined, Undo, notes, etc.)
          if (modMap.size) {
            for (const [id, modData] of modMap.entries()) {
              if (!id) continue;
              writtenModIds.push(id);
              const cleanMod = { ...modData };
              if (cleanMod.photoURL && cleanMod.photoURL.startsWith("data:image/")) cleanMod.photoURL = "";
              if (cleanMod.sentByPhoto && cleanMod.sentByPhoto.startsWith("data:image/")) cleanMod.sentByPhoto = "";
              batch.set(doc(db, "da_card_requests", id), cleanMod, { merge: true });
              opCount++;
            }
          }

          // 3. Persist local in-flight or new requests not yet on server
          for (const req of localArr) {
            if (!req || !req.id || dismissedSet.has(req.id)) continue;
            if (req._inFlight) {
              const cleanReq = { ...req };
              delete cleanReq._inFlight;
              delete cleanReq._clientCreatedAt;
              if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
              if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";
              batch.set(doc(db, "da_card_requests", req.id), cleanReq, { merge: true });
              opCount++;
            }
          }

          if (opCount > 0) {
            await batch.commit();
          }

          // Write succeeded — safe to delete ONLY the IDs processed in this batch!
          // This prevents rapid consecutive clicks from having their queued modifications wiped out.
          if (window._cancelledPendingReqIds && writtenCancelledIds.length) {
            writtenCancelledIds.forEach((id) => window._cancelledPendingReqIds.delete(id));
          }
          if (window._adminModifiedReqs && writtenModIds.length) {
            writtenModIds.forEach((id) => window._adminModifiedReqs.delete(id));
          }

          // Mirror changes to Realtime Database for instant 0-read sync
          if (_presenceRdb) {
            try {
              if (writtenCancelledIds.length && typeof rtdbRemove === "function") {
                writtenCancelledIds.forEach((id) => {
                  rtdbRemove(rtdbRef(_presenceRdb, `cardRequests/${id}`)).catch(() => {});
                });
              }
              if (writtenModIds.length && typeof rtdbUpdate === "function") {
                writtenModIds.forEach((id) => {
                  const mData = modMap.get(id);
                  if (mData) {
                    const cleanMod = { ...mData };
                    if (cleanMod.photoURL && cleanMod.photoURL.startsWith("data:image/")) cleanMod.photoURL = "";
                    if (cleanMod.sentByPhoto && cleanMod.sentByPhoto.startsWith("data:image/")) cleanMod.sentByPhoto = "";
                    rtdbUpdate(rtdbRef(_presenceRdb, `cardRequests/${id}`), cleanMod).catch(() => {});
                  }
                });
              }
              if (typeof rtdbSet === "function") {
                for (const req of localArr) {
                  if (req && req.id && req._inFlight) {
                    const cleanReq = { ...req };
                    delete cleanReq._inFlight;
                    delete cleanReq._clientCreatedAt;
                    if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
                    if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";
                    rtdbSet(rtdbRef(_presenceRdb, `cardRequests/${req.id}`), cleanReq).catch(() => {});
                  }
                }
              }
            } catch (rtdbSyncErr) {
              console.warn("RTDB _doSharedRequestsSync background error:", rtdbSyncErr);
            }
          }

          return true;
        } catch (batchError) {
          console.warn("da_card_requests batch sync failed, attempting individual fallbacks:", batchError);
          try {
            if (writtenCancelledIds.length && window._cancelledPendingReqIds) {
              for (const id of writtenCancelledIds) {
                if (!id) continue;
                try {
                  await deleteDoc(doc(db, "da_card_requests", id));
                  if (_presenceRdb && typeof rtdbRemove === "function") {
                    rtdbRemove(rtdbRef(_presenceRdb, `cardRequests/${id}`)).catch(() => {});
                  }
                  window._cancelledPendingReqIds.delete(id);
                } catch (e) {}
              }
            }
            if (writtenModIds.length && window._adminModifiedReqs) {
              for (const id of writtenModIds) {
                if (!id) continue;
                const mData = modMap.get(id);
                if (mData) {
                  await setDoc(doc(db, "da_card_requests", id), mData, { merge: true });
                  if (_presenceRdb && typeof rtdbUpdate === "function") {
                    rtdbUpdate(rtdbRef(_presenceRdb, `cardRequests/${id}`), mData).catch(() => {});
                  }
                  window._adminModifiedReqs.delete(id);
                }
              }
            }
            return true;
          } catch (individualError) {
            console.error("da_card_requests sync fallback failed:", individualError);
            return false;
          }
        }
      }

      window.saveSharedRequests = function () {
        return new Promise((resolve) => {
          _sharedReqsWaiters.push(resolve);
          if (_sharedReqsSyncPromise) {
            _sharedReqsQueued = true;
            return;
          }

          const run = async () => {
            const currentWaiters = _sharedReqsWaiters.slice();
            _sharedReqsWaiters = [];

            let attempts = 0;
            let ok = false;
            const delays = [200, 500];
            while (attempts < 2) {
              attempts++;
              ok = await _doSharedRequestsSync();
              if (ok) break;
              if (attempts < 2) {
                const delay = delays[attempts - 1] + Math.floor(Math.random() * 100);
                await new Promise((r) => setTimeout(r, delay));
              }
            }

            currentWaiters.forEach((cb) => {
              try { cb(ok); } catch (e) {}
            });

            if (_sharedReqsQueued || _sharedReqsWaiters.length > 0) {
              _sharedReqsQueued = false;
              await run();
              return;
            }

            _sharedReqsSyncPromise = null;
          };

          _sharedReqsSyncPromise = run();
        });
      };

      // Fast-path for directly updating a card request in RTDB and Firestore (e.g. marking Done/Declined/Undo).
      // Delivers instant 0-read update to admin and player over WebSocket while updating Firestore backup.
      window.updateSharedCardRequest = async function (reqId, updateData) {
        if (!reqId || !updateData) return false;
        const cleanMod = { ...updateData };
        if (cleanMod.photoURL && cleanMod.photoURL.startsWith("data:image/")) cleanMod.photoURL = "";
        if (cleanMod.sentByPhoto && cleanMod.sentByPhoto.startsWith("data:image/")) cleanMod.sentByPhoto = "";

        // 1. RTDB fast update (instant delivery, 0 Firestore reads)
        if (_presenceRdb && typeof rtdbUpdate === "function") {
          try {
            await rtdbUpdate(rtdbRef(_presenceRdb, `cardRequests/${reqId}`), cleanMod);
          } catch (rtdbErr) {
            console.warn("RTDB updateSharedCardRequest failed:", rtdbErr);
          }
        }

        // 2. Firestore persistent backup
        try {
          await setDoc(doc(db, "da_card_requests", reqId), cleanMod, { merge: true });
          return true;
        } catch (e) {
          console.warn("da_card_requests updateSharedCardRequest direct setDoc failed, falling back to batch sync:", e);
          if (window._adminModifiedReqs) {
            window._adminModifiedReqs.set(reqId, updateData);
          }
          return await window.saveSharedRequests();
        }
      };

      // Fast-path for deleting a card request from RTDB and Firestore.
      window.deleteSharedCardRequest = async function (reqId) {
        if (!reqId) return false;
        if (_presenceRdb && typeof rtdbRemove === "function") {
          try {
            await rtdbRemove(rtdbRef(_presenceRdb, `cardRequests/${reqId}`));
          } catch (rtdbErr) {
            console.warn("RTDB deleteSharedCardRequest failed:", rtdbErr);
          }
        }
        try {
          await deleteDoc(doc(db, "da_card_requests", reqId));
          return true;
        } catch (e) {
          console.warn("da_card_requests direct deleteDoc failed:", e);
          return false;
        }
      };
      window.deleteSharedRequest = window.deleteSharedCardRequest;

      // Fast-path for adding a new card request to RTDB and Firestore.
      window.addSharedCardRequest = async function (req) {
        if (!req || !req.id) return false;
        const cleanReq = { ...req };
        delete cleanReq._inFlight;
        delete cleanReq._clientCreatedAt;
        if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
        if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";

        if (_presenceRdb && typeof rtdbSet === "function") {
          try {
            await rtdbSet(rtdbRef(_presenceRdb, `cardRequests/${req.id}`), cleanReq);
          } catch (rtdbErr) {
            console.warn("RTDB addSharedCardRequest write failed:", rtdbErr);
          }
        }

        try {
          await setDoc(doc(db, "da_card_requests", req.id), cleanReq);
          return true;
        } catch (e) {
          console.warn("da_card_requests setDoc direct write failed, falling back to batch sync:", e);
          return await window.saveSharedRequests();
        }
      };

      // Atomic submission of card request + coin deduction (if paid) in a single Firestore batch + RTDB sync
      window.submitCardRequestAtomic = async function (req, coinsSpent) {
        if (!req || !req.id) return false;
        const cleanReq = { ...req };
        delete cleanReq._inFlight;
        delete cleanReq._clientCreatedAt;
        if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
        if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";

        // Write immediately to RTDB so admins and players receive the real-time update with 0 Firestore reads
        if (_presenceRdb && typeof rtdbSet === "function") {
          try {
            await rtdbSet(rtdbRef(_presenceRdb, `cardRequests/${req.id}`), cleanReq);
          } catch (rtdbErr) {
            console.warn("RTDB submitCardRequestAtomic write failed:", rtdbErr);
          }
        }

        try {
          const batch = writeBatch(db);
          batch.set(doc(db, "da_card_requests", req.id), cleanReq);
          const uDoc = userDoc();
          if (uDoc && Number(coinsSpent) > 0) {
            batch.update(uDoc, {
              coins: window._getCoins(),
              coinHistory: (window._getCoinHistory ? window._getCoinHistory() : []).slice(0, 100),
              updatedAt: new Date().toISOString(),
              txSeq: increment(1),
            });
          }
          await batch.commit();
          return true;
        } catch (e) {
          console.warn("submitCardRequestAtomic batch write failed, falling back to direct add:", e);
          return await window.addSharedCardRequest(req);
        }
      };

      // Atomic submission of multiple card requests + coin deduction (if paid) in a single Firestore batch + RTDB sync
      window.submitMultipleCardRequestsAtomic = async function (reqs, totalCoinsSpent) {
        if (!Array.isArray(reqs) || reqs.length === 0) return true;
        const cleanList = reqs.map((req) => {
          const cleanReq = { ...req };
          delete cleanReq._inFlight;
          delete cleanReq._clientCreatedAt;
          if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
          if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";
          return cleanReq;
        });

        // Write immediately to RTDB so admins and players receive the real-time update with 0 Firestore reads
        if (_presenceRdb && typeof rtdbUpdate === "function") {
          try {
            const updates = {};
            cleanList.forEach((r) => {
              updates[`cardRequests/${r.id}`] = r;
            });
            await rtdbUpdate(rtdbRef(_presenceRdb), updates);
          } catch (rtdbErr) {
            console.warn("RTDB submitMultipleCardRequestsAtomic write failed:", rtdbErr);
          }
        } else if (_presenceRdb && typeof rtdbSet === "function") {
          for (const r of cleanList) {
            try {
              await rtdbSet(rtdbRef(_presenceRdb, `cardRequests/${r.id}`), r);
            } catch (rtdbErr) {
              console.warn("RTDB submitMultipleCardRequestsAtomic write failed:", rtdbErr);
            }
          }
        }

        try {
          const batch = writeBatch(db);
          cleanList.forEach((r) => {
            batch.set(doc(db, "da_card_requests", r.id), r);
          });
          const uDoc = userDoc();
          if (uDoc && Number(totalCoinsSpent) > 0) {
            batch.update(uDoc, {
              coins: window._getCoins(),
              coinHistory: (window._getCoinHistory ? window._getCoinHistory() : []).slice(0, 100),
              updatedAt: new Date().toISOString(),
              txSeq: increment(1),
            });
          }
          await batch.commit();
          return true;
        } catch (e) {
          console.warn("submitMultipleCardRequestsAtomic batch write failed, falling back to batch sync:", e);
          return await window.addMultipleSharedCardRequests(cleanList);
        }
      };

      // Fast-path batch add for multiple card requests (e.g. Jackpot and Jumbled Jackpot wins)
      window.__mod_addMultipleSharedCardRequests = true;
      window.addMultipleSharedCardRequests = async function (reqs) {
        if (!Array.isArray(reqs) || reqs.length === 0) return true;
        const cleanList = reqs.map((req) => {
          const cleanReq = { ...req };
          delete cleanReq._inFlight;
          delete cleanReq._clientCreatedAt;
          if (cleanReq.photoURL && cleanReq.photoURL.startsWith("data:image/")) cleanReq.photoURL = "";
          if (cleanReq.sentByPhoto && cleanReq.sentByPhoto.startsWith("data:image/")) cleanReq.sentByPhoto = "";
          return cleanReq;
        });

        if (_presenceRdb && typeof rtdbUpdate === "function") {
          try {
            const updates = {};
            cleanList.forEach((r) => {
              updates[`cardRequests/${r.id}`] = r;
            });
            await rtdbUpdate(rtdbRef(_presenceRdb), updates);
          } catch (e) {
            console.warn("RTDB addMultipleSharedCardRequests atomic write failed:", e);
          }
        } else if (_presenceRdb && typeof rtdbSet === "function") {
          for (const r of cleanList) {
            try {
              await rtdbSet(rtdbRef(_presenceRdb, `cardRequests/${r.id}`), r);
            } catch (e) {
              console.warn("RTDB addMultipleSharedCardRequests write failed:", e);
            }
          }
        }

        try {
          const batch = writeBatch(db);
          cleanList.forEach((r) => {
            batch.set(doc(db, "da_card_requests", r.id), r);
          });
          await batch.commit();
          return true;
        } catch (e) {
          console.warn("Firestore batch addMultipleSharedCardRequests failed, falling back to batch sync:", e);
          return await window.saveSharedRequests();
        }
      };

      // Mark a declined card request as refunded on the server so it is never re-refunded
      window.markCardRequestRefunded = async function (reqId) {
        if (!reqId) return;
        const patch = { coinsSpent: 0, refunded: true, refundedAt: new Date().toISOString() };
        if (_presenceRdb && typeof rtdbUpdate === "function") {
          try {
            await rtdbUpdate(rtdbRef(_presenceRdb, `cardRequests/${reqId}`), patch);
          } catch (e) {}
        }
        try {
          await setDoc(
            doc(db, "da_card_requests", reqId),
            patch,
            { merge: true }
          );
        } catch (err) {
          console.warn("markCardRequestRefunded failed:", err);
        }
      };

      // Non-destructive admin clear: marks done and declined requests as adminCleared: true
      // and records adminClearedAt timestamp.
      // Auto-prunes to retain up to the newest 500 archived cards in Firestore & RTDB; older ones are removed.
      window.adminClearSharedRequests = async function (targetIds) {
        try {
          const targetSet = targetIds ? (targetIds instanceof Set ? targetIds : new Set(targetIds)) : null;
          const clearTime = new Date().toISOString();
          const localArr = window._cardRequests ? window._cardRequests() : [];
          const modMap = window._adminModifiedReqs || new Map();
          const clearedIds = window._adminClearedIds || new Set();

          const clearedItems = [];
          const activeItems = [];

          for (const r of localArr) {
            if (!r || !r.id) continue;
            const mod = modMap.get(r.id);
            const isCleared = clearedIds.has(r.id) || r.adminCleared;
            const isDoneOrDeclined =
              r.status === "done" ||
              r.status === "declined" ||
              (mod && (mod.status === "done" || mod.status === "declined"));

            const isNewClear = targetSet
              ? (targetSet.has(r.id) && isDoneOrDeclined)
              : isDoneOrDeclined;
            const shouldClear = isCleared || isNewClear;

            if (shouldClear) {
              const wasAlreadyCleared = !!r.adminCleared && !clearedIds.has(r.id);
              clearedItems.push({
                ...r,
                ...(mod || {}),
                status: (mod && mod.status) || r.status,
                adminCleared: true,
                adminClearedAt: r.adminClearedAt || (mod && mod.adminClearedAt) || clearTime,
                _needsClearWrite: !wasAlreadyCleared,
              });
            } else {
              activeItems.push(r);
            }
          }

          // Sort cleared newest first by adminClearedAt / updatedAt / timestamp
          clearedItems.sort((a, b) => {
            const ta = new Date(a.adminClearedAt || a.updatedAt || a.timestamp || 0).getTime() || 0;
            const tb = new Date(b.adminClearedAt || b.updatedAt || b.timestamp || 0).getTime() || 0;
            return tb - ta;
          });

          // AUTO-PRUNE: Keep only the newest 500 cleared cards in Firestore; delete any beyond 500!
          const keptCleared = clearedItems.slice(0, 500);
          const prunedCleared = clearedItems.slice(500);

          // 1. Mirror pruned deletions and kept updates to Realtime Database
          let rtdbSuccess = false;
          let rtdbAttempted = false;
          if (_presenceRdb && typeof rtdbUpdate === "function") {
            try {
              const rtdbUpdates = {};
              for (const r of prunedCleared) {
                rtdbUpdates[r.id] = null;
              }
              for (const r of keptCleared) {
                if (r._needsClearWrite) {
                  rtdbUpdates[`${r.id}/status`] = r.status;
                  rtdbUpdates[`${r.id}/adminCleared`] = true;
                  rtdbUpdates[`${r.id}/adminClearedAt`] = r.adminClearedAt;
                }
              }
              if (Object.keys(rtdbUpdates).length > 0) {
                rtdbAttempted = true;
                await rtdbUpdate(rtdbRef(_presenceRdb, "cardRequests"), rtdbUpdates);
                rtdbSuccess = true;
              }
            } catch (rtdbClearErr) {
              console.warn("RTDB adminClearSharedRequests update failed:", rtdbClearErr);
            }
          }

          // 2. Commit to Firestore for persistent cold backup
          let firestoreSuccess = false;
          let firestoreAttempted = false;
          try {
            let batch = writeBatch(db);
            let opCount = 0;

            const commitBatchIfFull = async () => {
              if (opCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
              }
            };

            for (const r of prunedCleared) {
              batch.delete(doc(db, "da_card_requests", r.id));
              opCount++;
              await commitBatchIfFull();
            }

            for (const r of keptCleared) {
              if (!r._needsClearWrite) continue;
              const cleanReq = {
                id: r.id,
                status: r.status || "done",
                adminCleared: true,
                adminClearedAt: r.adminClearedAt || clearTime,
              };

              batch.set(
                doc(db, "da_card_requests", r.id),
                cleanReq,
                { merge: true },
              );
              opCount++;
              await commitBatchIfFull();
            }

            if (opCount > 0) {
              firestoreAttempted = true;
              await batch.commit();
              firestoreSuccess = true;
            }
          } catch (firestoreErr) {
            console.warn("Firestore adminClearSharedRequests backup sync warning:", firestoreErr);
          }

          // 3. Reconcile partial writes if one persistence layer succeeded while the other failed
          if (rtdbAttempted && !rtdbSuccess && firestoreSuccess && _presenceRdb && typeof rtdbUpdate === "function") {
            try {
              const rtdbUpdates = {};
              for (const r of prunedCleared) {
                rtdbUpdates[r.id] = null;
              }
              for (const r of keptCleared) {
                if (r._needsClearWrite) {
                  rtdbUpdates[`${r.id}/status`] = r.status;
                  rtdbUpdates[`${r.id}/adminCleared`] = true;
                  rtdbUpdates[`${r.id}/adminClearedAt`] = r.adminClearedAt;
                }
              }
              if (Object.keys(rtdbUpdates).length > 0) {
                await rtdbUpdate(rtdbRef(_presenceRdb, "cardRequests"), rtdbUpdates);
                rtdbSuccess = true;
              }
            } catch (reconRtdbErr) {
              console.warn("RTDB reconciliation retry warning:", reconRtdbErr);
            }
          } else if (firestoreAttempted && !firestoreSuccess && rtdbSuccess) {
            try {
              let retryBatch = writeBatch(db);
              let rCount = 0;
              for (const r of prunedCleared) {
                retryBatch.delete(doc(db, "da_card_requests", r.id));
                rCount++;
              }
              for (const r of keptCleared) {
                if (!r._needsClearWrite) continue;
                retryBatch.set(
                  doc(db, "da_card_requests", r.id),
                  {
                    id: r.id,
                    status: r.status || "done",
                    adminCleared: true,
                    adminClearedAt: r.adminClearedAt || clearTime,
                  },
                  { merge: true },
                );
                rCount++;
              }
              if (rCount > 0) {
                await retryBatch.commit();
                firestoreSuccess = true;
              }
            } catch (reconFsErr) {
              console.warn("Firestore reconciliation retry warning:", reconFsErr);
            }
          }

          // Report success only when persistence succeeds for attempted writes
          const anyAttempted = rtdbAttempted || firestoreAttempted;
          const persistenceSucceeded = !anyAttempted || rtdbSuccess || firestoreSuccess;

          if (!persistenceSucceeded) {
            console.warn("adminClearSharedRequests: persistence failed for all targets");
            return false;
          }

          const updated = [...activeItems, ...keptCleared];
          if (window._setCardRequests) window._setCardRequests(updated);
          return true;
        } catch (e) {
          console.warn("adminClearSharedRequests failed:", e);
          return false;
        }
      };

      // ── CARD REQUESTS LOADING ──────────────────────────────────
      // Helper to cleanly parse and sanitize RTDB card request records
      function _parseRtdbCardRequests(val) {
        if (!val || typeof val !== "object") return [];
        const reqs = [];
        for (const [k, r] of Object.entries(val)) {
          if (r && typeof r === "object") {
            if (!r.id) r.id = k;
            // Only include valid card requests that have cardIdx or source
            if (r.cardIdx !== undefined || r.source) {
              reqs.push(r);
            }
          }
        }
        reqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return reqs;
      }

      // Admins load 100% of all requests with ZERO Firestore reads via Realtime Database.
      // Normal players load their requests with ZERO Firestore reads via indexed Realtime Database.
      // Automatic fallback to Firestore if RTDB is unavailable or empty.
      window.loadSharedRequests = async function (forceAll) {
        try {
          const isAdmin = forceAll || (typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized());
          if (isAdmin) {
            // Priority 1: Realtime Database (0 Firestore reads, zero limits, full collection)
            if (_presenceRdb && typeof rtdbGet === "function" && typeof rtdbRef === "function") {
              try {
                const snap = await rtdbGet(rtdbRef(_presenceRdb, "cardRequests"));
                if (snap.exists()) {
                  const reqs = _parseRtdbCardRequests(snap.val());
                  if (reqs.length > 0) {
                    if (window._setCardRequests) window._setCardRequests(reqs);
                    return; // 0 Firestore reads!
                  }
                }
              } catch (rtdbErr) {
                console.warn("RTDB loadSharedRequests failed, falling back to Firestore:", rtdbErr);
              }
            }

            // Fallback to Firestore
            const snap = await getDocs(CARD_REQS_COL);
            if (snap && !snap.empty) {
              const reqs = [];
              snap.forEach((d) => reqs.push(d.data()));
              reqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
              if (window._setCardRequests) window._setCardRequests(reqs);
              // Auto-seed RTDB if it was empty
              if (_presenceRdb && typeof rtdbSet === "function") {
                const map = {};
                reqs.forEach((r) => { if (r && r.id) map[r.id] = r; });
                rtdbSet(rtdbRef(_presenceRdb, "cardRequests"), map).catch(() => {});
              }
            }
          } else {
            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            if (!myPid) return;

            // Priority 1: Realtime Database (0 Firestore reads)
            if (_presenceRdb && typeof rtdbGet === "function" && typeof rtdbQuery === "function" && typeof rtdbOrderByChild === "function" && typeof rtdbEqualTo === "function") {
              try {
                const q = rtdbQuery(rtdbRef(_presenceRdb, "cardRequests"), rtdbOrderByChild("playerId"), rtdbEqualTo(myPid));
                const snap = await rtdbGet(q);
                if (snap.exists()) {
                  const myReqs = _parseRtdbCardRequests(snap.val());
                  if (myReqs.length > 0) {
                    if (window._setCardRequests) window._setCardRequests(myReqs);
                    return; // 0 Firestore reads!
                  }
                }
              } catch (rtdbErr) {
                console.warn("RTDB player requests read failed, falling back to Firestore:", rtdbErr);
              }
            }

            // Fallback to Firestore
            const q = query(CARD_REQS_COL, where("playerId", "==", myPid));
            const snap = await getDocs(q);
            if (snap && !snap.empty) {
              const reqs = [];
              snap.forEach((d) => reqs.push(d.data()));
              reqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
              if (window._setCardRequests) window._setCardRequests(reqs);
            }
          }
        } catch (e) {
          console.warn("da_card_requests read failed:", e);
        }
      };

      window.fetchPlayerCardRequests = async function (playerId) {
        const pid = playerId || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
        if (!pid) return [];
        // Priority 1: Realtime Database (0 Firestore reads)
        if (_presenceRdb && typeof rtdbGet === "function" && typeof rtdbRef === "function" && typeof rtdbQuery === "function" && typeof rtdbOrderByChild === "function" && typeof rtdbEqualTo === "function") {
          try {
            const q = rtdbQuery(rtdbRef(_presenceRdb, "cardRequests"), rtdbOrderByChild("playerId"), rtdbEqualTo(pid));
            const snap = await rtdbGet(q);
            if (snap.exists()) {
              const myReqs = _parseRtdbCardRequests(snap.val());
              if (myReqs.length > 0) {
                if (typeof window._setCardRequests === "function") {
                  window._setCardRequests(myReqs);
                }
                return myReqs;
              }
            }
          } catch (rtdbErr) {
            console.warn("RTDB player card requests read failed, falling back to Firestore:", rtdbErr);
          }
        }
        // Fallback to Firestore (bounded strictly to this player's own card requests, no limit)
        try {
          const q = query(CARD_REQS_COL, where("playerId", "==", pid));
          const snap = await getDocs(q);
          if (snap && !snap.empty) {
            const myReqs = [];
            snap.forEach((d) => myReqs.push(d.data()));
            myReqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            if (typeof window._setCardRequests === "function") {
              window._setCardRequests(myReqs);
            }
            return myReqs;
          }
        } catch (fsErr) {
          console.warn("Firestore player card requests read failed:", fsErr);
        }
        return [];
      };

      // Debounced UI refresh coalescing all snapshot / transaction UI updates into 1 frame
      let _uiRefreshRaf = null;
      function _scheduleUIRefresh() {
        if (_uiRefreshRaf) return;
        _uiRefreshRaf = requestAnimationFrame(() => {
          _uiRefreshRaf = null;
          if (window._adminUnlocked && window._adminUnlocked()) {
            window.renderAdminList && window.renderAdminList();
            window.updateAdminStats && window.updateAdminStats();
          }
          if (
            document.getElementById("panel-cds") &&
            document.getElementById("panel-cds").classList.contains("active")
          ) {
            window.renderCdsGrid && window.renderCdsGrid();
            window.updateCdsFreeCounter && window.updateCdsFreeCounter();
          }
          window.refreshCdsReqPill && window.refreshCdsReqPill();
          window.renderMyCdsRequests && window.renderMyCdsRequests();
          window.updateCollStats && window.updateCollStats();
          if (
            document.getElementById("panel-coll") &&
            document.getElementById("panel-coll").classList.contains("active")
          ) {
            window.renderCollGrid && window.renderCollGrid();
          }
          window.renderMyRequests && window.renderMyRequests();
          window.refreshMyReqPill && window.refreshMyReqPill();
        });
      }
      window._scheduleUIRefresh = _scheduleUIRefresh;

      // Realtime listener for Admins ONLY (Full collection via Realtime Database — 0 Firestore reads!)
      let _adminLiveUnsub = null;
      let _shopRequestsLiveUnsub = null;
      let _suggestionsLiveUnsub = null;
      let _jackpotLiveUnsub = null;
      let _jjEntriesLiveUnsub = null;
      let _userDocLiveUnsub = null;
      let _eventControlsLiveUnsub = null;

      window.startLiveAdminListener = function () {
        if (typeof window._isAdminAuthorized === "function" && !window._isAdminAuthorized()) return null;
        if (_adminLiveUnsub) return _adminLiveUnsub;

        // Priority 1: Realtime Database (0 Firestore reads, zero limits, instant WebSocket updates)
        if (_presenceRdb && typeof rtdbOnValue === "function" && typeof rtdbRef === "function") {
          try {
            const cardRef = rtdbRef(_presenceRdb, "cardRequests");
            const unsub = rtdbOnValue(
              cardRef,
              (snap) => {
                const reqs = _parseRtdbCardRequests(snap.val());
                if (window._setCardRequests) {
                  window._setCardRequests(reqs);
                }
                _scheduleUIRefresh();
              },
              (err) => {
                console.warn("RTDB cardRequests admin live sync error:", err);
              }
            );
            _adminLiveUnsub = typeof unsub === "function" ? unsub : () => {};
            return _adminLiveUnsub;
          } catch (rtdbErr) {
            console.warn("Failed attaching RTDB admin listener, falling back to Firestore:", rtdbErr);
          }
        }

        // Fallback: Firestore onSnapshot
        _adminLiveUnsub = onSnapshot(CARD_REQS_COL, (snap) => {
          const reqs = [];
          snap.forEach((d) => reqs.push(d.data()));
          reqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
          if (window._setCardRequests) {
            window._setCardRequests(reqs);
          }
          _scheduleUIRefresh();
        }, (err) => {
          console.warn("da_card_requests admin live sync error:", err);
        });
        return _adminLiveUnsub;
      };
      window.stopLiveAdminListener = function () {
        if (_adminLiveUnsub) {
          try { _adminLiveUnsub(); } catch (e) {}
          _adminLiveUnsub = null;
        }
      };
      window.stopAllAdminListeners = function () {
        if (window.stopLiveAdminListener) window.stopLiveAdminListener();
        if (window.stopLiveAdminPresenceListener) window.stopLiveAdminPresenceListener();
        if (window.stopLivePlayerPresenceListener) window.stopLivePlayerPresenceListener();
        if (window.stopLiveGrantHistoryAdminListener) window.stopLiveGrantHistoryAdminListener();
        if (_shopRequestsLiveUnsub) { try { _shopRequestsLiveUnsub(); } catch (e) {} _shopRequestsLiveUnsub = null; }
        if (_suggestionsLiveUnsub) { try { _suggestionsLiveUnsub(); } catch (e) {} _suggestionsLiveUnsub = null; }
        if (_jackpotLiveUnsub) { try { _jackpotLiveUnsub(); } catch (e) {} _jackpotLiveUnsub = null; }
        if (_jjEntriesLiveUnsub) { try { _jjEntriesLiveUnsub(); } catch (e) {} _jjEntriesLiveUnsub = null; }
        if (window.stopRorRequests) window.stopRorRequests();
      };

      // Realtime listener for Normal Players (ONLY their own requests via indexed Realtime Database — 0 Firestore reads!)
      let _playerLiveUnsub = null;
      window.startPlayerLiveRequestsListener = function (playerId) {
        const pid = playerId || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
        if (!pid) return null;
        if (_playerLiveUnsub) return _playerLiveUnsub;

        // Priority 1: Realtime Database (0 Firestore reads!)
        if (_presenceRdb && typeof rtdbOnValue === "function" && typeof rtdbQuery === "function" && typeof rtdbOrderByChild === "function" && typeof rtdbEqualTo === "function") {
          try {
            const q = rtdbQuery(rtdbRef(_presenceRdb, "cardRequests"), rtdbOrderByChild("playerId"), rtdbEqualTo(pid));
            const unsub = rtdbOnValue(
              q,
              async (snap) => {
                let myReqs = _parseRtdbCardRequests(snap.val());
                if (myReqs.length === 0 && pid) {
                  try {
                    const fsSnap = await getDocs(query(CARD_REQS_COL, where("playerId", "==", pid)));
                    if (fsSnap && !fsSnap.empty) {
                      const fsReqs = [];
                      fsSnap.forEach((d) => fsReqs.push(d.data()));
                      if (fsReqs.length > 0) {
                        myReqs = fsReqs;
                        myReqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                        if (_presenceRdb && typeof rtdbUpdate === "function") {
                          const updates = {};
                          fsReqs.forEach((r) => { if (r && r.id) updates[`cardRequests/${r.id}`] = r; });
                          rtdbUpdate(rtdbRef(_presenceRdb), updates).catch(() => {});
                        }
                      }
                    }
                  } catch (e) {}
                }
                if (window._setCardRequests) {
                  window._setCardRequests(myReqs);
                }
                _scheduleUIRefresh();
              },
              (err) => {
                console.warn("RTDB player card requests live sync error:", err);
              }
            );
            _playerLiveUnsub = typeof unsub === "function" ? unsub : () => {};
            return _trackUnsub(_playerLiveUnsub);
          } catch (rtdbErr) {
            console.warn("Failed attaching RTDB player listener, falling back to Firestore:", rtdbErr);
          }
        }

        // Fallback: Firestore onSnapshot
        const q = query(CARD_REQS_COL, where("playerId", "==", pid));
        _playerLiveUnsub = onSnapshot(q, (snap) => {
          const myReqs = [];
          snap.forEach((d) => myReqs.push(d.data()));
          myReqs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
          if (window._setCardRequests) {
            window._setCardRequests(myReqs);
          }
          _scheduleUIRefresh();
        }, (err) => {
          console.warn("Player card requests live sync error:", err);
        });
        return _trackUnsub(_playerLiveUnsub);
      };
      window.stopPlayerLiveRequestsListener = function () {
        if (_playerLiveUnsub) {
          try { _playerLiveUnsub(); } catch (e) {}
          _playerLiveUnsub = null;
        }
      };

      // ── SHOP REQUESTS — log of coin-purchased shop items (e.g. Bloom and Buzz) ──
      window.saveShopRequests = async function () {
        try {
          let merged = null;
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(SHOP_REQ_DOC);
            const serverArrRaw =
              snap.exists() && Array.isArray(snap.data().shopRequests)
                ? snap.data().shopRequests
                : [];
            const localArr = window._shopRequests ? window._shopRequests() : [];
            const isAdmin = _isAdminAuthorized();
            const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
            const myName = (typeof profile === "object" && profile && profile.name) ? String(profile.name).trim().toLowerCase() : "";

            // Same as card requests: a cancelled pending purchase must leave the server.
            const dismissedSet = new Set(window._getDismissedReqIds ? window._getDismissedReqIds() : []);
            const serverArr = dismissedSet.size
              ? serverArrRaw.filter((r) => {
                  if (!r || !dismissedSet.has(r.id) || r.status !== "pending") return true;
                  const mine =
                    (myPid && r.playerId && r.playerId === myPid) ||
                    (myName && r.playerName && String(r.playerName).trim().toLowerCase() === myName);
                  return !mine;
                })
              : serverArrRaw;

            const localMap = new Map();
            localArr.forEach((r) => { if (r && r.id) localMap.set(r.id, { ...r }); });

            if (isAdmin) {
              const result = [];
              const writtenIds = new Set();
              localArr.forEach((localReq) => {
                if (!localReq || !localReq.id) return;
                writtenIds.add(localReq.id);
                result.push(localReq);
              });
              serverArr.forEach((serverReq) => {
                if (!serverReq || !serverReq.id) return;
                if (!writtenIds.has(serverReq.id) && serverReq.status === "pending") {
                  result.push(serverReq);
                  writtenIds.add(serverReq.id);
                }
              });
              merged = result;
            } else {
              const result = [];
              const serverSeenIds = new Set();
              serverArr.forEach((serverReq) => {
                if (!serverReq || !serverReq.id) return;
                serverSeenIds.add(serverReq.id);
                const localReq = localMap.get(serverReq.id);
                if (!localReq) {
                  result.push(serverReq);
                  return;
                }
                const isMine =
                  (myPid && localReq.playerId && localReq.playerId === myPid) ||
                  (myName && localReq.playerName && localReq.playerName.trim().toLowerCase() === myName);
                if (isMine && serverReq.status === "pending" && localReq.status === "pending") {
                  result.push({ ...serverReq, ...localReq });
                } else {
                  result.push(serverReq);
                }
              });
              localArr.forEach((localReq) => {
                if (!localReq || !localReq.id) return;
                if (!serverSeenIds.has(localReq.id)) {
                  const isMine =
                    (myPid && localReq.playerId && localReq.playerId === myPid) ||
                    (myName && localReq.playerName && localReq.playerName.trim().toLowerCase() === myName);
                  if (isMine && localReq.status === "pending") {
                    result.push(localReq);
                  }
                }
              });
              merged = result;
            }

            tx.set(SHOP_REQ_DOC, { shopRequests: merged });
          });
          if (merged && window._setShopRequests)
            window._setShopRequests(merged);
          return true;
        } catch (e) {
          console.warn("Firebase write failed (shop requests):", e);
          return false;
        }
      };

      // Direct admin clear for shop requests: removes all given & declined requests from Firestore
      window.adminClearDoneShopRequests = async function () {
        try {
          let remaining = [];
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(SHOP_REQ_DOC);
            const serverArr =
              snap.exists() && Array.isArray(snap.data().shopRequests)
                ? snap.data().shopRequests
                : [];
            remaining = serverArr.filter((r) => r && r.status === "pending");
            tx.set(SHOP_REQ_DOC, { shopRequests: remaining });
          });
          if (window._setShopRequests)
            window._setShopRequests(remaining);
          return true;
        } catch (e) {
          console.warn("Firebase clear failed (shop requests):", e);
          return false;
        }
      };

      window.loadShopRequests = async function () {
        try {
          const snap = await getDoc(SHOP_REQ_DOC);
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.shopRequests))
              window._setShopRequests(data.shopRequests);
          }
        } catch (e) {
          console.warn("Firebase read failed (shop requests):", e);
        }
      };

      window.startLiveShopRequestsAdminListener = function () {
        if (_shopRequestsLiveUnsub) return _shopRequestsLiveUnsub;
        _shopRequestsLiveUnsub = onSnapshot(SHOP_REQ_DOC, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            if (Array.isArray(data.shopRequests)) {
              window._setShopRequests(data.shopRequests);
              if (window._adminUnlocked && window._adminUnlocked()) {
                window.renderAdminShopList && window.renderAdminShopList();
                window.updateAdminShopStats && window.updateAdminShopStats();
              }
              window.renderMyRequests && window.renderMyRequests();
              window.refreshMyReqPill && window.refreshMyReqPill();
              if (
                document.getElementById("panel-shop") &&
                document.getElementById("panel-shop").classList.contains("active")
              ) {
                window.renderShopGrid && window.renderShopGrid();
              }
            }
          });
        return _shopRequestsLiveUnsub;
      };

      // ── SUGGESTIONS — player-run feedback board (📬 topbar icon) ──
      // A public, player-visible feed: anyone can post, anyone can upvote/
      // downvote, sorted by score (upvotes − downvotes). No admin moderation —
      // removed per request; the board is entirely player-run.
      //
      // Posting uses arrayUnion — an atomic server-side merge that can't race or
      // clobber other players' submissions the way a read-modify-write setDoc
      // could. Voting DOES need a read-modify-write because it edits one entry's
      // `votes` map inside the array, so it goes through runTransaction, which
      // retries automatically if two players vote at the same instant.
      window.submitSuggestion = async function (entry) {
        try {
          await setDoc(
            SUGGEST_DOC,
            { items: arrayUnion(entry) },
            { merge: true },
          );
          return true;
        } catch (e) {
          console.warn("Firebase write failed (suggestion):", e);
          return false;
        }
      };

      window.loadSuggestions = async function () {
        try {
          const snap = await getDoc(SUGGEST_DOC);
          if (snap.exists() && Array.isArray(snap.data().items))
            return snap.data().items;
        } catch (e) {
          console.warn("Firebase read failed (suggestions):", e);
        }
        return [];
      };

      // dir: 1 = upvote, -1 = downvote, 0 = remove my vote (tapping the same button again)
      // voterInfo: { name } — stashed alongside the vote so the "who voted" list
      // can be shown without a separate players-collection lookup.
      window.voteSuggestion = async function (id, playerId, dir, voterInfo) {
        try {
          const items = await runTransaction(db, async (tx) => {
            const snap = await tx.get(SUGGEST_DOC);
            const arr =
              snap.exists() && Array.isArray(snap.data().items)
                ? snap.data().items
                : [];
            const idx = arr.findIndex((s) => s && s.id === id);
            if (idx === -1) return arr;
            const item = { ...arr[idx] };
            const votes = { ...(item.votes || {}) };
            if (dir === 0) {
              delete votes[playerId];
            } else {
              votes[playerId] = {
                dir: dir > 0 ? 1 : -1,
                name: (voterInfo && voterInfo.name) || "",
                ts: Date.now(),
              };
            }
            item.votes = votes;
            const next = arr.slice();
            next[idx] = item;
            tx.set(SUGGEST_DOC, { items: next }, { merge: false });
            return next;
          });
          return items;
        } catch (e) {
          console.warn("Firebase write failed (vote):", e);
          return null;
        }
      };

      // ── SUGGESTIONS — comments sub-feed ────────────────────────
      // Submits a comment on an existing suggestion. Merges into that suggestion's
      // `comments` array inside SUGGEST_DOC via runTransaction.
      window.addSuggestionComment = async function (
        suggestionId,
        commentObj,
      ) {
        try {
          const items = await runTransaction(db, async (tx) => {
            const snap = await tx.get(SUGGEST_DOC);
            const arr =
              snap.exists() && Array.isArray(snap.data().items)
                ? snap.data().items
                : [];
            const idx = arr.findIndex((s) => s && s.id === suggestionId);
            if (idx === -1) return arr;
            const item = { ...arr[idx] };
            const comments = Array.isArray(item.comments)
              ? item.comments.slice()
              : [];
            comments.push(commentObj);
            item.comments = comments;
            const next = arr.slice();
            next[idx] = item;
            tx.set(SUGGEST_DOC, { items: next }, { merge: false });
            return next;
          });
          return items;
        } catch (e) {
          console.warn("Firebase write failed (comment):", e);
          return null;
        }
      };

      // Deletes a single comment from a suggestion. Only the original author
      // (or the DA leader) can delete.
      window.deleteSuggestionComment = async function (
        suggestionId,
        commentId,
      ) {
        try {
          const items = await runTransaction(db, async (tx) => {
            const snap = await tx.get(SUGGEST_DOC);
            const arr =
              snap.exists() && Array.isArray(snap.data().items)
                ? snap.data().items
                : [];
            const idx = arr.findIndex((s) => s && s.id === suggestionId);
            if (idx === -1) return arr;
            const item = { ...arr[idx] };
            const comments = (
              Array.isArray(item.comments) ? item.comments : []
            ).filter((c) => c && c.id !== commentId);
            item.comments = comments;
            const next = arr.slice();
            next[idx] = item;
            tx.set(SUGGEST_DOC, { items: next }, { merge: false });
            return next;
          });
          return items;
        } catch (e) {
          console.warn("Firebase write failed (delete comment):", e);
          return null;
        }
      };

      // Backward-compatibility bridge aliases for action-runner UI
      window.submitComment = window.addSuggestionComment;
      window.deleteComment = window.deleteSuggestionComment;

      window.startLiveSuggestionsListener = function () {
        if (_suggestionsLiveUnsub) return _suggestionsLiveUnsub;
        _suggestionsLiveUnsub = onSnapshot(SUGGEST_DOC, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            if (Array.isArray(data.items)) {
              window.renderSuggestionsFeed &&
                window.renderSuggestionsFeed(data.items);
            }
          });
        return _suggestionsLiveUnsub;
      };

      // ── JACKPOT EVENT & JUMBLED JACKPOT — deduplication helper ──
      function deduplicateEntryArray(arr) {
        if (!Array.isArray(arr) || arr.length <= 1) return Array.isArray(arr) ? arr.slice() : [];
        const map = new Map();
        arr.forEach((e) => {
          if (!e || !e.id) return;
          const existing = map.get(e.id);
          if (!existing) {
            map.set(e.id, e);
            return;
          }
          // Compare richness to prefer authentic user-submitted entry over synthetic recovery stub
          const existingRichness =
            (Array.isArray(existing.answers) ? existing.answers.length : 0) +
            (Array.isArray(existing.writtenAnswers) ? existing.writtenAnswers.length : 0) +
            (Array.isArray(existing.requiredCards) ? existing.requiredCards.length : 0) +
            (existing.cardOrder && existing.cardOrder.length ? 10 : 0) +
            (existing.setName && existing.setName !== "8 correct" && existing.setName !== "Jumbled Jackpot" && existing.setName !== "Jackpot Set" ? 5 : 0);
          const newRichness =
            (Array.isArray(e.answers) ? e.answers.length : 0) +
            (Array.isArray(e.writtenAnswers) ? e.writtenAnswers.length : 0) +
            (Array.isArray(e.requiredCards) ? e.requiredCards.length : 0) +
            (e.cardOrder && e.cardOrder.length ? 10 : 0) +
            (e.setName && e.setName !== "8 correct" && e.setName !== "Jumbled Jackpot" && e.setName !== "Jackpot Set" ? 5 : 0);
          if (newRichness > existingRichness) {
            map.set(e.id, e);
          }
        });
        return Array.from(map.values());
      }
      window.deduplicateEntryArray = deduplicateEntryArray;

      // ── JACKPOT EVENT — shared entries ────────────────────────
      window.saveJackpotEntries = async function (newEntry) {
        try {
          const isNewRoundSubmission = Boolean(
            newEntry &&
            newEntry.id &&
            (newEntry.playerName || newEntry.correctCount != null || Array.isArray(newEntry.requiredCards)) &&
            !newEntry.deletedIds
          );

          // If a new round entry is submitted (by regular player, admin, or room host),
          // update or append atomically via transaction to guarantee zero duplicate IDs!
          if (isNewRoundSubmission) {
            // Dual-layer persistent RTDB backup for 100% zero-latency submission durability
            if (_presenceRdb && typeof rtdbSet === "function") {
              try {
                const entrySummary = {
                  id: newEntry.id,
                  playerName: newEntry.playerName || "Unknown",
                  townName: newEntry.townName || "",
                  playerId: newEntry.playerId || "",
                  score: newEntry.correctCount != null ? newEntry.correctCount : 0,
                  correctCount: newEntry.correctCount != null ? newEntry.correctCount : 0,
                  total: newEntry.totalCards || 10,
                  totalCards: newEntry.totalCards || 10,
                  timeSecs: newEntry.timeSecs != null ? newEntry.timeSecs : 0,
                  setName: newEntry.setName || "Jackpot Set",
                  setIdx: newEntry.setIdx != null ? newEntry.setIdx : -1,
                  requiredCards: newEntry.requiredCards || [],
                  requiredCardsCount: (newEntry.requiredCards || []).length,
                  writtenAnswers: newEntry.writtenAnswers || [],
                  hardQuestions: newEntry.hardQuestions || null,
                  cardOrder: newEntry.cardOrder || null,
                  mode: newEntry.mode || "normal",
                  status: newEntry.status || "new",
                  timestamp: newEntry.timestamp || new Date().toISOString(),
                };
                // 1. Permanent event submission node (persists even after room ends)
                rtdbSet(rtdbRef(_presenceRdb, `eventSubmissions/jp/${newEntry.id}`), entrySummary).catch(() => {});
                // 2. Room backup if room is active
                if (window.jpRoomId) {
                  rtdbSet(rtdbRef(_presenceRdb, `jpGames/${window.jpRoomId}/entries/${newEntry.id}`), entrySummary).catch(() => {});
                }
              } catch (e) {}
            }

            // Retry up to 5 times with randomized exponential backoff if Firestore transaction faces contention
            let retries = 5;
            let success = false;
            while (retries > 0 && !success) {
              try {
                await runTransaction(db, async (tx) => {
                  const snap = await tx.get(JP_DOC);
                  const serverEntries =
                    snap.exists() && Array.isArray(snap.data().entries)
                      ? snap.data().entries
                      : [];
                  const next = [];
                  const seen = new Set();
                  let replaced = false;
                  serverEntries.forEach((se) => {
                    if (!se || !se.id) return;
                    if (se.id === newEntry.id) {
                      next.push(newEntry);
                      seen.add(newEntry.id);
                      replaced = true;
                    } else if (!seen.has(se.id)) {
                      next.push(se);
                      seen.add(se.id);
                    }
                  });
                  if (!replaced && !seen.has(newEntry.id)) {
                    next.unshift(newEntry);
                  }
                  // Document size guard: keep at most 150 newest entries to guarantee staying well under 1 MiB
                  if (next.length > 150) {
                    next.sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
                    next.length = 150;
                  }
                  tx.set(JP_DOC, { entries: next });
                });
                success = true;
              } catch (txErr) {
                retries--;
                if (retries > 0) {
                  const delay = Math.floor(Math.random() * 400 + 200) * (6 - retries);
                  await new Promise((r) => setTimeout(r, delay));
                } else {
                  console.warn("Firestore saveJackpotEntries transaction retries exhausted, falling back to direct doc save:", txErr);
                  try {
                    await setDoc(doc(db, "da_event_submissions", newEntry.id), newEntry, { merge: true });
                  } catch (fbErr) {}
                }
              }
            }
            return;
          }

          // Admin modifying entries (marking reviewed, deleting rounds):
          const options = (newEntry && typeof newEntry === "object" && !isNewRoundSubmission) ? newEntry : {};
          const explicitlyDeletedIds = new Set(Array.isArray(options.deletedIds) ? options.deletedIds : []);

          // Sync explicitly deleted IDs to RTDB and local sets so all admins immediately blacklist them
          if (explicitlyDeletedIds.size > 0) {
            if (!window._deletedJackpotRoundIds) window._deletedJackpotRoundIds = new Set();
            if (!window._clearedJackpotRoundIds) window._clearedJackpotRoundIds = new Set();
            explicitlyDeletedIds.forEach((id) => {
              window._deletedJackpotRoundIds.add(id);
              window._clearedJackpotRoundIds.add(id);
              if (_presenceRdb && typeof rtdbSet === "function") {
                rtdbSet(rtdbRef(_presenceRdb, `eventDeletedRounds/jp/${id}`), Date.now()).catch(() => {});
              }
            });
            try {
              setDoc(doc(db, "da_hub", "deletedEventRounds"), {
                jpDeleted: Array.from(window._deletedJackpotRoundIds).slice(-200),
                updatedAt: new Date().toISOString()
              }, { merge: true }).catch(() => {});
            } catch (e) {}
          }

          // Use runTransaction to safely merge admin changes with server entries,
          // strictly deduplicating by ID, removing deleted rounds from server, and preserving new rounds
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(JP_DOC);
            const serverEntries =
              snap.exists() && Array.isArray(snap.data().entries)
                ? snap.data().entries
                : [];
            const myLocalEntries = window._jpEntries ? window._jpEntries() : [];
            const deletedRounds = new Set([
              ...(window._deletedJackpotRoundIds ? Array.from(window._deletedJackpotRoundIds) : []),
              ...(window._clearedJackpotRoundIds ? Array.from(window._clearedJackpotRoundIds) : []),
              ...explicitlyDeletedIds,
            ]);

            const merged = [];
            const seen = new Set();
            myLocalEntries.forEach((me) => {
              if (me && me.id && !deletedRounds.has(me.id) && !seen.has(me.id)) {
                merged.push(me);
                seen.add(me.id);
              }
            });
            const knownLoadedIds = window._jpLoadedEntryIds || new Set();
            serverEntries.forEach((se) => {
              if (!se || !se.id) return;
              if (deletedRounds.has(se.id)) return;
              if (seen.has(se.id)) return;
              if (knownLoadedIds.has(se.id)) return;
              merged.push(se);
              seen.add(se.id);
            });
            // Document size guard: keep at most 150 newest entries to guarantee staying well under 1 MiB
            if (merged.length > 150) {
              merged.sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
              merged.length = 150;
            }
            tx.set(JP_DOC, { entries: merged });
          });
        } catch (e) {
          console.warn("Firebase write failed (jackpot):", e);
        }
      };

      window.loadJackpotEntries = async function () {
        try {
          // 1. Sync globally deleted rounds from RTDB so all admins share deletions
          if (_presenceRdb && typeof rtdbGet === "function") {
            try {
              const delSnap = await rtdbGet(rtdbRef(_presenceRdb, "eventDeletedRounds/jp"));
              if (delSnap.exists()) {
                const delObj = delSnap.val() || {};
                if (!window._deletedJackpotRoundIds) window._deletedJackpotRoundIds = new Set();
                if (!window._clearedJackpotRoundIds) window._clearedJackpotRoundIds = new Set();
                Object.keys(delObj).forEach((id) => {
                  window._deletedJackpotRoundIds.add(id);
                  window._clearedJackpotRoundIds.add(id);
                });
              }
            } catch (e) {}
          }

          // 2. Read from Firestore JP_DOC
          const snap = await getDoc(JP_DOC);
          let serverEntries = [];
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.entries)) {
              serverEntries = data.entries;
            }
          }

          // 3. Merge with any persistent submissions in RTDB from the last 24 hours
          let rtdbEntries = [];
          if (_presenceRdb && typeof rtdbGet === "function") {
            try {
              const subSnap = await rtdbGet(rtdbRef(_presenceRdb, "eventSubmissions/jp"));
              if (subSnap.exists()) {
                const subObj = subSnap.val() || {};
                rtdbEntries = Object.values(subObj).filter((e) => e && e.id);
              }
            } catch (e) {}
          }

          const combined = deduplicateEntryArray([...serverEntries, ...rtdbEntries]);
          window._jpLoadedEntryIds = new Set(combined.map((e) => e && e.id).filter(Boolean));
          window._setJpEntries(combined);
          window._jpEntriesLoaded = true;
        } catch (e) {
          console.warn("Firebase read failed (jackpot):", e);
        }
      };

      window.startLiveJackpotAdminListener = function () {
        if (_jackpotLiveUnsub) return _jackpotLiveUnsub;
        _jackpotLiveUnsub = onSnapshot(JP_DOC, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (Array.isArray(data.entries)) {
            const deduped = deduplicateEntryArray(data.entries);
            window._jpLoadedEntryIds = new Set(deduped.map((e) => e && e.id).filter(Boolean));
            window._jpEntriesLoaded = true;
            // Guard: ensure single-document size stays safely under 1 MiB limit (< 600 KB)
            if (deduped.length > 150 && window._adminUnlocked && window._adminUnlocked()) {
              const sorted = deduped.slice().sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
              const trimmed = sorted.slice(0, 150);
              setDoc(JP_DOC, { entries: trimmed }, { merge: true }).catch(console.warn);
              window._setJpEntries(trimmed);
            } else {
              // Self-heal Firestore if duplicate IDs were stored on the server
              if (deduped.length !== data.entries.length && window._adminUnlocked && window._adminUnlocked()) {
                setDoc(JP_DOC, { entries: deduped }, { merge: true }).catch(console.warn);
              }
              window._setJpEntries(deduped);
            }
            if (window._adminUnlocked && window._adminUnlocked()) {
              if (typeof window.elRenderView === "function") {
                window.elRenderView();
              } else if (typeof window.elRenderEntryLog === "function") {
                window.elRenderEntryLog();
              }
            }
          }
        });
        return _jackpotLiveUnsub;
      };

      // ── JUMBLED JACKPOT — round entry log (for admin Event Logs) ──
      window.saveJJEntries = async function (newEntry) {
        try {
          const isNewRoundSubmission = Boolean(
            newEntry &&
            newEntry.id &&
            (newEntry.playerName || newEntry.correctCount != null || Array.isArray(newEntry.requiredCards)) &&
            !newEntry.deletedIds
          );

          // If a new round entry is submitted, update or append atomically via transaction to guarantee zero duplicate IDs!
          if (isNewRoundSubmission) {
            // Dual-layer persistent RTDB backup for 100% zero-latency submission durability
            if (_presenceRdb && typeof rtdbSet === "function") {
              try {
                const entrySummary = {
                  id: newEntry.id,
                  playerName: newEntry.playerName || "Unknown",
                  townName: newEntry.townName || "",
                  playerId: newEntry.playerId || "",
                  score: newEntry.correctCount != null ? newEntry.correctCount : 0,
                  correctCount: newEntry.correctCount != null ? newEntry.correctCount : 0,
                  wrongCount: newEntry.wrongCount || 0,
                  streak: newEntry.streak || 0,
                  timeSecs: newEntry.timeSecs != null ? newEntry.timeSecs : 0,
                  mode: newEntry.mode || "normal",
                  requiredCards: newEntry.requiredCards || [],
                  requiredCardsCount: (newEntry.requiredCards || []).length,
                  answers: newEntry.answers || [],
                  status: newEntry.status || "new",
                  timestamp: newEntry.timestamp || new Date().toISOString(),
                };
                // 1. Permanent event submission node (persists even after room ends)
                rtdbSet(rtdbRef(_presenceRdb, `eventSubmissions/jj/${newEntry.id}`), entrySummary).catch(() => {});
                // 2. Room backup if room is active
                if (window.jjRoomId) {
                  rtdbSet(rtdbRef(_presenceRdb, `jjGames/${window.jjRoomId}/entries/${newEntry.id}`), entrySummary).catch(() => {});
                }
              } catch (e) {}
            }

            // Retry up to 5 times with randomized exponential backoff if Firestore transaction faces contention
            let retries = 5;
            let success = false;
            while (retries > 0 && !success) {
              try {
                await runTransaction(db, async (tx) => {
                  const snap = await tx.get(JJ_ENTRIES_DOC);
                  const serverEntries =
                    snap.exists() && Array.isArray(snap.data().entries)
                      ? snap.data().entries
                      : [];
                  const next = [];
                  const seen = new Set();
                  let replaced = false;
                  serverEntries.forEach((se) => {
                    if (!se || !se.id) return;
                    if (se.id === newEntry.id) {
                      next.push(newEntry);
                      seen.add(newEntry.id);
                      replaced = true;
                    } else if (!seen.has(se.id)) {
                      next.push(se);
                      seen.add(se.id);
                    }
                  });
                  if (!replaced && !seen.has(newEntry.id)) {
                    next.unshift(newEntry);
                  }
                  // Document size guard: keep at most 150 newest entries to guarantee staying well under 1 MiB
                  if (next.length > 150) {
                    next.sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
                    next.length = 150;
                  }
                  tx.set(JJ_ENTRIES_DOC, { entries: next });
                });
                success = true;
              } catch (txErr) {
                retries--;
                if (retries > 0) {
                  const delay = Math.floor(Math.random() * 400 + 200) * (6 - retries);
                  await new Promise((r) => setTimeout(r, delay));
                } else {
                  console.warn("Firestore saveJJEntries transaction retries exhausted, falling back to direct doc save:", txErr);
                  try {
                    await setDoc(doc(db, "da_event_submissions", newEntry.id), newEntry, { merge: true });
                  } catch (fbErr) {}
                }
              }
            }
            return;
          }

          // Admin modifying entries (marking reviewed, deleting rounds):
          const options = (newEntry && typeof newEntry === "object" && !isNewRoundSubmission) ? newEntry : {};
          const explicitlyDeletedIds = new Set(Array.isArray(options.deletedIds) ? options.deletedIds : []);

          // Sync explicitly deleted IDs to RTDB and local sets so all admins immediately blacklist them
          if (explicitlyDeletedIds.size > 0) {
            if (!window._deletedJackpotRoundIds) window._deletedJackpotRoundIds = new Set();
            if (!window._clearedJackpotRoundIds) window._clearedJackpotRoundIds = new Set();
            explicitlyDeletedIds.forEach((id) => {
              window._deletedJackpotRoundIds.add(id);
              window._clearedJackpotRoundIds.add(id);
              if (_presenceRdb && typeof rtdbSet === "function") {
                rtdbSet(rtdbRef(_presenceRdb, `eventDeletedRounds/jj/${id}`), Date.now()).catch(() => {});
              }
            });
            try {
              setDoc(doc(db, "da_hub", "deletedEventRounds"), {
                jjDeleted: Array.from(window._deletedJackpotRoundIds).slice(-200),
                updatedAt: new Date().toISOString()
              }, { merge: true }).catch(() => {});
            } catch (e) {}
          }

          // Admin modifying entries without newEntry: safely merge with server entries via transaction
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(JJ_ENTRIES_DOC);
            const serverEntries =
              snap.exists() && Array.isArray(snap.data().entries)
                ? snap.data().entries
                : [];
            const myLocalEntries = window._jjEntries ? window._jjEntries() : [];
            const deletedRounds = new Set([
              ...(window._deletedJackpotRoundIds ? Array.from(window._deletedJackpotRoundIds) : []),
              ...(window._clearedJackpotRoundIds ? Array.from(window._clearedJackpotRoundIds) : []),
              ...explicitlyDeletedIds,
            ]);

            const merged = [];
            const seen = new Set();
            myLocalEntries.forEach((me) => {
              if (me && me.id && !deletedRounds.has(me.id) && !seen.has(me.id)) {
                merged.push(me);
                seen.add(me.id);
              }
            });
            const knownLoadedIds = window._jjLoadedEntryIds || new Set();
            serverEntries.forEach((se) => {
              if (!se || !se.id) return;
              if (deletedRounds.has(se.id)) return;
              if (seen.has(se.id)) return;
              if (knownLoadedIds.has(se.id) && !options.preserveServerOnly) return;
              merged.push(se);
              seen.add(se.id);
            });
            // Document size guard: keep at most 150 newest entries to guarantee staying well under 1 MiB
            if (merged.length > 150) {
              merged.sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
              merged.length = 150;
            }
            tx.set(JJ_ENTRIES_DOC, { entries: merged });
          });
        } catch (e) {
          console.warn("Firebase write failed (jj entries):", e);
        }
      };

      window.loadJJEntries = async function () {
        try {
          // 1. Sync globally deleted rounds from RTDB so all admins share deletions
          if (_presenceRdb && typeof rtdbGet === "function") {
            try {
              const delSnap = await rtdbGet(rtdbRef(_presenceRdb, "eventDeletedRounds/jj"));
              if (delSnap.exists()) {
                const delObj = delSnap.val() || {};
                if (!window._deletedJackpotRoundIds) window._deletedJackpotRoundIds = new Set();
                if (!window._clearedJackpotRoundIds) window._clearedJackpotRoundIds = new Set();
                Object.keys(delObj).forEach((id) => {
                  window._deletedJackpotRoundIds.add(id);
                  window._clearedJackpotRoundIds.add(id);
                });
              }
            } catch (e) {}
          }

          // 2. Read from Firestore JJ_ENTRIES_DOC
          const snap = await getDoc(JJ_ENTRIES_DOC);
          let serverEntries = [];
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.entries)) {
              serverEntries = data.entries;
            }
          }

          // 3. Merge with any persistent submissions in RTDB from the last 24 hours
          let rtdbEntries = [];
          if (_presenceRdb && typeof rtdbGet === "function") {
            try {
              const subSnap = await rtdbGet(rtdbRef(_presenceRdb, "eventSubmissions/jj"));
              if (subSnap.exists()) {
                const subObj = subSnap.val() || {};
                rtdbEntries = Object.values(subObj).filter((e) => e && e.id).map((e) => ({
                  ...e,
                  correctCount: e.correctCount != null ? e.correctCount : (e.score != null ? e.score : 0),
                  wrongCount: e.wrongCount != null ? e.wrongCount : 0,
                  streak: e.streak != null ? e.streak : 0,
                  requiredCards: Array.isArray(e.requiredCards) ? e.requiredCards : [],
                  answers: Array.isArray(e.answers) ? e.answers : [],
                  totalCards: 10,
                }));
              }
            } catch (e) {}
          }

          const combined = deduplicateEntryArray([...serverEntries, ...rtdbEntries]);
          window._jjLoadedEntryIds = new Set(combined.map((e) => e && e.id).filter(Boolean));
          if (typeof window._setJjEntries === "function") {
            window._setJjEntries(combined);
          }
          window._jjEntriesLoaded = true;
        } catch (e) {
          console.warn("Firebase read failed (jj entries):", e);
        }
      };

      window.startLiveJJAdminListener = function () {
        if (_jjEntriesLiveUnsub) return _jjEntriesLiveUnsub;
        _jjEntriesLiveUnsub = onSnapshot(JJ_ENTRIES_DOC, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (Array.isArray(data.entries)) {
            const deduped = deduplicateEntryArray(data.entries);
            window._jjLoadedEntryIds = new Set(deduped.map((e) => e && e.id).filter(Boolean));
            window._jjEntriesLoaded = true;
            // Guard: ensure single-document size stays safely under 1 MiB limit (< 600 KB)
            if (deduped.length > 150 && window._adminUnlocked && window._adminUnlocked()) {
              const sorted = deduped.slice().sort((a, b) => (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0));
              const trimmed = sorted.slice(0, 150);
              setDoc(JJ_ENTRIES_DOC, { entries: trimmed }, { merge: true }).catch(console.warn);
              window._setJjEntries(trimmed);
            } else {
              // Self-heal Firestore if duplicate IDs were stored on the server
              if (deduped.length !== data.entries.length && window._adminUnlocked && window._adminUnlocked()) {
                setDoc(JJ_ENTRIES_DOC, { entries: deduped }, { merge: true }).catch(console.warn);
              }
              window._setJjEntries(deduped);
            }
            if (window._adminUnlocked && window._adminUnlocked()) {
              if (typeof window.elRenderView === "function") {
                window.elRenderView();
              } else if (typeof window.elRenderEntryLog === "function") {
                window.elRenderEntryLog();
              }
            }
          }
        });
        return _jjEntriesLiveUnsub;
      };

      // ── GLOBAL SPIN & WIN — synced cross-player jackpot counter ──
      // Doc shape: { count, cycleNumber, history:[{n,playerId,playerName,avatar,coins,isPaid,isJackpot,ts}], lastJackpotWinner }
      // Every spin (free or paid) across ALL DA members advances the same shared
      // counter. The spin that pushes count to 100 wins a +1000 coin bonus on top
      // of whatever the wheel itself landed on, then the cycle resets to 0/100 and
      // starts a fresh history log. lastJackpotWinner is NOT reset each cycle, so
      // the "last jackpot" banner keeps showing even after history clears.
      // Uses a Firestore transaction so simultaneous spins from different devices
      // can never double-count or double-award the same jackpot slot.
      // ── GLOBAL SPIN JACKPOT COUNTER (Realtime Database) ──────────
      // Tracks collective spins across all players toward the 100-spin jackpot.
      // Moved to RTDB to save 100% of Firestore reads and writes.
      // Sequential queue to guarantee rapid consecutive spins from the same client never collide or abort
      let _globalSpinQueue = Promise.resolve();

      window.recordGlobalSpin = function (entry) {
        // 1. Optimistic UI update: immediately add spin to local history so player sees it without delay
        try {
          if (window._lastGlobalSpinData && typeof window._renderGlobalSpinUI === "function") {
            const data = window._lastGlobalSpinData;
            const curCount = typeof data.count === "number" ? data.count : 0;
            const earned = typeof entry.coins === "number" ? entry.coins : 0;
            const qualifiesForJackpot = earned >= 250;
            const isEligible = entry.eligibleForJackpot !== false;
            let nextCount;
            let isJackpot = false;

            if (curCount >= 99) {
              if (qualifiesForJackpot && isEligible) {
                isJackpot = true;
                nextCount = 100;
              } else {
                isJackpot = false;
                nextCount = Math.min(100, curCount + 1);
              }
            } else {
              isJackpot = false;
              nextCount = curCount + 1;
            }

            const optHist = Array.isArray(data.history) ? data.history.slice() : [];
            optHist.push({
              n: nextCount,
              playerId: entry.playerId || "",
              playerName: entry.playerName || "A DA Member",
              avatar: entry.avatar || "🧙",
              photoURL: entry.photoURL || "",
              coins: entry.coins || 0,
              rewardType: entry.rewardType || "",
              isPaid: !!entry.isPaid,
              isJackpot: isJackpot,
              ts: entry.ts || Date.now(),
            });
            const optData = {
              ...data,
              count: isJackpot ? 0 : nextCount,
              history: isJackpot ? [] : optHist.slice(-100)
            };
            if (isJackpot) {
              const winnerInfo = {
                playerId: entry.playerId || "",
                playerName: entry.playerName || "A DA Member",
                avatar: entry.avatar || "🧙",
                photoURL: entry.photoURL || "",
                ts: entry.ts || Date.now(),
                todayKey: entry.todayKey || (typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10)),
                cycleNumber: typeof data.cycleNumber === "number" ? data.cycleNumber : 1
              };
              optData.lastJackpotWinner = winnerInfo;
              const recent =
                data.recentJackpotWinners && typeof data.recentJackpotWinners === "object"
                  ? { ...data.recentJackpotWinners }
                  : {};
              recent["cycle_" + winnerInfo.cycleNumber] = winnerInfo;
              optData.recentJackpotWinners = recent;
            }
            window._renderGlobalSpinUI(optData, true);
          }
        } catch (e) {}

        // 2. Chained transaction with auto-retries
        _globalSpinQueue = _globalSpinQueue.then(async () => {
          if (!_presenceRdb) return { isJackpot: false, spinNumber: null };
          const spinRef = rtdbRef(_presenceRdb, "globalSpin");

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              let isJackpot = false;
              let count = 1;
              let winningCycleNumber = null;
              const txResult = await rtdbTransaction(spinRef, (data) => {
                data = data || {};
                const prevCount = typeof data.count === "number" ? data.count : 0;
                const cycleNumber = typeof data.cycleNumber === "number" ? data.cycleNumber : 1;
                let history = [];
                if (Array.isArray(data.history)) {
                  history = data.history.filter(Boolean);
                } else if (data.history && typeof data.history === "object") {
                  history = Object.values(data.history).filter(Boolean);
                }

                const earned = typeof entry.coins === "number" ? entry.coins : 0;
                const qualifiesForJackpot = earned >= 250;
                const isPlayerEligible = entry.eligibleForJackpot !== false;
                if (prevCount >= 99) {
                  if (qualifiesForJackpot && isPlayerEligible) {
                    count = 100;
                    isJackpot = true;
                    winningCycleNumber = cycleNumber;
                  } else {
                    count = Math.min(100, prevCount + 1);
                    isJackpot = false;
                    winningCycleNumber = null;
                  }
                } else {
                  count = prevCount + 1;
                  isJackpot = false;
                  winningCycleNumber = null;
                }

                const histEntry = {
                  n: count,
                  playerId: entry.playerId || "",
                  playerName: entry.playerName || "A DA Member",
                  avatar: entry.avatar || "🧙",
                  photoURL: entry.photoURL || "",
                  coins: entry.coins || 0,
                  rewardType: entry.rewardType || "",
                  isPaid: !!entry.isPaid,
                  isJackpot: isJackpot,
                  ts: entry.ts || Date.now(),
                };
                history.push(histEntry);
                if (history.length > 100)
                  history = history.slice(history.length - 100);

                const next = {
                  count: isJackpot ? 0 : count,
                  cycleNumber: isJackpot ? cycleNumber + 1 : cycleNumber,
                  history: isJackpot ? [] : history,
                };
                if (isJackpot) {
                  const winnerInfo = {
                    playerId: entry.playerId || "",
                    playerName: entry.playerName || "A DA Member",
                    avatar: entry.avatar || "🧙",
                    photoURL: entry.photoURL || "",
                    ts: entry.ts || Date.now(),
                    todayKey: entry.todayKey || (typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10)),
                    cycleNumber: cycleNumber,
                  };
                  next.lastJackpotWinner = winnerInfo;
                  const recent =
                    data.recentJackpotWinners &&
                    typeof data.recentJackpotWinners === "object"
                      ? { ...data.recentJackpotWinners }
                      : {};
                  recent["cycle_" + cycleNumber] = winnerInfo;
                  const recentKeys = Object.keys(recent);
                  if (recentKeys.length > 50) {
                    recentKeys.sort(function (a, b) {
                      return (Number(recent[a] && recent[a].ts) || 0) - (Number(recent[b] && recent[b].ts) || 0);
                    });
                    while (recentKeys.length > 50) {
                      const oldestKey = recentKeys.shift();
                      delete recent[oldestKey];
                    }
                  }
                  next.recentJackpotWinners = recent;
                } else {
                  if (data.lastJackpotWinner)
                    next.lastJackpotWinner = data.lastJackpotWinner;
                  if (data.recentJackpotWinners)
                    next.recentJackpotWinners = data.recentJackpotWinners;
                }
                return next;
              });

              if (txResult && txResult.committed) {
                const snapVal = txResult.snapshot ? txResult.snapshot.val() : null;
                const snapWinner = snapVal && snapVal.lastJackpotWinner;
                const iWonJackpot = isJackpot || (snapWinner && snapWinner.playerId === entry.playerId && snapWinner.cycleNumber === winningCycleNumber);
                return {
                  isJackpot: iWonJackpot,
                  spinNumber: iWonJackpot ? 100 : count,
                  cycleNumber: iWonJackpot ? (winningCycleNumber || (snapWinner && snapWinner.cycleNumber) || (snapVal && typeof snapVal.cycleNumber === "number" ? snapVal.cycleNumber - 1 : null)) : null,
                };
              }
            } catch (e) {
              console.warn(`RTDB global spin transaction attempt ${attempt} failed:`, e);
            }
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 300));
            }
          }
          return { isJackpot: false, spinNumber: null, cycleNumber: null };
        }).catch((err) => {
          console.warn("RTDB global spin queue error:", err);
          return { isJackpot: false, spinNumber: null, cycleNumber: null };
        });

        return _globalSpinQueue;
      };

      let _globalSpinUnsub = null;
      window.startGlobalSpinListener = function () {
        if (typeof window.warmUpPlayerPhotos === "function") window.warmUpPlayerPhotos();
        if (_globalSpinUnsub) return _globalSpinUnsub;
        if (!_presenceRdb) return;
        const spinRef = rtdbRef(_presenceRdb, "globalSpin");
        _globalSpinUnsub = rtdbOnValue(spinRef, (snap) => {
          if (!snap.exists()) return;
          window._renderGlobalSpinUI && window._renderGlobalSpinUI(snap.val());
        });
        return _globalSpinUnsub;
      };
      window.stopGlobalSpinListener = function () {
        if (_globalSpinUnsub) {
          try { _globalSpinUnsub(); } catch (e) {}
          _globalSpinUnsub = null;
        }
      };

      // ═══════════════════════════════════════════════════════════
      // PATTERN RECALL GLOBAL JACKPOT & PLAY HISTORY (RTDB)
      // ═══════════════════════════════════════════════════════════
      let _globalPatternQueue = Promise.resolve();

      window.recordGlobalPatternPlay = function (entry) {
        // 1. Optimistic UI update: immediately add play to local history so player sees it without delay
        try {
          if (typeof window._renderGlobalPatternUI === "function") {
            const data = window._lastGlobalPatternData || { count: 0, cycleNumber: 1, history: [], lastJackpotWinner: null };
            const curCount = typeof data.count === "number" ? data.count : 0;
            const qualifiesForJackpot = !!entry.clearedLvl9;
            const isEligible = entry.eligibleForJackpot !== false;
            let nextCount;
            let isJackpot = false;

            if (curCount >= 99) {
              if (qualifiesForJackpot && isEligible) {
                isJackpot = true;
                nextCount = 100;
              } else {
                isJackpot = false;
                nextCount = Math.min(100, curCount + 1);
              }
            } else {
              isJackpot = false;
              nextCount = curCount + 1;
            }

            let optHist = [];
            if (Array.isArray(data.history)) {
              optHist = data.history.slice();
            } else if (data.history && typeof data.history === "object") {
              optHist = Object.values(data.history).filter(Boolean);
            }
            const histItem = {
              n: nextCount,
              playerId: entry.playerId || "",
              playerName: entry.playerName || "A DA Member",
              avatar: entry.avatar || "🧙",
              photoURL: entry.photoURL || "",
              coins: entry.coins || 0,
              level: entry.level || 1,
              clearedLvl9: !!entry.clearedLvl9,
              resultType: entry.resultType || "",
              isJackpot: isJackpot,
              ts: entry.ts || Date.now(),
            };
            optHist.push(histItem);
            const optData = {
              ...data,
              count: isJackpot ? 0 : nextCount,
              history: isJackpot ? [histItem] : optHist.slice(-100)
            };
            if (isJackpot) {
              optData.lastJackpotWinner = {
                playerId: entry.playerId || "",
                playerName: entry.playerName || "A DA Member",
                avatar: entry.avatar || "🧙",
                photoURL: entry.photoURL || "",
                ts: entry.ts || Date.now(),
                todayKey: entry.todayKey || (typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10)),
                cycleNumber: typeof data.cycleNumber === "number" ? data.cycleNumber : 1,
                levelCleared: 9
              };
            }
            window._renderGlobalPatternUI(optData, true);
          }
        } catch (e) {}

        // 2. Chained transaction with auto-retries on RTDB
        _globalPatternQueue = _globalPatternQueue.then(async () => {
          if (!_presenceRdb) return { isJackpot: false, playNumber: null, cycleNumber: null };
          const patternRef = rtdbRef(_presenceRdb, "globalPatternRecall");

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              let isJackpot = false;
              let count = 1;
              let winningCycleNumber = null;
              const txResult = await rtdbTransaction(patternRef, (data) => {
                data = data || {};
                const prevCount = typeof data.count === "number" ? data.count : 0;
                const cycleNumber = typeof data.cycleNumber === "number" ? data.cycleNumber : 1;
                let history = [];
                if (Array.isArray(data.history)) {
                  history = data.history.filter(Boolean);
                } else if (data.history && typeof data.history === "object") {
                  history = Object.values(data.history).filter(Boolean);
                }

                const qualifiesForJackpot = !!entry.clearedLvl9;
                const isPlayerEligible = entry.eligibleForJackpot !== false;
                if (prevCount >= 99) {
                  if (qualifiesForJackpot && isPlayerEligible) {
                    count = 100;
                    isJackpot = true;
                    winningCycleNumber = cycleNumber;
                  } else {
                    count = Math.min(100, prevCount + 1);
                    isJackpot = false;
                    winningCycleNumber = null;
                  }
                } else {
                  count = prevCount + 1;
                  isJackpot = false;
                  winningCycleNumber = null;
                }

                const histEntry = {
                  n: count,
                  playerId: entry.playerId || "",
                  playerName: entry.playerName || "A DA Member",
                  avatar: entry.avatar || "🧙",
                  photoURL: entry.photoURL || "",
                  coins: entry.coins || 0,
                  level: entry.level || 1,
                  clearedLvl9: !!entry.clearedLvl9,
                  resultType: entry.resultType || "",
                  isJackpot: isJackpot,
                  ts: entry.ts || Date.now(),
                };
                history.push(histEntry);
                if (history.length > 100)
                  history = history.slice(history.length - 100);

                const next = {
                  count: isJackpot ? 0 : count,
                  cycleNumber: isJackpot ? cycleNumber + 1 : cycleNumber,
                  history: isJackpot ? [histEntry] : history,
                };
                if (isJackpot) {
                  const winnerInfo = {
                    playerId: entry.playerId || "",
                    playerName: entry.playerName || "A DA Member",
                    avatar: entry.avatar || "🧙",
                    photoURL: entry.photoURL || "",
                    ts: entry.ts || Date.now(),
                    todayKey: entry.todayKey || (typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10)),
                    cycleNumber: cycleNumber,
                    levelCleared: 9
                  };
                  next.lastJackpotWinner = winnerInfo;
                  const recent =
                    data.recentJackpotWinners &&
                    typeof data.recentJackpotWinners === "object"
                      ? { ...data.recentJackpotWinners }
                      : {};
                  recent["cycle_" + cycleNumber] = winnerInfo;
                  const recentKeys = Object.keys(recent);
                  if (recentKeys.length > 50) {
                    recentKeys.sort(function (a, b) {
                      return (Number(recent[a] && recent[a].ts) || 0) - (Number(recent[b] && recent[b].ts) || 0);
                    });
                    while (recentKeys.length > 50) {
                      const oldestKey = recentKeys.shift();
                      delete recent[oldestKey];
                    }
                  }
                  next.recentJackpotWinners = recent;
                } else {
                  if (data.lastJackpotWinner)
                    next.lastJackpotWinner = data.lastJackpotWinner;
                  if (data.recentJackpotWinners)
                    next.recentJackpotWinners = data.recentJackpotWinners;
                }
                return next;
              });

              if (txResult && txResult.committed) {
                const snapVal = txResult.snapshot ? txResult.snapshot.val() : null;
                const snapWinner = snapVal && snapVal.lastJackpotWinner;
                const iWonJackpot = isJackpot || (snapWinner && snapWinner.playerId === entry.playerId && snapWinner.cycleNumber === winningCycleNumber);
                return {
                  isJackpot: iWonJackpot,
                  playNumber: iWonJackpot ? 100 : count,
                  cycleNumber: iWonJackpot ? (winningCycleNumber || (snapWinner && snapWinner.cycleNumber) || (snapVal && typeof snapVal.cycleNumber === "number" ? snapVal.cycleNumber - 1 : null)) : null,
                };
              }
            } catch (e) {
              console.warn(`RTDB global pattern play transaction attempt ${attempt} failed:`, e);
            }
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 300));
            }
          }
          return { isJackpot: false, playNumber: null, cycleNumber: null };
        }).catch((err) => {
          console.warn("RTDB global pattern queue error:", err);
          return { isJackpot: false, playNumber: null, cycleNumber: null };
        });

        return _globalPatternQueue;
      };

      let _globalPatternUnsub = null;
      window.startGlobalPatternListener = function () {
        if (typeof window.warmUpPlayerPhotos === "function") window.warmUpPlayerPhotos();
        if (_globalPatternUnsub) return _globalPatternUnsub;
        if (!_presenceRdb) return;
        const patternRef = rtdbRef(_presenceRdb, "globalPatternRecall");
        _globalPatternUnsub = rtdbOnValue(
          patternRef,
          (snap) => {
            const val = snap.exists() ? snap.val() : { count: 0, history: [], lastJackpotWinner: null, cycleNumber: 1 };
            if (typeof window._renderGlobalPatternUI === "function") {
              window._renderGlobalPatternUI(val);
            }
          },
          (err) => {
            console.warn("[PatternRecall] RTDB listener error:", err);
          }
        );
        return _globalPatternUnsub;
      };
      window.stopGlobalPatternListener = function () {
        if (_globalPatternUnsub) {
          try { _globalPatternUnsub(); } catch (e) {}
          _globalPatternUnsub = null;
        }
      };

      // ── LIVE USER DOC LISTENER — catches real-time coin grants ──
      // Watches the current player's own Firestore doc for pendingGrant > 0.
      // This fires the coin grant modal even when the player is already logged in
      // (e.g. admin grants from Player Stats while the player has the app open).
      window.startLiveUserDocListener = function () {
        if (!userDoc()) return null;
        if (_userDocLiveUnsub) return _userDocLiveUnsub;
        _userDocLiveUnsub = onSnapshot(userDoc(), async (snap) => {
            if (!snap.exists()) return;
            // Fix 3: skip snapshots triggered by local write optimistic updates
            if (snap.metadata && snap.metadata.hasPendingWrites) return;
            const d = snap.data();

            // ── ACCOUNT FREEZE STATUS CHECK (Real-time) ──
            if (d.frozen === true) {
              window._accountFrozen = true;
              window._freezeData = {
                frozen: true,
                frozenBy: d.frozenBy || "Admin",
                frozenByPhoto: d.frozenByPhoto || "",
                frozenByAvatar: d.frozenByAvatar || "🧙",
                frozenByPid: d.frozenByPid || "",
                frozenAt: d.frozenAt || "",
                frozenReason: d.frozenReason || d.reason || "Account under administrative review",
              };
              if (typeof window.showFreezeModal === "function") {
                window.showFreezeModal(window._freezeData);
              }
            } else if (window._accountFrozen) {
              window._accountFrozen = false;
              window._freezeData = null;
              if (typeof window.hideFreezeModal === "function") {
                window.hideFreezeModal();
                if (typeof showToast === "function") {
                  showToast("☀️ Your account has been unfrozen by admin!");
                }
              }
            }

            // Fix 3: skip self-echo snapshots after our own saveProgress(), UNLESS an admin action is pending
            const hasAdminAction =
              d.frozen === true ||
              (window._accountFrozen && !d.frozen) ||
              (typeof d.pendingGrant === "number" && d.pendingGrant > 0) ||
              (typeof d.pendingDeduct === "number" && d.pendingDeduct > 0) ||
              d.pendingReset === true ||
              d.pendingAuraReset === true ||
              (typeof d.pendingAuraGrant === "number" && d.pendingAuraGrant > 0) ||
              (typeof d.pendingAuraDeduct === "number" && d.pendingAuraDeduct > 0) ||
              (d.pendingCardRemoval && d.pendingCardRemoval.token) ||
              (d.pendingCardRestore && d.pendingCardRestore.token) ||
              (d.pendingShopRemoval && d.pendingShopRemoval.token) ||
              (d.pendingShopRestore && d.pendingShopRestore.token);
            if (!hasAdminAction && Date.now() - _lastOwnWriteTs < 2500) return;
            if (Array.isArray(d.coinHistory) && window._setCoinHistory) {
              window._setCoinHistory(d.coinHistory);
            }
            // Multi-tab / multi-device coin sync (FINDING-CONCUR-01):
            // When an external write updates coins, reconcile in-memory balance if we don't have an in-flight or uncommitted local write
            if (
              typeof d.coins === "number" &&
              !hasAdminAction &&
              Date.now() - _lastOwnWriteTs >= 2500 &&
              !_saveProgressTimeout &&
              !_isSaveInProgress
            ) {
              const myPid = window._currentPlayerId || (typeof _currentPlayerId !== "undefined" ? _currentPlayerId : "");
              const hasLocalUncommitted = myPid && localStorage.getItem("da_uncommitted_tx_" + myPid);
              if (!hasLocalUncommitted) {
                const curLocalCoins = typeof window._getCoins === "function" ? window._getCoins() : null;
                if (curLocalCoins !== null && curLocalCoins !== d.coins) {
                  window._setCoins(d.coins);
                  if (Array.isArray(d.coinHistory) && window._setCoinHistory) {
                    window._setCoinHistory(d.coinHistory);
                  }
                  if (typeof d.cardsWon === "number" && window._setCardsWon) {
                    window._setCardsWon(d.cardsWon);
                  }
                  if (d.ownedCards && typeof d.ownedCards === "object" && window._setOwnedCards) {
                    window._setOwnedCards(d.ownedCards);
                  }
                  if (d.ownedShopItems && typeof d.ownedShopItems === "object" && window._setOwnedShopItems) {
                    window._setOwnedShopItems(d.ownedShopItems);
                  }
                  if (typeof window.updateHUD === "function") window.updateHUD();
                  if (typeof window.updateCollStats === "function") window.updateCollStats();
                  _lastCommittedProtectedHash = _calculateProtectedHash(
                    d.coins,
                    Array.isArray(d.coinHistory) ? d.coinHistory : (window._getCoinHistory ? window._getCoinHistory() : []),
                    d.cardsWon,
                    d.ownedCards,
                    d.ownedShopItems,
                    d.dailyCooldowns,
                    d.claimedRefundReqIds
                  );
                }
              }
            }
            if (typeof d.aura === "number") window.aura = d.aura;
            if (typeof d.cardsSent === "number") window.cardsSent = d.cardsSent;
            if (d.isAdmin === true && typeof profile === "object" && profile) {
              profile.isAdmin = true;
            }
            if (d.pendingAuraReset === true) {
              window.aura = 0;
              window.cardsSent = 0;
              if (typeof profile === "object" && profile) {
                profile.aura = 0;
                profile.cardsSent = 0;
              }
              try {
                await updateDoc(userDoc(), { pendingAuraReset: false });
              } catch (e) {}
            }
            if (typeof d.pendingGrant === "number" && d.pendingGrant > 0) {
              // Cancel any pending debounced saveProgress so it doesn't overwrite Firestore with old coins!
              if (_saveProgressTimeout) {
                clearTimeout(_saveProgressTimeout);
                _saveProgressTimeout = null;
              }
              const amount = d.pendingGrant;
              const note = d.pendingGrantNote || "";
              const sender = d.pendingGrantSender || "";
              // 1. Immediately update local coin state to match Firestore (coins already credited in doc)
              if (typeof d.coins === "number") {
                window._setCoins(d.coins);
              }
              if (Array.isArray(d.coinHistory) && window._setCoinHistory) {
                window._setCoinHistory(d.coinHistory);
              }
              if (typeof window.updateHUD === "function") {
                window.updateHUD();
              }
              _lastCommittedProtectedHash = _calculateProtectedHash(
                typeof d.coins === "number" ? d.coins : (window._getCoins ? window._getCoins() : 0),
                Array.isArray(d.coinHistory) ? d.coinHistory : (window._getCoinHistory ? window._getCoinHistory() : []),
                d.cardsWon,
                d.ownedCards,
                d.ownedShopItems,
                d.dailyCooldowns,
                d.claimedRefundReqIds
              );
              // 2. Clear pendingGrant in Firestore so it only fires once
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingGrant: 0,
                    pendingGrantNote: "",
                    pendingGrantSender: "",
                    pendingGrantSenderPid: "",
                  });
                }
              } catch (e) {}
              // 3. Show the modal (it displays the popup and plays the sound)
              if (typeof window.showCoinGrantModalLive === "function") {
                window.showCoinGrantModalLive(amount, note, sender);
              }
            }
            // ── Coins deducted live by admin (player is online) ──
            if (typeof d.pendingDeduct === "number" && d.pendingDeduct > 0) {
              if (_saveProgressTimeout) {
                clearTimeout(_saveProgressTimeout);
                _saveProgressTimeout = null;
              }
              const amt = d.pendingDeduct;
              const sender = d.pendingDeductSender || "";
              // Firestore coins are authoritative — sync local state immediately
              if (typeof d.coins === "number") window._setCoins(d.coins);
              if (typeof window.updateHUD === "function") window.updateHUD();
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingDeduct: 0,
                    pendingDeductSender: "",
                  });
                }
              } catch (e) {}
              if (!Array.isArray(d.coinHistory) && typeof window.logCoinTx === "function") {
                window.logCoinTx(-amt, sender ? `⚠️ Deducted by ${sender}` : "⚠️ Deducted by your DA leader", true);
              }
              if (typeof window.showCoinDeductModal === "function") {
                window.showCoinDeductModal(amt, sender);
              }
            }
            // ── Full progress reset live by the DA leader (player is online) ──
            if (d.pendingReset === true) {
              try {
                if (userDoc()) await updateDoc(userDoc(), { pendingReset: false });
              } catch (e) {}
              // Firestore is authoritative after a reset — pull the wiped state locally
              window._setCoins(typeof d.coins === "number" ? d.coins : 0);
              if (window._setCardsWon)
                window._setCardsWon(
                  typeof d.cardsWon === "number" ? d.cardsWon : 0,
                );
              if (window._setOwnedCards)
                window._setOwnedCards(
                  d.ownedCards && typeof d.ownedCards === "object"
                    ? d.ownedCards
                    : {},
                );
              if (window._setOwnedShopItems)
                window._setOwnedShopItems(
                  d.ownedShopItems && typeof d.ownedShopItems === "object"
                    ? d.ownedShopItems
                    : {},
                );
              window.updateHUD && window.updateHUD();
              window.updateCollStats && window.updateCollStats();
              if (
                document.getElementById("panel-coll") &&
                document
                  .getElementById("panel-coll")
                  .classList.contains("active") &&
                window.openCollection
              )
                window.openCollection();
              window.showProgressResetModal && window.showProgressResetModal();
            }
            // ── Aura granted live by admin (player is online) ──
            if (
              typeof d.pendingAuraGrant === "number" &&
              d.pendingAuraGrant > 0
            ) {
              const amount = d.pendingAuraGrant;
              const note = d.pendingAuraGrantNote || "";
              const sender = d.pendingAuraGrantSender || "";
              if (typeof d.aura === "number") {
                window.aura = d.aura;
                if (window.profile) window.profile.aura = d.aura;
                if (typeof window.updateHUD === "function") window.updateHUD();
              }
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingAuraGrant: 0,
                    pendingAuraGrantNote: "",
                    pendingAuraGrantSender: "",
                    pendingAuraGrantSenderPid: "",
                  });
                }
              } catch (e) {}
              if (typeof window.showAuraGrantModal === "function") {
                window.showAuraGrantModal(amount, note, sender);
              }
            }
            // ── Aura deducted live by admin (player is online) ──
            if (
              typeof d.pendingAuraDeduct === "number" &&
              d.pendingAuraDeduct > 0
            ) {
              const amt = d.pendingAuraDeduct;
              const sender = d.pendingAuraDeductSender || "";
              if (typeof d.aura === "number") {
                window.aura = d.aura;
                if (window.profile) window.profile.aura = d.aura;
                if (typeof window.updateHUD === "function") window.updateHUD();
              }
              try {
                if (userDoc()) {
                  await updateDoc(userDoc(), {
                    pendingAuraDeduct: 0,
                    pendingAuraDeductSender: "",
                  });
                }
              } catch (e) {}
              if (typeof window.showAuraDeductModal === "function") {
                window.showAuraDeductModal(amt, sender);
              }
            }
            // ── Fulfilled card request — a card/duplicate was removed by the admin ──
            if (d.pendingCardRemoval && d.pendingCardRemoval.token) {
              const info = d.pendingCardRemoval;
              // Clear immediately so it only fires once
              try {
                await updateDoc(userDoc(), { pendingCardRemoval: null });
              } catch (e) {}
              // Firestore's ownedCards is now authoritative — sync local state to match
              if (d.ownedCards && typeof d.ownedCards === "object") {
                window._setOwnedCards(d.ownedCards);
                _lastCommittedProtectedHash = _calculateProtectedHash(
                  d.coins,
                  Array.isArray(d.coinHistory) ? d.coinHistory : (window._getCoinHistory ? window._getCoinHistory() : []),
                  d.cardsWon,
                  d.ownedCards,
                  d.ownedShopItems,
                  d.dailyCooldowns,
                  d.claimedRefundReqIds
                );
              }
              if (typeof window.showCardRemovedModalLive === "function") {
                window.showCardRemovedModalLive(
                  info.setIdx,
                  info.cardIdx,
                  info.result,
                );
              } else {
                if (typeof window.updateHUD === "function") window.updateHUD();
                if (typeof window.updateCollStats === "function") window.updateCollStats();
                if (typeof window.renderCollTabs === "function") window.renderCollTabs();
                if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              }
            }
            // ── Card granted live by admin (player is online) ──
            if (d.pendingCardGrant && d.pendingCardGrant.token) {
              const info = d.pendingCardGrant;
              try {
                await updateDoc(userDoc(), { pendingCardGrant: null });
              } catch (e) {}
              if (d.ownedCards && typeof d.ownedCards === "object" && window._setOwnedCards) {
                window._setOwnedCards(d.ownedCards);
              }
              if (typeof d.cardsWon === "number" && window._setCardsWon) {
                window._setCardsWon(d.cardsWon);
              }
              window.updateHUD && window.updateHUD();
              window.updateCollStats && window.updateCollStats();
              if (typeof window.renderCollGrid === "function") window.renderCollGrid();
              if (typeof window.showCardGrantModalLive === "function") {
                window.showCardGrantModalLive(info);
              }
            }
            // ── Fulfilled shop request — a booked slot (e.g. Bloom and Buzz) was
            //    marked "Given" by the admin, so its count went down by 1 ──
            if (d.pendingShopItemRemoval && d.pendingShopItemRemoval.token) {
              try {
                await updateDoc(userDoc(), { pendingShopItemRemoval: null });
              } catch (e) {}
              // Firestore's ownedShopItems is now authoritative — sync local state
              if (
                d.ownedShopItems &&
                typeof d.ownedShopItems === "object" &&
                window._setOwnedShopItems
              )
                window._setOwnedShopItems(d.ownedShopItems);
              window.updateHUD && window.updateHUD();
              if (
                document.getElementById("panel-coll") &&
                document
                  .getElementById("panel-coll")
                  .classList.contains("active") &&
                typeof renderShopGrid === "function"
              )
                renderShopGrid();
            }
            // ── Shop pricing reset live by admin (player is online) — prices for
            //    every item drop back to their base tier immediately ──
            if (d.pendingShopPriceReset && d.pendingShopPriceReset.token) {
              try {
                await updateDoc(userDoc(), { pendingShopPriceReset: null });
              } catch (e) {}
              if (
                d.ownedShopItems &&
                typeof d.ownedShopItems === "object" &&
                window._setOwnedShopItems
              )
                window._setOwnedShopItems(d.ownedShopItems);
              if (
                document.getElementById("panel-coll") &&
                document
                  .getElementById("panel-coll")
                  .classList.contains("active") &&
                typeof renderShopGrid === "function"
              )
                renderShopGrid();
              showToast &&
                showToast("🔄 Shop prices were reset by your DA leader!");
            }
            // ── Live profile sync (syncs custom photo & avatar across tabs or admin edits) ──
            if (d.profile && typeof d.profile === "object" && window._setProfile) {
              window._setProfile(d.profile);
              if (window.applyProfileToHUD) window.applyProfileToHUD();
              if (window.updateProfilePhotoUI) window.updateProfilePhotoUI();
            }
          });
          return _trackUnsub(_userDocLiveUnsub);
        };
      window.stopLiveUserDocListener = function () {
        if (_userDocLiveUnsub) {
          try { _userDocLiveUnsub(); } catch (e) {}
          _userDocLiveUnsub = null;
        }
      };

      // ── EVENT CONTROLS — shared across all players ────────────
      window.saveEventControls = async function () {
        try {
          const ctrl = window._ecControls ? window._ecControls() : {};
          try {
            localStorage.setItem("da_ec_controls", JSON.stringify(ctrl));
          } catch (e) {}
          await setDoc(EC_DOC, { controls: ctrl });
        } catch (e) {
          console.warn("Firebase write failed (eventControls):", e);
        }
      };

      window.loadEventControls = async function () {
        try {
          const snap = await getDoc(EC_DOC);
          if (snap.exists()) {
            const data = snap.data();
            if (data.controls && typeof data.controls === "object")
              window._setEcControls(data.controls);
          }
        } catch (e) {
          console.warn("Firebase read failed (eventControls):", e);
        }
      };

      window.startLiveEventControlsListener = function () {
        if (_eventControlsLiveUnsub) return _eventControlsLiveUnsub;
        _eventControlsLiveUnsub = onSnapshot(EC_DOC, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.controls && typeof data.controls === "object") {
            window._setEcControls(data.controls);
            window.applyEventControls && window.applyEventControls();
          }
        });
        return _trackUnsub(_eventControlsLiveUnsub);
      };
      window.stopLiveEventControlsListener = function () {
        if (_eventControlsLiveUnsub) {
          try { _eventControlsLiveUnsub(); } catch (e) {}
          _eventControlsLiveUnsub = null;
        }
      };

      // ══ ROLLING 24-HOUR LEADERBOARD — Firestore ═════════════════
      // Documents stored at: da_hub/{lb_<game> | lbpending_<game>}  (ONE doc per
      // game — no longer split by calendar date). Each entry carries its own
      // timestamp and is filtered out once it has been visible for 24 hours.
      //
      // NOTE: this used to be bucketed by calendar date (YYYY-MM-DD, in UTC),
      // which caused two bugs: (1) a score submitted late at night could land in
      // a different UTC "day" than the admin expected, making it invisible in
      // the Event Entries panel until the admin realised the date had rolled
      // over; and (2) leaderboards reset at a fixed UTC midnight rather than
      // 24 hours after each entry was actually listed. Using a single persistent
      // doc per game + per-entry timestamps fixes both: nothing is ever hidden
      // behind a "wrong day" bucket, and expiry is a rolling 24h window.
      // game: 'jj' (Jumbled Jackpot) | 'jp' (Jackpot Event)
      // Each doc has: { entries: [ {playerId, name, avatar, score, timeSecs, submittedAt, approvedAt} ] }

      const LB_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24-hour visibility window

      function _lbDocRef(game) {
        // Store inside da_hub collection so existing Firestore rules permit read/write
        // This is the PUBLIC / APPROVED leaderboard — only entries the DA leader has
        // approved in the admin panel ever land here, so this is what players see.
        return doc(db, "da_hub", "lb_" + game);
      }
      function _lbPendingDocRef(game) {
        // Every submitted score lands here first, awaiting admin approval.
        return doc(db, "da_hub", "lbpending_" + game);
      }

      // An entry counts as "still listed" if less than 24h have passed since it
      // was placed on the leaderboard. approvedAt is when it became publicly
      // visible; fall back to submittedAt for entries that predate this field.
      function _lbIsFresh(entry) {
        const t = Date.parse(entry.approvedAt || entry.submittedAt || 0);
        if (!t) return true; // no timestamp at all — don't accidentally hide it
        return Date.now() - t < LB_WINDOW_MS;
      }

      // Submit / upsert a score entry for the current player — goes to the PENDING
      // queue only. It will not appear on anyone's leaderboard until a DA leader
      // approves it from the admin panel's Event Logs view.
      window.__mod_lbSubmitScore = true;
      window.lbSubmitScore = async function (game, scoreData) {
        // scoreData: { name, avatar, photoURL, score, timeSecs }
        const pid = _currentPlayerId || window._currentPlayerId;
        if (!pid) {
          console.warn("lbSubmitScore: no player ID");
          return;
        }
        try {
          const ref = _lbPendingDocRef(game);
          const snap = await getDoc(ref);
          let entries = snap.exists() ? snap.data().entries || [] : [];

          // Replace or insert current player's pending entry — keep best score only
          const idx = entries.findIndex((e) => e.playerId === pid);
          const newEntry = {
            playerId: pid,
            name: scoreData.name || "Unknown",
            avatar: scoreData.avatar || "🧙",
            photoURL:
              scoreData.photoURL &&
              (/^https?:\/\//i.test(scoreData.photoURL) ||
                /^data:image\//i.test(scoreData.photoURL))
                ? scoreData.photoURL
                : "",
            score: scoreData.score || 0,
            timeSecs: scoreData.timeSecs || 0,
            approved: false,
            submittedAt: new Date().toISOString(),
          };
          if (idx !== -1) {
            const old = entries[idx];
            const isBetter =
              newEntry.score > old.score ||
              (newEntry.score === old.score &&
                newEntry.timeSecs < old.timeSecs);
            if (isBetter) {
              // A better score resets approval — the leader should sign off again.
              entries[idx] = newEntry;
            }
          } else {
            entries.push(newEntry);
          }
          await setDoc(ref, { entries }, { merge: false });
        } catch (e) {
          console.error("lbSubmitScore failed:", game, e);
        }
      };

      // ── ADMIN: leaderboard approval ─────────────────────────────
      // Load the full pending queue for a game (unsorted-ish; newest submissions
      // last). This is never date-scoped, so a submission made overnight is
      // always visible here regardless of when the admin checks.
      window.__mod_lbLoadPending = true;
      window.lbLoadPending = async function (game) {
        try {
          const ref = _lbPendingDocRef(game);
          const snap = await getDoc(ref);
          if (!snap.exists()) return [];
          return snap.data().entries || [];
        } catch (e) {
          console.warn("lbLoadPending failed:", e);
          return [];
        }
      };

      // Approve one pending entry: mark it approved in the pending doc AND upsert
      // it into the public leaderboard doc that players actually read from.
      // approvedAt is stamped fresh here — that's the moment the 24h visibility
      // window starts (or restarts, if this is an updated/better score).
      window.__mod_lbApproveEntry = true;
      window.lbApproveEntry = async function (game, playerId) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized lbApproveEntry attempt.");
          return false;
        }
        try {
          const pendingRef = _lbPendingDocRef(game);
          const pendingSnap = await getDoc(pendingRef);
          if (!pendingSnap.exists()) return false;
          let entries = pendingSnap.data().entries || [];
          const idx = entries.findIndex((e) => e.playerId === playerId);
          if (idx === -1) return false;
          const nowIso = new Date().toISOString();
          entries[idx] = { ...entries[idx], approved: true };
          await setDoc(pendingRef, { entries }, { merge: false });

          // Push into the public/approved leaderboard doc
          const publicRef = _lbDocRef(game);
          const publicSnap = await getDoc(publicRef);
          let publicEntries = publicSnap.exists()
            ? publicSnap.data().entries || []
            : [];
          // Drop anything that's already aged out of its 24h window before writing back
          publicEntries = publicEntries.filter(_lbIsFresh);
          const pIdx = publicEntries.findIndex((e) => e.playerId === playerId);
          const approvedEntry = { ...entries[idx], approvedAt: nowIso };
          delete approvedEntry.approved;
          if (pIdx !== -1) {
            const old = publicEntries[pIdx];
            const isBetter =
              approvedEntry.score > old.score ||
              (approvedEntry.score === old.score &&
                approvedEntry.timeSecs < old.timeSecs);
            // Even if the score isn't better, re-approving refreshes the 24h clock.
            publicEntries[pIdx] = isBetter
              ? approvedEntry
              : { ...old, approvedAt: nowIso };
          } else {
            publicEntries.push(approvedEntry);
          }
          await setDoc(publicRef, { entries: publicEntries }, { merge: false });
          _invalidateLbCache(game);
          return true;
        } catch (e) {
          console.error("lbApproveEntry failed:", game, e);
          return false;
        }
      };

      // Approve every not-yet-approved entry in one single batch / 2-read + 2-write operation
      window.__mod_lbApproveAll = true;
      window.lbApproveAll = async function (game) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized lbApproveAll attempt.");
          return 0;
        }
        try {
          const pendingRef = _lbPendingDocRef(game);
          const publicRef = _lbDocRef(game);

          // Fetch both docs in parallel (2 reads total instead of 2N reads)
          const [pendingSnap, publicSnap] = await Promise.all([
            getDoc(pendingRef),
            getDoc(publicRef),
          ]);

          if (!pendingSnap.exists()) return 0;
          let pendingEntries = pendingSnap.data().entries || [];
          const todo = pendingEntries.filter((e) => !e.approved);
          if (todo.length === 0) return 0;

          const nowIso = new Date().toISOString();
          let publicEntries = publicSnap.exists()
            ? publicSnap.data().entries || []
            : [];
          publicEntries = publicEntries.filter(_lbIsFresh);

          // Mark pending entries approved in memory
          pendingEntries = pendingEntries.map((e) => {
            if (!e.approved) {
              return { ...e, approved: true };
            }
            return e;
          });

          for (const item of todo) {
            const approvedEntry = {
              playerId: item.playerId,
              name: item.name,
              avatar: item.avatar,
              photoURL: item.photoURL,
              score: item.score,
              timeSecs: item.timeSecs,
              submittedAt: item.submittedAt,
              approvedAt: nowIso,
            };
            const pIdx = publicEntries.findIndex((e) => e.playerId === item.playerId);
            if (pIdx !== -1) {
              const old = publicEntries[pIdx];
              const isBetter =
                approvedEntry.score > old.score ||
                (approvedEntry.score === old.score &&
                  approvedEntry.timeSecs < old.timeSecs);
              publicEntries[pIdx] = isBetter
                ? approvedEntry
                : { ...old, approvedAt: nowIso };
            } else {
              publicEntries.push(approvedEntry);
            }
          }

          // Commit both docs in parallel (2 writes total, fires public snapshot once)
          await Promise.all([
            setDoc(pendingRef, { entries: pendingEntries }, { merge: false }),
            setDoc(publicRef, { entries: publicEntries }, { merge: false }),
          ]);

          _invalidateLbCache(game);
          return todo.length;
        } catch (e) {
          console.error("lbApproveAll batch failed:", game, e);
          return 0;
        }
      };

      // In-memory cache for public leaderboard to eliminate redundant getDoc calls
      const _lbTodayCache = {
        jj: { data: null, ts: 0 },
        jp: { data: null, ts: 0 }
      };

      function _invalidateLbCache(game) {
        if (game && _lbTodayCache[game]) {
          _lbTodayCache[game] = { data: null, ts: 0 };
        } else {
          _lbTodayCache.jj = { data: null, ts: 0 };
          _lbTodayCache.jp = { data: null, ts: 0 };
        }
      }

      // Load the current leaderboard for a game — served from in-memory cache if fresh (<45s)
      window.__mod_lbLoadToday = true;
      window.lbLoadToday = async function (game) {
        const cached = _lbTodayCache[game];
        if (cached && cached.data && Date.now() - cached.ts < 45000) {
          return cached.data;
        }
        try {
          const ref = _lbDocRef(game);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            _lbTodayCache[game] = { data: [], ts: Date.now() };
            return [];
          }
          const entries = (snap.data().entries || []).filter(_lbIsFresh);
          const sorted = _lbSort(entries);
          _lbTodayCache[game] = { data: sorted, ts: Date.now() };
          return sorted;
        } catch (e) {
          console.warn("lbLoadToday failed:", e);
          return (cached && cached.data) || [];
        }
      };

      // Start a live listener for the current (rolling 24h) leaderboard
      window.__mod_lbListen = true;
      window.lbListen = function (game, callback) {
        const ref = _lbDocRef(game);
        return _trackUnsub(
          onSnapshot(ref, (snap) => {
            if (!snap.exists()) {
              _lbTodayCache[game] = { data: [], ts: Date.now() };
              callback([]);
              return;
            }
            const entries = (snap.data().entries || []).filter(_lbIsFresh);
            const sorted = _lbSort(entries);
            _lbTodayCache[game] = { data: sorted, ts: Date.now() };
            callback(sorted);
          }),
        );
      };

      // DEV/ADMIN UTILITY: wipe the pending + public leaderboard docs for a game,
      // so testers can re-approve from a clean slate. Does NOT touch the
      // round-log (jjEntries/jackpotEntries).
      window.__mod_lbResetToday = true;
      window.lbResetToday = async function (game) {
        if (!_isAdminAuthorized()) {
          console.error("Unauthorized lbResetToday attempt.");
          return false;
        }
        try {
          await deleteDoc(_lbPendingDocRef(game));
          await deleteDoc(_lbDocRef(game));
          _invalidateLbCache(game);
          return true;
        } catch (e) {
          console.error("lbResetToday failed:", game, e);
          return false;
        }
      };

      function _lbSort(entries) {
        return [...entries].sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score; // higher score first
          return a.timeSecs - b.timeSecs; // faster time breaks tie
        });
      }

      // ── UI helpers ────────────────────────────────────────────
      window.showLobby = function showLobby() {
        const srs = document.getElementById("sessionRestoreScreen");
        if (srs) srs.style.display = "none";
        const lobby = document.getElementById("lobbyScreen");
        if (lobby) lobby.style.display = "flex";
        const app = document.getElementById("appBody");
        if (app) app.style.display = "none";
        const fModal = document.getElementById("freezeAccountOverlay");
        if (fModal) {
          fModal.classList.remove("show");
          fModal.style.display = "none";
        }
      };
      window.hideLobby = function hideLobby() {
        document.getElementById("sessionRestoreScreen").style.display = "none";
        document.getElementById("lobbyScreen").style.display = "none";
        document.getElementById("appBody").style.display = "block";
      }
      function setLobbyLoading(on) {
        document
          .querySelectorAll(".lobby-btn")
          .forEach((b) => (b.disabled = on));
        document.getElementById("lobbySpinner").style.display = on
          ? "block"
          : "none";
      }
      function setLobbyError(id, msg, isHtml) {
        const el = document.getElementById(id);
        if (!el) return;
        if (isHtml) {
          el.innerHTML = msg;
        } else {
          el.textContent = msg;
        }
        el.classList.toggle("show", !!msg);
      }
      window.__mod_toggleLobbyTab = true;
      window.toggleLobbyTab = function (tab) {
        document.getElementById("lobbyLoginForm").style.display =
          tab === "login" ? "block" : "none";
        document.getElementById("lobbyRegForm").style.display =
          tab === "register" ? "block" : "none";
        document.getElementById("lobbyResetForm").style.display =
          tab === "reset" ? "block" : "none";
        // The tab bar only has Login/Register buttons; Reset PIN is reached via a link,
        // so only toggle "active" state for tabs that actually exist in the tab bar.
        document
          .querySelectorAll(".lobby-tab-btn")
          .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        ["loginError", "regError", "resetError"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.textContent = "";
            el.classList.remove("show");
          }
        });
        ["regSuccess", "resetSuccess"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("show");
        });
      };


      // ═══════════════════════════════════════════════════════════
      // ROOM OF REQUIREMENTS (ROR) LOGIC
      // ═══════════════════════════════════════════════════════════

      window.compressImageSafely = function(file) {
        return new Promise((resolve) => {
          if (!file) return resolve(file);
          
          const type = (file.type || "").toLowerCase();
          const name = (file.name || "").toLowerCase();
          const isHeic = type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
          
          // Files under 300 KB or HEIC don't need or can't do browser canvas compression
          if (file.size < 300 * 1024 || isHeic) {
            return resolve(file);
          }

          let objectUrl = null;
          try {
            objectUrl = URL.createObjectURL(file);
          } catch (e) {
            objectUrl = null;
          }

          const cleanup = () => {
            if (objectUrl) {
              try { URL.revokeObjectURL(objectUrl); } catch (e) {}
              objectUrl = null;
            }
          };

          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const MAX_DIM = 1400;

              if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                  height = Math.round((height * MAX_DIM) / width);
                  width = MAX_DIM;
                } else {
                  width = Math.round((width * MAX_DIM) / height);
                  height = MAX_DIM;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                cleanup();
                return resolve(file);
              }

              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob((blob) => {
                cleanup();
                if (blob && blob.size < file.size) {
                  const cleanName = file.name ? file.name.replace(/\.[^.]+$/, ".jpg") : "proof.jpg";
                  resolve(new File([blob], cleanName, { type: "image/jpeg" }));
                } else {
                  resolve(file);
                }
              }, 'image/jpeg', 0.80);
            } catch (e) {
              cleanup();
              console.warn("Canvas compression failed, falling back to original file:", e);
              resolve(file);
            }
          };
          img.onerror = () => {
            cleanup();
            console.warn("Image decode failed, falling back to original file");
            resolve(file);
          };

          if (objectUrl) {
            img.src = objectUrl;
          } else {
            const reader = new FileReader();
            reader.onload = (event) => { img.src = event.target.result; };
            reader.onerror = () => { resolve(file); };
            reader.readAsDataURL(file);
          }
        });
      };
      // Keep legacy alias for backward compatibility
      window.compressImage = window.compressImageSafely;

      const ROR_CLOUDINARY_CLOUD = "tlnggioy";
      const ROR_CLOUDINARY_PRESET = "dda_ror_upload";

      window.submitRorRequest = async function(requestedCoins, description, files, onProgress) {
        const identity = (typeof window.getRorPlayerIdentity === "function") 
          ? window.getRorPlayerIdentity() 
          : { 
              playerId: _currentPlayerId || window._currentPlayerId || "", 
              username: window._currentUsername || _currentPlayerId || window._currentPlayerId || "" 
            };

        const pid = identity.playerId;
        const uname = identity.username || pid;

        if (!pid) throw new Error("Not logged in. Please log in with your Player account first.");
        
        const cleanCoins = Math.floor(Number(requestedCoins));
        if (isNaN(cleanCoins) || cleanCoins <= 0) {
          throw new Error("Please enter a valid positive amount of coins.");
        }
        if (cleanCoins > 20000) {
          throw new Error("Maximum claim limit is 20,000 coins per request.");
        }
        
        const cleanDescription = (description || "").trim();
        if (!cleanDescription) {
          throw new Error("A purpose or task note is compulsory for submitting a claim.");
        }

        const reqId = "ror_" + Date.now() + "_" + Math.floor(Math.random()*1000);
        let imageUrls = [];
        let cloudinaryPublicIds = [];
        let storagePaths = [];

        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 20 * 1024 * 1024) {
              throw new Error(`File "${file.name}" exceeds the 20 MB limit.`);
            }

            if (typeof onProgress === "function") {
              onProgress(i + 1, files.length, 'uploading');
            }

            // Safely optimize/compress or fallback to original File
            let fileToUpload = file;
            if (typeof window.compressImageSafely === "function") {
              try {
                fileToUpload = await window.compressImageSafely(file);
              } catch (compErr) {
                console.warn("Compression skipped:", compErr);
                fileToUpload = file;
              }
            }

            let uploadedUrl = null;
            let lastError = null;

            // 1. Primary: Try Cloudinary with auto-retry
            for (let attempt = 1; attempt <= 2; attempt++) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for up to 20MB files
              try {
                const formData = new FormData();
                formData.append("file", fileToUpload, fileToUpload.name || `proof_${i + 1}.jpg`);
                formData.append("upload_preset", ROR_CLOUDINARY_PRESET);
                formData.append("folder", "dda/ror");

                const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${ROR_CLOUDINARY_CLOUD}/image/upload`, {
                  method: "POST",
                  body: formData,
                  signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (uploadRes.ok) {
                  const uploadData = await uploadRes.json();
                  const secureUrl = uploadData.secure_url || uploadData.url;
                  if (secureUrl) {
                    uploadedUrl = secureUrl;
                    if (uploadData.public_id) {
                      cloudinaryPublicIds.push(uploadData.public_id);
                    }
                    break;
                  }
                } else {
                  const errTxt = await uploadRes.text();
                  lastError = new Error(`Cloudinary HTTP ${uploadRes.status}: ${errTxt}`);
                }
              } catch (netErr) {
                clearTimeout(timeoutId);
                lastError = netErr;
                if (attempt < 2) {
                  await new Promise(r => setTimeout(r, 1000));
                }
              }
            }

            // 2. Secondary: If Cloudinary failed (Private DNS/ad-blocker blocking api.cloudinary.com or network drop),
            // fallback gracefully to Firebase Storage (Google infrastructure, immune to ad-blockers)
            if (!uploadedUrl) {
              console.warn(`Cloudinary upload failed for image ${i + 1} (${lastError?.message || lastError}). Falling back to Firebase Storage...`);
              try {
                const cleanExt = (fileToUpload.name && fileToUpload.name.includes('.')) 
                  ? fileToUpload.name.split('.').pop().toLowerCase() 
                  : (fileToUpload.type === 'image/png' ? 'png' : 'jpg');
                const safeName = `${reqId}_img${i + 1}_${Date.now()}.${cleanExt}`;
                const sPath = `ror_proofs/${safeName}`;
                const fileRef = storageRef(storage, sPath);
                
                const uploadSnap = await uploadBytes(fileRef, fileToUpload, {
                  contentType: fileToUpload.type || 'image/jpeg'
                });
                uploadedUrl = await getDownloadURL(uploadSnap.ref);
                storagePaths.push(sPath);
                console.log(`Firebase Storage fallback succeeded for image ${i + 1}`);
              } catch (storageErr) {
                console.error("Firebase Storage fallback also failed:", storageErr);
                throw new Error(`Failed to upload image ${i + 1} (${file.name}): Network or connection error. Please check your internet connection.`);
              }
            }

            if (!uploadedUrl) {
              throw new Error(`Failed to upload image ${i + 1}. Please check your connection and try again.`);
            }

            imageUrls.push(uploadedUrl);
          }
        }

        if (typeof onProgress === "function") {
          onProgress(files ? files.length : 0, files ? files.length : 0, 'saving');
        }

        let avatar = "";
        let photoURL = "";
        const prof = (typeof profile === "object" && profile) || (typeof window.profile === "object" && window.profile) || null;
        if (prof) {
          avatar = prof.avatar || "";
          photoURL = prof.photoURL || "";
        }
        if (!photoURL && pid && window._playerPhotoMap && window._playerPhotoMap[pid]) {
          photoURL = window._playerPhotoMap[pid];
        }
        if (typeof photoURL === "string" && photoURL.startsWith("data:")) {
          photoURL = "";
        }

        const newDoc = {
          id: reqId,
          playerId: pid,
          username: uname,
          avatar: avatar || "🧙",
          photoURL: photoURL || "",
          requestedCoins: cleanCoins,
          description: cleanDescription,
          imageUrls: imageUrls,
          cloudinaryPublicIds: cloudinaryPublicIds,
          storagePaths: storagePaths,
          status: 'pending',
          timestamp: Date.now()
        };

        try {
          await setDoc(doc(db, "da_ror_requests", reqId), newDoc);
        } catch (setErr) {
          console.warn("setDoc on da_ror_requests failed, retrying once:", setErr);
          await new Promise(r => setTimeout(r, 600));
          await setDoc(doc(db, "da_ror_requests", reqId), newDoc);
        }
        return reqId;
      };
      
      let rorAdminUnsubscribe = null;
      window.listenToRorRequests = function() {
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) return null;
        if (rorAdminUnsubscribe) {
          rorAdminUnsubscribe();
          rorAdminUnsubscribe = null;
        }
        
        const q = query(
          collection(db, "da_ror_requests"),
          where("status", "==", "pending")
        );
        
        rorAdminUnsubscribe = onSnapshot(q, (snap) => {
          const requests = [];
          snap.forEach(d => requests.push(d.data()));
          requests.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          if (window.renderAdminRorRequests) {
            window.renderAdminRorRequests(requests);
          }
        }, (err) => {
          console.error("ROR onSnapshot listener error:", err);
          const container = document.getElementById('adminRorList');
          if (container) {
            container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:30px 16px; background:var(--surface-card); border-radius:var(--radius-lg); border:1px solid rgba(239, 68, 68, 0.3); font-family:var(--font-body);">Error loading ROR requests: ${err.message || err}</div>`;
          }
        });
        return rorAdminUnsubscribe;
      };

      window.stopRorRequests = function() {
         if (rorAdminUnsubscribe) {
           rorAdminUnsubscribe();
           rorAdminUnsubscribe = null;
         }
      };

      window.adminUpdateRorRequest = async function(reqId, action, finalAmount, customNote = "") {
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) {
          throw new Error("Unauthorized admin action");
        }
        
        const reqRef = doc(db, "da_ror_requests", reqId);
        
        let reqData = null;
        await runTransaction(db, async (transaction) => {
          const reqSnap = await transaction.get(reqRef);
          if (!reqSnap.exists()) throw new Error("Request not found");
          
          reqData = reqSnap.data();
          if (reqData.status !== 'pending' && reqData.status !== 'processing_granted' && reqData.status !== 'processing_declined') {
            throw new Error("Request already processed");
          }
          
          transaction.update(reqRef, { status: 'processing_' + action });
        });
        
        let note = "";
        if (action === 'granted') {
          const grantAmt = Math.floor(Number(finalAmount));
          if (isNaN(grantAmt) || grantAmt <= 0) {
            await updateDoc(reqRef, { status: 'pending' }).catch(() => {});
            throw new Error("Invalid coin amount.");
          }
          if (grantAmt > 20000) {
            await updateDoc(reqRef, { status: 'pending' }).catch(() => {});
            throw new Error("Approved coins cannot exceed 20,000.");
          }
          note = "ROR Coins Approved";
          const playerNote = (reqData.description || "").replace(/\s+/g, ' ').trim();
          if (playerNote) {
            note += ` (${playerNote})`;
          }
          note += ` (Requested: ${reqData.requestedCoins}, Approved: ${grantAmt})`;
          const adminNote = (customNote || "").replace(/\s+/g, ' ').trim();
          if (adminNote) {
            note += ` — ${adminNote}`;
          }

          try {
            const grantRes = await window.adminGrantCoinsOne(reqData.playerId, grantAmt, note);
            if (!grantRes || grantRes.queued || typeof grantRes.newCoins !== "number") {
              await updateDoc(reqRef, { status: 'pending' }).catch(() => {});
              throw new Error("Failed to grant coins to player. " + ((grantRes && grantRes.error) || "Transaction uncommitted"));
            }
          } catch (err) {
            await updateDoc(reqRef, { status: 'pending' }).catch(() => {});
            throw err;
          }
        }
        
        const adminAttribution = (typeof _getAdminAttribution === "function") ? _getAdminAttribution() : { name: "Admin" };
        
        await updateDoc(reqRef, {
          status: action,
          grantedCoins: action === 'granted' ? Math.floor(Number(finalAmount)) : 0,
          grantNote: action === 'granted' ? note : "",
          adminCustomNote: (customNote || "").replace(/\s+/g, ' ').trim(),
          resolvedAt: Date.now(),
          resolvedBy: adminAttribution.name || "Admin"
        });
        
        // Clean up any Firebase Storage proof files if used
        if (Array.isArray(reqData.storagePaths) && reqData.storagePaths.length > 0) {
          for (const sPath of reqData.storagePaths) {
            try {
              await deleteObject(storageRef(storage, sPath));
            } catch (e) {
              /* ignore cleanup error */
            }
          }
        }
        
        // Cloudinary assets are left in place because this is a client-only unsigned setup.
        // DO NOT attempt to delete Cloudinary assets from the browser.
      };

      // ── PLAYER: Fetch their own ROR requests (Pending & Resolved) with 3-day auto-prune ──
      const ROR_PRUNE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

      window.getMyRorRequests = async function(playerId) {
        if (!playerId) return [];
        try {
          const q = query(
            collection(db, "da_ror_requests"),
            where("playerId", "==", playerId),
            limit(50)
          );
          const snap = await getDocs(q);
          const list = [];
          const now = Date.now();
          const pruneIds = [];
          const healItems = [];

          snap.forEach(d => {
            const data = d.data();
            const reqId = data.id || d.id;
            data.id = reqId;

            // Self-heal any orphaned processing states
            if (data.status === 'processing_granted') {
              const targetStatus = (typeof data.grantedCoins === 'number' && data.grantedCoins > 0) ? 'granted' : 'pending';
              data.status = targetStatus;
              healItems.push({ id: reqId, status: targetStatus });
            }

            if (data.status === 'processing_declined') {
              data.status = 'declined';
              healItems.push({ id: reqId, status: 'declined' });
            }

            // 3-day auto-prune for both approved and declined requests
            const isResolved = data.status === 'granted' || data.status === 'declined' || data.status === 'processing_granted' || data.status === 'processing_declined';
            if (isResolved) {
              const resTime = Number(data.resolvedAt || data.timestamp || 0);
              if (resTime > 0 && (now - resTime) > ROR_PRUNE_MS) {
                pruneIds.push(reqId);
                return; // Exclude from active list
              }
            }
            list.push(data);
          });

          // Decouple background mutations so they never race with the active query or listener
          if (healItems.length > 0) {
            setTimeout(() => {
              healItems.forEach(item => {
                updateDoc(doc(db, "da_ror_requests", item.id), { status: item.status }).catch(() => {});
              });
            }, 800);
          }
          if (pruneIds.length > 0) {
            setTimeout(() => {
              pruneIds.forEach(id => {
                deleteDoc(doc(db, "da_ror_requests", id)).catch(() => {});
              });
            }, 1200);
          }

          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          return list;
        } catch (e) {
          console.error("getMyRorRequests error:", e);
          throw e;
        }
      };

      // ── PLAYER: Clear or delete ROR requests ──
      window.deleteRorRequest = async function(reqId) {
        if (!reqId) return;
        await deleteDoc(doc(db, "da_ror_requests", reqId));
      };

      // ── PLAYER: Update purpose / task note on an ROR request ──
      window.updateRorRequestNote = async function(reqId, newDescription) {
        if (!reqId) throw new Error("Missing request ID");
        const cleanNote = (newDescription || "").trim();
        if (!cleanNote) {
          throw new Error("A purpose or task note is compulsory.");
        }
        await updateDoc(doc(db, "da_ror_requests", reqId), { description: cleanNote });
      };

      window.clearResolvedRorRequests = async function(reqIds) {
        if (!Array.isArray(reqIds) || reqIds.length === 0) return;
        await Promise.all(
          reqIds.filter(Boolean).map(id => deleteDoc(doc(db, "da_ror_requests", id)))
        );
      };
      window.clearApprovedRorRequests = window.clearResolvedRorRequests;

      // ═══════════════════════════════════════════════════════════
      // ── ADMIN BROADCAST NOTIFICATIONS & ANNOUNCEMENTS ──────────
      // ═══════════════════════════════════════════════════════════
      let _notificationsUnsub = null;
      window._adminNotifications = [];

      function _getAdminFullInfo() {
        const attr = (typeof _getAdminAttribution === "function") ? _getAdminAttribution() : { name: "Admin", pid: "" };
        let name = attr.name || "Admin";
        let pid = attr.pid || window._currentPlayerId || "";
        let photo = "";
        let avatar = "👑";

        const prof = (typeof profile === "object" && profile) || (typeof window.profile === "object" && window.profile) || (typeof window._getProfile === "function" && window._getProfile()) || null;
        if (prof) {
          if (prof.name && String(prof.name).trim()) name = String(prof.name).trim();
          if (prof.photoURL && typeof prof.photoURL === "string" && prof.photoURL.trim()) {
            photo = prof.photoURL.trim();
          }
          if (prof.avatar) avatar = prof.avatar;
          if (prof.playerId) pid = prof.playerId;
        }
        if (!photo && pid && window._playerPhotoMap && window._playerPhotoMap[pid]) {
          photo = window._playerPhotoMap[pid];
        }
        if (!photo && name && window._playerPhotoByNameMap && window._playerPhotoByNameMap[name.toLowerCase()]) {
          photo = window._playerPhotoByNameMap[name.toLowerCase()];
        }
        if (!photo && pid && window._cachedCommunityMembers && Array.isArray(window._cachedCommunityMembers)) {
          const mem = window._cachedCommunityMembers.find(m => m && (m.playerId === pid || m.id === pid));
          if (mem && mem.photoURL) photo = mem.photoURL;
        }
        if (!photo && name && window._cachedCommunityMembers && Array.isArray(window._cachedCommunityMembers)) {
          const mem = window._cachedCommunityMembers.find(m => m && m.name && m.name.toLowerCase() === name.toLowerCase());
          if (mem && mem.photoURL) photo = mem.photoURL;
        }
        if (!photo && pid && window._adminPlayersCache && Array.isArray(window._adminPlayersCache.players)) {
          const p = window._adminPlayersCache.players.find(x => x && (x.id === pid || x.playerId === pid));
          if (p && p.photoURL) photo = p.photoURL;
        }
        if (!photo && name && window._adminPlayersCache && Array.isArray(window._adminPlayersCache.players)) {
          const p = window._adminPlayersCache.players.find(x => x && x.name && x.name.toLowerCase() === name.toLowerCase());
          if (p && p.photoURL) photo = p.photoURL;
        }
        return { name, pid, photo, avatar };
      }
      window._getAdminFullInfo = _getAdminFullInfo;

      window.publishAdminNotification = async function(message, file, onProgress, explicitAdminInfo) {
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) {
          throw new Error("Unauthorized admin action: Full admin PIN required to send broadcast announcements.");
        }

        const cleanMessage = (message || "").trim();
        if (!cleanMessage && !file) {
          throw new Error("Please write an announcement message or attach an image.");
        }

        let uploadedUrl = "";
        let cloudinaryPublicId = "";
        let storagePath = "";

        if (file) {
          if (file.size > 20 * 1024 * 1024) {
            throw new Error(`File "${file.name}" exceeds the 20 MB limit.`);
          }

          if (typeof onProgress === "function") {
            onProgress(1, 1, "optimizing");
          }

          // 1. Safely compress or fallback to original File
          let fileToUpload = file;
          if (typeof window.compressImageSafely === "function") {
            try {
              fileToUpload = await window.compressImageSafely(file);
            } catch (compErr) {
              console.warn("Notification image compression skipped:", compErr);
              fileToUpload = file;
            }
          }

          if (typeof onProgress === "function") {
            onProgress(1, 1, "uploading");
          }

          let lastError = null;

          // 2. Primary: Cloudinary with auto-retry (same architecture as RoR)
          for (let attempt = 1; attempt <= 2; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            try {
              const formData = new FormData();
              formData.append("file", fileToUpload, fileToUpload.name || `notif_${Date.now()}.jpg`);
              formData.append("upload_preset", ROR_CLOUDINARY_PRESET);
              formData.append("folder", "dda/notifications");

              const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${ROR_CLOUDINARY_CLOUD}/image/upload`, {
                method: "POST",
                body: formData,
                signal: controller.signal
              });
              clearTimeout(timeoutId);

              if (uploadRes.ok) {
                const uploadData = await uploadRes.json();
                const secureUrl = uploadData.secure_url || uploadData.url;
                if (secureUrl) {
                  uploadedUrl = secureUrl;
                  cloudinaryPublicId = uploadData.public_id || "";
                  break;
                }
              } else {
                const errTxt = await uploadRes.text();
                lastError = new Error(`Cloudinary HTTP ${uploadRes.status}: ${errTxt}`);
              }
            } catch (netErr) {
              clearTimeout(timeoutId);
              lastError = netErr;
              if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }

          // 3. Secondary fallback: Firebase Storage
          if (!uploadedUrl) {
            console.warn(`Cloudinary upload failed for notification image (${lastError?.message || lastError}). Falling back to Firebase Storage...`);
            try {
              const cleanExt = (fileToUpload.name && fileToUpload.name.includes(".")) 
                ? fileToUpload.name.split(".").pop().toLowerCase() 
                : (fileToUpload.type === "image/png" ? "png" : "jpg");
              const safeName = `notif_${Date.now()}_${Math.floor(Math.random()*1000)}.${cleanExt}`;
              const sPath = `notification_images/${safeName}`;
              const fileRef = storageRef(storage, sPath);
              const uploadSnap = await uploadBytes(fileRef, fileToUpload, {
                contentType: fileToUpload.type || "image/jpeg"
              });
              uploadedUrl = await getDownloadURL(uploadSnap.ref);
              storagePath = sPath;
              console.log("Firebase Storage fallback succeeded for notification image");
            } catch (storageErr) {
              console.error("Firebase Storage fallback failed:", storageErr);
              throw new Error(`Failed to upload notification image: Network error. Please check your internet connection.`);
            }
          }

          if (!uploadedUrl) {
            throw new Error("Failed to upload notification image. Please try again.");
          }
        }

        if (typeof onProgress === "function") {
          onProgress(1, 1, "saving");
        }

        const baseAdminInfo = _getAdminFullInfo();
        const adminInfo = Object.assign({}, baseAdminInfo, explicitAdminInfo || {});
        if (!adminInfo.photo && baseAdminInfo.photo) adminInfo.photo = baseAdminInfo.photo;
        if (!adminInfo.name) adminInfo.name = baseAdminInfo.name;
        if (!adminInfo.pid) adminInfo.pid = baseAdminInfo.pid;
        if (!adminInfo.avatar) adminInfo.avatar = baseAdminInfo.avatar;

        const notifId = "notif_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const notifDoc = {
          id: notifId,
          message: cleanMessage,
          imageUrl: uploadedUrl || "",
          cloudinaryPublicId: cloudinaryPublicId || "",
          storagePath: storagePath || "",
          adminPid: adminInfo.pid || "",
          adminName: adminInfo.name || "Admin",
          adminPhoto: adminInfo.photo || "",
          adminAvatar: adminInfo.avatar || "👑",
          createdAt: Date.now(),
          timestamp: Date.now()
        };

        try {
          await setDoc(doc(db, "da_notifications", notifId), notifDoc);
        } catch (setErr) {
          console.warn("setDoc on da_notifications failed, retrying once:", setErr);
          await new Promise(r => setTimeout(r, 600));
          await setDoc(doc(db, "da_notifications", notifId), notifDoc);
        }

        return notifDoc;
      };

      window.deleteAdminNotification = async function(notifId) {
        if (typeof _isAdminAuthorized === "function" && !_isAdminAuthorized()) {
          throw new Error("Unauthorized admin action: Full admin PIN required to delete announcements.");
        }
        if (!notifId) throw new Error("Missing notification ID.");

        let notifData = (window._adminNotifications || []).find(n => n.id === notifId);
        const notifRef = doc(db, "da_notifications", notifId);

        if (!notifData) {
          try {
            const snap = await getDoc(notifRef);
            if (snap.exists()) notifData = snap.data();
          } catch(e) {}
        }

        // 1. Remove from Cloudinary if public_id exists
        if (notifData && notifData.cloudinaryPublicId) {
          try {
            const fd = new FormData();
            fd.append("public_id", notifData.cloudinaryPublicId);
            await fetch(`https://api.cloudinary.com/v1_1/${ROR_CLOUDINARY_CLOUD}/image/destroy`, {
              method: "POST",
              body: fd
            });
            console.log("Cloudinary image destroy attempted for", notifData.cloudinaryPublicId);
          } catch (cErr) {
            console.warn("Cloudinary image deletion attempt encountered error:", cErr);
          }
        }

        // 2. Remove from Firebase Storage if fallback was used
        if (notifData && notifData.storagePath) {
          try {
            await deleteObject(storageRef(storage, notifData.storagePath));
            console.log("Firebase Storage image deleted for", notifData.storagePath);
          } catch (sErr) {
            console.warn("Firebase Storage image delete skipped:", sErr);
          }
        }

        // 3. Delete from Firestore collection
        await deleteDoc(notifRef);

        // Update local cache immediately
        if (Array.isArray(window._adminNotifications)) {
          window._adminNotifications = window._adminNotifications.filter(n => n.id !== notifId);
          if (typeof window.onNotificationsUpdated === "function") {
            window.onNotificationsUpdated(window._adminNotifications);
          }
        }
      };

      window.listenToNotifications = function() {
        if (_notificationsUnsub) return _notificationsUnsub;

        const q = query(
          collection(db, "da_notifications"),
          orderBy("timestamp", "desc"),
          limit(50)
        );

        _notificationsUnsub = onSnapshot(q, (snap) => {
          const list = [];
          snap.forEach(d => list.push(d.data()));
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          window._adminNotifications = list;
          if (typeof window.onNotificationsUpdated === "function") {
            window.onNotificationsUpdated(list);
          }
        }, (err) => {
          console.error("Notifications listener error:", err);
        });

        return _notificationsUnsub;
      };

      window.stopNotificationsListener = function() {
        if (_notificationsUnsub) {
          try { _notificationsUnsub(); } catch(e) {}
          _notificationsUnsub = null;
        }
      };

      // Auto-start notifications listener
      try {
        window.listenToNotifications();
      } catch(e) {}

      // Enter key support
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const lobby = document.getElementById("lobbyScreen");
        if (!lobby || lobby.style.display === "none") return;
        const loginVisible =
          document.getElementById("lobbyLoginForm").style.display !== "none";
        const resetVisible =
          document.getElementById("lobbyResetForm").style.display !== "none";
        if (loginVisible) window.doLogin();
        else if (resetVisible) window.doResetPin();
        else window.doRegister();
      });
