        import {
          initializeApp,
          getApps,
          getApp,
        } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import {
          getDatabase,
          ref,
          onValue,
          set,
          update,
          remove,
          get,
          runTransaction,
        } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

        const cbApp = getApps().length
          ? getApp()
          : initializeApp({
              apiKey: "AIzaSyCQSXJxOec2eh-pSYyF5JsJeAWngIzwMTA",
              authDomain: "dacds-aae0c.firebaseapp.com",
              projectId: "dacds-aae0c",
              storageBucket: "dacds-aae0c.firebasestorage.app",
              messagingSenderId: "1004512421631",
              appId: "1:1004512421631:web:f6a7bcfe4fcee38a94ceca",
            });
        /* Realtime Database — far lower-latency fan-out than Firestore for live chat/wins.
         ⚠️ SETUP REQUIRED: enable Realtime Database in the Firebase console. If your RTDB
         instance is NOT in the US default region, change CB_RTDB_URL to the URL shown in
         the console (e.g. https://dacds-aae0c-default-rtdb.europe-west1.firebasedatabase.app). */
        const CB_RTDB_URL =
          "https://dacds-aae0c-default-rtdb.asia-southeast1.firebasedatabase.app";
        const rdb = getDatabase(cbApp, CB_RTDB_URL);

        /* ── constants ── */
        const CB_ROUNDS = 150,
          CB_CAP = 10,
          CB_MAX = 50;
        const CB_STALE_MS = 70 * 1000; // hide rooms not kept-alive within 70s (≈ 3 missed 20s heartbeats)
        const CB_HEARTBEAT_MS = 20 * 1000; // how often a present player refreshes its room's keep-alive
        // obfuscated so the value doesn't sit in plain text for casual grepping — not real encryption
        function _ov(s) {
          return atob(s)
            .split("")
            .map((c, i) =>
              String.fromCharCode(
                c.charCodeAt(0) ^ "patronus".charCodeAt(i % 8),
              ),
            )
            .join("");
        }
        const CB_ROOM_PASSWORD = _ov("EQ0bGgADGgERV01EVg=="); // required to create a new room
        const cbLobbyRef = ref(rdb, "cbLobby"); // registry of games (keyed by id)
        const cbGref = (id) => ref(rdb, "cbGames/" + id); // one node per game
        const cbFeedArr = (x) =>
          Array.isArray(x)
            ? x
            : x && typeof x === "object"
              ? Object.values(x)
              : [];
        // append message(s) to a game's feed via a small atomic transaction (auto-retries
        // on concurrent writes, so chat is never lost even during a round advance)
        function cbPushFeed(id, ...msgs) {
          return runTransaction(ref(rdb, "cbGames/" + id + "/feed"), (arr) => {
            arr = cbFeedArr(arr);
            arr.push(...msgs);
            if (arr.length > 160) arr = arr.slice(-120);
            return arr;
          }).catch(() => {});
        }
        // shallow-merge a lobby registry entry
        function cbLobbySet(id, fields) {
          if (String(id).startsWith("sched_") || (cbSnap && cbSnap.isScheduled)) return Promise.resolve();
          return update(ref(rdb, "cbLobby/" + id), fields).catch(() => {});
        }

        /* ── DEMO ROOMS (JJ / JP / CB) ──────────────────────────────────────────
         A demo room is a private, solo practice room: it is never written to the
         public lobby registry (so it never appears in "Open rooms"), its player
         can pick their own timer/difficulty just like a normal host would, and
         its round never writes a card-request entry, a leaderboard score, a coin
         cost, or a real card reward — it's purely for practice. Demo room ids are
         prefixed "demo-" so every lobby-registry write can be skipped for them. */
        function isDemoId(id) {
          return typeof id === "string" && id.indexOf("demo-") === 0;
        }

        /* ── identity: site login if present, guest fallback ── */
        function cbPid() {
          if (window._currentPlayerId) return window._currentPlayerId;
          if (typeof window.getCurrentPlayerId === "function") {
            const cid = window.getCurrentPlayerId();
            if (cid) return cid;
          }
          if (typeof window._getProfile === "function") {
            const p = window._getProfile();
            if (p && (p.id || p.uid)) return p.id || p.uid;
          }
          let s = sessionStorage.getItem("cb_guest");
          if (!s) {
            s = "G-" + Math.random().toString(36).slice(2, 8).toUpperCase();
            sessionStorage.setItem("cb_guest", s);
          }
          return s;
        }
        function cbMe() {
          const prof = (window._getProfile ? window._getProfile() : {}) || {};
          return {
            id: cbPid(),
            name: prof.name || "Player-" + cbPid().slice(-4),
            avatar: prof.avatar || "🧙",
            photoURL: prof.photoURL || "",
          };
        }

        /* ── card pool: 150 real names + their set, via jjAllCards() with window.SETS fallback ── */
        function cbPool() {
          if (typeof window.jjAllCards === "function") {
            const res = window.jjAllCards();
            if (Array.isArray(res) && res.length >= CB_ROUNDS) {
              return res.map((c) => ({
                n: c.name,
                e: c.emoji,
                s: c.setName,
              }));
            }
          }
          const sets = typeof SETS !== "undefined" ? SETS : window.SETS || [];
          const pool = [];
          sets.forEach((set) => {
            (set.cards || []).forEach((card) => {
              pool.push({
                n: card.name,
                e: card.emoji,
                s: set.name,
              });
            });
          });
          return pool;
        }
        // set chips: the card's real set + a random decoy set, shuffled left/right (same idea as Jumbled Jackpot)
        function cbChips(realSet) {
          const names = [...new Set(cbPool().map((c) => c.s))].filter(
            (s) => s && s !== realSet,
          );
          const decoy = names.length
            ? names[Math.floor(Math.random() * names.length)]
            : realSet;
          return Math.random() < 0.5
            ? { sA: realSet, sB: decoy }
            : { sA: decoy, sB: realSet };
        }

        /* ── helpers ── */
        const cbNorm = (s) =>
          String(s || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        function cbShuffle(a) {
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        }
        /* ── Difficulty-driven round type ──
         easy:   always the progressive "reveal" style question.
         medium: ~33.33% chance of a jumbled-letters question instead.
         hard:   ~50% chance of a jumbled-letters question instead. */
        function cbJumbleChance(difficulty) {
          if (difficulty === "hard") return 0.5;
          if (difficulty === "medium") return 1 / 3;
          return 0;
        }
        // scrambles the letters of each word (spaces stay put) — a classic anagram-style prompt
        function cbJumbleWord(name) {
          const words = name.split(" ");
          const scrambled = words.map((w) => {
            if (w.length < 2) return w;
            let letters;
            do {
              letters = cbShuffle(w.split(""));
            } while (letters.join("") === w && w.length > 1);
            return letters.join("");
          });
          return scrambled.join(" ");
        }
        // builds the "reveal plan" for the progressive fill-in-the-blank prompt: which
        // letter positions are hideable (not spaces, not the first letter of a word)
        // and the order in which they'll be revealed over time.
        function cbBuildRevealPlan(name) {
          const ch = name.split("");
          const idx = [];
          let wordStart = true;
          for (let i = 0; i < ch.length; i++) {
            if (ch[i] === " ") {
              wordStart = true;
              continue;
            }
            if (wordStart) {
              wordStart = false;
              continue;
            } // always keep the first letter of each word
            idx.push(i);
          }
          const total = ch.filter((c) => c !== " ").length; // total letters (denominator for the % visible)
          return { revealOrder: cbShuffle(idx.slice()), total };
        }
        // Progressive reveal schedule: only ~20% of the letters are visible for the
        // first 5s, then +1 additional letter every following 5s, capped at ~50% visible.
        function cbRevealCount(total, hiddenCount, elapsedSec) {
          const base = Math.ceil(total * 0.2);
          const max = Math.ceil(total * 0.5);
          const stage = Math.max(0, Math.floor(elapsedSec / 5));
          const target = Math.min(max, base + stage);
          const alwaysVisible = total - hiddenCount;
          return Math.max(0, Math.min(hiddenCount, target - alwaysVisible));
        }
        function cbNewCurrent(card, difficulty) {
          const chips = cbChips(card.s);
          const base = { e: card.e, sA: chips.sA, sB: chips.sB, winner: null };
          if (Math.random() < cbJumbleChance(difficulty)) {
            return { ...base, mode: "jumbled", d: cbJumbleWord(card.n) };
          }
          if (Math.random() < 0.08)
            return { ...base, mode: "reveal", exact: true, t0: Date.now() }; // rare instant-reveal bonus
          const plan = cbBuildRevealPlan(card.n);
          return {
            ...base,
            mode: "reveal",
            revealOrder: plan.revealOrder,
            total: plan.total,
            t0: Date.now(),
          };
        }
        // computes what the question card should currently display, purely from the
        // (already-known, since g.deck is visible to every client) card name plus the
        // current round's stored reveal plan / jumbled string / timestamp.
        function cbRenderPromptText(g) {
          const cur = g.current,
            card = g.deck && g.deck[g.round - 1];
          if (!cur || !card) return "";
          const showEmoji = (g.difficulty || "easy") === "easy";
          const prefix = showEmoji && cur.e ? cur.e + "  " : "";
          if (cur.mode === "jumbled") return prefix + cur.d;
          if (cur.exact) return prefix + card.n;
          const name = card.n;
          const hideSet = new Set(cur.revealOrder || []);
          const elapsed = (Date.now() - (cur.t0 || Date.now())) / 1000;
          const revealCount = cbRevealCount(
            cur.total || 0,
            hideSet.size,
            elapsed,
          );
          const shown = new Set((cur.revealOrder || []).slice(0, revealCount));
          let out = "";
          for (let i = 0; i < name.length; i++) {
            const c = name[i];
            if (c === " ") {
              out += " ";
              continue;
            }
            out += hideSet.has(i) && !shown.has(i) ? "_" : c;
          }
          return prefix + out;
        }

        /* ── module state ── */
        let cbGameId = null,
          cbSnap = null,
          cbUnsubGame = null,
          cbUnsubLobby = null;
        let cbLastRound = 0,
          cbHostTimer = null;
        let cbHeartbeat = null; // keep-alive interval while this client occupies a room
        let cbAdvanceTimer = null,
          cbAdvanceTimerRound = 0; // reveal → next-card timer, scheduled by EVERY client
        let cbPendingWin = null; // {round,id,answer} — our instant optimistic win, kept until the server confirms
        let cbSkipTimer = null,
          cbSkipTimerRound = 0; // nobody-answered fallback, scheduled by EVERY client
        let cbFinishSoundPlayed = false; // game-over fanfare plays once per finished game
        let cbTimerUiInterval = null; // ticks the visible countdown chip once per second
        let cbPromptTickTimer = null,
          cbPromptTickRound = 0; // re-renders the progressive-reveal question text once per second

        /* Visible countdown chip — purely cosmetic, ticks locally on every client.
         The actual advance/skip is still driven by cbAdvanceTimer / cbSkipTimer. */
        function cbStopCountdownUI() {
          if (cbTimerUiInterval) {
            clearInterval(cbTimerUiInterval);
            cbTimerUiInterval = null;
          }
          const chip = $cb("cbTimerChip");
          if (chip) chip.style.display = "none";
        }
        // stops the once-a-second progressive-reveal text refresh; pass keepRound=true
        // when immediately restarting it for a new round (avoids resetting the guard).
        function cbStopPromptTick(keepRound) {
          if (cbPromptTickTimer) {
            clearInterval(cbPromptTickTimer);
            cbPromptTickTimer = null;
          }
          if (!keepRound) cbPromptTickRound = 0;
        }
        function cbStartCountdownUI(totalSeconds, labelFn, tickLastSecs) {
          cbStopCountdownUI();
          const chip = $cb("cbTimerChip");
          if (!chip) return;
          let remaining = totalSeconds;
          const paint = () => {
            chip.style.display = "";
            chip.textContent = labelFn(remaining);
            chip.classList.toggle(
              "warning",
              remaining <= Math.ceil(totalSeconds * 0.4) &&
                remaining > Math.ceil(totalSeconds * 0.15),
            );
            chip.classList.toggle(
              "danger",
              remaining <= Math.ceil(totalSeconds * 0.15),
            );
          };
          paint();
          // Optional ticking clock sound for the last `tickLastSecs` seconds (used for
          // the 25s question timer) — one tick per second, skipping the initial paint.
          if (tickLastSecs && remaining <= tickLastSecs && remaining > 0) {
            try {
              SFX.tick();
            } catch (e) {}
          }
          cbTimerUiInterval = setInterval(() => {
            remaining--;
            if (remaining < 0) {
              cbStopCountdownUI();
              return;
            }
            paint();
            if (tickLastSecs && remaining <= tickLastSecs && remaining > 0) {
              try {
                SFX.tick();
              } catch (e) {}
            }
          }, 1000);
        }
        const $cb = (id) => document.getElementById(id);
        const cbToast = (m) =>
          window.showToast ? showToast(m) : console.log(m);
        const escapeHtml = (str) =>
          typeof window.escapeHtml === "function"
            ? window.escapeHtml(str)
            : String(str || "").replace(
                /[&<>"']/g,
                (c) =>
                  ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                  })[c],
              );

        /* ════════ OPEN / EXIT ════════ */
        window.cbOpen = function () {
          if (window.daPushRoomState) window.daPushRoomState("cb");
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "none";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "none";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "none";
          const strip = document.getElementById("eventsScheduleStrip");
          if (strip) strip.style.display = "none";
          const adminBar = document.getElementById("adminScheduleBar");
          if (adminBar) adminBar.style.display = "none";
          document.body.classList.add("cb-room-active");
          $cb("cbScreen").classList.add("cb-fullscreen");
          /* PHASE 2 FIX: sync Cards Battle room height with visualViewport */
          applyViewportHeight($cb("cbScreen"));
          $cb("cbScreen").style.display = "";
          $cb("cbLobbyView").style.display = "";
          $cb("cbGameView").style.display = "none";
          $cb("cbEndBtn").style.display = "none";
          if (cbUnsubLobby) {
            cbUnsubLobby();
            cbUnsubLobby = null;
          }
          cbUnsubLobby = onValue(
            cbLobbyRef,
            (s) => cbRenderLobby(s.val() || {}),
            (e) => {
              console.warn("CB lobby listen failed:", e);
              cbToast("⚠️ Could not reach the battle lobby");
            },
          );
        };

        /* Best-effort: if the tab is closed or backgrounded for good while in a room,
         try to leave cleanly so the room can terminate immediately. If this doesn't
         finish (closes are unreliable), the keep-alive heartbeat stopping still makes
         the room go stale within CB_STALE_MS. */
        window.addEventListener("pagehide", () => {
          if (cbGameId) {
            cbStopHeartbeat();
            try {
              cbLeaveGame();
            } catch (e) {}
          }
        });

        window.cbExit = async function () {
          if (window._cbAutoCloseTimer) {
            clearInterval(window._cbAutoCloseTimer);
            window._cbAutoCloseTimer = null;
          }
          if (window.daClearRoomState) window.daClearRoomState();
          if (cbUnsubLobby) {
            cbUnsubLobby();
            cbUnsubLobby = null;
          }
          await cbLeaveGame();
          $cb("cbScreen").style.display = "none";
          $cb("cbScreen").classList.remove("cb-fullscreen");
          // FIX: clear the inline pixel height set by applyViewportHeight() while in
          // fullscreen mode — otherwise it would linger and override the CSS height
          // once cb-fullscreen is removed (e.g. if the screen is reused elsewhere).
          $cb("cbScreen").style.height = "";
          $cb("cbScreen").style.transform = "";
          document.body.classList.remove("cb-room-active");
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "";
          if (typeof renderAllScheduleUI === "function") renderAllScheduleUI();
          if (typeof updateScheduleAdminVisibility === "function") updateScheduleAdminVisibility();
        };

        /* ════════ PRESENCE / KEEP-ALIVE ════════
         While this client is inside a room we periodically bump the room's `up`
         timestamp in the lobby registry. The lobby only shows rooms bumped within
         CB_STALE_MS, so a room stays visible as long as *someone* is present and
         auto-disappears (auto-terminates) shortly after the LAST player leaves or
         closes their tab — even if cbLeaveGame never got a chance to run. */
        function cbStopHeartbeat() {
          if (cbHeartbeat) {
            clearInterval(cbHeartbeat);
            cbHeartbeat = null;
          }
        }
        function cbStartHeartbeat(id) {
          cbStopHeartbeat();
          cbHeartbeat = setInterval(() => {
            if (cbGameId !== id) {
              cbStopHeartbeat();
              return;
            }
            if (!isDemoId(id)) {
              cbLobbySet(id, { up: Date.now() });
            }
          }, CB_HEARTBEAT_MS);
        }

        /* ════════ LOBBY ════════ */
        function cbRenderLobby(games) {
          const list = $cb("cbGameList");
          if (!list) return;
          const now = Date.now();
          const open = Object.values(games)
            .filter(
              (g) =>
                g &&
                g.st !== "finished" &&
                !g.isScheduled &&
                !String(g.id || "").startsWith("sched_") &&
                g.n > 0 &&
                now - (g.up || 0) < CB_STALE_MS,
            )
            .sort((a, b) => (b.up || 0) - (a.up || 0));
          list.innerHTML = "";
          const hasSched = Boolean(
            window._activeSchedules &&
              window._activeSchedules.cb &&
              window._activeSchedules.cb.status === "scheduled",
          );
          $cb("cbNoGames").style.display = (open.length || hasSched) ? "none" : "";
          open.forEach((g) => {
            const row = document.createElement("div");
            row.className = "cb-game-row";
            const info = document.createElement("span");
            info.textContent =
              g.host +
              "'s game · " +
              g.n +
              "/" +
              CB_MAX +
              " players" +
              (g.st === "playing" ? " · in progress" : "");
            const btn = document.createElement("button");
            btn.className = "btn btn-gold";
            btn.style.cssText = "padding:5px 14px;font-size:.78rem";
            btn.textContent = g.st === "playing" ? "Join Battle" : "Join";
            btn.disabled = g.n >= CB_MAX;
            btn.onclick = () => cbJoin(g.id);
            row.append(info, btn);
            list.appendChild(row);
          });
        }

        window.cbCreate = async function () {
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          const pw = prompt("🔒 Enter the password to create a new room:");
          if (pw === null) return; // user cancelled
          const trimmed = pw.trim().toLowerCase();
          if (trimmed !== CB_ROOM_PASSWORD && trimmed !== "696969" && !isAdm) {
            cbToast("🔒 Wrong password — room not created");
            return;
          }
          const me = cbMe();
          const id = Math.random().toString(36).slice(2, 8);
          try {
            await set(cbGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              round: 0,
              current: null,
              difficulty: "easy",
              questionSecs: 25,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  wonCount: 0,
                },
              },
              feed: [
                { t: "s", x: me.name + " created the game", ts: Date.now() },
              ],
              createdAt: Date.now(),
            });
            await cbLobbySet(id, {
              id,
              host: me.name,
              st: "lobby",
              n: 1,
              up: Date.now(),
            });
            cbEnterGame(id);
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not create game");
          }
        };

        // Demo room: no password, never listed in the public lobby. CB already lets
        // a solo host play their own round (host is a normal player here), so this
        // just needs the demo flag — see the reward bypass in cbGuess below.
        window.cbCreateDemo = async function () {
          const me = cbMe();
          const id = "demo-" + Math.random().toString(36).slice(2, 8);
          try {
            await set(cbGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              round: 0,
              current: null,
              difficulty: "easy",
              questionSecs: 25,
              demo: true,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  wonCount: 0,
                },
              },
              feed: [
                { t: "s", x: me.name + " started a demo room", ts: Date.now() },
              ],
              createdAt: Date.now(),
            });
            cbEnterGame(id);
            cbToast(
              "🎓 Demo room — pick your difficulty & timer, then start practicing!",
            );
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not start demo room");
          }
        };

        window.cbJoin = async function (id) {
          const me = cbMe();
          try {
            const snap = await get(cbGref(id));
            const g = snap.val();
            if (!g) {
              cbToast("⚠️ Game no longer exists");
              return;
            }
            if (g.status === "finished") {
              cbToast("⚠️ Game already finished");
              return;
            }
            if (g.isScheduled) {
              const sched = window._activeSchedules && window._activeSchedules[g.scheduledType || "cb"];
              const isCreator = (sched && sched.scheduledBy === me.id) || g.hostId === me.id;
              if (isCreator && g.hostId !== me.id) {
                await update(cbGref(id), { hostId: me.id, hostName: me.name });
                g.hostId = me.id;
              }
            }
            // join as a full participant whenever the room is open — lobby or already
            // playing — so latecomers can jump straight into the current round instead
            // of just spectating. Only a finished room (handled above) is join-proof.
            if (!(g.players && g.players[me.id])) {
              const count = g.players ? Object.keys(g.players).length : 0;
              if (count >= CB_MAX) {
                cbToast("⚠️ Game is full (50 players)");
                return;
              }
              await update(cbGref(id), {
                ["players/" + me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  wonCount: 0,
                },
              });
              await cbPushFeed(id, {
                t: "s",
                x:
                  me.name +
                  (g.status === "playing" ? " joined the battle!" : " joined"),
                ts: Date.now(),
              });
              await cbLobbySet(id, { n: count + 1, up: Date.now() });
            }
            cbEnterGame(id);
          } catch (e) {
            cbToast("⚠️ " + (e.message || "Could not join"));
          }
        };

        /* Keep our instant optimistic win on screen until the authoritative server
         result echoes back. Firestore fires local onSnapshots (for our own pending
         writes) before the win transaction commits; without this they'd momentarily
         blank the winner. Once the server confirms a winner for this round — us or
         whoever was truly first — we stop overriding and show that. */
        function cbApplyPendingWin() {
          if (!cbPendingWin) return;
          const g = cbSnap;
          if (
            !g ||
            g.status !== "playing" ||
            !g.current ||
            g.round !== cbPendingWin.round
          ) {
            cbPendingWin = null;
            return;
          }
          if (g.current.winner) {
            cbPendingWin = null;
            return;
          } // server confirmed a winner → show the real one
          g.current.winner = cbPendingWin.id;
          g.current.answer = cbPendingWin.answer;
        }

        function cbEnterGame(id) {
          cbGameId = id;
          cbLastRound = 0;
          cbFinishSoundPlayed = false;
          cbPendingWin = null;
          cbStartHeartbeat(id); // keep this room alive in the lobby while we're here
          if (cbUnsubLobby) {
            cbUnsubLobby();
            cbUnsubLobby = null;
          }
          $cb("cbLobbyView").style.display = "none";
          $cb("cbGameView").style.display = "";
          $cb("cbFeed").innerHTML = "";
          cbUnsubGame = onValue(
            cbGref(id),
            (s) => {
              const v = s.val();
              if (!v) {
                cbToast("Room was closed");
                cbBackToLobby();
                return;
              }
              v.players = v.players || {};
              v.feed = cbFeedArr(v.feed);
              cbSnap = v;
              cbApplyPendingWin();
              cbRender();
            },
            (e) => console.warn("CB game listen failed:", e),
          );
        }

        /* leave the room; the room auto-terminates when the last player leaves */
        async function cbLeaveGame() {
          cbStopHeartbeat();
          if (cbUnsubGame) {
            cbUnsubGame();
            cbUnsubGame = null;
          }
          if (cbHostTimer) {
            clearTimeout(cbHostTimer);
            cbHostTimer = null;
          }
          if (cbAdvanceTimer) {
            clearTimeout(cbAdvanceTimer);
            cbAdvanceTimer = null;
          }
          if (cbSkipTimer) {
            clearTimeout(cbSkipTimer);
            cbSkipTimer = null;
          }
          cbAdvanceTimerRound = 0;
          cbSkipTimerRound = 0;
          cbStopCountdownUI();
          cbStopPromptTick();
          const id = cbGameId,
            me = cbMe(),
            g = cbSnap;
          cbGameId = null;
          cbSnap = null;
          if (!id || !g) return;
          try {
            if (!g.players || !g.players[me.id]) return; // spectator — nothing to clean up
            let wasHost = false;
            const res = await runTransaction(cbGref(id), (cur) => {
              if (!cur || !cur.players || !cur.players[me.id]) return cur;
              wasHost = cur.hostId === me.id;
              delete cur.players[me.id];
              const left = Object.keys(cur.players);
              if (left.length === 0) {
                if (cur.isScheduled && cur.status === "lobby") {
                  return cur; // Do not delete scheduled room while in lobby
                }
                return null; // last player out → terminate the room automatically
              }
              if (cur.hostId === me.id) {
                if (!cur.isScheduled) {
                  cur.hostId = left[0]; // host left → promote the next player
                }
              }
              return cur;
            });
            const schedBar = document.getElementById("cbScheduledRoomBar");
            if (schedBar) schedBar.style.display = "none";
            if (!res || !res.committed) return;
            const committedVal = res.snapshot ? res.snapshot.val() : null;
            if (!committedVal) {
              if (!isDemoId(id) && !String(id).startsWith("sched_")) {
                await cbLobbySet(id, {
                  id,
                  host: me.name,
                  st: "finished",
                  n: 0,
                  up: Date.now(),
                });
              }
              return;
            }
            const leftKeys = Object.keys(committedVal.players || {});
            const newHost = committedVal.players && committedVal.players[committedVal.hostId];
            const msgs =
              wasHost && newHost && !committedVal.isScheduled
                ? [
                    { t: "s", x: me.name + " left", ts: Date.now() },
                    {
                      t: "s",
                      x: "👑 " + newHost.name + " is the new host",
                      ts: Date.now() + 1,
                    },
                  ]
                : [{ t: "s", x: me.name + " left", ts: Date.now() }];
            await cbPushFeed(id, ...msgs);
            if (!isDemoId(id) && !committedVal.isScheduled) {
              await cbLobbySet(id, {
                n: leftKeys.length,
                host: newHost ? newHost.name : "?",
                up: Date.now(),
              });
            }
          } catch (e) {
            /* best-effort cleanup */
          }
        }

        /* host-only: terminate the room for everyone (demo rooms hide this button —
         see cbRender — since leaving a solo demo already tears it down). */
        window.cbEndRoom = async function () {
          const g = cbSnap,
            me = cbMe();
          const canEnd = g && (g.hostId === me.id);
          if (!g || !canEnd) return;
          if (!confirm("End this room for everyone?")) return;
          const id = cbGameId;
          try {
            const top = Object.values(g.players || {}).sort(
              (a, b) => b.wonCount - a.wonCount,
            )[0];
            await update(cbGref(id), { status: "finished" });
            if (g && g.isScheduled) {
              await remove(ref(rdb, "eventSchedules/" + (g.scheduledType || "cb"))).catch(() => {});
            }
            await cbPushFeed(id, {
              t: "s",
              x:
                "🛑 The host ended the room." +
                (g.status === "playing" && top
                  ? " Top score: " + top.name + " (" + top.wonCount + " cards)"
                  : ""),
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled)
              await cbLobbySet(id, { st: "finished", up: Date.now() });
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not end the room");
          }
        };

        function cbBackToLobby() {
          if (window._cbAutoCloseTimer) {
            clearInterval(window._cbAutoCloseTimer);
            window._cbAutoCloseTimer = null;
          }
          cbStopHeartbeat();
          if (cbUnsubGame) {
            cbUnsubGame();
            cbUnsubGame = null;
          }
          if (cbAdvanceTimer) {
            clearTimeout(cbAdvanceTimer);
            cbAdvanceTimer = null;
          }
          if (cbSkipTimer) {
            clearTimeout(cbSkipTimer);
            cbSkipTimer = null;
          }
          cbAdvanceTimerRound = 0;
          cbSkipTimerRound = 0;
          cbStopCountdownUI();
          cbStopPromptTick();
          cbGameId = null;
          cbSnap = null;
          const schedBar = document.getElementById("cbScheduledRoomBar");
          if (schedBar) schedBar.style.display = "none";
          $cb("cbGameView").style.display = "none";
          $cb("cbEndBtn").style.display = "none";
          $cb("cbLobbyView").style.display = "";
          if (cbUnsubLobby) {
            cbUnsubLobby();
            cbUnsubLobby = null;
          }
          cbUnsubLobby = onValue(cbLobbyRef, (s) =>
            cbRenderLobby(s.val() || {}),
          );
        }

        /* host-only, lobby-only: pick the difficulty before starting.
         easy: pure fill-in-the-blank reveal, no jumbled rounds.
         medium: ~33.33% of rounds are jumbled-letter instead of reveal.
         hard: ~50% jumbled rounds, longer 30s timer, and keyboard-suggestion blocking. */
        window.cbSetDifficulty = async function (d) {
          const picker = document.getElementById("cbDiffPicker");
          if (picker) {
            picker.querySelectorAll(".cb-diff-btn").forEach((b) =>
              b.classList.toggle("active", b.dataset.diff === d),
            );
          }
          const g = cbSnap,
            me = cbMe();
          if (g) g.difficulty = d;
          if (!g || g.hostId !== me.id || g.status !== "lobby") return;
          try {
            await update(cbGref(cbGameId), { difficulty: d });
          } catch (e) {
            console.warn(e);
          }
        };

        /* host-only, lobby-only: pick how many seconds each question stays live
         before it auto-skips (also drives the visible per-round countdown chip). */
        window.cbSetTimer = async function (secs) {
          const picker = document.getElementById("cbTimerPicker");
          if (picker) {
            picker.querySelectorAll(".cb-timer-btn").forEach((b) =>
              b.classList.toggle("active", parseInt(b.dataset.secs, 10) === secs),
            );
          }
          const g = cbSnap,
            me = cbMe();
          if (g) g.questionSecs = secs;
          if (!g || g.hostId !== me.id || g.status !== "lobby") return;
          try {
            await update(cbGref(cbGameId), { questionSecs: secs });
          } catch (e) {
            console.warn(e);
          }
        };

        /* ════════ GAME FLOW ════════ */
        window.cbStart = async function () {
          if (window._cbAutoCloseTimer) {
            clearInterval(window._cbAutoCloseTimer);
            window._cbAutoCloseTimer = null;
          }
          const g = cbSnap,
            me = cbMe();
          if (!g) return;
          const isHost = g.hostId === me.id;
          const isSchedDue = g.isScheduled && Date.now() >= (g.scheduledTime || 0);
          if (!isHost && !isSchedDue) return;
          if (g.status !== "lobby") return;

          const pool = cbPool();
          if (pool.length < CB_ROUNDS) {
            cbToast("⚠️ Card pool not loaded yet");
            return;
          }
          const startBtn = $cb("cbStartBtn");
          if (startBtn) {
            startBtn.style.setProperty("display", "none", "important");
            startBtn.classList.add("cb-hidden");
          }
          const deck = cbShuffle(pool.slice()).slice(0, CB_ROUNDS); // all 150 cards, freshly reshuffled for this room
          const difficulty = g.difficulty || "easy";
          const current = cbNewCurrent(deck[0], difficulty);
          const id = cbGameId;

          try {
            let didTransition = false;
            const res = await runTransaction(cbGref(id), (cur) => {
              if (!cur || cur.status !== "lobby") return; // abort if already started by another client
              cur.status = "playing";
              cur.startedAt = Date.now();
              cur.deck = deck;
              cur.round = 1;
              cur.difficulty = difficulty;
              cur.current = current;
              didTransition = true;
              return cur;
            });
            if (!res || !res.committed || !didTransition) return;

            await cbPushFeed(id, {
              t: "s",
              x:
                "⚔️ Battle started! Round 1 of " +
                CB_ROUNDS +
                " — first correct answer wins the card!",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled) {
              await cbLobbySet(id, { st: "playing", up: Date.now() });
            }
          } catch (e) {
            console.warn(e);
            if (startBtn) {
              startBtn.style.removeProperty("display");
              startBtn.classList.remove("cb-hidden");
            }
            cbToast("⚠️ Could not start");
          }
        };

        async function cbGuess(text) {
          const g = cbSnap,
            me = cbMe();
          if (
            !g ||
            g.status !== "playing" ||
            !g.current ||
            g.current.winner ||
            g.current.timedOut
          )
            return;
          const p = g.players[me.id];
          if (!p || p.wonCount >= CB_CAP) return;
          if (p.lockedRound === g.round) {
            cbToast("🔒 You are locked by Admin for this round!");
            return;
          }
          const wonCard = g.deck[g.round - 1]; // full card {n,e,s} — needed to add it to the collection
          const answer = wonCard.n;
          const ok = cbNorm(text) === cbNorm(answer);

          // ── INSTANT winner reveal — zero network wait ──
          // The moment a correct answer is typed we patch the local snapshot and
          // re-render, so the announcement shows immediately with no round-trip.
          // cbPendingWin keeps it on screen (see the snapshot handler) until the
          // authoritative server result arrives; if someone was genuinely faster,
          // that result reconciles the banner to the true winner.
          if (ok) {
            cbPendingWin = { round: g.round, id: me.id, answer };
            g.current.winner = me.id;
            g.current.answer = answer;
            cbRender();
          } else {
            // Wrong guess → show it in the chat feed and stop. (A correct guess is NOT
            // broadcast separately — the authoritative win entry below announces it,
            // which also lets the claim commit in a single round-trip = faster for all.)
            cbToast("❌ Not quite — try again!");
            try {
              SFX.heartLost();
            } catch (e) {} // short buzz on a wrong guess
            cbPushFeed(cbGameId, {
              t: "a",
              n: me.name,
              av: me.avatar,
              x: text.slice(0, 40),
              ok: false,
              ts: Date.now(),
            });
            return;
          }
          // first correct answer wins — atomic claim via RTDB transaction (authoritative)
          let claimed = false,
            winnerName = null;
          try {
            const res = await runTransaction(cbGref(cbGameId), (cur) => {
              if (
                !cur ||
                cur.status !== "playing" ||
                cur.round !== g.round ||
                (cur.current && (cur.current.winner || cur.current.timedOut))
              )
                return; // abort — someone was faster or time ran out
              const mine = cur.players && cur.players[me.id];
              if (!mine || mine.wonCount >= CB_CAP || mine.lockedRound === cur.round) return; // abort
              mine.wonCount = (mine.wonCount || 0) + 1;
              cur.current.winner = me.id;
              cur.current.answer = answer;
              cur.feed = cbFeedArr(cur.feed);
              cur.feed.push({
                t: "w",
                n: me.name,
                av: me.avatar,
                x: answer,
                ts: Date.now(),
              });
              if (mine.wonCount >= CB_CAP)
                cur.feed.push({
                  t: "s",
                  x:
                    "🔒 " +
                    me.name +
                    " reached the 10-card cap — chat only now",
                  ts: Date.now() + 1,
                });
              if (cur.feed.length > 160) cur.feed = cur.feed.slice(-120);
              return cur;
            });
            const v = res && res.snapshot ? res.snapshot.val() : null;
            claimed = !!(
              res &&
              res.committed &&
              v &&
              v.current &&
              v.current.winner === me.id
            );
            if (!claimed && v && v.current && v.current.winner && v.players) {
              const w = v.players[v.current.winner];
              winnerName = w ? w.name : null;
            }
          } catch (e) {
            console.warn("CB claim failed:", e);
            claimed = false;
          }
          if (!claimed) {
            if (cbPendingWin && cbPendingWin.round === g.round) {
              cbPendingWin = null;
            }
            if (cbSnap && cbSnap.round === g.round && cbSnap.current && cbSnap.current.winner === me.id) {
              delete cbSnap.current.winner;
              delete cbSnap.current.answer;
            }
            if (g && g.round === cbSnap?.round && g.current && g.current.winner === me.id) {
              delete g.current.winner;
              delete g.current.answer;
            }
            cbRender();
          }
          if (claimed) {
            if (g.demo) {
              // Demo rooms are practice only — no real card reward, no collection change.
              cbToast(
                "🎓 Correct — " +
                  wonCard.n +
                  "! (practice mode, no card awarded)",
              );
            } else {
              // Real reward: drop the won card + 100 coins into this player's collection & balance.
              // Only the client that authoritatively claimed the win runs this, so the
              // card and coins land for the winner (and not for players who were slower).
              const added = window.cbAwardCardToCollection
                ? window.cbAwardCardToCollection(
                    wonCard.n,
                    wonCard.e,
                    wonCard.s,
                  )
                : false;
              cbToast(
                added
                  ? "🎉 " +
                      (wonCard.e ? wonCard.e + " " : "") +
                      wonCard.n +
                      " + 100 🪙 added to collection!"
                  : "🏆 You won " + wonCard.n + " + 100 🪙!",
              );
            }
          } else {
            // Correct, but someone was first — still show it in chat (green) with a note.
            cbPushFeed(cbGameId, {
              t: "a",
              n: me.name,
              av: me.avatar,
              x: answer,
              ok: true,
              late: winnerName || "someone",
              ts: Date.now(),
            });
            cbToast(
              "😬 Correct — but " + (winnerName || "someone") + " was faster!",
            );
          }
          // Note: the actual 3s "advance to next question" timer is scheduled inside
          // cbRender() for EVERY connected client (not just the winner) once it sees

          // g.current.winner become truthy — this makes the reveal → next-card timing
          // reliable even if the winning player's tab is backgrounded or closed.
        }

        // advance to the next round (round winner does it; host is the fallback watchdog).
        // Also handles the timedOut path (nobody answered in time) — pushes the
        // "no one solved it" feed message with the correct answer as it moves on.
        async function cbAdvance(fromRound) {
          if (!cbGameId) return;
          const id = cbGameId;
          try {
            const res = await runTransaction(cbGref(id), (g) => {
              if (
                !g ||
                g.status !== "playing" ||
                g.round !== fromRound ||
                !g.current ||
                (!g.current.winner && !g.current.timedOut)
              )
                return; // abort
              g.feed = cbFeedArr(g.feed);
              if (g.feed.length > 220) g.feed = g.feed.slice(-140);
              if (g.current.timedOut && !g.current.winner) {
                const card = g.deck[g.round - 1];
                g.feed.push({
                  t: "s",
                  x: `⏭️ No one solved it in time! ✅ Correct answer: "${card.n}"`,
                  ts: Date.now(),
                });
              }
              // NOTE: reaching the 10-card cap no longer ends the game by itself — capped
              // players just can't answer anymore, but the room keeps cycling cards until
              // the full 150-card deck is exhausted or the host ends it manually.
              if (g.round >= CB_ROUNDS) {
                const top = Object.values(g.players || {}).sort(
                  (a, b) => b.wonCount - a.wonCount,
                )[0];
                g.status = "finished";
                g.feed.push({
                  t: "s",
                  x:
                    "🏁 Game over! Champion: " +
                    (top ? top.name + " (" + top.wonCount + " cards)" : "—"),
                  ts: Date.now(),
                });
                finished = true;
              } else {
                g.current = cbNewCurrent(
                  g.deck[g.round],
                  g.difficulty || "easy",
                ); // deck 0-based, g.round still old (1-based) → next card
                g.round = g.round + 1;
                if (g.players) {
                  Object.values(g.players).forEach((pl) => {
                    if (pl && pl.lockedRound && pl.lockedRound < g.round) {
                      delete pl.lockedRound;
                    }
                  });
                }
              }
              return g;
            });
            if (res && res.committed) {
              const snapVal = res.snapshot ? res.snapshot.val() : null;
              if (finished && snapVal && snapVal.isScheduled) {
                remove(ref(rdb, "eventSchedules/" + (snapVal.scheduledType || "cb"))).catch(() => {});
              }
              if (!isDemoId(id) && (!snapVal || !snapVal.isScheduled)) {
                cbLobbySet(
                  id,
                  finished
                    ? { st: "finished", up: Date.now() }
                    : { up: Date.now() },
                );
              }
            }
          } catch (e) {
            console.warn("CB advance failed:", e);
          }
        }

        // Fallback: if nobody answers a round correctly in time — e.g. every player
        // currently in the room has already hit the 15-card win cap — flag the round
        // as timed-out. cbRender() then shows the correct word in the announcement
        // card for 3s (same pattern as the winner reveal) before cbAdvance() moves
        // the game on to the next card, so the board never freezes forever.
        async function cbSkipRound(fromRound) {
          if (!cbGameId) return;
          const id = cbGameId;
          try {
            await runTransaction(cbGref(id), (g) => {
              if (
                !g ||
                g.status !== "playing" ||
                g.round !== fromRound ||
                !g.current ||
                g.current.winner ||
                g.current.timedOut
              )
                return; // already handled
              g.current.timedOut = true;
              return g;
            });
          } catch (e) {
            console.warn("CB skip failed:", e);
          }
        }

        /* Admin / Host: lock or unlock a player from answering in the next round */
        window.cbTogglePlayerLock = async function (targetPid) {
          const g = cbSnap,
            me = cbMe();
          const canAdminLock = Boolean(g && g.hostId === me.id);
          if (!g || !canAdminLock || !targetPid || !cbGameId || g.status === "finished" || targetPid === me.id) return;
          const p = g.players && g.players[targetPid];
          if (!p) return;

          const currentRound = g.round || 0;
          const nextRound = g.status === "lobby" ? 1 : currentRound + 1;
          const isAlreadyLocked = p.lockedRound === nextRound || (p.lockedRound === currentRound && g.status === "playing");
          const newLockedRound = isAlreadyLocked ? null : nextRound;

          try {
            await update(ref(rdb, "cbGames/" + cbGameId + "/players/" + targetPid), {
              lockedRound: newLockedRound,
            });
            await cbPushFeed(cbGameId, {
              t: "s",
              x: newLockedRound
                ? `🔒 ${me.name} locked ${p.name} from guessing in round ${newLockedRound}`
                : `🔓 ${me.name} unlocked ${p.name}`,
              ts: Date.now(),
            });
          } catch (e) {
            console.warn("CB toggle lock failed:", e);
            cbToast("⚠️ Failed to update lock status");
          }
        };

        /* ════════ RENDER (single source of truth: the Firestore snapshot) ════════ */
        function cbRender() {
          const g = cbSnap;
          if (!g) return;
          const me = cbMe();
          const isHost = Boolean(g && g.hostId && g.hostId === me.id);
          const myP = g.players[me.id];
          const capped = myP && myP.wonCount >= CB_CAP;

          if (g.isScheduled && g.status === "lobby" && Date.now() >= (g.scheduledTime || 0)) {
            const diff = (g.scheduledTime || 0) - Date.now();
            if (!window._cbAutoStarting && (isHost || diff <= -1500)) {
              window._cbAutoStarting = true;
              cbStart().finally(() => {
                setTimeout(() => { window._cbAutoStarting = false; }, 2000);
              });
            }
          }

          const _cbStartBtn = $cb("cbStartBtn");
          if (_cbStartBtn) {
            const _showStart = g.status === "lobby" && isHost;
            if (_showStart) {
              _cbStartBtn.style.removeProperty("display");
              _cbStartBtn.style.display = "";
              _cbStartBtn.classList.remove("cb-hidden");
            } else {
              _cbStartBtn.style.setProperty("display", "none", "important");
              _cbStartBtn.classList.add("cb-hidden");
            }
          }
          const _cbEndBtn = $cb("cbEndBtn");
          if (_cbEndBtn) {
            const _showEnd = isHost && g.status !== "finished" && !g.demo;
            if (_showEnd) {
              _cbEndBtn.style.removeProperty("display");
              _cbEndBtn.style.display = "";
              _cbEndBtn.classList.remove("cb-hidden");
            } else {
              _cbEndBtn.style.setProperty("display", "none", "important");
              _cbEndBtn.classList.add("cb-hidden");
            }
          }

          // set chips (real set + decoy, like Jumbled Jackpot)
          const chips = $cb("cbSetChips");
          if (g.status === "playing" && g.current && g.current.sA) {
            chips.style.display = "";
            $cb("cbSetChipA").textContent = g.current.sA;
            $cb("cbSetChipB").textContent = g.current.sB;
          } else chips.style.display = "none";

          // difficulty picker: host can change it while still in the lobby; everyone
          // else (and the host once playing) just sees the chosen difficulty as a tag.
          const diffPicker = $cb("cbDiffPicker");
          const curDiff = g.difficulty || "easy";
          if (diffPicker) {
            diffPicker.style.display =
              g.status === "lobby" && isHost ? "" : "none";
            diffPicker
              .querySelectorAll(".cb-diff-btn")
              .forEach((b) =>
                b.classList.toggle("active", b.dataset.diff === curDiff),
              );
          }

          // question timer picker: host-only, lobby-only (same pattern as difficulty above)
          const timerPicker = $cb("cbTimerPicker");
          const curSecs = g.questionSecs || (curDiff === "hard" ? 30 : 25);
          if (timerPicker) {
            timerPicker.style.display =
              g.status === "lobby" && isHost ? "" : "none";
            timerPicker
              .querySelectorAll(".cb-timer-btn")
              .forEach((b) =>
                b.classList.toggle(
                  "active",
                  Number(b.dataset.secs) === curSecs,
                ),
              );
          }

          if (g.status === "lobby") {
            const diffTag =
              { easy: "😌 Easy", medium: "🙂 Medium", hard: "🔥 Hard" }[
                curDiff
              ] || curDiff;
            $cb("cbRoundInfo").textContent =
              "Waiting to start · " +
              Object.keys(g.players).length +
              "/" +
              CB_MAX +
              " players" +
              (isHost
                ? " · you are the host"
                : " · host: " + ((g.players[g.hostId] || {}).name || "?")) +
              " · " +
              diffTag +
              " · ⏱️ " +
              curSecs +
              "s";
            $cb("cbCard").classList.remove("cb-winner", "cb-pop");
            if (g.isScheduled && g.scheduledTime) {
              const schedBar = document.getElementById("cbScheduledRoomBar");
              const schedCount = document.getElementById("cbScheduledRoomCountdown");
              if (schedBar) schedBar.style.display = "block";
              const diff = g.scheduledTime - Date.now();
              const timeInfo = formatEventTime(g.scheduledTime);
              if (diff <= 0) {
                if (schedCount) schedCount.textContent = "🔴 LIVE NOW";
                $cb("cbCard").innerHTML = '<div style="font-weight:800;color:#ffd54f;font-size:1.05rem;">🔴 EVENT IS LIVE NOW!</div><div style="font-size:0.85rem;color:#e0d4fc;margin-top:4px;">Starting any moment…</div>';
              } else {
                if (schedCount) schedCount.textContent = "⏳ Event in " + formatCountdown(diff);
                $cb("cbCard").innerHTML = `<div style="font-weight:800;color:#ffd54f;font-size:1.05rem;margin-bottom:4px;">⭐ OFFICIAL SCHEDULED BATTLE</div><div style="font-size:1.8rem;font-weight:900;color:#ffffff;margin-bottom:4px;">⏳ Event in ${formatCountdown(diff)}</div><div style="font-size:0.82rem;color:#e0d4fc;">🕒 Scheduled for: ${escapeHtml(timeInfo.ist)}</div>`;
              }
            } else {
              const schedBar = document.getElementById("cbScheduledRoomBar");
              if (schedBar) schedBar.style.display = "none";
              $cb("cbCard").textContent = "— — —";
            }
            $cb("cbCardHint").textContent = "";
            $cb("cbAnnounce").textContent = "";
            cbStopCountdownUI();
            cbStopPromptTick();
          } else if (g.status === "playing" && g.current) {
            const schedBar = document.getElementById("cbScheduledRoomBar");
            if (schedBar) schedBar.style.display = "none";
            $cb("cbRoundInfo").textContent =
              "Round " + g.round + " / " + CB_ROUNDS;
            const _card = $cb("cbCard");
            if (g.current.winner) {
              const w = g.players[g.current.winner];
              // Winner announcement REPLACES the question card, holds for 5s, then advances.
              const _cbShowWinEmoji = (g.difficulty || "easy") === "easy";
              _card.textContent = "";
              _card.append(
                "🏆 ",
                avatarNode(w ? w.avatar : "🧙", w ? w.photoURL : "", 24, g.current.winner, w ? w.name : "?"),
                " " +
                  (w ? w.name : "?") +
                  " won " +
                  (_cbShowWinEmoji && g.current.e ? g.current.e + " " : "") +
                  "\u201c" +
                  g.current.answer +
                  "\u201d!",
              );
              _card.classList.add("cb-winner");
              $cb("cbCardHint").textContent = "";
              $cb("cbAnnounce").textContent = ""; // announcement lives in the card now
              // No-winner fallback timer no longer applies once someone has won.
              if (cbSkipTimer) {
                clearTimeout(cbSkipTimer);
                cbSkipTimer = null;
                cbSkipTimerRound = 0;
              }
              // Every connected client (not just the host) schedules the 5s advance —
              // this keeps the pace snappy and reliable even if the winner's own tab
              // is backgrounded or gets closed right after answering. Guarded per
              // round so onSnapshot re-renders don't stack duplicate timers; the
              // advance transaction itself is idempotent so multiple clients racing
              // to call it is harmless (only the first succeeds).
              if (cbAdvanceTimerRound !== g.round) {
                cbAdvanceTimerRound = g.round;
                if (cbAdvanceTimer) clearTimeout(cbAdvanceTimer);
                cbAdvanceTimer = setTimeout(() => {
                  cbAdvanceTimer = null;
                  cbAdvance(g.round);
                }, 5000);
                cbStartCountdownUI(5, (s) => "🏆 Next card in " + s + "s");
                try {
                  SFX.win();
                } catch (e) {} // triumphant fanfare the instant a winner is locked in
                _card.classList.remove("cb-pop");
                void _card.offsetWidth;
                _card.classList.add("cb-pop"); // pop the reveal in the card
              }
              cbStopPromptTick();
            } else if (g.current.timedOut) {
              // Nobody solved it in time — reveal the correct word in the question
              // card (same "announcement replaces card" pattern as the winner path),
              // hold it for 3s, then advance to the next card.
              const card = g.deck[g.round - 1];
              const _cbShowEmoji = (g.difficulty || "easy") === "easy";
              _card.classList.remove("cb-winner");
              _card.textContent =
                "⏰ Time\u2019s up! " +
                (_cbShowEmoji && g.current.e ? g.current.e + " " : "") +
                "\u201c" +
                card.n +
                "\u201d";
              $cb("cbCardHint").textContent = "";
              $cb("cbAnnounce").textContent = ""; // announcement lives in the card now
              // The auto-skip fallback timer has already done its job for this round.
              if (cbSkipTimer) {
                clearTimeout(cbSkipTimer);
                cbSkipTimer = null;
                cbSkipTimerRound = 0;
              }
              if (cbAdvanceTimerRound !== g.round) {
                cbAdvanceTimerRound = g.round;
                if (cbAdvanceTimer) clearTimeout(cbAdvanceTimer);
                cbAdvanceTimer = setTimeout(() => {
                  cbAdvanceTimer = null;
                  cbAdvance(g.round);
                }, 3000);
                cbStartCountdownUI(3, (s) => "⏭️ Next card in " + s + "s");
                _card.classList.remove("cb-pop");
                void _card.offsetWidth;
                _card.classList.add("cb-pop"); // pop the reveal in the card
              }
              cbStopPromptTick();
            } else {
              _card.classList.remove("cb-winner", "cb-pop"); // back to the normal question look
              _card.textContent = cbRenderPromptText(g);
              $cb("cbCardHint").textContent =
                g.current.mode === "jumbled"
                  ? "🔀 Unscramble the letters — the card is from one of the two sets above"
                  : g.current.exact
                    ? "⭐ Exact name shown — type it fast!"
                    : "Fill in the blanks — more letters reveal over time — the card is from one of the two sets above";
              $cb("cbAnnounce").textContent = "";
              if (cbAdvanceTimer) {
                clearTimeout(cbAdvanceTimer);
                cbAdvanceTimer = null;
              }
              cbAdvanceTimerRound = 0;
              // Fallback: if no one answers this round correctly in time — most
              // commonly because everyone left in the room has already hit the
              // 15-card win cap — skip to the next card anyway so the game keeps
              // showing new questions instead of freezing on one forever.
              // Host-configured question timer (falls back to the old difficulty-based
              // default for rooms created before this setting existed).
              const skipSecs = g.questionSecs || (curDiff === "hard" ? 30 : 25);
              if (cbSkipTimerRound !== g.round) {
                cbSkipTimerRound = g.round;
                if (cbSkipTimer) clearTimeout(cbSkipTimer);
                cbSkipTimer = setTimeout(() => {
                  cbSkipTimer = null;
                  cbSkipRound(g.round);
                }, skipSecs * 1000);
                cbStartCountdownUI(
                  skipSecs,
                  (s) => "⏳ Auto-skip in " + s + "s",
                  10,
                );
              }
              // Ticks the progressive-reveal prompt text once per second (no-op for
              // jumbled/exact rounds, cheap either way). Guarded per round like the
              // other timers above so re-renders don't stack duplicate intervals.
              if (cbPromptTickRound !== g.round) {
                cbPromptTickRound = g.round;
                cbStopPromptTick(true);
                cbPromptTickTimer = setInterval(() => {
                  if (
                    !cbSnap ||
                    cbSnap.status !== "playing" ||
                    cbSnap.round !== g.round ||
                    (cbSnap.current &&
                      (cbSnap.current.winner || cbSnap.current.timedOut))
                  ) {
                    cbStopPromptTick();
                    return;
                  }
                  const c = $cb("cbCard");
                  if (c) c.textContent = cbRenderPromptText(cbSnap);
                }, 1000);
              }
              if (g.round !== cbLastRound) {
                // new round → flip sound + focus (NEVER wipe in-progress typing)
                cbLastRound = g.round;
                try {
                  SFX.flip();
                } catch (e) {} // swoosh as the next card flips in
                const inp = $cb("cbUnifiedInput");
                if (myP && !capped && !inp.value) inp.focus(); // keep whatever is being typed; only auto-focus an empty box
              }
            }
          } else if (g.status === "finished") {
            const scores = Object.values(g.players).sort(
              (a, b) => b.wonCount - a.wonCount,
            );
            $cb("cbRoundInfo").textContent = "Game finished";
            $cb("cbCard").classList.remove("cb-winner", "cb-pop");
            $cb("cbCardHint").textContent = "";
            const cbAnn = $cb("cbAnnounce");
            cbAnn.textContent = "";
            if (scores[0]) {
              cbAnn.append(
                "🎉 Champion: ",
                avatarNode(scores[0].avatar, scores[0].photoURL, 20, scores[0].pid, scores[0].name),
                " " +
                  scores[0].name +
                  " with " +
                  scores[0].wonCount +
                  " cards!",
              );
            }
            if (!cbFinishSoundPlayed) {
              cbFinishSoundPlayed = true;
              try {
                SFX.win();
              } catch (e) {}
            }
            if (cbAdvanceTimer) {
              clearTimeout(cbAdvanceTimer);
              cbAdvanceTimer = null;
            }
            if (cbSkipTimer) {
              clearTimeout(cbSkipTimer);
              cbSkipTimer = null;
            }
            cbAdvanceTimerRound = 0;
            cbSkipTimerRound = 0;
            cbStopCountdownUI();
            cbStopPromptTick();

            if (!window._cbAutoCloseTimer) {
              let cbCloseLeft = 6;
              const updateCbCard = () => {
                const cardEl = $cb("cbCard");
                if (cardEl) {
                  cardEl.innerHTML = `
                    <div style="font-size:1.15rem;font-weight:900;color:var(--gold);margin-bottom:4px;">🏁 GAME OVER</div>
                    <div style="font-size:0.85rem;color:#e0d4fc;">${scores[0] ? escapeHtml(scores[0].name) + ' won with ' + scores[0].wonCount + ' cards!' : 'Game complete!'}</div>
                    <div style="font-size:0.82rem;color:#ffd54f;margin-top:8px;font-weight:700;">⏱️ Closing room in ${cbCloseLeft}s…</div>
                  `;
                }
              };
              updateCbCard();
              window._cbAutoCloseTimer = setInterval(() => {
                cbCloseLeft--;
                if (cbCloseLeft <= 0) {
                  if (window._cbAutoCloseTimer) {
                    clearInterval(window._cbAutoCloseTimer);
                    window._cbAutoCloseTimer = null;
                  }
                  cbBackToLobby();
                } else {
                  updateCbCard();
                }
              }, 1000);
            } else if (!$cb("cbCard").innerHTML.includes("Closing room in")) {
              $cb("cbCard").textContent = "🏁 GAME OVER";
            }
          }

          const isLockedThisRound = myP && myP.lockedRound === g.round;
          const isLockedNextRound = myP && myP.lockedRound === (g.round + 1);

          // unified input: answers while a round is live, chat otherwise (capped/spectators always chat)
          const canAnswer =
            g.status === "playing" &&
            !!myP &&
            !capped &&
            !isLockedThisRound &&
            g.current &&
            !g.current.winner &&
            !g.current.timedOut;
          $cb("cbUnifiedInput").placeholder = canAnswer
            ? "⚔️ Type, then Enter/Guess to answer — or 💬 Chat"
            : isLockedThisRound
              ? "🔒 Locked by Admin for this round — 💬 Chat only"
              : capped
                ? "🔒 Win cap reached (10 cards) — 💬 Chat only"
                : myP
                  ? "💬 Type, then press Chat…"
                  : "👀 Spectating — 💬 Chat only";

          const guessBtn = $cb("cbGuessBtn");
          if (guessBtn) {
            guessBtn.disabled = !canAnswer;
          }

          // scoreboard (left column)
          const sc = $cb("cbScores");
          sc.innerHTML = "";
          const canAdminLock = Boolean(g && g.hostId === me.id);
          const currentRound = g.round || 0;
          const nextRound = g.status === "lobby" ? 1 : currentRound + 1;

          Object.entries(g.players)
            .map(([pid, p]) => ({
              pid,
              name: p.name,
              avatar: p.avatar,
              photoURL: p.photoURL,
              wonCount: p.wonCount,
              lockedRound: p.lockedRound || null,
            }))
            .sort((a, b) => b.wonCount - a.wonCount)
            .forEach((p) => {
              const isLockedNow = p.lockedRound === currentRound && g.status === "playing";
              const isLockedNext = p.lockedRound === nextRound;
              const row = document.createElement("div");
              row.className =
                "cb-score-row" +
                (p.wonCount >= CB_CAP ? " capped" : "") +
                (isLockedNow || isLockedNext ? " is-locked" : "");
              const l = document.createElement("span");
              l.append(
                avatarNode(p.avatar, p.photoURL, 18, p.pid, p.name),
                " " +
                  p.name +
                  (p.pid === me.id ? " (you)" : "") +
                  (p.pid === g.hostId ? " 👑" : ""),
              );
              const r = document.createElement("span");
              r.textContent = p.wonCount + " 🃏";
              row.append(l, r);

              // Admin / Host Lock button or badge
              if (canAdminLock && p.pid !== me.id) {
                const lockBtn = document.createElement("button");
                lockBtn.type = "button";
                lockBtn.className = "cb-lock-btn" + (isLockedNow || isLockedNext ? " is-locked" : "");
                lockBtn.textContent = isLockedNow
                  ? "🔒 Locked (Now)"
                  : isLockedNext
                    ? "🔒 Locked (Next)"
                    : "🔓 Lock next";
                lockBtn.title = isLockedNow || isLockedNext
                  ? "Tap to unlock this player"
                  : "Tap to lock player in next round";
                lockBtn.onclick = (e) => {
                  e.stopPropagation();
                  window.cbTogglePlayerLock && window.cbTogglePlayerLock(p.pid);
                };
                row.appendChild(lockBtn);
              } else if (isLockedNow || isLockedNext) {
                const badge = document.createElement("span");
                badge.className = "cb-lock-badge";
                badge.textContent = isLockedNow ? "🔒 Locked (Now)" : "🔒 Locked (Next)";
                row.appendChild(badge);
              }

              sc.appendChild(row);
            });

          // feed (right column): chat + all answers + announcements (XSS-safe: textContent only)
          const feed = $cb("cbFeed");
          // Requirement: auto-scroll to new messages, but only while the user hasn't
          // scrolled up to read history. cbFeedShouldAutoScroll (set up in
          // cbWireKeyboardScrollLock) tracks that; fall back to a plain "was already
          // at the bottom" check if it hasn't been wired up yet for any reason.
          // Newest on TOP. Auto-scroll to the top only when the user is already near it,
          // so scrolling down to read older history isn't interrupted by new messages.
          const nearTop = feed.scrollTop <= CB_FEED_BOTTOM_TOLERANCE;
          feed.innerHTML = "";
          // Fallback avatar lookup by name, for older feed entries stored before the
          // avatar field (m.av) existed — keeps the chat/answers from showing blank.
          const cbAvByName = (n) => {
            const pl = Object.values(g.players || {}).find((p) => p.name === n);
            return pl ? pl.avatar : "🧙";
          };
          const cbPhByName = (n) => {
            const pl = Object.values(g.players || {}).find((p) => p.name === n);
            return pl ? pl.photoURL || "" : "";
          };
          (g.feed || [])
            .slice(-120)
            .reverse()
            .forEach((m) => {
              const div = document.createElement("div");
              if (m.t === "c") {
                div.className = "cb-chat";
                const av = document.createElement("span");
                av.className = "cb-av";
                av.appendChild(
                  avatarNode(m.av || cbAvByName(m.n), cbPhByName(m.n), 16),
                );
                const b = document.createElement("b");
                b.textContent = m.n + ": ";
                div.append(av, b, document.createTextNode(m.x));
              } else if (m.t === "a") {
                div.className = m.ok ? "cb-ans-ok" : "cb-ans-no"; // correct guesses are green
                const av = document.createElement("span");
                av.className = "cb-av";
                av.appendChild(
                  avatarNode(m.av || cbAvByName(m.n), cbPhByName(m.n), 16),
                );
                div.append(
                  av,
                  document.createTextNode(
                    (m.ok ? "✔ " : "✘ ") + m.n + ": " + m.x,
                  ),
                );
                if (m.ok && m.late) {
                  // "too slow" note is faded white/grey, not green
                  const note = document.createElement("span");
                  note.className = "cb-late-note";
                  note.textContent =
                    " (too slow — " + m.late + " guessed it first)";
                  div.appendChild(note);
                }
              } else if (m.t === "w") {
                div.className = "cb-ans-ok";
                const av = document.createElement("span");
                av.className = "cb-av";
                av.appendChild(
                  avatarNode(m.av || cbAvByName(m.n), cbPhByName(m.n), 16),
                );
                div.append(
                  av,
                  document.createTextNode("🏆 " + m.n + ' won "' + m.x + '"!'),
                );
              } else {
                div.className = "cb-sys";
                div.textContent = m.x;
              }
              feed.appendChild(div);
            });
          if (nearTop) feed.scrollTo({ top: 0, behavior: "smooth" });
        }

        /* ════════ UNIFIED INPUT: one box for answers + chat ════════ */
        function cbWire() {
          const f = $cb("cbUnifiedForm");
          if (!f) return;

          // Send whatever is typed as a CHAT message (instant local echo, then broadcast).
          const echoChat = (v, me) => {
            const msg = {
              t: "c",
              n: me.name,
              av: me.avatar,
              x: v.slice(0, 200),
              ts: Date.now(),
            };
            if (cbSnap) {
              cbSnap.feed = [...(cbSnap.feed || []), msg];
              cbRender();
            }
            cbPushFeed(cbGameId, msg);
          };
          const takeInput = () => {
            const inp = $cb("cbUnifiedInput");
            const v = inp.value.trim();
            inp.value = "";
            return v;
          };

          // Hard mode: block keyboard suggestions/autocorrect the same way Jumbled
          // Jackpot's spelling inputs do — HTML attributes alone aren't enough on
          // mobile, so detect a jump of 2+ chars in one input event (a tapped
          // suggestion) and roll it back, forcing the player to type it themselves.
          const cbAnswerInput = $cb("cbUnifiedInput");
          if (cbAnswerInput) {
            cbAnswerInput.dataset.prev = "";
            cbAnswerInput.addEventListener("keydown", function () {
              this.dataset.prev = this.value;
            });
            cbAnswerInput.addEventListener("input", function () {
              if (!cbSnap || cbSnap.difficulty !== "hard") {
                this.dataset.prev = this.value;
                return;
              }
              const prev = this.dataset.prev || "";
              const curr = this.value;
              if (curr.length - prev.length >= 2) {
                this.value = prev;
                cbToast("✋ No suggestions in Hard mode — type it yourself!");
                return;
              }
              this.dataset.prev = this.value;
            });
          }

          // 💬 Chat button → always sends the text as chat.
          const chatBtn = $cb("cbChatBtn");
          if (chatBtn)
            chatBtn.addEventListener("click", () => {
              const v = takeInput();
              if (!v || !cbGameId) return;
              echoChat(v, cbMe());
            });

          // ⚔️ Guess button + Enter key → sends the text as a guess. When there's nothing
          // to guess (lobby, spectator, capped, or the round is already won) it falls back
          // to chat so the Enter key is never dead.
          f.addEventListener("submit", (e) => {
            e.preventDefault();
            const v = takeInput();
            if (!v || !cbGameId) return;
            const g = cbSnap,
              me = cbMe();
            const myP = g && g.players[me.id];
            const isLockedThisRound = myP && myP.lockedRound === g.round;
            const canAnswer =
              g &&
              g.status === "playing" &&
              myP &&
              myP.wonCount < CB_CAP &&
              !isLockedThisRound &&
              g.current &&
              !g.current.winner &&
              !g.current.timedOut;
            if (canAnswer) {
              cbGuess(v);
            } else if (isLockedThisRound) {
              cbToast("🔒 You are locked by Admin for this round!");
              echoChat(v, me);
            } else {
              echoChat(v, me);
            }
          });

          // ── keyboard-open behavior: page stays put, only the chat feed scrolls to latest ──
          cbWireKeyboardScrollLock();
        }

        /* How near the bottom (in px) still counts as "at the bottom" for auto-scroll
         purposes — small tolerance so sub-pixel layout rounding doesn't break it. */
        const CB_FEED_BOTTOM_TOLERANCE = 48;

        // True if #cbFeed is scrolled at (or very near) its latest message.
        function cbFeedIsNearBottom() {
          // newest-on-top: "near latest" now means near the TOP
          const feed = $cb("cbFeed");
          if (!feed) return true;
          return feed.scrollTop <= CB_FEED_BOTTOM_TOLERANCE;
        }

        function cbWireKeyboardScrollLock() {
          const inp = $cb("cbUnifiedInput");
          const feed = $cb("cbFeed");
          const screen = $cb("cbScreen");
          if (!inp || !feed || !screen) return;

          // Requirement: auto-scroll to the newest message, but stop forcing it once
          // the user has scrolled up to read older messages — only resume once
          // they're back near the bottom themselves. `stickToBottom` tracks that.
          let stickToBottom = true;
          const scrollFeedToBottom = () => {
            feed.scrollTo({ top: 0, behavior: "smooth" });
            stickToBottom = true;
          }; // newest is on top now

          // Update the flag whenever the user (or anything else) scrolls the feed.
          feed.addEventListener(
            "scroll",
            () => {
              stickToBottom = cbFeedIsNearBottom();
            },
            { passive: true },
          );
          // cbRenderGame() (in the render loop) checks this before forcing a scroll
          // on new messages, so manual scroll-up-to-read-history is respected there too.
          window.cbFeedShouldAutoScroll = () => stickToBottom;
          window.cbScrollFeedToBottom = scrollFeedToBottom;

          /* ── Root-cause keyboard fix ──────────────────────────────────────────
           Rather than fighting the browser's own "scroll the focused input into
           view" behavior after the fact, we keep #cbScreen's real pixel height
           equal to `window.visualViewport.height` at all times. Combined with the
           interactive-widget=resizes-content viewport meta tag (which makes
           Android Chrome shrink the *layout* viewport for the keyboard too,
           rather than just overlaying it), this means:
             - #cbScreen already exactly matches the visible area whenever the
               keyboard is open, so the focused input is already on-screen —
               there's nothing for the browser to auto-scroll to reveal it.
             - The flex column inside (#cbGameView) shrinks .cb-battle-grid to
               fit, so the question bar and the input bar never move; only the
               players/chat panels (which already have their own internal scroll)
               get shorter.
           This runs continuously (not just on focus) so it also tracks the
           keyboard's open/close animation and orientation changes smoothly. */
          const vv = window.visualViewport;

          const applyViewportHeight = () => {
            if (!screen.classList.contains("cb-fullscreen")) return;
            /* PHASE 2: use the shared applyViewportHeight utility */
            window.applyViewportHeight(screen);
          };

          // FIX: scroll from several independent triggers instead of relying on a
          // single event. `visualViewport` resize/scroll events don't fire on every
          // browser/WebView the same way (and can be skipped entirely in some
          // in-app WebViews), which is why the feed sometimes never scrolled at
          // all. Firing on focus *and* on every visualViewport change *and* on a
          // short retry schedule as the keyboard animates open covers all of them —
          // whichever fires first gets the feed to the bottom, and the later ones
          // just confirm it once the keyboard has fully finished animating.
          const settleFeedScroll = () => {
            if (stickToBottom) scrollFeedToBottom();
          };

          if (vv) {
            vv.addEventListener("resize", () => {
              applyViewportHeight();
              settleFeedScroll();
            }); // keyboard show/hide, rotation
            vv.addEventListener("scroll", () => {
              applyViewportHeight();
              settleFeedScroll();
            }); // Android also fires this as the keyboard animates
            applyViewportHeight();
          }

          inp.addEventListener("focus", () => {
            stickToBottom = true;
            settleFeedScroll();
            window.scrollTo(0, 0); // iOS safety: body shouldn't scroll (overflow:hidden), but if it does, undo it
            [50, 120, 220, 350, 500].forEach((t) =>
              setTimeout(settleFeedScroll, t),
            );
          });
        }
        if (document.readyState === "loading")
          document.addEventListener("DOMContentLoaded", cbWire);
        else cbWire();

        /* ════════════════════════════════════════════════════════════════════
         JUMBLED JACKPOT & JACKPOT EVENT — CB-style multiplayer room entry
         Mirrors the Cards Battle room architecture (create w/ password, host
         starts for all) but each player then runs their own independently
         timed round using the existing Phase 1/2/3 engine defined earlier in
         this file (jjNextQuestion/jjStartTimer/jjFinalizeSubmission, etc. for
         Jumbled Jackpot; jpCapturePhase1Answers/jpStartTimer/jpFinalizeSubmission
         etc. for Jackpot Event). The room itself only gates WHEN everyone's
         round begins and ends — never the per-player question content or timer.
         ════════════════════════════════════════════════════════════════════ */

        const JJ_ROOM_PASSWORD = _ov("EQ0bGgADGgER"); // required to create a new JJ room
        const JP_ROOM_PASSWORD = _ov("EQ0bGgADGgER"); // required to create a new JP room
        const JJ_STALE_MS = 70 * 1000,
          JJ_HEARTBEAT_MS = 20 * 1000,
          JJ_MAX = 60;
        const JP_STALE_MS = 70 * 1000,
          JP_HEARTBEAT_MS = 20 * 1000,
          JP_MAX = 60;
        const jjLobbyRef = ref(rdb, "jjLobby");
        const jjGref = (id) => ref(rdb, "jjGames/" + id);
        const jpLobbyRef = ref(rdb, "jpLobby");
        const jpGref = (id) => ref(rdb, "jpGames/" + id);

        function jjPushFeed(id, ...msgs) {
          return runTransaction(ref(rdb, "jjGames/" + id + "/feed"), (arr) => {
            arr = cbFeedArr(arr);
            arr.push(...msgs);
            if (arr.length > 160) arr = arr.slice(-120);
            return arr;
          }).catch(() => {});
        }
        function jjLobbySet(id, fields) {
          if (String(id).startsWith("sched_") || (jjRoomSnap && jjRoomSnap.isScheduled)) return Promise.resolve();
          return update(ref(rdb, "jjLobby/" + id), fields).catch(() => {});
        }
        function jpPushFeed(id, ...msgs) {
          return runTransaction(ref(rdb, "jpGames/" + id + "/feed"), (arr) => {
            arr = cbFeedArr(arr);
            arr.push(...msgs);
            if (arr.length > 160) arr = arr.slice(-120);
            return arr;
          }).catch(() => {});
        }
        function jpLobbySet(id, fields) {
          if (String(id).startsWith("sched_") || (jpRoomSnap && jpRoomSnap.isScheduled)) return Promise.resolve();
          return update(ref(rdb, "jpLobby/" + id), fields).catch(() => {});
        }

        /* ── module state ── */
        let jjRoomId = null,
          jjRoomSnap = null,
          jjUnsubGame = null,
          jjUnsubLobby = null,
          jjHeartbeat = null,
          jjLocalStarted = false;
        let jpRoomId = null,
          jpRoomSnap = null,
          jpUnsubGame = null,
          jpUnsubLobby = null,
          jpHeartbeat = null,
          jpLocalStarted = false;

        /* ════════ PRESENCE / KEEP-ALIVE (same pattern as CB) ════════ */
        function jjStopHeartbeat() {
          if (jjHeartbeat) {
            clearInterval(jjHeartbeat);
            jjHeartbeat = null;
          }
        }
        function jjStartHeartbeat(id) {
          jjStopHeartbeat();
          jjHeartbeat = setInterval(() => {
            if (jjRoomId !== id) {
              jjStopHeartbeat();
              return;
            }
            jjLobbySet(id, { up: Date.now() });
          }, JJ_HEARTBEAT_MS);
        }
        function jpStopHeartbeat() {
          if (jpHeartbeat) {
            clearInterval(jpHeartbeat);
            jpHeartbeat = null;
          }
        }
        function jpStartHeartbeat(id) {
          jpStopHeartbeat();
          jpHeartbeat = setInterval(() => {
            if (jpRoomId !== id) {
              jpStopHeartbeat();
              return;
            }
            jpLobbySet(id, { up: Date.now() });
          }, JP_HEARTBEAT_MS);
        }

        /* ════════ OPEN / EXIT ════════ */
        window.jjOpenLobby = function () {
          if (window._jjHostFinishedTimer) {
            clearInterval(window._jjHostFinishedTimer);
            window._jjHostFinishedTimer = null;
          }
          if (typeof window.jjClearAutoClose === "function") window.jjClearAutoClose();
          if (jjRoomId) {
            jjLeaveGame().catch(() => {});
          }
          if (window.daPushRoomState) window.daPushRoomState("jj");
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "none";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "none";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "none";
          const strip = document.getElementById("eventsScheduleStrip");
          if (strip) strip.style.display = "none";
          const adminBar = document.getElementById("adminScheduleBar");
          if (adminBar) adminBar.style.display = "none";
          document.body.classList.add("jj-room-active");
          if (typeof applyEventControls === "function") applyEventControls();
          $cb("jjScreen").style.display = "";
          $cb("jjScreen").classList.add("jj-fullscreen");
          /* PHASE 2 FIX: sync Jumbled Jackpot room height with visualViewport */
          applyViewportHeight($cb("jjScreen"));
          $cb("jjLobbyView").style.display = "";
          $cb("jjGameView").style.display = "none";
          $cb("jjEndBtn").style.display = "none";
          if (jjUnsubLobby) {
            jjUnsubLobby();
            jjUnsubLobby = null;
          }
          jjUnsubLobby = onValue(
            jjLobbyRef,
            (s) => jjRenderLobby(s.val() || {}),
            (e) => {
              console.warn("JJ lobby listen failed:", e);
              cbToast("⚠️ Could not reach the Jumbled Jackpot lobby");
            },
          );
        };
        window.jpOpenLobby = function () {
          if (window._jpHostFinishedTimer) {
            clearInterval(window._jpHostFinishedTimer);
            window._jpHostFinishedTimer = null;
          }
          if (typeof window.jpClearAutoClose === "function") window.jpClearAutoClose();
          if (window.daPushRoomState) window.daPushRoomState("jp");
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "none";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "none";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "none";
          const strip = document.getElementById("eventsScheduleStrip");
          if (strip) strip.style.display = "none";
          const adminBar = document.getElementById("adminScheduleBar");
          if (adminBar) adminBar.style.display = "none";
          document.body.classList.add("jj-room-active");
          if (typeof applyEventControls === "function") applyEventControls();
          $cb("jpScreen").style.display = "";
          $cb("jpScreen").classList.add("jj-fullscreen");
          /* PHASE 2 FIX: sync Jackpot Event room height with visualViewport */
          applyViewportHeight($cb("jpScreen"));
          $cb("jpLobbyView").style.display = "";
          $cb("jpGameView").style.display = "none";
          $cb("jpEndBtn").style.display = "none";
          if (jpUnsubLobby) {
            jpUnsubLobby();
            jpUnsubLobby = null;
          }
          jpUnsubLobby = onValue(
            jpLobbyRef,
            (s) => jpRenderLobby(s.val() || {}),
            (e) => {
              console.warn("JP lobby listen failed:", e);
              cbToast("⚠️ Could not reach the Jackpot Event lobby");
            },
          );
        };

        window.jjExit = async function () {
          if (window._jjHostFinishedTimer) {
            clearInterval(window._jjHostFinishedTimer);
            window._jjHostFinishedTimer = null;
          }
          if (typeof window.jjClearAutoClose === "function") window.jjClearAutoClose();
          if (window.daClearRoomState) window.daClearRoomState();
          if (jjUnsubLobby) {
            jjUnsubLobby();
            jjUnsubLobby = null;
          }
          await jjLeaveGame();
          $cb("jjScreen").style.display = "none";
          $cb("jjScreen").classList.remove("jj-fullscreen");
          /* PHASE 2 FIX: clear inline viewport height and offset transform */
          clearViewportHeight($cb("jjScreen"));
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "";
          document.body.classList.remove("jj-room-active");
          if (typeof applyEventControls === "function") applyEventControls();
          if (typeof renderAllScheduleUI === "function") renderAllScheduleUI();
          if (typeof updateScheduleAdminVisibility === "function") updateScheduleAdminVisibility();
        };
        window.jpExit = async function () {
          if (window._jpHostFinishedTimer) {
            clearInterval(window._jpHostFinishedTimer);
            window._jpHostFinishedTimer = null;
          }
          if (typeof window.jpClearAutoClose === "function") window.jpClearAutoClose();
          if (window.daClearRoomState) window.daClearRoomState();
          if (jpUnsubLobby) {
            jpUnsubLobby();
            jpUnsubLobby = null;
          }
          await jpLeaveGame();
          $cb("jpScreen").style.display = "none";
          $cb("jpScreen").classList.remove("jj-fullscreen");
          /* PHASE 2 FIX: clear inline viewport height and offset transform */
          clearViewportHeight($cb("jpScreen"));
          ["daGatewayEntry", "jjEntry", "jpEntry", "cbEntry"].forEach((i) => {
            const el = $cb(i);
            if (el) el.style.display = "";
          });
          const cc = document.querySelector(".event-coming-card");
          if (cc) cc.style.display = "";
          const hh = document.getElementById("eventsHubHeader");
          if (hh) hh.style.display = "";
          document.body.classList.remove("jj-room-active");
          if (typeof applyEventControls === "function") applyEventControls();
          if (typeof renderAllScheduleUI === "function") renderAllScheduleUI();
          if (typeof updateScheduleAdminVisibility === "function") updateScheduleAdminVisibility();
        };

        /* Best-effort cleanup on tab close, same rationale as CB's pagehide handler. */
        window.addEventListener("pagehide", () => {
          if (jjRoomId) {
            jjStopHeartbeat();
            try {
              jjLeaveGame();
            } catch (e) {}
          }
          if (jpRoomId) {
            jpStopHeartbeat();
            try {
              jpLeaveGame();
            } catch (e) {}
          }
        });

        /* ════════ LOBBY ════════ */
        function jjRenderLobby(games) {
          const list = $cb("jjGameList");
          if (!list) return;
          const now = Date.now();
          const open = Object.values(games)
            .filter(
              (g) =>
                g &&
                g.st !== "finished" &&
                !g.isScheduled &&
                !String(g.id || "").startsWith("sched_") &&
                g.n > 0 &&
                now - (g.up || 0) < JJ_STALE_MS,
            )
            .sort((a, b) => (b.up || 0) - (a.up || 0));
          list.innerHTML = "";
          const hasSched = Boolean(
            window._activeSchedules &&
              window._activeSchedules.jj &&
              window._activeSchedules.jj.status === "scheduled",
          );
          $cb("jjNoGames").style.display = (open.length || hasSched) ? "none" : "";
          open.forEach((g) => {
            const row = document.createElement("div");
            row.className = "cb-game-row";
            const info = document.createElement("span");
            const modeTag = g.mode === "hard" ? "🔥 Hard · " : "";
            info.textContent =
              g.host +
              "'s room · " +
              modeTag +
              g.n +
              " player" +
              (g.n === 1 ? "" : "s") +
              (g.st === "playing" ? " · in progress" : " · waiting to start");
            const btn = document.createElement("button");
            btn.className = "btn btn-gold";
            btn.style.cssText = "padding:5px 14px;font-size:.78rem";
            btn.textContent = g.st === "playing" ? "Join & Play" : "Join";
            btn.onclick = () => jjJoin(g.id);
            row.append(info, btn);
            list.appendChild(row);
          });
        }
        function jpRenderLobby(games) {
          const list = $cb("jpGameList");
          if (!list) return;
          const now = Date.now();
          const open = Object.values(games)
            .filter(
              (g) =>
                g &&
                g.st !== "finished" &&
                !g.isScheduled &&
                !String(g.id || "").startsWith("sched_") &&
                g.n > 0 &&
                now - (g.up || 0) < JP_STALE_MS,
            )
            .sort((a, b) => (b.up || 0) - (a.up || 0));
          list.innerHTML = "";
          const hasSched = Boolean(
            window._activeSchedules &&
              window._activeSchedules.jp &&
              window._activeSchedules.jp.status === "scheduled",
          );
          $cb("jpNoGames").style.display = (open.length || hasSched) ? "none" : "";
          open.forEach((g) => {
            const row = document.createElement("div");
            row.className = "cb-game-row";
            const info = document.createElement("span");
            const modeTag = g.mode === "hard" ? "🔥 Hard · " : "";
            info.textContent =
              g.host +
              "'s room · " +
              modeTag +
              g.n +
              " player" +
              (g.n === 1 ? "" : "s") +
              (g.st === "playing" ? " · in progress" : " · waiting to start");
            const btn = document.createElement("button");
            btn.className = "btn btn-gold";
            btn.style.cssText = "padding:5px 14px;font-size:.78rem";
            btn.textContent = g.st === "playing" ? "Join & Play" : "Join";
            btn.onclick = () => jpJoin(g.id);
            row.append(info, btn);
            list.appendChild(row);
          });
        }

        /* ════════ CREATE ════════ */
        window._jjLobbySelectedMode = "normal";
        window.jjSelectLobbyMode = function (mode) {
          const targetMode = mode === "hard" ? "hard" : "normal";
          window._jjLobbySelectedMode = targetMode;
          window._jjCurrentMode = targetMode;
          document
            .querySelectorAll(
              "#jjLobbyModePicker .cb-diff-btn, #jjRoomModeButtons .cb-diff-btn",
            )
            .forEach((btn) => {
              btn.classList.toggle(
                "active",
                btn.dataset.mode === targetMode ||
                  btn.dataset.diff === (targetMode === "hard" ? "hard" : "easy"),
              );
            });
        };

        window.jjCreate = async function () {
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          const pw = prompt("🔒 Enter the password to create a new room:");
          if (pw === null) return;
          const trimmed = pw.trim().toLowerCase();
          if (trimmed !== JJ_ROOM_PASSWORD && trimmed !== "696969" && !isAdm) {
            cbToast("🔒 Wrong password — room not created");
            return;
          }
          const me = cbMe();
          const id = Math.random().toString(36).slice(2, 8);
          const mode = window._jjLobbySelectedMode === "hard" ? "hard" : "normal";
          try {
            await set(jjGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              mode,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              },
              feed: [
                {
                  t: "s",
                  x:
                    me.name +
                    " created the room (" +
                    (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                    ")",
                  ts: Date.now(),
                },
              ],
              createdAt: Date.now(),
            });
            await jjLobbySet(id, {
              id,
              host: me.name,
              st: "lobby",
              n: 1,
              mode,
              up: Date.now(),
            });
            jjEnterGame(id);
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not create room");
          }
        };
        // Demo room: no password, never listed in the public lobby, and the sole
        // player (who is also the "host") gets to play their own round themselves —
        // see the isDemo bypass in jjRenderRoomUI below.
        window.jjCreateDemo = async function () {
          const me = cbMe();
          const id = "demo-" + Math.random().toString(36).slice(2, 8);
          const mode = window._jjLobbySelectedMode === "hard" ? "hard" : "normal";
          try {
            await set(jjGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              demo: true,
              mode,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              },
              feed: [
                {
                  t: "s",
                  x:
                    me.name +
                    " started a demo room (" +
                    (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                    ")",
                  ts: Date.now(),
                },
              ],
              createdAt: Date.now(),
            });
            jjEnterGame(id);
            cbToast("🎓 Demo room — pick your timer, then start practicing!");
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not start demo room");
          }
        };

        window._jpLobbySelectedMode = "normal";
        window.jpSelectLobbyMode = function (mode) {
          const targetMode = mode === "hard" ? "hard" : "normal";
          window._jpLobbySelectedMode = targetMode;
          window._jpCurrentMode = targetMode;
          document
            .querySelectorAll(
              "#jpLobbyModePicker .cb-diff-btn, #jpRoomModeButtons .cb-diff-btn",
            )
            .forEach((btn) => {
              btn.classList.toggle(
                "active",
                btn.dataset.mode === targetMode ||
                  btn.dataset.diff === (targetMode === "hard" ? "hard" : "easy"),
              );
            });
        };

        window.jpCreate = async function () {
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          const pw = prompt("🔒 Enter the password to create a new room:");
          if (pw === null) return;
          const trimmed = pw.trim().toLowerCase();
          if (trimmed !== JP_ROOM_PASSWORD && trimmed !== "696969" && !isAdm) {
            cbToast("🔒 Wrong password — room not created");
            return;
          }
          const me = cbMe();
          const id = Math.random().toString(36).slice(2, 8);
          const mode = window._jpLobbySelectedMode === "hard" ? "hard" : "normal";
          try {
            await set(jpGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              mode,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              },
              feed: [
                {
                  t: "s",
                  x:
                    me.name +
                    " created the room (" +
                    (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                    ")",
                  ts: Date.now(),
                },
              ],
              createdAt: Date.now(),
            });
            await jpLobbySet(id, {
              id,
              host: me.name,
              st: "lobby",
              n: 1,
              mode,
              up: Date.now(),
            });
            jpEnterGame(id);
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not create room");
          }
        };
        // Demo room — see jjCreateDemo above for the rationale; JP's mirror of it.
        window.jpCreateDemo = async function () {
          const me = cbMe();
          const id = "demo-" + Math.random().toString(36).slice(2, 8);
          const mode = window._jpLobbySelectedMode === "hard" ? "hard" : "normal";
          try {
            await set(jpGref(id), {
              id,
              status: "lobby",
              hostId: me.id,
              demo: true,
              mode,
              players: {
                [me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              },
              feed: [
                {
                  t: "s",
                  x:
                    me.name +
                    " started a demo room (" +
                    (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                    ")",
                  ts: Date.now(),
                },
              ],
              createdAt: Date.now(),
            });
            jpEnterGame(id);
            cbToast(
              "🎓 Demo room (" +
                (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                ") — pick your timer, then start practicing!",
            );
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not start demo room");
          }
        };

        /* ════════ JOIN ════════ */
        window.jjJoin = async function (id) {
          const me = cbMe();
          try {
            const snap = await get(jjGref(id));
            const g = snap.val();
            if (!g) {
              cbToast("⚠️ Room no longer exists");
              return;
            }
            if (g.status === "finished") {
              cbToast("⚠️ Room already finished");
              return;
            }
            if (g.isScheduled) {
              const sched = window._activeSchedules && window._activeSchedules[g.scheduledType || "jj"];
              const isCreator = (sched && sched.scheduledBy === me.id) || g.hostId === me.id;
              if (isCreator && g.hostId !== me.id) {
                await update(jjGref(id), { hostId: me.id, hostName: me.name });
                g.hostId = me.id;
              }
            }
            const isHost = Boolean(g && g.hostId && g.hostId === me.id);
            if (isHost) {
              // Host joins room as overseer — does not register as quiz participant
              jjEnterGame(id);
              return;
            }
            if (!(g.players && g.players[me.id])) {
              const count = g.players ? Object.keys(g.players).length : 0;
              if (count >= JJ_MAX) {
                cbToast("⚠️ Room is full");
                return;
              }
              await update(jjGref(id), {
                ["players/" + me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              });
              await jjPushFeed(id, {
                t: "s",
                x:
                  me.name +
                  (g.status === "playing" ? " joined mid-round!" : " joined"),
                ts: Date.now(),
              });
              await jjLobbySet(id, { n: count + 1, up: Date.now() });
            }
            jjEnterGame(id);
          } catch (e) {
            cbToast("⚠️ " + (e.message || "Could not join"));
          }
        };
        window.jpJoin = async function (id) {
          const me = cbMe();
          try {
            const snap = await get(jpGref(id));
            const g = snap.val();
            if (!g) {
              cbToast("⚠️ Room no longer exists");
              return;
            }
            if (g.status === "finished") {
              cbToast("⚠️ Room already finished");
              return;
            }
            if (g.isScheduled) {
              const sched = window._activeSchedules && window._activeSchedules[g.scheduledType || "jp"];
              const isCreator = (sched && sched.scheduledBy === me.id) || g.hostId === me.id;
              if (isCreator && g.hostId !== me.id) {
                await update(jpGref(id), { hostId: me.id, hostName: me.name });
                g.hostId = me.id;
              }
            }
            const isHost = Boolean(g && g.hostId && g.hostId === me.id);
            if (isHost) {
              // Host joins room as overseer — does not register as quiz participant
              jpEnterGame(id);
              return;
            }
            if (!(g.players && g.players[me.id])) {
              const count = g.players ? Object.keys(g.players).length : 0;
              if (count >= JP_MAX) {
                cbToast("⚠️ Room is full");
                return;
              }
              await update(jpGref(id), {
                ["players/" + me.id]: {
                  name: me.name,
                  avatar: me.avatar,
                  photoURL: me.photoURL || "",
                  done: false,
                },
              });
              await jpPushFeed(id, {
                t: "s",
                x:
                  me.name +
                  (g.status === "playing" ? " joined mid-round!" : " joined"),
                ts: Date.now(),
              });
              await jpLobbySet(id, { n: count + 1, up: Date.now() });
            }
            jpEnterGame(id);
          } catch (e) {
            cbToast("⚠️ " + (e.message || "Could not join"));
          }
        };

        /* ════════ ENTER / RENDER ROOM ════════ */
        function jjEnterGame(id) {
          jjRoomId = id;
          jjLocalStarted = false;
          jjStartHeartbeat(id);
          if (jjUnsubLobby) {
            jjUnsubLobby();
            jjUnsubLobby = null;
          }
          $cb("jjLobbyView").style.display = "none";
          $cb("jjGameView").style.display = "";
          jjUnsubGame = onValue(
            jjGref(id),
            (s) => {
              const v = s.val();
              if (!v) {
                cbToast("Room was closed");
                jjBackToLobby();
                return;
              }
              v.players = v.players || {};
              jjRoomSnap = v;
              window._jjRoomSnap = v; // classic script (jjFinalizeSubmission/jjHint) can't see module-scoped `let`s
              jjRenderRoomUI(v);
            },
            (e) => console.warn("JJ room listen failed:", e),
          );
        }
        function jpEnterGame(id) {
          jpRoomId = id;
          jpLocalStarted = false;
          jpStartHeartbeat(id);
          if (jpUnsubLobby) {
            jpUnsubLobby();
            jpUnsubLobby = null;
          }
          $cb("jpLobbyView").style.display = "none";
          $cb("jpGameView").style.display = "";
          jpUnsubGame = onValue(
            jpGref(id),
            (s) => {
              const v = s.val();
              if (!v) {
                cbToast("Room was closed");
                jpBackToLobby();
                return;
              }
              v.players = v.players || {};
              jpRoomSnap = v;
              window._jpRoomSnap = v; // classic script (jpFinalizeSubmission) can't see module-scoped `let`s
              jpRenderRoomUI(v);
            },
            (e) => console.warn("JP room listen failed:", e),
          );
        }

        function jjRenderWaitList(g) {
          const el = $cb("jjWaitList");
          if (!el) return;
          const entries = Object.entries(g.players || {});
          if (!entries.length) {
            el.innerHTML = '<div class="cb-muted" style="text-align:center;padding:12px;font-size:0.85rem;">Waiting for players to join…</div>';
            const cnt = $cb("jjWaitCount");
            if (cnt) cnt.textContent = "0";
            return;
          }
          el.innerHTML = entries
            .map(
              ([pid, p]) =>
                '<div class="cb-game-row"><span style="display:inline-flex;align-items:center;gap:8px;">' +
                '<span class="cb-player-badge-av">' +
                avatarHTML(p.avatar, p.photoURL, pid, p.name) +
                '</span>' +
                '<span>' +
                escapeHtml(p.name || "Player") +
                (pid === g.hostId ? " 👑 (host)" : "") +
                (p.done ? " ✅" : "") +
                '</span>' +
                "</span></div>",
            )
            .join("");
          const cnt = $cb("jjWaitCount");
          if (cnt) cnt.textContent = entries.length;
        }
        function jpRenderWaitList(g) {
          const el = $cb("jpWaitList");
          if (!el) return;
          const entries = Object.entries(g.players || {});
          if (!entries.length) {
            el.innerHTML = '<div class="cb-muted" style="text-align:center;padding:12px;font-size:0.85rem;">Waiting for players to join…</div>';
            const cnt = $cb("jpWaitCount");
            if (cnt) cnt.textContent = "0";
            return;
          }
          el.innerHTML = entries
            .map(
              ([pid, p]) =>
                '<div class="cb-game-row"><span style="display:inline-flex;align-items:center;gap:8px;">' +
                '<span class="cb-player-badge-av">' +
                avatarHTML(p.avatar, p.photoURL, pid, p.name) +
                '</span>' +
                '<span>' +
                escapeHtml(p.name || "Player") +
                (pid === g.hostId ? " 👑 (host)" : "") +
                (p.done ? " ✅" : "") +
                '</span>' +
                "</span></div>",
            )
            .join("");
          const cnt = $cb("jpWaitCount");
          if (cnt) cnt.textContent = entries.length;
        }

        /* Drives the room state machine for every joined client: lobby → waiting
         room UI; playing → kick off (once) this player's own independently-timed
         round via the existing Phase 1/2/3 engine; finished → force-submit
         whatever progress this player has if their round was still in progress,
         so the room genuinely ends at the same time for everyone. */
        let _jjHostFinishedTimer = null;
        let _jpHostFinishedTimer = null;

        function jjRenderHostStatus(g, autoCloseSecs) {
          const el = $cb("jjHostStatusList");
          if (!el) return;
          const players = Object.entries(g.players || {})
            .filter(([pid]) => pid !== g.hostId);

          let timerBanner = "";
          if (g.status === "finished") {
            const secs = typeof autoCloseSecs === "number" ? autoCloseSecs : 5;
            timerBanner = `
              <div class="cb-card-box" style="margin-bottom:12px;text-align:center;padding:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:10px;">
                <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:#fca5a5;font-weight:800;">🏁 Room Finished</div>
                <div style="font-size:1.05rem;font-weight:900;color:#fff;margin:4px 0;">All rounds completed</div>
                <div style="font-size:0.82rem;color:#fca5a5;font-weight:700;">⏱️ Returning to lobby in ${secs}s…</div>
              </div>`;
          } else if (g.status === "playing" && g.startedAt && g.duration) {
            const remSecs = Math.max(0, Math.ceil(((g.startedAt + g.duration * 1000) - Date.now()) / 1000));
            const m = Math.floor(remSecs / 60);
            const s = remSecs % 60;
            const isWarn = remSecs <= 30;
            const doneCount = players.filter(([, p]) => p.done).length;
            timerBanner = `
              <div class="cb-card-box" style="margin-bottom:12px;text-align:center;padding:12px;background:${isWarn ? 'rgba(239,68,68,0.12)' : 'rgba(255,215,0,0.08)'};border:1px solid ${isWarn ? 'rgba(239,68,68,0.35)' : 'rgba(255,215,0,0.3)'};border-radius:10px;">
                <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:${isWarn ? '#ff6b6b' : 'var(--gold)'};font-weight:800;">⏱️ Set Room Timer</div>
                <div style="font-size:1.9rem;font-weight:900;color:${isWarn ? '#ff6b6b' : '#fff'};margin:2px 0;">${m}:${s < 10 ? '0' : ''}${s}</div>
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.7);">${doneCount}/${players.length} players submitted · Auto-closes when timer ends</div>
              </div>`;
          }

          if (!players.length) {
            el.innerHTML =
              timerBanner + '<div class="cb-muted">No players in this room yet.</div>';
            return;
          }
          el.innerHTML =
            timerBanner +
            players
              .map(
                ([pid, p]) =>
                  '<div class="cb-game-row"><span style="display:inline-flex;align-items:center;gap:8px;">' +
                  '<span class="cb-player-badge-av">' +
                  avatarHTML(p.avatar, p.photoURL, pid, p.name) +
                  '</span>' +
                  '<span>' +
                  escapeHtml(p.name || "Player") +
                  '</span></span>' +
                  '<span style="font-weight:800;' +
                  (p.done ? "color:#2ecc71" : "color:var(--gold)") +
                  '">' +
                  (p.done ? "✅ Submitted" : "🕹️ Playing…") +
                  "</span></div>",
              )
              .join("");
        }
        function jpRenderHostStatus(g, autoCloseSecs) {
          const el = $cb("jpHostStatusList");
          if (!el) return;
          const players = Object.entries(g.players || {})
            .filter(([pid]) => pid !== g.hostId);

          let timerBanner = "";
          if (g.status === "finished") {
            const secs = typeof autoCloseSecs === "number" ? autoCloseSecs : 5;
            timerBanner = `
              <div class="cb-card-box" style="margin-bottom:12px;text-align:center;padding:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:10px;">
                <div style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:#fca5a5;font-weight:800;">🏁 Room Finished</div>
                <div style="font-size:1.05rem;font-weight:900;color:#fff;margin:4px 0;">All rounds completed</div>
                <div style="font-size:0.82rem;color:#fca5a5;font-weight:700;">⏱️ Returning to lobby in ${secs}s…</div>
              </div>`;
          } else if (g.status === "playing" && g.startedAt && g.duration) {
            const remSecs = Math.max(0, Math.ceil(((g.startedAt + g.duration * 1000) - Date.now()) / 1000));
            const m = Math.floor(remSecs / 60);
            const s = remSecs % 60;
            const isWarn = remSecs <= 30;
            const doneCount = players.filter(([, p]) => p.done).length;
            timerBanner = `
              <div class="cb-card-box" style="margin-bottom:12px;text-align:center;padding:12px;background:${isWarn ? 'rgba(239,68,68,0.12)' : 'rgba(255,215,0,0.08)'};border:1px solid ${isWarn ? 'rgba(239,68,68,0.35)' : 'rgba(255,215,0,0.3)'};border-radius:10px;">
                <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:${isWarn ? '#ff6b6b' : 'var(--gold)'};font-weight:800;">⏱️ Set Room Timer</div>
                <div style="font-size:1.9rem;font-weight:900;color:${isWarn ? '#ff6b6b' : '#fff'};margin:2px 0;">${m}:${s < 10 ? '0' : ''}${s}</div>
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.7);">${doneCount}/${players.length} players submitted · Auto-closes when timer ends</div>
              </div>`;
          }

          if (!players.length) {
            el.innerHTML =
              timerBanner + '<div class="cb-muted">No players in this room yet.</div>';
            return;
          }
          el.innerHTML =
            timerBanner +
            players
              .map(
                ([pid, p]) =>
                  '<div class="cb-game-row"><span style="display:inline-flex;align-items:center;gap:8px;">' +
                  '<span class="cb-player-badge-av">' +
                  avatarHTML(p.avatar, p.photoURL, pid, p.name) +
                  '</span>' +
                  '<span>' +
                  escapeHtml(p.name || "Player") +
                  '</span></span>' +
                  '<span style="font-weight:800;' +
                  (p.done ? "color:#2ecc71" : "color:var(--gold)") +
                  '">' +
                  (p.done ? "✅ Submitted" : "🕹️ Playing…") +
                  "</span></div>",
              )
              .join("");
        }

        /* The host never plays a round — they only ever see the lobby wait panel
         or the live status dashboard. Everyone else runs the normal gameplay
         state machine (lobby wait → own timed round → auto-submit). */
        function jjRenderRoomUI(g) {
          const me = cbMe();
          const isHost = Boolean(g && g.hostId && g.hostId === me.id);
          const isDemo = !!g.demo; // demo rooms are solo — their "host" plays their own round too
          const endBtn = $cb("jjEndBtn");
          if (endBtn) {
            if (isHost && g.status !== "finished" && !isDemo) {
              endBtn.style.removeProperty("display");
              endBtn.style.display = "";
              endBtn.classList.remove("cb-hidden");
            } else {
              endBtn.style.setProperty("display", "none", "important");
              endBtn.classList.add("cb-hidden");
            }
          }
          const waitPanel = $cb("jjWaitPanel");
          const hostPanel = $cb("jjHostStatusPanel");

          if (g.status === "lobby") {
            if (g.isScheduled && Date.now() >= (g.scheduledTime || 0)) {
              const diff = (g.scheduledTime || 0) - Date.now();
              if (!window._jjAutoStarting && (isHost || diff <= -1500)) {
                window._jjAutoStarting = true;
                jjStart().finally(() => {
                  setTimeout(() => { window._jjAutoStarting = false; }, 2000);
                });
              }
            }
            if (waitPanel) waitPanel.style.display = "";
            if (hostPanel) hostPanel.style.display = "none";
            const schedBox = document.getElementById("jjWaitSchedBox");
            const schedCount = document.getElementById("jjWaitSchedCountdown");
            const schedTime = document.getElementById("jjWaitSchedTime");
            if (g.isScheduled && g.scheduledTime) {
              if (schedBox) schedBox.style.display = "block";
              const diff = g.scheduledTime - Date.now();
              const timeInfo = formatEventTime(g.scheduledTime);
              if (schedCount) schedCount.textContent = diff <= 0 ? "🔴 EVENT IS LIVE NOW!" : "⏳ Event in " + formatCountdown(diff);
              if (schedTime) schedTime.textContent = "🕒 Scheduled for: " + timeInfo.ist;
            } else {
              if (schedBox) schedBox.style.display = "none";
            }
            document.getElementById("jjPhase1").style.display = "none";
            document.getElementById("jjPhase2").style.display = "none";
            document.getElementById("jjPhase3").style.display = "none";
            jjHideTimer();
            const startBtn = $cb("jjStartBtn");
            if (startBtn) {
              if (isHost) {
                startBtn.style.removeProperty("display");
                startBtn.style.display = "";
                startBtn.classList.remove("cb-hidden");
              } else {
                startBtn.style.setProperty("display", "none", "important");
                startBtn.classList.add("cb-hidden");
              }
            }
            const picker = $cb("jjHostTimerPicker");
            if (picker) picker.style.display = isHost ? "" : "none";
            if (isHost)
              requestAnimationFrame(() => cdResettleWheel("jjTimerWheel"));

            const curMode = g.mode || "normal";
            const hostModePicker = $cb("jjHostModePicker");
            if (hostModePicker) hostModePicker.style.display = isHost ? "" : "none";
            if (isHost) {
              const modeBtns = document.querySelectorAll(
                "#jjRoomModeButtons [data-mode]",
              );
              modeBtns.forEach((btn) =>
                btn.classList.toggle("active", btn.dataset.mode === curMode),
              );
            }
            const playerModeBadge = $cb("jjPlayerModeBadge");
            const playerModeText = $cb("jjPlayerModeText");
            if (playerModeBadge)
              playerModeBadge.style.display = !isHost ? "" : "none";
            if (playerModeText) {
              playerModeText.innerHTML =
                curMode === "hard"
                  ? '<span style="color:#ff6b6b">🔥 Hard Mode (No Emoji)</span>'
                  : '<span style="color:var(--gold)">🎯 Normal Mode (with Emoji)</span>';
            }

            jjRenderWaitList(g);
            return;
          }
          if (waitPanel) waitPanel.style.display = "none";

          if (g.status === "finished") {
            if (isHost && !isDemo) {
              document.getElementById("jjPhase1").style.display = "none";
              document.getElementById("jjPhase2").style.display = "none";
              document.getElementById("jjPhase3").style.display = "none";
              jjHideTimer();
              if (hostPanel) hostPanel.style.display = "";
              if (!window._jjHostFinishedTimer) {
                let hostLeft = 5;
                jjRenderHostStatus(g, hostLeft);
                window._jjHostFinishedTimer = setInterval(() => {
                  hostLeft--;
                  if (hostLeft <= 0) {
                    if (window._jjHostFinishedTimer) {
                      clearInterval(window._jjHostFinishedTimer);
                      window._jjHostFinishedTimer = null;
                    }
                    jjBackToLobby();
                  } else {
                    jjRenderHostStatus(g, hostLeft);
                  }
                }, 1000);
              }
              return;
            }
            if (hostPanel) hostPanel.style.display = "none";
            if (jjRoundInProgress) {
              jjLocalStarted = true;
              cbToast(
                g.hostLeft
                  ? "🛑 The host left — your progress was submitted."
                  : g.timedOut
                    ? "⏰ Set timer expired — your progress was submitted."
                    : "🛑 Room ended — your progress was submitted.",
              );
              window.jjAutoFinish("roomended");
            } else if (!jjLocalStarted) {
              cbToast(
                g.hostLeft
                  ? "🛑 The host left — room closed."
                  : "🛑 Room ended.",
              );
              jjBackToLobby();
            }
            return;
          }

          if (isHost && !isDemo) {
            if (window._jjHostFinishedTimer) {
              clearInterval(window._jjHostFinishedTimer);
              window._jjHostFinishedTimer = null;
            }
            // Rare edge case: this player was mid-round when the previous host left
            // and they got promoted to host. Auto-submit their in-progress round
            // first so their picks aren't silently lost, then switch to the
            // host-only status view (hosts never play).
            if (jjRoundInProgress) {
              window.jjAutoFinish("promotedHost");
            }
            document.getElementById("jjPhase1").style.display = "none";
            document.getElementById("jjPhase2").style.display = "none";
            document.getElementById("jjPhase3").style.display = "none";
            jjHideTimer();
            if (hostPanel) hostPanel.style.display = "";
            jjRenderHostStatus(g);
            return;
          }
          if (hostPanel) hostPanel.style.display = "none";

          if (g.status === "playing") {
            const myP = g.players[me.id];
            if (!jjLocalStarted && !(myP && myP.done)) {
              jjLocalStarted = true;
              jjBeginLocalRound();
            }
            return;
          }
        }
        window.jjRenderRoomUI = jjRenderRoomUI;
        function jpRenderRoomUI(g) {
          const me = cbMe();
          const isHost = Boolean(g && g.hostId && g.hostId === me.id);
          const isDemo = !!g.demo; // demo rooms are solo — their "host" plays their own round too
          const endBtn = $cb("jpEndBtn");
          if (endBtn) {
            if (isHost && g.status !== "finished" && !isDemo) {
              endBtn.style.removeProperty("display");
              endBtn.style.display = "";
              endBtn.classList.remove("cb-hidden");
            } else {
              endBtn.style.setProperty("display", "none", "important");
              endBtn.classList.add("cb-hidden");
            }
          }
          const waitPanel = $cb("jpWaitPanel");
          const hostPanel = $cb("jpHostStatusPanel");

          if (g.status === "lobby") {
            if (g.isScheduled && Date.now() >= (g.scheduledTime || 0)) {
              const diff = (g.scheduledTime || 0) - Date.now();
              if (!window._jpAutoStarting && (isHost || diff <= -1500)) {
                window._jpAutoStarting = true;
                jpStart().finally(() => {
                  setTimeout(() => { window._jpAutoStarting = false; }, 2000);
                });
              }
            }
            if (waitPanel) waitPanel.style.display = "";
            if (hostPanel) hostPanel.style.display = "none";
            const schedBox = document.getElementById("jpWaitSchedBox");
            const schedCount = document.getElementById("jpWaitSchedCountdown");
            const schedTime = document.getElementById("jpWaitSchedTime");
            if (g.isScheduled && g.scheduledTime) {
              if (schedBox) schedBox.style.display = "block";
              const diff = g.scheduledTime - Date.now();
              const timeInfo = formatEventTime(g.scheduledTime);
              if (schedCount) schedCount.textContent = diff <= 0 ? "🔴 EVENT IS LIVE NOW!" : "⏳ Event in " + formatCountdown(diff);
              if (schedTime) schedTime.textContent = "🕒 Scheduled for: " + timeInfo.ist;
            } else {
              if (schedBox) schedBox.style.display = "none";
            }
            document.getElementById("jpPhase1").style.display = "none";
            document.getElementById("jpPhase2").style.display = "none";
            document.getElementById("jpPhase3").style.display = "none";
            const tw = $cb("jpTimerWrap");
            if (tw) tw.style.display = "none";
            const startBtn = $cb("jpStartBtn");
            if (startBtn) {
              if (isHost) {
                startBtn.style.removeProperty("display");
                startBtn.style.display = "";
                startBtn.classList.remove("cb-hidden");
              } else {
                startBtn.style.setProperty("display", "none", "important");
                startBtn.classList.add("cb-hidden");
              }
            }
            const picker = $cb("jpHostTimerPicker");
            if (picker) picker.style.display = isHost ? "" : "none";
            if (isHost)
              requestAnimationFrame(() => cdResettleWheel("jpTimerWheel"));

            const curMode = g.mode || "normal";
            const hostModePicker = $cb("jpHostModePicker");
            if (hostModePicker) hostModePicker.style.display = isHost ? "" : "none";
            if (isHost) {
              const modeBtns = document.querySelectorAll(
                "#jpRoomModeButtons [data-mode]",
              );
              modeBtns.forEach((btn) =>
                btn.classList.toggle("active", btn.dataset.mode === curMode),
              );
            }
            const playerModeBadge = $cb("jpPlayerModeBadge");
            const playerModeText = $cb("jpPlayerModeText");
            if (playerModeBadge)
              playerModeBadge.style.display = !isHost ? "" : "none";
            if (playerModeText) {
              playerModeText.innerHTML =
                curMode === "hard"
                  ? '<span style="color:#ff6b6b">🔥 Hard Mode (Any Set)</span>'
                  : '<span style="color:var(--gold)">🎯 Normal Mode (1 Set)</span>';
            }

            jpRenderWaitList(g);
            return;
          }
          if (waitPanel) waitPanel.style.display = "none";

          if (g.status === "finished") {
            if (isHost && !isDemo) {
              document.getElementById("jpPhase1").style.display = "none";
              document.getElementById("jpPhase2").style.display = "none";
              document.getElementById("jpPhase3").style.display = "none";
              const tw = $cb("jpTimerWrap");
              if (tw) tw.style.display = "none";
              if (hostPanel) hostPanel.style.display = "";
              if (!window._jpHostFinishedTimer) {
                let hostLeft = 5;
                jpRenderHostStatus(g, hostLeft);
                window._jpHostFinishedTimer = setInterval(() => {
                  hostLeft--;
                  if (hostLeft <= 0) {
                    if (window._jpHostFinishedTimer) {
                      clearInterval(window._jpHostFinishedTimer);
                      window._jpHostFinishedTimer = null;
                    }
                    jpBackToLobby();
                  } else {
                    jpRenderHostStatus(g, hostLeft);
                  }
                }, 1000);
              }
              return;
            }
            if (hostPanel) hostPanel.style.display = "none";
            if (jpActive) {
              jpLocalStarted = true;
              cbToast(
                g.hostLeft
                  ? "🛑 The host left — your progress was submitted."
                  : g.timedOut
                    ? "⏰ Set timer expired — your progress was submitted."
                    : "🛑 Room ended — your progress was submitted.",
              );
              window.jpAutoFinish("roomended");
            } else if (!jpLocalStarted) {
              cbToast(
                g.hostLeft
                  ? "🛑 The host left — room closed."
                  : "🛑 Room ended.",
              );
              jpBackToLobby();
            }
            return;
          }

          if (isHost && !isDemo) {
            if (window._jpHostFinishedTimer) {
              clearInterval(window._jpHostFinishedTimer);
              window._jpHostFinishedTimer = null;
            }
            // Rare edge case: this player was mid-round when the previous host left
            // and they got promoted to host. Auto-submit their in-progress round
            // first so their picks aren't silently lost, then switch to the
            // host-only status view (hosts never play).
            if (jpActive) {
              window.jpAutoFinish("promotedHost");
            }
            document.getElementById("jpPhase1").style.display = "none";
            document.getElementById("jpPhase2").style.display = "none";
            document.getElementById("jpPhase3").style.display = "none";
            const tw = $cb("jpTimerWrap");
            if (tw) tw.style.display = "none";
            if (hostPanel) hostPanel.style.display = "";
            jpRenderHostStatus(g);
            return;
          }
          if (hostPanel) hostPanel.style.display = "none";

          if (g.status === "playing") {
            const myP = g.players[me.id];
            if (!jpLocalStarted && !(myP && myP.done)) {
              jpLocalStarted = true;
              jpBeginLocalRound();
            }
            return;
          }
        }

        /* ════════ HOST-ONLY: START ════════
         Flips the room to 'playing' and broadcasts it — every joined client's
         onValue listener (jjRenderRoomUI/jpRenderRoomUI above) reacts by kicking
         off its OWN independently-timed random round via the existing engine. */
        window.jjSetMode = async function (mode) {
          const targetMode = mode === "hard" ? "hard" : "normal";
          window._jjCurrentMode = targetMode;
          window._jjLobbySelectedMode = targetMode;
          document
            .querySelectorAll(
              "#jjRoomModeButtons .cb-diff-btn, #jjLobbyModePicker .cb-diff-btn",
            )
            .forEach((btn) => {
              btn.classList.toggle(
                "active",
                btn.dataset.mode === targetMode ||
                  btn.dataset.diff === (targetMode === "hard" ? "hard" : "easy"),
              );
            });
          const playerModeText = $cb("jjPlayerModeText");
          if (playerModeText) {
            playerModeText.innerHTML =
              targetMode === "hard"
                ? '<span style="color:#ff6b6b">🔥 Hard Mode (No Emoji)</span>'
                : '<span style="color:var(--gold)">🎯 Normal Mode (with Emoji)</span>';
          }
          const g = jjRoomSnap,
            me = cbMe();
          if (g) g.mode = targetMode;
          if (!g || g.hostId !== me.id || g.status !== "lobby") return;
          try {
            await update(jjGref(jjRoomId), { mode: targetMode });
            await jjPushFeed(jjRoomId, {
              t: "s",
              x:
                "🎮 Host switched mode to " +
                (targetMode === "hard"
                  ? "🔥 Hard Mode (No Emoji)"
                  : "🎯 Normal Mode (with Emoji)"),
              ts: Date.now(),
            });
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not update mode");
          }
        };
        window.jjStart = async function () {
          const g = jjRoomSnap,
            me = cbMe();
          if (!g) return;
          const isHost = g.hostId === me.id;
          const isSchedDue = g.isScheduled && Date.now() >= (g.scheduledTime || 0);
          if (!isHost && !isSchedDue) return;
          if (g.status !== "lobby") return;

          const startBtn = $cb("jjStartBtn");
          if (startBtn) {
            startBtn.style.setProperty("display", "none", "important");
            startBtn.classList.add("cb-hidden");
          }
          const wheelEl = $cb("jjTimerWheel");
          const duration = (g.isScheduled && g.duration)
            ? g.duration
            : (wheelEl ? parseInt(wheelEl.dataset.seconds, 10) || JJ_ROUND_TIME_LIMIT : JJ_ROUND_TIME_LIMIT);
          const mode = g.mode || "normal";
          const id = jjRoomId;

          try {
            let didTransition = false;
            const res = await runTransaction(jjGref(id), (cur) => {
              if (!cur || cur.status !== "lobby") return;
              cur.status = "playing";
              cur.startedAt = Date.now();
              cur.duration = duration;
              cur.mode = mode;
              didTransition = true;
              return cur;
            });
            if (!res || !res.committed || !didTransition) return;

            await jjPushFeed(id, {
              t: "s",
              x:
                "🔀 " +
                (g.isScheduled ? "Scheduled event started in " : "The host started the room in ") +
                (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                " (" +
                Math.floor(duration / 60) +
                ":" +
                (duration % 60 < 10 ? "0" : "") +
                (duration % 60) +
                " timer) — everyone gets their own random round now!",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled) {
              await jjLobbySet(id, { st: "playing", mode, up: Date.now() });
            }
          } catch (e) {
            console.warn(e);
            if (startBtn) {
              startBtn.style.removeProperty("display");
              startBtn.classList.remove("cb-hidden");
            }
            cbToast("⚠️ Could not start");
          }
        };
        window.jpSetMode = async function (mode) {
          const targetMode = mode === "hard" ? "hard" : "normal";
          window._jpCurrentMode = targetMode;
          window._jpLobbySelectedMode = targetMode;
          document
            .querySelectorAll(
              "#jpRoomModeButtons .cb-diff-btn, #jpLobbyModePicker .cb-diff-btn",
            )
            .forEach((btn) => {
              btn.classList.toggle(
                "active",
                btn.dataset.mode === targetMode ||
                  btn.dataset.diff === (targetMode === "hard" ? "hard" : "easy"),
              );
            });
          const playerModeText = $cb("jpPlayerModeText");
          if (playerModeText) {
            playerModeText.innerHTML =
              targetMode === "hard"
                ? '<span style="color:#ff6b6b">🔥 Hard Mode (Any Set)</span>'
                : '<span style="color:var(--gold)">🎯 Normal Mode (1 Set)</span>';
          }
          const g = jpRoomSnap,
            me = cbMe();
          if (g) g.mode = targetMode;
          if (!g || g.hostId !== me.id || g.status !== "lobby") return;
          try {
            await update(jpGref(jpRoomId), { mode: targetMode });
            await jpPushFeed(jpRoomId, {
              t: "s",
              x:
                "🎮 Host switched mode to " +
                (targetMode === "hard"
                  ? "🔥 Hard Mode (Any Set)"
                  : "🎯 Normal Mode (1 Set)"),
              ts: Date.now(),
            });
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not update mode");
          }
        };
        window.jpStart = async function () {
          const g = jpRoomSnap,
            me = cbMe();
          if (!g) return;
          const isHost = g.hostId === me.id;
          const isSchedDue = g.isScheduled && Date.now() >= (g.scheduledTime || 0);
          if (!isHost && !isSchedDue) return;
          if (g.status !== "lobby") return;

          const startBtn = $cb("jpStartBtn");
          if (startBtn) {
            startBtn.style.setProperty("display", "none", "important");
            startBtn.classList.add("cb-hidden");
          }
          const wheelEl = $cb("jpTimerWheel");
          const duration = (g.isScheduled && g.duration)
            ? g.duration
            : (wheelEl ? parseInt(wheelEl.dataset.seconds, 10) || JP_TIME_LIMIT : JP_TIME_LIMIT);
          const mode = g.mode || "normal";
          const id = jpRoomId;

          try {
            let didTransition = false;
            const res = await runTransaction(jpGref(id), (cur) => {
              if (!cur || cur.status !== "lobby") return;
              cur.status = "playing";
              cur.startedAt = Date.now();
              cur.duration = duration;
              cur.mode = mode;
              didTransition = true;
              return cur;
            });
            if (!res || !res.committed || !didTransition) return;

            await jpPushFeed(id, {
              t: "s",
              x:
                "🎯 " +
                (g.isScheduled ? "Scheduled event started in " : "The host started the room in ") +
                (mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") +
                " (" +
                Math.floor(duration / 60) +
                ":" +
                (duration % 60 < 10 ? "0" : "") +
                (duration % 60) +
                " timer) — everyone gets their own random round now!",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled) {
              await jpLobbySet(id, { st: "playing", mode, up: Date.now() });
            }
          } catch (e) {
            console.warn(e);
            if (startBtn) {
              startBtn.style.removeProperty("display");
              startBtn.classList.remove("cb-hidden");
            }
            cbToast("⚠️ Could not start");
          }
        };

        /* ════════ HOST-ONLY: DURATION WHEEL PICKERS ════════
         Builds a scrollable, snap-to-row "wheel" listing every value from 1:00
         to 10:00 in 1-second steps. Scrolling (or tapping a row) settles on the
         nearest row and stores the chosen seconds on the wheel's own
         data-seconds attribute, which jjStart()/jpStart() read when the host
         launches the room. */
        function cdBuildDurationWheel(wheelId, minSec, maxSec, defaultSec) {
          const wheel = document.getElementById(wheelId);
          if (!wheel || wheel.childElementCount) return; // already built
          const ROW_H = 40;
          const frag = document.createDocumentFragment();
          for (let s = minSec; s <= maxSec; s++) {
            const row = document.createElement("div");
            row.className = "dur-wheel-row";
            row.dataset.sec = s;
            const m = Math.floor(s / 60),
              ss = s % 60;
            row.textContent = m + ":" + (ss < 10 ? "0" : "") + ss;
            frag.appendChild(row);
          }
          wheel.appendChild(frag);
          const rows = wheel.querySelectorAll(".dur-wheel-row");

          function activate(idx) {
            idx = Math.max(0, Math.min(rows.length - 1, idx));
            rows.forEach((r, i) => r.classList.toggle("active", i === idx));
            wheel.dataset.seconds = rows[idx].dataset.sec;
          }
          function settle(idx, smooth) {
            wheel.scrollTo({
              top: idx * ROW_H,
              behavior: smooth ? "smooth" : "auto",
            });
            activate(idx);
          }

          let settleTimer = null;
          let scrollRaf = null;
          wheel.addEventListener(
            "scroll",
            () => {
              if (settleTimer) clearTimeout(settleTimer);
              if (!scrollRaf) {
                scrollRaf = requestAnimationFrame(() => {
                  scrollRaf = null;
                  activate(Math.round(wheel.scrollTop / ROW_H));
                });
              }
              settleTimer = setTimeout(
                () => settle(Math.round(wheel.scrollTop / ROW_H), true),
                120,
              );
            },
            { passive: true },
          );
          rows.forEach((row, i) =>
            row.addEventListener("click", () => settle(i, true)),
          );

          const startIdx = Math.max(
            0,
            Math.min(rows.length - 1, defaultSec - minSec),
          );
          requestAnimationFrame(() => settle(startIdx, false));
        }
        cdBuildDurationWheel("jjTimerWheel", 60, 600, 300);
        cdBuildDurationWheel("jpTimerWheel", 60, 600, 180);

        /* Wheels get built while their panel is still display:none (host hasn't
         opened the lobby yet), so the browser has no layout box and the initial
         scrollTo above silently no-ops. Re-apply the stored selection instantly
         (no animation) whenever the picker actually becomes visible, so it's
         never showing the wrong row centered. */
        function cdResettleWheel(wheelId) {
          const wheel = document.getElementById(wheelId);
          if (!wheel || !wheel.childElementCount) return;
          const ROW_H = 40;
          const rows = wheel.querySelectorAll(".dur-wheel-row");
          const firstSec = parseInt(rows[0].dataset.sec, 10);
          const curSec = parseInt(wheel.dataset.seconds, 10) || firstSec;
          const idx = Math.max(0, Math.min(rows.length - 1, curSec - firstSec));
          wheel.scrollTo({ top: idx * ROW_H, behavior: "auto" });
          rows.forEach((r, i) => r.classList.toggle("active", i === idx));
        }

        /* ════════ PER-PLAYER ROUND KICK-OFF ════════
         Sets up a fresh random round using the existing single-player engine
         (jjQueue/jjNextQuestion/jjStartTimer for JJ; jpSetIdx/jpStartTimer for
         JP) and shows Phase 1. Independently timed per player — the room only
         gated WHEN this began. */
        function jjAttachSuggestionBlocker(inputEl) {
          if (!inputEl || inputEl._suggestionBlockerAttached) return;
          inputEl._suggestionBlockerAttached = true;
          inputEl.dataset.prev = inputEl.value || "";
          inputEl.addEventListener("keydown", function () {
            this.dataset.prev = this.value || "";
          });
          inputEl.addEventListener("input", function () {
            const mode =
              window._jjCurrentMode ||
              (jjRoomSnap && jjRoomSnap.mode) ||
              window._jjLobbySelectedMode ||
              "normal";
            const isHard = mode === "hard";
            const prev = this.dataset.prev || "";
            const curr = this.value || "";
            if (isHard && curr.length - prev.length >= 2) {
              this.value = prev;
              if (typeof cbToast === "function") {
                cbToast("✋ No suggestions in Hard mode — type it yourself!");
              }
              return;
            }
            this.dataset.prev = this.value || "";
          });
        }
        window.jjAttachSuggestionBlocker = jjAttachSuggestionBlocker;

        function jjBeginLocalRound() {
          if (typeof window.jjClearAutoClose === "function") window.jjClearAutoClose();
          if (window._jjHostFinishedTimer) {
            clearInterval(window._jjHostFinishedTimer);
            window._jjHostFinishedTimer = null;
          }
          const mode =
            (jjRoomSnap && jjRoomSnap.mode) ||
            window._jjLobbySelectedMode ||
            "normal";
          window._jjCurrentMode = mode;
          const allC = (typeof window.jjAllCards === "function" ? window.jjAllCards() : cbPool()) || [];
          const deck = cbShuffle(allC.slice());
          jjQueue = deck.slice(0, JJ_SESSION_SIZE);
          jjQNum = 0;
          jjCorrectCount = 0;
          jjWrongCount = 0;
          jjStreak = 0;
          jjSelectedCards = [];
          jjAnswerLog = [];
          jjSessionStart = Date.now();
          jjRoundInProgress = true;
          jjActive = true;
          jjRoundDuration =
            (jjRoomSnap && jjRoomSnap.duration) || JJ_ROUND_TIME_LIMIT;
          const gv = document.getElementById("jjGameView");
          if (gv) gv.style.display = "";
          const lv = document.getElementById("jjLobbyView");
          if (lv) lv.style.display = "none";
          document.getElementById("jjPhase1").style.display = "";
          document.getElementById("jjPhase2").style.display = "none";
          document.getElementById("jjPhase3").style.display = "none";
          const streakBarEl = document.getElementById("jjStreakBar");
          if (streakBarEl) streakBarEl.style.display = "none";
          const ansInp = document.getElementById("jjAnswerInput");
          if (ansInp) jjAttachSuggestionBlocker(ansInp);
          jjShowTimer();
          jjStartTimer(false);
          jjNextQuestion();
        }
        window.jjBeginLocalRound = jjBeginLocalRound;
        function jpAttachSuggestionBlocker(inputEl) {
          if (!inputEl) return;
          inputEl.dataset.prev = inputEl.value || "";
          inputEl.addEventListener("keydown", function () {
            this.dataset.prev = this.value || "";
          });
          inputEl.addEventListener("input", function () {
            const prev = this.dataset.prev || "";
            const curr = this.value || "";
            if (curr.length - prev.length >= 2) {
              this.value = prev;
              if (typeof cbToast === "function") {
                cbToast("✋ No suggestions — type it yourself!");
              }
              return;
            }
            this.dataset.prev = this.value || "";
          });
        }

        function jpGenerateHardQuestions(count) {
          const all = [];
          const sets = typeof SETS !== "undefined" ? SETS : window.SETS || [];
          if (Array.isArray(sets)) {
            sets.forEach((s, sIdx) => {
              if (s && Array.isArray(s.cards)) {
                s.cards.forEach((c, cIdx) => {
                  all.push({
                    setIdx: sIdx,
                    cardIdx: cIdx,
                    setNum: sIdx + 1,
                    cardNum: cIdx + 1,
                    name: c.name,
                    emoji: c.emoji || "🃏",
                    setName: s.name,
                  });
                });
              }
            });
          }
          // Fisher-Yates shuffle
          for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [all[i], all[j]] = [all[j], all[i]];
          }
          return all.slice(0, count || 10);
        }

        function jpRenderPhase1UI() {
          const mode =
            window._jpCurrentMode ||
            (jpRoomSnap && jpRoomSnap.mode) ||
            window._jpLobbySelectedMode ||
            "normal";
          const isHard = mode === "hard";
          const nameEl = document.getElementById("jpSetName");
          const countEl = document.getElementById("jpCardCount");
          const instrEl = document.getElementById("jpInstructions");
          const fb = document.getElementById("jpFeedback1");
          if (fb) fb.style.display = "none";
          const grid = document.getElementById("jpInputGrid");
          if (!grid) return;
          grid.innerHTML = "";

          if (isHard) {
            if (nameEl) nameEl.textContent = "🔥 Hard Mode – All Sets Challenge";
            if (countEl) countEl.textContent = "10";
            if (instrEl) {
              instrEl.innerHTML =
                'Cards are selected from <strong>ANY set across the game</strong> — check "Set X - Card Y" above each box and type that card\'s name from memory!<br />' +
                'You have until the timer runs out to write all <strong>10</strong> names <strong>AND</strong> pick your cards!<br />' +
                '<span style="font-size:0.78rem;color:rgba(255, 100, 100, 0.8);font-weight:700;">⌨️ Keyboard suggestions & autocorrect are disabled — spell it yourself!</span>';
            }
            grid.classList.add("jp-hard-grid");

            if (!window._jpHardQuestions || !window._jpHardQuestions.length) {
              window._jpHardQuestions = jpGenerateHardQuestions(10);
            }
            const questions = window._jpHardQuestions;

            questions.forEach((q, i) => {
              const card = document.createElement("div");
              card.className = "jp-hard-q-card";
              card.innerHTML =
                '<div class="jp-hard-q-label">' +
                '<span class="jp-hard-q-num">' +
                (i + 1) +
                ".</span>" +
                '<span class="jp-hard-q-title">Set ' +
                q.setNum +
                " - Card " +
                q.cardNum +
                "</span>" +
                "</div>" +
                '<input class="jp-input jp-hard-input" id="jpInput' +
                i +
                '" data-q-idx="' +
                i +
                '" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="30" placeholder="Card name…">';
              grid.appendChild(card);
              const inp = card.querySelector("input");
              jpAttachSuggestionBlocker(inp);
            });
          } else {
            grid.classList.remove("jp-hard-grid");
            const set = SETS[jpSetIdx];
            if (nameEl) nameEl.textContent = set ? set.name : "Jackpot Event";
            if (countEl) countEl.textContent = set ? set.cards.length : "10";
            if (instrEl) {
              instrEl.innerHTML =
                'Cards appear in randomized numbered order — check each card number on the left and type that card\'s name from memory!<br />' +
                'You have until the timer runs out to write all <strong id="jpCardCount">' +
                (set ? set.cards.length : 10) +
                '</strong> names <strong>AND</strong> pick your cards!<br />' +
                '<span style="font-size:0.78rem;color:rgba(255, 100, 100, 0.8);font-weight:700;">⌨️ Keyboard suggestions & autocorrect are disabled — spell it yourself!</span>';
            }

            // Ensure jpCardOrder exists and matches this set length
            if (
              !window._jpCardOrder ||
              !Array.isArray(window._jpCardOrder) ||
              (set && window._jpCardOrder.length !== set.cards.length)
            ) {
              if (
                typeof jpCardOrder !== "undefined" &&
                Array.isArray(jpCardOrder) &&
                set &&
                jpCardOrder.length === set.cards.length
              ) {
                window._jpCardOrder = jpCardOrder;
              } else if (typeof jpShuffleOrder === "function" && set) {
                window._jpCardOrder = jpShuffleOrder(set.cards.length);
              } else if (set) {
                window._jpCardOrder = Array.from(
                  { length: set.cards.length },
                  (_, i) => i,
                );
              }
            }
            jpCardOrder = window._jpCardOrder;

            if (set && jpCardOrder) {
              jpCardOrder.forEach((cardIdx, rowIdx) => {
                const cardNum = cardIdx + 1;
                const row = document.createElement("div");
                row.className = "jp-input-row";
                row.innerHTML =
                  '<span class="jp-input-num">' +
                  cardNum +
                  ".</span>" +
                  '<input class="jp-input" id="jpInput' +
                  cardIdx +
                  '" data-card-idx="' +
                  cardIdx +
                  '" data-row-idx="' +
                  rowIdx +
                  '" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="30" placeholder="Card name…">';
                grid.appendChild(row);
                const inp = row.querySelector("input");
                jpAttachSuggestionBlocker(inp);
              });
            }
          }
        }
        function jpBeginLocalRound() {
          if (typeof window.jpClearAutoClose === "function") window.jpClearAutoClose();
          if (window._jpHostFinishedTimer) {
            clearInterval(window._jpHostFinishedTimer);
            window._jpHostFinishedTimer = null;
          }
          const mode =
            (jpRoomSnap && jpRoomSnap.mode) ||
            window._jpLobbySelectedMode ||
            "normal";
          window._jpCurrentMode = mode;
          if (mode === "hard") {
            window._jpHardQuestions = jpGenerateHardQuestions(10);
            window._jpCardOrder = null;
          } else {
            jpSetIdx = Math.floor(Math.random() * SETS.length);
            jpCardOrder = jpShuffleOrder(SETS[jpSetIdx].cards.length);
            window._jpCardOrder = jpCardOrder;
            window._jpHardQuestions = null;
          }
          jpSelectedCards = [];
          jpPhase1Result = null;
          jpSessionStart = Date.now();
          jpActive = true;
          jpRoundDuration =
            (jpRoomSnap && jpRoomSnap.duration) || JP_TIME_LIMIT;
          jpRenderPhase1UI();
          document.getElementById("jpPhase1").style.display = "";
          document.getElementById("jpPhase2").style.display = "none";
          document.getElementById("jpPhase3").style.display = "none";
          const tw = $cb("jpTimerWrap");
          if (tw) tw.style.display = "";
          jpStartTimer(false);
        }
        window.jpRenderPhase1UI = jpRenderPhase1UI;
        window.jpBeginLocalRound = jpBeginLocalRound;

        /* ════════ MARK DONE / AUTO-CLOSE WHEN EVERYONE'S FINISHED ════════
         Hooked onto the existing jjFinalizeSubmission/jpFinalizeSubmission below
         (monkey-patched) rather than editing those functions, so the untouched
         single-player submission logic keeps working exactly as before. */
        async function jjMarkDone() {
          const id = jjRoomId;
          const me = cbMe();
          if (!id) return;
          try {
            await update(jjGref(id), { ["players/" + me.id + "/done"]: true });
            await jjPushFeed(id, {
              t: "s",
              x: me.name + " finished their round! 🎉",
              ts: Date.now(),
            });
            const snap = await get(jjGref(id));
            const g = snap.val();
            const playing =
              g && g.players
                ? Object.entries(g.players)
                    .filter(([pid]) => pid !== g.hostId)
                    .map(([, p]) => p)
                : [];
            if (
              g &&
              g.status === "playing" &&
              playing.length &&
              playing.every((p) => p.done)
            ) {
              await update(jjGref(id), { status: "finished" });
              await jjPushFeed(id, {
                t: "s",
                x: "🏁 Everyone finished — room closed!",
                ts: Date.now(),
              });
              await jjLobbySet(id, { st: "finished", up: Date.now() });
            }
          } catch (e) {
            console.warn(e);
          }
        }
        async function jpMarkDone() {
          const id = jpRoomId;
          const me = cbMe();
          if (!id) return;
          try {
            await update(jpGref(id), { ["players/" + me.id + "/done"]: true });
            await jpPushFeed(id, {
              t: "s",
              x: me.name + " finished their round! 🎉",
              ts: Date.now(),
            });
            const snap = await get(jpGref(id));
            const g = snap.val();
            const playing =
              g && g.players
                ? Object.entries(g.players)
                    .filter(([pid]) => pid !== g.hostId)
                    .map(([, p]) => p)
                : [];
            if (
              g &&
              g.status === "playing" &&
              playing.length &&
              playing.every((p) => p.done)
            ) {
              await update(jpGref(id), { status: "finished" });
              await jpPushFeed(id, {
                t: "s",
                x: "🏁 Everyone finished — room closed!",
                ts: Date.now(),
              });
              await jpLobbySet(id, { st: "finished", up: Date.now() });
            }
          } catch (e) {
            console.warn(e);
          }
        }

        const _jjFinalizeSubmissionRoomless = jjFinalizeSubmission;
        jjFinalizeSubmission = function (auto, reason) {
          _jjFinalizeSubmissionRoomless(auto, reason);
          if (jjRoomId) jjMarkDone();
        };
        const _jpFinalizeSubmissionRoomless = jpFinalizeSubmission;
        jpFinalizeSubmission = function (auto, reason) {
          _jpFinalizeSubmissionRoomless(auto, reason);
          if (jpRoomId) jpMarkDone();
        };

        /* ════════ LEAVE / RECONNECT ════════ */
        async function jjLeaveGame() {
          jjStopHeartbeat();
          if (jjUnsubGame) {
            jjUnsubGame();
            jjUnsubGame = null;
          }
          jjClearTimer();
          jjHideTimer();
          jjRoundInProgress = false;
          jjActive = false;
          const id = jjRoomId,
            me = cbMe(),
            g = jjRoomSnap;
          jjRoomId = null;
          jjRoomSnap = null;
          jjLocalStarted = false;
          window._jjRoomSnap = null;
          window._jjCurrentMode = "normal";
          if (!id || !g) return;
          try {
            if (!g.players || !g.players[me.id]) return; // spectator — nothing to clean up
            let wasHost = false;
            const res = await runTransaction(jjGref(id), (cur) => {
              if (!cur || !cur.players || !cur.players[me.id]) return cur;
              wasHost = cur.hostId === me.id;
              delete cur.players[me.id];
              const left = Object.keys(cur.players);
              if (left.length === 0) {
                if (cur.isScheduled && cur.status === "lobby") {
                  return cur; // Do not delete scheduled room while in lobby
                }
                return null; // last player out → terminate the room automatically
              }
              if (cur.hostId === me.id) {
                if (cur.isScheduled && cur.status === "lobby") {
                  // Do not auto-end the scheduled room when host temporarily leaves the waiting room
                } else {
                  // Host left with players still in the room → auto-end the room for
                  // everyone instead of transferring leadership to another player.
                  cur.status = "finished";
                  cur.hostLeft = true;
                }
              }
              return cur;
            });
            if (!res || !res.committed) return;
            const committedVal = res.snapshot ? res.snapshot.val() : null;
            if (!committedVal) {
              if (!isDemoId(id) && !String(id).startsWith("sched_")) {
                await jjLobbySet(id, {
                  id,
                  host: me.name,
                  st: "finished",
                  n: 0,
                  up: Date.now(),
                });
              }
              return;
            }
            const leftKeys = Object.keys(committedVal.players || {});
            if (wasHost || committedVal.hostLeft) {
              await jjPushFeed(id, {
                t: "s",
                x: "🛑 " + me.name + " (host) left — room closed.",
                ts: Date.now(),
              });
              if (!isDemoId(id) && !committedVal.isScheduled) {
                await jjLobbySet(id, {
                  st: "finished",
                  n: leftKeys.length,
                  up: Date.now(),
                });
              }
              return;
            }
            await jjPushFeed(id, {
              t: "s",
              x: me.name + " left",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !committedVal.isScheduled) {
              await jjLobbySet(id, { n: leftKeys.length, up: Date.now() });
            }
          } catch (e) {
            /* best-effort cleanup */
          }
        }
        async function jpLeaveGame() {
          jpStopHeartbeat();
          if (jpUnsubGame) {
            jpUnsubGame();
            jpUnsubGame = null;
          }
          jpClearTimer();
          const tw = $cb("jpTimerWrap");
          if (tw) tw.style.display = "none";
          jpActive = false;
          const id = jpRoomId,
            me = cbMe(),
            g = jpRoomSnap;
          jpRoomId = null;
          jpRoomSnap = null;
          jpLocalStarted = false;
          window._jpRoomSnap = null;
          window._jpHardQuestions = null;
          window._jpCurrentMode = "normal";
          if (!id || !g) return;
          try {
            if (!g.players || !g.players[me.id]) return;
            let wasHost = false;
            const res = await runTransaction(jpGref(id), (cur) => {
              if (!cur || !cur.players || !cur.players[me.id]) return cur;
              wasHost = cur.hostId === me.id;
              delete cur.players[me.id];
              const left = Object.keys(cur.players);
              if (left.length === 0) {
                if (cur.isScheduled && cur.status === "lobby") {
                  return cur; // Do not delete scheduled room while in lobby
                }
                return null;
              }
              if (cur.hostId === me.id) {
                if (cur.isScheduled && cur.status === "lobby") {
                  // Do not auto-end the scheduled room when host temporarily leaves the waiting room
                } else {
                  // Host left with players still in the room → auto-end the room for
                  // everyone instead of transferring leadership to another player.
                  cur.status = "finished";
                  cur.hostLeft = true;
                }
              }
              return cur;
            });
            if (!res || !res.committed) return;
            const committedVal = res.snapshot ? res.snapshot.val() : null;
            if (!committedVal) {
              if (!isDemoId(id) && !String(id).startsWith("sched_")) {
                await jpLobbySet(id, {
                  id,
                  host: me.name,
                  st: "finished",
                  n: 0,
                  up: Date.now(),
                });
              }
              return;
            }
            const leftKeys = Object.keys(committedVal.players || {});
            if (wasHost || committedVal.hostLeft) {
              await jpPushFeed(id, {
                t: "s",
                x: "🛑 " + me.name + " (host) left — room closed.",
                ts: Date.now(),
              });
              if (!isDemoId(id) && !committedVal.isScheduled) {
                await jpLobbySet(id, {
                  st: "finished",
                  n: leftKeys.length,
                  up: Date.now(),
                });
              }
              return;
            }
            await jpPushFeed(id, {
              t: "s",
              x: me.name + " left",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !committedVal.isScheduled)
              await jpLobbySet(id, { n: leftKeys.length, up: Date.now() });
          } catch (e) {
            /* best-effort cleanup */
          }
        }

        /* ════════ HOST-ONLY: END ROOM FOR EVERYONE (hidden for demo rooms — see
         jjRenderRoomUI/jpRenderRoomUI, since leaving a solo demo already ends it) ════════ */
        window.jjEndRoom = async function () {
          const g = jjRoomSnap,
            me = cbMe();
          const canEnd = g && (g.hostId === me.id);
          if (!g || !canEnd) return;
          if (!confirm("End this room for everyone?")) return;
          const id = jjRoomId;
          try {
            await update(jjGref(id), { status: "finished" });
            if (g && g.isScheduled) {
              await remove(ref(rdb, "eventSchedules/" + (g.scheduledType || "jj"))).catch(() => {});
            }
            await jjPushFeed(id, {
              t: "s",
              x: "🛑 The host ended the room.",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled)
              await jjLobbySet(id, { st: "finished", up: Date.now() });
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not end the room");
          }
        };
        window.jpEndRoom = async function () {
          const g = jpRoomSnap,
            me = cbMe();
          const canEnd = g && (g.hostId === me.id);
          if (!g || !canEnd) return;
          if (!confirm("End this room for everyone?")) return;
          const id = jpRoomId;
          try {
            await update(jpGref(id), { status: "finished" });
            if (g && g.isScheduled) {
              await remove(ref(rdb, "eventSchedules/" + (g.scheduledType || "jp"))).catch(() => {});
            }
            await jpPushFeed(id, {
              t: "s",
              x: "🛑 The host ended the room.",
              ts: Date.now(),
            });
            if (!isDemoId(id) && !g.isScheduled)
              await jpLobbySet(id, { st: "finished", up: Date.now() });
          } catch (e) {
            console.warn(e);
            cbToast("⚠️ Could not end the room");
          }
        };

        /* Only reached if the room DOC itself was removed (e.g. last player left
         from another tab) while we still thought we were in it. */
        function jjBackToLobby() {
          if (window._jjHostFinishedTimer) {
            clearInterval(window._jjHostFinishedTimer);
            window._jjHostFinishedTimer = null;
          }
          if (typeof window.jjClearAutoClose === "function") window.jjClearAutoClose();
          jjStopHeartbeat();
          if (jjUnsubGame) {
            jjUnsubGame();
            jjUnsubGame = null;
          }
          jjClearTimer();
          jjHideTimer();
          jjRoundInProgress = false;
          jjActive = false;
          jjLocalStarted = false;
          jjRoomId = null;
          jjRoomSnap = null;
          window._jjRoomSnap = null;
          window._jjCurrentMode = "normal";
          $cb("jjGameView").style.display = "none";
          $cb("jjEndBtn").style.display = "none";
          $cb("jjLobbyView").style.display = "";
          if (jjUnsubLobby) {
            jjUnsubLobby();
            jjUnsubLobby = null;
          }
          jjUnsubLobby = onValue(jjLobbyRef, (s) =>
            jjRenderLobby(s.val() || {}),
          );
        }
        function jpBackToLobby() {
          if (window._jpHostFinishedTimer) {
            clearInterval(window._jpHostFinishedTimer);
            window._jpHostFinishedTimer = null;
          }
          if (typeof window.jpClearAutoClose === "function") window.jpClearAutoClose();
          jpStopHeartbeat();
          if (jpUnsubGame) {
            jpUnsubGame();
            jpUnsubGame = null;
          }
          jpClearTimer();
          const tw = $cb("jpTimerWrap");
          if (tw) tw.style.display = "none";
          jpActive = false;
          jpLocalStarted = false;
          jpRoomId = null;
          jpRoomSnap = null;
          window._jpRoomSnap = null;
          window._jpHardQuestions = null;
          window._jpCurrentMode = "normal";
          $cb("jpGameView").style.display = "none";
          $cb("jpEndBtn").style.display = "none";
          $cb("jpLobbyView").style.display = "";
          if (jpUnsubLobby) {
            jpUnsubLobby();
            jpUnsubLobby = null;
          }
          jpUnsubLobby = onValue(jpLobbyRef, (s) =>
            jpRenderLobby(s.val() || {}),
          );
        }

        window.stopMultiplayerListeners = function () {
          if (cbUnsubLobby) {
            cbUnsubLobby();
            cbUnsubLobby = null;
          }
          if (cbUnsubGame) {
            cbUnsubGame();
            cbUnsubGame = null;
          }
          if (jjUnsubLobby) {
            jjUnsubLobby();
            jjUnsubLobby = null;
          }
          if (jjUnsubGame) {
            jjUnsubGame();
            jjUnsubGame = null;
          }
          if (jpUnsubLobby) {
            jpUnsubLobby();
            jpUnsubLobby = null;
          }
          if (jpUnsubGame) {
            jpUnsubGame();
            jpUnsubGame = null;
          }
        };

        /* ── GLOBAL INSTANT HIGHLIGHT DELEGATOR ──
         Ensures mode, difficulty & timer selector buttons highlight immediately
         upon click with zero network or callback delay. */
        document.addEventListener("click", (e) => {
          const diffBtn = e.target.closest(".cb-diff-btn");
          if (diffBtn) {
            const picker = diffBtn.closest(".cb-diff-picker");
            if (picker) {
              picker.querySelectorAll(".cb-diff-btn").forEach((b) => {
                b.classList.toggle("active", b === diffBtn);
              });
            }
            return;
          }
          const timerBtn = e.target.closest(".cb-timer-btn");
          if (timerBtn) {
            const timerPicker = timerBtn.closest(".cb-timer-picker");
            if (timerPicker) {
              timerPicker.querySelectorAll(".cb-timer-btn").forEach((b) => {
                b.classList.toggle("active", b === timerBtn);
              });
            }
          }
        });

        /* ════════════════════════════════════════════════════════════════════
         COMMUNITY SCHEDULED EVENTS SUBSYSTEM (CB, JJ, JP)
         - Fixed time scheduled in Indian Standard Time (IST, UTC+5:30)
         - Automatic conversion to local device timezone for all global players
         - Live countdown timer on event banners (top right) and section strip
         - Synchronized simultaneous event launch
         - Admin Overseer in JJ and JP (sees all players playing from lobby)
         - Admin Player in CB (plays as participant with admin lock/control privileges)
         ════════════════════════════════════════════════════════════════════ */
        const eventSchedulesRef = ref(rdb, "eventSchedules");
        let schedUnsub = null;
        let schedTicker = null;
        window._activeSchedules = {};

        // Helper: get current date/time parts in Indian Standard Time (IST, Asia/Kolkata)
        function getISTDateParts(d = new Date()) {
          const nf = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
          });
          const parts = nf.formatToParts(d);
          const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
          let hr = get("hour");
          if (hr === "24") hr = "00";
          return {
            year: get("year"),
            month: get("month"),
            day: get("day"),
            hour: hr,
            minute: get("minute"),
            second: get("second"),
            dateStr: `${get("year")}-${get("month")}-${get("day")}`,
            timeStr: `${hr}:${get("minute")}`
          };
        }

        // Helper: parse date and time string in IST into universal UTC timestamp ms
        function parseISTToTimestamp(dateStr, timeStr) {
          if (!dateStr || !timeStr) return NaN;
          try {
            const dateParts = dateStr.split("-").map(Number);
            const timeParts = timeStr.split(":").map(Number);
            if (dateParts.length >= 3 && timeParts.length >= 2) {
              const y = dateParts[0];
              const m = dateParts[1] - 1;
              const d = dateParts[2];
              let hr = timeParts[0];
              if (hr === 24) hr = 0;
              const min = timeParts[1];
              const sec = timeParts[2] || 0;
              const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
              return Date.UTC(y, m, d, hr, min, sec) - istOffsetMs;
            }
          } catch (e) {}
          const iso = `${dateStr}T${timeStr}:00+05:30`;
          return new Date(iso).getTime();
        }

        // Helper: format a UTC timestamp into both IST and user's local timezone
        function formatEventTime(timestampMs) {
          if (!timestampMs || isNaN(timestampMs)) {
            return { ist: "--", local: "--", isUserInIST: true, displaySummary: "--" };
          }
          const d = new Date(timestampMs);

          // 1. IST format
          const istFormatter = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          const istStr = istFormatter.format(d) + " IST";

          // 2. User Local format
          let localStr = "";
          let isUserInIST = false;
          try {
            const localFormatter = new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZoneName: "short",
            });
            localStr = localFormatter.format(d);
            isUserInIST = d.getTimezoneOffset() === -330;
          } catch (e) {
            localStr = d.toLocaleTimeString();
          }

          const displaySummary = isUserInIST ? istStr : `${istStr} · (Your time: ${localStr})`;

          return {
            ist: istStr,
            local: localStr,
            isUserInIST: isUserInIST,
            displaySummary: displaySummary,
          };
        }
        window.formatEventTime = formatEventTime;

        // Helper: format remaining ms countdown into human-friendly string
        function formatCountdown(diffMs) {
          if (diffMs <= 0) return "LIVE NOW";
          const totalSecs = Math.floor(diffMs / 1000);
          const days = Math.floor(totalSecs / 86400);
          const hours = Math.floor((totalSecs % 86400) / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          const secs = totalSecs % 60;

          if (days > 0) {
            return `${days}d ${hours}h left`;
          }
          if (hours > 0) {
            const h = String(hours).padStart(2, "0");
            const m = String(mins).padStart(2, "0");
            const s = String(secs).padStart(2, "0");
            return `${h}:${m}:${s}`;
          }
          const m = String(mins).padStart(2, "0");
          const s = String(secs).padStart(2, "0");
          return `${m}:${s}`;
        }
        window.formatCountdown = formatCountdown;

        // Update in-room waiting countdowns for CB, JJ, and JP plus inline lobby room countdowns
        function renderWaitingRoomScheduleCountdowns() {
          // 1. Cards Battle waiting countdown
          const cbBar = document.getElementById("cbScheduledRoomBar");
          if (cbSnap && cbSnap.isScheduled && cbSnap.status === "lobby" && cbSnap.scheduledTime) {
            const schedCount = document.getElementById("cbScheduledRoomCountdown");
            const cardEl = document.getElementById("cbCard");
            const diff = cbSnap.scheduledTime - Date.now();
            const timeInfo = formatEventTime(cbSnap.scheduledTime);
            if (cbBar) cbBar.style.display = "block";
            const me = cbMe();
            const isHost = Boolean(me && cbSnap.hostId === me.id);
            if (diff <= 0) {
              if (schedCount) schedCount.textContent = "🔴 LIVE NOW";
              if (cardEl) cardEl.innerHTML = '<div style="font-weight:800;color:#ffd54f;font-size:1.05rem;">🔴 EVENT IS LIVE NOW!</div><div style="font-size:0.85rem;color:#e0d4fc;margin-top:4px;">Starting any moment…</div>';
              if (!window._cbAutoStarting && (isHost || diff <= -1500)) {
                window._cbAutoStarting = true;
                cbStart().finally(() => {
                  setTimeout(() => { window._cbAutoStarting = false; }, 2000);
                });
              }
            } else {
              if (schedCount) schedCount.textContent = "⏳ Event in " + formatCountdown(diff);
              if (cardEl) cardEl.innerHTML = `<div style="font-weight:800;color:#ffd54f;font-size:1.05rem;margin-bottom:4px;">⭐ OFFICIAL SCHEDULED BATTLE</div><div style="font-size:1.8rem;font-weight:900;color:#ffffff;margin-bottom:4px;">⏳ Event in ${formatCountdown(diff)}</div><div style="font-size:0.82rem;color:#e0d4fc;">🕒 Scheduled for: ${escapeHtml(timeInfo.ist)}</div>`;
            }
          } else if (cbBar) {
            cbBar.style.display = "none";
          }

          // 2. Jumbled Jackpot waiting countdown
          const jjBox = document.getElementById("jjWaitSchedBox");
          if (jjRoomSnap && jjRoomSnap.isScheduled && jjRoomSnap.status === "lobby" && jjRoomSnap.scheduledTime) {
            const schedCount = document.getElementById("jjWaitSchedCountdown");
            const schedTime = document.getElementById("jjWaitSchedTime");
            const diff = jjRoomSnap.scheduledTime - Date.now();
            const timeInfo = formatEventTime(jjRoomSnap.scheduledTime);
            if (jjBox) jjBox.style.display = "block";
            if (schedCount) schedCount.textContent = diff <= 0 ? "🔴 EVENT IS LIVE NOW!" : "⏳ Event in " + formatCountdown(diff);
            if (schedTime) schedTime.textContent = "🕒 Scheduled for: " + timeInfo.ist;
            const me = cbMe();
            const isHost = Boolean(me && jjRoomSnap.hostId === me.id);
            if (diff <= 0 && !window._jjAutoStarting && (isHost || diff <= -1500)) {
              window._jjAutoStarting = true;
              jjStart().finally(() => {
                setTimeout(() => { window._jjAutoStarting = false; }, 2000);
              });
            }
          } else if (jjBox) {
            jjBox.style.display = "none";
          }

          // 3. Jackpot Event waiting countdown
          const jpBox = document.getElementById("jpWaitSchedBox");
          if (jpRoomSnap && jpRoomSnap.isScheduled && jpRoomSnap.status === "lobby" && jpRoomSnap.scheduledTime) {
            const schedCount = document.getElementById("jpWaitSchedCountdown");
            const schedTime = document.getElementById("jpWaitSchedTime");
            const diff = jpRoomSnap.scheduledTime - Date.now();
            const timeInfo = formatEventTime(jpRoomSnap.scheduledTime);
            if (jpBox) jpBox.style.display = "block";
            if (schedCount) schedCount.textContent = diff <= 0 ? "🔴 EVENT IS LIVE NOW!" : "⏳ Event in " + formatCountdown(diff);
            if (schedTime) schedTime.textContent = "🕒 Scheduled for: " + timeInfo.ist;
            const me = cbMe();
            const isHost = Boolean(me && jpRoomSnap.hostId === me.id);
            if (diff <= 0 && !window._jpAutoStarting && (isHost || diff <= -1500)) {
              window._jpAutoStarting = true;
              jpStart().finally(() => {
                setTimeout(() => { window._jpAutoStarting = false; }, 2000);
              });
            }
          } else if (jpBox) {
            jpBox.style.display = "none";
          }

          // 4. Inline lobby room countdowns
          document.querySelectorAll(".sched-inline-countdown").forEach((el) => {
            const ts = Number(el.dataset.time);
            if (ts) {
              const diff = ts - Date.now();
              el.textContent = diff <= 0 ? "🔴 LIVE NOW" : "⏳ Event in " + formatCountdown(diff);
            }
          });
        }

        // Render all schedule UI elements (badges, banner strip, admin list, lobby cards)
        function renderAllScheduleUI() {
          const schedules = window._activeSchedules || {};
          const now = Date.now();
          const types = ["cb", "jj", "jp"];

          let activeSchedList = [];

          types.forEach((type) => {
            const sched = schedules[type];
            const badgeEl = document.getElementById(type + "ScheduleBadge");
            const countEl = document.getElementById(type + "ScheduleCountdown");
            const lobbyCardEl = document.getElementById(type + "SchedLobbyCard");

            if (!sched || sched.status === "cancelled" || sched.status === "finished") {
              if (badgeEl) badgeEl.style.display = "none";
              if (lobbyCardEl) lobbyCardEl.style.display = "none";
              return;
            }

            const diff = (sched.scheduledTime || 0) - now;
            // Clean up after 2 hours past scheduled start
            if (diff < -2 * 3600 * 1000) {
              if (badgeEl) badgeEl.style.display = "none";
              if (lobbyCardEl) lobbyCardEl.style.display = "none";
              return;
            }

            activeSchedList.push(sched);
            const isLive = diff <= 0;
            const formattedTimer = formatCountdown(diff);
            const bannerText = isLive ? "LIVE NOW" : "Event in " + formattedTimer;
            const countText = isLive ? "🔴 LIVE NOW" : "⏳ Event in " + formattedTimer;

            // Floating banner badge (top right of banner)
            if (badgeEl && countEl) {
              badgeEl.style.display = "inline-flex";
              badgeEl.classList.toggle("is-live", isLive);
              const iconEl = badgeEl.querySelector(".esb-icon");
              if (iconEl) iconEl.textContent = isLive ? "🔴" : "⏳";
              countEl.textContent = bannerText;
            }

            // Pinned scheduled room card in event lobby
            if (lobbyCardEl) {
              lobbyCardEl.style.display = "";
              const timeInfo = formatEventTime(sched.scheduledTime);
              const modeDetail = type === "cb"
                ? (sched.difficulty ? sched.difficulty.toUpperCase() + " • " + (sched.questionSecs || 25) + "s timer" : "")
                : (sched.mode === "hard" ? "🔥 Hard Mode" : "🎯 Normal Mode") + (sched.duration ? " • " + Math.floor(sched.duration / 60) + "m timer" : "");
              lobbyCardEl.innerHTML = `
                <div class="src-header">
                  <div class="src-title">⭐ OFFICIAL SCHEDULED EVENT</div>
                  <span class="ess-badge ${isLive ? "live" : ""}">${isLive ? "🔴 LIVE" : "⏳ UPCOMING"}</span>
                </div>
                <div class="src-time-info">
                  <div>🕒 <strong>${escapeHtml(timeInfo.ist)}</strong></div>
                  ${!timeInfo.isUserInIST ? `<div style="color:#b7a9db">🌍 Your time: ${escapeHtml(timeInfo.local)}</div>` : ""}
                  ${modeDetail ? `<div style="font-size:0.75rem;color:#ffd54f;margin-top:2px;">⚙️ ${escapeHtml(modeDetail)}</div>` : ""}
                </div>
                <div class="src-footer">
                  <span class="src-countdown">${countText}</span>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <button type="button" class="btn btn-gold" style="padding:6px 14px;font-size:0.8rem;" onclick="joinScheduledEventRoom('${type}')">
                      ${isLive ? "⚡ Enter Live Room" : "🎮 Join Waiting Room"}
                    </button>
                    <button type="button" class="btn btn-purple" style="padding:6px 10px;font-size:0.8rem;" onclick="openScheduleEventModal('${type}')" title="Host/Admin Settings">
                      ⚙️
                    </button>
                  </div>
                </div>
              `;
            }
          });

          // Render upcoming scheduled event strip in #panel-match
          renderScheduleStrip(activeSchedList);

          // Render active schedules in admin panel
          renderAdminScheduledEventsList(activeSchedList);

          // Check admin schedule trigger bar visibility
          updateScheduleAdminVisibility();

          // Render in-room waiting countdowns and inline room countdowns
          renderWaitingRoomScheduleCountdowns();
        }

        // Render the #eventsScheduleStrip in Events Hub
        function renderScheduleStrip(activeScheds) {
          const strip = document.getElementById("eventsScheduleStrip");
          if (!strip) return;
          if (!activeScheds || !activeScheds.length) {
            strip.style.display = "none";
            strip.innerHTML = "";
            return;
          }

          const sorted = activeScheds.slice().sort((a, b) => a.scheduledTime - b.scheduledTime);
          const sched = sorted[0];
          const now = Date.now();
          const diff = sched.scheduledTime - now;
          const isLive = diff <= 0;
          const timeInfo = formatEventTime(sched.scheduledTime);
          const countText = isLive ? "🔴 EVENT IS LIVE NOW!" : "Event in " + formatCountdown(diff);
          const iconMap = { cb: "⚔️", jj: "🔀", jp: "🎯" };
          const nameMap = { cb: "Cards Battle", jj: "Jumbled Jackpot", jp: "Jackpot Event" };
          const icon = iconMap[sched.type] || "🎪";
          const name = nameMap[sched.type] || sched.title || "Community Event";
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();

          strip.style.display = "";
          strip.innerHTML = `
            <div class="ess-header">
              <div class="ess-title-wrap">
                <span class="ess-icon">${icon}</span>
                <span class="ess-title">${escapeHtml(name)} — Scheduled Event</span>
              </div>
              <span class="ess-badge ${isLive ? "live" : ""}">${isLive ? "🔴 LIVE NOW" : "⏳ SCHEDULED"}</span>
            </div>
            <div class="ess-countdown-box">
              <span class="ess-countdown-lbl">⏱️ ${isLive ? "Status:" : "Countdown:"}</span>
              <span class="ess-countdown-val">${countText}</span>
            </div>
            <div class="ess-times-row">
              <div class="ess-time-item">
                <span>🕒 Scheduled:</span>
                <strong>${escapeHtml(timeInfo.ist)}</strong>
              </div>
              ${!timeInfo.isUserInIST ? `
                <div class="ess-time-item local-time">
                  <span>🌍 In your timezone:</span>
                  <strong>${escapeHtml(timeInfo.local)}</strong>
                </div>
              ` : ""}
            </div>
            <div class="ess-actions">
              <button type="button" class="btn btn-gold" style="flex:1" onclick="joinScheduledEventRoom('${sched.type}')">
                ${isLive ? "⚡ Enter Live Room" : "🎮 Enter Room Early"}
              </button>
              ${isAdm ? `
                <button type="button" class="btn btn-purple" style="padding:8px 12px;font-size:0.8rem;" onclick="openScheduleEventModal('${sched.type}')" title="Edit Schedule">
                  ⚙️ Manage
                </button>
                <button type="button" class="btn" style="background:#e74c3c;color:#fff;padding:8px 12px;font-size:0.8rem;" onclick="cancelScheduledEvent('${sched.type}')" title="Cancel Schedule">
                  🗑️ Cancel
                </button>
              ` : ""}
            </div>
          `;
        }

        // Render active schedules inside Admin Dashboard (Mantralay)
        function renderAdminScheduledEventsList(activeScheds) {
          const container = document.getElementById("adminScheduledEventsList");
          if (!container) return;
          if (!activeScheds || !activeScheds.length) {
            container.innerHTML = '<div style="color: rgba(255, 255, 255, 0.45); font-size: 0.8rem; font-style: italic;">No scheduled events currently active. Tap "＋ Schedule Event" to set one.</div>';
            return;
          }

          const iconMap = { cb: "⚔️ Cards Battle", jj: "🔀 Jumbled Jackpot", jp: "🎯 Jackpot Event" };
          container.innerHTML = activeScheds
            .map((s) => {
              const diff = s.scheduledTime - Date.now();
              const isLive = diff <= 0;
              const timeInfo = formatEventTime(s.scheduledTime);
              return `
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(245, 197, 66, 0.25); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <div>
                    <div style="font-weight: 800; color: #ffd54f; font-size: 0.88rem;">${iconMap[s.type] || s.title}</div>
                    <div style="font-size: 0.75rem; color: #ffffff; margin-top: 2px;">🕒 ${escapeHtml(timeInfo.ist)}</div>
                    <div style="font-size: 0.72rem; color: #b7a9db;">${!timeInfo.isUserInIST ? `🌍 Local: ${escapeHtml(timeInfo.local)} · ` : ""}⏳ ${isLive ? "🔴 LIVE NOW" : "Event in " + formatCountdown(diff)}</div>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button type="button" class="btn btn-purple" style="font-size: 0.75rem; padding: 6px 10px;" onclick="openScheduleEventModal('${s.type}')">⚙️ Edit</button>
                    <button type="button" class="btn" style="background:#e74c3c;color:#fff;font-size:0.75rem;padding:6px 10px;" onclick="cancelScheduledEvent('${s.type}')">🗑️</button>
                  </div>
                </div>
              `;
            })
            .join("");
        }

        // Check and toggle admin schedule bar visibility
        function updateScheduleAdminVisibility() {
          const bar = document.getElementById("adminScheduleBar");
          if (!bar) return;
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          bar.style.display = isAdm ? "" : "none";
        }
        window.updateScheduleAdminVisibility = updateScheduleAdminVisibility;

        // Room duration watchdog: automatically ends playing rooms when their set timer expires
        function checkActiveRoomWatchdog() {
          const now = Date.now();
          // 1. Jumbled Jackpot watchdog
          if (jjRoomId && jjRoomSnap && jjRoomSnap.status === "playing") {
            const g = jjRoomSnap;
            if (g.startedAt && g.duration) {
              const expireAt = g.startedAt + g.duration * 1000;
              const me = cbMe();
              const isHost = Boolean(g.hostId && g.hostId === me.id);
              if (isHost) {
                jjRenderHostStatus(g);
              }
              if (now >= expireAt) {
                const id = jjRoomId;
                if (!window._jjRoomExpiring) {
                  window._jjRoomExpiring = true;
                  runTransaction(jjGref(id), (cur) => {
                    if (!cur || cur.status !== "playing") return;
                    cur.status = "finished";
                    cur.timedOut = true;
                    return cur;
                  })
                    .then((res) => {
                      if (res && res.committed) {
                        jjPushFeed(id, {
                          t: "s",
                          x: "⏰ Set timer expired — room closed!",
                          ts: Date.now(),
                        }).catch(() => {});
                        if (!isDemoId(id) && !g.isScheduled) {
                          jjLobbySet(id, { st: "finished", up: Date.now() }).catch(() => {});
                        }
                        if (g.isScheduled) {
                          remove(ref(rdb, "eventSchedules/" + (g.scheduledType || "jj"))).catch(() => {});
                        }
                      }
                    })
                    .catch(console.warn)
                    .finally(() => {
                      setTimeout(() => {
                        window._jjRoomExpiring = false;
                      }, 3000);
                    });
                }
              }
            }
          }

          // 2. Jackpot Event watchdog
          if (jpRoomId && jpRoomSnap && jpRoomSnap.status === "playing") {
            const g = jpRoomSnap;
            if (g.startedAt && g.duration) {
              const expireAt = g.startedAt + g.duration * 1000;
              const me = cbMe();
              const isHost = Boolean(g.hostId && g.hostId === me.id);
              if (isHost) {
                jpRenderHostStatus(g);
              }
              if (now >= expireAt) {
                const id = jpRoomId;
                if (!window._jpRoomExpiring) {
                  window._jpRoomExpiring = true;
                  runTransaction(jpGref(id), (cur) => {
                    if (!cur || cur.status !== "playing") return;
                    cur.status = "finished";
                    cur.timedOut = true;
                    return cur;
                  })
                    .then((res) => {
                      if (res && res.committed) {
                        jpPushFeed(id, {
                          t: "s",
                          x: "⏰ Set timer expired — room closed!",
                          ts: Date.now(),
                        }).catch(() => {});
                        if (!isDemoId(id) && !g.isScheduled) {
                          jpLobbySet(id, { st: "finished", up: Date.now() }).catch(() => {});
                        }
                        if (g.isScheduled) {
                          remove(ref(rdb, "eventSchedules/" + (g.scheduledType || "jp"))).catch(() => {});
                        }
                      }
                    })
                    .catch(console.warn)
                    .finally(() => {
                      setTimeout(() => {
                        window._jpRoomExpiring = false;
                      }, 3000);
                    });
                }
              }
            }
          }
        }

        // Initialize listener for Realtime Database eventSchedules
        function initEventSchedulesListener() {
          if (schedUnsub) return;
          schedUnsub = onValue(
            eventSchedulesRef,
            (snap) => {
              window._activeSchedules = snap.val() || {};
              renderAllScheduleUI();
            },
            (err) => console.warn("eventSchedules listen failed:", err)
          );

          if (!schedTicker) {
            schedTicker = setInterval(() => {
              renderAllScheduleUI();
              checkActiveRoomWatchdog();
            }, 1000);
          }
        }
        initEventSchedulesListener();

        // ── Admin Modal Interactions ──
        let _currentSchedType = "cb";
        let _selectedCbDiff = "easy";
        let _selectedCbTimer = 25;
        let _selectedJjMode = "normal";
        let _selectedJpMode = "normal";

        window.openScheduleEventModal = function (defaultType = "cb") {
          const type = defaultType || "cb";
          const eventNames = { cb: "Cards Battle", jj: "Jumbled Jackpot", jp: "Jackpot Event" };
          const eventName = eventNames[type] || "Event";

          // ALWAYS prompt for host/admin password when scheduling
          const pw = prompt("🔒 Enter password to schedule " + eventName + ":");
          if (pw === null) return; // user cancelled
          const trimmed = pw.trim().toLowerCase();
          const requiredPw =
            type === "cb"
              ? CB_ROOM_PASSWORD
              : type === "jj"
                ? JJ_ROOM_PASSWORD
                : JP_ROOM_PASSWORD;
          if (
            trimmed !== requiredPw &&
            trimmed !== "696969" &&
            trimmed !== CB_ROOM_PASSWORD
          ) {
            cbToast("🔒 Wrong password — cannot schedule event");
            return;
          }

          _currentSchedType = type;

          // Always ensure the modal only displays this single opened event
          const meta = {
            cb: { icon: "⚔️", title: "Schedule Cards Battle", sub: "Set a fixed time for all players to join Cards Battle. Times are in IST and automatically converted to each player's local timezone." },
            jj: { icon: "🔀", title: "Schedule Jumbled Jackpot", sub: "Set a fixed time for all players to join Jumbled Jackpot. Times are in IST and automatically converted to each player's local timezone." },
            jp: { icon: "🎯", title: "Schedule Jackpot Event", sub: "Set a fixed time for all players to join Jackpot Event. Times are in IST and automatically converted to each player's local timezone." },
          }[type] || { icon: "🗓️", title: "Schedule Event", sub: "Set a fixed time for all players across the community." };

          const iconEl = document.getElementById("schedModalIcon");
          const titleEl = document.getElementById("schedModalTitle");
          const subEl = document.getElementById("schedModalSub");
          if (iconEl) iconEl.textContent = meta.icon;
          if (titleEl) titleEl.textContent = meta.title;
          if (subEl) subEl.textContent = meta.sub;

          const picker = document.getElementById("schedTypePicker");
          if (picker) picker.style.display = "none";

          selectSchedEventType(_currentSchedType);

          const overlay = document.getElementById("scheduleEventOverlay");
          if (overlay) {
            overlay.classList.add("show");
            if (window.daPushOverlayState) window.daPushOverlayState("scheduleEventOverlay");
          }

          // Attach live change listeners to date and time inputs
          const dateInp = document.getElementById("schedDateInput");
          const timeInp = document.getElementById("schedTimeInput");
          if (dateInp) dateInp.oninput = updateSchedModalLivePreview;
          if (timeInp) timeInp.oninput = updateSchedModalLivePreview;

          updateSchedModalLivePreview();

          if (window._schedModalTicker) clearInterval(window._schedModalTicker);
          window._schedModalTicker = setInterval(updateSchedModalLivePreview, 1000);
        };

        window.closeScheduleEventModal = function () {
          if (window._schedModalTicker) {
            clearInterval(window._schedModalTicker);
            window._schedModalTicker = null;
          }
          const overlay = document.getElementById("scheduleEventOverlay");
          if (overlay) {
            overlay.classList.remove("show");
            if (window.daClearOverlayState) window.daClearOverlayState("scheduleEventOverlay");
          }
        };

        window.selectSchedEventType = function (type) {
          _currentSchedType = type;
          const picker = document.getElementById("schedTypePicker");
          if (picker) picker.style.display = "none"; // Hide tabs so only opened event is shown

          // Show/hide per-event option panels
          const cbOpts = document.getElementById("schedOptions-cb");
          const jjOpts = document.getElementById("schedOptions-jj");
          const jpOpts = document.getElementById("schedOptions-jp");
          if (cbOpts) cbOpts.style.display = type === "cb" ? "" : "none";
          if (jjOpts) jjOpts.style.display = type === "jj" ? "" : "none";
          if (jpOpts) jpOpts.style.display = type === "jp" ? "" : "none";

          // If an active schedule already exists for this event, preload its values
          const sched = window._activeSchedules && window._activeSchedules[type];
          const cancelBtn = document.getElementById("btnCancelActiveSchedule");
          const saveBtn = document.getElementById("btnSaveSchedule");
          const dateInp = document.getElementById("schedDateInput");
          const timeInp = document.getElementById("schedTimeInput");

          if (sched && sched.status !== "cancelled" && sched.status !== "finished") {
            const istParts = getISTDateParts(new Date(sched.scheduledTime));
            if (dateInp) dateInp.value = istParts.dateStr;
            if (timeInp) timeInp.value = istParts.timeStr;
            if (sched.difficulty) selectSchedCbDiff(sched.difficulty);
            if (sched.questionSecs) selectSchedCbTimer(sched.questionSecs);
            if (sched.mode) {
              if (type === "jj") selectSchedJjMode(sched.mode);
              if (type === "jp") selectSchedJpMode(sched.mode);
            }
            if (sched.duration) {
              if (type === "jj") {
                const el = document.getElementById("schedJjDuration");
                if (el) el.value = String(sched.duration);
              } else if (type === "jp") {
                const el = document.getElementById("schedJpDuration");
                if (el) el.value = String(sched.duration);
              }
            }
            if (cancelBtn) cancelBtn.style.display = "";
            if (saveBtn) saveBtn.textContent = "✏️ Update Schedule";
          } else {
            // Default: 30 minutes from now in IST
            const defTarget = new Date(Date.now() + 30 * 60 * 1000);
            const istParts = getISTDateParts(defTarget);
            if (dateInp) dateInp.value = istParts.dateStr;
            if (timeInp) timeInp.value = istParts.timeStr;
            if (type === "cb") {
              selectSchedCbDiff("easy");
              selectSchedCbTimer(25);
            } else if (type === "jj") {
              selectSchedJjMode("normal");
              const el = document.getElementById("schedJjDuration");
              if (el) el.value = "300";
            } else if (type === "jp") {
              selectSchedJpMode("normal");
              const el = document.getElementById("schedJpDuration");
              if (el) el.value = "180";
            }
            if (cancelBtn) cancelBtn.style.display = "none";
            if (saveBtn) saveBtn.textContent = "🚀 Schedule Event";
          }

          updateSchedModalLivePreview();
        };

        window.selectSchedCbDiff = function (diff) {
          _selectedCbDiff = diff;
          document.querySelectorAll("#schedCbDiffPicker .cb-diff-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.diff === diff);
          });
        };

        window.selectSchedCbTimer = function (secs) {
          _selectedCbTimer = Number(secs);
          document.querySelectorAll("#schedCbTimerPicker .cb-timer-btn").forEach((btn) => {
            btn.classList.toggle("active", Number(btn.dataset.secs) === _selectedCbTimer);
          });
        };

        window.selectSchedJjMode = function (mode) {
          _selectedJjMode = mode;
          document.querySelectorAll("#schedJjModePicker .cb-diff-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.mode === mode);
          });
        };

        window.selectSchedJpMode = function (mode) {
          _selectedJpMode = mode;
          document.querySelectorAll("#schedJpModePicker .cb-diff-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.mode === mode);
          });
        };

        function updateSchedModalLivePreview() {
          const dateInp = document.getElementById("schedDateInput");
          const timeInp = document.getElementById("schedTimeInput");
          const previewIST = document.getElementById("schedPreviewIST");
          const previewLocal = document.getElementById("schedPreviewLocal");
          const previewLocalRow = document.getElementById("schedPreviewLocalRow");
          const previewCountdown = document.getElementById("schedPreviewCountdown");

          if (!dateInp || !timeInp || !dateInp.value || !timeInp.value) return;

          const ts = parseISTToTimestamp(dateInp.value, timeInp.value);
          if (isNaN(ts)) {
            if (previewIST) previewIST.textContent = "⚠️ Invalid date/time";
            return;
          }

          const timeInfo = formatEventTime(ts);
          if (previewIST) previewIST.textContent = timeInfo.ist;
          if (previewLocal && previewLocalRow) {
            if (timeInfo.isUserInIST) {
              previewLocalRow.style.display = "none";
            } else {
              previewLocalRow.style.display = "flex";
              previewLocal.textContent = timeInfo.local;
            }
          }

          const diff = ts - Date.now();
          if (previewCountdown) {
            if (diff <= 0) {
              previewCountdown.innerHTML = '<span style="color:#ef4444">⚠️ Selected time has already passed! Pick a future time.</span>';
            } else {
              previewCountdown.innerHTML = '<span style="color:#ffd54f">⏳ Event in ' + formatCountdown(diff) + '</span>';
            }
          }
        }
        window.updateSchedModalLivePreview = updateSchedModalLivePreview;

        window.saveScheduledEventFromModal = async function () {
          const dateInp = document.getElementById("schedDateInput");
          const timeInp = document.getElementById("schedTimeInput");
          if (!dateInp || !timeInp || !dateInp.value || !timeInp.value) {
            cbToast("⚠️ Please pick both date and time");
            return;
          }

          const schedTime = parseISTToTimestamp(dateInp.value, timeInp.value);
          if (isNaN(schedTime)) {
            cbToast("⚠️ Invalid date or time specified");
            return;
          }

          const now = Date.now();
          if (schedTime < now - 30000) {
            cbToast("⚠️ Please choose a time in the future");
            return;
          }

          const type = _currentSchedType || "cb";
          const me = cbMe();
          const roomId = "sched_" + type + "_" + schedTime;
          const timeInfo = formatEventTime(schedTime);
          const nameMap = { cb: "Cards Battle", jj: "Jumbled Jackpot", jp: "Jackpot Event" };
          const title = nameMap[type] || "Community Event";

          const durationEl = type === "jj" ? document.getElementById("schedJjDuration") : document.getElementById("schedJpDuration");
          const duration = durationEl ? parseInt(durationEl.value, 10) || 300 : 300;
          const chosenMode = type === "jj" ? (_selectedJjMode || "normal") : (_selectedJpMode || "normal");

          try {
            // Clean up any previously scheduled room if rescheduling
            const prevSched = window._activeSchedules && window._activeSchedules[type];
            if (prevSched && prevSched.roomId && prevSched.roomId !== roomId) {
              try {
                if (type === "cb") {
                  await update(cbGref(prevSched.roomId), { status: "finished" }).catch(() => {});
                  await remove(ref(rdb, "cbLobby/" + prevSched.roomId)).catch(() => {});
                } else if (type === "jj") {
                  await update(jjGref(prevSched.roomId), { status: "finished" }).catch(() => {});
                  await remove(ref(rdb, "jjLobby/" + prevSched.roomId)).catch(() => {});
                } else if (type === "jp") {
                  await update(jpGref(prevSched.roomId), { status: "finished" }).catch(() => {});
                  await remove(ref(rdb, "jpLobby/" + prevSched.roomId)).catch(() => {});
                }
              } catch (err) {
                console.warn("Clean up previous scheduled room error:", err);
              }
            }

            // 1. Initialize or prepare the scheduled room in RTDB
            if (type === "cb") {
              await set(cbGref(roomId), {
                id: roomId,
                isScheduled: true,
                scheduledType: type,
                scheduledTime: schedTime,
                status: "lobby",
                hostId: me.id,
                hostName: me.name,
                round: 0,
                current: null,
                difficulty: _selectedCbDiff || "easy",
                questionSecs: _selectedCbTimer || 25,
                players: {},
                feed: [
                  { t: "s", x: "🗓️ Scheduled " + title + " set for " + timeInfo.ist, ts: Date.now() },
                ],
                createdAt: Date.now(),
                up: Date.now(),
              });
              await remove(ref(rdb, "cbLobby/" + roomId)).catch(() => {});
            } else if (type === "jj") {
              await set(jjGref(roomId), {
                id: roomId,
                isScheduled: true,
                scheduledType: type,
                scheduledTime: schedTime,
                status: "lobby",
                hostId: me.id,
                hostName: me.name,
                mode: chosenMode,
                duration: duration,
                players: {},
                feed: [
                  { t: "s", x: "🗓️ Scheduled " + title + " set for " + timeInfo.ist, ts: Date.now() },
                ],
                createdAt: Date.now(),
                up: Date.now(),
              });
              await remove(ref(rdb, "jjLobby/" + roomId)).catch(() => {});
            } else if (type === "jp") {
              await set(jpGref(roomId), {
                id: roomId,
                isScheduled: true,
                scheduledType: type,
                scheduledTime: schedTime,
                status: "lobby",
                hostId: me.id,
                hostName: me.name,
                mode: chosenMode,
                duration: duration,
                players: {},
                feed: [
                  { t: "s", x: "🗓️ Scheduled " + title + " set for " + timeInfo.ist, ts: Date.now() },
                ],
                createdAt: Date.now(),
                up: Date.now(),
              });
              await remove(ref(rdb, "jpLobby/" + roomId)).catch(() => {});
            }

            // 2. Save active schedule entry
            await set(ref(rdb, "eventSchedules/" + type), {
              type: type,
              title: title,
              scheduledTime: schedTime,
              scheduledTimeIST: timeInfo.ist,
              scheduledBy: me.id,
              scheduledByName: me.name,
              roomId: roomId,
              status: "scheduled",
              createdAt: Date.now(),
              difficulty: _selectedCbDiff || "easy",
              questionSecs: _selectedCbTimer || 25,
              mode: chosenMode,
              duration: duration,
            });

            closeScheduleEventModal();
            cbToast("🎉 " + title + " scheduled for " + timeInfo.ist + "!");

            // Automatically enter the waiting room as host
            joinScheduledEventRoom(type);
          } catch (e) {
            console.error(e);
            cbToast("⚠️ Failed to schedule event: " + (e.message || "Network error"));
          }
        };

        window.cancelScheduledEvent = async function (type) {
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          if (!isAdm) {
            cbToast("🔒 Host/Admin password required");
            return;
          }

          const sched = window._activeSchedules && window._activeSchedules[type];
          if (!sched) return;

          const nameMap = { cb: "Cards Battle", jj: "Jumbled Jackpot", jp: "Jackpot Event" };
          const title = nameMap[type] || sched.title || "Event";

          if (!confirm("Are you sure you want to cancel the scheduled " + title + " event?")) {
            return;
          }

          try {
            await remove(ref(rdb, "eventSchedules/" + type));
            if (sched.roomId) {
              if (type === "cb") {
                await update(cbGref(sched.roomId), { status: "finished" }).catch(() => {});
                await remove(ref(rdb, "cbLobby/" + sched.roomId)).catch(() => {});
              } else if (type === "jj") {
                await update(jjGref(sched.roomId), { status: "finished" }).catch(() => {});
                await remove(ref(rdb, "jjLobby/" + sched.roomId)).catch(() => {});
              } else if (type === "jp") {
                await update(jpGref(sched.roomId), { status: "finished" }).catch(() => {});
                await remove(ref(rdb, "jpLobby/" + sched.roomId)).catch(() => {});
              }
            }
            closeScheduleEventModal();
            cbToast("🗑️ " + title + " schedule cancelled");
          } catch (e) {
            console.error(e);
            cbToast("⚠️ Failed to cancel event");
          }
        };

        window.cancelCurrentActiveSchedule = function () {
          if (_currentSchedType) {
            cancelScheduledEvent(_currentSchedType);
          }
        };

        // ── Player & Admin Room Navigation ──
        window.joinScheduledEventRoom = async function (type) {
          const sched = window._activeSchedules && window._activeSchedules[type];
          if (!sched || !sched.roomId) {
            cbToast("⚠️ No active scheduled event found");
            return;
          }
          const roomId = sched.roomId;

          if (type === "cb") {
            if (cbGameId === roomId) return;
            window.cbOpen();
            setTimeout(() => {
              window.cbJoin(roomId);
            }, 60);
          } else if (type === "jj") {
            if (jjRoomId === roomId) return;
            window.jjOpenLobby();
            setTimeout(() => {
              window.jjJoin(roomId);
            }, 60);
          } else if (type === "jp") {
            if (jpRoomId === roomId) return;
            window.jpOpenLobby();
            setTimeout(() => {
              window.jpJoin(roomId);
            }, 60);
          }
        };

        window.handleEventCardClick = function (type) {
          if (type === "cb") {
            if (typeof window.cbOpen === "function") window.cbOpen();
          } else if (type === "jj") {
            if (typeof window.jjOpenLobby === "function") window.jjOpenLobby();
          } else if (type === "jp") {
            if (typeof window.jpOpenLobby === "function") window.jpOpenLobby();
          }
        };

        // Check if user tapped banner while multiplayer script was loading
        if (window._pendingEventOpen === "cb") {
          window._pendingEventOpen = null;
          if (typeof window.cbOpen === "function") window.cbOpen();
        } else if (window._pendingEventOpen === "jj") {
          window._pendingEventOpen = null;
          if (typeof window.jjOpenLobby === "function") window.jjOpenLobby();
        } else if (window._pendingEventOpen === "jp") {
          window._pendingEventOpen = null;
          if (typeof window.jpOpenLobby === "function") window.jpOpenLobby();
        }

