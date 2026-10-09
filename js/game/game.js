
        // ─── CARD ART HELPER (image with emoji fallback) ─────────
        // Used only in House of Cards, CDS, and My Collection — the three places
        // real card artwork is shown. If an image fails to load (missing file,
        // bad path, offline), it's swapped out for the original emoji so the UI
        // never shows a broken-image icon.
        function cardArtHTML(card, imgClass, emojiClass) {
          if (card && card.img) {
            const safeEmoji = (card.emoji || "").replace(/"/g, "&quot;");
            return `<img src="${card.img}" alt="" class="${imgClass}" loading="lazy" data-emoji="${safeEmoji}" data-emoji-class="${emojiClass}" onerror="cardArtFallback(this)">`;
          }
          return `<div class="${emojiClass}">${card ? card.emoji : ""}</div>`;
        }
        function cardArtFallback(imgEl) {
          const div = document.createElement("div");
          div.className = imgEl.dataset.emojiClass || "";
          div.textContent = imgEl.dataset.emoji || "";
          imgEl.replaceWith(div);
        }

        // ─── PROFILE & REQUESTS STATE ────────────────────────────
        const profile = { name: "", town: "", avatar: "🧙", photoURL: "" };
        window.profile = profile;
        const DUPE_SELL_PRICE = 50;
        const REQUEST_COST = 100;
        const GOLD_REQUEST_COST = 200;
        function _getCdPrefix() {
          const pid =
            window._currentPlayerId ||
            (typeof _currentPlayerId !== "undefined" && _currentPlayerId ? _currentPlayerId : null) ||
            (typeof profile === "object" && profile && profile.playerId ? profile.playerId : null);
          if (pid) return pid + "_";
          if (typeof window._cdPrefixStr === "string" && window._cdPrefixStr && window._cdPrefixStr !== "guest_") {
            return window._cdPrefixStr;
          }
          return "guest_";
        }
        window.getCdPrefix = _getCdPrefix;
        let coins = 0;
        let coinHistory = []; // last 100 coin transactions, newest first: {delta, reason, ts, balance}
        let cardsWon = 0;
        const ownedCards = {}; // key: "setIdx-cardIdx" => { owned:true, isNew:bool }
        const ownedShopItems = {}; // key: shop item id => { owned:true, purchasedAt: isoString }
        const cardRequests = []; // { id, playerName, townName, setIdx, cardIdx, note, status, timestamp }
        const shopRequests = []; // { id, playerName, townName, itemId, itemName, cost, status, timestamp }
        // Local archives: when the admin clears done/declined requests from the
        // shared Firestore array, the player's completed requests would vanish
        // from "My Requests" and the daily limit count would reset. These arrays
        // preserve those entries per-player so the UI still shows them as
        // "Received" and the daily limit stays correct.
        const archivedRequests = [];
        const archivedShopRequests = [];
        // Ids of card/shop requests THIS player deleted or cleared from "My Requests".
        // The shared Firestore arrays are re-broadcast to every listener and the
        // player's in-memory arrays get rebuilt from them, so a purely local splice /
        // `_hidden` flag was silently undone by the next snapshot. This list is saved
        // with the player's own progress doc and re-applied every time the shared
        // arrays are loaded (display-layer filter — admin history stays intact).
        const dismissedReqIds = [];
        const claimedRefundReqIds = [];
        const suggestions = []; // { id, playerName, townName, avatar, photoURL, playerId, text, votes, timestamp }
        // Ids of shop requests this session has actually seen from the server (via
        // initial load or a live snapshot). Used by saveShopRequests to tell "an
        // entry someone else added/changed since we last synced" apart from "an
        // entry we already knew about and have now locally removed" — without this,
        // a stale local array + a blind setDoc overwrite can silently wipe out
        // other players'/admin's changes made while this session was open.
        window._shopReqKnownIds = new Set();
        const jackpotEntries = []; // { id, playerName, townName, avatar, playerId, setIdx, setName, totalCards, correctCount, writtenAnswers, requiredCards, status, timestamp }
        const jjEntries = []; // { id, playerName, townName, avatar, playerId, correctCount, wrongCount, streak, answers, requiredCards, status, timeSecs, timestamp } — Jumbled Jackpot round log
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
        const ADMIN_PIN_FULL = "696969"; // unlocks the entire admin dashboard
        const ADMIN_PIN_LIMITED = "76664"; // unlocks ONLY the Card Requests view
        const ADMIN_CACHE_KEY = "da_admin_pin";
        let adminUnlocked = false;
        let adminAccessLevel = null; // 'full' | 'limited' | null

        function restoreAdminCache() {
          try {
            const cachedPin = localStorage.getItem(ADMIN_CACHE_KEY);
            // Immediately evict old legacy PINs to log out previous admins
            if (cachedPin === "6969" || cachedPin === "2580") {
              localStorage.removeItem(ADMIN_CACHE_KEY);
              adminUnlocked = false;
              adminAccessLevel = null;
              return false;
            }
            if (cachedPin === ADMIN_PIN_FULL || cachedPin === ADMIN_PIN_LIMITED) {
              adminUnlocked = true;
              adminAccessLevel = cachedPin === ADMIN_PIN_FULL ? "full" : "limited";
              if (typeof window.markCurrentPlayerAsAdmin === "function") {
                window.markCurrentPlayerAsAdmin();
              }
              return true;
            }
          } catch (e) {
            console.warn("Could not read admin PIN from cache", e);
          }
          return false;
        }
        restoreAdminCache();
        window.restoreAdminCache = restoreAdminCache;
        const ADMIN_RESTRICTED_BTNS = [
          "adminViewLogsBtn",
          "adminViewEvBtn",
          "adminViewGcBtn",
          "adminViewPsBtn",
          "adminViewShopBtn",
          "adminViewGatewayBtn",
          "adminViewRorBtn",
        ];
        let adminFilter = "all";

        // ─── PERSISTENCE ─────────────────────────────────────────
        const SAVE_KEY = "da_card_hub_v1"; // legacy key (no longer primary)

        // ── Robust Card Request Identification Helper ──
        // Matches by playerId if available, or falls back to case-insensitive playerName.
        // Also auto-backfills playerId if the request was created before auth finished.
        function isMyCardRequest(r) {
          if (!r) return false;
          const pid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
          const name = (typeof profile === "object" && profile && profile.name) ? String(profile.name).trim() : "";
          const rPid = r.playerId ? String(r.playerId).trim() : "";
          const rName = r.playerName ? String(r.playerName).trim() : "";

          // 1. Direct playerId match
          if (pid && rPid) {
            return pid === rPid;
          }

          // 2. Name match (case-insensitive) fallback only if at least one ID is missing
          if (name && rName && name.toLowerCase() === rName.toLowerCase()) {
            if (pid && !rPid) r.playerId = pid; // backfill so it stays tied to current player
            return true;
          }
          return false;
        }
        window.isMyCardRequest = isMyCardRequest;

        // If a snapshot hands back one of MY dismissed pending requests (e.g. the
        // delete's server write failed, or it was cancelled on another device), drop
        // it locally and retry the server-side removal once. Each id is retried at most
        // once per session so this can never loop.
        const _dismissCleanupTried = new Set();
        const _dismissCleanupKinds = new Set();
        let _dismissCleanupTimer = null;
        function _scheduleDismissedCleanup(kind, ids) {
          const fresh = (ids || []).filter((id) => !_dismissCleanupTried.has(id));
          if (!fresh.length) return;
          fresh.forEach((id) => _dismissCleanupTried.add(id));
          _dismissCleanupKinds.add(kind);
          if (_dismissCleanupTimer) return;
          _dismissCleanupTimer = setTimeout(() => {
            _dismissCleanupTimer = null;
            const kinds = new Set(_dismissCleanupKinds);
            _dismissCleanupKinds.clear();
            try { if (kinds.has("card") && window.saveSharedRequests) window.saveSharedRequests(); } catch (e) {}
            try { if (kinds.has("shop") && window.saveShopRequests) window.saveShopRequests(); } catch (e) {}
          }, 1500);
        }

        // ── Expose cardRequests helpers for Firebase module ──
        window._cardRequests = () => cardRequests;
        window._setCardRequests = (arr) => {
          if (window._deletedCardReqIds && window._deletedCardReqIds.size) {
            for (let i = arr.length - 1; i >= 0; i--) {
              const r = arr[i];
              if (r && window._deletedCardReqIds.has(r.id)) {
                arr.splice(i, 1);
              }
            }
          }
          if (window._deletedJackpotRoundIds && window._deletedJackpotRoundIds.size) {
            for (let i = arr.length - 1; i >= 0; i--) {
              const r = arr[i];
              const rId = r && (r.roundId || (r.id && r.id.replace(/-c\d+$/, "")));
              if (rId && window._deletedJackpotRoundIds.has(rId)) {
                arr.splice(i, 1);
              }
            }
          }
          // Player-dismissed requests: drop my still-pending ones (deleted/cancelled —
          // the server copy is removed by saveSharedRequests) and flag my resolved ones
          // as hidden further down, so a fresh snapshot can't bring them back.
          const dismissedSet = new Set(dismissedReqIds);
          const droppedDismissed = [];
          if (dismissedSet.size) {
            for (let i = arr.length - 1; i >= 0; i--) {
              const r = arr[i];
              if (!r || !dismissedSet.has(r.id) || r.status !== "pending" || !isMyCardRequest(r)) continue;
              arr.splice(i, 1);
              droppedDismissed.push(r.id);
            }
          }
          // Before replacing, archive any of MY done/declined entries that the
          // incoming array no longer contains (admin cleared them).
          const incomingIds = new Set(arr.map((r) => r.id));
          const archivedIds = new Set(archivedRequests.map((r) => r.id));
          const now = Date.now();
          let archiveModified = false;

          // Persistent idempotency protection: load claimed refund IDs to ensure no request is ever refunded twice
          let localClaimed = [];
          try {
            const pid = window._currentPlayerId || (typeof profile !== "undefined" && profile && profile.playerId) || "";
            if (pid) {
              const raw = localStorage.getItem("da_claimed_refund_ids_" + pid);
              if (raw) localClaimed = JSON.parse(raw);
            }
          } catch (e) {}
          const claimedSet = new Set([...claimedRefundReqIds, ...(Array.isArray(localClaimed) ? localClaimed : [])]);

          // 1. Check existing local cardRequests
          for (const r of cardRequests) {
            if (incomingIds.has(r.id)) continue;          // still in shared list
            if (archivedIds.has(r.id)) continue;          // already archived
            const isMine = isMyCardRequest(r);

            // If it's a pending request of mine that is in-flight or created recently (< 90s),
            // PRESERVE IT so an incoming snapshot does NOT wipe it out!
            if (r.status === "pending" && isMine) {
              if (dismissedSet.has(r.id)) continue;       // Cancelled pending request — do not resurrect
              const reqAge = r.timestamp ? now - new Date(r.timestamp).getTime() : 0;
              if (r._inFlight || (!isNaN(reqAge) && reqAge < 90000)) {
                arr.unshift(r);
                incomingIds.add(r.id);
                continue;
              } else if (Number(r.coinsSpent) > 0 && !r.refunded && !claimedSet.has(r.id)) {
                // Older pending request was removed from server without being marked done:
                // Auto-refund coins so player never loses their investment!
                const refundAmt = Number(r.coinsSpent);
                r.coinsSpent = 0;
                r.refunded = true;
                claimedSet.add(r.id);
                if (typeof window._claimRefundId === "function") window._claimRefundId(r.id);
                if (typeof coins === "number") {
                  coins += refundAmt;
                  if (typeof logCoinTx === "function") logCoinTx(refundAmt, "↩️ Auto-refund: pending card request removed");
                  if (typeof updateHUD === "function") updateHUD();
                  if (typeof saveProgress === "function") saveProgress();
                  if (typeof showToast === "function") showToast(`↩️ Pending card request was removed. ${refundAmt} 🪙 refunded!`);
                }
                if (typeof window.markCardRequestRefunded === "function") window.markCardRequestRefunded(r.id);
              }
            }

            if (r.status === "pending") continue;          // only archive resolved
            if (!isMine) continue;
            archivedRequests.push({
              ...r,
              _archived: true,
              _hidden: !!(r._hidden || dismissedSet.has(r.id)),
            });
            archiveModified = true;
          }

          // 2. Auto-refund check for declined requests in incoming arr (idempotent, single execution)
          for (const r of arr) {
            if (claimedSet.has(r.id)) {
              r.coinsSpent = 0;
              r.refunded = true;
            }
            if (isMyCardRequest(r) && r.status === "declined" && Number(r.coinsSpent) > 0 && !r.refunded && !claimedSet.has(r.id)) {
              const refundAmt = Number(r.coinsSpent);
              r.coinsSpent = 0;
              r.refunded = true;
              claimedSet.add(r.id);
              if (typeof window._claimRefundId === "function") window._claimRefundId(r.id);
              if (typeof coins === "number") {
                coins += refundAmt;
                if (typeof logCoinTx === "function") logCoinTx(refundAmt, "↩️ Refund: card request declined by leader");
                if (typeof updateHUD === "function") updateHUD();
                if (typeof saveProgress === "function") saveProgress();
                if (typeof showToast === "function") showToast(`↩️ Request was declined by leader. ${refundAmt} 🪙 refunded!`);
              }
              if (typeof window.markCardRequestRefunded === "function") window.markCardRequestRefunded(r.id);
            }
          }

          // Purge stale archives (older than MY_REQ_AUTO_HIDE_MS)
          const hideMs = typeof MY_REQ_AUTO_HIDE_MS !== "undefined" ? MY_REQ_AUTO_HIDE_MS : 3 * 24 * 60 * 60 * 1000;
          for (let i = archivedRequests.length - 1; i >= 0; i--) {
            const t = new Date(archivedRequests[i].timestamp).getTime();
            if (!isNaN(t) && now - t > hideMs) {
              archivedRequests.splice(i, 1);
              archiveModified = true;
            }
          }
          // Auto-prune archivedRequests: sort newest first and keep only the latest 500 cards
          archivedRequests.sort((a, b) => {
            const ta = new Date(a.adminClearedAt || a.updatedAt || a.timestamp || 0).getTime() || 0;
            const tb = new Date(b.adminClearedAt || b.updatedAt || b.timestamp || 0).getTime() || 0;
            return tb - ta;
          });
          if (archivedRequests.length > 500) {
            archivedRequests.length = 500;
            archiveModified = true;
          }
          if (archiveModified) window.saveProgress && window.saveProgress();

          cardRequests.length = 0;
          const seenIncomingIds = new Set();
          arr.forEach((r) => {
            if (!r || !r.id || seenIncomingIds.has(r.id)) return;
            seenIncomingIds.add(r.id);
            if (!r.photoURL && profile.photoURL && isMyCardRequest(r)) {
              r.photoURL = profile.photoURL;
            }
            if (!r.photoURL && r.playerId && window._playerPhotoMap && window._playerPhotoMap[r.playerId]) {
              r.photoURL = window._playerPhotoMap[r.playerId];
            }
            // Re-apply any pending admin modifications that haven't been
            // confirmed by Firestore yet — prevents snapshot from reverting
            // Done/Declined actions while the write is still in flight.
            const pendingMod = window._adminModifiedReqs && window._adminModifiedReqs.get(r.id);
            if (pendingMod) {
              // Apply full modification including status AND attribution fields
              Object.assign(r, pendingMod);
            } else if (window._adminDoneIds && window._adminDoneIds.has(r.id) && r.status === "pending") {
              // Legacy fallback: at minimum preserve the done status
              r.status = "done";
            }
            if (window._adminClearedIds && window._adminClearedIds.has(r.id)) {
              r.adminCleared = true;
            }
            if (dismissedSet.has(r.id) && isMyCardRequest(r)) r._hidden = true;
            cardRequests.push(r);
          });

          // Ghost duplicate reconciliation:
          // If a player submitted concurrent duplicate requests for the exact same card
          // (created within 60s of each other), and one was fulfilled as done, reconcile
          // the lingering pending twin to done + adminCleared so it doesn't stay stuck as pending.
          const doneReqMap = new Map();
          cardRequests.forEach((r) => {
            if (r.status === "done" && !r.adminCleared) {
              const pKey = (r.playerId || r.playerName || "").trim().toLowerCase();
              const cKey = `${pKey}::${Number(r.setIdx)}::${Number(r.cardIdx)}`;
              const t = new Date(r.timestamp || 0).getTime();
              if (!isNaN(t)) {
                if (!doneReqMap.has(cKey)) doneReqMap.set(cKey, []);
                doneReqMap.get(cKey).push(r);
              }
            }
          });

          cardRequests.forEach((r) => {
            if (r.status === "pending" && !r._inFlight) {
              const pKey = (r.playerId || r.playerName || "").trim().toLowerCase();
              const cKey = `${pKey}::${Number(r.setIdx)}::${Number(r.cardIdx)}`;
              const doneTwins = doneReqMap.get(cKey);
              if (doneTwins && doneTwins.length) {
                const reqTime = new Date(r.timestamp || 0).getTime();
                // Only reconcile if created within 60s of the done request's creation timestamp!
                const isTwin = doneTwins.some((d) => {
                  const dTime = new Date(d.timestamp || 0).getTime();
                  return !isNaN(reqTime) && !isNaN(dTime) && Math.abs(reqTime - dTime) <= 60000;
                });
                if (isTwin) {
                  r.status = "done";
                  r.adminCleared = true;
                  if (!window._adminClearedIds) window._adminClearedIds = new Set();
                  window._adminClearedIds.add(r.id);
                  if (window._adminModifiedReqs) {
                    window._adminModifiedReqs.set(r.id, {
                      status: "done",
                      adminCleared: true,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                  if (typeof window.updateSharedCardRequest === "function") {
                    window.updateSharedCardRequest(r.id, {
                      status: "done",
                      adminCleared: true,
                      updatedAt: new Date().toISOString(),
                    });
                  }
                }
              }
            }
          });

          window._cardReqKnownIds = new Set(cardRequests.map((r) => r.id));
          _scheduleDismissedCleanup("card", droppedDismissed);
        };
        window._shopRequests = () => shopRequests;
        window._setShopRequests = (arr) => {
          // Archive cleared done/declined shop requests (same logic as cards)
          const pid = window._currentPlayerId || "";
          const dismissedSet = new Set(dismissedReqIds);
          const droppedDismissed = [];
          const _isMineShop = (r) =>
            (pid && r.playerId === pid) || (!pid && r.playerName === profile.name);
          if (dismissedSet.size) {
            for (let i = arr.length - 1; i >= 0; i--) {
              const r = arr[i];
              if (!r || !dismissedSet.has(r.id) || r.status !== "pending" || !_isMineShop(r)) continue;
              arr.splice(i, 1);
              droppedDismissed.push(r.id);
            }
          }
          const incomingIds = new Set(arr.map((r) => r.id));
          const archivedIds = new Set(archivedShopRequests.map((r) => r.id));
          const now = Date.now();
          let shopArchiveModified = false;

          for (const r of shopRequests) {
            if (incomingIds.has(r.id)) continue;
            if (archivedIds.has(r.id)) continue;
            if (dismissedSet.has(r.id)) continue;         // I deleted it — don't archive
            const isMine =
              (pid && r.playerId === pid) ||
              (!pid && r.playerName === profile.name);

            // Preserve in-flight shop requests
            if (r.status === "pending" && isMine) {
              const reqAge = r.timestamp ? now - new Date(r.timestamp).getTime() : 0;
              if (r._inFlight || (!isNaN(reqAge) && reqAge < 90000)) {
                arr.unshift(r);
                incomingIds.add(r.id);
                continue;
              }
            }

            if (r.status === "pending") continue;
            if (!isMine) continue;
            archivedShopRequests.push({ ...r, _archived: true });
            shopArchiveModified = true;
          }
          const hideMs = typeof MY_REQ_AUTO_HIDE_MS !== "undefined" ? MY_REQ_AUTO_HIDE_MS : 3 * 24 * 60 * 60 * 1000;
          for (let i = archivedShopRequests.length - 1; i >= 0; i--) {
            const t = new Date(archivedShopRequests[i].timestamp).getTime();
            if (!isNaN(t) && now - t > hideMs) {
              archivedShopRequests.splice(i, 1);
              shopArchiveModified = true;
            }
          }
          for (let i = archivedShopRequests.length - 1; i >= 0; i--) {
            if (incomingIds.has(archivedShopRequests[i].id)) {
              archivedShopRequests.splice(i, 1);
              shopArchiveModified = true;
            }
          }
          if (shopArchiveModified) window.saveProgress && window.saveProgress();
          shopRequests.length = 0;
          arr.forEach((r) => {
            if (!r.photoURL && profile.photoURL && ((pid && r.playerId === pid) || (!pid && r.playerName === profile.name))) {
              r.photoURL = profile.photoURL;
            }
            if (!r.photoURL && r.playerId && window._playerPhotoMap && window._playerPhotoMap[r.playerId]) {
              r.photoURL = window._playerPhotoMap[r.playerId];
            }
            if (dismissedSet.has(r.id) && _isMineShop(r)) r._hidden = true;
            shopRequests.push(r);
          });
          window._shopReqKnownIds = new Set(shopRequests.map((r) => r.id));
          _scheduleDismissedCleanup("shop", droppedDismissed);
        };
        // Dedupe by id — postSuggestion() optimistically appends the new entry
        // locally right after a successful write, but the live onSnapshot listener
        // (already subscribed from page load) can fire with the same entry from
        // Firestore's local-cache echo before that write's promise even resolves.
        // Without this, both paths land in `suggestions` and the post briefly shows
        // twice until the next full reload replaces the array wholesale.
        window._setSuggestions = (arr) => {
          const seen = new Map();
          arr.forEach((s) => {
            if (s && s.id) seen.set(s.id, s);
          });
          suggestions.length = 0;
          seen.forEach((s) => suggestions.push(s));
        };
        window._suggestions = () => suggestions;
        window._adminUnlocked = () => adminUnlocked;

        // ── Expose jackpotEntries helpers for Firebase module ──
        window._jpEntries = () => jackpotEntries;
        window._setJpEntries = (arr) => {
          jackpotEntries.length = 0;
          arr.forEach((e) => jackpotEntries.push(e));
          bridgeJackpotEntriesToCardRequests();
        };

        // ── Expose jjEntries helpers for Firebase module ──
        window._jjEntries = () => jjEntries;
        window._setJjEntries = (arr) => {
          jjEntries.length = 0;
          arr.forEach((e) => jjEntries.push(e));
          bridgeJackpotEntriesToCardRequests();
        };

        const REVIEWED_JJ_HIST_KEY = "da_reviewed_jj_history";
        const REVIEWED_JP_HIST_KEY = "da_reviewed_jp_history";
        const DELETED_JACKPOT_ROUNDS_KEY = "da_deleted_jackpot_rounds";

        let _reviewedJjHistory = [];
        let _reviewedJpHistory = [];
        let _deletedJackpotRoundIds = new Set();
        let _deletedCardReqIds = new Set();

        try {
          const rawJj = localStorage.getItem(REVIEWED_JJ_HIST_KEY);
          if (rawJj) _reviewedJjHistory = JSON.parse(rawJj);
          const rawJp = localStorage.getItem(REVIEWED_JP_HIST_KEY);
          if (rawJp) _reviewedJpHistory = JSON.parse(rawJp);
          const rawDel = localStorage.getItem(DELETED_JACKPOT_ROUNDS_KEY);
          if (rawDel) _deletedJackpotRoundIds = new Set(JSON.parse(rawDel));
        } catch (e) {}

        window._reviewedJjHistory = _reviewedJjHistory;
        window._reviewedJpHistory = _reviewedJpHistory;
        window._deletedJackpotRoundIds = _deletedJackpotRoundIds;
        window._deletedCardReqIds = _deletedCardReqIds;

        // ── Helper to evaluate BEST vs INFERIOR entries per player for Jackpot and Jumbled Jackpot ──
        function getJackpotRoundRanking() {
          const deletedRoundIds = window._deletedJackpotRoundIds || new Set();
          const getPlayerKey = (e) => {
            if (!e) return "";
            const pid = e.playerId ? String(e.playerId).trim() : "";
            const name = (e.playerName || e.name) ? String(e.playerName || e.name).trim().toLowerCase() : "";
            return pid || name;
          };

          const compareEntries = (a, b) => {
            const sA = (a.correctCount !== undefined ? a.correctCount : a.score) || 0;
            const sB = (b.correctCount !== undefined ? b.correctCount : b.score) || 0;
            if (sB !== sA) return sB - sA; // higher score is better
            const tA = (a.timeSecs !== undefined && a.timeSecs !== null) ? Number(a.timeSecs) : Infinity;
            const tB = (b.timeSecs !== undefined && b.timeSecs !== null) ? Number(b.timeSecs) : Infinity;
            if (tA !== tB) return tA - tB; // faster time is better
            const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tsA - tsB; // earlier timestamp as tie-breaker
          };

          // Collect all entries for JP (live + reviewed history)
          const allJp = [...(jackpotEntries || []), ...(_reviewedJpHistory || [])]
            .filter((e) => e && e.id && !e.isDemo && !e.demo && !deletedRoundIds.has(e.id));

          // Collect all entries for JJ (live + reviewed history)
          const allJj = [...(jjEntries || []), ...(_reviewedJjHistory || [])]
            .filter((e) => e && e.id && !e.isDemo && !e.demo && !deletedRoundIds.has(e.id));

          // Also scan cardRequests for any jackpot/jj rounds not already in the entries list
          if (Array.isArray(cardRequests)) {
            const knownJpRoundIds = new Set(allJp.map((e) => e.id));
            const knownJjRoundIds = new Set(allJj.map((e) => e.id));
            cardRequests.forEach((r) => {
              if (!r || !r.source) return;
              const rId = r.roundId || (r.id && r.id.replace(/-c\d+$/, ""));
              if (!rId || deletedRoundIds.has(rId)) return;
              if (r.source === "jackpot" && !knownJpRoundIds.has(rId)) {
                knownJpRoundIds.add(rId);
                allJp.push({
                  id: rId,
                  playerId: r.playerId,
                  playerName: r.playerName,
                  score: r.score != null ? r.score : 0,
                  timeSecs: r.timeSecs != null ? r.timeSecs : Infinity,
                  timestamp: r.timestamp,
                });
              } else if (r.source === "jumbled_jackpot" && !knownJjRoundIds.has(rId)) {
                knownJjRoundIds.add(rId);
                allJj.push({
                  id: rId,
                  playerId: r.playerId,
                  playerName: r.playerName,
                  score: r.score != null ? r.score : 0,
                  timeSecs: r.timeSecs != null ? r.timeSecs : Infinity,
                  timestamp: r.timestamp,
                });
              }
            });
          }

          const bestRoundIds = new Set();
          const inferiorRoundIds = new Set();

          const processGameList = (list) => {
            const byPlayer = new Map();
            list.forEach((e) => {
              const k = getPlayerKey(e);
              if (!k) return;
              if (!byPlayer.has(k)) byPlayer.set(k, []);
              const arr = byPlayer.get(k);
              if (!arr.some((existing) => existing.id === e.id)) {
                arr.push(e);
              }
            });

            byPlayer.forEach((rounds) => {
              if (rounds.length === 1) {
                bestRoundIds.add(rounds[0].id);
              } else if (rounds.length > 1) {
                rounds.sort(compareEntries);
                bestRoundIds.add(rounds[0].id);
                for (let i = 1; i < rounds.length; i++) {
                  inferiorRoundIds.add(rounds[i].id);
                }
              }
            });
          };

          processGameList(allJp);
          processGameList(allJj);

          return { bestRoundIds, inferiorRoundIds };
        }
        window.getJackpotRoundRanking = getJackpotRoundRanking;

        function getBestJackpotEntryIds() {
          return getJackpotRoundRanking().bestRoundIds;
        }
        window.getBestJackpotEntryIds = getBestJackpotEntryIds;

        // ── Bridge Jackpot & Jumbled Jackpot Won Cards to Card Requests ──
        function bridgeJackpotEntriesToCardRequests() {
          if (!Array.isArray(cardRequests)) return;
          const { inferiorRoundIds } = getJackpotRoundRanking();
          const deletedRoundIds = window._deletedJackpotRoundIds || new Set();
          const existingIds = new Set(cardRequests.map((r) => r && r.id).filter(Boolean));
          if (window._cardReqKnownIds) {
            cardRequests.forEach((r) => { if (r && r.id) window._cardReqKnownIds.add(r.id); });
          }
          const cancelledSet = window._cancelledPendingReqIds || new Set();
          const archivedSet = new Set((archivedRequests || []).map((a) => a && a.id).filter(Boolean));
          const newReqs = [];

          const processEntry = (entry, isJJ) => {
            if (!entry || !entry.id || !Array.isArray(entry.requiredCards) || entry.requiredCards.length === 0) return;
            if (entry.isDemo || entry.demo) return;
            if (deletedRoundIds.has(entry.id)) return;
            if (inferiorRoundIds.has(entry.id)) return; // Only bridge cards for non-inferior entries!

            entry.requiredCards.forEach((c, idx) => {
              if (!c) return;
              const reqId = `${entry.id}-c${idx}`;
              if (existingIds.has(reqId) || cancelledSet.has(reqId) || archivedSet.has(reqId)) return;

              const setIdx = Number(c.setIdx);
              const cardIdx = Number(c.cardIdx);
              if (isNaN(setIdx) || isNaN(cardIdx)) return;
              const cardSet = typeof SETS !== "undefined" && SETS && SETS[setIdx];
              const cardObj = cardSet && cardSet.cards && cardSet.cards[cardIdx];
              const isGold = !!(cardObj && cardObj.gold);

              const req = {
                id: reqId,
                playerName: entry.playerName || "Unknown",
                townName: entry.townName || "",
                avatar: entry.avatar || "🧙",
                photoURL: entry.photoURL || "",
                playerId: entry.playerId || "",
                setIdx,
                cardIdx,
                note: isJJ
                  ? `Won in Jumbled Jackpot${entry.correctCount != null ? ` (${entry.correctCount} correct)` : ""}`
                  : `Won in Jackpot Event${entry.setName ? ` (${entry.setName})` : ""}`,
                status: "pending",
                coinsSpent: 0,
                free: true,
                gold: isGold,
                source: isJJ ? "jumbled_jackpot" : "jackpot",
                roundId: entry.id,
                score: entry.correctCount != null ? entry.correctCount : entry.score,
                timeSecs: entry.timeSecs,
                timestamp: entry.timestamp || new Date().toISOString(),
                _inFlight: true,
                _clientCreatedAt: Date.now(),
              };

              existingIds.add(reqId);
              if (window._cardReqKnownIds) window._cardReqKnownIds.add(reqId);
              cardRequests.unshift(req);
              newReqs.push(req);
            });
          };

          (jackpotEntries || []).forEach((e) => processEntry(e, false));
          (jjEntries || []).forEach((e) => processEntry(e, true));

          if (newReqs.length > 0) {
            saveProgress();
            if (typeof window.addMultipleSharedCardRequests === "function") {
              window.addMultipleSharedCardRequests(newReqs).then(() => {
                newReqs.forEach((r) => { r._inFlight = false; });
              }).catch((e) => {
                console.warn("bridgeJackpotEntriesToCardRequests sync failed:", e);
              });
            } else if (typeof window.saveSharedRequests === "function") {
              window.saveSharedRequests();
            }
            if (window._scheduleUIRefresh) {
              window._scheduleUIRefresh();
            } else {
              if (typeof renderAdminList === "function") renderAdminList();
              if (typeof updateAdminStats === "function") updateAdminStats();
              if (typeof renderMyRequests === "function") renderMyRequests();
              if (typeof refreshMyReqPill === "function") refreshMyReqPill();
            }
          }
        }
        window.bridgeJackpotEntriesToCardRequests = bridgeJackpotEntriesToCardRequests;

        // ── COIN TRANSACTION LOG ──────────────────────────────────
        // Records every coin credit/debit so the player can review a history of
        // where their coins came from / went. Capped at 100 entries (newest first).
        // Persisted alongside the rest of progress in saveProgress/loadProgress, so
        // it needs no extra network round-trips of its own.
        function logCoinTx(delta, reason) {
          delta = Math.round(Number(delta) || 0);
          if (!delta) return;
          coinHistory.unshift({
            delta,
            reason: reason || "Coins updated",
            ts: new Date().toISOString(),
            balance: coins,
          });
          if (coinHistory.length > 100) coinHistory.length = 100;
        }

        // ── State getters / setters for Firebase module ──────────
        window._getCoins = () => coins;
        window._getCoinHistory = () => coinHistory;
        window._setCoinHistory = (arr) => {
          coinHistory.length = 0;
          if (Array.isArray(arr)) arr.forEach((e) => coinHistory.push(e));
        };
        window._getCardsWon = () => cardsWon;
        window._getOwnedCards = () => ownedCards;
        window._getOwnedShopItems = () => ownedShopItems;
        window._getArchivedRequests = () => archivedRequests;
        window._getArchivedShopRequests = () => archivedShopRequests;
        window._getDismissedReqIds = () => dismissedReqIds;
        window._dismissReqIds = (ids) => {
          (ids || []).forEach((id) => {
            if (id != null && !dismissedReqIds.includes(id)) dismissedReqIds.push(id);
          });
          if (dismissedReqIds.length > 500)
            dismissedReqIds.splice(0, dismissedReqIds.length - 500);
        };
        window._setDismissedReqIds = (arr) => {
          dismissedReqIds.length = 0;
          if (Array.isArray(arr))
            arr.forEach((id) => {
              if (id != null && !dismissedReqIds.includes(id)) dismissedReqIds.push(id);
            });
          // The live listeners may have delivered the shared arrays before progress
          // finished loading — re-apply the dismissals to whatever is already in memory.
          const set = new Set(dismissedReqIds);
          if (!set.size) return;
          const pid = window._currentPlayerId || "";
          const droppedCards = [];
          const droppedShop = [];
          for (let i = cardRequests.length - 1; i >= 0; i--) {
            const r = cardRequests[i];
            if (!r || !set.has(r.id) || !isMyCardRequest(r)) continue;
            if (r.status === "pending") {
              cardRequests.splice(i, 1);
              droppedCards.push(r.id);
            } else r._hidden = true;
          }
          for (let i = shopRequests.length - 1; i >= 0; i--) {
            const r = shopRequests[i];
            if (!r || !set.has(r.id)) continue;
            if (!((pid && r.playerId === pid) || (!pid && r.playerName === profile.name))) continue;
            if (r.status === "pending") {
              shopRequests.splice(i, 1);
              droppedShop.push(r.id);
            } else r._hidden = true;
          }
          archivedRequests.forEach((r) => { if (r && set.has(r.id)) r._hidden = true; });
          archivedShopRequests.forEach((r) => { if (r && set.has(r.id)) r._hidden = true; });
          _scheduleDismissedCleanup("card", droppedCards);
          _scheduleDismissedCleanup("shop", droppedShop);
        };
        window._getClaimedRefundReqIds = () => claimedRefundReqIds;
        window._claimRefundId = (id) => {
          if (id != null && !claimedRefundReqIds.includes(id)) {
            claimedRefundReqIds.push(id);
            if (claimedRefundReqIds.length > 500)
              claimedRefundReqIds.splice(0, claimedRefundReqIds.length - 500);
            try {
              const pid = window._currentPlayerId || (typeof profile !== "undefined" && profile && profile.playerId) || "";
              if (pid) localStorage.setItem("da_claimed_refund_ids_" + pid, JSON.stringify(claimedRefundReqIds));
            } catch (e) {}
          }
        };
        window._setClaimedRefundReqIds = (arr) => {
          claimedRefundReqIds.length = 0;
          if (Array.isArray(arr)) {
            arr.forEach((id) => {
              if (id != null && !claimedRefundReqIds.includes(id)) claimedRefundReqIds.push(id);
            });
          }
          try {
            const pid = window._currentPlayerId || (typeof profile !== "undefined" && profile && profile.playerId) || "";
            if (pid) localStorage.setItem("da_claimed_refund_ids_" + pid, JSON.stringify(claimedRefundReqIds));
          } catch (e) {}
        };
        window._getProfile = () => ({ ...profile });
        window._setCoins = (v) => {
          coins = v;
        };
        window._setCardsWon = (v) => {
          cardsWon = v;
        };
        window._setOwnedCards = (obj) => {
          Object.keys(ownedCards).forEach((k) => delete ownedCards[k]);
          Object.assign(ownedCards, obj);
        };
        window._setOwnedShopItems = (obj) => {
          Object.keys(ownedShopItems).forEach((k) => delete ownedShopItems[k]);
          Object.assign(ownedShopItems, obj);
        };
        window._setArchivedRequests = (arr) => {
          archivedRequests.length = 0;
          if (Array.isArray(arr)) arr.forEach((r) => archivedRequests.push(r));
        };
        window._setArchivedShopRequests = (arr) => {
          archivedShopRequests.length = 0;
          if (Array.isArray(arr)) arr.forEach((r) => archivedShopRequests.push(r));
        };
        window._setProfile = (obj) => {
          if (!obj || typeof obj !== "object") obj = {};
          profile.name = typeof obj.name === "string" ? obj.name : "";
          profile.town = typeof obj.town === "string" ? obj.town : "";
          profile.avatar = typeof obj.avatar === "string" ? obj.avatar : "🧙";
          profile.photoURL = typeof obj.photoURL === "string" ? obj.photoURL : "";
          const pid = window._currentPlayerId || "";
          if (pid) {
            profile.playerId = pid;
            if (profile.photoURL) {
              if (!window._playerPhotoMap) window._playerPhotoMap = {};
              window._playerPhotoMap[pid] = profile.photoURL;
            }
          }
          if (typeof applyProfileToHUD === "function") applyProfileToHUD();
          if (typeof updateProfilePhotoUI === "function") updateProfilePhotoUI();
        };

        // ── RESET CLIENT IN-MEMORY STATE ──────────────────────────
        // Completely wipes local game and account state to guarantee no data or
        // identity bleeds between players on the same device or upon logout.
          window.resetClientInMemoryState = function () {
          if (typeof window.cancelPendingSave === "function") {
            window.cancelPendingSave();
          }
          window._progressLoaded = false;
          window._currentUsername = "";
          window._currentPlayerId = null;
          window._cdPrefixStr = "guest_";
          window._cdPrefix = "guest_";
          coins = 0;
          cardsWon = 0;
          coinHistory.length = 0;
          Object.keys(ownedCards).forEach((k) => delete ownedCards[k]);
          Object.keys(ownedShopItems).forEach((k) => delete ownedShopItems[k]);
          archivedRequests.length = 0;
          archivedShopRequests.length = 0;
          dismissedReqIds.length = 0;
          claimedRefundReqIds.length = 0;
          window._dailyCooldowns = {};
          profile.name = "";
          profile.town = "";
          profile.avatar = "🧙";
          profile.photoURL = "";
          window._pendingCoinGrant = 0;
          window._pendingCoinGrantNote = "";
          window._pendingCoinDeduct = 0;
          window._pendingReset = false;
          window._pendingAuraGrant = 0;
          window._pendingAuraGrantNote = "";
          window._pendingAuraDeduct = 0;
          if (window._unsubscribeLiveListeners) {
            window._unsubscribeLiveListeners();
          }
          // Spin & Win state cleanup to prevent state/token bleed across accounts
          wheelSpinning = false;
          window._bonusFreeSpins = 0;
          window._isSuperWheelActive = false;
          window._lastGlobalSpinData = null;
          wheelAngle = 0;
          if (window.spinWheelController && typeof window.spinWheelController.reset === "function") {
            try { window.spinWheelController.reset(); } catch (e) {}
          }
          const spinBtn = document.getElementById("spinBtn");
          if (spinBtn) spinBtn.classList.remove("wheel-active-spinning");
          document.body.classList.remove("wheel-spinning-active");
          ["spinWinOverlay", "jackpotWinOverlay", "cardPackOverlay"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("show");
          });
          // Clear DOM input fields in Profile modal to prevent stale input bleed across accounts
          const inpName = document.getElementById("inputPlayerName");
          if (inpName) inpName.value = "";
          const inpTown = document.getElementById("inputTownName");
          if (inpTown) inpTown.value = "";
          const pidVal = document.getElementById("profilePlayerIdValue");
          if (pidVal) pidVal.textContent = "DA-?????";
          const uVal = document.getElementById("profileUsernameValue");
          if (uVal) uVal.textContent = "—";
          if (typeof updateHUD === "function") updateHUD();
          if (typeof applyProfileToHUD === "function") applyProfileToHUD();
          if (typeof updateCollStats === "function") updateCollStats();
        };

        // ── saveProgress / loadProgress provided by Firebase module ──
        // Stubs in case module hasn't loaded yet
        if (!window.saveProgress) window.saveProgress = async () => {};
        if (!window.loadProgress) window.loadProgress = async () => {};
        if (!window.saveSharedRequests)
          window.saveSharedRequests = async () => {};
        if (!window.loadSharedRequests)
          window.loadSharedRequests = async () => {};
        if (!window.saveShopRequests) window.saveShopRequests = async () => {};
        if (!window.loadShopRequests) window.loadShopRequests = async () => {};
        if (!window.saveJackpotEntries)
          window.saveJackpotEntries = async () => {};
        if (!window.loadJackpotEntries)
          window.loadJackpotEntries = async () => {};
        if (!window.saveJJEntries) window.saveJJEntries = async () => {};
        if (!window.loadJJEntries) window.loadJJEntries = async () => {};
        if (!window.saveEventControls)
          window.saveEventControls = async () => {};
        if (!window.loadEventControls)
          window.loadEventControls = async () => {};

        // ── Called by Firebase module after successful login ─────
        window._onUserLoggedIn = async function (playerId, username) {
          showToast("🔥 Loading your progress…");
          // Scope cooldown storage prefix immediately before loading progress from cloud
          window._currentPlayerId = playerId;
          if (typeof profile === "object" && profile) profile.playerId = playerId;
          window._cdPrefixStr = playerId + "_";
          window._cdPrefix = playerId + "_";
          try {
            ["da_cd_hoc", "da_cd_pr", "da_cd_spin", "da_cd_spin_count"].forEach((k) => {
              localStorage.removeItem("guest_" + k);
            });
          } catch (e) {}
          window._pendingCoinGrant = 0; // reset; loadProgress will set it if admin sent coins
          window._pendingCoinDeduct = 0; // reset; loadProgress sets it if admin deducted while away
          window._pendingReset = false; // reset; loadProgress sets it if leader reset while away
          window._pendingAuraGrant = 0; // reset; loadProgress sets it if admin sent aura while away
          window._pendingAuraDeduct = 0; // reset; loadProgress sets it if admin deducted aura while away
          window._postLoginShown = false; // allow the welcome sequence to run for this login
          if (window.startPresenceHeartbeat) window.startPresenceHeartbeat();
          const ok = await window.loadProgress();
          if (!ok || !window._progressLoaded) {
            console.error("_onUserLoggedIn: progress failed to load, aborting session initialization to prevent data corruption.");
            return;
          }
          // Card requests are loaded on-demand:
          // - Normal players query their own requests via startPlayerLiveRequestsListener below (1-3 reads)
          // - Admins load full collection on-demand only when entering the Admin Panel (openAdmin)
          // If profile name is blank, pre-fill with username
          if (!profile.name) profile.name = username;
          updateHUD();
          applyProfileToHUD();
          if (window.syncSocialSummaryToRtdb) window.syncSocialSummaryToRtdb();
          // Prepare the post-login modal sequence NOW (data is ready right after loadProgress),
          // so it can pop the instant the intro door opens instead of waiting on the slower
          // loads below. Each offline change the leader made gets its own modal, shown one
          // at a time in sequence: coins received → coins deducted → aura received →
          // aura deducted → progress reset. There is no generic "welcome back" modal —
          // if nothing happened while the player was away, no modal shows at all.
          window._postLoginData = {
            name: profile.name || username,
            grant: window._pendingCoinGrant || 0,
            grantNote: window._pendingCoinGrantNote || "",
            grantSender: window._pendingCoinGrantSender || "",
            deduct: window._pendingCoinDeduct || 0,
            deductSender: window._pendingCoinDeductSender || "",
            auraGrant: window._pendingAuraGrant || 0,
            auraGrantNote: window._pendingAuraGrantNote || "",
            auraGrantSender: window._pendingAuraGrantSender || "",
            auraDeduct: window._pendingAuraDeduct || 0,
            auraDeductSender: window._pendingAuraDeductSender || "",
            reset: !!window._pendingReset,
          };
          window._tryShowPostLogin && window._tryShowPostLogin();
          // Show Player ID in profile
          document.getElementById("profilePlayerIdValue").textContent =
            playerId;
          // Per-user cooldown keys
          window._cdPrefixStr = playerId + "_";
          window._cdPrefix = playerId + "_";
          if (window._dailyCooldowns && window._setDailyCooldowns) {
            window._setDailyCooldowns(window._dailyCooldowns);
          }
          // NOTE: old JP/JJ solo session restore-on-login removed along with the old
          // entry logic — reconnection will be handled by the new room model (step 2).
          // HoC still initialises normally in the background (no markPlayed).
          initGame(false, false);
          if (hasPlayedToday(CD_KEY_HOC)) {
            gameActive = false;
          }
          checkHocCooldown();
          if (typeof checkSpinCooldown === "function") checkSpinCooldown();
          if (typeof checkPrCooldown === "function") checkPrCooldown();
          const spinPanelEl = document.getElementById("panel-spin");
          const isSpinActive =
            document.body.classList.contains("spin-room-active") ||
            (spinPanelEl && spinPanelEl.classList.contains("active"));
          if (isSpinActive && typeof window.startGlobalSpinListener === "function") {
            window.startGlobalSpinListener();
          }
          // Targeted card request listener for normal players (queries ONLY own player ID, 1-3 reads).
          // Admin full-collection listeners are attached strictly when the Admin Panel is opened.
          const isAdm = typeof window._isAdminAuthorized === "function" && window._isAdminAuthorized();
          const adminPanel = document.getElementById("panel-admin");
          if (isAdm && adminPanel && adminPanel.classList.contains("active")) {
            if (window.startLiveAdminListener) window.startLiveAdminListener();
            if (window.startLiveJackpotAdminListener) window.startLiveJackpotAdminListener();
            if (window.startLiveJJAdminListener) window.startLiveJJAdminListener();
            if (window.startLiveShopRequestsAdminListener) window.startLiveShopRequestsAdminListener();
            if (window.startLiveSuggestionsListener) window.startLiveSuggestionsListener();
          } else if (!isAdm) {
            if (window.startPlayerLiveRequestsListener)
              window.startPlayerLiveRequestsListener(playerId);
          }
          if (window.startLiveUserDocListener)
            window.startLiveUserDocListener();
          // Fix 8: globalSpin listener moved to Events tab only (switchTabNav)
          // Watch event controls for all players (snapshot listener delivers initial data immediately)
          window.applyEventControls && window.applyEventControls();
          if (window.startLiveEventControlsListener)
            window.startLiveEventControlsListener();
          // (Welcome / coin / reset modal sequence was already prepared above and fires
          //  as soon as the intro door opens — see window._tryShowPostLogin.)
          window._appReady = true;
          // Fix 7: Detach non-critical listeners when tab is hidden (with 30s grace period for quick app-switching)
          if (!window._visibilityGuardAttached) {
            window._visibilityGuardAttached = true;
            let _visibilityDetachTimer = null;
            let _isDetachedDueToInactivity = false;

            document.addEventListener("visibilitychange", () => {
              if (!window._appReady) return;
              if (document.hidden) {
                // If tab is hidden, wait 30 seconds before detaching listeners.
                // This prevents rapid unhide/hide app-switching on mobile from tearing down and reloading all Firestore listeners.
                if (_visibilityDetachTimer) clearTimeout(_visibilityDetachTimer);
                _visibilityDetachTimer = setTimeout(() => {
                  _visibilityDetachTimer = null;
                  _isDetachedDueToInactivity = true;
                  window._unsubscribeLiveListeners();
                  if (window.stopPresenceHeartbeat) window.stopPresenceHeartbeat();
                  if (window.stopGlobalSpinListener) window.stopGlobalSpinListener();
                  if (window.stopLbListeners) window.stopLbListeners();
                }, 30000);
              } else {
                // Tab became visible again. Cancel pending detach timer if user returned quickly.
                if (_visibilityDetachTimer) {
                  clearTimeout(_visibilityDetachTimer);
                  _visibilityDetachTimer = null;
                }
                // If we didn't actually detach (user was gone <30s), keep existing live listeners active — 0 extra reads!
                if (!_isDetachedDueToInactivity) return;
                _isDetachedDueToInactivity = false;

                const isAdm = typeof window._isAdminAuthorized === 'function' && window._isAdminAuthorized();
                if (window.startPresenceHeartbeat) window.startPresenceHeartbeat();
                if (window.startLiveUserDocListener) window.startLiveUserDocListener();
                if (window.startLiveEventControlsListener) window.startLiveEventControlsListener();
                const adminPanel = document.getElementById('panel-admin');
                const adminActive = isAdm && adminPanel && adminPanel.classList.contains('active');
                if (adminActive) {
                  if (window.startLiveAdminListener) window.startLiveAdminListener();
                  if (window.setAdminPresenceState) window.setAdminPresenceState("viewing");
                  if (window.startLiveAdminPresenceListener) window.startLiveAdminPresenceListener();
                  if (window.startLivePlayerPresenceListener) window.startLivePlayerPresenceListener();
                  if (window.startLiveJackpotAdminListener) window.startLiveJackpotAdminListener();
                  if (window.startLiveJJAdminListener) window.startLiveJJAdminListener();
                  if (window.startLiveShopRequestsAdminListener) window.startLiveShopRequestsAdminListener();
                  if (window.startLiveSuggestionsListener) window.startLiveSuggestionsListener();
                } else if (!isAdm) {
                  if (window.startPlayerLiveRequestsListener) window.startPlayerLiveRequestsListener(window._currentPlayerId);
                }
                const spinPanel = document.getElementById('panel-spin');
                if (spinPanel && spinPanel.classList.contains('active')) {
                  if (window.startGlobalSpinListener) window.startGlobalSpinListener();
                }
                const evPanel = document.getElementById('panel-match');
                if (evPanel && evPanel.classList.contains('active')) {
                  if (window.startLbListeners) window.startLbListeners();
                }
              }
            });
          }
          // Events tab is the default — initialise leaderboards via live listeners (avoids duplicate initial getDoc reads)
          jjUpdateEntryStats && jjUpdateEntryStats();
          jpUpdateEntryStats && jpUpdateEntryStats();
          if (window.startLbListeners) window.startLbListeners();
        };

        function resetAllProgress() {
          if (
            !confirm(
              "⚠️ Reset ALL progress? This will erase your coins, cards, collection and requests!",
            )
          )
            return;
          coins = 0;
          cardsWon = 0;
          cardsFoundThisRound = 0;
          coinsThisRound = 0;
          Object.keys(ownedCards).forEach((k) => delete ownedCards[k]);
          Object.keys(ownedShopItems).forEach((k) => delete ownedShopItems[k]);
          profile.name = "";
          profile.town = "";
          profile.avatar = "🧙";
          cardRequests.length = 0;
          window.saveProgress();
          updateHUD();
          initGame();
          if (
            document.getElementById("panel-coll").classList.contains("active")
          )
            openCollection();
          showToast("Progress reset! Starting fresh ⚡");
        }

        function formatCoins(n) {
          n = Number(n) || 0;
          const sign = n < 0 ? "-" : "";
          const abs = Math.round(Math.abs(n));
          return sign + abs;
        }

        let _activeToast = null;
        let _activeToastTimer = null;
        let _activeToastContainer = null;

        function _getToastContainer() {
          if (
            !_activeToastContainer ||
            !document.body.contains(_activeToastContainer)
          ) {
            _activeToastContainer = document.getElementById("daToastContainer");
            if (!_activeToastContainer) {
              _activeToastContainer = document.createElement("div");
              _activeToastContainer.id = "daToastContainer";
              _activeToastContainer.className = "da-toast-container";
              document.body.appendChild(_activeToastContainer);
            }
          }
          return _activeToastContainer;
        }

        function showToast(msg, opts) {
          if (!msg) return;
          const container = _getToastContainer();

          // If there is an active toast, smoothly dismiss it
          if (_activeToast) {
            clearTimeout(_activeToastTimer);
            const old = _activeToast;
            _activeToast = null;
            old.classList.add("da-toast-exiting");
            setTimeout(() => {
              try {
                old.remove();
              } catch (e) {}
            }, 220);
          }

          let rawMessage = typeof msg === "string" ? msg.trim() : String(msg);
          let type =
            typeof opts === "string"
              ? opts
              : opts && opts.type
                ? opts.type
                : "";
          let customIcon = opts && opts.icon ? opts.icon : "";

          // Extract leading emoji if present
          let detectedIcon = "";
          const emojiRegex =
            /^([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2194}-\u{21AA}][\u{FE0E}\u{FE0F}]?)/u;
          const emojiMatch = rawMessage.match(emojiRegex);
          let cleanMsg = rawMessage;
          if (emojiMatch) {
            detectedIcon = emojiMatch[0];
            cleanMsg = rawMessage.slice(detectedIcon.length).trim();
            cleanMsg = cleanMsg.replace(/^[:\-–—? ]+/, "").trim();
          }

          // Deduce status type from message text or detected icon
          const lower = cleanMsg.toLowerCase();
          if (!type) {
            if (
              detectedIcon === "❌" ||
              detectedIcon === "🚫" ||
              detectedIcon === "⛔" ||
              lower.includes("fail") ||
              lower.includes("error") ||
              lower.includes("wrong") ||
              lower.includes("could not")
            ) {
              type = "error";
            } else if (
              detectedIcon === "✅" ||
              detectedIcon === "🎉" ||
              detectedIcon === "✨" ||
              detectedIcon === "🏆" ||
              detectedIcon === "🔐" ||
              lower.includes("added to your collection") ||
              lower.includes("won") ||
              lower.includes("correct") ||
              lower.includes("success") ||
              lower.includes("saved") ||
              lower.includes("updated") ||
              lower.includes("posted")
            ) {
              type = "success";
            } else if (
              detectedIcon === "⚠️" ||
              detectedIcon === "🔒" ||
              detectedIcon === "⏳" ||
              lower.includes("log in") ||
              lower.includes("write something") ||
              lower.includes("full") ||
              lower.includes("warning") ||
              lower.includes("closed")
            ) {
              type = "warning";
            } else {
              type = "info";
            }
          }

          // Fallback icon based on type if none was detected or passed
          if (!detectedIcon && !customIcon) {
            if (type === "success") detectedIcon = "✨";
            else if (type === "error") detectedIcon = "❌";
            else if (type === "warning") detectedIcon = "⚠️";
            else detectedIcon = "⚡";
          }
          const icon = customIcon || detectedIcon;

          // Build toast DOM structure
          const t = document.createElement("div");
          t.className = `da-toast da-toast--${type}`;
          t.setAttribute("role", type === "error" ? "alert" : "status");
          t.setAttribute("aria-live", "polite");

          const iconEl = document.createElement("div");
          iconEl.className = "da-toast-icon";
          iconEl.textContent = icon;

          const bodyEl = document.createElement("div");
          bodyEl.className = "da-toast-body";
          const msgEl = document.createElement("div");
          msgEl.className = "da-toast-msg";
          msgEl.textContent = cleanMsg || rawMessage;
          bodyEl.appendChild(msgEl);

          const closeBtn = document.createElement("button");
          closeBtn.className = "da-toast-close";
          closeBtn.type = "button";
          closeBtn.setAttribute("aria-label", "Dismiss notification");
          closeBtn.innerHTML = "&times;";

          const progressEl = document.createElement("div");
          progressEl.className = "da-toast-progress";
          const barEl = document.createElement("div");
          barEl.className = "da-toast-bar";
          progressEl.appendChild(barEl);

          t.appendChild(iconEl);
          t.appendChild(bodyEl);
          t.appendChild(closeBtn);
          t.appendChild(progressEl);

          container.appendChild(t);
          _activeToast = t;

          // Duration calculation: scales naturally with text length, supports custom duration
          const duration =
            opts && typeof opts.duration === "number"
              ? opts.duration
              : Math.max(2800, Math.min(6500, 2000 + cleanMsg.length * 55));
          let remaining = duration;
          let startTime = Date.now();
          let paused = false;

          // Start progress bar animation
          requestAnimationFrame(() => {
            barEl.style.transition = `transform ${duration}ms linear`;
            barEl.style.transform = "scaleX(0)";
          });

          function dismiss() {
            clearTimeout(_activeToastTimer);
            if (_activeToast === t) _activeToast = null;
            t.classList.add("da-toast-exiting");
            setTimeout(() => {
              try {
                t.remove();
              } catch (e) {}
            }, 220);
          }

          function startTimer(ms) {
            clearTimeout(_activeToastTimer);
            _activeToastTimer = setTimeout(dismiss, ms);
          }

          startTimer(duration);

          // Pause on hover
          t.addEventListener("mouseenter", () => {
            if (paused) return;
            paused = true;
            remaining -= Date.now() - startTime;
            clearTimeout(_activeToastTimer);
            const rect = barEl.getBoundingClientRect();
            const parentRect = progressEl.getBoundingClientRect();
            const ratio =
              parentRect.width > 0 ? rect.width / parentRect.width : 0;
            barEl.style.transition = "none";
            barEl.style.transform = `scaleX(${Math.max(0, ratio)})`;
          });

          t.addEventListener("mouseleave", () => {
            if (!paused) return;
            paused = false;
            startTime = Date.now();
            remaining = Math.max(500, remaining);
            barEl.style.transition = `transform ${remaining}ms linear`;
            barEl.style.transform = "scaleX(0)";
            startTimer(remaining);
          });

          // Tap or click close button or toast to dismiss
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dismiss();
          });
          t.addEventListener("click", () => {
            dismiss();
          });

          // Touch swipe to dismiss
          let touchStartY = 0;
          t.addEventListener(
            "touchstart",
            (e) => {
              if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
            },
            { passive: true },
          );

          t.addEventListener(
            "touchend",
            (e) => {
              if (e.changedTouches && e.changedTouches[0]) {
                const diffY = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(diffY) > 28) {
                  dismiss();
                }
              }
            },
            { passive: true },
          );
        }
        window.showToast = showToast;

        // ── Shared avatar renderer ──────────────────────────────
        // Returns HTML for a player's avatar: an <img> if a profile photo URL is
        // set, otherwise the plain emoji avatar. Used everywhere a player's avatar
        // is shown (HUD, profile, leaderboard, requests, admin panels, etc.) so a
        // photo set by an admin shows up consistently across the whole app. Falls
        // back to the emoji automatically if the image URL fails to load. The
        // container this is placed in should be a fixed-size circle with
        // `overflow:hidden` (matches the existing avatar CSS classes).
        function avatarHTML(avatar, photoURL, playerId, playerName) {
          let photo = photoURL;
          const currentPid = (typeof _currentPlayerId !== "undefined" && _currentPlayerId) || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
          const myName = (typeof profile === "object" && profile && profile.name) ? String(profile.name).trim().toLowerCase() : "";
          const targetName = playerName ? String(playerName).trim().toLowerCase() : "";

          if (!photo && typeof profile === "object" && profile && profile.photoURL) {
            if ((playerId && currentPid && playerId === currentPid) || (targetName && myName && targetName === myName)) {
              photo = profile.photoURL;
            }
          }
          if (!photo && playerId && window._playerPhotoMap && window._playerPhotoMap[playerId]) {
            photo = window._playerPhotoMap[playerId];
          }
          if (!photo && targetName && window._playerPhotoByNameMap && window._playerPhotoByNameMap[targetName]) {
            photo = window._playerPhotoByNameMap[targetName];
          }
          const av = (avatar || "🧙").toString();
          if (!photo) return av;
          const safeAv = av.replace(/'/g, "\\'");
          const safePhoto = escapeHtml(photo);
          return `<img src="${safePhoto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" onerror="this.outerHTML='${safeAv}'">`;
        }
        window.avatarHTML = avatarHTML;

        // Some documents (card requests, jackpot/JJ round logs, leaderboard pending
        // queues) are SHARED across every player and grow with normal use — every
        // submission/request adds another entry to the same Firestore document,
        // which has a 1MB size ceiling. An uploaded photo is stored as a base64
        // data: URI (tens of KB), so embedding it into every one of those entries
        // would balloon a shared document fast. A pasted http(s) link is just a
        // short string, so it's safe to embed anywhere. This keeps only the
        // lightweight (link-based) photos in those shared documents; uploaded
        // photos still show up everywhere that reads a player's own profile doc
        // (HUD, profile page, Player Stats, Cards Battle) — just not duplicated
        // into every shared entry.
        function _lightPhoto(url) {
          if (!url) return "";
          if (/^https?:\/\//i.test(url)) return url;
          // Never duplicate heavy base64 data URLs into shared documents;
          // avatarNode resolves photos via _playerPhotoMap[playerId] or profile.photoURL client-side
          return "";
        }

        // DOM-node version of the same idea, for places (like Cards Battle's live
        // chat/feed) that deliberately build rows with createElement + textContent
        // instead of innerHTML, to keep player-typed chat text and names from ever
        // being parsed as HTML. Returns either an <img> element or a plain text
        // node — never a raw HTML string — so it's safe to mix into those rows.
        function avatarNode(avatar, photoURL, sizePx, playerId, playerName) {
          let photo = photoURL;
          const currentPid = (typeof _currentPlayerId !== "undefined" && _currentPlayerId) || window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
          const myName = (typeof profile === "object" && profile && profile.name) ? String(profile.name).trim().toLowerCase() : "";
          const targetName = playerName ? String(playerName).trim().toLowerCase() : "";

          if (!photo && typeof profile === "object" && profile && profile.photoURL) {
            if ((playerId && currentPid && playerId === currentPid) || (targetName && myName && targetName === myName)) {
              photo = profile.photoURL;
            }
          }
          if (!photo && playerId && window._playerPhotoMap && window._playerPhotoMap[playerId]) {
            photo = window._playerPhotoMap[playerId];
          }
          if (!photo && targetName && window._playerPhotoByNameMap && window._playerPhotoByNameMap[targetName]) {
            photo = window._playerPhotoByNameMap[targetName];
          }
          const av = (avatar || "🧙").toString();
          if (!photo) return document.createTextNode(av);
          const img = document.createElement("img");
          img.src = photo;
          img.alt = "";
          const s = sizePx || 20;
          img.style.cssText = `width:${s}px;height:${s}px;object-fit:cover;border-radius:50%;vertical-align:middle;display:inline-block;`;
          img.onerror = () => {
            img.replaceWith(document.createTextNode(av));
          };
          return img;
        }
        window.avatarNode = avatarNode;

        // ─── STATE ──────────────────────────────────────────────
        let lives = 3;
        let gameActive = false;
        let gridData = [];
        let cardsFoundThisRound = 0;
        let coinsThisRound = 0;
        let bombsFoundThisRound = 0;
        let totalBombsTriggered = 0; // total Dark Arts traps triggered across this game (max 5)
        let foundKeysThisRound = []; // ownedCards keys found this round — forfeited if the player busts
        let hocRoundLocked = false; // becomes true on the first flip of a round — set can no longer be switched
        let gridSetIdx = 0; // set index the current board was built from
        let hocContinuesUsed = 0; // number of paid lives purchased this round
        let hocContinueCost = 400; // 4th life costs 400 coins, 5th life costs 800 coins

        // 5 bombs per game, 10 fruit cards = 15 total. Find 3 bombs (free lives) and you lose every card found this round unless you continue.
        // If a player triggers all 5 bombs on the board (using 2 paid continues), they conquer the House and win all 10 cards as a reward!
        const HINT_COST = 80;
        const BOMB_COUNT = 5;
        const BUST_BOMB_COUNT = 3;
        const MAX_HOC_CONTINUES = 2; // Maximum 2 paid continues (Life #4: 400 coins, Life #5: 800 coins)
        const CONTINUE_BASE_COST = 400;
        const CONTINUE_COST_STEP = 400;
        const HOC_CONTINUE_COSTS = [400, 800]; // 4th life = 400 coins, 5th life = 800 coins

        function getHocContinueCost(continuesUsed) {
          if (continuesUsed < HOC_CONTINUE_COSTS.length) {
            return HOC_CONTINUE_COSTS[continuesUsed];
          }
          return null;
        }

        // ─── COLLECT & LEAVE ────────────────────────────────────
        function collectAndLeave() {
          if (!gameActive && cardsFoundThisRound === 0) return;
          closeOverlay("overlayBombWarning");
          document.getElementById("clCardsFound").textContent =
            cardsFoundThisRound;
          showOverlay("overlayCollect");
        }

        // ─── HOUSE OF CARDS VICTORY MODAL RENDERER ─────────────
        function renderHocVictoryModal(mode) {
          const modal = document.getElementById("hocVictoryModal");
          if (!modal) return;

          const pillText = document.getElementById("hocVicPillText");
          const pillIcon = document.getElementById("hocVicPillIcon");
          const icon = document.getElementById("hocVicIcon");
          const title = document.getElementById("hocVicTitle");
          const subtitle = document.getElementById("hocVicSubtitle");
          const statCards = document.getElementById("hocVicStatCardsNum");
          const statGold = document.getElementById("hocVicStatGoldNum");
          const statNew = document.getElementById("hocVicStatNewNum");
          const statBombs = document.getElementById("hocVicStatBombsNum");
          const gallery = document.getElementById("hocVicGallery");
          const galleryCount = document.getElementById("hocVicGalleryCount");
          const claimBtnText = document.getElementById("hocVicClaimBtnText");

          const setIdx = typeof gridSetIdx === "number" ? gridSetIdx : parseInt(document.getElementById("setSelect")?.value || "0");
          const set = (typeof SETS !== "undefined" && SETS[setIdx]) ? SETS[setIdx] : ((typeof SETS !== "undefined" && SETS[0]) || { cards: [] });

          // Map items from foundKeysThisRound (or window.foundKeysThisRound)
          const rawSource = (Array.isArray(foundKeysThisRound) && foundKeysThisRound.length > 0)
            ? foundKeysThisRound
            : (Array.isArray(window.foundKeysThisRound) && window.foundKeysThisRound.length > 0
                ? window.foundKeysThisRound
                : []);

          let list = [];
          if (rawSource.length > 0) {
            list = rawSource.map(item => {
              if (typeof item === "string") {
                const parts = item.split("-").map(Number);
                return { sIdx: parts[0], cIdx: parts[1], result: "new" };
              }
              const parts = (item.key || "").split("-").map(Number);
              return { sIdx: parts[0], cIdx: parts[1], result: item.result || "new" };
            });
          } else if (mode === "5bombs" && set && Array.isArray(set.cards)) {
            list = set.cards.map((_, i) => ({ sIdx: setIdx, cIdx: i, result: "new" }));
          }

          const countFound = (typeof cardsFoundThisRound === "number" && cardsFoundThisRound > 0)
            ? cardsFoundThisRound
            : (typeof window.cardsFoundThisRound === "number" && window.cardsFoundThisRound > 0
                ? window.cardsFoundThisRound
                : list.length);

          const bombsHit = (typeof totalBombsTriggered === "number" && totalBombsTriggered > 0)
            ? totalBombsTriggered
            : (typeof window.totalBombsTriggered === "number" ? window.totalBombsTriggered : 0);

          let goldCount = 0;
          let newCount = 0;
          let cardsCount = list.length;

          if (mode === "5bombs") {
            if (pillText) pillText.textContent = "GRAND REWARD";
            if (pillIcon) pillIcon.textContent = "💥";
            if (icon) icon.textContent = "🏆";
            if (title) title.textContent = "Dark Arts Conquered!";
            if (subtitle) {
              subtitle.innerHTML = 'You triggered all <strong>5</strong> Dark Arts traps and survived! 💥<br>As your reward, you\'ve won <strong id="winCardsFound">all 10 DA cards</strong> from this set!';
            }
            if (claimBtnText) claimBtnText.textContent = "✨ Claim Grand Reward";
          } else if (mode === "collect") {
            if (pillText) pillText.textContent = "SAFE EXTRACTION";
            if (pillIcon) pillIcon.textContent = "💼";
            if (icon) icon.textContent = "💼";
            if (title) title.textContent = "Cards Collected!";
            if (subtitle) {
              subtitle.innerHTML = 'You collected <strong id="winCardsFound">' + countFound + '</strong> card(s) and exited safely!';
            }
            if (claimBtnText) claimBtnText.textContent = "✅ Collect & Exit";
          } else {
            // "full10"
            if (pillText) pillText.textContent = "PERFECT CLEAR";
            if (pillIcon) pillIcon.textContent = "⚡";
            if (icon) icon.textContent = "🏆";
            if (title) title.textContent = "Mischief Managed!";
            if (subtitle) {
              subtitle.innerHTML = 'You found all <strong id="winCardsFound">' + (countFound || 10) + '</strong> DA cards!';
            }
            if (claimBtnText) claimBtnText.textContent = "✨ Claim & Add to Vault";
          }

          if (gallery) {
            gallery.innerHTML = "";
            if (list.length === 0) {
              gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px 8px;font-size:0.8rem;color:rgba(200,190,225,0.7);">No cards found this round.</div>';
            } else {
              list.forEach((item, idx) => {
                const s = (typeof SETS !== "undefined" && SETS[item.sIdx]) || set;
                const card = s && s.cards ? s.cards[item.cIdx] : null;
                if (!card) return;

                const isGold = !!card.gold;
                if (isGold) goldCount++;
                if (item.result === "new") newCount++;

                const stars = "⭐".repeat(card.stars || Math.min(card.bonus || 1, 5));
                const bgClass = card.bg ? "card-front-face fruit " + card.bg : "card-front-face fruit";

                const cardEl = document.createElement("div");
                cardEl.className = "hoc-vic-card " + (isGold ? "is-gold " : "") + bgClass;
                cardEl.style.setProperty("--ci", idx);

                let badgeHtml = "";
                if (item.result === "new") {
                  badgeHtml += '<span class="hoc-vic-tag tag-new">NEW!</span>';
                } else if (item.result === "duplicate") {
                  badgeHtml += '<span class="hoc-vic-tag tag-dup">DUP</span>';
                }
                if (isGold) {
                  badgeHtml += '<span class="hoc-vic-tag tag-gold">🌟</span>';
                }

                cardEl.innerHTML =
                  badgeHtml +
                  '<div class="hoc-vic-card-inner">' +
                    '<div class="hoc-vic-card-art">' +
                      cardArtHTML(card, "hoc-vic-img", "hoc-vic-emoji") +
                    '</div>' +
                    '<div class="hoc-vic-card-name" title="' + card.name + '">' + card.name + '</div>' +
                    '<div class="hoc-vic-card-stars">' + stars + '</div>' +
                  '</div>';
                gallery.appendChild(cardEl);
              });
            }
          }

          if (statCards) statCards.textContent = String(cardsCount);
          if (statGold) statGold.textContent = String(goldCount);
          if (statNew) statNew.textContent = String(newCount);
          if (statBombs) {
            statBombs.textContent = mode === "5bombs" ? "5/5 💥" : String(bombsHit);
          }
          if (galleryCount) galleryCount.textContent = cardsCount + " Cards";

          try {
            if (typeof spawnConfetti === "function") {
              spawnConfetti("#ffd700");
              setTimeout(() => {
                if (typeof spawnConfetti === "function") spawnConfetti("#c084fc");
              }, 250);
            }
          } catch (e) {}
        }
        window.renderHocVictoryModal = renderHocVictoryModal;

        function confirmCollect() {
          closeOverlay("overlayCollect");
          gameActive = false;
          checkHocCooldown();
          if (window.saveProgress) window.saveProgress();
          renderHocVictoryModal("collect");
          showOverlay("overlayWin");
        }

        // ─── INIT ────────────────────────────────────────────────
        function onSetChange() {
          if (hasPlayedToday(CD_KEY_HOC)) {
            showToast(
              "⏳ Already played today — set change won't start a new game.",
            );
            return;
          }
          if (hocRoundLocked) {
            showToast(
              "🔒 You've started this round — finish it before switching sets!",
            );
            // Revert the dropdown back to the locked-in set
            const setSelectEl = document.getElementById("setSelect");
            if (setSelectEl) setSelectEl.value = String(gridSetIdx);
            return;
          }
          initGame(false); // switching sets before playing never marks the day as played
        }

        function startNewGame() {
          if (hasPlayedToday(CD_KEY_HOC)) {
            showToast("⏳ You already played today! Come back tomorrow.");
            return;
          }
          // Rebuild the board only — the daily play is marked on the first card flip,
          // not just by opening/starting a fresh game.
          initGame(false);
        }

        function initGame(markPlayed, playSound) {
          if (playSound === undefined) playSound = true;
          // Reset win modal title in case collect changed it
          const winModal = document.getElementById("overlayWin");
          if (winModal) {
            const titleEl = winModal.querySelector(".modal-title");
            if (titleEl) titleEl.textContent = "Mischief Managed!";
            const bodyEl = winModal.querySelector(".modal-body");
            if (bodyEl) {
              bodyEl.innerHTML = 'You found all <strong id="winCardsFound">0</strong> DA cards!';
            }
          }
          const setIdx = parseInt(document.getElementById("setSelect").value);
          const set = SETS[setIdx];
          gridSetIdx = setIdx;

          lives = 3;
          cardsFoundThisRound = 0;
          coinsThisRound = 0;
          bombsFoundThisRound = 0;
          totalBombsTriggered = 0;
          foundKeysThisRound = [];
          gameActive = true;
          hocRoundLocked = false; // fresh board — set can be switched again until the first flip
          hocContinuesUsed = 0;
          hocContinueCost = getHocContinueCost(0); // reset continue price (400 coins for 4th life)
          const goBtn = document.getElementById("goContinueBtn");
          if (goBtn) goBtn.style.display = "";
          const setSelectEl = document.getElementById("setSelect");
          if (setSelectEl) setSelectEl.disabled = false;
          // Mark daily play only when a fresh game is explicitly started
          if (markPlayed) {
            markPlayedToday(CD_KEY_HOC);
            checkHocCooldown();
          }

          updateLivesUI();
          updateProgress(0, set.cards.length);
          document.getElementById("setLabel") &&
            (document.getElementById("setLabel").textContent =
              setIdx + 1 + "/15");

          // Build grid array: 10 fruit cards + 5 bombs = 15 total
          gridData = [];
          set.cards.forEach((c, i) => {
            gridData.push({
              type: "fruit",
              cardIdx: i,
              flipped: false,
              found: false,
            });
          });
          for (let b = 0; b < BOMB_COUNT; b++) {
            gridData.push({
              type: "bomb",
              cardIdx: b,
              flipped: false,
              found: false,
            });
          }
          shuffle(gridData);
          if (playSound) SFX.shuffle();
          renderGrid(set);
        }

        // ─── RENDER GRID ─────────────────────────────────────────
        function renderGrid(set) {
          const grid = document.getElementById("cardGrid");
          grid.innerHTML = "";

          gridData.forEach((cell, i) => {
            const wrap = document.createElement("div");
            wrap.className = "card-wrap";
            wrap.dataset.idx = i;
            wrap.onclick = () => flipCard(i);

            const inner = document.createElement("div");
            inner.className = "card-inner";

            // Back face
            const back = document.createElement("div");
            back.className = "card-face card-back-face";
            back.innerHTML = `<span class="card-logo">⚡</span><span class="card-label">D.A.</span>`;

            // Front face
            const front = document.createElement("div");
            if (cell.type === "fruit") {
              const c = set.cards[cell.cardIdx];
              front.className = `card-face card-front-face fruit ${c.bg}${c.gold ? " gold-card" : ""}`;
              const stars = "⭐".repeat(c.stars || Math.min(c.bonus, 5));
              front.innerHTML = `
        ${c.gold ? '<div class="gold-badge">🌟 GOLD</div>' : ""}
        ${cardArtHTML(c, "fruit-art-img", "fruit-emoji")}
        <div class="fruit-name">${c.name}</div>
        <div class="star-row">${stars}</div>`;
            } else {
              front.className = "card-face card-front-face bomb";
              front.innerHTML = `<div class="bomb-emoji">💣</div><div class="fruit-name">Dark Arts!</div>`;
            }

            inner.appendChild(back);
            inner.appendChild(front);
            wrap.appendChild(inner);
            grid.appendChild(wrap);
          });
        }

        // ─── FLIP CARD ──────────────────────────────────────────
        function flipCard(idx) {
          if (!gameActive) return;
          if (hasPlayedToday(CD_KEY_HOC) && !hocRoundLocked) {
            showToast("⏳ You already played today! Come back tomorrow.");
            return;
          }
          // First flip of the round: lock the set choice in and consume today's play.
          if (!hocRoundLocked) {
            hocRoundLocked = true;
            markPlayedToday(CD_KEY_HOC);
            checkHocCooldown();
            const setSelectEl = document.getElementById("setSelect");
            if (setSelectEl) setSelectEl.disabled = true;
          }
          const cell = gridData[idx];
          if (cell.flipped || cell.found) return;

          cell.flipped = true;
          const wrap = document.querySelector(`.card-wrap[data-idx="${idx}"]`);
          wrap.classList.add("flipped");
          SFX.flip();

          if (cell.type === "bomb") {
            wrap.classList.add("bomb-explode");
            lives--;
            bombsFoundThisRound++;
            totalBombsTriggered++;
            updateLivesUI();
            setTimeout(() => {
              SFX.bomb();
              SFX.heartLost();
            }, 100);
            setTimeout(() => wrap.classList.remove("bomb-explode"), 600);

            // If player triggers all 5 bombs on the board: Grand Reward! Award all 10 cards!
            if (totalBombsTriggered >= BOMB_COUNT) {
              gameActive = false;
              checkHocCooldown();
              const setIdx = parseInt(document.getElementById("setSelect").value);
              const set = SETS[setIdx];

              // Reveal all fruit cards on board and award any not already found
              gridData.forEach((c, i) => {
                if (c.type === "fruit" && !c.found) {
                  c.found = true;
                  c.flipped = true;
                  cardsFoundThisRound++;
                  cardsWon++;
                  const fruitWrap = document.querySelector(
                    `.card-wrap[data-idx="${i}"]`,
                  );
                  if (fruitWrap) {
                    fruitWrap.classList.add("flipped", "found");
                    const _key = setIdx + "-" + c.cardIdx;
                    const awardResult = window.awardCardOrDuplicate(
                      setIdx,
                      c.cardIdx,
                    );
                    foundKeysThisRound.push({ key: _key, result: awardResult });
                    if (awardResult === "new") {
                      const frontFace = fruitWrap.querySelector(
                        ".card-front-face.fruit",
                      );
                      if (frontFace && !frontFace.querySelector(".fruit-new-badge")) {
                        const badge = document.createElement("div");
                        badge.className = "fruit-new-badge";
                        badge.textContent = "NEW!";
                        frontFace.appendChild(badge);
                      }
                    }
                  }
                }
              });

              updateHUD();
              SFX.cardFound();
              updateProgress(cardsFoundThisRound, set.cards.length);
              if (window.saveProgress) window.saveProgress();

              setTimeout(() => {
                renderHocVictoryModal("5bombs");
                SFX.win();
                showOverlay("overlayWin");
              }, 900);
              return;
            }

            if (bombsFoundThisRound >= BUST_BOMB_COUNT) {
              gameActive = false;
              checkHocCooldown();
              setTimeout(() => {
                SFX.gameOver();
                triggerBust();
              }, 700);
            } else {
              setTimeout(() => {
                showBombWarning();
              }, 700);
            }
          } else {
            const setIdx = parseInt(document.getElementById("setSelect").value);
            const set = SETS[setIdx];
            const c = set.cards[cell.cardIdx];
            cell.found = true;
            wrap.classList.add("found");
            cardsFoundThisRound++;
            cardsWon++;
            const _key = setIdx + "-" + cell.cardIdx;
            const awardResult = window.awardCardOrDuplicate(
              setIdx,
              cell.cardIdx,
            );
            foundKeysThisRound.push({ key: _key, result: awardResult });
            if (awardResult === "new") {
              const frontFace = wrap.querySelector(".card-front-face.fruit");
              if (frontFace) {
                const badge = document.createElement("div");
                badge.className = "fruit-new-badge";
                badge.textContent = "NEW!";
                frontFace.appendChild(badge);
              }
            }
            updateHUD();
            SFX.cardFound();
            spawnScorePop(wrap, `+1 🃏`);
            updateProgress(cardsFoundThisRound, set.cards.length);

            if (cardsFoundThisRound >= set.cards.length) {
              gameActive = false;
              checkHocCooldown();
              setTimeout(() => {
                renderHocVictoryModal("full10");
                SFX.win();
                showOverlay("overlayWin");
              }, 900);
            }
          }
        }

        // ─── BOMB WARNING (non-fatal trap) ───────────────────────
        function showBombWarning() {
          const remaining = BUST_BOMB_COUNT - bombsFoundThisRound;
          document.getElementById("bwTitle").textContent = "Dark Arts Trap!";
          document.getElementById("bwBody").innerHTML =
            `You triggered a Dark Arts trap! ⚠️<br>You've found <strong>${cardsFoundThisRound}</strong> card(s) so far.<br>Trigger <strong>${remaining}</strong> more and you'll lose every card you found this round!`;
          showOverlay("overlayBombWarning");
        }

        // ─── BUST (3rd bomb found — forfeit every card found this round, unless the
        // player pays to continue) ──
        function triggerBust() {
          closeOverlay("overlayBombWarning");
          updateGameOverOverlay();
          showOverlay("overlayGameOver");
        }

        // Refreshes the Game Over modal's continue button — label, price, and
        // whether the player can currently afford it.
        function updateGameOverOverlay() {
          const btn = document.getElementById("goContinueBtn");
          const body = document.getElementById("goBody");
          const nextLifeNum = 3 + hocContinuesUsed + 1; // 4th life, 5th life, etc.
          const totalBombsHit = totalBombsTriggered || (3 + hocContinuesUsed);
          if (body) {
            body.innerHTML = `You triggered <strong>${totalBombsHit}</strong> Dark Arts trap${totalBombsHit > 1 ? "s" : ""}! You've found <strong>${cardsFoundThisRound}</strong> card(s) so far — pay to keep going with Life #${nextLifeNum}, or walk away and forfeit them.`;
          }
          if (!btn) return;
          if (hocContinuesUsed >= MAX_HOC_CONTINUES || !hocContinueCost) {
            btn.style.display = "none";
            return;
          }
          btn.style.display = "";
          const canAfford = coins >= hocContinueCost;
          btn.textContent = `💰 Continue for ${hocContinueCost} coins (Life #${nextLifeNum})`;
          btn.disabled = !canAfford;
          btn.style.opacity = canAfford ? "1" : ".5";
        }

        // Pay to keep the round alive: grants exactly 1 more life (not a full reset),
        // so the very next bomb busts the round again. Keeps every card found so
        // far. 4th life = 400 coins, 5th life = 800 coins.
        function continueAfterBust() {
          if (hocContinuesUsed >= MAX_HOC_CONTINUES || !hocContinueCost) {
            showToast("⚠️ Maximum 2 paid lives reached for this round!");
            return;
          }
          if (coins < hocContinueCost) {
            showToast("💸 Not enough coins to continue!");
            return;
          }
          const costPaid = hocContinueCost;
          const lifeAwarded = 3 + hocContinuesUsed + 1;
          coins -= costPaid;
          logCoinTx(
            -costPaid,
            `🃏 Continued House of Cards (Life #${lifeAwarded})`,
          );
          hocContinuesUsed++;
          hocContinueCost = getHocContinueCost(hocContinuesUsed);
          lives = 1;
          bombsFoundThisRound = BUST_BOMB_COUNT - 1; // one more trap will bust again
          gameActive = true;
          updateLivesUI();
          updateHUD();
          closeOverlay("overlayGameOver");
          showToast(`⚡ Round continues — Life #${lifeAwarded} active!`);
        }

        // Walk away from a bust: forfeit every card found this round.
        function forfeitAfterBust() {
          closeOverlay("overlayGameOver");
          const goBtn = document.getElementById("goContinueBtn");
          if (goBtn) goBtn.style.display = "";
          foundKeysThisRound.forEach(({ key, result }) => {
            if (result === "duplicate") {
              if (ownedCards[key])
                ownedCards[key].dupes = Math.max(
                  0,
                  (ownedCards[key].dupes || 0) - 1,
                );
            } else {
              delete ownedCards[key];
            }
          });
          foundKeysThisRound = [];
          cardsFoundThisRound = 0;
          updateHUD();
          if (
            typeof collSetIdx !== "undefined" &&
            typeof renderCollGrid === "function"
          )
            renderCollGrid();
          startNewGame();
        }

        // ─── HINT ───────────────────────────────────────────────
        function revealHint() {
          if (!ecIsActive("hoc")) {
            showToast(
              "🔒 House of Cards is currently paused by your DA leader.",
            );
            return;
          }
          if (hasPlayedToday(CD_KEY_HOC) && !hocRoundLocked) {
            showToast("⏳ You already played today! Come back tomorrow.");
            return;
          }
          if (!gameActive) return;
          if (coins < HINT_COST) {
            alert("Not enough coins for a hint!");
            return;
          }
          const unflipped = gridData
            .map((c, i) => ({ ...c, i }))
            .filter((c) => !c.flipped && !c.found && c.type === "fruit");
          if (unflipped.length === 0) return;
          coins -= HINT_COST;
          logCoinTx(-HINT_COST, "💡 House of Cards hint");
          updateHUD();
          SFX.hint();
          const pick = unflipped[Math.floor(Math.random() * unflipped.length)];
          const wrap = document.querySelector(
            `.card-wrap[data-idx="${pick.i}"]`,
          );
          wrap.style.outline = "3px solid #f0c030";
          wrap.style.boxShadow = "0 0 16px 4px rgba(240,192,48,.7)";
          setTimeout(() => {
            wrap.style.outline = "";
            wrap.style.boxShadow = "";
          }, 2000);
        }

        // ─── UI HELPERS ─────────────────────────────────────────
        function updateLivesUI() {
          for (let i = 1; i <= 3; i++) {
            const h = document.getElementById(`h${i}`);
            h.classList.toggle("lost", i > lives);
          }
        }

        function updateProgress(found, total) {
          const pct = total ? (found / total) * 100 : 0;
          document.getElementById("progressFill").style.width = pct + "%";
          document.getElementById("progressLabel").textContent =
            `Found ${found} / ${total} cards`;
        }

        // ── COIN "NEW CREDIT" DOT ─────────────────────────────────
        // Shows a red dot on the topbar coin chip whenever the player's balance is
        // higher than the last balance they actually looked at (tracked per player
        // in localStorage — this is just a "have you seen this" UI flag, not game
        // state, so it doesn't need Firestore sync). Covers game wins, purchases-
        // refunds, and admin grants alike, since they all funnel through logCoinTx
        // -> updateHUD(). The dot clears when the player opens their coin history.
        function _coinDotKey() {
          return "da_coin_seen_" + (window._currentPlayerId || "guest");
        }
        function refreshCoinDot() {
          var dotEl = document.getElementById("coinNewDot");
          if (!dotEl) return;
          try {
            var key = _coinDotKey();
            var seenRaw = localStorage.getItem(key);
            if (seenRaw === null) {
              // No baseline yet for this player/device — establish one silently
              // so we don't flag their whole existing balance as "new".
              localStorage.setItem(key, String(coins));
              dotEl.classList.remove("show");
              return;
            }
            var seen = parseInt(seenRaw, 10) || 0;
            if (coins > seen) {
              dotEl.classList.add("show");
            } else {
              // At or below the last-seen balance (normal spending, or a refund that
              // only restores part of an earlier spend) — lower the baseline to the
              // new low so a later credit that pushes past it still flags correctly.
              // Without this, spending down then getting refunded back up to the old
              // baseline would never count as "new" since it never exceeds it.
              if (coins < seen) localStorage.setItem(key, String(coins));
              dotEl.classList.remove("show");
            }
          } catch (e) {
            /* localStorage unavailable — just skip the dot */
          }
        }
        function clearCoinDot() {
          try {
            localStorage.setItem(_coinDotKey(), String(coins));
          } catch (e) {}
          var dotEl = document.getElementById("coinNewDot");
          if (dotEl) dotEl.classList.remove("show");
        }

        function updateHUD() {
          document.getElementById("coinCount").textContent = formatCoins(coins);
          var spinCoinsEl = document.getElementById("spinCoinsDisplay");
          if (spinCoinsEl) spinCoinsEl.textContent = formatCoins(coins);
          refreshCoinDot();
          // Keep local player's coins synced in social list cache if present
          if (window._currentPlayerId && Array.isArray(_socialMembers)) {
            const me = _socialMembers.find((p) => (p.playerId || p.id) === window._currentPlayerId);
            if (me) me.coins = coins;
          }
          // Show unique collected cards count
          const owned = Object.keys(ownedCards).filter(
            (k) => ownedCards[k] && ownedCards[k].owned,
          ).length;
          const cardCountEl = document.getElementById("cardCount");
          if (cardCountEl) cardCountEl.textContent = owned;
        }

        function switchTabNav(id, btnEl) {
          SFX.click && SFX.click();
          // update bottom nav active state
          document
            .querySelectorAll(".bn-item")
            .forEach((b) => b.classList.remove("active"));
          let targetBtn = btnEl || document.getElementById("bn-" + id);
          if (targetBtn && targetBtn.classList.contains("bn-item")) {
            targetBtn.classList.add("active");
          }
          // reuse existing switchTab logic
          switchTab(id, null);
        }

        function openAdminPortal() {
          const lobby = document.getElementById("lobbyScreen");
          if (lobby && lobby.style.display !== "none") {
            hideLobby();
            window._openedAdminFromLobby = true;
          }
          switchTabNav("admin");
          window.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => {
            if (!adminUnlocked) {
              const pin = document.getElementById("adminPinInput");
              if (pin) pin.focus();
            }
          }, 120);
        }
        window.openAdminPortal = openAdminPortal;

        function exitAdminPortal() {
          if (window._openedAdminFromLobby) {
            window._openedAdminFromLobby = false;
            showLobby();
          } else {
            switchTabNav("games");
          }
        }
        window.exitAdminPortal = exitAdminPortal;

        function openLeaderPortal() {
          openAdminPortal();
        }
        window.openLeaderPortal = openLeaderPortal;

        function showOverlay(id) {
          const el = document.getElementById(id);
          if (el) el.classList.add("show");
          if (window.lockBodyScroll) window.lockBodyScroll(id);
          if (window.daPushOverlayState) window.daPushOverlayState(id);
        }
        function closeOverlay(id, fromPopstate) {
          if (window.daDismissOverlay) {
            window.daDismissOverlay(id, fromPopstate);
          } else {
            const el = document.getElementById(id);
            if (el) el.classList.remove("show");
            if (window.unlockBodyScroll) window.unlockBodyScroll(id);
          }
        }
        window.closeOverlay = closeOverlay;

        // ── Coin grant modal (shown before welcome when admin sent coins) ─
        function showCoinGrantModal(amount, nameForWelcome, note, senderName) {
          const el = document.getElementById("coinGrantModal");
          if (!el) return;
          const amtEl = document.getElementById("cgAmount");
          if (amtEl) amtEl.textContent = "+" + amount + " 🪙";
          const sender = (senderName || "").trim();
          const fromEl = document.getElementById("cgFrom");
          if (fromEl) {
            fromEl.innerHTML = `✨ <strong>${sender ? escapeHtml(sender) : "Your DA leader"}</strong> has granted you coins!<br /><span id="cgGrantMsg">Keep playing and collecting cards!</span>`;
          }
          // Personalise the sub-message
          const msgs = [
            "The Mantralay rewards loyalty! Keep collecting! ⚡",
            "Use them wisely and keep collecting! 🃏",
            sender ? `${sender} is proud of you! 🧙` : "Your DA leader is proud of you! 🧙",
            "Fortune favours the brave wizard! 🔮",
          ];
          const msgEl = document.getElementById("cgGrantMsg");
          if (msgEl)
            msgEl.textContent = msgs[Math.floor(Math.random() * msgs.length)];
          // Show admin's note, if one was attached to this grant
          const noteEl = document.getElementById("cgNoteBox");
          const noteTextEl = document.getElementById("cgNoteText");
          const noteTitleEl = document.getElementById("cgNoteTitle");
          if (noteTitleEl) {
            noteTitleEl.textContent = sender ? `📝 Note from ${sender}` : "📝 Note from your DA leader";
          }
          if (noteEl && noteTextEl) {
            const trimmed = (note || "").trim();
            if (trimmed) {
              noteTextEl.textContent = trimmed;
              noteEl.style.display = "block";
            } else {
              noteEl.style.display = "none";
            }
          }
          // Store name so closeCoinGrantModal can open welcome next
          el.dataset.nextName = nameForWelcome || "";
          el.style.display = "flex";
          // Confetti burst inside the modal
          _cgSpawnConfetti();
        }

        function _cgSpawnConfetti() {
          const container = document.getElementById("cgConfettiContainer");
          if (!container) {
            spawnConfetti && spawnConfetti("#ffd700");
            return;
          }
          container.innerHTML = "";
          const colors = [
            "#ffd700",
            "#f472b6",
            "#60a5fa",
            "#4ade80",
            "#fb923c",
            "#c084fc",
            "#fff",
          ];
          for (let i = 0; i < 36; i++) {
            const c = document.createElement("div");
            const col = colors[i % colors.length];
            const sz = 5 + Math.random() * 8;
            const left = 10 + Math.random() * 80;
            const dur = 0.8 + Math.random() * 1.2;
            const del = Math.random() * 0.5;
            c.style.cssText = `
      position:absolute; top:-10px; left:${left}%;
      width:${sz}px; height:${sz * (Math.random() > 0.5 ? 1 : 0.35)}px;
      background:${col}; border-radius:${Math.random() > 0.4 ? "50%" : "2px"};
      opacity:1; animation: cgConfettiFall ${dur}s ${del}s ease-out forwards;
      transform: rotate(${Math.random() * 360}deg);
    `;
            container.appendChild(c);
          }
        }

        // Mid-session coin grant (player already logged in when admin sends coins)
        window.showCoinGrantModalLive = function (amount, note, senderName) {
          const sender = (senderName || "").trim();
          const reason = note
            ? `🎁 Granted by ${sender || "your DA leader"} — ${note}`
            : `🎁 Granted by ${sender || "your DA leader"}`;
          const topTx = coinHistory[0];
          const alreadyLogged =
            topTx &&
            Number(topTx.delta) === Number(amount) &&
            topTx.reason === reason;
          if (!alreadyLogged && typeof logCoinTx === "function") {
            logCoinTx(amount, reason);
          }
          updateHUD();
          showCoinGrantModal(amount, profile.name || "", note || "", sender);
        };

        // Mid-session card removal — fires when the DA leader marks one of this
        // player's card requests as "done". ownedCards was already synced from
        // Firestore by the live listener before this runs, so we just refresh the UI.
        window.showCardRemovedModalLive = function (setIdx, cardIdx, result) {
          const card = SETS[setIdx] && SETS[setIdx].cards && SETS[setIdx].cards[cardIdx];
          if (card) {
            if (result === "dupe-removed") {
              showToast(
                `📬 Delivered in Township! One duplicate ${card.emoji} ${card.name} was sent & deducted.`,
              );
            } else if (result === "card-removed") {
              showToast(
                `📬 Delivered in Township! ${card.emoji} ${card.name} was sent & deducted from your collection.`,
              );
            }
          }
          updateHUD();
          updateCollStats();
          refreshMyReqPill();
          refreshCdsReqPill();
          if (
            document.getElementById("panel-coll") &&
            document.getElementById("panel-coll").classList.contains("active")
          ) {
            renderCollTabs();
            renderCollGrid();
            if (collView === "requests") renderMyRequests();
          }
          if (
            document.getElementById("panel-cds") &&
            document.getElementById("panel-cds").classList.contains("active") &&
            cdsView === "requests"
          ) {
            renderMyCdsRequests();
          }
        };

        function closeCoinGrantModal() {
          const el = document.getElementById("coinGrantModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }

        // ── Aura grant modal ──
        function showAuraGrantModal(amount, note, senderName) {
          const el = document.getElementById("auraGrantModal");
          if (!el) return;
          const amtEl = document.getElementById("agAmount");
          if (amtEl) amtEl.textContent = "+" + amount + " ✨";
          const sender = (senderName || "").trim();
          const fromEl = document.getElementById("agFrom");
          if (fromEl) {
            fromEl.innerHTML = `✨ <strong>${sender ? escapeHtml(sender) : "Your DA leader"}</strong> has granted you Aura!<br />Keep it up and climb the ranks! 🧙`;
          }
          const noteEl = document.getElementById("agNoteBox");
          const noteTextEl = document.getElementById("agNoteText");
          const noteTitleEl = document.getElementById("agNoteTitle");
          if (noteTitleEl) {
            noteTitleEl.textContent = sender ? `📝 Note from ${sender}` : "📝 Note from your DA leader";
          }
          if (noteEl && noteTextEl) {
            const trimmed = (note || "").trim();
            if (trimmed) {
              noteTextEl.textContent = trimmed;
              noteEl.style.display = "block";
            } else {
              noteEl.style.display = "none";
            }
          }
          el.style.display = "flex";
        }
        window.showAuraGrantModal = showAuraGrantModal;

        function closeAuraGrantModal() {
          const el = document.getElementById("auraGrantModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }

        // ── Aura deduct modal ──
        function showAuraDeductModal(amount, senderName) {
          const el = document.getElementById("auraDeductModal");
          if (!el) return;
          const amtEl = document.getElementById("adAmount");
          if (amtEl) amtEl.textContent = "−" + amount + " ✨";
          const sender = (senderName || "").trim();
          const fromEl = document.getElementById("adFrom");
          if (fromEl) {
            fromEl.innerHTML = `<strong>${sender ? escapeHtml(sender) : "Your DA leader"}</strong> adjusted your Aura balance while you were away.<br />Keep playing to earn it back! ⚡`;
          }
          el.style.display = "flex";
        }
        window.showAuraDeductModal = showAuraDeductModal;

        function closeAuraDeductModal() {
          const el = document.getElementById("auraDeductModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }

        // ── Card grant modal (shown when leader grants a card) ──
        function showCardGrantModal(info) {
          const el = document.getElementById("cardGrantModal");
          if (!el || !info) return;
          const sIdx = Number(info.setIdx);
          const cIdx = Number(info.cardIdx);
          const card = (typeof SETS !== "undefined" && SETS[sIdx] && SETS[sIdx].cards[cIdx]) || null;
          const setName = (typeof SETS !== "undefined" && SETS[sIdx]) ? SETS[sIdx].name : `Set ${sIdx + 1}`;
          const stars = card && card.stars ? "⭐".repeat(card.stars) : "⭐";

          const emojiEl = document.getElementById("cdgCardEmoji");
          const nameEl = document.getElementById("cdgCardName");
          const setEl = document.getElementById("cdgCardSetName");
          const starsEl = document.getElementById("cdgCardStars");
          const typeTagEl = document.getElementById("cdgCardTypeTag");
          const noteBoxEl = document.getElementById("cdgNoteBox");
          const noteTextEl = document.getElementById("cdgNoteText");
          const fromMsgEl = document.getElementById("cdgFromMsg");

          if (emojiEl) emojiEl.textContent = (card && card.emoji) || info.cardEmoji || "🃏";
          if (nameEl) nameEl.textContent = (card && card.name) || info.cardName || "Mystery Card";
          if (setEl) setEl.textContent = setName;
          if (starsEl) starsEl.textContent = stars;
          if (typeTagEl) {
            typeTagEl.textContent = info.isDupe ? "✨ Duplicate Added!" : "✨ New Card Added!";
          }
          if (fromMsgEl && info.senderName) {
            fromMsgEl.innerHTML = `✨ <strong>${escapeHtml(info.senderName)}</strong> has sent you a card!<br />Added directly to your collection. 📚`;
          }
          if (noteBoxEl && noteTextEl) {
            const note = (info.note || "").trim();
            if (note) {
              noteTextEl.textContent = note;
              noteBoxEl.style.display = "block";
            } else {
              noteBoxEl.style.display = "none";
            }
          }
          el.style.display = "flex";
          if (typeof SFX !== "undefined" && SFX.win) SFX.win();
        }
        window.showCardGrantModal = showCardGrantModal;
        window.showCardGrantModalLive = function (info) {
          showCardGrantModal(info);
        };

        function closeCardGrantModal() {
          const el = document.getElementById("cardGrantModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }
        window.closeCardGrantModal = closeCardGrantModal;

        // ── Post-login "while you were away" modal queue ──────────
        // There is no generic welcome-back modal. Instead, every individual change
        // the DA leader made to this account while the player was offline gets its
        // own dedicated modal (coins granted, coins deducted, aura granted, aura
        // deducted, progress reset), shown one at a time in sequence — each modal's
        // "close" button advances to the next one in the queue. If nothing happened
        // while the player was away, the queue is empty and no modal appears at all.
        window._postLoginData = null;
        window._doorOpened = false;
        window._postLoginShown = false;
        window._postLoginQueue = [];

        window._tryShowPostLogin = function () {
          if (window._postLoginShown) return; // already ran
          if (!window._doorOpened) return; // wait for the door
          if (!window._postLoginData) return; // wait for login data
          window._postLoginShown = true;
          const d = window._postLoginData;
          const queue = [];
          if (d.grant > 0)
            queue.push(() => showCoinGrantModal(d.grant, d.name, d.grantNote, d.grantSender));
          if (d.deduct > 0) queue.push(() => showCoinDeductModal(d.deduct, d.deductSender));
          if (d.auraGrant > 0)
            queue.push(() => showAuraGrantModal(d.auraGrant, d.auraGrantNote, d.auraGrantSender));
          if (d.auraDeduct > 0)
            queue.push(() => showAuraDeductModal(d.auraDeduct, d.auraDeductSender));
          if (d.cardGrant && d.cardGrant.token)
            queue.push(() => showCardGrantModal(d.cardGrant));
          if (d.reset) queue.push(() => showProgressResetModal());
          window._postLoginQueue = queue;
          window._advancePostLoginQueue();
        };

        // Called by each away-modal's close button. Pops the next queued modal, if any.
        window._advancePostLoginQueue = function () {
          if (!window._postLoginQueue || !window._postLoginQueue.length) return;
          const next = window._postLoginQueue.shift();
          next();
        };

        // ── Standalone pop-ups for REAL-TIME changes (player is online) ──
        // These fire from the live Firestore listener when the leader acts while the
        // player has the app open; the offline case is folded into the welcome modal.
        function showCoinDeductModal(amount, senderName) {
          const el = document.getElementById("coinDeductModal");
          if (!el) return;
          const amtEl = document.getElementById("cdAmount");
          if (amtEl) amtEl.textContent = "−" + amount + " 🪙"; // −amount 🪙
          const sender = (senderName || "").trim();
          const fromEl = document.getElementById("cdFrom");
          if (fromEl) {
            fromEl.innerHTML = `<strong>${sender ? escapeHtml(sender) : "Your DA leader"}</strong> adjusted your balance while you were away.<br />Keep playing to earn them back! ⚡`;
          }
          el.style.display = "flex";
        }
        window.showCoinDeductModal = showCoinDeductModal;
        function closeCoinDeductModal() {
          const el = document.getElementById("coinDeductModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }
        function showProgressResetModal() {
          const el = document.getElementById("progressResetModal");
          if (!el) return;
          el.style.display = "flex";
        }
        function closeProgressResetModal() {
          const el = document.getElementById("progressResetModal");
          if (el) el.style.display = "none";
          SFX.click && SFX.click();
          window._advancePostLoginQueue && window._advancePostLoginQueue();
        }

        // ── Centered coin score pop ───────────────────────────────
        function spawnScorePop(el, text) {
          const pop = document.createElement("div");
          pop.className = "coin-pop-center";
          pop.textContent = text;
          document.body.appendChild(pop);
          setTimeout(() => pop.remove(), 800);
        }

        function shuffle(arr) {
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
        }

        // ─── TOPBAR PROFILE PILL & INSTAGRAM-STYLE FAST SWITCH ────
        let _lastProfileTap = 0;
        let _profileTapTimer = null;
        let _lastSwitchTriggerTime = 0;

        window.handleProfilePillClick = function (e) {
          if (window._isSwitchingAccount) return;
          const now = Date.now();
          const diff = now - _lastProfileTap;
          if (diff > 40 && diff < 380) {
            // Detected double tap!
            _lastProfileTap = 0;
            if (_profileTapTimer) {
              clearTimeout(_profileTapTimer);
              _profileTapTimer = null;
            }
            _lastSwitchTriggerTime = now;
            if (typeof window.quickSwitchAccount === "function") {
              window.quickSwitchAccount();
            }
          } else {
            // First tap: delay navigation slightly to detect potential second tap
            _lastProfileTap = now;
            if (_profileTapTimer) clearTimeout(_profileTapTimer);
            _profileTapTimer = setTimeout(() => {
              _lastProfileTap = 0;
              if (window._isSwitchingAccount) return;
              const bnProfile = document.getElementById("bn-profile");
              if (typeof switchTabNav === "function" && bnProfile) {
                switchTabNav("profile", bnProfile);
              } else if (typeof switchTab === "function") {
                switchTab("profile", document.querySelector(".tab-btn"));
              }
            }, 260);
          }
        };

        window.handleProfilePillDblClick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (window._isSwitchingAccount) return;
          const now = Date.now();
          if (now - _lastSwitchTriggerTime < 600) {
            // Already handled by click handler's double-tap detection!
            return;
          }
          if (_profileTapTimer) {
            clearTimeout(_profileTapTimer);
            _profileTapTimer = null;
          }
          _lastProfileTap = 0;
          _lastSwitchTriggerTime = now;
          if (typeof window.quickSwitchAccount === "function") {
            window.quickSwitchAccount();
          }
        };

        // ─── TAB SWITCH ─────────────────────────────────────────
        function switchTab(id, btnEl) {
          // Record history state if user navigated to a different tab (not via popstate)
          if (
            !window._daNavigatingBack &&
            id !== window._daCurrentTab &&
            id !== "spin" &&
            id !== "pr"
          ) {
            try {
              history.pushState({ daScreen: "tab", tab: id }, "");
            } catch (e) {}
          }
          window._daCurrentTab = id;

          // Leaving My Collection for a different tab — clear the NEW badges for
          // whichever set was being viewed, now that the player has seen it.
          if (id !== "coll") {
            const collPanel = document.getElementById("panel-coll");
            if (collPanel && collPanel.classList.contains("active")) {
              clearNewForSet(collSetIdx);
            }
          }
          document
            .querySelectorAll(".panel")
            .forEach((p) => p.classList.remove("active"));
          document
            .querySelectorAll(".tab-btn")
            .forEach((b) => b.classList.remove("active"));
          // Leaving the Spin & Win / Pattern Recall fullscreen rooms unless we're re-entering below
          if (id !== "spin") {
            document.body.classList.remove("spin-room-active");
            clearViewportHeight(document.getElementById("panel-spin"));
          }
          if (id !== "pr") {
            document.body.classList.remove("pr-room-active");
            clearViewportHeight(document.getElementById("panel-pr"));
          }
          if (id !== "spin") {
            // Detach globalSpin listener when leaving Spin & Win room
            if (window.stopGlobalSpinListener) window.stopGlobalSpinListener();
          }
          if (id !== "match") {
            // Detach Events tab listeners when leaving Events tab
            if (window.stopLbListeners) window.stopLbListeners();
          }
          if (id !== "admin") {
            // Detach Admin listeners when leaving Admin tab
            if (window.stopAllAdminListeners) window.stopAllAdminListeners();
          }
          if (id !== "match") {
            // Detach Leaderboard listeners when leaving Events tab
            if (window.stopLbListeners) window.stopLbListeners();
          }
          document.getElementById("panel-" + id).classList.add("active");
          if (btnEl) btnEl.classList.add("active");
          if (id === "coll") openCollection();
          if (id === "cds") openCds();
          if (id === "profile") openProfile();
          if (id === "admin") openAdmin();
          if (id === "spin") {
            if (window.startGlobalSpinListener) window.startGlobalSpinListener();
            openSpin();
          }
          if (id === "pr") prOpen();
          if (id === "hoc") checkHocCooldown();
          if (id === "social") openSocial();
          if (id === "match") {
            jjUpdateEntryStats();
            jpUpdateEntryStats();
            // Load leaderboards and start live listeners
            const todayLabel = new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const jjDateEl = document.getElementById("jjLbDate");
            const jpDateEl = document.getElementById("jpLbDate");
            if (jjDateEl) jjDateEl.textContent = todayLabel;
            if (jpDateEl) jpDateEl.textContent = todayLabel;
            if (window._appReady && typeof startLbListeners === "function") {
              startLbListeners();
            } else {
              jjLoadInlineLeaderboard && jjLoadInlineLeaderboard();
              jpLoadInlineLeaderboard && jpLoadInlineLeaderboard();
            }
          }
          // Re-apply event controls on every tab switch (catches schedule-based changes)
          if (window._appReady)
            window.applyEventControls && window.applyEventControls();
        }

        // ─── START ──────────────────────────────────────────────
        async function initApp() {
          // Per-user cooldown prefix (set properly after login)
          window._cdPrefixStr = "guest_";
          window._cdPrefix = "guest_";
          // Quick check: if no session saved, skip the wait and show lobby immediately
          let hasSession = false;
          try {
            hasSession = !!localStorage.getItem("da_session");
          } catch (e) {}
          if (!hasSession) {
            document.getElementById("sessionRestoreScreen").style.display =
              "none";
            document.getElementById("lobbyScreen").style.display = "flex";
            return;
          }
          document.getElementById("sessionRestoreScreen").style.display =
            "flex";
          // Wait for the Firebase module to register tryRestoreSession (async module loading race)
          let tries = 0;
          while (!window.__mod_tryRestoreSession && tries < 80) {
            await new Promise((r) => setTimeout(r, 50));
            tries++;
          }
          const restored = await window.tryRestoreSession?.();
          if (!restored) {
            document.getElementById("sessionRestoreScreen").style.display =
              "none";
            document.getElementById("lobbyScreen").style.display = "flex";
            showToast("👋 Session expired. Please log in again.");
          }
          // If restored, _onUserLoggedIn → hideLobby handles the rest
        }
        initApp();

        // Powers the left/right arrow buttons + mouse-wheel/drag scrolling on the
        // horizontal set-tabs rows (My Collection / CDS). Laptop users
        // with a mouse have no touch-swipe and the scrollbar is hidden, so this
        // gives them an obvious way to scroll and a fallback for vertical wheel
        // scroll to move the row horizontally (new UI).
        function initSetTabsScrollers() {
          document.querySelectorAll(".coll-set-tabs-wrap").forEach((wrap) => {
            const track = wrap.querySelector(".coll-set-tabs");
            const btnLeft = wrap.querySelector(".coll-set-scroll-left");
            const btnRight = wrap.querySelector(".coll-set-scroll-right");
            if (!track || track.dataset.scrollerWired) return;
            track.dataset.scrollerWired = "1";

            let arrowRaf = null;
            const updateArrows = () => {
              if (arrowRaf) return;
              arrowRaf = requestAnimationFrame(() => {
                arrowRaf = null;
                const maxScroll = track.scrollWidth - track.clientWidth;
                if (btnLeft)
                  btnLeft.classList.toggle(
                    "is-hidden",
                    maxScroll <= 2 || track.scrollLeft <= 2,
                  );
                if (btnRight)
                  btnRight.classList.toggle(
                    "is-hidden",
                    maxScroll <= 2 || track.scrollLeft >= maxScroll - 2,
                  );
              });
            };

            if (btnLeft)
              btnLeft.addEventListener("click", () =>
                track.scrollBy({ left: -160, behavior: "smooth" }),
              );
            if (btnRight)
              btnRight.addEventListener("click", () =>
                track.scrollBy({ left: 160, behavior: "smooth" }),
              );

            // Laptop trackpad/mouse wheel sends vertical delta; redirect it horizontally.
            track.addEventListener(
              "wheel",
              (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  track.scrollLeft += e.deltaY;
                  e.preventDefault();
                }
              },
              { passive: false },
            );

            // Click-and-drag scrolling for mouse users (no touch/trackpad swipe).
            let isDown = false,
              startX = 0,
              startScroll = 0,
              moved = false;
            track.addEventListener("mousedown", (e) => {
              isDown = true;
              moved = false;
              startX = e.pageX;
              startScroll = track.scrollLeft;
              track.classList.add("is-dragging");
            });
            window.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              const dx = e.pageX - startX;
              if (Math.abs(dx) > 3) moved = true;
              track.scrollLeft = startScroll - dx;
            });
            window.addEventListener("mouseup", () => {
              isDown = false;
              track.classList.remove("is-dragging");
            });
            // Suppress the tab's click (which switches sets) if the mousedown turned into a drag.
            track.addEventListener(
              "click",
              (e) => {
                if (moved) {
                  e.stopPropagation();
                  e.preventDefault();
                  moved = false;
                }
              },
              true,
            );

            track.addEventListener("scroll", updateArrows, { passive: true });
            window.addEventListener("resize", updateArrows);
            // The tabs are re-rendered (innerHTML rebuilt) whenever the active set/panel
            // changes, so watch for that and re-check whether arrows are needed.
            new MutationObserver(updateArrows).observe(track, {
              childList: true,
            });
            updateArrows();
          });
        }
        initSetTabsScrollers();

        // ownedCards declared above (before state section)
        let collSetIdx = 0;

        // ─── SOCIAL — DA member list (name, online status, coins, Aura) ──
        // Ranking: Aura points first, then coins. Reuses the same admin
        // getDocs(USERS_COL) read already used for Player Stats, so no new
        // Firestore surface is introduced.
        const SOCIAL_ONLINE_MS = 4 * 60 * 1000; // considered "online" if active in last 4 min (aligns with 2-min heartbeat)
        let _socialMembers = [];
        window._setSocialMembers = function (m) {
          _socialMembers = Array.isArray(m) ? m : [];
        };
        let _socialRefreshTimer = null;

        let _lastSocialFetchTs = 0;
        function openSocial() {
          const listEl = document.getElementById("socialMemberList");
          if (listEl && (!_socialMembers || _socialMembers.length === 0)) {
            listEl.innerHTML =
              '<div class="social-loading">⚡ Loading members…</div>';
          }
          const now = Date.now();

          // Immediately ensure local player's coins & aura match in the cached list
          const myPid = window._currentPlayerId || "";
          if (myPid && Array.isArray(_socialMembers)) {
            const me = _socialMembers.find((p) => (p.playerId || p.id) === myPid);
            if (me) {
              me.coins = typeof coins === "number" ? coins : me.coins;
              me.aura = typeof window.aura === "number" ? window.aura : me.aura;
            }
          }

          // Load from RTDB (0 Firestore reads!) — 15s refresh threshold for responsive leaderboards
          if (now - _lastSocialFetchTs > 15000 || !_socialMembers || _socialMembers.length === 0) {
            _lastSocialFetchTs = now;
            socialFetchAndRender();
          } else {
            socialRefreshPresenceOnly();
          }
          // Refresh from RTDB every 30s while tab is open (0 Firestore reads!)
          if (_socialRefreshTimer) clearInterval(_socialRefreshTimer);
          _socialRefreshTimer = setInterval(() => {
            const panel = document.getElementById("panel-social");
            if (!panel || !panel.classList.contains("active")) {
              clearInterval(_socialRefreshTimer);
              _socialRefreshTimer = null;
              return;
            }
            _lastSocialFetchTs = Date.now();
            socialFetchAndRender();
          }, 30000);
        }

        async function socialRefreshPresenceOnly() {
          if (!_socialMembers || _socialMembers.length === 0) return;
          try {
            if (window._presenceRdb && window._rtdbGet && window._rtdbRef) {
              const snap = await window._rtdbGet(window._rtdbRef(window._presenceRdb, "presence"));
              if (snap && snap.exists()) {
                const pres = snap.val() || {};
                _socialMembers.forEach((p) => {
                  const pid = p.playerId || p.id;
                  if (pid && pres[pid]) {
                    if (pres[pid].lastActive) p.lastActive = pres[pid].lastActive;
                    if (typeof pres[pid].online === "boolean") p.isOnline = pres[pid].online;
                  }
                });
              }
            }
          } catch (e) {}
          socialRenderList();
        }

        window.warmUpPlayerPhotos = function () {
          if (window._presenceRdb && window._rtdbGet && window._rtdbRef) {
            window._rtdbGet(window._rtdbRef(window._presenceRdb, "socialSummary"))
              .then((snap) => {
                if (snap && snap.exists()) {
                  const data = snap.val() || {};
                  if (!window._playerPhotoMap) window._playerPhotoMap = {};
                  if (!window._playerPhotoByNameMap) window._playerPhotoByNameMap = {};
                  let updated = false;
                  Object.keys(data).forEach((k) => {
                    const item = data[k];
                    if (item && item.photoURL) {
                      if (window._playerPhotoMap[k] !== item.photoURL) updated = true;
                      window._playerPhotoMap[k] = item.photoURL;
                      if (item.name) window._playerPhotoByNameMap[String(item.name).trim().toLowerCase()] = item.photoURL;
                    }
                  });
                  if (updated && window._renderGlobalSpinUI && window._lastGlobalSpinData) {
                    window._renderGlobalSpinUI(window._lastGlobalSpinData);
                  }
                }
              })
              .catch(() => {});
          }
        };

        function socialFetchAndRender() {
          if (window._presenceRdb && window._rtdbGet && window._rtdbRef) {
            window._rtdbGet(window._rtdbRef(window._presenceRdb, "socialSummary"))
              .then((snap) => {
                if (snap && snap.exists()) {
                  const data = snap.val() || {};
                  if (!window._playerPhotoMap) window._playerPhotoMap = {};
                  if (!window._playerPhotoByNameMap) window._playerPhotoByNameMap = {};
                  Object.keys(data).forEach((k) => {
                    const item = data[k];
                    if (item && item.photoURL) {
                      window._playerPhotoMap[k] = item.photoURL;
                      if (item.name) window._playerPhotoByNameMap[String(item.name).trim().toLowerCase()] = item.photoURL;
                    }
                  });
                  const list = Object.keys(data).map((k) => ({
                    id: k,
                    playerId: k,
                    ...data[k],
                  }));
                  if (list.length > 0) {
                    _socialMembers = list;
                    socialRenderList();
                    socialRefreshPresenceOnly();
                    return;
                  }
                }
                fallbackFirestoreSocialLoad();
              })
              .catch((e) => {
                console.warn("RTDB socialSummary fetch failed:", e);
                fallbackFirestoreSocialLoad();
              });
          } else {
            fallbackFirestoreSocialLoad();
          }
        }

        function fallbackFirestoreSocialLoad() {
          _waitForMod("__mod_adminLoadAllPlayers", async () => {
            try {
              _socialMembers = await window.adminLoadAllPlayers();
              // Backfill RTDB socialSummary from Firestore so future reads cost 0 Firestore ops
              if (window._presenceRdb && window._rtdbSet && window._rtdbRef && Array.isArray(_socialMembers)) {
                _socialMembers.forEach((p) => {
                  const pid = p.playerId || p.id;
                  if (pid) {
                    const summary = {
                      id: pid,
                      playerId: pid,
                      name: p.name || p.profile?.name || p.username || "Unknown",
                      avatar: p.avatar || p.profile?.avatar || "🧙",
                      photoURL: p.photoURL || p.profile?.photoURL || "",
                      coins: typeof p.coins === "number" ? p.coins : 0,
                      aura: typeof p.aura === "number" ? p.aura : 0,
                      cardsSent: typeof p.cardsSent === "number" ? p.cardsSent : 0,
                      isAdmin: p.isAdmin === true,
                      lastActive: p.lastActive || 0,
                      online: false,
                    };
                    window._rtdbSet(window._rtdbRef(window._presenceRdb, "socialSummary/" + pid), summary).catch(() => {});
                  }
                });
              }
            } catch (err) {}
            socialRenderList();
            socialRefreshPresenceOnly();
          });
        }

        function socialFormatLastSeen(ts) {
          if (!ts) return "Never";
          const diffMs = Date.now() - ts;
          if (diffMs < 60000) return "Just now";
          const mins = Math.floor(diffMs / 60000);
          if (mins < 60) return mins + "m ago";
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + "h ago";
          const days = Math.floor(hrs / 24);
          if (days < 7) return days + "d ago";
          return new Date(ts).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }

        function socialRenderList() {
          const listEl = document.getElementById("socialMemberList");
          const searchEl = document.getElementById("socialSearchInput");
          if (!listEl) return;
          const search = (searchEl ? searchEl.value : "").trim().toLowerCase();
          const myPid = window._currentPlayerId || "";

          const filtered = _socialMembers.filter((p) => {
            if (!search) return true;
            const name = (p.profile?.name || p.username || "").toLowerCase();
            return name.includes(search);
          });

          // Rank: Aura points first, then coins.
          const sorted = [...filtered].sort((a, b) => {
            const auraDiff = (b.aura || 0) - (a.aura || 0);
            if (auraDiff !== 0) return auraDiff;
            return (b.coins || 0) - (a.coins || 0);
          });

          const now = Date.now();
          const onlineCount = _socialMembers.filter(
            (p) => p.lastActive && now - p.lastActive < SOCIAL_ONLINE_MS,
          ).length;
          const totalEl = document.getElementById("socialTotalMembers");
          const onlineEl = document.getElementById("socialOnlineCount");
          if (totalEl) totalEl.textContent = _socialMembers.length;
          if (onlineEl) onlineEl.textContent = onlineCount;

          if (sorted.length === 0) {
            listEl.innerHTML = `<div class="social-empty"><div class="ce-icon">👥</div><p>${search ? "No members match your search." : "No members found yet."}</p></div>`;
            return;
          }

          listEl.innerHTML = "";
          sorted.forEach((p, i) => {
            const name = p.name || p.profile?.name || p.username || "Unknown";
            const avatar = p.avatar || p.profile?.avatar || "🧙";
            const photoURL = p.photoURL || p.profile?.photoURL || "";
            const pid = p.playerId || p.id || "";
            const pAura = typeof p.aura === "number" ? p.aura : 0;
            const pCoins = typeof p.coins === "number" ? p.coins : 0;
            const pCardsSent = typeof p.cardsSent === "number" ? p.cardsSent : 0;
            const isOnline = !!(
              p.isOnline !== false &&
              p.lastActive &&
              now - p.lastActive < SOCIAL_ONLINE_MS
            );
            const isMe = pid === myPid;
            const unameLower = (p.username || p.profile?.name || name || "").trim().toLowerCase();
            const isAuthAdmin = ["roomi", "naveen", "ron", "hogwarts"].includes(unameLower);
            const isAdmin =
              isAuthAdmin &&
              (p.isAdmin === true ||
                (isMe &&
                  (adminUnlocked ||
                    (typeof profile === "object" && profile && profile.isAdmin))));
            const rankIcon =
              i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1);

            const card = document.createElement("div");
            card.className = "social-member-card" + (isMe ? " is-me" : "") + (isAdmin ? " is-admin" : "");
            card.innerHTML = `
      <div class="social-rank-badge">${rankIcon}</div>
      <div class="social-member-av">${avatarHTML(avatar, photoURL, pid, name)}</div>
      <div class="social-member-mid">
        <div class="social-member-name">
          ${escapeHtml(name)}${isMe ? " (You)" : ""}
        </div>
        ${isAdmin ? '<div class="social-admin-badge-line"><span class="social-admin-badge">Admin</span></div>' : ""}
        <div class="social-member-status">
          <span class="ec-status-dot ${isOnline ? "on" : "off"}"></span>
          ${isOnline ? "Online now" : "Last seen " + socialFormatLastSeen(p.lastActive)}
        </div>
      </div>
      <div class="social-member-chips">
        ${isAdmin && pCardsSent > 0 ? `<span class="social-chip cards-sent" title="Cards sent by this admin">🎴 Sent: ${pCardsSent.toLocaleString()}</span>` : ""}
        <span class="social-chip aura">✨ Aura: ${pAura.toLocaleString()}</span>
        <span class="social-chip coins">🪙 ${pCoins.toLocaleString()}</span>
      </div>
    `;
            listEl.appendChild(card);
          });
        }

        // ─── MY COLLECTION ──────────────────────────────────────
        let collView = "cards"; // 'cards' | 'requests'

        function openCollection() {
          updateCollStats();
          refreshMyReqPill();
          if (collView === "cards") {
            renderCollTabs();
            renderCollGrid();
          } else {
            renderMyRequests();
          }
          const bc = document.getElementById("bn-coll");
          if (bc) bc.classList.remove("has-dot");
        }

        function setCollView(view, btnEl) {
          collView = view;
          document
            .querySelectorAll("#panel-coll > .coll-view-toggle .coll-view-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          document.getElementById("collCardsView").style.display =
            view === "cards" ? "" : "none";
          document.getElementById("collReqView").style.display =
            view === "requests" ? "" : "none";
          const shopViewEl = document.getElementById("collShopView");
          if (shopViewEl)
            shopViewEl.style.display = view === "shop" ? "" : "none";
          if (view === "requests") renderMyRequests();
          if (view === "cards") {
            renderCollTabs();
            renderCollGrid();
          }
          if (view === "shop") {
            renderShopGrid();
          }
        }

        function refreshMyReqPill() {
          const pid = window._currentPlayerId || "";
          const myReqs = cardRequests.filter(
            (r) =>
              isMyCardRequest(r) &&
              r.source !== "cds" &&
              (r.source === "jackpot" || r.source === "jumbled_jackpot" || !r.free),
          );
          const myJp = jackpotEntries.filter(
            (e) =>
              (e.playerId === pid || (!pid && e.playerName === profile.name)) &&
              !myReqs.some((r) => r.roundId === e.id || (r.id && r.id.startsWith(e.id + "-c"))),
          );
          const myShop = shopRequests.filter(
            (r) =>
              r.playerId === pid || (!pid && r.playerName === profile.name),
          );
          const pending =
            myReqs.filter((r) => r.status === "pending").length +
            myJp.filter((e) => e.status === "new").length +
            myShop.filter((r) => r.status === "pending").length;
          const pill = document.getElementById("myReqCountPill");
          if (pill) {
            if (pending > 0) {
              pill.textContent = pending;
              pill.style.display = "";
            } else {
              pill.style.display = "none";
            }
          }
        }

        function updateCollStats() {
          const total = Object.keys(ownedCards).filter(
            (k) => ownedCards[k] && ownedCards[k].owned,
          ).length;
          const collTotalEl = document.getElementById("collTotal");
          if (collTotalEl) collTotalEl.textContent = total;

          const pct = Math.min(100, Math.round((total / 150) * 100));
          const progressFill = document.getElementById("collProgressFill");
          if (progressFill) progressFill.style.width = pct + "%";
          const progressPct = document.getElementById("collProgressPct");
          if (progressPct) progressPct.textContent = pct + "%";

          const reqLeftEl = document.getElementById("collReqLeft");
          const reqTotalEl = document.getElementById("collReqTotal");
          if (reqLeftEl)
            reqLeftEl.textContent = Math.max(
              0,
              collDailyLimit() - collRequestsToday(),
            );
          if (reqTotalEl) reqTotalEl.textContent = collDailyLimit();

          // update tab badge
          const hasAnyNew = Object.values(ownedCards).some((v) => v && v.isNew);
          const collTab = document.getElementById("collTab");
          if (collTab)
            collTab.textContent = hasAnyNew
              ? "📚 My Collection 🔴"
              : "📚 My Collection";

          // update total duplicate count across collection
          let totalDupes = 0;
          Object.values(ownedCards).forEach((entry) => {
            if (entry && entry.owned && entry.dupes > 0) {
              totalDupes += entry.dupes;
            }
          });
          const totalDupesEl = document.getElementById("collTotalDupesVal");
          if (totalDupesEl) {
            totalDupesEl.textContent =
              totalDupes + (totalDupes === 1 ? " Dupe" : " Dupes");
          }
          const sellDupesPill = document.getElementById("collSellAllDupesPill");
          if (sellDupesPill) {
            sellDupesPill.style.opacity = totalDupes > 0 ? "1" : "0.75";
          }
        }

        // Marks every owned "new" card in a set as seen. Called whenever the
        // player actually opens/views that set in My Collection — not on
        // individual card taps — so the NEW badge & dots clear as soon as the
        // set is viewed rather than requiring a tap on each card.
        function clearNewForSet(setIdx) {
          const set = SETS[setIdx];
          if (!set) return false;
          let changed = false;
          set.cards.forEach((_, ci) => {
            const key = setIdx + "-" + ci;
            const entry = ownedCards[key];
            if (entry && entry.owned && entry.isNew) {
              entry.isNew = false;
              changed = true;
            }
          });
          if (changed) {
            saveProgress();
            updateCollStats();
          }
          return changed;
        }

        function renderCollTabs() {
          const tabs = document.getElementById("collSetTabs");
          if (!tabs) return;
          tabs.setAttribute("role", "tablist");
          tabs.setAttribute("aria-label", "Card Sets");
          tabs.innerHTML = "";
          SETS.forEach((set, i) => {
            const hasNew = set.cards.some((_, ci) => {
              const v = ownedCards[i + "-" + ci];
              return v && v.isNew;
            });
            const owned = set.cards.filter(
              (_, ci) =>
                ownedCards[i + "-" + ci] && ownedCards[i + "-" + ci].owned,
            ).length;
            const isAllDone = owned === set.cards.length;
            const badgeText = isAllDone ? `${owned}/${set.cards.length} ⭐` : `${owned}/${set.cards.length}`;
            const btn = document.createElement("button");
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", i === collSetIdx ? "true" : "false");
            btn.className =
              "coll-set-btn" +
              (i === collSetIdx ? " active" : "") +
              (hasNew ? " has-new" : "");
            btn.innerHTML = `${set.name.replace(/^Set \d+ – /, "")} <span class="coll-set-badge ${isAllDone ? "is-done" : ""}">${badgeText}</span><span class="new-dot"></span>`;
            btn.onclick = () => {
              if (collSetIdx !== i) clearNewForSet(collSetIdx); // clear the set we're leaving
              collSetIdx = i;
              renderCollTabs();
              renderCollGrid();
            };
            tabs.appendChild(btn);
          });
        }

        // ─── COLLECTION FRAGMENT CACHING & SELECTIVE HYDRATION ────
        // Pre-rendered HTML shells for SETS cards. Reused across tab switches
        // so static DOM art, emojis, numbers, and names are never destroyed and
        // re-created. Only personalized dynamic holes are hydrated in place.
        const _collFragmentCache = {};
        let _collGridDelegated = false;

        function _getCollSetFragmentHTML(setIdx) {
          if (_collFragmentCache[setIdx]) return _collFragmentCache[setIdx];
          const set = SETS[setIdx];
          if (!set || !Array.isArray(set.cards)) return "";
          const html = set.cards
            .map((card, ci) => {
              const isGold = !!card.gold;
              const starsCount = card.stars || (isGold ? 4 : (card.bonus > 1 ? 3 : 2));
              const starsStr = "⭐".repeat(starsCount);
              return `
            <div class="coll-card ${isGold ? "is-gold" : ""}" data-ci="${ci}">
              <span class="coll-card-num">#${String(ci + 1).padStart(2, "0")}</span>
              <div class="card-badge-hole"></div>
              <div class="coll-card-art-box">
                ${cardArtHTML(card, "coll-card-art-img", "coll-card-emoji")}
              </div>
              <div class="coll-card-name">${card.name}</div>
              <div class="coll-card-stars">${starsStr}</div>
              <div class="card-req-hole"></div>
            </div>
          `;
            })
            .join("");
          _collFragmentCache[setIdx] = html;
          return html;
        }

        function getPendingCardRequest(setIdx, cardIdx) {
          const sIdx = Number(setIdx);
          const cIdx = Number(cardIdx);
          const req = cardRequests.find(
            (r) =>
              Number(r.setIdx) === sIdx &&
              Number(r.cardIdx) === cIdx &&
              r.status === "pending" &&
              !r.adminCleared &&
              isMyCardRequest(r),
          );
          if (!req) return null;
          const isCds = req.source === "cds";
          const isJackpot = req.source === "jackpot";
          const isJumbledJackpot = req.source === "jumbled_jackpot";
          const isColl = !isCds && !isJackpot && !isJumbledJackpot;
          return { request: req, isCds, isJackpot, isJumbledJackpot, isColl };
        }

        function hydrateCollGridHoles(grid, setIdx) {
          const set = SETS[setIdx];
          if (!set || !Array.isArray(set.cards)) return;
          const pid = window._currentPlayerId || "";
          const cardEls = grid.querySelectorAll(".coll-card[data-ci]");

          for (let i = 0; i < cardEls.length; i++) {
            const div = cardEls[i];
            const ci = parseInt(div.dataset.ci, 10);
            if (isNaN(ci) || ci < 0 || ci >= set.cards.length) continue;
            const card = set.cards[ci];
            const key = setIdx + "-" + ci;
            const entry = ownedCards[key];
            const isOwned = !!(entry && entry.owned);
            const isNew = !!(entry && entry.isNew);
            const dupes = (entry && entry.dupes) || 0;
            const isGold = !!card.gold;
            const reqCost = isGold ? GOLD_REQUEST_COST : REQUEST_COST;

            const pendingReq = getPendingCardRequest(setIdx, ci);
            const alreadyRequested = !!pendingReq;

            div.classList.toggle("unlocked", isOwned);
            div.classList.toggle("locked", !isOwned);
            div.classList.toggle("is-new", isNew);
            div.classList.toggle("has-dupes", dupes > 0);
            div.classList.toggle("is-gold", isGold);
            div.classList.toggle("requested", alreadyRequested);

            const badgeHole = div.querySelector(".card-badge-hole");
            if (badgeHole) {
              if (isGold)
                badgeHole.innerHTML = '<div class="gold-badge">🌟 GOLD</div>';
              else if (isNew)
                badgeHole.innerHTML = '<div class="new-badge">NEW!</div>';
              else if (dupes > 0)
                badgeHole.innerHTML = `<div class="dupe-badge">x${dupes + 1}</div>`;
              else badgeHole.innerHTML = "";
            }

            const reqHole = div.querySelector(".card-req-hole");
            if (reqHole) {
              if (alreadyRequested) {
                const label =
                  pendingReq && pendingReq.isCds
                    ? "📬 Requested (CDS)"
                    : pendingReq && pendingReq.isJackpot
                      ? "🎯 Requested (Jackpot)"
                      : pendingReq && pendingReq.isJumbledJackpot
                        ? "🔀 Requested (Jumbled)"
                        : "📬 Requested";
                reqHole.innerHTML = `<div class="card-action-chip chip-pending">${label}</div>`;
              } else if (isOwned) {
                reqHole.innerHTML = dupes > 0
                  ? '<div class="card-action-chip chip-owned">Tradeable</div>'
                  : '<div class="card-action-chip chip-owned">✅ In Deck</div>';
              } else {
                reqHole.innerHTML = `<div class="card-action-chip chip-req">🪙 ${reqCost} Request</div>`;
              }
            }

            const nameEl = div.querySelector(".coll-card-name");
            if (nameEl) {
              nameEl.style.color =
                isGold || isOwned ? "" : "rgba(255,255,255,.55)";
            }

            div.title = isOwned
              ? "Tap for card actions"
              : `Tap to request this card • ${reqCost} 🪙`;
          }
        }

        function renderCollGrid() {
          const grid = document.getElementById("collGrid");
          if (!grid) return;

          if (!_collGridDelegated) {
            grid.addEventListener("click", (e) => {
              const card = e.target.closest(".coll-card[data-ci]");
              if (!card) return;
              const ci = parseInt(card.dataset.ci, 10);
              if (!isNaN(ci)) openCardActionModal(collSetIdx, ci);
            });
            _collGridDelegated = true;
          }

          const activeKey = String(collSetIdx);
          if (grid.dataset.renderedSet !== activeKey) {
            grid.innerHTML = _getCollSetFragmentHTML(collSetIdx);
            grid.dataset.renderedSet = activeKey;
          }

          hydrateCollGridHoles(grid, collSetIdx);
        }

        // ─── SHOP — special coin-purchase items (separate from the 150-card SETS) ──
        // Shop items are bought directly with coins (no DA-leader approval needed)
        // and are tracked in their own `ownedShopItems` map so they never affect
        // the 150-card collection totals, gold-card math, or any mini-game logic
        // that reads from SETS.
        const SHOP_ITEMS = [
          {
            id: "bloom_and_buzz",
            name: "Bloom and Buzz",
            emoji: "🌸🐝",
            image: "images/bloom_and_buzz.webp",
            prices: [1500, 3000, 4500, 6000],
            limit: 4,
            desc: "Book a slot for bloom and buxz event.",
          },
          {
            id: "frozen_fortune",
            name: "Frozen Fortune",
            emoji: "❄️⚓",
            image: "images/frozen_fortune.webp",
            prices: [2000, 4000, 6000],
            limit: 3,
            desc: "Book a slot for the frozen fortune event.",
          },
        ];

        // Purchase price rises with every purchase (see `prices` above, indexed by
        // how many times bought in the current cycle) and the tier count resets to
        // fresh after SHOP_CYCLE_DAYS days have passed since the FIRST purchase of
        // that cycle. This only affects pricing/tier tracking — it does NOT touch
        // `count` (booked-but-not-yet-delivered slots), which is only ever changed
        // by a purchase (+1) or an admin delivering it (-1).
        const SHOP_CYCLE_DAYS = 10;
        const SHOP_CYCLE_MS = SHOP_CYCLE_DAYS * 24 * 60 * 60 * 1000;

        // Resolves the *effective* purchase-cycle state for an item, auto-expiring
        // a stale cycle (>= SHOP_CYCLE_DAYS old) without mutating stored state.
        function shopItemCycleState(itemId) {
          const entry = ownedShopItems[itemId] || {};
          let purchaseCount = entry.purchaseCount || 0;
          let cycleStartAt = entry.cycleStartAt || null;
          if (cycleStartAt) {
            const elapsed = Date.now() - new Date(cycleStartAt).getTime();
            if (elapsed >= SHOP_CYCLE_MS) {
              purchaseCount = 0;
              cycleStartAt = null;
            }
          }
          return { purchaseCount, cycleStartAt, bookedCount: entry.count || 0 };
        }

        function shopCycleResetLabel(cycleStartAt) {
          if (!cycleStartAt) return "";
          const resetDate = new Date(
            new Date(cycleStartAt).getTime() + SHOP_CYCLE_MS,
          );
          return resetDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        }

        function renderShopGrid() {
          const grid = document.getElementById("collShopGrid");
          if (!grid) return;
          grid.innerHTML = "";
          SHOP_ITEMS.forEach((item) => {
            const state = shopItemCycleState(item.id);
            const booked = state.bookedCount > 0;
            const atLimit = state.purchaseCount >= item.limit;
            const nextPrice = atLimit ? null : item.prices[state.purchaseCount];
            const canAfford = !atLimit && coins >= nextPrice;
            const resetLabel = atLimit
              ? shopCycleResetLabel(state.cycleStartAt)
              : "";

            const div = document.createElement("div");
            div.className = "shop-card" + (booked ? " owned" : "");
            div.innerHTML = `
      ${booked ? `<div class="gold-badge">✅ Booked ${state.bookedCount}</div>` : ""}
      <div class="shop-card-img-wrap">
        <img class="shop-card-img" src="${item.image}" alt="${item.name}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <div class="shop-card-emoji-fallback" style="display:none">${item.emoji}</div>
      </div>
      <div class="shop-card-name">${item.name}</div>
      <div class="shop-card-desc">${item.desc}</div>
      <div class="shop-card-tier${atLimit ? " limit-reached" : ""}">
        ${atLimit ? `🔒 Limit reached${resetLabel ? " • resets " + resetLabel : ""}` : `Purchase ${state.purchaseCount + 1} of ${item.limit}`}
      </div>
      <button class="shop-card-btn" ${!atLimit && canAfford ? "" : "disabled"}>
        ${atLimit ? "🔒 Limit Reached" : `🪙 ${nextPrice}${booked ? " • Book Another" : ""}`}
      </button>
    `;
            div
              .querySelector(".shop-card-btn")
              .addEventListener("click", (e) => {
                e.stopPropagation();
                buyShopItem(item.id);
              });
            if (atLimit) {
              div.title = `Limit of ${item.limit} reached for this 10-day cycle${resetLabel ? " — resets " + resetLabel : ""}.`;
            } else if (!canAfford) {
              div.title = `You need ${nextPrice} 🪙 — you have ${coins} 🪙`;
            }
            grid.appendChild(div);
          });
        }

        function buyShopItem(itemId) {
          if (typeof ecIsActive === "function" && !ecIsActive("shop")) {
            showToast("🔒 The Shop is currently paused by your DA leader.");
            return;
          }
          const item = SHOP_ITEMS.find((i) => i.id === itemId);
          if (!item) return;
          const state = shopItemCycleState(itemId);

          if (state.purchaseCount >= item.limit) {
            const resetLabel = shopCycleResetLabel(state.cycleStartAt);
            showToast(
              `🚫 You've reached the limit of ${item.limit} for ${item.name} this cycle.${resetLabel ? " Resets " + resetLabel + "." : ""}`,
            );
            return;
          }

          const price = item.prices[state.purchaseCount];
          if (coins < price) {
            showToast(`🪙 Not enough coins! You need ${price} 🪙.`);
            return;
          }
          if (!profile.name || !profile.town) {
            showToast("⚡ Please set your profile name & town first!");
            setTimeout(
              () =>
                switchTab("profile", document.querySelectorAll(".tab-btn")[5]),
              600,
            );
            return;
          }
          coins -= price;
          logCoinTx(-price, `🛒 Purchased ${item.name}`);
          if (typeof spawnScorePop === "function")
            spawnScorePop(null, "-" + price + " 🪙");
          const newBookedCount = state.bookedCount + 1;
          const newPurchaseCount = state.purchaseCount + 1;
          const newCycleStartAt =
            state.cycleStartAt || new Date().toISOString();
          ownedShopItems[itemId] = {
            owned: true,
            count: newBookedCount,
            purchasedAt: new Date().toISOString(),
            purchaseCount: newPurchaseCount,
            cycleStartAt: newCycleStartAt,
          };

          const shopReq = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            playerName: profile.name,
            townName: profile.town,
            avatar: profile.avatar,
            photoURL: _lightPhoto(profile.photoURL),
            playerId: window._currentPlayerId || "",
            itemId: item.id,
            itemName: item.name,
            slotNumber: newBookedCount,
            cost: price,
            status: "pending",
            timestamp: new Date().toISOString(),
          };
          shopRequests.unshift(shopReq);
          window.saveShopRequests();

          SFX.coin && SFX.coin();
          updateHUD();
          renderShopGrid();
          refreshMyReqPill();
          showToast(
            `🎉 Booked ${item.name} #${newBookedCount}! Your DA leader has been notified to deliver it in-game.`,
          );
        }

        // ─── CDS — Card Distribution Hub (free daily card requests) ──
        // Every player can request up to CDS_FREE_LIMIT cards per day, at zero
        // coin cost (CDS_FREE_LIMIT_SUNDAY on Sundays). Up to CDS_GOLD_FREE_LIMIT
        // of those free requests per day may be spent on gold cards. Requests are
        // pushed into the SAME shared `cardRequests` array/Firestore doc used by
        // Collection requests (tagged `free:true`, `coinsSpent:0`) so the DA
        // leader sees & fulfils them exactly the same way. The daily count is
        // derived from that shared array (filtered by player + today's date)
        // rather than localStorage, so it stays correct across devices.
        const CDS_FREE_LIMIT = 5;
        const CDS_FREE_LIMIT_SUNDAY = 7;
        const CDS_GOLD_FREE_LIMIT = 2;
        let cdsSetIdx = 0;
        let cdsView = "browse"; // 'browse' | 'requests'

        // Sundays get a bigger free-request pool.
        function cdsCurrentFreeLimit() {
          return new Date().getDay() === 0
            ? CDS_FREE_LIMIT_SUNDAY
            : CDS_FREE_LIMIT;
        }

        function cdsFreeRequestsToday() {
          const today = todayStr();
          const seen = new Set();
          let count = 0;
          const check = (r) => {
            if (!r || !r.id || seen.has(r.id)) return;
            if (
              (r.source === "cds" || (!!r.free && r.source !== "jackpot" && r.source !== "jumbled_jackpot")) &&
              r.timestamp &&
              localDateKey(new Date(r.timestamp)) === today &&
              isMyCardRequest(r) &&
              r.status !== "declined"
            ) {
              seen.add(r.id);
              count++;
            }
          };
          cardRequests.forEach(check);
          archivedRequests.forEach(check);
          return count;
        }

        // How many of today's free requests were spent on gold cards.
        function cdsGoldFreeRequestsToday() {
          const today = todayStr();
          const seen = new Set();
          let count = 0;
          const check = (r) => {
            if (!r || !r.id || seen.has(r.id)) return;
            if (
              (r.source === "cds" || (!!r.free && r.source !== "jackpot" && r.source !== "jumbled_jackpot")) &&
              r.gold &&
              r.timestamp &&
              localDateKey(new Date(r.timestamp)) === today &&
              isMyCardRequest(r) &&
              r.status !== "declined"
            ) {
              seen.add(r.id);
              count++;
            }
          };
          cardRequests.forEach(check);
          archivedRequests.forEach(check);
          return count;
        }

        function updateCdsFreeCounter() {
          const el = document.getElementById("cdsFreeLeft");
          const totalEl = document.getElementById("cdsFreeTotal");
          const goldEl = document.getElementById("cdsGoldFreeLeft");
          const limit = cdsCurrentFreeLimit();
          if (el) el.textContent = Math.max(0, limit - cdsFreeRequestsToday());
          if (totalEl) totalEl.textContent = limit;
          if (goldEl)
            goldEl.textContent = Math.max(
              0,
              CDS_GOLD_FREE_LIMIT - cdsGoldFreeRequestsToday(),
            );
        }

        function openCds() {
          refreshCdsReqPill();
          if (cdsView === "requests") {
            renderMyCdsRequests();
          } else {
            renderCdsTabs();
            renderCdsGrid();
            updateCdsFreeCounter();
          }
        }

        function setCdsView(view, btnEl) {
          cdsView = view;
          document
            .querySelectorAll("#panel-cds .coll-view-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          document.getElementById("cdsBrowseView").style.display =
            view === "browse" ? "" : "none";
          document.getElementById("cdsReqView").style.display =
            view === "requests" ? "" : "none";
          if (view === "requests") {
            renderMyCdsRequests();
          } else {
            renderCdsTabs();
            renderCdsGrid();
            updateCdsFreeCounter();
          }
        }

        // Requests placed through CDS are tagged source:'cds' (older ones fall back
        // to the `free` flag, since only CDS requests were ever free).
        function cdsMyRequests() {
          const filter = (r) =>
            !r._hidden &&
            (r.source ? r.source === "cds" : !!r.free) &&
            isMyCardRequest(r);
          // Combine live + archived, deduped by id
          const live = cardRequests.filter(filter);
          const liveIds = new Set(live.map((r) => r.id));
          const archived = archivedRequests.filter((r) => filter(r) && !liveIds.has(r.id));
          return live.concat(archived);
        }

        function refreshCdsReqPill() {
          const pending = cdsMyRequests().filter(
            (r) => r.status === "pending",
          ).length;
          const pill = document.getElementById("cdsReqCountPill");
          if (pill) {
            if (pending > 0) {
              pill.textContent = pending;
              pill.style.display = "";
            } else {
              pill.style.display = "none";
            }
          }
        }

        function renderMyCdsRequests() {
          const listEl = document.getElementById("cdsReqList");
          if (!listEl) return;
          const toolbar = document.getElementById("cdsReqToolbar");
          const clearBtn = document.getElementById("cdsClearReceivedBtn");
          let mine = cdsMyRequests();
          mine = mine.filter(
            (r) => !isMyReqStale(r.timestamp, r.status === "pending"),
          );

          if (mine.length === 0) {
            if (toolbar) toolbar.style.display = "none";
            listEl.innerHTML = `
      <div class="my-req-empty">
        <div class="mre-icon">📭</div>
        <h3>No CDS Requests Yet</h3>
        <p>Tap <strong>🎁 Browse</strong> above and pick any card to send a free daily request to your DA leader!</p>
      </div>`;
            refreshCdsReqPill();
            return;
          }

          const hasReceived = mine.some((r) => r.status === "done");
          if (toolbar) {
            toolbar.style.display = "flex";
            if (clearBtn) {
              clearBtn.disabled = !hasReceived;
              clearBtn.title = hasReceived
                ? "Remove all received cards from this list"
                : "No received cards to clear";
            }
          }

          const sorted = mine.slice().sort((a, b) => {
            const aPending = a.status === "pending";
            const bPending = b.status === "pending";
            if (aPending !== bPending) return aPending ? -1 : 1;
            return (
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });

          listEl.innerHTML = "";
          sorted.forEach((req) =>
            listEl.appendChild(buildMyCardRequestEl(req)),
          );
          refreshCdsReqPill();
        }

        function renderCdsTabs() {
          const tabs = document.getElementById("cdsSetTabs");
          if (!tabs) return;
          tabs.setAttribute("role", "tablist");
          tabs.setAttribute("aria-label", "CDS Sets");
          tabs.innerHTML = "";
          SETS.forEach((set, i) => {
            const owned = set.cards.filter(
              (_, ci) => ownedCards[i + "-" + ci] && ownedCards[i + "-" + ci].owned,
            ).length;
            const isAllDone = owned === set.cards.length;
            const badgeText = isAllDone ? `${owned}/${set.cards.length} ⭐` : `${owned}/${set.cards.length}`;
            const btn = document.createElement("button");
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", i === cdsSetIdx ? "true" : "false");
            btn.className = "coll-set-btn" + (i === cdsSetIdx ? " active" : "");
            btn.innerHTML = `${set.name.replace(/^Set \d+ – /, "")} <span class="coll-set-badge ${isAllDone ? "is-done" : ""}">${badgeText}</span>`;
            btn.onclick = () => {
              cdsSetIdx = i;
              renderCdsTabs();
              renderCdsGrid();
            };
            tabs.appendChild(btn);
          });
        }

        // ─── CDS FRAGMENT CACHING & SELECTIVE HYDRATION ─────────
        const _cdsFragmentCache = {};
        let _cdsGridDelegated = false;

        function _getCdsSetFragmentHTML(setIdx) {
          if (_cdsFragmentCache[setIdx]) return _cdsFragmentCache[setIdx];
          const set = SETS[setIdx];
          if (!set || !Array.isArray(set.cards)) return "";
          const html = set.cards
            .map((card, ci) => {
              const isGold = !!card.gold;
              const starsCount = card.stars || (isGold ? 4 : (card.bonus > 1 ? 3 : 2));
              const starsStr = "⭐".repeat(starsCount);
              return `
            <div class="coll-card ${isGold ? "is-gold" : ""}" data-ci="${ci}">
              <span class="coll-card-num">#${String(ci + 1).padStart(2, "0")}</span>
              <div class="card-badge-hole">${isGold ? '<div class="gold-badge">🌟 GOLD</div>' : ""}</div>
              <div class="coll-card-art-box">
                ${cardArtHTML(card, "coll-card-art-img", "coll-card-emoji")}
              </div>
              <div class="coll-card-name">${card.name}</div>
              <div class="coll-card-stars">${starsStr}</div>
              <div class="card-req-hole"></div>
            </div>
          `;
            })
            .join("");
          _cdsFragmentCache[setIdx] = html;
          return html;
        }

        function hydrateCdsGridHoles(grid, setIdx) {
          const set = SETS[setIdx];
          if (!set || !Array.isArray(set.cards)) return;
          const pid = window._currentPlayerId || "";
          const goldUsedToday = cdsGoldFreeRequestsToday();
          const goldLimitReached = goldUsedToday >= CDS_GOLD_FREE_LIMIT;
          const cardEls = grid.querySelectorAll(".coll-card[data-ci]");

          for (let i = 0; i < cardEls.length; i++) {
            const div = cardEls[i];
            const ci = parseInt(div.dataset.ci, 10);
            if (isNaN(ci) || ci < 0 || ci >= set.cards.length) continue;
            const card = set.cards[ci];
            const key = setIdx + "-" + ci;
            const entry = ownedCards[key];
            const isOwned = !!(entry && entry.owned);
            const isGold = !!card.gold;

            const pendingReq = getPendingCardRequest(setIdx, ci);
            const isRequested = !!pendingReq;

            div.classList.toggle("unlocked", isOwned);
            div.classList.toggle("locked", !isOwned);
            div.classList.toggle("requested", isRequested);
            div.classList.toggle("is-gold", isGold);

            const badgeHole = div.querySelector(".card-badge-hole");
            if (badgeHole) {
              badgeHole.innerHTML = isGold
                ? '<div class="gold-badge">🌟 GOLD</div>'
                : "";
            }

            const reqHole = div.querySelector(".card-req-hole");
            if (reqHole) {
              if (isRequested) {
                const label =
                  pendingReq && pendingReq.isColl
                    ? "📬 Requested (Coll)"
                    : "📬 Requested";
                reqHole.innerHTML = `<div class="card-action-chip chip-pending">${label}</div>`;
              } else if (isGold) {
                const remaining = Math.max(
                  0,
                  CDS_GOLD_FREE_LIMIT - goldUsedToday,
                );
                reqHole.innerHTML = `<div class="card-action-chip chip-req">🌟 ${remaining}/${CDS_GOLD_FREE_LIMIT} Gold</div>`;
              } else if (isOwned) {
                reqHole.innerHTML =
                  '<div class="card-action-chip chip-owned">✅ In Deck</div>';
              } else {
                reqHole.innerHTML =
                  '<div class="card-action-chip chip-free">🎁 Request Free</div>';
              }
            }

            div.title = isRequested
              ? pendingReq && pendingReq.isColl
                ? "Requested via Collection • Tap to cancel and refund coins"
                : "Tap to cancel this request"
              : isGold
                ? goldLimitReached
                  ? `🌟 You've used your ${CDS_GOLD_FREE_LIMIT} free gold requests today.`
                  : `🌟 Gold card — counts toward both your free limit and your ${CDS_GOLD_FREE_LIMIT}-per-day gold limit.`
                : "Tap to request this card free";
          }
        }

        function renderCdsGrid() {
          const grid = document.getElementById("cdsGrid");
          if (!grid) return;

          if (!_cdsGridDelegated) {
            grid.addEventListener("click", (e) => {
              const card = e.target.closest(".coll-card[data-ci]");
              if (!card) return;
              const ci = parseInt(card.dataset.ci, 10);
              if (isNaN(ci)) return;
              const set = SETS[cdsSetIdx];
              if (!set || !set.cards[ci]) return;
              const isGold = !!set.cards[ci].gold;

              const pendingReq = getPendingCardRequest(cdsSetIdx, ci);

              // If requested via Collection, prompt to cancel with refund
              if (pendingReq && pendingReq.isColl) {
                openDeleteRequest(pendingReq.request.id);
                return;
              }

              const isPendingCds = pendingReq && pendingReq.isCds;
              const goldUsedToday = cdsGoldFreeRequestsToday();
              const goldLimitReached =
                isGold && goldUsedToday >= CDS_GOLD_FREE_LIMIT;

              if (isGold && goldLimitReached && !isPendingCds) {
                showToast(
                  `🌟 You've already used your ${CDS_GOLD_FREE_LIMIT} free gold-card requests today!`,
                );
                return;
              }
              cdsToggleRequest(cdsSetIdx, ci);
            });
            _cdsGridDelegated = true;
          }

          const activeKey = String(cdsSetIdx);
          if (grid.dataset.renderedSet !== activeKey) {
            grid.innerHTML = _getCdsSetFragmentHTML(cdsSetIdx);
            grid.dataset.renderedSet = activeKey;
          }

          hydrateCdsGridHoles(grid, cdsSetIdx);
        }

        // Tapping a card in the CDS browse grid directly places (or cancels) a free
        // request — no confirmation modal. Tapping an already-requested card cancels
        // it, so players are free to change their selection at any time before the
        // DA leader reviews it.
        function cdsToggleRequest(setIdx, cardIdx) {
          if (window._isSubmittingCdsReq) return;
          if (typeof ecIsActive === "function" && !ecIsActive("cds")) {
            showToast("🔒 CDS is currently paused by your DA leader.");
            return;
          }
          if (!profile.name || !profile.town) {
            showToast("⚡ Please set your profile name & town first!");
            setTimeout(
              () =>
                switchTabNav("profile", document.getElementById("bn-profile")),
              600,
            );
            return;
          }

          const set = SETS[setIdx];
          const card = set && set.cards && set.cards[cardIdx];
          if (!set || !card) return;

          window._isSubmittingCdsReq = true;
          const guardTimer = setTimeout(() => {
            window._isSubmittingCdsReq = false;
          }, 10000);

          const isGold = !!card.gold;
          const pid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";

          const pendingReq = getPendingCardRequest(setIdx, cardIdx);

          if (pendingReq && pendingReq.isColl) {
            clearTimeout(guardTimer);
            window._isSubmittingCdsReq = false;
            showToast(
              "📬 You already have a pending request for this card in Collection!",
            );
            return;
          }

          const existingIdx = pendingReq
            ? cardRequests.findIndex((r) => r.id === pendingReq.request.id)
            : -1;

          if (existingIdx !== -1) {
            // Already selected — tapping again deselects & cancels the request.
            const existingReq = cardRequests[existingIdx];
            if (window._dismissReqIds && existingReq && existingReq.id) {
              window._dismissReqIds([existingReq.id]);
            }
            cardRequests.splice(existingIdx, 1);
            saveProgress();
            SFX.notify && SFX.notify();
            showToast(`↩️ Cancelled request for ${card.emoji} ${card.name}.`);
            if (window._scheduleUIRefresh) window._scheduleUIRefresh();

            const cancelPromise = (window.deleteSharedCardRequest && existingReq.id)
              ? window.deleteSharedCardRequest(existingReq.id)
              : window.saveSharedRequests();

            cancelPromise.then((ok) => {
              if (ok === false) {
                // Re-insert only this cancelled request if sync failed
                const stillAbsent = !cardRequests.some((r) => r.id === existingReq.id);
                if (stillAbsent) {
                  cardRequests.unshift(existingReq);
                  saveProgress();
                  if (window._scheduleUIRefresh) window._scheduleUIRefresh();
                  showToast("⚠️ Could not cancel request on server.");
                }
              }
            }).finally(() => {
              clearTimeout(guardTimer);
              window._isSubmittingCdsReq = false;
            });
            return;
          }

          const limit = cdsCurrentFreeLimit();
          if (cdsFreeRequestsToday() >= limit) {
            clearTimeout(guardTimer);
            window._isSubmittingCdsReq = false;
            showToast(`🚫 You've used all ${limit} free requests today!`);
            return;
          }
          if (isGold && cdsGoldFreeRequestsToday() >= CDS_GOLD_FREE_LIMIT) {
            clearTimeout(guardTimer);
            window._isSubmittingCdsReq = false;
            showToast(
              `🌟 You've used all ${CDS_GOLD_FREE_LIMIT} free gold-card requests today!`,
            );
            return;
          }

          const req = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            playerName: profile.name,
            townName: profile.town,
            avatar: profile.avatar,
            photoURL: _lightPhoto(profile.photoURL),
            playerId: pid,
            setIdx,
            cardIdx,
            note: "",
            status: "pending",
            coinsSpent: 0,
            free: true,
            gold: isGold,
            source: "cds",
            timestamp: new Date().toISOString(),
            _inFlight: true,
            _clientCreatedAt: Date.now(),
          };
          cardRequests.unshift(req);
          if (window._cardReqKnownIds) window._cardReqKnownIds.add(req.id);
          saveProgress();
          SFX.notify && SFX.notify();
          showToast(`🎁 Requested ${card.emoji} ${card.name}!`);

          if (window._scheduleUIRefresh) window._scheduleUIRefresh();

          (window.addSharedCardRequest ? window.addSharedCardRequest(req) : window.saveSharedRequests()).then((ok) => {
            req._inFlight = false;
            if (ok === false) {
              // Only remove this specific request if server sync failed after all retries
              const idx = cardRequests.findIndex((r) => r.id === req.id);
              if (idx !== -1) {
                cardRequests.splice(idx, 1);
                saveProgress();
                if (window._scheduleUIRefresh) window._scheduleUIRefresh();
                showToast("⚠️ Card request failed to sync.");
              }
            }
          }).finally(() => {
            clearTimeout(guardTimer);
            window._isSubmittingCdsReq = false;
          });
        }
        window.cdsToggleRequest = cdsToggleRequest;

        // Notify collection tab when a new card is earned
        function notifyNewCard() {
          saveProgress();
          updateCollStats();
          refreshMyReqPill();
          const bc = document.getElementById("bn-coll");
          if (bc) bc.classList.add("has-dot");
        }

        // ─── DUPLICATE CARDS ───────────────────────────────────

        // ─── GOLD CARDS ─────────────────────────────────────────
        // Certain rare cards are flagged `gold:true` in SETS and cost more to request.

        // Daily cap on card requests sent from the normal "My Collection" panel
        // (source:'collection'). This is separate from the CDS free-request pool
        // and does NOT affect CDS in any way.
        // Admin-configurable via Event Controls → Collection Requests. Falls back to
        // 15 (or cached admin setting) if ecControls hasn't loaded yet or no override has ever been saved.
        function collDailyLimit() {
          let v = NaN;
          if (typeof ecControls !== "undefined" && ecControls && Number.isFinite(parseInt(ecControls.collDailyLimit, 10))) {
            v = parseInt(ecControls.collDailyLimit, 10);
          }
          if (!Number.isFinite(v) || v <= 0) {
            try {
              const cached = localStorage.getItem("da_ec_controls");
              if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && Number.isFinite(parseInt(parsed.collDailyLimit, 10))) {
                  v = parseInt(parsed.collDailyLimit, 10);
                }
              }
            } catch (e) {}
          }
          return Number.isFinite(v) && v > 0 ? v : 15;
        }
        function collRequestsToday() {
          const today = todayStr();
          const seen = new Set();
          let count = 0;
          const check = (r) => {
            if (!r || !r.id || seen.has(r.id)) return;
            if (
              (r.source === "collection" || (!r.free && r.source !== "cds" && r.source !== "jackpot" && r.source !== "jumbled_jackpot")) &&
              r.timestamp &&
              localDateKey(new Date(r.timestamp)) === today &&
              isMyCardRequest(r) &&
              r.status !== "declined"
            ) {
              seen.add(r.id);
              count++;
            }
          };
          cardRequests.forEach(check);
          archivedRequests.forEach(check);
          return count;
        }

        // Award a card by set/card index. If the player already owns it, the new
        // copy becomes a sellable duplicate instead of being wasted.
        window.awardCardOrDuplicate = function (setIdx, cardIdx) {
          const key = setIdx + "-" + cardIdx;
          if (ownedCards[key] && ownedCards[key].owned) {
            ownedCards[key].dupes = (ownedCards[key].dupes || 0) + 1;
            notifyNewCard();
            if (collSetIdx === setIdx) renderCollGrid();
            return "duplicate";
          }
          ownedCards[key] = { owned: true, isNew: true, dupes: 0 };
          notifyNewCard();
          return "new";
        };

        function sellDuplicateCard(setIdx, cardIdx, evt) {
          if (evt) evt.stopPropagation();
          const key = setIdx + "-" + cardIdx;
          const entry = ownedCards[key];
          if (!entry || !entry.dupes) return;
          entry.dupes -= 1;
          coins += DUPE_SELL_PRICE;
          logCoinTx(DUPE_SELL_PRICE, "🎴 Sold a duplicate card");
          SFX.coin && SFX.coin();
          updateHUD();
          renderCollGrid();
          updateCollStats();
        }

        function sellAllDuplicateCards() {
          let totalDupes = 0;
          Object.values(ownedCards).forEach((entry) => {
            if (entry && entry.owned && entry.dupes > 0) {
              totalDupes += entry.dupes;
            }
          });

          if (totalDupes <= 0) {
            showToast("ℹ️ You don't have any extra duplicate cards to sell!");
            return;
          }

          const totalPayout = totalDupes * DUPE_SELL_PRICE;
          const msg = `Sell all ${totalDupes} duplicate card${totalDupes > 1 ? "s" : ""} for ${totalPayout} 🪙?\n\n(You will still keep 1 copy of each card in your deck).`;
          if (!confirm(msg)) return;

          Object.values(ownedCards).forEach((entry) => {
            if (entry && entry.owned && entry.dupes > 0) {
              entry.dupes = 0;
            }
          });

          coins += totalPayout;
          logCoinTx(
            totalPayout,
            `🎴 Sold ${totalDupes} duplicate card${totalDupes > 1 ? "s" : ""}`,
          );
          SFX.coin && SFX.coin();
          updateHUD();
          renderCollGrid();
          updateCollStats();
          saveProgress();
          showToast(
            `💰 Sold ${totalDupes} duplicate card${totalDupes > 1 ? "s" : ""} for +${totalPayout} 🪙! 🎉`,
          );
        }
        window.sellAllDuplicateCards = sellAllDuplicateCards;

        // ─── MY REQUESTS (collection sub-view) ───────────────────
        let pendingEditReqId = null;
        let pendingDeleteReqId = null;
        let pendingDeleteJpId = null;
        let pendingDeleteShopId = null;
        let pendingEditJpId = null;
        let editJpSelectedCards = []; // [{setIdx, cardIdx}] — used by the "Change Your Cards" overlay

        // Resolved (non-pending) requests/entries older than this are hidden from
        // the player's "My Requests" section automatically. This only affects what
        // is rendered here — it does NOT delete the underlying shared Firestore
        // data, so admin history/logs (and clearDoneRequests) are unaffected.
        const MY_REQ_AUTO_HIDE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

        function isMyReqStale(ts, isPending) {
          if (isPending) return false;
          const t = new Date(ts).getTime();
          if (isNaN(t)) return false;
          return Date.now() - t > MY_REQ_AUTO_HIDE_MS;
        }

        function renderMyRequests() {
          const listEl = document.getElementById("myReqList");
          if (!listEl) return;
          const toolbar = document.getElementById("collReqToolbar");
          const clearBtn = document.getElementById("collClearReceivedBtn");
          const pid =
            window._currentPlayerId ||
            (typeof profile === "object" && profile && profile.playerId) ||
            "";
          const name =
            typeof profile === "object" && profile && profile.name
              ? String(profile.name).trim()
              : "";
          const { inferiorRoundIds } = typeof getJackpotRoundRanking === "function" ? getJackpotRoundRanking() : { inferiorRoundIds: new Set() };
          // Filter to this player's card requests (excluding CDS requests)
          const collFilter = (r) => {
            if (r._hidden || !isMyCardRequest(r) || r.source === "cds") return false;
            if (r.source === "jackpot" || r.source === "jumbled_jackpot") {
              const rId = r.roundId || (r.id && r.id.replace(/-c\d+$/, ""));
              if (rId && inferiorRoundIds.has(rId)) return false;
              return true;
            }
            return !r.free;
          };
          let mine = cardRequests.filter(collFilter);
          // Merge in archived card requests (admin cleared) that aren't already
          // present in the live array
          const liveCardIds = new Set(mine.map((r) => r.id));
          const archivedCards = archivedRequests.filter(
            (r) => collFilter(r) && !liveCardIds.has(r.id),
          );
          mine = mine.concat(archivedCards);
          // Filter to this player's Jackpot Event submissions that do not already have individual card requests in mine
          let mineJp = jackpotEntries.filter(
            (e) =>
              ((pid && e.playerId === pid) || (!pid && e.playerName === name)) &&
              !inferiorRoundIds.has(e.id) &&
              !mine.some((r) => r.roundId === e.id || (r.id && r.id.startsWith(e.id + "-c"))),
          );
          // Filter to this player's Shop purchases
          const shopFilter = (r) =>
            !r._hidden &&
            ((pid && r.playerId === pid) || (!pid && r.playerName === name));
          let mineShop = shopRequests.filter(shopFilter);
          // Merge in archived shop requests
          const liveShopIds = new Set(mineShop.map((r) => r.id));
          const archivedShops = archivedShopRequests.filter(
            (r) => shopFilter(r) && !liveShopIds.has(r.id),
          );
          mineShop = mineShop.concat(archivedShops);

          // Auto-hide requests/entries that have been resolved (done/declined/reviewed)
          // for more than 3 days — keeps "My Requests" from piling up with old items.
          mine = mine.filter(
            (r) => !isMyReqStale(r.timestamp, r.status === "pending"),
          );
          mineJp = mineJp.filter(
            (e) => !isMyReqStale(e.timestamp, e.status === "new"),
          );
          mineShop = mineShop.filter(
            (r) => !isMyReqStale(r.timestamp, r.status === "pending"),
          );

          if (
            mine.length === 0 &&
            mineJp.length === 0 &&
            mineShop.length === 0
          ) {
            if (toolbar) toolbar.style.display = "none";
            listEl.innerHTML = `
      <div class="my-req-empty">
        <div class="mre-icon">📭</div>
        <h3>No Requests Yet</h3>
        <p>Go to your collection, hover a card, and tap <strong>📬 Request</strong> — or play the <strong>🎯 Jackpot Event</strong>, or shop the <strong>🛍️ Shop</strong> — to send something to your DA leader!</p>
      </div>`;
            refreshMyReqPill();
            return;
          }

          const hasReceived = mine.some((r) => r.status === "done");
          if (toolbar) {
            toolbar.style.display = "flex";
            if (clearBtn) {
              clearBtn.disabled = !hasReceived;
              clearBtn.title = hasReceived
                ? "Remove all received cards from this list"
                : "No received cards to clear";
            }
          }

          listEl.innerHTML = "";

          // Build a unified list tagged by type so we can sort everything together
          const items = [
            ...mine.map((r) => ({
              kind: "card",
              data: r,
              ts: new Date(r.timestamp).getTime(),
            })),
            ...mineJp.map((e) => ({
              kind: "jp",
              data: e,
              ts: new Date(e.timestamp).getTime(),
            })),
            ...mineShop.map((r) => ({
              kind: "shop",
              data: r,
              ts: new Date(r.timestamp).getTime(),
            })),
          ];

          // Sort: pending/new first, then by timestamp desc
          const sorted = items.sort((a, b) => {
            const aPending =
              a.kind === "card"
                ? a.data.status === "pending"
                : a.kind === "jp"
                  ? a.data.status === "new"
                  : a.data.status === "pending";
            const bPending =
              b.kind === "card"
                ? b.data.status === "pending"
                : b.kind === "jp"
                  ? b.data.status === "new"
                  : b.data.status === "pending";
            if (aPending !== bPending) return aPending ? -1 : 1;
            return b.ts - a.ts;
          });

          sorted.forEach((item) => {
            if (item.kind === "card") {
              listEl.appendChild(buildMyCardRequestEl(item.data));
            } else if (item.kind === "jp") {
              listEl.appendChild(buildMyJackpotEntryEl(item.data));
            } else {
              listEl.appendChild(buildMyShopRequestEl(item.data));
            }
          });

          refreshMyReqPill();
        }

        function buildMyCardRequestEl(req) {
          const set = (SETS && SETS[req.setIdx]) || { name: `Set ${req.setIdx + 1}` };
          const card = (set && set.cards && set.cards[req.cardIdx]) || { name: `Card ${req.cardIdx + 1}`, emoji: "🃏" };
          const ts = new Date(req.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isPending = req.status === "pending";
          const isArchived = !!req._archived;

          // Completed entries show as "Received" (the card was delivered by the leader)
          const displayStatus =
            req.status === "done" || (isArchived && req.status === "done")
              ? "received"
              : req.status;
          const badgeClass =
            {
              pending: "mrc-badge-pending",
              done: "mrc-badge-done",
              received: "mrc-badge-done",
              declined: "mrc-badge-declined",
            }[displayStatus] || "mrc-badge-pending";
          const badgeLabel =
            {
              pending: "⏳ Pending",
              done: "📬 Received",
              received: "📬 Received",
              declined: "❌ Declined",
            }[displayStatus] || req.status;
          let sourceTag = "";
          if (req.source === "jackpot") {
            sourceTag = `<span class="mrc-source-tag mrc-source-jp">🎯 via Jackpot</span>`;
          } else if (req.source === "jumbled_jackpot") {
            sourceTag = `<span class="mrc-source-tag mrc-source-jj">🔀 via Jumbled Jackpot</span>`;
          } else if (req.source === "cds" || !!req.free) {
            sourceTag = `<span class="mrc-source-tag mrc-source-cds">📇 via CDS</span>`;
          } else {
            sourceTag = `<span class="mrc-source-tag mrc-source-coll">🃏 via Collection</span>`;
          }
          if (Number(req.coinsSpent) > 0) {
            sourceTag += `<span class="mrc-source-tag" style="background:rgba(251,191,36,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.4);margin-left:4px">🪙 ${req.coinsSpent}</span>`;
          }

          const div = document.createElement("div");
          div.className = `my-req-card mrc-${displayStatus}`;

          // Only allow editing/deleting pending requests
          const actionsHtml = isPending
            ? `<div class="my-req-actions">
         <button class="mra-btn mra-resend" onclick="resendRequest('${req.id}')">🔄 Resend</button>
         <button class="mra-btn mra-delete" onclick="openDeleteRequest('${req.id}')">🗑️ Delete</button>
       </div>`
            : `<div class="my-req-actions">
         <button class="mra-btn mra-delete" style="border-radius:0 0 16px 16px" onclick="openDeleteRequest('${req.id}')">🗑️ Remove</button>
       </div>`;

          const sentByHtml =
            (req.sentByName || req.sentByPhoto || req.sentByAvatar)
              ? `<div class="my-req-sent-by" title="Sent by ${escapeHtml(req.sentByName || "Admin")}">
                   <span class="mrsb-label">Sent by</span>
                   <div class="mrsb-avatar">${avatarHTML(req.sentByAvatar, req.sentByPhoto, req.sentByPid, req.sentByName)}</div>
                   <span class="mrsb-name">${escapeHtml(req.sentByName || "Admin")}</span>
                 </div>`
              : "";

          div.innerHTML = `
    <div class="my-req-topbar"></div>
    ${sentByHtml}
    <div class="my-req-body">
      <div class="mrc-emoji">${card.emoji}</div>
      <div class="mrc-info">
        <div class="mrc-name">${card.name}</div>
        <div class="mrc-set">${set.name}</div>
        ${req.note ? `<div class="mrc-note">💬 "${req.note}"</div>` : ""}
        ${sourceTag}
      </div>
      <span class="mrc-status-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="mrc-ts">📅 ${ts}</div>
    ${actionsHtml}
  `;
          return div;
        }

        function buildMyJackpotEntryEl(entry) {
          const ts = new Date(entry.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isNew = entry.status === "new";

          const badgeClass = isNew ? "mrc-badge-pending" : "mrc-badge-done";
          const badgeLabel = isNew ? "⏳ Awaiting Review" : "✅ Reviewed";

          const cardsHtml =
            (entry.requiredCards || [])
              .map(
                (c) => `
    <div class="req-mini-card">
      <span class="rmc-emoji">${c.emoji || "🃏"}</span>
      <span class="rmc-name">${c.name || "Card"}</span>
      <span class="rmc-set">${(typeof SETS !== "undefined" && SETS && SETS[c.setIdx] && SETS[c.setIdx].name) ? SETS[c.setIdx].name.replace(/^Set \d+ – /, "") : (c.setName || `Set ${(c.setIdx || 0) + 1}`)}</span>
    </div>`,
              )
              .join("") ||
            '<span style="font-size:.75rem;color:rgba(255,255,255,.4);padding:8px">No cards requested</span>';

          const div = document.createElement("div");
          div.className = `my-req-card mrc-${isNew ? "pending" : "done"}`;

          div.innerHTML = `
    <div class="my-req-topbar" style="background:${isNew ? "linear-gradient(90deg,#8b5cf6,#6d28d9)" : "linear-gradient(90deg,#27ae60,#2ecc71)"}"></div>
    <div class="my-req-body" style="align-items:flex-start">
      <div class="mrc-emoji">🎯</div>
      <div class="mrc-info">
        <div class="mrc-name">Jackpot Event — ${entry.setName}</div>
        <div class="mrc-set">🧠 ${entry.correctCount}/${entry.totalCards} named correctly</div>
        <div class="mrc-note">📬 Requesting ${(entry.requiredCards || []).length} card(s) for delivery</div>
      </div>
      <span class="mrc-status-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="req-cards-strip" style="padding:0 14px 10px;margin:0">${cardsHtml}</div>
    <div class="mrc-ts">📅 ${ts}</div>
    <div class="my-req-actions">
      <button class="mra-btn mra-delete" style="border-radius:0 0 16px 16px" onclick="openDeleteJpEntry('${entry.id}')">🗑️ Remove</button>
    </div>
  `;
          return div;
        }

        function buildMyShopRequestEl(req) {
          const item = SHOP_ITEMS.find((i) => i.id === req.itemId);
          const emoji = item ? item.emoji : "🛍️";
          const name = req.itemName || (item && item.name) || "Shop Item";
          const ts = new Date(req.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isPending = req.status === "pending";
          const isArchived = !!req._archived;

          const displayStatus =
            req.status === "done" || (isArchived && req.status === "done")
              ? "received"
              : req.status;
          const badgeClass =
            {
              pending: "mrc-badge-pending",
              done: "mrc-badge-done",
              received: "mrc-badge-done",
              declined: "mrc-badge-declined",
            }[displayStatus] || "mrc-badge-pending";
          const badgeLabel =
            {
              pending: "⏳ Pending",
              done: "📬 Received",
              received: "📬 Received",
              declined: "❌ Declined",
            }[displayStatus] || req.status;

          const div = document.createElement("div");
          div.className = `my-req-card mrc-${displayStatus}`;

          // Only pending shop purchases can be cancelled for a refund — once the
          // admin marks one "Given" or "Declined", deleting it is list cleanup.
          const actionsHtml = isPending
            ? `<div class="my-req-actions">
         <button class="mra-btn mra-delete" style="border-radius:0 0 16px 16px" onclick="openDeleteShopRequest('${req.id}')">🗑️ Cancel &amp; Refund</button>
       </div>`
            : `<div class="my-req-actions">
         <button class="mra-btn mra-delete" style="border-radius:0 0 16px 16px" onclick="openDeleteShopRequest('${req.id}')">🗑️ Remove</button>
       </div>`;

          div.innerHTML = `
    <div class="my-req-topbar"></div>
    <div class="my-req-body">
      <div class="mrc-emoji">${emoji}</div>
      <div class="mrc-info">
        <div class="mrc-name">${name}${req.slotNumber ? " #" + req.slotNumber : ""}</div>
        <div class="mrc-note">🪙 ${req.cost} coins</div>
        <span class="mrc-source-tag mrc-source-shop">🛍️ via Shop</span>
      </div>
      <span class="mrc-status-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="mrc-ts">📅 ${ts}</div>
    ${actionsHtml}
  `;
          return div;
        }

        function openEditRequest(reqId) {
          const req = cardRequests.find((r) => r.id === reqId);
          if (!req) return;
          const set = (typeof SETS !== "undefined" && SETS && SETS[req.setIdx]) || { name: `Set ${req.setIdx + 1}`, cards: [] };
          const card = (set.cards && set.cards[req.cardIdx]) || { name: `Card ${req.cardIdx + 1}`, emoji: "🃏" };
          pendingEditReqId = reqId;
          document.getElementById("editReqEmoji").textContent = card.emoji;
          document.getElementById("editReqCardName").textContent = card.name;
          document.getElementById("editReqCardSet").textContent = set.name;
          document.getElementById("editReqNoteInput").value = req.note || "";
          showOverlay("overlayEditReq");
        }

        function saveEditedRequest() {
          if (!pendingEditReqId) return;
          const req = cardRequests.find((r) => r.id === pendingEditReqId);
          if (!req) {
            closeOverlay("overlayEditReq");
            return;
          }
          req.note = document.getElementById("editReqNoteInput").value.trim();
          pendingEditReqId = null;
          saveProgress();
          window.saveSharedRequests();
          closeOverlay("overlayEditReq");
          showToast("✅ Request note updated!");
          renderMyRequests();
          renderMyCdsRequests();
        }

        function resendRequest(reqId) {
          const req = cardRequests.find((r) => r.id === reqId);
          if (!req) return;
          // Update timestamp so it appears fresh to admin
          req.timestamp = new Date().toISOString();
          saveProgress();
          window.saveSharedRequests();
          showToast("🔄 Request resent to DA leader!");
          renderMyRequests();
          renderMyCdsRequests();
          SFX.notify && SFX.notify();
        }

        function openDeleteRequest(reqId) {
          const req =
            cardRequests.find((r) => r.id === reqId) ||
            archivedRequests.find((r) => r.id === reqId);
          if (!req) return;
          const set = (typeof SETS !== "undefined" && SETS && SETS[req.setIdx]) || { name: `Set ${req.setIdx + 1}`, cards: [] };
          const card = (set.cards && set.cards[req.cardIdx]) || { name: `Card ${req.cardIdx + 1}`, emoji: "🃏" };
          pendingDeleteReqId = reqId;
          pendingDeleteJpId = null;
          pendingDeleteShopId = null;
          const refundNote =
            req.status === "pending" && req.coinsSpent > 0
              ? `<br><small style="opacity:.85; color:var(--gold)">🪙 ${req.coinsSpent} coins will be refunded to your balance.</small>`
              : req.status === "pending"
                ? '<br><small style="opacity:.7">Your DA leader won\'t see it anymore.</small>'
                : "";
          document.getElementById("deleteReqBody").innerHTML =
            `Delete your request for <strong>${card.emoji} ${card.name}</strong>?${refundNote}`;
          showOverlay("overlayDeleteReq");
        }

        function confirmDeleteRequest() {
          if (pendingDeleteShopId) {
            window._dismissReqIds([pendingDeleteShopId]);
            const idx = shopRequests.findIndex(
              (r) => r.id === pendingDeleteShopId,
            );
            let refunded = 0;
            if (idx !== -1) {
              const req = shopRequests[idx];
              // Only pending purchases owe a refund — a "Given" purchase already
              // delivered a real in-game item, so it's not refundable.
              if (req.status === "pending") {
                refunded = req.cost || 0;
                // Release the booked slot and roll back the pricing tier for this
                // cancelled purchase, so the player is charged the base price again
                // (rather than the escalated price) next time they buy this item.
                const entry = ownedShopItems[req.itemId];
                if (entry) {
                  const newCount = Math.max(0, (entry.count || 0) - 1);
                  const newPurchaseCount = Math.max(
                    0,
                    (entry.purchaseCount || 0) - 1,
                  );
                  if (newCount <= 0 && newPurchaseCount <= 0) {
                    delete ownedShopItems[req.itemId];
                  } else {
                    ownedShopItems[req.itemId] = {
                      ...entry,
                      count: newCount,
                      owned: newCount > 0,
                      purchaseCount: newPurchaseCount,
                    };
                  }
                }
                shopRequests.splice(idx, 1);
              } else {
                req._hidden = true;
              }
            }
            const aIdx = archivedShopRequests.findIndex(
              (r) => r.id === pendingDeleteShopId,
            );
            if (aIdx !== -1) {
              archivedShopRequests[aIdx]._hidden = true;
            }
            if (refunded > 0) {
              coins += refunded;
              logCoinTx(refunded, "↩️ Refund for cancelled shop request");
              updateHUD();
            }
            pendingDeleteShopId = null;
            saveProgress();
            window.saveShopRequests();
            closeOverlay("overlayDeleteReq");
            showToast(
              refunded > 0
                ? `🗑️ Request deleted. ${refunded} 🪙 refunded!`
                : "🗑️ Request deleted.",
            );
            renderMyRequests();
            if (typeof renderShopGrid === "function") renderShopGrid();
            refreshMyReqPill();
            return;
          }
          if (pendingDeleteJpId) {
            const idx = jackpotEntries.findIndex(
              (e) => e.id === pendingDeleteJpId,
            );
            if (idx !== -1) jackpotEntries.splice(idx, 1);
            pendingDeleteJpId = null;
            window.saveJackpotEntries();
            closeOverlay("overlayDeleteReq");
            showToast("🗑️ Jackpot entry removed.");
            renderMyRequests();
            refreshMyReqPill();
            return;
          }
          if (!pendingDeleteReqId) return;
          const reqIdToDelete = pendingDeleteReqId;
          pendingDeleteReqId = null;
          closeOverlay("overlayDeleteReq");

          let refunded = 0;
          let wasPending = false;
          let deletedReq = null;
          const idx = cardRequests.findIndex((r) => r.id === reqIdToDelete);
          if (idx !== -1) {
            deletedReq = cardRequests[idx];
            wasPending = deletedReq.status === "pending";
            // Refund coins if this request still owes a refund (pending requests that
            // cost coins). Declined requests are refunded already when the admin
            // declines them, and done requests delivered the card, so skip those.
            if (wasPending && deletedReq.coinsSpent > 0) {
              refunded = deletedReq.coinsSpent;
            }
            if (wasPending) {
              cardRequests.splice(idx, 1);
            } else {
              deletedReq._hidden = true;
              if (!archivedRequests.some((a) => a.id === deletedReq.id)) {
                archivedRequests.push({ ...deletedReq, _hidden: true, _archived: true });
              }
            }
          }
          const aIdx = archivedRequests.findIndex((r) => r.id === reqIdToDelete);
          if (aIdx !== -1) {
            archivedRequests[aIdx]._hidden = true;
          }
          if (typeof window._dismissReqIds === "function") window._dismissReqIds([reqIdToDelete]);
          if (refunded > 0) {
            coins += refunded;
            logCoinTx(refunded, "↩️ Refund for cancelled card request");
            updateHUD();
          }
          saveProgress();
          if (wasPending) {
            if (!window._cancelledPendingReqIds) window._cancelledPendingReqIds = new Set();
            window._cancelledPendingReqIds.add(reqIdToDelete);
            if (typeof window.deleteSharedCardRequest === "function") {
              window.deleteSharedCardRequest(reqIdToDelete);
            } else if (typeof window.saveSharedRequests === "function") {
              window.saveSharedRequests();
            }
          }
          showToast(
            refunded > 0
              ? `🗑️ Request deleted. ${refunded} 🪙 refunded!`
              : "🗑️ Request deleted.",
          );
          renderMyRequests();
          renderMyCdsRequests();
          renderCollGrid(); // refresh collection so the amber highlight clears
          if (typeof renderCdsGrid === "function") renderCdsGrid();
          if (typeof updateCdsFreeCounter === "function") updateCdsFreeCounter();
          if (typeof updateCollStats === "function") updateCollStats();
          refreshMyReqPill();
          refreshCdsReqPill();
        }

        function clearAllReceivedCards(scope) {
          const pid = window._currentPlayerId || "";
          const name =
            typeof profile !== "undefined" && profile && profile.name
              ? profile.name
              : "";
          let clearedCount = 0;
          const clearedIds = [];
          const isMatch = (r) => {
            if (!r || r._hidden || r.status !== "done") return false;
            const matchesPlayer =
              (pid && r.playerId === pid) || (!pid && r.playerName === name);
            if (!matchesPlayer) return false;
            return scope === "cds"
              ? r.source === "cds" || !!r.free
              : r.source !== "cds" && !r.free;
          };

          cardRequests.forEach((r) => {
            if (isMatch(r)) {
              r._hidden = true;
              clearedIds.push(r.id);
              clearedCount++;
              if (!archivedRequests.some((a) => a.id === r.id)) {
                archivedRequests.push({ ...r, _hidden: true, _archived: true });
              }
            }
          });
          archivedRequests.forEach((r) => {
            if (isMatch(r)) {
              r._hidden = true;
              clearedIds.push(r.id);
              clearedCount++;
            }
          });

          if (clearedCount === 0) {
            showToast("ℹ️ No received cards to clear.");
            return;
          }

          if (typeof window._dismissReqIds === "function") window._dismissReqIds(clearedIds);
          saveProgress();
          if (typeof window.saveSharedRequests === "function") {
            window.saveSharedRequests();
          }
          if (scope === "cds") {
            renderMyCdsRequests();
            refreshCdsReqPill();
            if (typeof updateCdsFreeCounter === "function") updateCdsFreeCounter();
          } else {
            renderMyRequests();
            refreshMyReqPill();
            if (typeof updateCollStats === "function") updateCollStats();
          }
          renderCollGrid();
          showToast(
            `🧹 Cleared ${clearedCount} received card${clearedCount > 1 ? "s" : ""}!`,
          );
        }
        window.clearAllReceivedCards = clearAllReceivedCards;

        function openDeleteJpEntry(entryId) {
          const entry = jackpotEntries.find((e) => e.id === entryId);
          if (!entry) return;
          pendingDeleteJpId = entryId;
          pendingDeleteReqId = null;
          pendingDeleteShopId = null;
          document.getElementById("deleteReqBody").innerHTML =
            `Remove your Jackpot Event submission for <strong>${entry.setName}</strong>?${entry.status === "new" ? '<br><small style="opacity:.7">Your DA leader won\'t see it anymore.</small>' : ""}`;
          showOverlay("overlayDeleteReq");
        }

        function openDeleteShopRequest(reqId) {
          const req =
            shopRequests.find((r) => r.id === reqId) ||
            archivedShopRequests.find((r) => r.id === reqId);
          if (!req) return;
          const item = SHOP_ITEMS.find((i) => i.id === req.itemId);
          const emoji = item ? item.emoji : "🛍️";
          const name = req.itemName || (item && item.name) || "Shop Item";
          pendingDeleteShopId = reqId;
          pendingDeleteReqId = null;
          pendingDeleteJpId = null;
          document.getElementById("deleteReqBody").innerHTML =
            `Delete your request for <strong>${emoji} ${name}</strong>?${req.status === "pending" ? `<br><small style="opacity:.7">${req.cost} 🪙 will be refunded and the slot released.</small>` : '<br><small style="opacity:.7">Your DA leader won\'t see it anymore.</small>'}`;
          showOverlay("overlayDeleteReq");
        }

        // ─── EDIT JACKPOT ENTRY CARDS ─────────────────────────────
        function openEditJpEntry(entryId) {
          const entry = jackpotEntries.find((e) => e.id === entryId);
          if (!entry) return;
          pendingEditJpId = entryId;
          editJpSelectedCards = (entry.requiredCards || []).map((c) => ({
            setIdx: c.setIdx,
            cardIdx: c.cardIdx,
          }));
          renderEditJpPickGrid();
          showOverlay("overlayEditJp");
        }

        function renderEditJpPickGrid() {
          const grid = document.getElementById("editJpPickGrid");
          if (!grid) return;
          grid.innerHTML = "";
          SETS.forEach((set, si) => {
            const title = document.createElement("div");
            title.className = "jp-pick-set-title";
            title.textContent = set.name;
            grid.appendChild(title);
            set.cards.forEach((card, ci) => {
              const isSel = editJpSelectedCards.some(
                (c) => c.setIdx === si && c.cardIdx === ci,
              );
              const isGold = !!card.gold;
              const div = document.createElement("div");
              div.className =
                "jp-pick-card" +
                (isGold ? " gold-slot" : "") +
                (isSel ? " selected" : "");
              div.innerHTML =
                (isSel ? '<span class="jp-pick-check">✅</span>' : "") +
                (isGold ? '<span class="jp-pick-gold-tag">🌟</span>' : "") +
                `<div class="jp-pick-emoji">${card.emoji}</div>` +
                `<div class="jp-pick-name">${card.name}</div>`;
              div.onclick = () => editJpToggleCard(si, ci);
              grid.appendChild(div);
            });
          });
          const editNormalCount = editJpSelectedCards.filter(
            (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          const editGoldCount = editJpSelectedCards.filter(
            (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          const countEl = document.getElementById("editJpPickCount");
          if (countEl) countEl.textContent = editNormalCount;
          const countGoldEl = document.getElementById("editJpPickCountGold");
          if (countGoldEl) countGoldEl.textContent = editGoldCount;
        }

        function editJpToggleCard(si, ci) {
          const idx = editJpSelectedCards.findIndex(
            (c) => c.setIdx === si && c.cardIdx === ci,
          );
          if (idx !== -1) {
            editJpSelectedCards.splice(idx, 1);
          } else {
            const isGold = !!SETS[si].cards[ci].gold;
            if (isGold) {
              const goldCount = editJpSelectedCards.filter(
                (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (goldCount >= 2) {
                showToast("You can only pick 2 gold cards!");
                return;
              }
            } else {
              const normalCount = editJpSelectedCards.filter(
                (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (normalCount >= 10) {
                showToast("You can only pick 10 normal cards!");
                return;
              }
            }
            editJpSelectedCards.push({ setIdx: si, cardIdx: ci });
          }
          renderEditJpPickGrid();
        }

        function saveEditedJpCards() {
          if (!pendingEditJpId) {
            closeOverlay("overlayEditJp");
            return;
          }
          if (editJpSelectedCards.length === 0) {
            showToast("Please pick at least 1 card!");
            return;
          }
          const entry = jackpotEntries.find((e) => e.id === pendingEditJpId);
          if (!entry) {
            closeOverlay("overlayEditJp");
            return;
          }

          entry.requiredCards = editJpSelectedCards.map((c) => ({
            setIdx: c.setIdx,
            cardIdx: c.cardIdx,
            name: SETS[c.setIdx].cards[c.cardIdx].name,
            emoji: SETS[c.setIdx].cards[c.cardIdx].emoji,
          }));
          // Flag as needing another look since the request changed
          entry.status = "new";
          entry.timestamp = new Date().toISOString();

          pendingEditJpId = null;
          window.saveJackpotEntries();
          closeOverlay("overlayEditJp");
          showToast("✅ Your card picks were updated!");
          renderMyRequests();
          refreshMyReqPill();
        }

        // ─── UNIVERSAL CARD ACTION MODAL (Request / Sell / Note) ──
        let caSetIdx = null;
        let caCardIdx = null;

        // Opens one shared modal for a card, whether owned or not. Owned cards can
        // be requested for free (delivery of a card you already unlocked) and, if
        // you hold a duplicate, sold from the same modal. Unowned cards can only be
        // requested by spending 100 coins. Every path funnels through this single
        // popup — there is no separate confirm-then-request step anymore.
        function openCardActionModal(sIdx, cIdx) {
          if (typeof ecIsActive === "function" && !ecIsActive("coll")) {
            showToast(
              "🔒 Collection requests are currently paused by your DA leader.",
            );
            return;
          }
          const key = sIdx + "-" + cIdx;
          const entry = ownedCards[key];
          const isOwned = !!(entry && entry.owned);
          const dupes = (entry && entry.dupes) || 0;

          caSetIdx = sIdx;
          caCardIdx = cIdx;

          const set = SETS[sIdx];
          const card = set.cards[cIdx];
          const isGold = !!card.gold;
          const reqCost = isGold ? GOLD_REQUEST_COST : REQUEST_COST;
          document.getElementById("caCardEmoji").textContent = card.emoji;
          document.getElementById("caCardName").textContent = card.name;
          document.getElementById("caCardSetName").textContent = set.name;
          const caPreview = document
            .getElementById("caCardEmoji")
            .closest(".req-card-preview");
          if (caPreview) caPreview.classList.toggle("is-gold", isGold);

          const pendingReq = getPendingCardRequest(sIdx, cIdx);
          const alreadyRequested = !!pendingReq;

          const reqBtn = document.getElementById("caRequestBtn");
          const sellBtn = document.getElementById("caSellBtn");
          const statusMsg = document.getElementById("caStatusMsg");

          // Sell button only shows for owned cards with a spare duplicate
          if (isOwned && dupes > 0) {
            sellBtn.style.display = "";
            sellBtn.textContent = `💰 Sell Duplicate • ${DUPE_SELL_PRICE} 🪙`;
          } else {
            sellBtn.style.display = "none";
          }

          const collLimitReached = collRequestsToday() >= collDailyLimit();

          if (alreadyRequested) {
            reqBtn.textContent = "📬 Already Requested";
            reqBtn.disabled = true;
            reqBtn.style.opacity = ".6";
            reqBtn.style.cursor = "default";
            statusMsg.textContent =
              pendingReq && pendingReq.isCds
                ? 'You already have a pending request for this card from CDS — check "My CDS Requests" for status.'
                : 'You already have a pending request for this card — check "My Requests" for status.';
          } else if (collLimitReached) {
            reqBtn.textContent = "📬 Daily Limit Reached";
            reqBtn.disabled = true;
            reqBtn.style.opacity = ".6";
            reqBtn.style.cursor = "default";
            statusMsg.textContent = `You've used all ${collDailyLimit()} of your card requests for today. Come back tomorrow!`;
          } else {
            reqBtn.disabled = false;
            reqBtn.style.opacity = "";
            reqBtn.style.cursor = "pointer";
            if (isOwned) {
              reqBtn.textContent = "📬 Request from DA Leader";
              statusMsg.textContent = `Send a request to your DA leader to give you this card in the real Township game! (${collDailyLimit() - collRequestsToday()} of ${collDailyLimit()} requests left today)`;
            } else {
              reqBtn.textContent = `📬 Request • ${reqCost} 🪙`;
              statusMsg.textContent =
                (isGold
                  ? `🌟 This is a GOLD card — spend ${reqCost} 🪙 to request it from your DA leader.`
                  : `Not in your collection yet — spend ${reqCost} 🪙 to request it from your DA leader.`) +
                ` (${collDailyLimit() - collRequestsToday()} of ${collDailyLimit()} requests left today)`;
            }
          }

          showOverlay("overlayCardAction");
        }

        function caSubmitRequest() {
          if (window._isSubmittingCardReq) return;
          if (caSetIdx === null || caCardIdx === null) return;
          if (typeof ecIsActive === "function" && !ecIsActive("coll")) {
            showToast(
              "🔒 Collection requests are currently paused by your DA leader.",
            );
            closeOverlay("overlayCardAction");
            return;
          }
          const setIdx = caSetIdx;
          const cardIdx = caCardIdx;
          const set = SETS[setIdx];
          const card = set && set.cards && set.cards[cardIdx];
          if (!set || !card) return;

          if (!profile.name || !profile.town) {
            closeOverlay("overlayCardAction");
            showToast("⚡ Please set your profile name & town first!");
            setTimeout(
              () =>
                switchTab("profile", document.querySelectorAll(".tab-btn")[5]),
              600,
            );
            return;
          }

          const key = setIdx + "-" + cardIdx;
          const entry = ownedCards[key];
          const isOwned = !!(entry && entry.owned);
          const isGold = !!card.gold;
          const reqCost = isGold ? GOLD_REQUEST_COST : REQUEST_COST;

          const pendingReq = getPendingCardRequest(setIdx, cardIdx);
          if (pendingReq) {
            showToast(
              pendingReq.isCds
                ? "📬 You already have a pending CDS request for this card!"
                : "📬 You already have a pending request for this card!",
            );
            return;
          }

          if (collRequestsToday() >= collDailyLimit()) {
            showToast(
              `📬 You've used all ${collDailyLimit()} of your card requests for today!`,
            );
            return;
          }

          let coinsSpent = 0;
          const prevCoins = coins;
          const prevCoinHistory = Array.isArray(coinHistory) ? coinHistory.slice() : [];
          if (!isOwned) {
            if (coins < reqCost) {
              showToast(
                `❌ Not enough coins! You need ${reqCost} 🪙 to request this card.`,
              );
              return;
            }
            coins -= reqCost;
            logCoinTx(
              -reqCost,
              isGold ? "🌟 Requested a gold card" : "🃏 Requested a card",
            );
            coinsSpent = reqCost;
            updateHUD();
          }

          window._isSubmittingCardReq = true;
          const reqBtn = document.getElementById("caRequestBtn");
          if (reqBtn) {
            reqBtn.disabled = true;
            reqBtn.style.opacity = ".5";
          }
          const guardTimer = setTimeout(() => {
            window._isSubmittingCardReq = false;
            if (reqBtn) {
              reqBtn.disabled = false;
              reqBtn.style.opacity = "";
            }
          }, 15000);

          const pid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
          const req = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            playerName: profile.name,
            townName: profile.town,
            avatar: profile.avatar,
            photoURL: _lightPhoto(profile.photoURL),
            playerId: pid,
            setIdx,
            cardIdx,
            note: "",
            status: "pending",
            coinsSpent,
            source: "collection",
            timestamp: new Date().toISOString(),
            _inFlight: true,
            _clientCreatedAt: Date.now(),
          };

          cardRequests.unshift(req);
          if (window._cardReqKnownIds) window._cardReqKnownIds.add(req.id);

          const submitPromise = window.submitCardRequestAtomic
            ? window.submitCardRequestAtomic(req, coinsSpent)
            : (window.addSharedCardRequest ? window.addSharedCardRequest(req) : window.saveSharedRequests());

          submitPromise.then((ok) => {
            req._inFlight = false;
            if (ok === false) {
              // Only remove this specific request and refund its spent coins
              const idx = cardRequests.findIndex((r) => r.id === req.id);
              if (idx !== -1) {
                cardRequests.splice(idx, 1);
                if (coinsSpent > 0) {
                  coins += coinsSpent;
                  logCoinTx(coinsSpent, "↩️ Refund: card request failed to send");
                  updateHUD();
                }
                saveProgress();
                if (window._scheduleUIRefresh) window._scheduleUIRefresh();
                showToast(
                  coinsSpent > 0
                    ? `⚠️ Card request failed to send — ${coinsSpent} 🪙 refunded!`
                    : "⚠️ Card request failed to send.",
                );
              }
            }
          }).finally(() => {
            clearTimeout(guardTimer);
            window._isSubmittingCardReq = false;
            if (reqBtn) {
              reqBtn.disabled = false;
              reqBtn.style.opacity = "";
            }
          });

          closeOverlay("overlayCardAction");
          SFX.notify && SFX.notify();
          showToast(`📬 Request sent for ${card.emoji} ${card.name}!`);
          if (typeof updateProfileStats === "function") updateProfileStats();
          if (window._scheduleUIRefresh) {
            window._scheduleUIRefresh();
          } else {
            renderCollGrid();
            if (typeof renderCdsGrid === "function") renderCdsGrid();
            updateCollStats();
            if (typeof updateCdsFreeCounter === "function") updateCdsFreeCounter();
            refreshMyReqPill();
            if (typeof refreshCdsReqPill === "function") refreshCdsReqPill();
            if (typeof renderMyRequests === "function") renderMyRequests();
            if (typeof renderMyCdsRequests === "function") renderMyCdsRequests();
          }
        }
        window.caSubmitRequest = caSubmitRequest;

        // Sell a duplicate copy of the card currently open in the action modal
        function caSellCard() {
          if (caSetIdx === null || caCardIdx === null) return;
          sellDuplicateCard(caSetIdx, caCardIdx, null);
          closeOverlay("overlayCardAction");
        }

        // ─── PROFILE ─────────────────────────────────────────────
        const AVATARS = [
          "🧙",
          "🧝",
          "🦉",
          "⚡",
          "🔮",
          "🪄",
          "🏰",
          "🦁",
          "🐍",
          "🦅",
          "🦡",
          "🌙",
        ];

        function openProfile() {
          document.getElementById("inputPlayerName").value = profile.name;
          document.getElementById("inputTownName").value = profile.town;
          // Refresh Player ID and Login Username display
          const pid = window._currentPlayerId || "DA-?????";
          document.getElementById("profilePlayerIdValue").textContent = pid;
          const uVal = document.getElementById("profileUsernameValue");
          if (uVal) {
            uVal.textContent =
              window._currentUsername ||
              (typeof profile === "object" && profile.username) ||
              "—";
          }
          renderAvatarPicker();
          updateProfilePhotoUI();
          updateProfileStats();
          if (typeof window.updateSwitchAccountUI === "function") {
            window.updateSwitchAccountUI();
          }
        }

        function updateProfilePhotoUI() {
          const rmBtn = document.getElementById("btnRemovePlayerPhoto");
          if (rmBtn) {
            rmBtn.style.display = profile.photoURL ? "inline-flex" : "none";
          }
          const display = document.getElementById("profileAvatarDisplay");
          if (display) {
            display.innerHTML = avatarHTML(profile.avatar, profile.photoURL);
          }
        }

        function renderAvatarPicker() {
          const picker = document.getElementById("avatarPicker");
          picker.innerHTML = "";
          AVATARS.forEach((av) => {
            const btn = document.createElement("button");
            btn.textContent = av;
            btn.title = av;
            const isSelected = profile.avatar === av && !profile.photoURL;
            btn.style.cssText = `
      font-size:1.6rem; background:${isSelected ? "rgba(240,192,48,.25)" : "rgba(255,255,255,.07)"};
      border:2px solid ${isSelected ? "var(--gold)" : "rgba(255,255,255,.15)"};
      border-radius:12px; padding:6px 10px; cursor:pointer; transition:all .2s;
    `;
            btn.onclick = () => {
              profile.avatar = av;
              if (profile.photoURL) {
                profile.photoURL = "";
                if (window.removeMyProfilePhoto) {
                  window.removeMyProfilePhoto();
                }
              }
              renderAvatarPicker();
              updateProfilePhotoUI();
              applyProfileToHUD();
              showToast(`Avatar set to ${av}! Remember to tap Save Profile.`);
            };
            picker.appendChild(btn);
          });
          updateProfilePhotoUI();
        }

        // ─── INTERACTIVE DP CROPPER (WhatsApp / Instagram style) ────────
        let _cropImage = null;
        let _cropScale = 1.0;
        let _cropBaseScale = 1.0;
        let _cropPanX = 0;
        let _cropPanY = 0;
        let _cropRotation = 0; // 0, 90, 180, 270
        let _cropIsDragging = false;
        let _cropDragStartX = 0;
        let _cropDragStartY = 0;
        let _cropPinchStartDist = 0;
        let _cropPinchStartScale = 1.0;

        function openCropModal(img) {
          _cropImage = img;
          _cropScale = 1.0;
          _cropPanX = 0;
          _cropPanY = 0;
          _cropRotation = 0;
          _cropIsDragging = false;

          // Calculate base scale so image covers the circular viewfinder (240px diameter)
          const viewportSize = 240;
          const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
          _cropBaseScale = minSide > 0 ? viewportSize / minSide : 1.0;

          const slider = document.getElementById("cropZoomSlider");
          if (slider) {
            slider.value = 1;
            slider.min = 0.5;
            slider.max = 3.0;
            slider.step = 0.02;
          }

          const overlay = document.getElementById("overlayCropPhoto");
          if (overlay) {
            overlay.style.display = "flex";
            overlay.classList.add("active");
          }

          initCropEventListeners();
          renderCropCanvas();
        }
        window.openCropModal = openCropModal;

        function closeCropModal() {
          const overlay = document.getElementById("overlayCropPhoto");
          if (overlay) {
            overlay.style.display = "none";
            overlay.classList.remove("active");
          }
          _cropImage = null;
          _cropIsDragging = false;
          const input = document.getElementById("playerPhotoFileInput");
          if (input) input.value = "";
          const statusEl = document.getElementById("playerPhotoStatus");
          if (statusEl && statusEl.textContent.includes("Processing")) {
            statusEl.style.display = "none";
          }
        }
        window.closeCropModal = closeCropModal;

        function renderCropCanvas() {
          const canvas = document.getElementById("cropCanvas");
          if (!canvas || !_cropImage) return;
          const ctx = canvas.getContext("2d");
          const W = canvas.width;
          const H = canvas.height;
          const cx = W / 2;
          const cy = H / 2;
          const radius = 120; // 240px diameter / 2

          ctx.clearRect(0, 0, W, H);

          // 1. Draw Image with pan, zoom and rotation
          ctx.save();
          ctx.translate(cx + _cropPanX, cy + _cropPanY);
          ctx.rotate((_cropRotation * Math.PI) / 180);
          const drawScale = _cropBaseScale * _cropScale;
          const drawW = (_cropImage.naturalWidth || _cropImage.width) * drawScale;
          const drawH = (_cropImage.naturalHeight || _cropImage.height) * drawScale;
          ctx.drawImage(_cropImage, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // 2. Draw Vignette mask outside circular viewport (Instagram style)
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
          ctx.fillStyle = "rgba(10, 6, 22, 0.65)";
          ctx.fill();
          ctx.restore();

          // 3. Grid lines (rule of thirds) if dragging
          if (_cropIsDragging) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.strokeStyle = "rgba(240, 192, 48, 0.25)";
            ctx.lineWidth = 1;
            // 2 vertical lines
            ctx.beginPath();
            ctx.moveTo(cx - radius / 3, cy - radius);
            ctx.lineTo(cx - radius / 3, cy + radius);
            ctx.moveTo(cx + radius / 3, cy - radius);
            ctx.lineTo(cx + radius / 3, cy + radius);
            // 2 horizontal lines
            ctx.moveTo(cx - radius, cy - radius / 3);
            ctx.lineTo(cx + radius, cy - radius / 3);
            ctx.moveTo(cx - radius, cy + radius / 3);
            ctx.lineTo(cx + radius, cy + radius / 3);
            ctx.stroke();
            ctx.restore();
          }

          // 4. Subtle gold ring around the circle
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(240, 192, 48, 0.85)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
        window.renderCropCanvas = renderCropCanvas;

        function onCropZoomChange(val) {
          _cropScale = parseFloat(val) || 1.0;
          renderCropCanvas();
        }
        window.onCropZoomChange = onCropZoomChange;

        function onCropRotateClick() {
          _cropRotation = (_cropRotation + 90) % 360;
          renderCropCanvas();
        }
        window.onCropRotateClick = onCropRotateClick;

        function resetCropView() {
          _cropScale = 1.0;
          _cropPanX = 0;
          _cropPanY = 0;
          _cropRotation = 0;
          const slider = document.getElementById("cropZoomSlider");
          if (slider) slider.value = 1;
          renderCropCanvas();
        }
        window.resetCropView = resetCropView;

        let _cropEventsInited = false;
        function initCropEventListeners() {
          if (_cropEventsInited) return;
          const vp = document.getElementById("cropViewport");
          if (!vp) return;
          _cropEventsInited = true;

          // Mouse Drag
          vp.addEventListener("mousedown", (e) => {
            if (!_cropImage) return;
            _cropIsDragging = true;
            _cropDragStartX = e.clientX - _cropPanX;
            _cropDragStartY = e.clientY - _cropPanY;
            vp.style.cursor = "grabbing";
            renderCropCanvas();
          });

          window.addEventListener("mousemove", (e) => {
            if (!_cropIsDragging) return;
            _cropPanX = e.clientX - _cropDragStartX;
            _cropPanY = e.clientY - _cropDragStartY;
            renderCropCanvas();
          });

          window.addEventListener("mouseup", () => {
            if (_cropIsDragging) {
              _cropIsDragging = false;
              vp.style.cursor = "grab";
              renderCropCanvas();
            }
          });

          // Mouse Wheel Zoom
          vp.addEventListener("wheel", (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            _cropScale = Math.max(0.5, Math.min(3.0, _cropScale + delta));
            const slider = document.getElementById("cropZoomSlider");
            if (slider) slider.value = _cropScale;
            renderCropCanvas();
          }, { passive: false });

          // Touch Drag & Pinch Zoom
          vp.addEventListener("touchstart", (e) => {
            if (!_cropImage) return;
            if (e.touches.length === 1) {
              _cropIsDragging = true;
              _cropDragStartX = e.touches[0].clientX - _cropPanX;
              _cropDragStartY = e.touches[0].clientY - _cropPanY;
              renderCropCanvas();
            } else if (e.touches.length === 2) {
              _cropIsDragging = false;
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              _cropPinchStartDist = Math.hypot(dx, dy);
              _cropPinchStartScale = _cropScale;
            }
          }, { passive: true });

          vp.addEventListener("touchmove", (e) => {
            if (e.touches.length === 1 && _cropIsDragging) {
              _cropPanX = e.touches[0].clientX - _cropDragStartX;
              _cropPanY = e.touches[0].clientY - _cropDragStartY;
              renderCropCanvas();
            } else if (e.touches.length === 2 && _cropPinchStartDist > 0) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              const dist = Math.hypot(dx, dy);
              const factor = dist / _cropPinchStartDist;
              _cropScale = Math.max(0.5, Math.min(3.0, _cropPinchStartScale * factor));
              const slider = document.getElementById("cropZoomSlider");
              if (slider) slider.value = _cropScale;
              renderCropCanvas();
            }
          }, { passive: true });

          vp.addEventListener("touchend", () => {
            _cropIsDragging = false;
            _cropPinchStartDist = 0;
            renderCropCanvas();
          }, { passive: true });
        }

        async function applyCropAndUpload() {
          if (!_cropImage) return;
          const btn = document.getElementById("btnApplyCrop");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Cropping…";
          }

          try {
            // Render exact 180x180 circular DP (ideal size: crisp yet ~12-18KB JPEG)
            const OUT_SIZE = 180;
            const outCanvas = document.createElement("canvas");
            outCanvas.width = OUT_SIZE;
            outCanvas.height = OUT_SIZE;
            const octx = outCanvas.getContext("2d");

            // Fill background with dark theme circle
            octx.save();
            octx.beginPath();
            octx.arc(OUT_SIZE / 2, OUT_SIZE / 2, OUT_SIZE / 2, 0, Math.PI * 2);
            octx.closePath();
            octx.clip();

            // Calculate ratio between crop viewport (240px) and output size (180px)
            const ratio = OUT_SIZE / 240;
            octx.translate(OUT_SIZE / 2 + _cropPanX * ratio, OUT_SIZE / 2 + _cropPanY * ratio);
            octx.rotate((_cropRotation * Math.PI) / 180);

            const drawScale = _cropBaseScale * _cropScale * ratio;
            const drawW = (_cropImage.naturalWidth || _cropImage.width) * drawScale;
            const drawH = (_cropImage.naturalHeight || _cropImage.height) * drawScale;
            octx.drawImage(_cropImage, -drawW / 2, -drawH / 2, drawW, drawH);
            octx.restore();

            const dataURL = outCanvas.toDataURL("image/jpeg", 0.82);

            // Close crop modal
            closeCropModal();

            // Set local preview immediately
            profile.photoURL = dataURL;
            updateProfilePhotoUI();
            applyProfileToHUD();
            renderAvatarPicker();

            const statusEl = document.getElementById("playerPhotoStatus");
            const kb = Math.round((dataURL.length * 0.75) / 1024);
            if (statusEl) {
              statusEl.style.display = "block";
              statusEl.textContent = `☁️ Uploading photo (~${kb}KB)…`;
            }

            _waitForMod("__mod_uploadMyProfilePhoto", async () => {
              const url = await window.uploadMyProfilePhoto(dataURL);
              const finalPhoto = url || dataURL;
              profile.photoURL = finalPhoto;
              updateProfilePhotoUI();
              applyProfileToHUD();
              renderAvatarPicker();

              // Synchronize existing card requests for this player
              if (Array.isArray(window.cardRequests)) {
                let updatedReqs = false;
                const myPid = window._currentPlayerId || profile.playerId;
                window.cardRequests.forEach((r) => {
                  if ((myPid && r.playerId === myPid) || (!myPid && r.playerName && r.playerName === profile.name)) {
                    r.photoURL = typeof _lightPhoto === "function" ? _lightPhoto(finalPhoto) : "";
                    updatedReqs = true;
                  }
                });
                if (updatedReqs && typeof window.saveSharedRequests === "function") {
                  window.saveSharedRequests();
                }
              }

              if (statusEl) {
                statusEl.textContent = "✅ Profile photo updated!";
                setTimeout(() => {
                  if (statusEl.textContent.includes("updated")) {
                    statusEl.style.display = "none";
                  }
                }, 4000);
              }
              showToast("📸 Profile photo updated! Visible everywhere across the site.");
            });
          } catch (err) {
            console.error("Crop error:", err);
            showToast("❌ Could not crop photo: " + err.message);
          } finally {
            if (btn) {
              btn.disabled = false;
              btn.textContent = "✨ Set Avatar";
            }
          }
        }
        window.applyCropAndUpload = applyCropAndUpload;

        function handlePlayerPhotoSelected(input) {
          const file = input.files && input.files[0];
          if (!file) return;
          if (!file.type || file.type.indexOf("image/") !== 0) {
            showToast("Please choose an image file (JPEG, PNG, etc.)");
            input.value = "";
            return;
          }
          const statusEl = document.getElementById("playerPhotoStatus");
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = `⏳ Reading ${file.name}…`;
          }

          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              if (statusEl) statusEl.style.display = "none";
              openCropModal(img);
            };
            img.onerror = () => {
              showToast("❌ Could not read that image.");
              if (statusEl) statusEl.style.display = "none";
              input.value = "";
            };
            img.src = e.target.result;
          };
          reader.onerror = () => {
            showToast("❌ Failed to read that file.");
            if (statusEl) statusEl.style.display = "none";
            input.value = "";
          };
          reader.readAsDataURL(file);
        }
        window.handlePlayerPhotoSelected = handlePlayerPhotoSelected;

        async function handleRemovePlayerPhoto() {
          if (!confirm("Remove your custom profile photo and switch back to emoji?")) return;
          const statusEl = document.getElementById("playerPhotoStatus");
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = "🗑️ Removing photo…";
          }
          profile.photoURL = "";
          updateProfilePhotoUI();
          applyProfileToHUD();
          renderAvatarPicker();
          _waitForMod("__mod_removeMyProfilePhoto", async () => {
            const ok = await window.removeMyProfilePhoto();
            if (statusEl) {
              statusEl.textContent = ok ? "✅ Restored emoji avatar" : "";
              setTimeout(() => {
                if (statusEl.textContent.includes("Restored")) {
                  statusEl.style.display = "none";
                }
              }, 2500);
            }
            showToast("🗑️ Photo removed — emoji avatar restored.");
          });
        }

        function saveProfile() {
          const name = document.getElementById("inputPlayerName").value.trim();
          const town = document.getElementById("inputTownName").value.trim();
          if (!name) {
            showToast("Please enter your display name!");
            return;
          }
          if (!town) {
            showToast("Please enter your town name!");
            return;
          }
          const AUTHORITATIVE_ADMINS = ["roomi", "naveen", "ron", "hogwarts"];
          const lowerName = name.toLowerCase();
          const curUname = (window._currentUsername || "").trim().toLowerCase();
          const isAuthAdmin = AUTHORITATIVE_ADMINS.includes(curUname);
          if (!isAuthAdmin) {
            if (
              AUTHORITATIVE_ADMINS.includes(lowerName) ||
              lowerName === "admin" ||
              lowerName === "leader"
            ) {
              showToast("⚠️ This name is reserved for DA leadership.");
              return;
            }
          }
          profile.name = name;
          profile.town = town;
          saveProgress();
          applyProfileToHUD();
          updateProfileStats();
          if (typeof window.saveDeviceAccount === "function" && window._currentPlayerId) {
            window.saveDeviceAccount({
              playerId: window._currentPlayerId,
              username: window._currentUsername,
              name: profile.name,
              town: profile.town,
              avatar: profile.avatar,
              photoURL: profile.photoURL,
            });
          }
          const msg = document.getElementById("profileSavedMsg");
          msg.style.display = "block";
          msg.textContent = `✅ Saved! Welcome, ${name} from ${town}!`;
          setTimeout(() => {
            msg.style.display = "none";
          }, 3000);
          showToast("Profile saved! ⚡");
        }

        function copyPlayerId() {
          const id = document.getElementById(
            "profilePlayerIdValue",
          ).textContent;
          navigator.clipboard
            .writeText(id)
            .then(() => showToast("📋 Player ID copied!"))
            .catch(() => {
              prompt("Your Player ID:", id);
            });
        }

        function applyProfileToHUD() {
          const pill = document.getElementById("hudPlayerName");
          if (pill) pill.textContent = profile.name || "Me";
          const av = document.getElementById("topAvatar");
          if (av) av.innerHTML = avatarHTML(profile.avatar, profile.photoURL);
          const pAv = document.getElementById("profileAvatarDisplay");
          if (pAv) pAv.innerHTML = avatarHTML(profile.avatar, profile.photoURL);
        }

        function updateProfileStats() {
          document.getElementById("pstatCoins").textContent =
            formatCoins(coins);
          document.getElementById("pstatCards").textContent = cardsWon;
          const myPid =
            window._currentPlayerId ||
            (typeof profile === "object" && profile && profile.playerId) ||
            "";
          const myReqs = cardRequests.filter(
            (r) =>
              (myPid && r.playerId === myPid) ||
              (!myPid && r.playerName === profile.name),
          ).length;
          document.getElementById("pstatReqs").textContent = myReqs;
        }

        // ─── ADMIN DASHBOARD ─────────────────────────────────────
        async function openAdmin() {
          if (!adminUnlocked) {
            restoreAdminCache();
          }
          if (!adminUnlocked) {
            document.getElementById("adminGate").style.display = "";
            document.getElementById("adminWrap").classList.remove("unlocked");
            document.getElementById("adminPinInput").value = "";
          } else {
            document.getElementById("adminGate").style.display = "none";
            document.getElementById("adminWrap").classList.add("unlocked");
            applyAdminAccessGating();
            if (window.startLiveAdminListener) {
              window.startLiveAdminListener();
            } else {
              await window.loadSharedRequests(true);
            }
            if (window.setAdminPresenceState) window.setAdminPresenceState("viewing");
            if (window.startLiveAdminPresenceListener) window.startLiveAdminPresenceListener();
            if (window.startLivePlayerPresenceListener) window.startLivePlayerPresenceListener();
            if (typeof window.renderAdminActiveBar === "function") window.renderAdminActiveBar();
            renderAdminList();
            updateAdminStats();
            if (adminAccessLevel === "full") {
              if (window.startLiveJackpotAdminListener) {
                window.startLiveJackpotAdminListener();
              } else {
                await window.loadJackpotEntries();
              }
              if (window.startLiveJJAdminListener) {
                window.startLiveJJAdminListener();
              } else {
                await window.loadJJEntries();
              }
              bridgeJackpotEntriesToCardRequests();
              if (window.startLiveShopRequestsAdminListener) {
                window.startLiveShopRequestsAdminListener();
              } else {
                await window.loadShopRequests();
              }
              if (window.startLiveSuggestionsListener) window.startLiveSuggestionsListener();
              if (window.startLiveGatewayAdminListener) {
                window.startLiveGatewayAdminListener((list) => {
                  if (typeof dagOnFirestoreUpdate === "function") dagOnFirestoreUpdate(list);
                });
              }
              renderAdminShopList();
              updateAdminShopStats();
              await window.loadEventControls();
              ecPopulateAdminUI();
            }
          }
        }

        // ── Grays out / disables the subnav tabs a "limited" (Card Requests
        //    only) admin session isn't allowed into, and restores them for a
        //    "full" session. ──
        function applyAdminAccessGating() {
          const isLimited = adminAccessLevel === "limited";
          ADMIN_RESTRICTED_BTNS.forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
            btn.disabled = isLimited;
            btn.classList.toggle("admin-locked", isLimited);
            btn.textContent = isLimited
              ? "🔒 " + btn.dataset.label.split(" ").slice(1).join(" ")
              : btn.dataset.label;
          });
        }

        async function adminRefresh() {
          showToast("🔄 Refreshing…");
          await window.loadSharedRequests(true);
          if (adminAccessLevel === "full") {
            if (window.loadJackpotEntries) await window.loadJackpotEntries();
            if (window.loadJJEntries) await window.loadJJEntries();
            bridgeJackpotEntriesToCardRequests();
            if (window.loadShopRequests) await window.loadShopRequests();
            if (window.elRenderView) window.elRenderView();
          }
          renderAdminList();
          updateAdminStats();
          showToast("✅ Refreshed!");
        }

        function triggerWrongAdminPin(input) {
          if (!input) input = document.getElementById("adminPinInput");
          if (!input) return;
          input.value = "";
          input.classList.add("shake");
          input.style.borderColor = "#e74c3c";
          if (window.triggerHaptic) window.triggerHaptic([40, 60, 40]);
          if (typeof SFX !== "undefined" && SFX.bomb) SFX.bomb();
          setTimeout(() => {
            if (input) {
              input.classList.remove("shake");
              input.style.borderColor = "";
            }
          }, 1000);
          showToast("❌ Wrong PIN!");
        }

        async function checkAdminPin(e) {
          const input = document.getElementById("adminPinInput");
          if (!input) return;
          const pin = input.value.trim();

          // 1. Auto-verify immediately as soon as a correct PIN is written
          if (pin === ADMIN_PIN_FULL || pin === ADMIN_PIN_LIMITED) {
            adminUnlocked = true;
            adminAccessLevel = pin === ADMIN_PIN_FULL ? "full" : "limited";
            if (typeof window.markCurrentPlayerAsAdmin === "function") {
              window.markCurrentPlayerAsAdmin();
            }
            try {
              localStorage.setItem(ADMIN_CACHE_KEY, pin);
            } catch (err) {
              console.warn("Failed to cache admin PIN", err);
            }
            input.blur();
            document.getElementById("adminGate").style.display = "none";
            document.getElementById("adminWrap").classList.add("unlocked");
            setAdminView("requests", document.getElementById("adminViewReqBtn"));
            applyAdminAccessGating();
            if (window.startLiveAdminListener) {
              window.startLiveAdminListener();
            } else {
              await window.loadSharedRequests(true);
            }
            if (window.setAdminPresenceState) window.setAdminPresenceState("viewing");
            if (window.startLiveAdminPresenceListener) window.startLiveAdminPresenceListener();
            if (window.startLivePlayerPresenceListener) window.startLivePlayerPresenceListener();
            if (typeof window.renderAdminActiveBar === "function") window.renderAdminActiveBar();
            renderAdminList();
            updateAdminStats();
            if (adminAccessLevel === "full") {
              if (window.startLiveJackpotAdminListener) {
                window.startLiveJackpotAdminListener();
              } else {
                window.loadJackpotEntries();
              }
              if (window.startLiveJJAdminListener) {
                window.startLiveJJAdminListener();
              } else {
                window.loadJJEntries();
              }
              bridgeJackpotEntriesToCardRequests();
              if (window.startLiveShopRequestsAdminListener) {
                window.startLiveShopRequestsAdminListener();
              } else {
                window.loadShopRequests().then(() => {
                  renderAdminShopList();
                  updateAdminShopStats();
                });
              }
              if (window.startLiveSuggestionsListener) window.startLiveSuggestionsListener();
              window.loadEventControls &&
                window.loadEventControls().then(ecPopulateAdminUI);
            }
            if (typeof SFX !== "undefined" && SFX.win) SFX.win();
            showToast(
              adminAccessLevel === "full"
                ? "🔓 Admin unlocked!"
                : "🔓 Card Requests unlocked!",
            );
            return;
          }

          // 2. Explicit unlock submission (button click or Enter key)
          const isExplicitSubmit =
            e &&
            (e.key === "Enter" ||
              e.type === "click" ||
              (e.target && e.target.tagName === "BUTTON"));

          // 3. Auto-detect incorrect PIN when maximum length (6 digits) has been entered
          const isFullLength = pin.length >= 6;

          if (isExplicitSubmit) {
            triggerWrongAdminPin(input);
          } else if (isFullLength) {
            setTimeout(() => {
              const v = input.value.trim();
              if (
                !adminUnlocked &&
                v.length >= 6 &&
                v !== ADMIN_PIN_FULL &&
                v !== ADMIN_PIN_LIMITED
              ) {
                triggerWrongAdminPin(input);
              }
            }, 180);
          }
        }

        function adminLock() {
          if (window.stopAllAdminListeners) window.stopAllAdminListeners();
          adminUnlocked = false;
          adminAccessLevel = null;
          try {
            localStorage.removeItem(ADMIN_CACHE_KEY);
          } catch (e) {}
          document.getElementById("adminGate").style.display = "";
          document.getElementById("adminWrap").classList.remove("unlocked");
          const input = document.getElementById("adminPinInput");
          if (input) input.value = "";
          showToast("🔒 Admin locked!");
        }
        window.adminLock = adminLock;

        function setAdminFilter(f, btnEl) {
          adminFilter = f;
          document
            .querySelectorAll(".admin-filter-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          renderAdminList();
        }

        function updateAdminStats() {
          const { inferiorRoundIds } = typeof getJackpotRoundRanking === "function" ? getJackpotRoundRanking() : { inferiorRoundIds: new Set() };
          const active = cardRequests.filter((r) => {
            if (!r || r.adminCleared) return false;
            if (r.source === "jackpot" || r.source === "jumbled_jackpot") {
              const rId = r.roundId || (r.id && r.id.replace(/-c\d+$/, ""));
              if (rId && inferiorRoundIds.has(rId)) return false;
            }
            return true;
          });
          // Group active requests by canonical player and card key to count deduplicated cards
          const playerMap = new Map();
          active.forEach((r) => {
            const pKey = r.playerId
              ? `pid:${String(r.playerId).trim()}`
              : `name:${String(r.playerName || "").trim().toLowerCase()}`;
            if (!playerMap.has(pKey)) playerMap.set(pKey, new Map());
            const cardMap = playerMap.get(pKey);
            const cKey = (r.source === "jackpot" || r.source === "jumbled_jackpot") ? r.id : `${Number(r.setIdx)}-${Number(r.cardIdx)}`;
            const existing = cardMap.get(cKey);
            if (!existing) {
              cardMap.set(cKey, r);
            } else if (existing.status !== "pending" && r.status === "pending") {
              cardMap.set(cKey, r);
            } else if (existing.status === "pending" && r.status === "pending") {
              if (existing.free && !r.free) {
                cardMap.set(cKey, r);
              } else if (existing.free === r.free && new Date(r.timestamp || 0) > new Date(existing.timestamp || 0)) {
                cardMap.set(cKey, r);
              }
            } else if (existing.status !== "pending" && r.status !== "pending") {
              if (new Date(r.timestamp || 0) > new Date(existing.timestamp || 0)) {
                cardMap.set(cKey, r);
              }
            }
          });

          let total = 0,
            pending = 0,
            done = 0,
            declined = 0;
          playerMap.forEach((cardMap) => {
            cardMap.forEach((r) => {
              total++;
              if (r.status === "pending") pending++;
              else if (r.status === "done") done++;
              else if (r.status === "declined") declined++;
            });
          });

          const totalEl = document.getElementById("adStatTotal");
          const pendingEl = document.getElementById("adStatPending");
          const doneEl = document.getElementById("adStatDone");
          const declinedEl = document.getElementById("adStatDeclined");
          if (totalEl) totalEl.textContent = total;
          if (pendingEl) pendingEl.textContent = pending;
          if (doneEl) doneEl.textContent = done;
          if (declinedEl) declinedEl.textContent = declined;
        }

        // Helper to retrieve all eligible uncleared Done/Declined requests for a player
        // directly from underlying cardRequests before display deduplication and status filtering.
        function getPlayerEligibleDoneDeclinedReqs(group) {
          if (!group) return [];
          const pId = group.playerId ? String(group.playerId).trim() : "";
          const pName = group.playerName ? String(group.playerName).trim().toLowerCase() : "";
          return cardRequests.filter((r) => {
            if (!r || r.adminCleared) return false;
            if (window._adminClearedIds && window._adminClearedIds.has(r.id)) return false;
            const rPid = r.playerId ? String(r.playerId).trim() : "";
            const rName = r.playerName ? String(r.playerName).trim().toLowerCase() : "";
            const isSamePlayer =
              (pId && rPid && pId === rPid) ||
              (pName && rName && pName === rName);
            if (!isSamePlayer) return false;
            const mod = window._adminModifiedReqs && window._adminModifiedReqs.get(r.id);
            const status = (mod && mod.status) || r.status;
            return status === "done" || status === "declined";
          });
        }

        // ── Realtime Player & Admin Presence for Mantralay / Admin Panel ──
        window._playerPresenceCache = {};
        window.onPlayerPresenceUpdate = function (presenceMap) {
          if (!presenceMap || typeof presenceMap !== "object") return;
          window._playerPresenceCache = presenceMap;
          updateVisiblePlayerOnlineStatuses();
        };

        function updateVisiblePlayerOnlineStatuses() {
          const now = Date.now();
          const badges = document.querySelectorAll(".req-player-online-badge");
          badges.forEach((el) => {
            let pid = el.dataset.pid;
            const name = el.dataset.name;
            if (!pid && name && window._usernameToPidMap) {
              pid = window._usernameToPidMap[name];
            }
            const p = pid && window._playerPresenceCache ? window._playerPresenceCache[pid] : null;
            const isOnline = !!(p && p.online !== false && p.lastActive && (now - p.lastActive < 4 * 60 * 1000));
            const lastActive = p ? p.lastActive : 0;
            const dot = el.querySelector(".ec-status-dot");
            const txt = el.querySelector(".rpo-text");
            if (dot) {
              dot.className = `ec-status-dot ${isOnline ? "on" : "off"}`;
            }
            if (txt) {
              txt.textContent = isOnline ? "Online now" : "Last seen " + socialFormatLastSeen(lastActive);
            }
          });
        }

        window.renderAdminActiveBar = function (adminsList) {
          const listEl = document.getElementById("adminActiveList");
          const countEl = document.getElementById("adminActiveCount");
          if (!listEl) return;

          const myPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";
          const isAdminAuth = typeof window._isAdminAuthorized === "function" ? window._isAdminAuthorized() : false;

          let list = Array.isArray(adminsList) ? [...adminsList] : [];

          // If current admin is authorized and in Mantralay, guarantee they are represented
          if (isAdminAuth && myPid) {
            const hasMe = list.some((a) => a && a.pid === myPid);
            if (!hasMe) {
              const myName = (typeof profile === "object" && profile && profile.name) || (typeof username === "string" && username) || "Admin";
              const myAvatar = (typeof profile === "object" && profile && profile.avatar) || "🧙";
              const myPhoto = (typeof profile === "object" && profile && profile.photoURL) || "";
              list.unshift({
                pid: myPid,
                name: myName,
                avatar: myAvatar,
                photoURL: myPhoto,
                online: true,
                lastActive: Date.now(),
                action: "viewing"
              });
            }
          }

          if (countEl) countEl.textContent = `${list.length} Active`;

          if (list.length === 0) {
            listEl.innerHTML = '<div class="aab-empty">No admins currently in Mantralay</div>';
            return;
          }

          const now = Date.now();

          // Sort so that current admin is first, then other admins
          const sorted = [...list].sort((a, b) => {
            if (a.pid === myPid) return -1;
            if (b.pid === myPid) return 1;
            return (a.name || "").localeCompare(b.name || "");
          });

          listEl.innerHTML = "";
          sorted.forEach((adm) => {
            const isMe = adm.pid === myPid;
            const isSending = adm.action === "sending" && adm.lastSentAt && (now - adm.lastSentAt < 15000);
            const chip = document.createElement("div");
            chip.className = `aab-admin-chip ${isSending ? "is-sending" : ""}`;
            chip.innerHTML = `
              <div class="aab-av">${avatarHTML(adm.avatar, adm.photoURL, adm.pid, adm.name)}</div>
              <span class="aab-name">${escapeHtml(adm.name || "Admin")}${isMe ? " (You)" : ""}</span>
              <span class="aab-chip-status ${isSending ? "aab-status-sending" : "aab-status-online"}">
                ${isSending ? "🎴 Sending cards..." : "🟢 Active"}
              </span>
            `;
            listEl.appendChild(chip);
          });
        };

        // ── Local Device Card Lock (persisted in localStorage, 0 database writes) ──
        const ADMIN_LOCKED_CARDS_KEY = "da_admin_locked_req_ids";
        try {
          const saved = localStorage.getItem(ADMIN_LOCKED_CARDS_KEY);
          window._adminLockedReqIds = new Set(saved ? JSON.parse(saved) : []);
        } catch (e) {
          window._adminLockedReqIds = new Set();
        }

        window.isCardLocked = function (reqId) {
          return !!(reqId && window._adminLockedReqIds && window._adminLockedReqIds.has(String(reqId)));
        };

        window.toggleCardLock = function (reqId, event) {
          if (event) {
            event.stopPropagation();
            event.preventDefault();
          }
          if (!reqId) return;
          const idStr = String(reqId);
          if (!window._adminLockedReqIds) window._adminLockedReqIds = new Set();

          const willLock = !window._adminLockedReqIds.has(idStr);
          if (willLock) {
            window._adminLockedReqIds.add(idStr);
            showToast("🔒 Card locked on this device (Protected from Done & Done All)");
          } else {
            window._adminLockedReqIds.delete(idStr);
            showToast("🔓 Card unlocked on this device");
          }

          try {
            localStorage.setItem(ADMIN_LOCKED_CARDS_KEY, JSON.stringify([...window._adminLockedReqIds]));
          } catch (e) {
            console.warn("Failed to persist locked card", e);
          }

          if (window.triggerHaptic) window.triggerHaptic(35);
          renderAdminList();
        };

        window.pruneLockedReq = function (reqId) {
          if (!reqId || !window._adminLockedReqIds || !window._adminLockedReqIds.has(String(reqId))) return;
          window._adminLockedReqIds.delete(String(reqId));
          try {
            localStorage.setItem(ADMIN_LOCKED_CARDS_KEY, JSON.stringify([...window._adminLockedReqIds]));
          } catch (e) {}
        };

        const ADMIN_CARD_SORT_KEY = "da_admin_card_sort_order";
        window._adminCardSortOrder = (() => {
          try {
            return localStorage.getItem(ADMIN_CARD_SORT_KEY) || "latest";
          } catch (e) {
            return "latest";
          }
        })();

        window.setAdminCardSortOrder = function (order) {
          if (!["latest", "oldest", "highest"].includes(order)) order = "latest";
          window._adminCardSortOrder = order;
          try {
            localStorage.setItem(ADMIN_CARD_SORT_KEY, order);
          } catch (e) {}
          const sel = document.getElementById("adminCardSortSelect");
          if (sel && sel.value !== order) {
            sel.value = order;
          }
          if (window.triggerHaptic) window.triggerHaptic(25);
          renderAdminList();
        };

        function renderAdminList() {
          const listEl = document.getElementById("adminReqList");
          const search = (
            document.getElementById("adminSearch").value || ""
          ).toLowerCase();
          const { inferiorRoundIds } = typeof getJackpotRoundRanking === "function" ? getJackpotRoundRanking() : { inferiorRoundIds: new Set() };
          let filtered = cardRequests.filter((r) => {
            if (!r) return false;
            // Soft-cleared cards are moved to History and hidden from active view
            if (r.adminCleared) return false;
            // If requested via jackpot or jumbled jackpot, hide only if player has a BETTER round
            if (r.source === "jackpot" || r.source === "jumbled_jackpot") {
              const rId = r.roundId || (r.id && r.id.replace(/-c\d+$/, ""));
              if (rId && inferiorRoundIds.has(rId)) {
                return false; // Skip cards from inferior jackpot rounds
              }
            }
            if (search) {
              const card = SETS[r.setIdx] && SETS[r.setIdx].cards[r.cardIdx];
              const hay = (
                (r.playerName || "") +
                " " +
                (r.townName || "") +
                " " +
                (card ? card.name : "") +
                " " +
                (r.source || "") +
                " " +
                (r.note || "")
              ).toLowerCase();
              if (!hay.includes(search)) return false;
            }
            return true;
          });

          // ── Group all requests by player using dual index maps (byPid and byName),
          //    ensuring all requests from the same player are kept in a single group ──
          const groups = [];
          const groupIndexByPid = new Map();
          const groupIndexByName = new Map();

          filtered.forEach((req) => {
            const rawPid = req.playerId ? String(req.playerId).trim() : "";
            const rawName = req.playerName
              ? String(req.playerName).trim().toLowerCase()
              : "";

            let gi;
            if (rawPid && groupIndexByPid.has(rawPid)) {
              gi = groupIndexByPid.get(rawPid);
            } else if (rawName && groupIndexByName.has(rawName)) {
              gi = groupIndexByName.get(rawName);
            }

            if (gi === undefined) {
              gi = groups.length;
              if (rawPid) groupIndexByPid.set(rawPid, gi);
              if (rawName) groupIndexByName.set(rawName, gi);

              let photo = req.photoURL;
              if (
                !photo &&
                typeof profile === "object" &&
                profile &&
                profile.photoURL
              ) {
                if (
                  (rawPid && rawPid === window._currentPlayerId) ||
                  (rawName &&
                    rawName === String(profile.name || "").trim().toLowerCase())
                ) {
                  photo = profile.photoURL;
                }
              }
              if (
                !photo &&
                rawPid &&
                window._playerPhotoMap &&
                window._playerPhotoMap[rawPid]
              ) {
                photo = window._playerPhotoMap[rawPid];
              }

              groups.push({
                playerId: req.playerId,
                playerName: req.playerName,
                townName: req.townName,
                avatar: req.avatar,
                photoURL: photo,
                reqs: [],
              });
            } else {
              const g = groups[gi];
              if (!g.playerId && rawPid) {
                g.playerId = req.playerId;
                groupIndexByPid.set(rawPid, gi);
              }
              if (!g.photoURL && req.photoURL) g.photoURL = req.photoURL;
              if (!g.townName && req.townName) g.townName = req.townName;
              if (rawName && !groupIndexByName.has(rawName))
                groupIndexByName.set(rawName, gi);
            }
            groups[gi].reqs.push(req);
          });

          // Within each player's group, deduplicate ALL requests for the same card across ALL statuses
          // so admins NEVER see duplicate cards, and sort Set 1→15, Card 1→10.
          const activeGroups = [];
          groups.forEach((g) => {
            const cardMap = new Map();
            g.reqs.forEach((r) => {
              const cardKey = (r.source === "jackpot" || r.source === "jumbled_jackpot")
                ? r.id
                : `${Number(r.setIdx)}-${Number(r.cardIdx)}`;
              if (!cardMap.has(cardKey)) {
                cardMap.set(cardKey, { primary: r, dups: [] });
              } else {
                const entry = cardMap.get(cardKey);
                let replacePrimary = false;
                if (
                  entry.primary.status !== "pending" &&
                  r.status === "pending"
                ) {
                  replacePrimary = true;
                } else if (
                  entry.primary.status === "pending" &&
                  r.status === "pending"
                ) {
                  if (entry.primary.free && !r.free) {
                    replacePrimary = true;
                  } else if (
                    entry.primary.free === r.free &&
                    new Date(r.timestamp || 0) >
                      new Date(entry.primary.timestamp || 0)
                  ) {
                    replacePrimary = true;
                  }
                } else if (
                  entry.primary.status !== "pending" &&
                  r.status !== "pending"
                ) {
                  if (
                    new Date(r.timestamp || 0) >
                    new Date(entry.primary.timestamp || 0)
                  ) {
                    replacePrimary = true;
                  }
                }
                if (replacePrimary) {
                  entry.dups.push(entry.primary.id);
                  if (Array.isArray(entry.primary._duplicateReqIds)) {
                    entry.dups.push(...entry.primary._duplicateReqIds);
                  }
                  entry.primary = r;
                } else {
                  entry.dups.push(r.id);
                  if (Array.isArray(r._duplicateReqIds)) {
                    entry.dups.push(...r._duplicateReqIds);
                  }
                }
              }
            });

            const dedupedReqs = [];
            cardMap.forEach((entry) => {
              const primary = entry.primary;
              primary._duplicateReqIds = Array.from(
                new Set(entry.dups.filter((id) => id && id !== primary.id)),
              );
              if (adminFilter === "all" || primary.status === adminFilter) {
                dedupedReqs.push(primary);
              }
            });

            if (dedupedReqs.length > 0) {
              dedupedReqs.sort(
                (a, b) =>
                  Number(a.setIdx) - Number(b.setIdx) ||
                  Number(a.cardIdx) - Number(b.cardIdx),
              );
              g.reqs = dedupedReqs;
              activeGroups.push(g);
            }
          });

          // Sync sort dropdown UI with current preference
          const sortSel = document.getElementById("adminCardSortSelect");
          if (sortSel && sortSel.value !== (window._adminCardSortOrder || "latest")) {
            sortSel.value = window._adminCardSortOrder || "latest";
          }

          const currentSort = window._adminCardSortOrder || (sortSel ? sortSel.value : "latest") || "latest";
          activeGroups.sort((a, b) => {
            const getTsList = (group) =>
              (group.reqs || [])
                .map((r) => {
                  const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
                  return isNaN(t) ? 0 : t;
                })
                .filter((t) => t > 0);

            const aTs = getTsList(a);
            const bTs = getTsList(b);

            const aLatest = aTs.length > 0 ? Math.max(...aTs) : 0;
            const bLatest = bTs.length > 0 ? Math.max(...bTs) : 0;

            const aOldest = aTs.length > 0 ? Math.min(...aTs) : Infinity;
            const bOldest = bTs.length > 0 ? Math.min(...bTs) : Infinity;

            if (currentSort === "latest") {
              if (bLatest !== aLatest) return bLatest - aLatest;
              return (b.reqs ? b.reqs.length : 0) - (a.reqs ? a.reqs.length : 0);
            } else if (currentSort === "oldest") {
              const aVal = isFinite(aOldest) ? aOldest : 0;
              const bVal = isFinite(bOldest) ? bOldest : 0;
              if (aVal !== bVal) return aVal - bVal;
              return (b.reqs ? b.reqs.length : 0) - (a.reqs ? a.reqs.length : 0);
            } else if (currentSort === "highest") {
              const aCount = a.reqs ? a.reqs.length : 0;
              const bCount = b.reqs ? b.reqs.length : 0;
              if (bCount !== aCount) return bCount - aCount;
              return bLatest - aLatest;
            }
            return 0;
          });

          if (activeGroups.length === 0) {
            listEl.innerHTML = `
      <div class="req-empty">
        <div class="re-icon">📭</div>
        <h3>No Requests Yet</h3>
        <p>${search ? "Nothing matches your search." : "Card requests from DA members will appear here!"}</p>
      </div>`;
            updateAdminStats();
            return;
          }

          listEl.innerHTML = "";
          const THEMES = ["theme-gold", "theme-purple", "theme-emerald", "theme-cyan"];

          activeGroups.forEach((group, groupIdx) => {
            const pending = group.reqs.filter(
              (r) => r.status === "pending",
            ).length;
            const done = group.reqs.filter((r) => r.status === "done").length;
            const declined = group.reqs.filter(
              (r) => r.status === "declined",
            ).length;

            const themeClass = THEMES[groupIdx % THEMES.length];
            const groupEl = document.createElement("div");
            groupEl.className = `req-group ${themeClass}`;
            groupEl.id = `reqGroup-${groupIdx}`;

            let countBadges = "";
            if (pending)
              countBadges += `<span class="req-status-badge badge-pending">⏳ ${pending}</span>`;
            if (done)
              countBadges += `<span class="req-status-badge badge-done">✅ ${done}</span>`;
            if (declined)
              countBadges += `<span class="req-status-badge badge-declined">❌ ${declined}</span>`;

            let bodyHtml = "";
            let rsColorToggle = 0; // alternates 0/1 each time the set changes within this player's group
            let rsPrevSetIdx = null;
            const RS_COLORS = ["#ffffff", "var(--teal)"];
            group.reqs.forEach((req) => {
              const set = (typeof SETS !== "undefined" && SETS && SETS[req.setIdx]) || { name: `Set ${req.setIdx + 1}`, cards: [] };
              const card = (set.cards && set.cards[req.cardIdx]) || { name: `Card ${req.cardIdx + 1}`, emoji: "🃏" };
              const setNumMatch = (set.name || "").match(/^Set\s*(\d+)/);
              const setNumLabel = setNumMatch ? `Set ${setNumMatch[1]}` : (set.name || `Set ${req.setIdx + 1}`);
              const setTheme = (set.name || "").replace(/^Set\s*\d+\s*–\s*/, "") || (card.name || `Card ${req.cardIdx + 1}`);
              if (rsPrevSetIdx === null) {
                rsPrevSetIdx = req.setIdx;
              } else if (req.setIdx !== rsPrevSetIdx) {
                rsColorToggle = 1 - rsColorToggle;
                rsPrevSetIdx = req.setIdx;
              }
              const rsColor = RS_COLORS[rsColorToggle];
              const ts = new Date(req.timestamp).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              const statusBadge = {
                pending:
                  '<span class="req-status-badge badge-pending">⏳ Pending</span>',
                done: '<span class="req-status-badge badge-done">✅ Sent</span>',
                declined:
                  '<span class="req-status-badge badge-declined">❌ Declined</span>',
              }[req.status];

              const costBadge = req.free 
                ? '<span class="req-status-badge badge-free" style="background:rgba(240,192,48,.18);color:#f0c030;border:1px solid rgba(240,192,48,.4)">🎁 Free</span>' 
                : (Number(req.coinsSpent) > 0 ? `<span class="req-status-badge badge-coin" style="background:rgba(251,191,36,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.4)">🪙 ${req.coinsSpent}</span>` : "");

              const sourceBadge = req.source === "jackpot"
                ? '<span class="req-status-badge badge-jp">🎯 Jackpot</span>'
                : req.source === "jumbled_jackpot"
                  ? '<span class="req-status-badge badge-jj">🔀 Jumbled Jackpot</span>'
                  : req.source === "cds"
                    ? '<span class="req-status-badge badge-cds">📇 CDS</span>'
                    : (req.source === "collection"
                      ? '<span class="req-status-badge badge-coll">🃏 Collection</span>'
                      : "");

              const sentByChip =
                req.status === "done" && (req.sentByName || req.sentByPhoto || req.sentByAvatar)
                  ? `<div class="req-sent-by-chip" title="Sent by ${escapeHtml(req.sentByName || "Admin")}">
                       <span class="rsb-label">Sent by</span>
                       <div class="rsb-avatar">${avatarHTML(req.sentByAvatar, req.sentByPhoto, req.sentByPid, req.sentByName)}</div>
                       <span class="rsb-name">${escapeHtml(req.sentByName || "Admin")}</span>
                     </div>`
                  : "";

              // Build actions row (ergonomic, compact buttons)
              const isLocked = window.isCardLocked(req.id);
              let actionsHtml;
              if (req.status === "pending") {
                actionsHtml = `
                  <button type="button" class="req-card-btn btn-lock ${isLocked ? "is-locked" : ""}" 
                          title="${isLocked ? "Card is locked on this device (Click to unlock)" : "Lock card on this device (Prevent Done & Done All)"}" 
                          onclick="toggleCardLock('${req.id}', event)">
                    ${isLocked ? "🔒" : "🔓"}
                  </button>
                  <button type="button" class="req-card-btn btn-decline" onclick="setReqStatus('${req.id}','declined')">❌ Decline</button>
                  <button type="button" class="req-card-btn btn-done" ${isLocked ? "disabled title='Card is locked on this device. Unlock to mark Done.'" : ""} onclick="setReqStatus('${req.id}','done')">✅ Done</button>
                `;
              } else {
                actionsHtml = `
                  <button type="button" class="req-card-btn btn-undo" onclick="setReqStatus('${req.id}','pending')">↩️ Undo</button>
                `;
              }

              const lockedBadge = isLocked && req.status === "pending"
                ? '<span class="req-status-badge badge-locked" title="Protected on this device">🔒 Locked</span>'
                : "";

              bodyHtml += `
                <div class="req-subitem status-${req.status} ${isLocked && req.status === "pending" ? "is-locked" : ""}">
                  <div class="req-subitem-left">
                    <div class="req-card-title-row">
                      <span class="rc-set-chip">${setNumLabel}</span>
                      <span class="rc-card-title" style="color:${rsColor}">${card.emoji || "🃏"} ${escapeHtml(setTheme)} <span class="rc-card-num" style="color:${rsColor}">${req.cardIdx + 1}</span></span>
                    </div>
                    <div class="req-card-meta-row">
                      <span class="rc-date">📅 ${ts}</span>
                      ${statusBadge}
                      ${sourceBadge}
                      ${lockedBadge}
                      ${costBadge}
                      ${sentByChip}
                    </div>
                    ${req.note ? `<div class="req-note-row" style="margin:2px 0 0;padding:2px 0;border:none;">💬 "${escapeHtml(req.note)}"</div>` : ""}
                  </div>
                  <div class="req-subitem-right">
                    ${actionsHtml}
                  </div>
                </div>`;
            });

            const doneAndDeclined = getPlayerEligibleDoneDeclinedReqs(group).length;
            const groupKey = (group.playerId ? String(group.playerId).trim() : (group.playerName || "").trim().toLowerCase());
            if (!window._adminExpandedPlayerKeys) {
              window._adminExpandedPlayerKeys = new Set();
            }
            const isExpanded = window._adminExpandedPlayerKeys.has(groupKey);
            if (!isExpanded) {
              groupEl.classList.add("is-collapsed");
            }

            const pPid = group.playerId || (window._usernameToPidMap && window._usernameToPidMap[group.playerName]) || "";
            const pres = (window._playerPresenceCache && pPid && window._playerPresenceCache[pPid]) || null;
            const now = Date.now();
            const isPlayerOnline = !!(pres && pres.online !== false && pres.lastActive && (now - pres.lastActive < 4 * 60 * 1000));
            const playerLastActive = pres ? pres.lastActive : 0;

            const pendingReqsList = group.reqs.filter((r) => r.status === "pending");
            const unlockedPending = pendingReqsList.filter((r) => !window.isCardLocked(r.id)).length;
            const allLockedInGroup = pending > 0 && unlockedPending === 0;

            let doneAllChipHtml = "";
            if (pending > 0) {
              if (allLockedInGroup) {
                doneAllChipHtml = `<button type="button" class="req-group-doneall-chip is-all-locked" title="All ${pending} pending card${pending > 1 ? "s" : ""} for ${escapeHtml(group.playerName)} are locked on this device" style="opacity:0.75;border-color:rgba(245,197,66,0.6);background:rgba(245,197,66,0.12);color:#ffd54f;">🔒 All Locked (${pending})</button>`;
              } else {
                doneAllChipHtml = `<button type="button" class="req-group-doneall-chip" title="Mark ${unlockedPending} unlocked request${unlockedPending > 1 ? "s" : ""} from ${escapeHtml(group.playerName)} as Done (${pending - unlockedPending} locked card${pending - unlockedPending > 1 ? "s" : ""} protected)">✅ Done All (${unlockedPending})</button>`;
              }
            }

            groupEl.innerHTML = `
              <div class="req-group-header">
                <div class="req-group-topbar-stripe"></div>
                <div class="req-group-header-content">
                  <div class="req-hdr-top-meta">
                    <div class="req-hdr-meta-left">
                      <button type="button" class="req-player-order-pill req-player-chip-btn" title="Click to collapse / expand ${escapeHtml(group.playerName)}'s cards">
                        <span class="rpc-label">PLAYER #${groupIdx + 1}</span>
                        <span class="rpc-arrow">${isExpanded ? "▼" : "▶"}</span>
                      </button>
                      ${group.playerId ? `<span class="req-pid-chip">${escapeHtml(group.playerId)}</span>` : ""}
                    </div>
                    <div class="req-hdr-meta-right">
                      <div class="req-group-count-badges">${countBadges}</div>
                    </div>
                  </div>
                  <div class="req-hdr-main-row">
                    <div class="req-hdr-player-info" title="Click to collapse / expand ${escapeHtml(group.playerName)}'s cards">
                      <div class="req-player-av">${avatarHTML(group.avatar, group.photoURL, group.playerId, group.playerName)}</div>
                      <div class="req-player-details">
                        <div class="req-player-name">${escapeHtml(group.playerName)}</div>
                        <div class="req-player-subline">
                          <span class="req-player-town">🏡 ${escapeHtml(group.townName || "No Town")}</span>
                          <span class="req-player-online-badge" data-pid="${escapeHtml(group.playerId || "")}" data-name="${escapeHtml((group.playerName || "").trim().toLowerCase())}">
                            <span class="ec-status-dot ${isPlayerOnline ? "on" : "off"}"></span>
                            <span class="rpo-text">${isPlayerOnline ? "Online now" : "Last seen " + socialFormatLastSeen(playerLastActive)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="req-group-header-actions">
                      ${doneAndDeclined > 0 ? `<button type="button" class="req-group-clear-chip" title="Clear ${doneAndDeclined} Done and Declined cards for ${escapeHtml(group.playerName)} from active view">🗑️ Clear (${doneAndDeclined})</button>` : ""}
                      ${doneAllChipHtml}
                    </div>
                  </div>
                </div>
              </div>
              <div class="req-group-collapsed-banner">
                ✨ ${escapeHtml(group.playerName)}'s cards are collapsed (${group.reqs.length} cards) — tap to view
              </div>
              <div class="req-group-body">${bodyHtml}</div>
              <div class="req-group-footer">
                <span class="rgf-line"></span>
                <span class="rgf-badge">End of ${escapeHtml(group.playerName)}'s requests • ${group.reqs.length} card${group.reqs.length > 1 ? "s" : ""}</span>
                <span class="rgf-line"></span>
              </div>
            `;

            // Wire up the Clear button
            const clearBtn = groupEl.querySelector(".req-group-clear-chip");
            if (clearBtn) {
              clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                clearPlayerDoneRequests(group);
              });
            }

            // Wire up the "Done All" chip
            const doneAllBtn = groupEl.querySelector(".req-group-doneall-chip");
            if (doneAllBtn) {
              doneAllBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setGroupDone(group);
              });
            }

            // Wire up the Collapse toggle across header and collapsed banner
            const headerEl = groupEl.querySelector(".req-group-header");
            const chipBtn = groupEl.querySelector(".req-player-chip-btn");
            const banner = groupEl.querySelector(".req-group-collapsed-banner");
            const toggleCollapse = (e) => {
              if (
                e &&
                e.target &&
                (e.target.closest(".req-group-doneall-chip") ||
                  e.target.closest(".req-group-clear-chip") ||
                  e.target.closest(".req-pid-chip") ||
                  e.target.closest(".req-card-btn"))
              ) {
                return;
              }
              const willBeExpanded = groupEl.classList.contains("is-collapsed");
              if (willBeExpanded) {
                groupEl.classList.remove("is-collapsed");
                window._adminExpandedPlayerKeys.add(groupKey);
              } else {
                groupEl.classList.add("is-collapsed");
                window._adminExpandedPlayerKeys.delete(groupKey);
              }
              const arrow = chipBtn ? chipBtn.querySelector(".rpc-arrow") : null;
              if (arrow) arrow.textContent = willBeExpanded ? "▼" : "▶";
            };
            if (headerEl) headerEl.addEventListener("click", toggleCollapse);
            if (banner) banner.addEventListener("click", toggleCollapse);

            listEl.appendChild(groupEl);
          });
          updateAdminStats();
        }

        // Clear Done and Declined requests for a single player
        async function clearPlayerDoneRequests(group) {
          if (!group) return;
          const targetReqs = getPlayerEligibleDoneDeclinedReqs(group);
          if (!targetReqs.length) {
            showToast("ℹ️ No Done or Declined requests to clear for this player.");
            return;
          }

          const count = targetReqs.length;
          const pName = group.playerName || "this player";
          if (
            !confirm(
              `Clear ${count} completed request${count > 1 ? "s" : ""} for ${pName} from active Admin view?\n\nThey will be moved to History and remain visible as Received / Done to the player.`
            )
          ) {
            return;
          }

          if (!window._adminClearedIds) window._adminClearedIds = new Set();
          if (!window._adminModifiedReqs) window._adminModifiedReqs = new Map();
          const targetIds = new Set(targetReqs.map((r) => r.id));
          const prevStates = targetReqs.map((r) => ({
            req: r,
            adminCleared: r.adminCleared,
            adminClearedAt: r.adminClearedAt,
            hadMod: window._adminModifiedReqs.has(r.id),
            prevMod: window._adminModifiedReqs.has(r.id)
              ? { ...window._adminModifiedReqs.get(r.id) }
              : null,
          }));
          const clearTime = new Date().toISOString();

          // Optimistically mark this player's completed requests as adminCleared
          targetReqs.forEach((r) => {
            r.adminCleared = true;
            if (!r.adminClearedAt) r.adminClearedAt = clearTime;
            window._adminClearedIds.add(r.id);
            const existing = window._adminModifiedReqs.get(r.id) || {};
            window._adminModifiedReqs.set(r.id, {
              ...existing,
              status: r.status,
              adminCleared: true,
              adminClearedAt: r.adminClearedAt,
              updatedAt: clearTime,
            });
          });

          renderAdminList();
          updateAdminStats();
          showToast(`🗑️ Clearing ${count} request${count > 1 ? "s" : ""} for ${pName}…`);

          const clearFn = window.adminClearSharedRequests || window.saveSharedRequests;
          const ok = await clearFn(targetIds);
          if (ok === true) {
            renderAdminList();
            updateAdminStats();
            showToast(`✅ ${count} request${count > 1 ? "s" : ""} for ${pName} cleared! (Saved in History)`);
          } else {
            // Revert optimistic changes if persistence failed
            prevStates.forEach(({ req, adminCleared, adminClearedAt, hadMod, prevMod }) => {
              req.adminCleared = adminCleared;
              req.adminClearedAt = adminClearedAt;
              if (!adminCleared) window._adminClearedIds.delete(req.id);
              if (hadMod) {
                window._adminModifiedReqs.set(req.id, prevMod);
              } else {
                window._adminModifiedReqs.delete(req.id);
              }
            });
            renderAdminList();
            updateAdminStats();
            showToast("⚠️ Could not clear requests — check connection.");
          }
        }

        // Mark every pending request within a single player's group as "done" in
        // one click with a single atomic batch save and admin attribution.
        function setGroupDone(group) {
          const totalPending = group.reqs.filter((r) => r.status === "pending");
          const pendingReqs = totalPending.filter((r) => !window.isCardLocked(r.id));
          if (!pendingReqs.length) {
            if (totalPending.length > 0) {
              showToast("🔒 All pending cards for this player are locked on this device!");
            }
            return;
          }
          if (window.setAdminPresenceState) {
            window.setAdminPresenceState("sending");
          }
          const now = new Date().toISOString();
          if (!window._adminDoneIds) window._adminDoneIds = new Set();
          if (!window._adminModifiedReqs) window._adminModifiedReqs = new Map();

          const adminName = (typeof profile === "object" && profile && profile.name) || "Admin";
          const adminAvatar = (typeof profile === "object" && profile && profile.avatar) || "🧙";
          const adminPhoto = typeof _lightPhoto === "function" && typeof profile === "object" && profile ? _lightPhoto(profile.photoURL) : "";
          const adminPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";

          const allPendingReqs = [];
          const seenPendingIds = new Set();
          pendingReqs.forEach((r) => {
            if (!seenPendingIds.has(r.id)) {
              seenPendingIds.add(r.id);
              allPendingReqs.push(r);
            }
            if (Array.isArray(r._duplicateReqIds)) {
              r._duplicateReqIds.forEach((dupId) => {
                if (!seenPendingIds.has(dupId) && !window.isCardLocked(dupId)) {
                  seenPendingIds.add(dupId);
                  const dupReq = cardRequests.find((cr) => cr.id === dupId);
                  if (dupReq) allPendingReqs.push(dupReq);
                }
              });
            }
            const targetPid = r.playerId ? String(r.playerId).trim() : (group.playerId ? String(group.playerId).trim() : "");
            const targetName = r.playerName ? String(r.playerName).trim().toLowerCase() : String(group.playerName || "").trim().toLowerCase();
            const sIdx = Number(r.setIdx);
            const cIdx = Number(r.cardIdx);
            cardRequests.forEach((other) => {
              if (!other || seenPendingIds.has(other.id) || window.isCardLocked(other.id)) return;
              const oPid = other.playerId ? String(other.playerId).trim() : "";
              const oName = other.playerName ? String(other.playerName).trim().toLowerCase() : "";
              const samePlayer = (targetPid && oPid && targetPid === oPid) || (targetName && oName && targetName === oName);
              if (
                samePlayer &&
                Number(other.setIdx) === sIdx &&
                Number(other.cardIdx) === cIdx &&
                other.status === "pending" &&
                !other.adminCleared &&
                ((r.source === "jackpot" || r.source === "jumbled_jackpot") ? other.source === r.source : (other.source !== "jackpot" && other.source !== "jumbled_jackpot"))
              ) {
                seenPendingIds.add(other.id);
                allPendingReqs.push(other);
              }
            });
          });

          allPendingReqs.forEach((r) => {
            r.status = "done";
            r.updatedAt = now;
            r.sentByName = adminName;
            r.sentByAvatar = adminAvatar;
            r.sentByPhoto = adminPhoto;
            r.sentByPid = adminPid;
            r.sentAt = now;
            window._adminDoneIds.add(r.id);
            const donePayload = {
              status: "done",
              updatedAt: now,
              sentByName: adminName,
              sentByAvatar: adminAvatar,
              sentByPhoto: adminPhoto,
              sentByPid: adminPid,
              sentAt: now,
            };
            window._adminModifiedReqs.set(r.id, donePayload);
            if (typeof window.updateSharedCardRequest === "function") {
              window.updateSharedCardRequest(r.id, donePayload);
            }
          });
          renderAdminList();
          updateAdminStats();
          if (adminPid && typeof window.recordAdminCardsSentAndAura === "function") {
            window.recordAdminCardsSentAndAura(adminPid, pendingReqs.length);
          }
          SFX.coin && SFX.coin();
          const skippedCount = totalPending.length - pendingReqs.length;
          if (skippedCount > 0) {
            showToast(`✅ Marked ${allPendingReqs.length} request(s) as Done (${skippedCount} locked card(s) protected)!`);
          } else {
            showToast(`✅ Marked all ${allPendingReqs.length} request${allPendingReqs.length > 1 ? "s" : ""} from ${group.playerName} as Done!`);
          }

          // Trigger card deduction from player's account in Firestore (unique cards only; never deduct jackpot/JJ prize cards)
          const targetPid = group.playerId || (pendingReqs[0] && pendingReqs[0].playerId) || (window._usernameToPidMap && window._usernameToPidMap[group.playerName]);
          if (targetPid && typeof window.adminDeductCardsBatchFromPlayer === "function") {
            const seenCardKeys = new Set();
            const cardList = [];
            pendingReqs.forEach((r) => {
              if (r.source === "jackpot" || r.source === "jumbled_jackpot") return; // Won cards are rewards, not collection trades!
              const k = `${r.setIdx}-${r.cardIdx}`;
              if (!seenCardKeys.has(k)) {
                seenCardKeys.add(k);
                cardList.push({ setIdx: r.setIdx, cardIdx: r.cardIdx });
              }
            });
            if (cardList.length > 0) {
              Promise.resolve(window.adminDeductCardsBatchFromPlayer(targetPid, cardList))
              .then((result) => {
                if (result && result.quotaExceeded) {
                  showToast(
                    `⚠️ Firebase daily quota exceeded — card deductions skipped. Upgrade to Blaze plan or wait for daily reset.`,
                    6000,
                  );
                } else if (result === false) {
                  showToast(
                    `❌ Could not deduct cards for ${group.playerName || "player"} — check connection.`,
                  );
                } else if (result === null) {
                  showToast(
                    `⚠️ Player record not found for ${group.playerName || "player"} — cards not deducted.`,
                  );
                }
              })
              .catch((err) => {
                console.error("adminDeductCardsBatchFromPlayer failed:", err);
                showToast(
                  `❌ Could not deduct cards for ${group.playerName || "player"}.`,
                );
              });
            }
          }

          window.saveSharedRequests();
        }

        function setReqStatus(id, status, silent) {
          const req = cardRequests.find((r) => r.id === id);
          if (!req) return;
          if (status === "done" && window.isCardLocked(id)) {
            showToast("🔒 This card is locked on this device! Unlock it first to mark as Done.");
            return;
          }
          if (status === "done" || status === "declined") {
            if (window.pruneLockedReq) window.pruneLockedReq(id);
          }
          const wasPending = req.status === "pending";
          const wasDone = req.status === "done";
          const now = new Date().toISOString();
          req.status = status;
          req.updatedAt = now;

          if (!window._adminDoneIds) window._adminDoneIds = new Set();
          if (!window._adminModifiedReqs) window._adminModifiedReqs = new Map();

          const adminName = (typeof profile === "object" && profile && profile.name) || "Admin";
          const adminAvatar = (typeof profile === "object" && profile && profile.avatar) || "🧙";
          const adminPhoto = typeof _lightPhoto === "function" && typeof profile === "object" && profile ? _lightPhoto(profile.photoURL) : "";
          const adminPid = window._currentPlayerId || (typeof profile === "object" && profile && profile.playerId) || "";

          const targetPid = req.playerId ? String(req.playerId).trim() : "";
          const targetName = req.playerName ? String(req.playerName).trim().toLowerCase() : "";
          const sIdx = Number(req.setIdx);
          const cIdx = Number(req.cardIdx);
          const isJackpotReq = req.source === "jackpot" || req.source === "jumbled_jackpot";
          const duplicateReqs = [];

          cardRequests.forEach((other) => {
            if (!other || other.id === req.id) return;
            const oPid = other.playerId ? String(other.playerId).trim() : "";
            const oName = other.playerName ? String(other.playerName).trim().toLowerCase() : "";
            const samePlayer = (targetPid && oPid && targetPid === oPid) || (targetName && oName && targetName === oName);
            if (
              samePlayer &&
              Number(other.setIdx) === sIdx &&
              Number(other.cardIdx) === cIdx &&
              other.status === "pending" &&
              !other.adminCleared &&
              !isJackpotReq &&
              other.source !== "jackpot" &&
              other.source !== "jumbled_jackpot"
            ) {
              duplicateReqs.push(other);
            }
          });
          if (Array.isArray(req._duplicateReqIds)) {
            req._duplicateReqIds.forEach((dupId) => {
              const dupReq = cardRequests.find((r) => r.id === dupId);
              if (
                dupReq &&
                dupReq.status === "pending" &&
                !dupReq.adminCleared &&
                !duplicateReqs.some((d) => d.id === dupReq.id)
              ) {
                duplicateReqs.push(dupReq);
              }
            });
          }

          if (status === "done") {
            if (window.setAdminPresenceState) {
              window.setAdminPresenceState("sending");
            }
            window._adminDoneIds.add(req.id);
            req.sentByName = adminName;
            req.sentByAvatar = adminAvatar;
            req.sentByPhoto = adminPhoto;
            req.sentByPid = adminPid;
            req.sentAt = now;
            const donePayload = {
              status: "done",
              updatedAt: now,
              sentByName: adminName,
              sentByAvatar: adminAvatar,
              sentByPhoto: adminPhoto,
              sentByPid: adminPid,
              sentAt: now,
            };
            window._adminModifiedReqs.set(req.id, donePayload);
            if (typeof window.updateSharedCardRequest === "function") {
              window.updateSharedCardRequest(req.id, donePayload);
            }
            duplicateReqs.forEach((dupReq) => {
              dupReq.status = "done";
              dupReq.updatedAt = now;
              dupReq.sentByName = adminName;
              dupReq.sentByAvatar = adminAvatar;
              dupReq.sentByPhoto = adminPhoto;
              dupReq.sentByPid = adminPid;
              dupReq.sentAt = now;
              window._adminDoneIds.add(dupReq.id);
              window._adminModifiedReqs.set(dupReq.id, donePayload);
              if (typeof window.updateSharedCardRequest === "function") {
                window.updateSharedCardRequest(dupReq.id, donePayload);
              }
            });
            if (wasPending && adminPid && typeof window.recordAdminCardsSentAndAura === "function") {
              window.recordAdminCardsSentAndAura(adminPid, 1);
            }
            // Trigger card deduction from player's account in Firestore (never deduct jackpot/JJ prize cards)
            if (wasPending && !isJackpotReq) {
              const deductPid = req.playerId || (window._usernameToPidMap && window._usernameToPidMap[req.playerName]);
              if (deductPid && typeof window.adminDeductCardFromPlayer === "function") {
                Promise.resolve(window.adminDeductCardFromPlayer(deductPid, req.setIdx, req.cardIdx))
                  .then((result) => {
                    if (result && result.quotaExceeded) {
                      showToast(
                        `⚠️ Firebase daily quota exceeded — card could not be deducted. Upgrade to Blaze plan or wait for daily reset.`,
                        6000,
                      );
                    } else if (result === false) {
                      showToast(
                        `❌ Could not deduct card for ${req.playerName || "player"} — check connection.`,
                      );
                    } else if (result === null) {
                      showToast(
                        `⚠️ Player record not found for ${req.playerName || "player"} — card not deducted.`,
                      );
                    }
                  })
                  .catch((err) => {
                    console.error("adminDeductCardFromPlayer failed:", err);
                    showToast(
                      `❌ Could not deduct card for ${req.playerName || "player"}.`,
                    );
                  });
              }
            }
          } else if (status === "pending") {
            window._adminDoneIds.delete(req.id);
            if (wasDone && adminPid && typeof window.recordAdminCardsSentAndAura === "function") {
              window.recordAdminCardsSentAndAura(adminPid, -1);
            }
            // Revert card deduction if admin reverts Done back to Pending (never for jackpot/JJ prize cards)
            if (wasDone && !isJackpotReq) {
              const restorePid = req.playerId || (window._usernameToPidMap && window._usernameToPidMap[req.playerName]);
              if (restorePid && typeof window.adminRestoreCardToPlayer === "function") {
                Promise.resolve(window.adminRestoreCardToPlayer(restorePid, req.setIdx, req.cardIdx))
                  .then((result) => {
                    if (result && result.quotaExceeded) {
                      showToast(
                        `⚠️ Firebase daily quota exceeded — card could not be restored. Upgrade to Blaze plan or wait for daily reset.`,
                        6000,
                      );
                    } else if (result === false) {
                      showToast(
                        `❌ Could not restore card to ${req.playerName || "player"} — check connection.`,
                      );
                    } else if (result === null) {
                      showToast(
                        `⚠️ Player record not found for ${req.playerName || "player"} — card not restored.`,
                      );
                    }
                  })
                  .catch((err) => {
                    console.error("adminRestoreCardToPlayer failed:", err);
                    showToast(
                      `❌ Could not restore card to ${req.playerName || "player"}.`,
                    );
                  });
              }
            }
            req.sentByName = "";
            req.sentByAvatar = "";
            req.sentByPhoto = "";
            req.sentByPid = "";
            req.sentAt = "";
            const undoPayload = {
              status: "pending",
              updatedAt: now,
              sentByName: "",
              sentByAvatar: "",
              sentByPhoto: "",
              sentByPid: "",
              sentAt: "",
            };
            window._adminModifiedReqs.set(req.id, undoPayload);
            if (typeof window.updateSharedCardRequest === "function") {
              window.updateSharedCardRequest(req.id, undoPayload);
            }
            duplicateReqs.forEach((dupReq) => {
              dupReq.status = "pending";
              dupReq.updatedAt = now;
              dupReq.sentByName = "";
              dupReq.sentByAvatar = "";
              dupReq.sentByPhoto = "";
              dupReq.sentByPid = "";
              dupReq.sentAt = "";
              window._adminDoneIds.delete(dupReq.id);
              window._adminModifiedReqs.set(dupReq.id, undoPayload);
              if (typeof window.updateSharedCardRequest === "function") {
                window.updateSharedCardRequest(dupReq.id, undoPayload);
              }
            });
          } else if (status === "declined") {
            window._adminDoneIds.delete(req.id);
            const declinePayload = {
              status: "declined",
              updatedAt: now,
            };
            window._adminModifiedReqs.set(req.id, declinePayload);
            if (typeof window.updateSharedCardRequest === "function") {
              window.updateSharedCardRequest(req.id, declinePayload);
            }
            duplicateReqs.forEach((dupReq) => {
              dupReq.status = "declined";
              dupReq.updatedAt = now;
              window._adminDoneIds.delete(dupReq.id);
              window._adminModifiedReqs.set(dupReq.id, declinePayload);
              if (typeof window.updateSharedCardRequest === "function") {
                window.updateSharedCardRequest(dupReq.id, declinePayload);
              }
            });
          }

          // When a request is declined, refund any coins the player spent to make it
          // (only unowned-card requests cost coins; owned-card requests are free).
          if (status === "declined" && wasPending && req.coinsSpent > 0) {
            const refundAmount = Number(req.coinsSpent);
            if (req.playerId === window._currentPlayerId) {
              req.coinsSpent = 0;
              req.refunded = true;
              const currentMod = window._adminModifiedReqs.get(req.id) || { status: "declined" };
              window._adminModifiedReqs.set(req.id, {
                ...currentMod,
                status: "declined",
                coinsSpent: 0,
                refunded: true,
                refundedAt: now,
              });
              if (typeof window._claimRefundId === "function") window._claimRefundId(req.id);
              coins += refundAmount;
              logCoinTx(refundAmount, "↩️ Refund: declined card request");
              updateHUD();
              saveProgress();
            } else {
              // Target playerId on other player device: leave req.coinsSpent intact so player's client auto-claims upon sync!
              if (!silent) {
                showToast(
                  `ℹ️ ${req.playerName} will auto-receive ${refundAmount} 🪙 refund upon sync.`,
                );
              }
            }
          }

          // Instantly update UI on click
          renderAdminList();
          updateAdminStats();
          if (typeof renderCollGrid === "function") renderCollGrid();

          if (!silent) {
            if (status === "done") {
              const card = SETS[req.setIdx] && SETS[req.setIdx].cards[req.cardIdx];
              const isJp = req.source === "jackpot" || req.source === "jumbled_jackpot";
              showToast(
                card
                  ? `✅ Marked ${card.emoji} ${card.name} for ${req.playerName} as ${isJp ? "Sent" : "Done"}!`
                  : `✅ Request marked as ${isJp ? "Sent" : "Done"}!`,
              );
              SFX.coin && SFX.coin();
            } else if (status === "pending") {
              showToast(`↩️ Request reverted to Pending!`);
            }
          }

          window.saveSharedRequests();
        }

        async function clearDoneRequests() {
          if (!confirm("Clear Done and Declined requests from active Admin view? They will be moved to History and remain visible to players.")) return;
          if (window._adminDoneIds) window._adminDoneIds.clear();
          if (!window._adminClearedIds) window._adminClearedIds = new Set();
          if (!window._adminModifiedReqs) window._adminModifiedReqs = new Map();

          const targetReqs = cardRequests.filter((r) => r && (r.status === "done" || r.status === "declined"));
          if (!targetReqs.length) {
            showToast("ℹ️ No Done or Declined requests to clear.");
            return;
          }

          const prevStates = targetReqs.map((r) => ({
            req: r,
            adminCleared: r.adminCleared,
            adminClearedAt: r.adminClearedAt,
            hadMod: window._adminModifiedReqs.has(r.id),
            prevMod: window._adminModifiedReqs.has(r.id)
              ? { ...window._adminModifiedReqs.get(r.id) }
              : null,
          }));
          const clearTime = new Date().toISOString();

          // Optimistically mark as adminCleared locally and record in _adminClearedIds & _adminModifiedReqs
          targetReqs.forEach((r) => {
            r.adminCleared = true;
            if (!r.adminClearedAt) r.adminClearedAt = clearTime;
            window._adminClearedIds.add(r.id);
            const existing = window._adminModifiedReqs.get(r.id) || {};
            window._adminModifiedReqs.set(r.id, {
              ...existing,
              status: r.status,
              adminCleared: true,
              adminClearedAt: r.adminClearedAt,
              updatedAt: clearTime,
            });
          });
          renderAdminList();
          updateAdminStats();
          showToast("🗑️ Clearing completed requests from view…");

          const clearFn = window.adminClearSharedRequests || window.saveSharedRequests;
          const ok = await clearFn();
          if (ok === true) {
            renderAdminList();
            updateAdminStats();
            showToast("✅ Completed requests cleared from active view! (Saved in History)");
          } else {
            // Revert optimistic changes if persistence failed
            prevStates.forEach(({ req, adminCleared, adminClearedAt, hadMod, prevMod }) => {
              req.adminCleared = adminCleared;
              req.adminClearedAt = adminClearedAt;
              if (!adminCleared) window._adminClearedIds.delete(req.id);
              if (hadMod) {
                window._adminModifiedReqs.set(req.id, prevMod);
              } else {
                window._adminModifiedReqs.delete(req.id);
              }
            });
            renderAdminList();
            updateAdminStats();
            showToast("⚠️ Could not clear requests — check connection.");
          }
        }

        // ─── ADMIN: CARD REQUEST HISTORY (Last 1 Week) ────────────
        function openAdminCardHistoryModal() {
          renderAdminCardHistoryList();
          const overlay = document.getElementById("adminCardHistoryOverlay");
          if (overlay) overlay.classList.add("show");
          if (window.daPushOverlayState) window.daPushOverlayState("adminCardHistoryOverlay");
        }
        window.openAdminCardHistoryModal = openAdminCardHistoryModal;

        function closeAdminCardHistoryModal(fromPopstate) {
          if (window.daDismissOverlay) {
            window.daDismissOverlay("adminCardHistoryOverlay", fromPopstate);
          } else {
            const overlay = document.getElementById("adminCardHistoryOverlay");
            if (overlay) overlay.classList.remove("show");
          }
        }
        window.closeAdminCardHistoryModal = closeAdminCardHistoryModal;

        function renderAdminCardHistoryList() {
          const listEl = document.getElementById("adminCardHistoryList");
          const searchEl = document.getElementById("adminCardHistorySearch");
          if (!listEl) return;
          const search = (searchEl ? searchEl.value : "").trim().toLowerCase();
          const now = Date.now();
          // Find all requests that were admin-cleared
          const historyItems = cardRequests.filter((r) => {
            if (!r) return false;
            // Must be adminCleared (or done/declined with cleared timestamp)
            const isCleared = !!r.adminCleared;
            if (!isCleared) return false;

            if (search) {
              const card = SETS[r.setIdx] && SETS[r.setIdx].cards[r.cardIdx];
              const cName = card ? card.name.toLowerCase() : "";
              const pName = (r.playerName || "").toLowerCase();
              const tName = (r.townName || "").toLowerCase();
              const sName = (r.sentByName || "").toLowerCase();
              if (!cName.includes(search) && !pName.includes(search) && !tName.includes(search) && !sName.includes(search)) {
                return false;
              }
            }
            return true;
          });

          // Sort newest cleared/updated first
          historyItems.sort((a, b) => {
            const ta = new Date(a.adminClearedAt || a.updatedAt || a.timestamp).getTime() || 0;
            const tb = new Date(b.adminClearedAt || b.updatedAt || b.timestamp).getTime() || 0;
            return tb - ta;
          });

          // Deduplicate identical cleared entries for the same player and card
          const dedupedHistory = [];
          const seenHistoryKeys = new Set();
          historyItems.forEach((r) => {
            const pKey = (r.playerId || r.playerName || "").trim().toLowerCase();
            const cKey = `${pKey}::${Number(r.setIdx)}::${Number(r.cardIdx)}`;
            if (seenHistoryKeys.has(cKey)) return;
            seenHistoryKeys.add(cKey);
            dedupedHistory.push(r);
          });

          // AUTO-PRUNE: Just show the last 500 archived cards (auto prune after 500 cards)
          const prunedHistory = dedupedHistory.slice(0, 500);

          const countEl = document.getElementById("adminCardHistoryCount");
          if (countEl) countEl.textContent = `(${prunedHistory.length}${dedupedHistory.length > 500 ? " / 500 max" : ""})`;

          if (!prunedHistory.length) {
            listEl.innerHTML = `
              <div class="ach-empty" style="text-align:center;padding:32px 14px;color:rgba(255,255,255,.55)">
                <div style="font-size:2.2rem;margin-bottom:8px">📜</div>
                <div style="font-weight:700;color:#fff;margin-bottom:4px">No Cleared Requests in History</div>
                <div style="font-size:.8rem;color:rgba(255,255,255,.45)">
                  ${search ? "No requests match your search." : "Requests cleared by admins using 'Clear Done & Declined' will appear here (latest 500)."}
                </div>
              </div>`;
            return;
          }

          listEl.innerHTML = prunedHistory
            .map((r) => {
              const card = SETS[r.setIdx] && SETS[r.setIdx].cards[r.cardIdx];
              const cardName = card ? card.name : `Card #${r.cardIdx + 1}`;
              const cardEmoji = card ? card.emoji : "🃏";
              const setName = SETS[r.setIdx] ? SETS[r.setIdx].name.replace(/^Set\s*\d+\s*–\s*/, "") : `Set ${r.setIdx + 1}`;
              const pName = r.playerName || "Unknown";
              const town = r.townName || "";
              const pPhoto = r.photoURL;
              const pAv = r.avatar || "🧙";
              const pid = r.playerId || "";

              const sentTime = r.sentAt || r.updatedAt || r.adminClearedAt || r.timestamp;
              const timeFormatted = sentTime
                ? new Date(sentTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—";

              const statusBadge = r.status === "done"
                ? '<span class="req-status-badge badge-done">✅ Done</span>'
                : '<span class="req-status-badge badge-declined">❌ Declined</span>';

              const senderHtml = (r.status === "done" && (r.sentByName || r.sentByPhoto || r.sentByAvatar))
                ? `<div class="req-sent-by-chip" style="position:static;box-shadow:none;">
                     <span class="rsb-label">Sent by</span>
                     <div class="rsb-avatar">${avatarHTML(r.sentByAvatar, r.sentByPhoto, r.sentByPid, r.sentByName)}</div>
                     <span class="rsb-name">${escapeHtml(r.sentByName || "Admin")}</span>
                   </div>`
                : "";

              return `
                <div class="ach-card">
                  <div class="ach-card-left">
                    <div class="ach-player-av">${avatarHTML(pAv, pPhoto, pid, pName)}</div>
                    <div class="ach-info">
                      <div class="ach-title-line">
                        <span class="ach-player-name">${escapeHtml(pName)}</span>
                        ${town ? `<span style="font-size:.72rem;color:rgba(255,255,255,.5)">(${escapeHtml(town)})</span>` : ""}
                        <span class="ach-card-name">${cardEmoji} ${escapeHtml(cardName)}</span>
                      </div>
                      <div class="ach-meta-line">
                        <span>📚 ${escapeHtml(setName)}</span>
                        <span>•</span>
                        <span>📅 ${timeFormatted}</span>
                        ${r.free ? '<span style="color:#f0c030;font-weight:700">• 🎁 Free</span>' : ""}
                        ${Number(r.coinsSpent) > 0 ? `<span style="color:#fbbf24;font-weight:700">• 🪙 ${r.coinsSpent}</span>` : ""}
                      </div>
                    </div>
                  </div>
                  <div class="ach-card-right">
                    ${statusBadge}
                    ${senderHtml}
                  </div>
                </div>`;
            })
            .join("");
        }
        window.renderAdminCardHistoryList = renderAdminCardHistoryList;

        // ─── ADMIN: SHOP REQUESTS (Collection → Shop purchases, e.g. Bloom and Buzz) ──
        let adminShopFilter = "all";

        function setAdminShopFilter(f, btnEl) {
          adminShopFilter = f;
          document
            .querySelectorAll("#adminShopRequestsView .admin-filter-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          renderAdminShopList();
        }

        function updateAdminShopStats() {
          const total = shopRequests.length;
          const pending = shopRequests.filter(
            (r) => r.status === "pending",
          ).length;
          const done = shopRequests.filter((r) => r.status === "done").length;
          const declined = shopRequests.filter(
            (r) => r.status === "declined",
          ).length;
          const totalEl = document.getElementById("adShopStatTotal");
          const pendingEl = document.getElementById("adShopStatPending");
          const doneEl = document.getElementById("adShopStatDone");
          const declinedEl = document.getElementById("adShopStatDeclined");
          if (totalEl) totalEl.textContent = total;
          if (pendingEl) pendingEl.textContent = pending;
          if (doneEl) doneEl.textContent = done;
          if (declinedEl) declinedEl.textContent = declined;
        }

        function renderAdminShopList() {
          const listEl = document.getElementById("adminShopReqList");
          if (!listEl) return;
          const searchEl = document.getElementById("adminShopSearch");
          const search = ((searchEl && searchEl.value) || "").toLowerCase();

          let filtered = shopRequests.filter((r) => {
            if (adminShopFilter !== "all" && r.status !== adminShopFilter)
              return false;
            if (search) {
              const hay = (
                r.playerName +
                " " +
                r.townName +
                " " +
                r.itemName
              ).toLowerCase();
              if (!hay.includes(search)) return false;
            }
            return true;
          });

          // Newest purchases first
          filtered = filtered
            .slice()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          if (filtered.length === 0) {
            listEl.innerHTML = `
      <div class="req-empty">
        <div class="re-icon">🛍️</div>
        <h3>No Shop Purchases Yet</h3>
        <p>${search ? "Nothing matches your search." : "Items players buy from the Collection → Shop tab will appear here!"}</p>
      </div>`;
            updateAdminShopStats();
            return;
          }

          listEl.innerHTML = "";

          // Group all requests by player (preserving newest items order)
          const groups = [];
          const groupIndexMap = new Map();

          filtered.forEach((req) => {
            const rawPid = req.playerId ? String(req.playerId).trim() : "";
            const rawName = req.playerName
              ? String(req.playerName).trim().toLowerCase()
              : "";
            const key = rawPid || rawName || req.id;

            let group = groupIndexMap.get(key);
            if (!group) {
              group = {
                playerId: req.playerId,
                playerName: req.playerName || "Player",
                townName: req.townName || "No Town",
                avatar: req.avatar,
                photoURL: req.photoURL,
                reqs: [],
              };
              groupIndexMap.set(key, group);
              groups.push(group);
            }
            group.reqs.push(req);
          });

          const THEMES = [
            "theme-gold",
            "theme-purple",
            "theme-emerald",
            "theme-cyan",
          ];

          groups.forEach((group, groupIdx) => {
            const pending = group.reqs.filter((r) => r.status === "pending").length;
            const done = group.reqs.filter((r) => r.status === "done").length;
            const declined = group.reqs.filter((r) => r.status === "declined").length;

            const themeClass = THEMES[groupIdx % THEMES.length];
            const groupEl = document.createElement("div");
            groupEl.className = `req-group ${themeClass}`;
            groupEl.id = `shopReqGroup-${groupIdx}`;

            let countBadges = "";
            if (pending)
              countBadges += `<span class="req-status-badge badge-pending">⏳ ${pending}</span>`;
            if (done)
              countBadges += `<span class="req-status-badge badge-done">✅ ${done}</span>`;
            if (declined)
              countBadges += `<span class="req-status-badge badge-declined">❌ ${declined}</span>`;

            let bodyHtml = "";
            group.reqs.forEach((req) => {
              const ts = new Date(req.timestamp).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const statusBadge =
                req.status === "done"
                  ? '<span class="req-status-badge badge-done">✅ Given</span>'
                  : req.status === "declined"
                    ? '<span class="req-status-badge badge-declined">❌ Declined</span>'
                    : '<span class="req-status-badge badge-pending">⏳ Pending</span>';
              const actionsHtml =
                req.status === "pending"
                  ? `<button type="button" class="req-card-btn btn-decline" onclick="setShopReqStatus('${req.id}','declined')">❌ Decline</button><button type="button" class="req-card-btn btn-done" onclick="setShopReqStatus('${req.id}','done')">✅ Mark as Given</button>`
                  : `<button type="button" class="req-card-btn btn-undo" onclick="setShopReqStatus('${req.id}','pending')">↩️ Undo</button>`;

              bodyHtml += `
                <div class="req-subitem status-${req.status}">
                  <div class="req-subitem-left">
                    <div class="req-card-title-row">
                      <span class="rc-set-chip" style="color:#fcd34d;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4)">🛍️ SHOP</span>
                      <span class="rc-card-title">${escapeHtml(req.itemName || "Item")}${req.slotNumber ? ` <span class="rc-card-num" style="color:var(--gold)">#${req.slotNumber}</span>` : ""}</span>
                    </div>
                    <div class="req-card-meta-row">
                      <span class="rc-date">📅 ${ts}</span>
                      ${statusBadge}
                      <span class="req-status-badge badge-coin" style="background:rgba(251,191,36,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.4)">🪙 ${req.cost || 0}</span>
                    </div>
                  </div>
                  <div class="req-subitem-right">
                    ${actionsHtml}
                  </div>
                </div>`;
            });

            groupEl.innerHTML = `
              <div class="req-group-header">
                <div class="req-group-topbar-stripe"></div>
                <div class="req-group-header-content">
                  <div class="req-hdr-top-meta">
                    <div class="req-hdr-meta-left">
                      <button type="button" class="req-player-order-pill req-player-chip-btn" title="Click to collapse / expand ${escapeHtml(group.playerName)}'s shop requests">
                        <span class="rpc-label">PLAYER #${groupIdx + 1}</span>
                        <span class="rpc-arrow">▼</span>
                      </button>
                      ${group.playerId ? `<span class="req-pid-chip">${escapeHtml(group.playerId)}</span>` : ""}
                    </div>
                    <div class="req-hdr-meta-right">
                      <div class="req-group-count-badges">${countBadges}</div>
                    </div>
                  </div>
                  <div class="req-hdr-main-row">
                    <div class="req-hdr-player-info" title="Click to collapse / expand ${escapeHtml(group.playerName)}'s shop requests">
                      <div class="req-player-av">${avatarHTML(group.avatar, group.photoURL, group.playerId, group.playerName)}</div>
                      <div class="req-player-details">
                        <div class="req-player-name">${escapeHtml(group.playerName)}</div>
                        <div class="req-player-subline">
                          <span class="req-player-town">🏡 ${escapeHtml(group.townName || "No Town")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="req-group-collapsed-banner">
                ✨ ${escapeHtml(group.playerName)}'s shop requests are collapsed (${group.reqs.length} items) — tap to view
              </div>
              <div class="req-group-body">${bodyHtml}</div>
              <div class="req-group-footer">
                <span class="rgf-line"></span>
                <span class="rgf-badge">End of ${escapeHtml(group.playerName)}'s purchases • ${group.reqs.length} item${group.reqs.length > 1 ? "s" : ""}</span>
                <span class="rgf-line"></span>
              </div>
            `;

            // Wire up collapse toggle
            const headerEl = groupEl.querySelector(".req-group-header");
            const banner = groupEl.querySelector(".req-group-collapsed-banner");
            const toggleCollapse = (e) => {
              if (
                e &&
                e.target &&
                (e.target.closest(".req-card-btn") ||
                  e.target.closest(".req-pid-chip"))
              )
                return;
              groupEl.classList.toggle("is-collapsed");
              const arrow = groupEl.querySelector(".rpc-arrow");
              if (arrow)
                arrow.textContent = groupEl.classList.contains("is-collapsed")
                  ? "▶"
                  : "▼";
            };
            if (headerEl) headerEl.addEventListener("click", toggleCollapse);
            if (banner) banner.addEventListener("click", toggleCollapse);

            listEl.appendChild(groupEl);
          });
          updateAdminShopStats();
        }

        function setShopReqStatus(id, status) {
          const req = shopRequests.find((r) => r.id === id);
          if (!req) return;
          const wasPending = req.status === "pending";
          req.status = status;

          // When a request is declined, refund any coins the player spent to buy it
          if (
            status === "declined" &&
            wasPending &&
            req.cost > 0 &&
            !req.refunded
          ) {
            const refundAmount = req.cost;
            req.refunded = true;
            if (req.playerId === window._currentPlayerId) {
              coins += refundAmount;
              logCoinTx(refundAmount, `↩️ Refund: declined ${req.itemName}`);
              const prevEntry = ownedShopItems[req.itemId] || {};
              const newCount = Math.max(0, (prevEntry.count || 0) - 1);
              const newPurchaseCount = Math.max(
                0,
                (prevEntry.purchaseCount || 0) - 1,
              );
              if (newCount <= 0 && newPurchaseCount <= 0) {
                delete ownedShopItems[req.itemId];
              } else {
                ownedShopItems[req.itemId] = {
                  ...prevEntry,
                  count: newCount,
                  owned: newCount > 0,
                  purchaseCount: newPurchaseCount,
                };
              }
              updateHUD();
              saveProgress();
              if (
                document
                  .getElementById("panel-coll")
                  .classList.contains("active")
              )
                renderShopGrid();
              showToast(`↩️ ${refundAmount} 🪙 refunded for ${req.itemName}.`);
              window.saveShopRequests();
              renderAdminShopList();
            } else if (req.playerId) {
              if (!req.slotRemoved) {
                req.slotRemoved = true;
                _waitForMod("__mod_adminDeductShopItemFromPlayer", async () => {
                  await window.adminDeductShopItemFromPlayer(
                    req.playerId,
                    req.itemId,
                  );
                });
              }
              _waitForMod("__mod_adminGrantCoinsOne", async () => {
                const result = await window.adminGrantCoinsOne(
                  req.playerId,
                  refundAmount,
                  `Refund: declined ${req.itemName}`,
                );
                if (result === false) {
                  showToast("❌ Could not refund coins — check connection.");
                } else if (result === null) {
                  showToast("⚠️ Player record not found — coins not refunded.");
                } else {
                  showToast(
                    `↩️ ${refundAmount} 🪙 refunded to ${req.playerName}.`,
                  );
                }
                window.saveShopRequests();
                renderAdminShopList();
              });
            }
          }

          // When a booked slot is marked "Given", remove one from that player's
          // booked count (e.g. Booked 3 → Booked 2) so the collection view stays
          // in sync with what's actually been delivered in the real Township game.
          if (
            status === "done" &&
            wasPending &&
            !req.slotRemoved &&
            req.playerId
          ) {
            req.slotRemoved = true;
            _waitForMod("__mod_adminDeductShopItemFromPlayer", async () => {
              const result = await window.adminDeductShopItemFromPlayer(
                req.playerId,
                req.itemId,
              );
              if (result === false) {
                showToast("❌ Could not update player — check connection.");
              } else if (result === null) {
                showToast("⚠️ Player record not found — nothing was updated.");
              } else if (result && result.result === "not-owned") {
                showToast(
                  `⚠️ ${req.playerName} has no booked slots left for this item.`,
                );
              } else if (result && result.result === "removed") {
                showToast(
                  `✅ ${req.itemName} delivered — ${req.playerName} now has ${result.newCount} booked.`,
                );
              }
              // If the admin is fulfilling their own request, sync local state too —
              // the live listener won't fire since it only watches OTHER players' docs.
              if (
                result &&
                result.result === "removed" &&
                req.playerId === window._currentPlayerId
              ) {
                // Preserve purchaseCount/cycleStartAt (pricing-tier tracking) even
                // when the booked count drops to 0 — price only resets after the
                // SHOP_CYCLE_DAYS window, not when a slot is marked "Given".
                const prevEntry = ownedShopItems[req.itemId] || {};
                if (result.newCount > 0) {
                  ownedShopItems[req.itemId] = {
                    ...prevEntry,
                    owned: true,
                    count: result.newCount,
                    purchasedAt: new Date().toISOString(),
                  };
                } else if (
                  typeof prevEntry.purchaseCount === "number" ||
                  prevEntry.cycleStartAt
                ) {
                  ownedShopItems[req.itemId] = {
                    ...prevEntry,
                    owned: false,
                    count: 0,
                  };
                } else {
                  delete ownedShopItems[req.itemId];
                }
                updateHUD();
                if (
                  document
                    .getElementById("panel-coll")
                    .classList.contains("active")
                )
                  renderShopGrid();
              }
              window.saveShopRequests();
              renderAdminShopList();
            });
          }

          window.saveShopRequests();
          renderAdminShopList();
        }

        function adminShopRefresh() {
          showToast("🔄 Refreshing…");
          window.loadShopRequests().then(() => {
            renderAdminShopList();
            updateAdminShopStats();
            showToast("✅ Refreshed!");
          });
        }

        async function clearDoneShopRequests() {
          if (!confirm('Remove all "Given" and "Declined" shop requests?')) return;
          const prev = shopRequests.slice();
          const remaining = shopRequests.filter((r) => r && r.status === "pending");
          if (window._setShopRequests) {
            window._setShopRequests(remaining);
          } else {
            shopRequests.length = 0;
            remaining.forEach((r) => shopRequests.push(r));
          }
          renderAdminShopList();
          updateAdminShopStats();
          showToast("🗑️ Clearing given & declined shop requests…");

          const clearFn = window.adminClearDoneShopRequests || window.saveShopRequests;
          const ok = await clearFn();
          if (ok !== false) {
            renderAdminShopList();
            updateAdminShopStats();
            showToast("✅ Cleared given & declined shop requests!");
          } else {
            if (window._setShopRequests) {
              window._setShopRequests(prev);
            } else {
              shopRequests.length = 0;
              prev.forEach((r) => shopRequests.push(r));
            }
            renderAdminShopList();
            updateAdminShopStats();
            showToast("⚠️ Could not clear shop requests — check connection.");
          }
        }

        function escapeHtml(str) {
          return String(str || "").replace(
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
        }
        window.escapeHtml = escapeHtml;

        // ─── ADMIN: JACKPOT EVENT ENTRIES ────────────────────────
        function setAdminView(view, btnEl) {
          if (adminAccessLevel === "limited" && view !== "requests") {
            showToast("🔒 Locked — full admin PIN required");
            return;
          }
          document
            .getElementById("adminViewReqBtn")
            .classList.toggle("active", view === "requests");
          document
            .getElementById("adminViewLogsBtn")
            .classList.toggle("active", view === "eventlogs");
          document
            .getElementById("adminViewEvBtn")
            .classList.toggle("active", view === "events");
          document
            .getElementById("adminViewGcBtn")
            .classList.toggle("active", view === "grantcoins");
          document
            .getElementById("adminViewPsBtn")
            .classList.toggle("active", view === "playerstats");
          document
            .getElementById("adminViewShopBtn")
            .classList.toggle("active", view === "shoprequests");
          document.getElementById("adminViewGatewayBtn")?.classList.toggle("active", view === "dagateway");
          document.getElementById("adminViewRorBtn")?.classList.toggle("active", view === "ror");
          
          document.getElementById("adminRequestsView").style.display = view === "requests" ? "" : "none";
          document.getElementById("adminEventLogsView").style.display = view === "eventlogs" ? "" : "none";
          document.getElementById("adminEventsView").style.display = view === "events" ? "" : "none";
          document.getElementById("adminGrantCoinsView").style.display = view === "grantcoins" ? "" : "none";
          document.getElementById("adminPlayerStatsView").style.display = view === "playerstats" ? "" : "none";
          document.getElementById("adminShopRequestsView").style.display = view === "shoprequests" ? "" : "none";
          
          const gwView = document.getElementById("adminGatewayView");
          if (gwView) gwView.style.display = view === "dagateway" ? "" : "none";
          
          const rorView = document.getElementById("adminRorView");
          if (rorView) rorView.style.display = view === "ror" ? "" : "none";
          
          if (view === "ror") {
            if (window.listenToRorRequests) window.listenToRorRequests();
          } else {
            if (window.stopRorRequests) window.stopRorRequests();
          }
          
          if (view === "eventlogs") elRenderView();
          if (view === "events") ecPopulateAdminUI();
          if (view === "grantcoins") gcInitView();
          if (view === "playerstats") psLoadPlayers();
          if (view === "shoprequests") {
            renderAdminShopList();
            updateAdminShopStats();
          }
          if (view === "dagateway") dagInitView();
        }

        // ═══════════════════════════════════════════════════════
        // EVENT ENTRIES — merged leaderboard approval + JJ/JP card-request review
        // Each entry (Jumbled Jackpot round or Jackpot Event round) gets two
        // independent statuses:
        //   • Approved  → score is live on the public leaderboard (lb* Firebase fns)
        //   • Reviewed  → the card request(s) from that round have been sent to
        //                 the player in-game (status field on the entry itself)
        // ═══════════════════════════════════════════════════════
        let elActiveTab = "jj"; // 'jj' | 'jp'
        let elPendingCache = { jj: [], jp: [] };

        function elUpdateTabLabels() {
          const jjBtn = document.getElementById("elTabJjBtn");
          const jpBtn = document.getElementById("elTabJpBtn");
          if (jjBtn) jjBtn.textContent = `🔀 Jumbled Jackpot (${jjEntries.length})`;
          if (jpBtn) jpBtn.textContent = `🎯 Jackpot Event (${jackpotEntries.length})`;
        }

        function elSetTab(tab) {
          elActiveTab = tab;
          document
            .getElementById("elTabJjBtn")
            ?.classList.toggle("active", tab === "jj");
          document
            .getElementById("elTabJpBtn")
            ?.classList.toggle("active", tab === "jp");
          elRenderView();
        }

        async function elRenderView() {
          // If default jj is empty but jp has entries, auto-switch to jp so admin sees jackpot entries immediately
          if (elActiveTab === "jj" && jjEntries.length === 0 && jackpotEntries.length > 0) {
            elActiveTab = "jp";
            document.getElementById("elTabJjBtn")?.classList.remove("active");
            document.getElementById("elTabJpBtn")?.classList.add("active");
          }
          elUpdateTabLabels();
          await elFetchPending(elActiveTab);
          elRenderEntryLog();
        }
        window.elRenderView = elRenderView;

        async function elFetchPending() {
          return [];
        }

        async function elApproveOne() {}
        window.elApproveOne = elApproveOne;

        async function elApproveAll() {}
        window.elApproveAll = elApproveAll;

        // Copies a ChatGPT / AI Assistant prompt of the event entries,
        // counting only the best score if a player has multiple entries.
        async function elCopyBannerPrompt() {
          let game = elActiveTab;
          let arr = game === "jj" ? jjEntries : jackpotEntries;

          // If current tab is empty but the other game has entries, automatically switch
          if (!arr || !arr.length) {
            if (game === "jj" && jackpotEntries && jackpotEntries.length > 0) {
              game = "jp";
              arr = jackpotEntries;
              if (typeof elSetTab === "function") elSetTab("jp");
            } else if (game === "jp" && jjEntries && jjEntries.length > 0) {
              game = "jj";
              arr = jjEntries;
              if (typeof elSetTab === "function") elSetTab("jj");
            }
          }

          if (!arr || !arr.length) {
            showToast("⚠️ No entries found in either Jackpot Event or Jumbled Jackpot.");
            return;
          }

          const label = game === "jj" ? "Jumbled Jackpot" : "Jackpot Event";
          const now = Date.now();
          const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

          // Find the latest timestamp across entries to anchor the event session window
          const timestamps = arr
            .map((e) => (e && e.timestamp ? new Date(e.timestamp).getTime() : NaN))
            .filter((t) => !isNaN(t));

          const maxEventTs = timestamps.length ? Math.max(...timestamps) : now;
          const refTime = Math.max(now, maxEventTs);

          // Filter entries within 12 hours of the event's latest session or within 12 hours of now
          let targetEntries = arr.filter((e) => {
            if (!e || !e.timestamp) return false;
            const ts = new Date(e.timestamp).getTime();
            if (isNaN(ts)) return false;
            return (refTime - ts) <= TWELVE_HOURS_MS || (maxEventTs - ts) <= TWELVE_HOURS_MS;
          });

          // Graceful fallback: If no entries fell inside 12h window (e.g. event happened earlier or clock skew), use all entries!
          if (!targetEntries.length) {
            targetEntries = arr;
          }

          // Count best score only if a player has multiple entries
          const best = {};
          targetEntries.forEach((e) => {
            const pId = e.playerId || "";
            const pName = e.playerName || e.name || "Unknown";
            const key = pId || pName.trim().toLowerCase();
            if (!key) return;

            const cur = best[key];
            if (!cur) {
              best[key] = e;
              return;
            }

            const scoreNew = (e.correctCount !== undefined ? e.correctCount : e.score) || 0;
            const scoreCur = (cur.correctCount !== undefined ? cur.correctCount : cur.score) || 0;

            if (scoreNew > scoreCur) {
              best[key] = e;
            } else if (scoreNew === scoreCur) {
              const timeNew = (e.timeSecs !== undefined && e.timeSecs !== null) ? Number(e.timeSecs) : Infinity;
              const timeCur = (cur.timeSecs !== undefined && cur.timeSecs !== null) ? Number(cur.timeSecs) : Infinity;
              if (timeNew < timeCur) {
                best[key] = e;
              }
            }
          });

          const uniqueList = Object.values(best);
          uniqueList.sort((a, b) => {
            const sA = (a.correctCount !== undefined ? a.correctCount : a.score) || 0;
            const sB = (b.correctCount !== undefined ? b.correctCount : b.score) || 0;
            if (sB !== sA) return sB - sA;
            const tA = (a.timeSecs !== undefined && a.timeSecs !== null) ? Number(a.timeSecs) : Infinity;
            const tB = (b.timeSecs !== undefined && b.timeSecs !== null) ? Number(b.timeSecs) : Infinity;
            return tA - tB;
          });

          function _fmtTime(sec) {
            if (sec === undefined || sec === null || sec === Infinity || isNaN(sec)) return "N/A";
            const n = Number(sec);
            const m = Math.floor(n / 60);
            const s = n % 60;
            return m > 0 ? `${m}m ${s < 10 ? "0" : ""}${s}s (${n}s)` : `${n}s`;
          }

          function _getName(e) { return e.playerName || e.name || "Player"; }
          function _getTown(e) { return e.townName || e.town || ""; }
          function _getScore(e) { return (e.correctCount !== undefined ? e.correctCount : e.score) || 0; }
          function _getTotal(e) {
            if (game === "jj") return (e.correctCount || e.score || 0) + (e.wrongCount || 0) || 10;
            return e.totalCards || e.total || 10;
          }
          function _getCardsRequested(e) {
            if (Array.isArray(e.requiredCards)) return e.requiredCards.length;
            if (Array.isArray(e.cards)) return e.cards.length;
            if (typeof e.cardsRequested === "number") return e.cardsRequested;
            return 0;
          }

          const eventName = game === "jj"
            ? "Jumbled Jackpot Word Scramble Challenge"
            : "Jackpot Memory & Card Request Challenge";
          const eventDesc = game === "jj"
            ? "Players unscrambled anagrammed card names from memory against the clock, built word streaks, and selected cards for Township in-game delivery."
            : "Players memorized a full card set, typed card names from memory against the clock, and selected cards for Township in-game delivery.";

          const latestTs = uniqueList[0] && uniqueList[0].timestamp ? new Date(uniqueList[0].timestamp) : new Date();
          const dateStr = latestTs.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const timeStr = latestTs.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

          const totalCardsRequested = uniqueList.reduce((sum, r) => sum + _getCardsRequested(r), 0);

          const lbLines = uniqueList.map((r, i) => {
            const name = _getName(r);
            const town = _getTown(r);
            const townStr = town ? ` (Town: ${town})` : "";
            const cardsCount = _getCardsRequested(r);
            const cardsStr = ` | Cards Requested: ${cardsCount}`;
            const setStr = r.setName ? ` | Set: ${r.setName}` : "";
            return `${i + 1}. ${name}${townStr} — Score: ${_getScore(r)}/${_getTotal(r)} | Time: ${_fmtTime(r.timeSecs)}${cardsStr}${setStr}`;
          }).join("\n");

          const shoutouts = [];
          if (uniqueList[0]) {
            const top1 = uniqueList[0];
            shoutouts.push(`   - ${_getName(top1)} (Champion with ${_getScore(top1)}/${_getTotal(top1)} in just ${_fmtTime(top1.timeSecs)}!)`);
          }
          if (uniqueList[1]) {
            const top2 = uniqueList[1];
            const diffSec = (top2.timeSecs !== undefined && uniqueList[0].timeSecs !== undefined) ? Math.abs(top2.timeSecs - uniqueList[0].timeSecs) : null;
            const diffNote = diffSec ? ` — missed 1st place by only ${diffSec} second${diffSec === 1 ? "" : "s"}!` : "!";
            shoutouts.push(`   - ${_getName(top2)} (Runner-up with ${_getScore(top2)}/${_getTotal(top2)} in ${_fmtTime(top2.timeSecs)}${diffNote})`);
          }
          const scoredList = uniqueList.filter((p) => _getScore(p) > 0);
          const fastest = (scoredList.length ? scoredList : uniqueList)
            .slice()
            .sort((a, b) => ((a.timeSecs !== undefined && a.timeSecs !== null) ? Number(a.timeSecs) : Infinity) - ((b.timeSecs !== undefined && b.timeSecs !== null) ? Number(b.timeSecs) : Infinity))[0];
          if (fastest) {
            shoutouts.push(`   - ${_getName(fastest)} (Fastest overall completion speed across the entire community at ${_fmtTime(fastest.timeSecs)}!)`);
          }
          const perfect = uniqueList.filter((p) => _getScore(p) >= _getTotal(p));
          if (perfect.length > 0) {
            shoutouts.push(`   - All ${perfect.length} player${perfect.length === 1 ? "" : "s"} who scored a perfect 100% score!`);
          }

          const promptText = `You are an expert graphic designer and community manager for the Township gaming community 'Dumbledore\\'s Army (DA)'.
Please create a complete winner announcement package and graphic banner layout based on the official results of our ${label} held on ${dateStr} at ${timeStr}.

EVENT CONTEXT:
- Community: Dumbledore's Army (DA)
- Event: DA Township ${eventName}
- Date & Time: ${dateStr} at ${timeStr}
- Total Unique Participants: ${uniqueList.length} (Best score counted per player)
- Total Cards Requested: ${totalCardsRequested} cards selected for in-game delivery
- Challenge format: ${eventDesc}

OFFICIAL LEADERBOARD RESULTS:
${lbLines}

WHAT I NEED FROM YOU:
1. An exciting WhatsApp & Telegram victory announcement post filled with emojis, congratulations, and formatted podium rankings.
2. A beautiful ASCII/Emoji formatted leaderboard card suitable for copying directly into community group chats.
3. Specific layout instructions for Canva or Photoshop (recommended color palette, typography font choices, placement of podium, badges, and background elements).
4. Personalized shout-outs for:
${shoutouts.join("\n")}`;

          // Populate the modal textarea immediately
          const ta = document.getElementById("elBannerPromptTextarea");
          if (ta) ta.value = promptText;
          const subTitle = document.getElementById("bannerPromptModalSubtitle");
          if (subTitle) {
            subTitle.textContent = `Official results from ${dateStr} (${uniqueList.length} participants, best score per player). Copy into ChatGPT, Claude, or Gemini!`;
          }

          // Try automatic clipboard copy
          let copySuccess = false;
          if (navigator.clipboard && window.isSecureContext) {
            try {
              await navigator.clipboard.writeText(promptText);
              copySuccess = true;
            } catch (err) {
              console.warn("navigator.clipboard failed:", err);
            }
          }

          if (!copySuccess) {
            try {
              const dummy = document.createElement("textarea");
              dummy.value = promptText;
              dummy.setAttribute("readonly", "");
              dummy.style.position = "fixed";
              dummy.style.top = "0";
              dummy.style.left = "0";
              dummy.style.width = "2em";
              dummy.style.height = "2em";
              dummy.style.padding = "0";
              dummy.style.border = "none";
              dummy.style.outline = "none";
              dummy.style.background = "transparent";
              dummy.style.opacity = "0.01";
              dummy.style.zIndex = "999999";
              document.body.appendChild(dummy);
              dummy.focus();
              dummy.select();
              dummy.setSelectionRange(0, promptText.length);
              copySuccess = document.execCommand("copy");
              document.body.removeChild(dummy);
            } catch (e2) {
              copySuccess = false;
            }
          }

          // Update main button UI
          const btn = document.getElementById("elCopyPromptBtn");
          if (btn) {
            const orig = btn.textContent;
            btn.textContent = copySuccess ? "✅ Copied!" : "📋 Open Prompt";
            setTimeout(() => { if (btn) btn.textContent = orig; }, 3000);
          }

          // Always open modal so user has visual confirmation & can copy manually if clipboard failed
          showOverlay("overlayBannerPrompt");

          const modalBtn = document.getElementById("elModalCopyBtn");
          if (copySuccess) {
            showToast(`📋 Copied AI Banner Prompt for ${uniqueList.length} players!`);
            if (modalBtn) modalBtn.textContent = "✅ Copied to Clipboard!";
          } else {
            showToast("📋 Prompt ready! Tap 'Copy to Clipboard' below.");
            if (modalBtn) modalBtn.textContent = "📋 Copy to Clipboard";
          }
        }
        window.elCopyBannerPrompt = elCopyBannerPrompt;

        function elCopyModalPromptText() {
          const ta = document.getElementById("elBannerPromptTextarea");
          if (!ta) return;
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          let ok = false;
          try {
            ok = document.execCommand("copy");
          } catch (e) {
            ok = false;
          }
          if (!ok && navigator.clipboard && window.isSecureContext) {
            navigator.clipboard
              .writeText(ta.value)
              .then(() => {
                _showModalCopiedSuccess();
              })
              .catch(() => {
                showToast("Please tap and hold the text to copy manually.");
              });
            return;
          }
          if (ok) {
            _showModalCopiedSuccess();
          } else {
            showToast("Please tap and hold the text to copy manually.");
          }
        }
        window.elCopyModalPromptText = elCopyModalPromptText;

        function _showModalCopiedSuccess() {
          const btn = document.getElementById("elModalCopyBtn");
          if (btn) {
            const orig = btn.textContent;
            btn.textContent = "✅ Copied to Clipboard!";
            setTimeout(() => {
              if (btn) btn.textContent = orig;
            }, 2500);
          }
          showToast("📋 Copied AI Banner Prompt to clipboard!");
        }

        // Review all pending entries at once for the active event log tab
        function elReviewAll() {
          const game = elActiveTab;
          const label = game === "jj" ? "Jumbled Jackpot" : "Jackpot Event";
          const arr = game === "jj" ? jjEntries : jackpotEntries;
          const pending = arr.filter((e) => e && e.status !== "reviewed");
          if (!pending.length) {
            showToast(`ℹ️ No pending ${label} entries to review.`);
            return;
          }
          pending.forEach((e) => {
            e.status = "reviewed";
          });
          if (game === "jj" && typeof window.saveJJEntries === "function") {
            window.saveJJEntries();
          } else if (typeof window.saveJackpotEntries === "function") {
            window.saveJackpotEntries();
          }

          elRenderEntryLog();
          showToast(`✅ Reviewed all ${pending.length} ${label} entries!`);
        }
        window.elReviewAll = elReviewAll;

        // Immediately deletes an entry from event logs and removes all its card requests completely
        function elDeleteEntry(game, id) {
          const label = game === "jj" ? "Jumbled Jackpot" : "Jackpot Event";
          const arr = game === "jj" ? jjEntries : jackpotEntries;
          const hist = game === "jj" ? _reviewedJjHistory : _reviewedJpHistory;
          const histKey = game === "jj" ? REVIEWED_JJ_HIST_KEY : REVIEWED_JP_HIST_KEY;

          const idx = arr.findIndex((e) => e && e.id === id);
          if (idx !== -1) {
            arr.splice(idx, 1);
            if (game === "jj" && typeof window.saveJJEntries === "function") {
              window.saveJJEntries();
            } else if (typeof window.saveJackpotEntries === "function") {
              window.saveJackpotEntries();
            }
          }

          // Also remove from reviewed history if present
          const hIdx = hist.findIndex((e) => e && e.id === id);
          if (hIdx !== -1) {
            hist.splice(hIdx, 1);
            try { localStorage.setItem(histKey, JSON.stringify(hist)); } catch (e) {}
          }

          _deletedJackpotRoundIds.add(id);
          try {
            localStorage.setItem(DELETED_JACKPOT_ROUNDS_KEY, JSON.stringify(Array.from(_deletedJackpotRoundIds)));
          } catch (e) {}

          // Remove all requested cards completely (locally, RTDB, and Firestore)
          if (Array.isArray(cardRequests)) {
            const toDeleteIds = [];
            for (let i = cardRequests.length - 1; i >= 0; i--) {
              const r = cardRequests[i];
              if (r && (r.roundId === id || (r.id && r.id.startsWith(id + "-c")))) {
                toDeleteIds.push(r.id);
                cardRequests.splice(i, 1);
              }
            }

            if (!window._deletedCardReqIds) window._deletedCardReqIds = new Set();
            if (!window._cancelledPendingReqIds) window._cancelledPendingReqIds = new Set();

            toDeleteIds.forEach((reqId) => {
              window._deletedCardReqIds.add(reqId);
              window._cancelledPendingReqIds.add(reqId);
              if (window._cardReqKnownIds) window._cardReqKnownIds.delete(reqId);
              if (window._dismissedReqIds) window._dismissedReqIds.add(reqId);

              if (typeof window.deleteSharedCardRequest === "function") {
                window.deleteSharedCardRequest(reqId);
              } else if (typeof window.deleteSharedRequest === "function") {
                window.deleteSharedRequest(reqId);
              }
            });

            if (typeof window.saveSharedRequests === "function") {
              window.saveSharedRequests();
            }
          }

          elRenderEntryLog();
          if (typeof renderAdminList === "function") renderAdminList();
          if (typeof updateAdminStats === "function") updateAdminStats();
          if (typeof renderMyRequests === "function") renderMyRequests();
          showToast(`🗑️ Deleted ${label} entry and removed requested cards completely!`);
        }
        window.elDeleteEntry = elDeleteEntry;

        async function elResetTodayLeaderboard() {}
        window.elResetTodayLeaderboard = elResetTodayLeaderboard;
        async function elApproveAll() {}
        window.elApproveAll = elApproveAll;
        async function elApproveOne() {}
        window.elApproveOne = elApproveOne;

        // Toggles review status directly on the JJ/JP entry for visual inspection (does not affect Card Requests).
        function elSetReviewStatus(game, id, status) {
          const arr = game === "jj" ? jjEntries : jackpotEntries;
          const e = arr.find((x) => x.id === id);
          if (!e) return;
          e.status = status;
          if (game === "jj") window.saveJJEntries();
          else window.saveJackpotEntries();

          elRenderEntryLog();
        }

        function elClearReviewed() {
          const game = elActiveTab;
          const label = game === "jj" ? "Jumbled Jackpot" : "Jackpot Event";
          if (!confirm(`Remove all Reviewed ${label} entries?`)) return;
          const arr = game === "jj" ? jjEntries : jackpotEntries;
          const hist = game === "jj" ? _reviewedJjHistory : _reviewedJpHistory;
          const histKey = game === "jj" ? REVIEWED_JJ_HIST_KEY : REVIEWED_JP_HIST_KEY;

          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].status === "reviewed") {
              const removed = arr.splice(i, 1)[0];
              if (removed && removed.id && !hist.some((h) => h.id === removed.id)) {
                hist.push(removed);
              }
            }
          }
          if (hist.length > 200) hist.splice(0, hist.length - 200);
          try {
            localStorage.setItem(histKey, JSON.stringify(hist));
          } catch (e) {}

          if (game === "jj") window.saveJJEntries();
          else window.saveJackpotEntries();

          elRenderEntryLog();
          if (typeof renderAdminList === "function") renderAdminList();
          if (typeof updateAdminStats === "function") updateAdminStats();
          showToast(`Cleared reviewed ${label} entries! Requested cards remain active in Card Requests panel.`);
        }

        // Recomputes which typed Jackpot Event answers were correct (same dedup
        // matching logic used live in jpCapturePhase1Answers) purely for display
        // purposes in the admin Event Logs panel.
        function elComputeJpCorrectness(setIdx, writtenAnswers, entry) {
          const norm = (s) =>
            (s || "").trim().replace(/\s+/g, " ").toUpperCase();

          if (entry && entry.mode === "hard" && Array.isArray(entry.hardQuestions)) {
            return (writtenAnswers || []).map((val, i) => {
              const v = norm(val);
              if (!v) return false;
              const target = norm(
                entry.hardQuestions[i] ? entry.hardQuestions[i].name : "",
              );
              return v === target;
            });
          }

          const set = SETS[setIdx];
          if (!set) return [];

          // 1-to-1 card checking: answer for card i must match card i
          const exactMatches = (writtenAnswers || []).map((val, i) => {
            const v = norm(val);
            if (!v) return false;
            const target = norm(
              set.cards && set.cards[i] ? set.cards[i].name : "",
            );
            return v === target;
          });

          if (entry && entry.cardOrder) {
            return exactMatches;
          }

          // Backwards compatibility for legacy entries without cardOrder:
          if (
            entry &&
            typeof entry.correctCount === "number" &&
            exactMatches.filter(Boolean).length < entry.correctCount
          ) {
            const realNames = set.cards.map((c) => norm(c.name));
            const used = new Array(realNames.length).fill(false);
            return (writtenAnswers || []).map((val) => {
              const v = norm(val);
              if (!v) return false;
              const idx = realNames.findIndex((n, ni) => n === v && !used[ni]);
              if (idx !== -1) {
                used[idx] = true;
                return true;
              }
              return false;
            });
          }

          return exactMatches;
        }

        // Builds the HTML for the collapsible "typed answers" panel shown under
        // each JJ/JP entry in the admin Event Logs view.
        function elBuildAnswersHtml(game, e) {
          if (game === "jj") {
            const answers = e.answers || [];
            if (!answers.length) return "";
            const rows = answers
              .map(
                (a) => `
      <div class="el-answer-row">
        <span class="el-answer-emoji">${a.emoji || "🃏"}</span>
        <span class="el-answer-name">${a.cardName}</span>
        <span class="el-answer-typed">${a.typed ? a.typed : "<em>(skipped)</em>"}</span>
        <span class="el-answer-mark">${a.correct ? "✅" : "❌"}</span>
      </div>`,
              )
              .join("");
            return `
      <details class="el-answers-details">
        <summary class="el-answers-summary">📝 View Typed Answers (${answers.length})${e.mode === "hard" ? " — 🔥 Hard Mode (No Emoji)" : ""}</summary>
        <div class="el-answers-list">${rows}</div>
      </details>`;
          } else {
            const written = e.writtenAnswers || [];
            if (!written.length) return "";

            if (e.mode === "hard" && Array.isArray(e.hardQuestions) && e.hardQuestions.length) {
              const correctness = elComputeJpCorrectness(e.setIdx, written, e);
              const rows = e.hardQuestions
                .map((q, i) => {
                  const typed = written[i] || "";
                  const ok = !!correctness[i];
                  return `
      <div class="el-answer-row">
        <span class="el-answer-emoji">${q.emoji || "🃏"}</span>
        <span class="el-answer-name">${i + 1}. Set ${q.setNum} - Card ${q.cardNum} (${q.name})</span>
        <span class="el-answer-typed">${typed ? typed : "<em>(blank)</em>"}</span>
        <span class="el-answer-mark">${ok ? "✅" : "❌"}</span>
      </div>`;
                })
                .join("");
              return `
      <details class="el-answers-details">
        <summary class="el-answers-summary">📝 View Typed Answers (${e.hardQuestions.length})</summary>
        <div class="el-answers-list">${rows}</div>
      </details>`;
            }

            const set = SETS[e.setIdx];
            if (!set) return "";
            const correctness = elComputeJpCorrectness(e.setIdx, written, e);
            // Always displays in normal sequence 1 to 10 for the admin
            const rows = set.cards
              .map((c, i) => {
                const typed = written[i] || "";
                const ok = !!correctness[i];
                const realName = c.name;
                return `
      <div class="el-answer-row">
        <span class="el-answer-emoji">${c.emoji}</span>
        <span class="el-answer-name">${i + 1}. ${realName}</span>
        <span class="el-answer-typed">${typed ? typed : "<em>(blank)</em>"}</span>
        <span class="el-answer-mark">${ok ? "✅" : "❌"}</span>
      </div>`;
              })
              .join("");
            return `
      <details class="el-answers-details">
        <summary class="el-answers-summary">📝 View Typed Answers (${set.cards.length})</summary>
        <div class="el-answers-list">${rows}</div>
      </details>`;
          }
        }

        // Determines which requested cards should actually be shown in the admin's
        // Event Logs for a JJ/JP entry. Players can freely pick from all 12 slots
        // (10 normal + 2 gold) during play, but the log only reveals gold cards when
        // every question was answered correctly — otherwise it shows plain cards
        // capped at however many questions the player actually got right.
        function elVisibleRequiredCards(game, e) {
          const req = e.requiredCards || [];
          const correct = e.correctCount || 0;
          const total =
            game === "jj" ? correct + (e.wrongCount || 0) : e.totalCards || 0;

          if (total > 0 && correct >= total) return req; // perfect score — show everything picked, gold included

          const normalOnly = req.filter((c) => {
            const card = SETS[c.setIdx] && SETS[c.setIdx].cards[c.cardIdx];
            return !(card && card.gold);
          });
          return normalOnly.slice(0, correct);
        }

        function elRenderEntryLog() {
          const listEl = document.getElementById("elEntryList");
          const game = elActiveTab;
          const entries = game === "jj" ? jjEntries : jackpotEntries;
          const searchEl = document.getElementById("elEntrySearch");
          const search = (searchEl ? searchEl.value : "").toLowerCase();
          const bestRoundIds = typeof getBestJackpotEntryIds === "function" ? getBestJackpotEntryIds() : new Set();

          // Rank entries leaderboard-style: highest score (correctCount) first, and
          // whoever posted that score in the quickest time breaks the tie.
          const ranked = entries.slice().sort((a, b) => {
            const scoreA = a.correctCount || 0,
              scoreB = b.correctCount || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            const timeA =
              a.timeSecs || a.timeSecs === 0 ? a.timeSecs : Infinity;
            const timeB =
              b.timeSecs || b.timeSecs === 0 ? b.timeSecs : Infinity;
            return timeA - timeB;
          });
          const rankMap = {};
          ranked.forEach((e, i) => {
            rankMap[e.id] = i + 1;
          });

          const filtered = ranked.filter((e) => {
            if (!search) return true;
            const hay = (e.playerName + " " + (e.townName || "")).toLowerCase();
            return hay.includes(search);
          });

          const statTotalEl = document.getElementById("elStatTotal");
          const statReviewEl = document.getElementById("elStatPendingReview");
          if (statTotalEl) statTotalEl.textContent = entries.length;
          if (statReviewEl)
            statReviewEl.textContent = entries.filter(
              (e) => e && e.status !== "reviewed",
            ).length;

          if (!filtered.length) {
            listEl.innerHTML = `
      <div class="req-empty">
        <div class="re-icon">📜</div>
        <h3>No Entries Yet</h3>
        <p>${search ? "Nothing matches your search." : (game === "jj" ? "Jumbled Jackpot" : "Jackpot Event") + " play sessions will be logged here."}</p>
      </div>`;
            return;
          }

          listEl.innerHTML = "";
          filtered.slice(0, 100).forEach((e) => {
            // Exact submission time (includes seconds) rather than just hour:minute.
            const ts = new Date(e.timestamp).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const timeTaken = _lbFmtTime(e.timeSecs);
            const rank = rankMap[e.id] || filtered.length;
            const rankStr = _lbRankStr(rank);
            const rankColor =
              rank === 1
                ? "#f0c030"
                : rank === 2
                  ? "#c9d3dc"
                  : rank === 3
                    ? "#cd7f32"
                    : "#8b5cf6";
            const isBest = bestRoundIds.has(e.id);
            const isReviewed = e.status === "reviewed";
            const div = document.createElement("div");
            div.className = `req-item status-${isReviewed ? "done" : "pending"}`;
            div.style.padding = "14px";

            // Sort Set 1→15, Card 1→10 (instead of the player's pick order) so the
            // admin can scan requested cards in a predictable sequence.
            const visibleCards = elVisibleRequiredCards(game, e)
              .slice()
              .sort((a, b) => a.setIdx - b.setIdx || a.cardIdx - b.cardIdx);
            const cardsHtml = visibleCards
              .map(
                (c) => `
      <div class="req-mini-card">
        <span class="rmc-emoji">${c.emoji}</span>
        <span class="rmc-name">${c.name}</span>
      </div>`,
              )
              .join("");

            const modePrefix = e.mode === "hard" ? "🔥 Hard Mode · " : "";
            const subInfo =
              game === "jj"
                ? `${modePrefix}✅ ${e.correctCount} · ❌ ${e.wrongCount} · 🔥 ${e.streak} · ⏱ ${timeTaken}`
                : `${modePrefix}${e.setName || ""} — ✅ ${e.correctCount}/${e.totalCards} · ⏱ ${timeTaken}`;

            div.innerHTML = `
      <div class="req-item-topbar" style="background:${isReviewed ? "linear-gradient(90deg,#27ae60,#2ecc71)" : "linear-gradient(90deg,#8b5cf6,#6d28d9)"}"></div>
      <div class="req-item-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
          <span style="font-family:'Fredoka One',cursive;font-size:.75rem;padding:3px 10px;border-radius:20px;white-space:nowrap;background:rgba(0,0,0,.35);color:${rankColor};border:1px solid ${rankColor};">${rankStr}</span>
          ${isBest ? `<span style="font-family:'Fredoka One',cursive;font-size:.65rem;padding:3px 10px;border-radius:20px;white-space:nowrap;background:rgba(240,192,48,.25);color:#f0c030;border:1px solid #f0c030">⭐ Best Entry</span>` : ""}
          <span style="font-family:'Fredoka One',cursive;font-size:.65rem;padding:3px 10px;border-radius:20px;white-space:nowrap;${isReviewed ? "background:rgba(39,174,96,.25);color:#4ade80;border:1px solid #4ade80" : "background:rgba(139,92,246,.25);color:#c4b5fd;border:1px solid #8b5cf6"}">${isReviewed ? "✅ Reviewed" : "🆕 New"}</span>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:1.6rem;width:32px;height:32px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(255,255,255,.07);">${avatarHTML(e.avatar, e.photoURL, e.playerId, e.playerName)}</span>
          <div style="flex:1;">
            <div style="font-family:'Fredoka One',cursive;font-size:.95rem;color:#fff;">${e.playerName} ${e.townName ? `<span style="opacity:.6;font-weight:400">(${e.townName})</span>` : ""}</div>
            <div style="font-size:.82rem;color:#c9b8ff;margin-top:2px;">${subInfo}</div>
          </div>
        </div>

        <div class="req-cards-strip">${cardsHtml || '<span style="color:#888;font-size:.8rem;padding:8px">No cards requested</span>'}</div>

        ${elBuildAnswersHtml(game, e)}

        <div class="req-meta-row">
          ${e.playerId ? `<span class="req-pid-chip">${e.playerId}</span>` : "<span></span>"}
          <span class="req-timestamp">📅 ${ts}</span>
        </div>
      </div>
      <div class="req-item-actions">
        <button class="req-action-btn req-btn-decline" onclick="elDeleteEntry('${game}','${e.id}')">🗑️ Delete</button>
        ${
          isReviewed
            ? `<button class="req-action-btn req-btn-undo" onclick="elSetReviewStatus('${game}','${e.id}','new')">↩️ Mark New</button>`
            : `<button class="req-action-btn req-btn-done" onclick="elSetReviewStatus('${game}','${e.id}','reviewed')">✅ Reviewed</button>`
        }
      </div>
    `;
            listEl.appendChild(div);
          });
        }

        // ═══════════════════════════════════════════════════════
        // DA GATEWAY — Google Form CDS Responses Viewer & Realtime Webhook
        // ═══════════════════════════════════════════════════════
        let dagActiveFilter = "all"; // 'all' | 'pending' | 'done'
        let dagViewMode = "cards"; // 'cards' | 'table'
        let dagRawResponses = []; // array of { id, key, docId, timestamp, primaryName, values: {}, rawRow: [], status }
        let dagHeaders = [];
        let dagIsFetching = false;
        let dagLiveListenerStarted = false;

        const DAG_APPS_SCRIPT_CODE = `// ============================================================
// Dumbledore's Army (DA) Gateway - Auto-Sync Webhook to Firebase
// ============================================================
var FIREBASE_PROJECT_ID = "dacds-aae0c";
var FIREBASE_API_KEY = "AIzaSyCQSXJxOec2eh-pSYyF5JsJeAWngIzwMTA";

function onFormSubmit(e) {
  var responses = {};
  var primaryName = "";
  var timestampStr = new Date().toLocaleString();

  try {
    if (e && e.response) {
      // 1. Triggered directly from Google Form event
      var itemResponses = e.response.getItemResponses();
      var ts = e.response.getTimestamp();
      if (ts) timestampStr = ts.toLocaleString();
      responses["Timestamp"] = timestampStr;

      for (var i = 0; i < itemResponses.length; i++) {
        var item = itemResponses[i];
        var title = item.getItem().getTitle();
        var val = item.getResponse();
        var valStr = Array.isArray(val) ? val.join(", ") : String(val);
        responses[title] = valStr;
        if (!primaryName && valStr) primaryName = valStr;
      }
    } else if (e && e.namedValues) {
      // 2. Triggered from linked Google Sheet with column names
      for (var col in e.namedValues) {
        var arr = e.namedValues[col];
        var str = Array.isArray(arr) ? arr.join(", ") : String(arr);
        responses[col] = str;
        if (col.toLowerCase().includes("timestamp")) timestampStr = str;
        if (!primaryName && !col.toLowerCase().includes("timestamp") && str) {
          primaryName = str;
        }
      }
    } else if (e && e.values) {
      // 3. Triggered from linked Google Sheet raw values
      timestampStr = e.values[0] || timestampStr;
      responses["Timestamp"] = timestampStr;
      primaryName = e.values[1] || "Player";
      for (var j = 1; j < e.values.length; j++) {
        responses["Question " + j] = String(e.values[j]);
      }
    } else {
      // 4. Fallback if tested via 'Run' button in Apps Script editor:
      // Grab the latest form response automatically
      try {
        var form = FormApp.getActiveForm();
        if (form) {
          var allResponses = form.getResponses();
          if (allResponses && allResponses.length > 0) {
            var latest = allResponses[allResponses.length - 1];
            timestampStr = latest.getTimestamp().toLocaleString();
            responses["Timestamp"] = timestampStr;
            var itms = latest.getItemResponses();
            for (var m = 0; m < itms.length; m++) {
              var t = itms[m].getItem().getTitle();
              var v = itms[m].getResponse();
              var s = Array.isArray(v) ? v.join(", ") : String(v);
              responses[t] = s;
              if (!primaryName && s) primaryName = s;
            }
          }
        }
      } catch (fErr) {
        Logger.log("FormApp fallback: " + fErr);
      }
    }
  } catch (err) {
    Logger.log("Error extracting response: " + err);
  }

  var firestoreUrl = "https://firestore.googleapis.com/v1/projects/" + 
    FIREBASE_PROJECT_ID + "/databases/(default)/documents/da_gateway_submissions?key=" + FIREBASE_API_KEY;

  var fields = {
    timestamp: { stringValue: timestampStr },
    primaryName: { stringValue: String(primaryName || "Player") },
    status: { stringValue: "pending" },
    createdAt: { timestampValue: new Date().toISOString() },
    details: { stringValue: JSON.stringify(responses) }
  };

  for (var k in responses) {
    var safeKey = "q_" + k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    fields[safeKey] = { stringValue: String(responses[k]) };
  }

  var options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(firestoreUrl, options);
    Logger.log("Firestore HTTP Code: " + response.getResponseCode());
    Logger.log("Firestore Response: " + response.getContentText());
  } catch (error) {
    Logger.log("Firestore fetch error: " + error);
  }
}`;

        function dagGetSheetUrl() {
          const fromCtrl = (window._ecControls && window._ecControls().dagSheetUrl) || "";
          if (fromCtrl) return fromCtrl;
          try {
            return localStorage.getItem("da_gateway_sheet_url") || "";
          } catch (e) {
            return "";
          }
        }

        function dagSetSheetUrl(url) {
          try {
            localStorage.setItem("da_gateway_sheet_url", url);
          } catch (e) {}
          if (typeof ecControls !== "undefined") {
            ecControls.dagSheetUrl = url;
            if (typeof window.saveEventControls === "function") {
              window.saveEventControls();
            }
          }
        }

        function dagExtractSheetInfo(rawUrl) {
          if (!rawUrl) return null;
          const trimmed = String(rawUrl).trim();
          const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          const sheetId = idMatch ? idMatch[1] : (trimmed.indexOf("http") === -1 && trimmed.length > 15 ? trimmed : null);
          if (!sheetId) return null;
          const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/);
          const gid = gidMatch ? gidMatch[1] : "0";
          return { sheetId, gid };
        }

        function dagGetStatuses() {
          try {
            return JSON.parse(localStorage.getItem("da_gateway_status") || "{}");
          } catch (e) {
            return {};
          }
        }

        function dagSaveStatus(key, status) {
          const map = dagGetStatuses();
          map[key] = status;
          try {
            localStorage.setItem("da_gateway_status", JSON.stringify(map));
          } catch (e) {}
        }

        function dagInitView() {
          const url = dagGetSheetUrl();
          const inp = document.getElementById("dagSheetUrlInput");
          if (inp && !inp.value) inp.value = url;
          const openSheetBtn = document.getElementById("dagOpenSheetBtn");
          if (openSheetBtn) {
            if (url) {
              openSheetBtn.href = url;
              openSheetBtn.style.display = "inline-flex";
            } else {
              openSheetBtn.style.display = "none";
            }
          }

          // Populate the webhook code box
          const codeBox = document.getElementById("dagWebhookCodeBox");
          if (codeBox && !codeBox.value) codeBox.value = DAG_APPS_SCRIPT_CODE;

          // Start realtime Firestore listener for instant webhook pushes
          if (window.startLiveGatewayAdminListener && !dagLiveListenerStarted) {
            dagLiveListenerStarted = true;
            window.startLiveGatewayAdminListener((list) => {
              dagOnFirestoreUpdate(list);
            });
          }

          if (dagRawResponses.length === 0) {
            if (url) {
              dagFetchResponses(false);
            } else {
              dagRenderList();
            }
          } else {
            dagRenderList();
          }
        }

        function updateAdminGatewayBadge(pendingCount) {
          const btn = document.getElementById("adminViewGatewayBtn");
          if (!btn) return;
          const badgeEl = btn.querySelector(".dag-badge-count");
          if (pendingCount > 0) {
            if (badgeEl) {
              badgeEl.textContent = pendingCount;
            } else {
              btn.innerHTML = `🚪 DA Gateway <span class="dag-badge-count" style="background:#e74c3c;color:#fff;padding:2px 7px;border-radius:9999px;font-size:0.75rem;margin-left:5px;font-weight:bold;box-shadow:0 0 6px rgba(231,76,60,0.6);">${pendingCount}</span>`;
            }
          } else {
            if (badgeEl) badgeEl.remove();
          }
        }

        function dagOnFirestoreUpdate(fsList) {
          if (!fsList) fsList = [];
          const pendingCount = fsList.filter((r) => r.status === "pending").length;
          updateAdminGatewayBadge(pendingCount);

          if (fsList.length === 0) {
            dagRawResponses = [];
            dagRenderList();
            return;
          }
          const headerSet = new Set(["Timestamp", "Player Name"]);
          fsList.forEach((item) => {
            if (item.values) {
              Object.keys(item.values).forEach((k) => {
                if (
                  k !== "docId" &&
                  k !== "id" &&
                  k !== "key" &&
                  k !== "timestamp" &&
                  k !== "status" &&
                  k !== "primaryName" &&
                  k !== "createdAt" &&
                  !k.startsWith("q_")
                ) {
                  headerSet.add(k);
                }
              });
            }
          });
          dagHeaders = Array.from(headerSet);
          dagRawResponses = fsList;
          dagRenderList();
        }

        function dagToggleConfig(forceState) {
          const cfg = document.getElementById("dagConfigSection");
          if (!cfg) return;
          const isShow = typeof forceState === "boolean" ? forceState : cfg.style.display === "none";
          cfg.style.display = isShow ? "block" : "none";
        }

        function dagToggleWebhookGuide(forceState) {
          const guide = document.getElementById("dagWebhookGuideSection");
          if (!guide) return;
          const isShow = typeof forceState === "boolean" ? forceState : guide.style.display === "none";
          guide.style.display = isShow ? "block" : "none";
          const codeBox = document.getElementById("dagWebhookCodeBox");
          if (codeBox) codeBox.value = DAG_APPS_SCRIPT_CODE;
        }

        function dagCopyWebhookCode() {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(DAG_APPS_SCRIPT_CODE).then(() => {
              showToast("📋 Apps Script code copied to clipboard!");
            });
          } else {
            const box = document.getElementById("dagWebhookCodeBox");
            if (box) {
              box.select();
              document.execCommand("copy");
              showToast("📋 Code copied!");
            }
          }
        }

        async function dagSendTestWebhook() {
          showToast("⏳ Sending test submission to Firebase…");
          if (window.createTestGatewaySubmission) {
            const ok = await window.createTestGatewaySubmission(
              "Hermione Granger",
              "Ottery St Catchpole",
              "Time Turner (Gold)"
            );
            if (ok) {
              showToast("🎉 Test submission arrived in Firebase!");
            } else {
              showToast("❌ Test submission failed — check connection.");
            }
          }
        }

        function dagSaveSheetConfig() {
          const inp = document.getElementById("dagSheetUrlInput");
          const val = inp ? inp.value.trim() : "";
          if (!val) {
            showToast("⚠️ Please enter a Google Sheet URL");
            return;
          }
          const info = dagExtractSheetInfo(val);
          if (!info) {
            showToast("⚠️ Invalid Google Sheet link. Make sure it contains /spreadsheets/d/...");
            return;
          }
          dagSetSheetUrl(val);
          const openSheetBtn = document.getElementById("dagOpenSheetBtn");
          if (openSheetBtn) {
            openSheetBtn.href = val;
            openSheetBtn.style.display = "inline-flex";
          }
          dagToggleConfig(false);
          showToast("💾 Connected Google Sheet!");
          dagFetchResponses(true);
        }

        function dagParseCSV(text) {
          const rows = [];
          let row = [];
          let cell = "";
          let inQuotes = false;
          for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i + 1];
            if (c === '"') {
              if (inQuotes && next === '"') {
                cell += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (c === ',' && !inQuotes) {
              row.push(cell.trim());
              cell = "";
            } else if ((c === '\r' || c === '\n') && !inQuotes) {
              if (c === '\r' && next === '\n') i++;
              row.push(cell.trim());
              if (row.some(field => field.length > 0)) {
                rows.push(row);
              }
              row = [];
              cell = "";
            } else {
              cell += c;
            }
          }
          if (cell.length > 0 || row.length > 0) {
            row.push(cell.trim());
            if (row.some(field => field.length > 0)) rows.push(row);
          }
          return rows;
        }

        async function dagFetchResponses(isManual) {
          const url = dagGetSheetUrl();
          const info = dagExtractSheetInfo(url);
          const container = document.getElementById("dagResponsesContainer");
          if (!info) {
            if (container && dagRawResponses.length === 0) {
              container.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; background: rgba(0,0,0,0.25); border-radius: 16px; border: 1.5px dashed rgba(255,215,0,0.3); margin-top: 10px;">
                  <div style="font-size: 2.5rem; margin-bottom: 8px;">⚡</div>
                  <div style="font-family: 'Fredoka One', cursive; color: var(--gold); font-size: 1.15rem; margin-bottom: 6px;">Automatic Google Forms Sync</div>
                  <div style="font-size: 0.85rem; color: #c9b8ff; max-width: 440px; margin: 0 auto 16px; line-height: 1.4;">
                    Submissions push automatically into your Admin Panel via the Firebase Webhook, or you can link your Google Sheet.
                  </div>
                  <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-gold" style="font-size: 0.85rem; padding: 8px 16px; border-radius: 9999px;" onclick="dagToggleWebhookGuide(true)">
                      ⚡ View Webhook Setup
                    </button>
                    <button class="btn btn-purple" style="font-size: 0.85rem; padding: 8px 16px; border-radius: 9999px;" onclick="dagSendTestWebhook()">
                      🧪 Send Test Submission
                    </button>
                  </div>
                </div>
              `;
            }
            return;
          }

          if (isManual) showToast("🔄 Fetching live responses…");
          if (container && dagRawResponses.length === 0) {
            container.innerHTML = `
              <div style="text-align: center; padding: 32px 16px; color: var(--gold);">
                <div style="font-size: 2rem; margin-bottom: 8px;" class="spin">⏳</div>
                <div style="font-family: 'Fredoka One', cursive; font-size: 1rem;">Loading CDS Gateway Responses…</div>
                <div style="font-size: 0.8rem; color: #c9b8ff; margin-top: 4px;">Syncing with Google Sheets</div>
              </div>
            `;
          }

          dagIsFetching = true;
          const csvUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq?tqx=out:csv&gid=${info.gid}`;
          const fallbackCsvUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv&gid=${info.gid}`;

          try {
            let res = await fetch(csvUrl);
            if (!res.ok) {
              res = await fetch(fallbackCsvUrl);
            }
            if (!res.ok) throw new Error("HTTP " + res.status);
            const csvText = await res.text();
            const rows = dagParseCSV(csvText);

            if (rows.length === 0) {
              if (dagRawResponses.length === 0) {
                dagHeaders = [];
                dagRawResponses = [];
              }
            } else {
              dagHeaders = rows[0];
              const statuses = dagGetStatuses();
              dagRawResponses = rows.slice(1).map((r, idx) => {
                const ts = r[0] || "";
                const primaryName = r[1] || "Entry #" + (idx + 1);
                const key = "dag_" + info.sheetId + "_" + ts.replace(/[^a-zA-Z0-9]/g, "") + "_" + idx;
                const status = statuses[key] || "pending";
                const values = {};
                dagHeaders.forEach((h, colIdx) => {
                  values[h || "Col " + (colIdx + 1)] = r[colIdx] || "";
                });
                return {
                  id: idx + 1,
                  key,
                  timestamp: ts,
                  primaryName,
                  values,
                  rawRow: r,
                  status
                };
              });
            }

            dagRenderList();
            if (isManual) showToast("✅ Loaded " + dagRawResponses.length + " response(s)!");
          } catch (err) {
            console.error("Failed to fetch Google Sheet CSV:", err);
            if (dagRawResponses.length === 0 && container) {
              container.innerHTML = `
                <div style="text-align: center; padding: 28px 16px; background: rgba(231,76,60,0.1); border: 1.5px solid rgba(231,76,60,0.4); border-radius: 16px; margin-top: 10px;">
                  <div style="font-size: 2.2rem; margin-bottom: 8px;">⚡</div>
                  <div style="font-family: 'Fredoka One', cursive; color: var(--gold); font-size: 1.1rem; margin-bottom: 6px;">Live Firebase Webhook Ready</div>
                  <div style="font-size: 0.85rem; color: #fff; max-width: 460px; margin: 0 auto 12px; line-height: 1.4;">
                    Your website listens directly to Firebase for Google Form submissions in real-time.
                  </div>
                  <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-gold" style="font-size: 0.85rem; padding: 6px 14px; border-radius: 9999px;" onclick="dagToggleWebhookGuide(true)">
                      ⚡ View Webhook Setup
                    </button>
                    <button class="btn btn-purple" style="font-size: 0.85rem; padding: 6px 14px; border-radius: 9999px;" onclick="dagSendTestWebhook()">
                      🧪 Send Test Submission
                    </button>
                  </div>
                </div>
              `;
            }
          } finally {
            dagIsFetching = false;
          }
        }

        function dagSetFilter(filter, btn) {
          dagActiveFilter = filter;
          document.getElementById("dagFilterAll")?.classList.toggle("active", filter === "all");
          document.getElementById("dagFilterPending")?.classList.toggle("active", filter === "pending");
          document.getElementById("dagFilterDone")?.classList.toggle("active", filter === "done");
          dagRenderList();
        }

        function dagSetViewMode(mode, btn) {
          dagViewMode = mode;
          document.getElementById("dagViewModeCards")?.classList.toggle("active", mode === "cards");
          document.getElementById("dagViewModeTable")?.classList.toggle("active", mode === "table");
          dagRenderList();
        }

        async function dagToggleStatus(key) {
          const item = dagRawResponses.find(r => r.key === key);
          if (!item) return;
          const nextStatus = item.status === "done" ? "pending" : "done";
          item.status = nextStatus;
          dagSaveStatus(key, nextStatus);
          if (item.docId && window.updateGatewayStatusInFirestore) {
            await window.updateGatewayStatusInFirestore(item.docId, nextStatus);
          }
          dagRenderList();
          showToast(nextStatus === "done" ? "✅ Marked as Done!" : "⏳ Marked as Pending");
        }

        async function dagDeleteSubmission(key) {
          if (!confirm("Delete this submission from Firebase?")) return;
          const item = dagRawResponses.find(r => r.key === key);
          if (item && item.docId && window.deleteGatewayDocInFirestore) {
            await window.deleteGatewayDocInFirestore(item.docId);
          }
          dagRawResponses = dagRawResponses.filter(r => r.key !== key);
          dagRenderList();
          showToast("🗑️ Submission removed!");
        }

        function dagCopyResponse(key) {
          const item = dagRawResponses.find(r => r.key === key);
          if (!item) return;
          let text = "--- CDS Gateway Response #" + item.id + " ---\n";
          dagHeaders.forEach(h => {
            text += h + ": " + (item.values[h] || "") + "\n";
          });
          text += "Status: " + item.status + "\n";
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => showToast("📋 Copied response details!")).catch(() => {});
          } else {
            showToast("📋 Response details ready!");
          }
        }

        function dagExportCSV() {
          if (!dagRawResponses || dagRawResponses.length === 0) {
            showToast("⚠️ No responses to export");
            return;
          }
          const headers = [...dagHeaders, "Website Status"];
          const lines = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",")];
          dagRawResponses.forEach(r => {
            const row = dagHeaders.map(h => `"${String(r.values[h] || "").replace(/"/g, '""')}"`);
            row.push(`"${r.status}"`);
            lines.push(row.join(","));
          });
          const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `CDS_Gateway_Responses_${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("📥 Exported responses to CSV!");
        }

        function dagRenderList() {
          const totalCount = dagRawResponses.length;
          const pendingCount = dagRawResponses.filter(r => r.status === "pending").length;
          const doneCount = dagRawResponses.filter(r => r.status === "done").length;

          const totalEl = document.getElementById("dagStatTotal");
          const pendingEl = document.getElementById("dagStatPending");
          const doneEl = document.getElementById("dagStatDone");
          if (totalEl) totalEl.textContent = totalCount;
          if (pendingEl) pendingEl.textContent = pendingCount;
          if (doneEl) doneEl.textContent = doneCount;

          const searchInput = document.getElementById("dagSearchInput");
          const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

          let filtered = dagRawResponses;
          if (dagActiveFilter === "pending") {
            filtered = filtered.filter(r => r.status === "pending");
          } else if (dagActiveFilter === "done") {
            filtered = filtered.filter(r => r.status === "done");
          }

          if (query) {
            filtered = filtered.filter(r => {
              return r.rawRow.some(val => String(val).toLowerCase().includes(query));
            });
          }

          const container = document.getElementById("dagResponsesContainer");
          if (!container) return;

          if (filtered.length === 0) {
            container.innerHTML = `
              <div style="text-align: center; padding: 32px 16px; color: rgba(255,255,255,0.6); background: rgba(0,0,0,0.2); border-radius: 14px;">
                <div style="font-size: 2rem; margin-bottom: 6px;">🔍</div>
                <div style="font-family: 'Fredoka One', cursive; font-size: 1rem; color: #ffd54f;">No matching responses found</div>
                <div style="font-size: 0.8rem; margin-top: 4px;">Submissions from the Google Form will automatically appear here live!</div>
              </div>
            `;
            return;
          }

          if (dagViewMode === "table") {
            let tableHtml = `
              <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
                <button class="btn btn-gold" style="font-size: 0.78rem; padding: 4px 10px; border-radius: 9999px;" onclick="dagExportCSV()">
                  📥 Export Filtered CSV
                </button>
              </div>
              <div class="dag-table-wrap">
                <table class="dag-table">
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th style="width: 90px;">Status</th>
                      ${dagHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
                      <th style="width: 140px; text-align: center;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
            `;

            filtered.forEach((r, idx) => {
              const isDone = r.status === "done";
              tableHtml += `
                <tr class="${isDone ? 'is-done' : ''}">
                  <td style="font-family: 'Fredoka One', cursive; color: var(--gold);">${r.id}</td>
                  <td>
                    <span class="dag-badge ${isDone ? 'done' : 'pending'}">${isDone ? '✅ Done' : '⏳ Pending'}</span>
                  </td>
                  ${dagHeaders.map(h => `<td style="max-width: 220px; word-break: break-word;">${escapeHtml(r.values[h] || "—")}</td>`).join("")}
                  <td style="text-align: center; white-space: nowrap;">
                    <button class="btn ${isDone ? 'btn-red' : 'btn-green'}" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 9999px; margin-right: 4px;" onclick="dagToggleStatus('${r.key}')">
                      ${isDone ? '↩ Undo' : '✅ Done'}
                    </button>
                    <button class="btn" style="font-size: 0.72rem; padding: 3px 6px; border-radius: 9999px; background: rgba(255,255,255,0.1); color: #fff; margin-right: 4px;" onclick="dagCopyResponse('${r.key}')" title="Copy Details">
                      📋
                    </button>
                    ${r.docId ? `<button class="btn btn-red" style="font-size: 0.72rem; padding: 3px 6px; border-radius: 9999px;" onclick="dagDeleteSubmission('${r.key}')" title="Delete">🗑️</button>` : ''}
                  </td>
                </tr>
              `;
            });

            tableHtml += `
                  </tbody>
                </table>
              </div>
            `;
            container.innerHTML = tableHtml;
          } else {
            let cardsHtml = `
              <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
                <button class="btn btn-gold" style="font-size: 0.78rem; padding: 4px 10px; border-radius: 9999px;" onclick="dagExportCSV()">
                  📥 Export Filtered CSV
                </button>
              </div>
            `;

            filtered.forEach(r => {
              const isDone = r.status === "done";
              const otherHeaders = dagHeaders.filter((h, i) => i !== 0);

              cardsHtml += `
                <div class="dag-card ${isDone ? 'is-done' : ''}" id="dagCard_${r.key}">
                  <div class="dag-card-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="dag-card-num">#${r.id}</span>
                      <span class="dag-badge ${isDone ? 'done' : 'pending'}">${isDone ? '✅ Completed' : '⏳ Pending'}</span>
                    </div>
                    <div class="dag-card-time">🕒 ${escapeHtml(r.timestamp || 'No Timestamp')}</div>
                  </div>

                  <div class="dag-fields-grid">
                    ${otherHeaders.map(h => `
                      <div class="dag-field-box">
                        <div class="dag-field-label">${escapeHtml(h)}</div>
                        <div class="dag-field-val">${escapeHtml(r.values[h] || '—')}</div>
                      </div>
                    `).join("")}
                  </div>

                  <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap;">
                    <button class="btn" style="font-size: 0.78rem; padding: 5px 12px; border-radius: 9999px; background: rgba(255,255,255,0.1); color: #fff;" onclick="dagCopyResponse('${r.key}')">
                      📋 Copy Details
                    </button>
                    ${r.docId ? `<button class="btn btn-red" style="font-size: 0.78rem; padding: 5px 10px; border-radius: 9999px;" onclick="dagDeleteSubmission('${r.key}')" title="Delete">🗑️</button>` : ''}
                    <button class="btn ${isDone ? 'btn-red' : 'btn-green'}" style="font-size: 0.78rem; padding: 5px 14px; border-radius: 9999px;" onclick="dagToggleStatus('${r.key}')">
                      ${isDone ? '↩️ Mark Pending' : '✅ Mark Done'}
                    </button>
                  </div>
                </div>
              `;
            });

            container.innerHTML = cardsHtml;
          }
        }

        // ── HAPTIC FEEDBACK HELPER ─────────────────────────────
        window.triggerHaptic = function (pattern) {
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(pattern || 12);
            }
          } catch (e) {}
        };

        // ─── SOUND ENGINE ────────────────────────────────────────
        const SFX = (() => {
          let ctx = null;
          let muted = false;

          function getCtx() {
            if (!ctx)
              ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === "suspended") ctx.resume();
            return ctx;
          }

          function play(fn) {
            if (muted) return;
            try {
              fn(getCtx());
            } catch (e) {}
          }

          // Utility: create oscillator + gain, auto-stop
          function osc(ctx, type, freq, startVol, endVol, start, dur) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = type;
            o.frequency.setValueAtTime(freq, start);
            g.gain.setValueAtTime(startVol, start);
            g.gain.linearRampToValueAtTime(endVol, start + dur);
            o.start(start);
            o.stop(start + dur + 0.01);
          }

          return {
            // Card flip — crisp physical deck snap, double-tick flick & aerodynamic glide
            flip() {
              if (window.triggerHaptic) window.triggerHaptic(14);
              play((ctx) => {
                const t = ctx.currentTime;

                // 1. Crisp double-tick cardboard flick & snap
                [0, 0.016].forEach((dt, idx) => {
                  try {
                    const snapLen = Math.floor(ctx.sampleRate * 0.035);
                    const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
                    const snapData = snapBuf.getChannelData(0);
                    for (let i = 0; i < snapLen; i++) {
                      snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.2));
                    }
                    const snapSrc = ctx.createBufferSource();
                    snapSrc.buffer = snapBuf;
                    const snapFilt = ctx.createBiquadFilter();
                    snapFilt.type = "bandpass";
                    snapFilt.frequency.setValueAtTime(idx === 0 ? 3200 : 2600, t + dt);
                    snapFilt.Q.setValueAtTime(3.5, t + dt);
                    const snapGain = ctx.createGain();
                    snapGain.gain.setValueAtTime(idx === 0 ? 0.22 : 0.32, t + dt);
                    snapGain.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.035);
                    snapSrc.connect(snapFilt);
                    snapFilt.connect(snapGain);
                    snapGain.connect(ctx.destination);
                    snapSrc.start(t + dt);
                  } catch (_) {}
                });

                // 2. Silky aerodynamic air swish (filtered noise swoop)
                try {
                  const swishLen = Math.floor(ctx.sampleRate * 0.32);
                  const swishBuf = ctx.createBuffer(1, swishLen, ctx.sampleRate);
                  const swishData = swishBuf.getChannelData(0);
                  for (let i = 0; i < swishLen; i++) {
                    swishData[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / swishLen);
                  }
                  const swishSrc = ctx.createBufferSource();
                  swishSrc.buffer = swishBuf;
                  const swishFilt = ctx.createBiquadFilter();
                  swishFilt.type = "bandpass";
                  swishFilt.frequency.setValueAtTime(1600, t + 0.02);
                  swishFilt.frequency.exponentialRampToValueAtTime(450, t + 0.30);
                  swishFilt.Q.setValueAtTime(2.2, t + 0.02);
                  const swishGain = ctx.createGain();
                  swishGain.gain.setValueAtTime(0.001, t + 0.02);
                  swishGain.gain.linearRampToValueAtTime(0.22, t + 0.09);
                  swishGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
                  swishSrc.connect(swishFilt);
                  swishFilt.connect(swishGain);
                  swishGain.connect(ctx.destination);
                  swishSrc.start(t + 0.02);
                } catch (_) {}

                // 3. Tactile card table touch (soft low tap on settle)
                try {
                  const tap = ctx.createOscillator();
                  const tapG = ctx.createGain();
                  tap.type = "triangle";
                  tap.frequency.setValueAtTime(180, t + 0.24);
                  tap.frequency.exponentialRampToValueAtTime(65, t + 0.36);
                  tapG.gain.setValueAtTime(0.14, t + 0.24);
                  tapG.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
                  tap.connect(tapG);
                  tapG.connect(ctx.destination);
                  tap.start(t + 0.24);
                  tap.stop(t + 0.38);
                } catch (_) {}
              });
            },

            // Card found — magical chime ascend
            cardFound() {
              play((ctx) => {
                const t = ctx.currentTime;
                const notes = [523, 659, 784, 1047]; // C E G C
                notes.forEach((freq, i) => {
                  osc(ctx, "sine", freq, 0.22, 0, t + i * 0.1, 0.25);
                  osc(ctx, "triangle", freq * 2, 0.06, 0, t + i * 0.1, 0.2);
                });
              });
            },

            // Bomb hit — cinematic thunderous detonation, fiery blast shockwave & sub-bass rumble
            bomb() {
              if (window.triggerHaptic) window.triggerHaptic([60, 80, 120]);
              play((ctx) => {
                const t = ctx.currentTime;

                // 1. Initial punch detonation transient
                try {
                  const punch = ctx.createOscillator();
                  const punchG = ctx.createGain();
                  punch.type = "sine";
                  punch.frequency.setValueAtTime(260, t);
                  punch.frequency.exponentialRampToValueAtTime(45, t + 0.12);
                  punchG.gain.setValueAtTime(0.70, t);
                  punchG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
                  punch.connect(punchG);
                  punchG.connect(ctx.destination);
                  punch.start(t);
                  punch.stop(t + 0.15);
                } catch (_) {}

                // 2. Fiery blast shockwave (sweeping resonant lowpass noise)
                try {
                  const blastLen = Math.floor(ctx.sampleRate * 0.65);
                  const blastBuf = ctx.createBuffer(1, blastLen, ctx.sampleRate);
                  const blastData = blastBuf.getChannelData(0);
                  for (let i = 0; i < blastLen; i++) {
                    blastData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (blastLen * 0.35));
                  }
                  const blastSrc = ctx.createBufferSource();
                  blastSrc.buffer = blastBuf;
                  const blastFilter = ctx.createBiquadFilter();
                  blastFilter.type = "lowpass";
                  blastFilter.frequency.setValueAtTime(3200, t);
                  blastFilter.frequency.exponentialRampToValueAtTime(110, t + 0.55);
                  blastFilter.Q.setValueAtTime(2.5, t);
                  const blastGain = ctx.createGain();
                  blastGain.gain.setValueAtTime(0.55, t);
                  blastGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
                  blastSrc.connect(blastFilter);
                  blastFilter.connect(blastGain);
                  blastGain.connect(ctx.destination);
                  blastSrc.start(t);
                } catch (_) {}

                // 3. Deep sub-bass shockwave rumble
                try {
                  const sub = ctx.createOscillator();
                  const subG = ctx.createGain();
                  sub.type = "sine";
                  sub.frequency.setValueAtTime(85, t);
                  sub.frequency.exponentialRampToValueAtTime(26, t + 0.60);
                  subG.gain.setValueAtTime(0.65, t);
                  subG.gain.linearRampToValueAtTime(0.40, t + 0.20);
                  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.70);
                  sub.connect(subG);
                  subG.connect(ctx.destination);
                  sub.start(t);
                  sub.stop(t + 0.72);
                } catch (_) {}

                // 4. Dark Arts ominous low drone (diminished tritone)
                [75, 106].forEach((f) => {
                  try {
                    const darkOsc = ctx.createOscillator();
                    const darkG = ctx.createGain();
                    darkOsc.type = "triangle";
                    darkOsc.frequency.setValueAtTime(f, t + 0.05);
                    darkG.gain.setValueAtTime(0.18, t + 0.05);
                    darkG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
                    darkOsc.connect(darkG);
                    darkG.connect(ctx.destination);
                    darkOsc.start(t + 0.05);
                    darkOsc.stop(t + 0.68);
                  } catch (_) {}
                });
              });
            },

            // Game over — descending doom
            gameOver() {
              if (window.triggerHaptic) window.triggerHaptic([80, 50, 100]);
              play((ctx) => {
                const t = ctx.currentTime;
                const notes = [300, 250, 200, 150, 100];
                notes.forEach((freq, i) => {
                  osc(ctx, "sawtooth", freq, 0.25, 0, t + i * 0.18, 0.35);
                });
              });
            },

            // Win — triumphant fanfare
            win() {
              if (window.triggerHaptic) window.triggerHaptic([30, 40, 50]);
              play((ctx) => {
                const t = ctx.currentTime;
                const melody = [
                  523, 659, 784, 1047, 1047, 1175, 1047, 784, 1047,
                ];
                melody.forEach((freq, i) => {
                  osc(ctx, "square", freq, 0.18, 0, t + i * 0.1, 0.15);
                  osc(ctx, "triangle", freq * 2, 0.07, 0, t + i * 0.1, 0.15);
                });
                // Bass hits
                [0, 0.3, 0.6].forEach((d) =>
                  osc(ctx, "sine", 130, 0.35, 0, t + d, 0.2),
                );
              });
            },

            // Coin earned — bright sparkle
            coin() {
              if (window.triggerHaptic) window.triggerHaptic(15);
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sine", 1200, 0.15, 0, t, 0.08);
                osc(ctx, "sine", 1600, 0.12, 0, t + 0.06, 0.1);
                osc(ctx, "sine", 2000, 0.08, 0, t + 0.12, 0.12);
              });
            },

            // Hint — gentle ping
            hint() {
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sine", 880, 0.2, 0, t, 0.15);
                osc(ctx, "sine", 1320, 0.12, 0, t + 0.12, 0.2);
              });
            },

            // Buy success — cash register ding
            buy() {
              if (window.triggerHaptic) window.triggerHaptic([20, 30, 20]);
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sine", 1047, 0.22, 0, t, 0.1);
                osc(ctx, "sine", 1319, 0.18, 0, t + 0.08, 0.1);
                osc(ctx, "sine", 1568, 0.15, 0, t + 0.16, 0.15);
              });
            },

            // New game / shuffle — card ruffle
            shuffle() {
              play((ctx) => {
                const t = ctx.currentTime;
                for (let i = 0; i < 6; i++) {
                  const buf = ctx.createBuffer(
                    1,
                    ctx.sampleRate * 0.05,
                    ctx.sampleRate,
                  );
                  const data = buf.getChannelData(0);
                  for (let j = 0; j < data.length; j++)
                    data[j] =
                      (Math.random() * 2 - 1) * (1 - j / data.length) * 0.4;
                  const src = ctx.createBufferSource();
                  const g = ctx.createGain();
                  src.buffer = buf;
                  g.gain.setValueAtTime(0.3, t + i * 0.07);
                  src.connect(g);
                  g.connect(ctx.destination);
                  src.start(t + i * 0.07);
                }
              });
            },

            // Tab switch — soft click
            click() {
              if (window.triggerHaptic) window.triggerHaptic(12);
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sine", 440, 0.1, 0, t, 0.05);
              });
            },

            // Countdown tick — short clock beep for the final seconds of a timer
            tick() {
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "square", 1000, 0.12, 0, t, 0.05);
              });
            },

            // Request sent — notification chime
            notify() {
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sine", 660, 0.2, 0, t, 0.12);
                osc(ctx, "sine", 880, 0.18, 0, t + 0.1, 0.12);
                osc(ctx, "sine", 1100, 0.15, 0, t + 0.2, 0.18);
              });
            },

            // Heart lost — descending sting
            heartLost() {
              play((ctx) => {
                const t = ctx.currentTime;
                osc(ctx, "sawtooth", 400, 0.2, 0, t, 0.1);
                osc(ctx, "sawtooth", 300, 0.2, 0, t + 0.1, 0.1);
                osc(ctx, "sawtooth", 200, 0.2, 0, t + 0.2, 0.15);
              });
            },

            toggle() {
              muted = !muted;
              return muted;
            },
            isMuted() {
              return muted;
            },
          };
        })();

        function toggleMute() {
          const muted = SFX.toggle();
          const btn = document.getElementById("muteBtn");
          btn.textContent = muted ? "🔇" : "🔊";
          btn.style.opacity = muted ? "0.5" : "1";
          if (!muted) SFX.click();
        }

        function exportRequests() {
          const pending = cardRequests.filter((r) => r.status === "pending");
          if (pending.length === 0) {
            showToast("No pending requests to export!");
            return;
          }
          const lines = pending.map((r, i) => {
            const set = (typeof SETS !== "undefined" && SETS && SETS[r.setIdx]) || { name: `Set ${r.setIdx + 1}`, cards: [] };
            const card = (set.cards && set.cards[r.cardIdx]) || { name: `Card ${r.cardIdx + 1}`, emoji: "🃏" };
            return `${i + 1}. ${card.emoji} ${card.name} (${set.name}) — ${r.playerName}, ${r.townName}${r.note ? ' | "' + r.note + '"' : ""}`;
          });
          const text =
            `📬 DA Card Requests (${new Date().toLocaleDateString()})\n` +
            lines.join("\n");
          navigator.clipboard
            .writeText(text)
            .then(() => showToast("📋 Report copied to clipboard!"))
            .catch(() => {
              prompt("Copy this report:", text);
            });
        }

        // ═══════════════════════════════════════════════════════════
        // DAILY COOLDOWN SYSTEM
        // ═══════════════════════════════════════════════════════════
        const CD_KEY_HOC = "da_cd_hoc"; // base keys — prefixed with _cdPrefix at runtime
        const CD_KEY_SPIN = "da_cd_spin";
        const CD_KEY_SPIN_COUNT = "da_cd_spin_count";
        const CD_KEY_PR = "da_cd_pr";
        const SPIN_DAILY_LIMIT = 3;
        const SPIN_EXTRA_COST = 125; // coins per extra spin once the 3 free daily spins are used

        window._dailyCooldowns = window._dailyCooldowns || {};

        // Robust player-scoped cooldown key resolver:
        // Always scopes keys to the active player ID, completely preventing bleed
        // across multiple accounts on the same phone.
        function _cdPrefix() {
          return _getCdPrefix();
        }

        function _cdKey(base) {
          return _getCdPrefix() + base;
        }

        window._getDailyCooldowns = function () {
          const res = Object.assign({}, window._dailyCooldowns || {});
          const today = todayStr();
          const prefix = _getCdPrefix();
          [CD_KEY_HOC, CD_KEY_PR, CD_KEY_SPIN].forEach((k) => {
            try {
              if (localStorage.getItem(prefix + k) === today) {
                res[k] = today;
              }
            } catch (e) {}
          });
          try {
            if (localStorage.getItem(prefix + CD_KEY_SPIN) === today) {
              const lc =
                parseInt(
                  localStorage.getItem(prefix + CD_KEY_SPIN_COUNT) || "0",
                  10,
                ) || 0;
              const sc =
                typeof res[CD_KEY_SPIN_COUNT] === "number"
                  ? res[CD_KEY_SPIN_COUNT]
                  : parseInt(res[CD_KEY_SPIN_COUNT] || "0", 10) || 0;
              res[CD_KEY_SPIN] = today;
              res[CD_KEY_SPIN_COUNT] = Math.max(lc, sc);
            }
          } catch (e) {}
          return res;
        };

        window._setDailyCooldowns = function (cds) {
          if (!cds || typeof cds !== "object") return;
          window._dailyCooldowns = Object.assign({}, cds);
          const today = todayStr();
          const prefix = _getCdPrefix();
          try {
            [CD_KEY_HOC, CD_KEY_PR, CD_KEY_SPIN].forEach((k) => {
              if (cds[k] === today) {
                localStorage.setItem(prefix + k, today);
              } else if (localStorage.getItem(prefix + k) !== today) {
                localStorage.removeItem(prefix + k);
              }
            });
            if (cds[CD_KEY_SPIN] === today) {
              const serverCount =
                typeof cds[CD_KEY_SPIN_COUNT] === "number"
                  ? cds[CD_KEY_SPIN_COUNT]
                  : parseInt(cds[CD_KEY_SPIN_COUNT] || "0", 10) || 0;
              const localCount =
                parseInt(
                  localStorage.getItem(prefix + CD_KEY_SPIN_COUNT) || "0",
                  10,
                ) || 0;
              if (serverCount > localCount) {
                localStorage.setItem(prefix + CD_KEY_SPIN, today);
                localStorage.setItem(
                  prefix + CD_KEY_SPIN_COUNT,
                  String(serverCount),
                );
              }
            } else if (localStorage.getItem(prefix + CD_KEY_SPIN) !== today) {
              localStorage.removeItem(prefix + CD_KEY_SPIN_COUNT);
            }
          } catch (e) {}
        };

        function getSpinCountToday() {
          const today = todayStr();
          let localCount = 0;
          let serverCount = 0;
          const prefix = _getCdPrefix();
          try {
            if (localStorage.getItem(prefix + CD_KEY_SPIN) === today) {
              localCount =
                parseInt(
                  localStorage.getItem(prefix + CD_KEY_SPIN_COUNT) || "0",
                  10,
                ) || 0;
            }
          } catch (e) {}
          if (
            window._dailyCooldowns &&
            window._dailyCooldowns[CD_KEY_SPIN] === today
          ) {
            const sc = window._dailyCooldowns[CD_KEY_SPIN_COUNT];
            serverCount =
              typeof sc === "number" ? sc : parseInt(sc || "0", 10) || 0;
          }
          return Math.max(localCount, serverCount);
        }

        function incrementSpinCount() {
          try {
            var today = todayStr();
            var count = getSpinCountToday() + 1; // getSpinCountToday() already resets to 0 on a new day
            const prefix = _getCdPrefix();
            localStorage.setItem(prefix + CD_KEY_SPIN, today);
            localStorage.setItem(prefix + CD_KEY_SPIN_COUNT, String(count));
            if (!window._dailyCooldowns) window._dailyCooldowns = {};
            window._dailyCooldowns[CD_KEY_SPIN] = today;
            window._dailyCooldowns[CD_KEY_SPIN_COUNT] = count;
            if (typeof window.saveProgress === "function") window.saveProgress(true);
          } catch (e) {}
        }

        function hasReachedSpinLimit() {
          if (parseInt(window._bonusFreeSpins || 0, 10) > 0) return false;
          return getSpinCountToday() >= SPIN_DAILY_LIMIT;
        }

        let cdTimers = {}; // holds setInterval ids

        // Returns a date key based on the PLAYER'S LOCAL calendar day, not UTC.
        // This must stay in sync with msUntilMidnight() below (also local-time
        // based) so the countdown timer and the actual daily reset always agree —
        // previously todayStr() used toISOString() (UTC date) while the countdown
        // counted down to local midnight, so the limit didn't actually reset until
        // UTC midnight, which is a different local hour for every timezone.
        function localDateKey(d) {
          d = d || new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return y + "-" + m + "-" + day;
        }
        function todayStr() {
          return localDateKey(new Date()); // e.g. "2025-06-07", local calendar day
        }

        function hasPlayedToday(key) {
          try {
            const today = todayStr();
            if (localStorage.getItem(_cdKey(key)) === today) return true;
            if (window._dailyCooldowns && window._dailyCooldowns[key] === today)
              return true;
            return false;
          } catch (e) {
            if (
              window._dailyCooldowns &&
              window._dailyCooldowns[key] === todayStr()
            )
              return true;
            return false;
          }
        }

        function markPlayedToday(key) {
          try {
            const today = todayStr();
            localStorage.setItem(_cdKey(key), today);
            if (!window._dailyCooldowns) window._dailyCooldowns = {};
            window._dailyCooldowns[key] = today;
            if (typeof window.saveProgress === "function") window.saveProgress(true);
          } catch (e) {}
        }

        function msUntilMidnight() {
          const now = new Date();
          const midnight = new Date(now);
          midnight.setHours(24, 0, 0, 0);
          return midnight - now;
        }

        function formatCountdown(ms) {
          if (ms <= 0) return "0h 0m";
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          if (h > 0) return h + "h " + m + "m";
          if (m > 0) return m + "m " + s + "s";
          return s + "s";
        }

        function startCountdownTimer(timerElId, onExpire) {
          const el = document.getElementById(timerElId);
          if (!el) return;
          if (cdTimers[timerElId]) clearInterval(cdTimers[timerElId]);
          function tick() {
            const ms = msUntilMidnight();
            if (el) el.textContent = formatCountdown(ms);
            if (ms <= 1000) {
              clearInterval(cdTimers[timerElId]);
              onExpire && onExpire();
            }
          }
          tick();
          cdTimers[timerElId] = setInterval(tick, 1000);
        }

        // ── HOC Cooldown ──────────────────────────────────────────
        function checkHocCooldown() {
          const banner = document.getElementById("hocCooldownBanner");
          const hintBtn = document.getElementById("hintBtn");
          // Only treat the day as "used up" once today's round has actually ended
          // (bust or win) — not just because the first flip locked in the day.
          // While a round is still active, the player should keep full access to
          // flips and hints even though hasPlayedToday() is already true.
          if (hasPlayedToday(CD_KEY_HOC) && !gameActive) {
            if (banner) banner.classList.add("show");
            if (hintBtn) {
              hintBtn.disabled = true;
              hintBtn.style.opacity = ".45";
            }
            startCountdownTimer("hocCooldownTimer", () => {
              checkHocCooldown();
            });
          } else {
            if (banner) banner.classList.remove("show");
            if (hintBtn) {
              hintBtn.disabled = false;
              hintBtn.style.opacity = "";
            }
          }
        }

        // ── Pattern Recall ──
        // One attempt per local calendar day. Unlike HOC (which only starts
        // the cooldown once a round ends), PR consumes the day's play the
        // moment a fresh run is started (see prStartGame), so this only ever
        // needs to gate the start screen.
        function checkPrCooldown() {
          const banner = document.getElementById("prCooldownBanner");
          const startBtn = document.getElementById("prStartBtn");
          if (hasPlayedToday(CD_KEY_PR)) {
            if (banner) banner.classList.add("show");
            if (startBtn) {
              startBtn.disabled = true;
              startBtn.style.opacity = ".5";
            }
            startCountdownTimer("prCooldownTimer", () => {
              checkPrCooldown();
            });
          } else {
            if (banner) banner.classList.remove("show");
            if (startBtn) {
              startBtn.disabled = false;
              startBtn.style.opacity = "";
            }
          }
        }

        // ═══════════════════════════════════════════════════════════
        // SPIN & WIN — 3D REALISTIC
        // ═══════════════════════════════════════════════════════════
        function getSuperWheelActive() {
          try {
            var prefix = typeof _getCdPrefix === "function" ? _getCdPrefix() : "da_";
            return localStorage.getItem(prefix + "da_super_wheel_active") === "1" || !!window._isSuperWheelActive;
          } catch (e) {
            return !!window._isSuperWheelActive;
          }
        }

        function setSuperWheelActive(active) {
          window._isSuperWheelActive = !!active;
          try {
            var prefix = typeof _getCdPrefix === "function" ? _getCdPrefix() : "da_";
            if (active) {
              localStorage.setItem(prefix + "da_super_wheel_active", "1");
            } else {
              localStorage.removeItem(prefix + "da_super_wheel_active");
            }
          } catch (e) {}
        }

        function getBonusFreeSpins() {
          try {
            var prefix = typeof _getCdPrefix === "function" ? _getCdPrefix() : "da_";
            var val = parseInt(localStorage.getItem(prefix + "da_spin_bonus_free") || "0", 10) || 0;
            var memVal = parseInt(window._bonusFreeSpins || "0", 10) || 0;
            return Math.max(val, memVal);
          } catch (e) {
            return parseInt(window._bonusFreeSpins || "0", 10) || 0;
          }
        }

        function setBonusFreeSpins(n) {
          var count = Math.max(0, parseInt(n || 0, 10) || 0);
          window._bonusFreeSpins = count;
          try {
            var prefix = typeof _getCdPrefix === "function" ? _getCdPrefix() : "da_";
            if (count > 0) {
              localStorage.setItem(prefix + "da_spin_bonus_free", String(count));
            } else {
              localStorage.removeItem(prefix + "da_spin_bonus_free");
            }
          } catch (e) {}
        }

        const WHEEL_SEGMENTS = [
          {
            type: "coins",
            coins: 500,
            icon: "⚡",
            rarity: "Legendary",
            rarityColor: "#ffd700",
            grad: ["#fff4b0", "#ffd700", "#c8860a", "#8a5c00"],
            textColor: "#fff",
            weight: 5,
            glow: "rgba(255,215,0,.9)",
            desc: "Incredible! A Legendary prize!",
          },
          {
            type: "coins",
            coins: 30,
            icon: "🌾",
            rarity: "Basic",
            rarityColor: "#94a3b8",
            grad: ["#94a3b8", "#475569", "#1e293b", "#0f172a"],
            textColor: "#e2e8f0",
            weight: 21,
            glow: "rgba(148,163,184,.7)",
            desc: "Keep spinning for greater prizes!",
          },
          {
            type: "super_wheel",
            coins: 0,
            label: "SUPER",
            subLabel: "WHEEL",
            icon: "⭐",
            rarity: "Mythic",
            rarityColor: "#ff007f",
            grad: ["#ff3399", "#e11d48", "#9f1239", "#4c0519"],
            textColor: "#ffffff",
            weight: 3,
            glow: "rgba(255,0,128,.95)",
            desc: "SUPER WHEEL ACTIVATED! Next round rewards ×5!",
          },
          {
            type: "coins",
            coins: 70,
            icon: "🌿",
            rarity: "Uncommon",
            rarityColor: "#4ade80",
            grad: ["#86efac", "#22c55e", "#15803d", "#14532d"],
            textColor: "#fff",
            weight: 17,
            glow: "rgba(74,222,128,.9)",
            desc: "Nice! A solid coin haul!",
          },
          {
            type: "free_spins",
            coins: 0,
            spins: 3,
            label: "+3",
            subLabel: "SPINS",
            icon: "🎁",
            rarity: "Special",
            rarityColor: "#06b6d4",
            grad: ["#38bdf8", "#0891b2", "#155e75", "#083344"],
            textColor: "#ffffff",
            weight: 8,
            glow: "rgba(6,182,212,.95)",
            desc: "Free 3 Spins granted! Spin without limits!",
          },
          {
            type: "coins",
            coins: 50,
            icon: "🏘️",
            rarity: "Common",
            rarityColor: "#fb923c",
            grad: ["#fdba74", "#f97316", "#c2410c", "#7c2d12"],
            textColor: "#fff",
            weight: 19,
            glow: "rgba(249,115,22,.9)",
            desc: "A common reward. Keep spinning!",
          },
          {
            type: "card_pack",
            coins: 0,
            label: "CARD",
            subLabel: "PACK",
            icon: "🃏",
            rarity: "Godly",
            rarityColor: "#a855f7",
            grad: ["#e879f9", "#9333ea", "#6b21a8", "#3b0764"],
            textColor: "#ffffff",
            weight: 1,
            glow: "rgba(168,85,247,.95)",
            desc: "MYTHIC REWARD! All cards of a random set!",
          },
          {
            type: "coins",
            coins: 100,
            icon: "🦉",
            rarity: "Rare",
            rarityColor: "#38bdf8",
            grad: ["#7dd3fc", "#2563eb", "#1e40af", "#1e3a8a"],
            textColor: "#fff",
            weight: 15,
            glow: "rgba(56,189,248,.9)",
            desc: "Rare! A fine reward!",
          },
          {
            type: "coins",
            coins: 250,
            icon: "🔮",
            rarity: "Epic",
            rarityColor: "#d946ef",
            grad: ["#f472b6", "#c026d3", "#86198f", "#4a044e"],
            textColor: "#fff",
            weight: 11,
            glow: "rgba(217,70,239,.9)",
            desc: "Epic! The magic is strong!",
          },
        ];

        const WHEEL_SLICES = WHEEL_SEGMENTS;
        const TOTAL_SLICES = WHEEL_SLICES.length;
        const SLICE_ANGLE = (2 * Math.PI) / TOTAL_SLICES;

        let wheelAngle = 0;
        let wheelSpinning = false;
        let _lastTickAngle = 0;

        // ── 3D ROUNDED RECTANGLE HELPER ─────────────────────────
        function drawRoundedRect(ctx, x, y, w, h, r) {
          if (w < 2 * r) r = w / 2;
          if (h < 2 * r) r = h / 2;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        }

        // ── OFFSCREEN PRE-RENDERED WHEEL DISC CACHE (60/120 FPS LOCKED) ──
        var _wheelStaticDiscNormal = null;
        var _wheelStaticDiscSuper = null;

        function getStaticDiscCanvas(isSuper) {
          if (isSuper && _wheelStaticDiscSuper) return _wheelStaticDiscSuper;
          if (!isSuper && _wheelStaticDiscNormal) return _wheelStaticDiscNormal;

          var discCanvas = document.createElement("canvas");
          discCanvas.width = 580;
          discCanvas.height = 580;
          var ctx = discCanvas.getContext("2d");
          var W = 580, H = 580;
          var cx = 290, cy = 290;
          var rW = 286;
          var rHub = 68;

          // Base background disc
          ctx.beginPath();
          ctx.arc(cx, cy, rW, 0, 2 * Math.PI);
          ctx.fillStyle = isSuper ? "#19040d" : "#0a0614";
          ctx.fill();

          // ── Draw 9 wedges ──
          for (var i = 0; i < TOTAL_SLICES; i++) {
            var seg = WHEEL_SLICES[i];
            var startA = i * SLICE_ANGLE - Math.PI / 2 - SLICE_ANGLE / 2;
            var midA = startA + SLICE_ANGLE / 2;
            var endA = startA + SLICE_ANGLE;
            var isLocked =
              isSuper &&
              (seg.type === "free_spins" || seg.type === "card_pack");

            // Wedge radial gradient
            var rg = ctx.createRadialGradient(cx, cy, rHub, cx, cy, rW);
            rg.addColorStop(0, seg.grad[0]);
            rg.addColorStop(0.35, seg.grad[1]);
            rg.addColorStop(0.75, seg.grad[2]);
            rg.addColorStop(1, seg.grad[3]);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, rW - 14, startA, endA);
            ctx.closePath();
            ctx.fillStyle = rg;
            ctx.fill();

            // 3D slice divider bevels
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(startA) * (rW - 14), cy + Math.sin(startA) * (rW - 14));
            ctx.strokeStyle = isSuper ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.35)";
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Inner dark divider edge
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(endA) * (rW - 14), cy + Math.sin(endA) * (rW - 14));
            ctx.strokeStyle = "rgba(0,0,0,0.55)";
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Subtle inner arch highlight band
            ctx.beginPath();
            ctx.arc(cx, cy, rHub + 22, startA + 0.04, endA - 0.04);
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 6;
            ctx.stroke();

            // Shroud if locked in Super Wheel
            if (isLocked) {
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.arc(cx, cy, rW - 14, startA, endA);
              ctx.closePath();
              ctx.fillStyle = "rgba(10, 4, 18, 0.82)";
              ctx.fill();
            }

            // ── 3D REWARD CHIP (Pill Container) ──
            var chipDist = 175;
            var chipX = cx + Math.cos(midA) * chipDist;
            var chipY = cy + Math.sin(midA) * chipDist;
            var chipW = 100;
            var chipH = 68;
            var chipR = 17;

            ctx.save();
            ctx.translate(chipX, chipY);
            ctx.rotate(midA + Math.PI / 2); // Orient tangentially, right-side up under pointer

            // Chip Drop Shadow
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.65)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 5;
            drawRoundedRect(ctx, -chipW / 2, -chipH / 2, chipW, chipH, chipR);
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fill();
            ctx.restore();

            // Chip Background Fill
            var chipGrad = ctx.createLinearGradient(0, -chipH / 2, 0, chipH / 2);
            if (isLocked) {
              chipGrad.addColorStop(0, "#380d19");
              chipGrad.addColorStop(1, "#1c040a");
            } else if (seg.type === "super_wheel") {
              chipGrad.addColorStop(0, "#fff1f6");
              chipGrad.addColorStop(0.35, "#ffe4e6");
              chipGrad.addColorStop(1, "#fecdd3");
            } else if (seg.coins === 500) {
              chipGrad.addColorStop(0, "#fffbeb");
              chipGrad.addColorStop(0.4, "#fef3c7");
              chipGrad.addColorStop(1, "#fde68a");
            } else {
              chipGrad.addColorStop(0, "#ffffff");
              chipGrad.addColorStop(0.45, "#f8fafc");
              chipGrad.addColorStop(1, "#e2e8f0");
            }

            drawRoundedRect(ctx, -chipW / 2, -chipH / 2, chipW, chipH, chipR);
            ctx.fillStyle = chipGrad;
            ctx.fill();

            // 3D Embossed Chip Border
            ctx.beginPath();
            drawRoundedRect(ctx, -chipW / 2, -chipH / 2, chipW, chipH, chipR);
            if (isLocked) {
              ctx.strokeStyle = "#ef4444";
              ctx.lineWidth = 2.6;
            } else if (seg.type === "super_wheel") {
              ctx.strokeStyle = "#e11d48";
              ctx.lineWidth = 3.0;
            } else if (seg.coins === 500) {
              ctx.strokeStyle = "#f59e0b";
              ctx.lineWidth = 3.0;
            } else if (seg.type === "free_spins") {
              ctx.strokeStyle = "#06b6d4";
              ctx.lineWidth = 3.0;
            } else if (seg.type === "card_pack") {
              ctx.strokeStyle = "#a855f7";
              ctx.lineWidth = 3.0;
            } else {
              ctx.strokeStyle = "#cbd5e1";
              ctx.lineWidth = 2.6;
            }
            ctx.stroke();

            // Top specular gloss reflection arc
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, -chipH / 2 + 13, chipW * 0.38, 9, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.fill();
            ctx.restore();

            // ── CHIP CONTENT (ZERO BLEED) ──
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (isLocked) {
              ctx.font = 'bold 32px "Fredoka One", cursive, sans-serif';
              ctx.fillStyle = "#ef4444";
              ctx.fillText("🔒", 0, -9);

              ctx.font = '900 13px "Nunito", sans-serif';
              ctx.fillStyle = "#fca5a5";
              ctx.fillText("LOCKED", 0, 18);
            } else if (seg.type === "coins") {
              var displayCoins = isSuper ? seg.coins * 5 : seg.coins;
              var isFourDigit = displayCoins >= 1000;
              var fontSize = isFourDigit ? "34px" : "40px";

              ctx.font = "bold " + fontSize + ' "Fredoka One", cursive, sans-serif';
              // Dark outline for ultra crisp readability
              ctx.strokeStyle = "rgba(0,0,0,0.65)";
              ctx.lineWidth = 4.5;
              ctx.strokeText(displayCoins.toString(), 0, -8);

              ctx.fillStyle = isSuper
                ? "#b45309"
                : (seg.coins === 500 ? "#b45309" : "#0f172a");
              ctx.fillText(displayCoins.toString(), 0, -8);

              ctx.font = '900 13px "Nunito", sans-serif';
              ctx.fillStyle = isSuper ? "#d97706" : "#64748b";
              ctx.fillText(isSuper ? "×5 COINS" : "COINS", 0, 18);
            } else if (seg.type === "super_wheel") {
              ctx.font = 'bold 30px "Fredoka One", cursive, sans-serif';
              ctx.strokeStyle = "rgba(0,0,0,0.6)";
              ctx.lineWidth = 4;
              ctx.strokeText("⭐ 5×", 0, -8);
              ctx.fillStyle = "#e11d48";
              ctx.fillText("⭐ 5×", 0, -8);

              ctx.font = '900 13px "Nunito", sans-serif';
              ctx.fillStyle = "#be123c";
              ctx.fillText("SUPER", 0, 18);
            } else if (seg.type === "free_spins") {
              ctx.font = 'bold 34px "Fredoka One", cursive, sans-serif';
              ctx.strokeStyle = "rgba(0,0,0,0.6)";
              ctx.lineWidth = 4;
              ctx.strokeText("+3", 0, -8);
              ctx.fillStyle = "#0284c7";
              ctx.fillText("+3", 0, -8);

              ctx.font = '900 13px "Nunito", sans-serif';
              ctx.fillStyle = "#0369a1";
              ctx.fillText("SPINS", 0, 18);
            } else if (seg.type === "card_pack") {
              ctx.font = 'bold 26px "Fredoka One", cursive, sans-serif';
              ctx.strokeStyle = "rgba(0,0,0,0.6)";
              ctx.lineWidth = 3.8;
              ctx.strokeText("🃏 PACK", 0, -8);
              ctx.fillStyle = "#7e22ce";
              ctx.fillText("🃏 PACK", 0, -8);

              ctx.font = '900 13px "Nunito", sans-serif';
              ctx.fillStyle = "#6b21a8";
              ctx.fillText("CARDS", 0, 18);
            }

            ctx.restore();
          }

          // ── 3D GOLDEN OUTER RIM & 18 SPHERICAL PEGS ──
          var rimGrad = ctx.createLinearGradient(0, 0, W, H);
          if (isSuper) {
            rimGrad.addColorStop(0, "#ffe4e6");
            rimGrad.addColorStop(0.3, "#ff007f");
            rimGrad.addColorStop(0.65, "#ffd700");
            rimGrad.addColorStop(1, "#881337");
          } else {
            rimGrad.addColorStop(0, "#fffbeb");
            rimGrad.addColorStop(0.3, "#fde047");
            rimGrad.addColorStop(0.65, "#d97706");
            rimGrad.addColorStop(1, "#78350f");
          }

          ctx.beginPath();
          ctx.arc(cx, cy, rW - 7, 0, 2 * Math.PI);
          ctx.strokeStyle = rimGrad;
          ctx.lineWidth = 14;
          ctx.stroke();

          // Outer thin golden highlight wire
          ctx.beginPath();
          ctx.arc(cx, cy, rW - 1, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // 18 3D Spherical Pegs (offset by half a peg spacing so pointer rests in the valley between pegs)
          var PEG_COUNT = 18;
          for (var p = 0; p < PEG_COUNT; p++) {
            var pa = (p + 0.5) * (2 * Math.PI / PEG_COUNT) - Math.PI / 2;
            var pr = rW - 7;
            var px = cx + Math.cos(pa) * pr;
            var py = cy + Math.sin(pa) * pr;

            // Peg base shadow
            ctx.beginPath();
            ctx.arc(px, py + 1.2, 5.5, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fill();

            // Peg 3D spherical dome
            var pegGrad = ctx.createRadialGradient(px - 1.8, py - 1.8, 0.8, px, py, 5.5);
            if (isSuper && p % 2 === 1) {
              pegGrad.addColorStop(0, "#ffffff");
              pegGrad.addColorStop(0.4, "#ff69b4");
              pegGrad.addColorStop(0.85, "#be123c");
              pegGrad.addColorStop(1, "#4c0519");
            } else {
              pegGrad.addColorStop(0, "#ffffff");
              pegGrad.addColorStop(0.35, "#fef08a");
              pegGrad.addColorStop(0.75, "#eab308");
              pegGrad.addColorStop(1, "#78350f");
            }

            ctx.beginPath();
            ctx.arc(px, py, 5.2, 0, 2 * Math.PI);
            ctx.fillStyle = pegGrad;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(px, py, 5.2, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }

          if (isSuper) {
            _wheelStaticDiscSuper = discCanvas;
          } else {
            _wheelStaticDiscNormal = discCanvas;
          }

          return discCanvas;
        }

        // ── DRAW WHEEL (0.02ms HARDWARE-ACCELERATED RENDER) ──────
        function drawWheel(angle) {
          if (window.spinWheelController && typeof window.spinWheelController.setAngle === "function") {
            window.spinWheelController.setAngle(angle * (180 / Math.PI));
            return;
          }
          var canvas = document.getElementById("wheelCanvas");
          if (!canvas) return;
          var ctx = canvas.getContext("2d");
          var W = canvas.width,
            H = canvas.height;
          var cx = W / 2,
            cy = H / 2;
          var rHub = 56;
          var isSuper = getSuperWheelActive();

          var disc = getStaticDiscCanvas(isSuper);

          ctx.clearRect(0, 0, W, H);

          // Fast blit of pre-rendered rotating disc (0.02ms execution time!)
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.drawImage(disc, -cx, -cy);
          ctx.restore();

          // ── Stationary Center Hub Dome ──
          // Hub drop shadow
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, rHub + 6, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fill();

          // Beveled golden outer ring
          var hubRing = ctx.createLinearGradient(cx - rHub, cy - rHub, cx + rHub, cy + rHub);
          if (isSuper) {
            hubRing.addColorStop(0, "#fff1f2");
            hubRing.addColorStop(0.35, "#ff007f");
            hubRing.addColorStop(0.7, "#ffd700");
            hubRing.addColorStop(1, "#881337");
          } else {
            hubRing.addColorStop(0, "#fffbeb");
            hubRing.addColorStop(0.35, "#fde047");
            hubRing.addColorStop(0.7, "#d97706");
            hubRing.addColorStop(1, "#78350f");
          }
          ctx.beginPath();
          ctx.arc(cx, cy, rHub, 0, 2 * Math.PI);
          ctx.fillStyle = hubRing;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, rHub, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Inner deep glossy bowl
          var hubBowl = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, rHub - 7);
          if (isSuper) {
            hubBowl.addColorStop(0, "#e11d48");
            hubBowl.addColorStop(0.65, "#881337");
            hubBowl.addColorStop(1, "#4c0519");
          } else {
            hubBowl.addColorStop(0, "#4a2090");
            hubBowl.addColorStop(0.65, "#1e0b4b");
            hubBowl.addColorStop(1, "#070314");
          }
          ctx.beginPath();
          ctx.arc(cx, cy, rHub - 7, 0, 2 * Math.PI);
          ctx.fillStyle = hubBowl;
          ctx.fill();

          // Rotating gold spokes inside hub
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          for (var s = 0; s < 6; s++) {
            ctx.rotate(Math.PI / 3);
            var spokeG = ctx.createLinearGradient(0, -rHub + 10, 0, -10);
            spokeG.addColorStop(0, "rgba(255,215,0,0)");
            spokeG.addColorStop(1, isSuper ? "rgba(255,105,180,0.5)" : "rgba(255,215,0,0.45)");
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(4, -rHub + 12);
            ctx.lineTo(-4, -rHub + 12);
            ctx.closePath();
            ctx.fillStyle = spokeG;
            ctx.fill();
          }
          ctx.restore();

          // Hub center emblem
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          if (isSuper) {
            ctx.font = 'bold 30px "Fredoka One", cursive';
            ctx.fillStyle = "#ffd700";
            ctx.fillText("5×", cx, cy - 5);

            ctx.font = '900 13px "Nunito", sans-serif';
            ctx.fillStyle = "#ffffff";
            ctx.fillText("SUPER", cx, cy + 16);
          } else {
            ctx.font = "38px sans-serif";
            ctx.fillText("⚡", cx, cy + 2);
          }

          // Specular glass shine on hub
          var hubGloss = ctx.createRadialGradient(cx - 16, cy - 16, 3, cx - 10, cy - 10, rHub * 0.65);
          hubGloss.addColorStop(0, "rgba(255,255,255,0.4)");
          hubGloss.addColorStop(1, "rgba(255,255,255,0)");
          ctx.beginPath();
          ctx.arc(cx, cy, rHub - 7, 0, 2 * Math.PI);
          ctx.fillStyle = hubGloss;
          ctx.fill();
          ctx.restore();
        }

        // ── Winner calculation ────────────────────────────────────
        function getWinningSegment(finalAngle) {
          var norm =
            (((-finalAngle + SLICE_ANGLE / 2) % (2 * Math.PI)) + 2 * Math.PI) %
            (2 * Math.PI);
          var idx = Math.floor(norm / SLICE_ANGLE) % TOTAL_SLICES;
          return WHEEL_SLICES[idx];
        }

        function openSpin() {
          if (window.daPushRoomState) window.daPushRoomState("spin");
          document.body.classList.add("spin-room-active");
          /* PHASE 2 FIX: sync fullscreen Spin & Win room height with visualViewport */
          applyViewportHeight(document.getElementById("panel-spin"));
          if (window.mountSpinWheel) {
            window.mountSpinWheel();
          }
          drawWheel(wheelAngle);
          checkSpinCooldown();
          buildSwmRays("swmRays");
          buildSwmRays("jpwRays");
          var spinCoinsEl = document.getElementById("spinCoinsDisplay");
          if (spinCoinsEl) spinCoinsEl.textContent = formatCoins(coins);
          // Start the realtime listener for the Spin & Win room
          if (window.startGlobalSpinListener) window.startGlobalSpinListener();
          // Re-render the global jackpot section from the latest cached snapshot
          // (or an empty 0/100 state if the live listener hasn't delivered one yet —
          // it'll re-render again the instant the first snapshot arrives).
          window._renderGlobalSpinUI(
            window._lastGlobalSpinData || {
              count: 0,
              history: [],
              lastJackpotWinner: null,
            },
          );
        }

        function spinExit() {
          if (window.stopGlobalSpinListener) window.stopGlobalSpinListener();
          if (window.daClearRoomState) window.daClearRoomState();
          /* PHASE 2 FIX: clear inline viewport height and offset transform */
          clearViewportHeight(document.getElementById("panel-spin"));
          document.body.classList.remove("spin-room-active");
          switchTabNav("games", document.getElementById("bn-games"));
        }

        function buildSwmRays(elId) {
          var el = document.getElementById(elId || "swmRays");
          if (!el) return;
          el.innerHTML = "";
          for (var i = 0; i < 12; i++) {
            var r = document.createElement("div");
            r.className = "swm-ray";
            r.style.transform = "rotate(" + i * 30 + "deg)";
            el.appendChild(r);
          }
        }

        function checkSpinCooldown() {
          var isSuper = getSuperWheelActive();
          if (window.spinWheelController && typeof window.spinWheelController.setSuperWheel === "function") {
            window.spinWheelController.setSuperWheel(isSuper);
          }
          var bonusSpins = getBonusFreeSpins();
          var mini = document.getElementById("spinCooldownMini");
          var btn = document.getElementById("spinBtn");
          var rim = document.getElementById("wheelRimOuter");
          var container = document.getElementById("wheelContainer");
          var superBanner = document.getElementById("sgSuperBanner");

          // Sync Super Wheel active banner and styling
          if (superBanner) {
            superBanner.style.display = isSuper ? "flex" : "none";
          }
          if (rim) {
            if (isSuper) rim.classList.add("super-wheel-active");
            else rim.classList.remove("super-wheel-active");
          }
          if (container) {
            if (isSuper) container.classList.add("super-wheel-active");
            else container.classList.remove("super-wheel-active");
          }

          if (bonusSpins > 0) {
            if (mini) mini.style.display = "none";
            if (btn) {
              btn.disabled = false;
              if (isSuper) {
                btn.classList.add("super-wheel-btn");
                btn.innerHTML =
                  "🔥 SUPER BONUS SPIN (" + bonusSpins + " left)";
              } else {
                btn.classList.remove("super-wheel-btn");
                btn.innerHTML =
                  "⚡ FREE BONUS SPIN (" + bonusSpins + " left)";
              }
            }
            return;
          }

          if (hasReachedSpinLimit()) {
            if (mini) mini.style.display = "block";
            startCountdownTimer("spinCooldownTimer", function () {
              checkSpinCooldown();
            });
            if (btn) {
              if (isSuper) btn.classList.add("super-wheel-btn");
              else btn.classList.remove("super-wheel-btn");

              if (coins < SPIN_EXTRA_COST) {
                btn.disabled = true;
                btn.innerHTML =
                  "\uD83E\uDE99 Need " + SPIN_EXTRA_COST + " coins to spin";
              } else {
                btn.disabled = false;
                btn.innerHTML =
                  (isSuper
                    ? "🔥 SUPER SPIN (×5 REWARDS) · "
                    : "\uD83E\uDE99&nbsp; SPIN FOR ") +
                  SPIN_EXTRA_COST +
                  " COINS";
              }
            }
          } else {
            if (mini) mini.style.display = "none";
            var remaining = SPIN_DAILY_LIMIT - getSpinCountToday();
            if (btn) {
              btn.disabled = false;
              if (isSuper) {
                btn.classList.add("super-wheel-btn");
                btn.innerHTML =
                  "🔥 SUPER SPIN! (×5 REWARDS · " + remaining + " left today)";
              } else {
                btn.classList.remove("super-wheel-btn");
                btn.innerHTML =
                  "\u26A1&nbsp; SPIN THE WHEEL! (" + remaining + " left today)";
              }
            }
          }
        }

        function renderSpinLegend() {
          var grid = document.getElementById("spinLegend");
          if (!grid) return;
          grid.innerHTML = "";

          // Rarity order requested: Card Pack (1%), Super Wheel (3%), 500 Coins (5%),
          // Free 3 Spins (8%), 250 Coins (11%), 100 Coins (15%), 70 Coins (17%),
          // 50 Coins (19%), 30 Coins (21%)
          var order = [
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "card_pack";
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "super_wheel";
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 500;
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "free_spins";
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 250;
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 100;
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 70;
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 50;
            }),
            WHEEL_SEGMENTS.find(function (s) {
              return s.type === "coins" && s.coins === 30;
            }),
          ].filter(Boolean);

          var tw = WHEEL_SEGMENTS.reduce(function (a, s) {
            return a + s.weight;
          }, 0);
          order.forEach(function (seg) {
            var pct = ((seg.weight / tw) * 100).toFixed(0);
            var d = document.createElement("div");
            d.className = "sl-item";
            d.style.borderColor = seg.rarityColor + "55";
            var labelText = "";
            if (seg.type === "coins") labelText = seg.coins + " Coins";
            else if (seg.type === "super_wheel") labelText = "Super Wheel (×5)";
            else if (seg.type === "free_spins") labelText = "+3 Free Spins";
            else if (seg.type === "card_pack") labelText = "Full Card Pack";

            d.innerHTML =
              '<div class="sl-coins">' +
              seg.icon +
              " " +
              labelText +
              "</div>" +
              '<div class="sl-chance">' +
              pct +
              "% chance</div>";
            grid.appendChild(d);
          });
        }

        // ── GLOBAL JACKPOT — progress bar, last winner banner, history list ──
        function toggleSpinHistory() {
          var list = document.getElementById("sgHistoryList");
          var chev = document.getElementById("sgHistoryChevron");
          if (!list) return;
          var showing = list.style.display !== "none";
          list.style.display = showing ? "none" : "flex";
          if (chev) chev.textContent = showing ? "\u25BE" : "\u25B4";
        }

        window._renderGlobalSpinUI = function (data) {
          data = data || {};
          window._lastGlobalSpinData = data;
          var count = typeof data.count === "number" ? data.count : 0;
          var history = [];
          if (Array.isArray(data.history)) {
            history = data.history.filter(Boolean);
          } else if (data.history && typeof data.history === "object") {
            history = Object.values(data.history).filter(Boolean);
          }
          var lastWinner = data.lastJackpotWinner || null;

          var countText = document.getElementById("sgCountText");
          if (countText) countText.textContent = count + " / 100";
          var fill = document.getElementById("sgProgressFill");
          if (fill) fill.style.width = Math.min(100, count) + "%";

          var winnerEl = document.getElementById("sgFloatingWinner");
          if (winnerEl) {
            if (lastWinner) {
              var when = "";
              if (lastWinner.ts) {
                var d = new Date(lastWinner.ts);
                var dateStr = d.toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                });
                var timeStr = d.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                var diffMs = Date.now() - lastWinner.ts;
                var relStr = "";
                if (diffMs >= 0) {
                  var diffMin = Math.floor(diffMs / 60000);
                  if (diffMin < 1) relStr = "Just now";
                  else if (diffMin < 60) relStr = diffMin + "m ago";
                  else {
                    var diffHr = Math.floor(diffMin / 60);
                    if (diffHr < 24) relStr = diffHr + "h ago";
                    else {
                      var diffDays = Math.floor(diffHr / 24);
                      if (diffDays === 1) relStr = "Yesterday";
                      else if (diffDays < 7) relStr = diffDays + "d ago";
                    }
                  }
                }
                when = dateStr + ", " + timeStr + (relStr ? " \u2022 " + relStr : "");
              } else {
                when = "Recently";
              }

              var crownSvg =
                '<svg class="sg-crown-svg" viewBox="0 0 32 26" width="28" height="23" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '<defs>' +
                '<linearGradient id="sgCrownGold" x1="16" y1="2" x2="16" y2="24" gradientUnits="userSpaceOnUse">' +
                '<stop offset="0%" stop-color="#FFF2A3"/>' +
                '<stop offset="35%" stop-color="#FFD700"/>' +
                '<stop offset="70%" stop-color="#F59E0B"/>' +
                '<stop offset="100%" stop-color="#B45309"/>' +
                '</linearGradient>' +
                '<linearGradient id="sgCrownBase" x1="4" y1="21" x2="28" y2="21" gradientUnits="userSpaceOnUse">' +
                '<stop offset="0%" stop-color="#B45309"/>' +
                '<stop offset="25%" stop-color="#FDE047"/>' +
                '<stop offset="50%" stop-color="#FFFBEB"/>' +
                '<stop offset="75%" stop-color="#FDE047"/>' +
                '<stop offset="100%" stop-color="#B45309"/>' +
                '</linearGradient>' +
                '<radialGradient id="sgRuby" cx="50%" cy="50%" r="50%">' +
                '<stop offset="0%" stop-color="#FF6B81"/>' +
                '<stop offset="60%" stop-color="#E11D48"/>' +
                '<stop offset="100%" stop-color="#881337"/>' +
                '</radialGradient>' +
                '<radialGradient id="sgGemBlue" cx="50%" cy="50%" r="50%">' +
                '<stop offset="0%" stop-color="#67E8F9"/>' +
                '<stop offset="60%" stop-color="#0284C7"/>' +
                '<stop offset="100%" stop-color="#0369A1"/>' +
                '</radialGradient>' +
                '<radialGradient id="sgGemEmerald" cx="50%" cy="50%" r="50%">' +
                '<stop offset="0%" stop-color="#86EFAC"/>' +
                '<stop offset="60%" stop-color="#16A34A"/>' +
                '<stop offset="100%" stop-color="#14532D"/>' +
                '</radialGradient>' +
                '<filter id="sgCrownGlow" x="-20%" y="-20%" width="140%" height="140%">' +
                '<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#F59E0B" flood-opacity="0.8"/>' +
                '</filter>' +
                '</defs>' +
                '<path d="M4 21L6 9L11.5 14.5L16 4L20.5 14.5L26 9L28 21H4Z" fill="url(#sgCrownGold)" stroke="#FFE875" stroke-width="1.2" stroke-linejoin="round" filter="url(#sgCrownGlow)"/>' +
                '<rect x="3.5" y="20.5" width="25" height="4" rx="2" fill="url(#sgCrownBase)" stroke="#F59E0B" stroke-width="0.8"/>' +
                '<circle cx="6" cy="8.5" r="2.2" fill="#FEF08A" stroke="#CA8A04" stroke-width="0.6"/>' +
                '<circle cx="16" cy="3.5" r="2.6" fill="#FFFBEB" stroke="#EAB308" stroke-width="0.7"/>' +
                '<circle cx="26" cy="8.5" r="2.2" fill="#FEF08A" stroke="#CA8A04" stroke-width="0.6"/>' +
                '<circle cx="10" cy="18" r="1.4" fill="url(#sgGemBlue)"/>' +
                '<circle cx="16" cy="16" r="2" fill="url(#sgRuby)"/>' +
                '<circle cx="22" cy="18" r="1.4" fill="url(#sgGemEmerald)"/>' +
                '</svg>';

              var playerName = lastWinner.playerName || "A DA Member";
              var avHtml = avatarHTML(
                lastWinner.avatar,
                lastWinner.photoURL,
                lastWinner.playerId,
                playerName
              );

              winnerEl.innerHTML =
                '<div class="sg-winner-card">' +
                '<div class="sg-winner-kicker">' +
                '<span class="sg-kicker-sparkle">\u2728</span>' +
                '<span class="sg-kicker-text">LAST LOTTERY CHAMPION</span>' +
                '<span class="sg-kicker-sparkle">\u2728</span>' +
                '</div>' +
                '<div class="sg-winner-body">' +
                '<div class="sg-winner-avatar-wrap">' +
                '<div class="sg-winner-crown">' +
                crownSvg +
                '</div>' +
                '<div class="sg-winner-av-ring">' +
                '<div class="sg-winner-av">' +
                avHtml +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="sg-winner-info">' +
                '<div class="sg-winner-name-wrap">' +
                '<span class="sg-winner-name">' +
                escHtml(playerName) +
                '</span>' +
                '</div>' +
                '<div class="sg-winner-time-wrap">' +
                '<span class="sg-winner-time-icon">\uD83D\uDD52</span>' +
                '<span class="sg-winner-time">' +
                escHtml(when) +
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
              winnerEl.style.display = "block";
            } else {
              winnerEl.style.display = "none";
            }
          }

          var list = document.getElementById("sgHistoryList");
          if (list) {
            if (!history.length) {
              list.innerHTML =
                '<div class="lb-empty"><span class="lb-e-icon">\uD83C\uDFB0</span>No spins yet this round \u2014 be the first!</div>';
            } else {
              var rows = history
                .slice()
                .reverse()
                .map(function (h) {
                  var when = h.ts
                    ? new Date(h.ts).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                  var rowClass =
                    "lb-row" + (h.isJackpot ? " sg-jackpot-row" : "");
                  var coinLabel = h.isJackpot
                    ? "\uD83E\uDE99+" + h.coins + " + \uD83C\uDFC61000"
                    : "\uD83E\uDE99+" + h.coins;
                  return (
                    '<div class="' +
                    rowClass +
                    '">' +
                    '<div class="lb-rank rN">#' +
                    h.n +
                    "</div>" +
                    '<div class="lb-avatar">' +
                    avatarHTML(h.avatar, h.photoURL, h.playerId, h.playerName) +
                    "</div>" +
                    '<div class="lb-info"><div class="lb-name">' +
                    escHtml(h.playerName || "A DA Member") +
                    "</div>" +
                    (h.isJackpot
                      ? '<div class="lb-sub">\uD83C\uDF89 JACKPOT SPIN</div>'
                      : "") +
                    "</div>" +
                    '<div class="lb-score-col"><div class="lb-score-val">' +
                    coinLabel +
                    "</div></div>" +
                    '<div class="lb-time-col"><div class="lb-time-val">' +
                    when +
                    "</div></div>" +
                    "</div>"
                  );
                })
                .join("");
              list.innerHTML = rows;
            }
          }
        };

        function escHtml(s) {
          return String(s).replace(/[&<>"']/g, function (c) {
            return {
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            }[c];
          });
        }

        // ── SPIN — fast start, gradual slowdown ──────────────────
        function doSpin() {
          if (wheelSpinning) return;
          if (window.spinWheelController && typeof window.spinWheelController.isSpinning === "function" && window.spinWheelController.isSpinning()) {
            return;
          }
          var bonusSpins = getBonusFreeSpins();
          var isBonusSpin = bonusSpins > 0;
          var isPaidSpin = false;

          if (isBonusSpin) {
            setBonusFreeSpins(bonusSpins - 1);
            showToast(
              "🎁 Using 1 Free Bonus Spin! (" +
                (bonusSpins - 1) +
                " bonus left)",
            );
          } else {
            isPaidSpin = hasReachedSpinLimit();
            if (isPaidSpin && coins < SPIN_EXTRA_COST) {
              showToast(
                "\uD83E\uDE99 Not enough coins for an extra spin! You need " +
                  SPIN_EXTRA_COST +
                  " \uD83E\uDE99.",
              );
              return;
            }

            if (isPaidSpin) {
              coins -= SPIN_EXTRA_COST;
              logCoinTx(-SPIN_EXTRA_COST, "🎡 Extra Spin & Win spin");
              updateHUD();
              saveProgress(true);
            }
          }

          wheelSpinning = true;
          var btn = document.getElementById("spinBtn");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Spinning...";
          }
          var rim = document.getElementById("wheelRimOuter");
          if (rim) rim.classList.add("spinning");
          var halo = document.getElementById("wheelHalo");

          // Check if Super Wheel is active for this spin
          var wasSuperWheel = getSuperWheelActive();

          // Weighted pick with locking: Free Spins and Card Pack are locked during Super Wheel!
          var availableSegments = WHEEL_SEGMENTS.filter(function (s) {
            if (
              wasSuperWheel &&
              (s.type === "free_spins" || s.type === "card_pack")
            ) {
              return false;
            }
            return true;
          });

          var tw = availableSegments.reduce(function (a, s) {
            return a + s.weight;
          }, 0);
          var rand = Math.random() * tw,
            winner = availableSegments[availableSegments.length - 1];
          for (var k = 0; k < availableSegments.length; k++) {
            rand -= availableSegments[k].weight;
            if (rand <= 0) {
              winner = availableSegments[k];
              break;
            }
          }

          // Target angle — winner centered directly under pointer at 12 o'clock
          var targetIdx = WHEEL_SLICES.indexOf(winner);

          // ── CALL REACT SPIN WHEEL ISLAND ────────────────────────
          if (window.spinWheelController && typeof window.spinWheelController.spin === "function") {
            var spinStarted = false;
            try {
              spinStarted = window.spinWheelController.spin({
                targetIndex: targetIdx,
                winner: winner,
                isSuperSpin: wasSuperWheel,
                onComplete: function (completedWinner) {
                  wheelSpinning = false;
                  if (rim) rim.classList.remove("spinning");
                  if (window.spinWheelController && typeof window.spinWheelController.getAngle === "function") {
                    wheelAngle = (window.spinWheelController.getAngle() * Math.PI) / 180;
                  }
                  onSpinComplete(completedWinner || winner, isPaidSpin, isBonusSpin, wasSuperWheel);
                }
              });
            } catch (spinErr) {
              console.error("[doSpin] spinWheelController error:", spinErr);
              spinStarted = false;
            }
            if (spinStarted === false) {
              wheelSpinning = false;
              if (btn) btn.disabled = false;
              if (rim) rim.classList.remove("spinning");
              // Refund if paid or bonus spin failed to launch
              if (isPaidSpin) {
                coins += SPIN_EXTRA_COST;
                logCoinTx(SPIN_EXTRA_COST, "🎡 Extra spin refunded");
                updateHUD();
                saveProgress(true);
              } else if (isBonusSpin) {
                setBonusFreeSpins(bonusSpins);
              }
              checkSpinCooldown();
            }
            return;
          }
          var baseAngle = -(targetIdx * SLICE_ANGLE);
          var extraSpins = 5 * 2 * Math.PI; // 5 snappy full rotations
          var startAngle = wheelAngle;

          var deltaToTarget =
            (((baseAngle - startAngle) % (2 * Math.PI)) + 2 * Math.PI) %
            (2 * Math.PI);
          var finalAngle =
            startAngle + (deltaToTarget - 2 * Math.PI) - extraSpins;

          // Overshoot angle for elastic recoil bounce (~6.4 degrees)
          var overshootAngle = -(SLICE_ANGLE * 0.16);

          // Snappy 2.7s duration matching Township Frozen Fortune reference video
          var duration = 2700;
          var startTime = null;
          var pointerEl = document.getElementById("wheelPointer3D");
          var lastAudioClickTime = 0;
          var PEG_COUNT = 18;
          var PEG_SPACING = (2 * Math.PI) / PEG_COUNT;

          // Sound effects
          SFX.shuffle && SFX.shuffle();
          setTimeout(function () {
            SFX.shuffle && SFX.shuffle();
          }, 240);

          function animate(now) {
            if (!startTime) startTime = now;
            var elapsed = now - startTime;
            var p = Math.min(elapsed / duration, 1);

            // ── TOWNSHIP CASUAL PHYSICS TRAJECTORY ──
            if (p < 0.88) {
              // High velocity spin gliding into smooth deceleration
              var u = p / 0.88;
              var progress = 1 - Math.pow(1 - u, 3.8);
              wheelAngle = startAngle + (finalAngle + overshootAngle - startAngle) * progress;
            } else {
              // Elastic Recoil Spring phase back into finalAngle
              var tau = (p - 0.88) / 0.12;
              var decay = Math.exp(-5.5 * tau) * Math.cos(2.2 * Math.PI * tau);
              wheelAngle = finalAngle + overshootAngle * decay;
            }

            // ── REALISTIC MECHANICAL FLAPPER DEFLECTION ──
            var relPeg = ((-wheelAngle - PEG_SPACING * 0.5) % PEG_SPACING + PEG_SPACING) % PEG_SPACING;
            var pegDist = relPeg / PEG_SPACING; // 0 to 1
            var deflection = 0;
            if (pegDist < 0.35) {
              // Deflect as peg pushes needle
              deflection = (1 - (pegDist / 0.35)) * 16; // up to 16 degrees
            } else if (pegDist < 0.50) {
              // Quick spring rebound
              deflection = -((0.50 - pegDist) / 0.15) * 3.5;
            } else {
              deflection = 0;
            }
            if (p > 0.88) {
              deflection *= (1 - (p - 0.88) / 0.12);
            }

            if (pointerEl) {
              pointerEl.style.transform = "translateX(-50%) rotate(" + deflection.toFixed(1) + "deg)";
            }

            // Synchronized audio click on peg strike
            if (now - lastAudioClickTime > 35 && pegDist < 0.15 && p < 0.985) {
              SFX.click && SFX.click();
              lastAudioClickTime = now;
            }

            // Halo pulse speed sync
            if (halo) {
              var pulseSpeed = Math.max(0.2, 2.5 * (1 - p));
              halo.style.animationDuration = pulseSpeed + "s";
            }

            drawWheel(wheelAngle);

            if (p < 1) {
              requestAnimationFrame(animate);
            } else {
              wheelAngle = finalAngle;
              if (pointerEl) {
                pointerEl.style.transform = "translateX(-50%) rotate(0deg)";
              }
              drawWheel(wheelAngle);
              wheelSpinning = false;
              wheelAngle = wheelAngle % (2 * Math.PI);
              if (rim) rim.classList.remove("spinning");
              if (halo) halo.style.animationDuration = "2.5s";
              var actual = getWinningSegment(wheelAngle);
              onSpinComplete(actual, isPaidSpin, isBonusSpin, wasSuperWheel);
            }
          }

          requestAnimationFrame(animate);
        }

        function onSpinComplete(winner, isPaidSpin, isBonusSpin, wasSuperWheel) {
          if (!isPaidSpin && !isBonusSpin) incrementSpinCount();

          // If this spin was under Super Wheel, revert Super Wheel back to normal now
          if (wasSuperWheel) {
            setSuperWheelActive(false);
          }

          // Case 1: Winner is Super Wheel!
          if (winner.type === "super_wheel") {
            setSuperWheelActive(true);
            SFX.win && SFX.win();
            var ov = document.getElementById("spinWinOverlay");
            if (ov) {
              document.getElementById("swmIcon").textContent = "⭐";
              var coinsEl = document.getElementById("swmCoins");
              coinsEl.textContent = "SUPER WHEEL!";
              coinsEl.style.color = "#ff007f";
              coinsEl.style.textShadow =
                "0 0 40px rgba(255,0,127,.95), 2px 3px 0 rgba(0,0,0,.5)";
              var coinLabel = ov.querySelector(".swm-coin-label");
              if (coinLabel)
                coinLabel.textContent =
                  "Next round rewards multiplied by 5×! (Card Pack & Free Spins locked)";
              var badge = document.getElementById("swmBadge");
              badge.textContent = "🔥 5× SUPER WHEEL ACTIVATED";
              badge.style.color = "#ff007f";
              badge.style.borderColor = "#ff007f";
              badge.style.background = "rgba(255,0,127,.18)";
              ov.classList.add("show");
              spawnConfetti("#ff007f");
            }
            checkSpinCooldown();
            drawWheel(wheelAngle);
            saveProgress(true);
            return;
          }

          // Case 2: Winner is Free 3 Spins!
          if (winner.type === "free_spins") {
            var curBonus = getBonusFreeSpins();
            setBonusFreeSpins(curBonus + 3);
            SFX.win && SFX.win();
            var ov = document.getElementById("spinWinOverlay");
            if (ov) {
              document.getElementById("swmIcon").textContent = "🎁";
              var coinsEl = document.getElementById("swmCoins");
              coinsEl.textContent = "+3 SPINS";
              coinsEl.style.color = "#06b6d4";
              coinsEl.style.textShadow =
                "0 0 40px rgba(6,182,212,.95), 2px 3px 0 rgba(0,0,0,.5)";
              var coinLabel = ov.querySelector(".swm-coin-label");
              if (coinLabel)
                coinLabel.textContent =
                  "3 free spins added! Spin anytime without daily limits!";
              var badge = document.getElementById("swmBadge");
              badge.textContent = "🎁 BONUS SPINS GRANTED";
              badge.style.color = "#06b6d4";
              badge.style.borderColor = "#06b6d4";
              badge.style.background = "rgba(6,182,212,.18)";
              ov.classList.add("show");
              spawnConfetti("#06b6d4");
            }
            checkSpinCooldown();
            drawWheel(wheelAngle);
            saveProgress(true);
            return;
          }

          // Case 3: Winner is Card Pack!
          if (winner.type === "card_pack") {
            triggerCardPackOpening();
            checkSpinCooldown();
            drawWheel(wheelAngle);
            saveProgress(true);
            return;
          }

          // Case 4: Coin rewards (boosted by 5 if wasSuperWheel)
          const baseMultiplier = wasSuperWheel ? 5 : 1;
          const mult =
            (parseFloat(window._coinMultiplier) || 1) * baseMultiplier;
          const earned = Math.round(winner.coins * mult);
          coins += earned;
          logCoinTx(
            earned,
            wasSuperWheel
              ? "🔥 5× Super Wheel reward"
              : "🎡 Spin & Win reward",
          );
          updateHUD();
          saveProgress(true);

          // ── Global synced jackpot counter — every spin advances the shared count.
          if (window.recordGlobalSpin) {
            const gEntry = {
              playerId:
                window._currentPlayerId ||
                (typeof profile !== "undefined" && profile.playerId) ||
                "",
              playerName:
                (typeof profile !== "undefined" && profile.name) ||
                "A DA Member",
              avatar:
                (typeof profile !== "undefined" && profile.avatar) || "🧙",
              photoURL:
                typeof _lightPhoto === "function"
                  ? _lightPhoto(
                      (typeof profile !== "undefined" && profile.photoURL) ||
                        "",
                    )
                  : (typeof profile !== "undefined" && profile.photoURL) ||
                    "",
              coins: earned,
              isPaid: !!isPaidSpin,
              ts: Date.now(),
            };
            window.recordGlobalSpin(gEntry).then(function (result) {
              if (result && result.isJackpot) {
                coins += 1000;
                logCoinTx(1000, "🏆 Global Spin Jackpot bonus");
                updateHUD();
                saveProgress(true);
                var badge = document.getElementById("swmBadge");
                if (badge) badge.textContent = "🏆 GLOBAL JACKPOT! +1000 BONUS";
                setTimeout(function () {
                  var spinNoEl = document.getElementById("jpwSpinNo");
                  if (spinNoEl)
                    spinNoEl.textContent =
                      "SPIN #" +
                      (result.spinNumber != null ? result.spinNumber : 100);
                  var jpOv = document.getElementById("jackpotWinOverlay");
                  if (jpOv) jpOv.classList.add("show");
                  SFX.win && SFX.win();
                  spawnConfetti("#ffd700");
                }, 2000);
              }
            });
          }

          // Sound
          if (earned >= 500) {
            SFX.win && SFX.win();
          } else if (earned >= 250) {
            SFX.win && SFX.win();
          } else if (earned >= 100) {
            SFX.cardFound && SFX.cardFound();
          } else {
            SFX.coin && SFX.coin();
          }

          // Win overlay
          var ov = document.getElementById("spinWinOverlay");
          if (ov) {
            document.getElementById("swmIcon").textContent = winner.icon;
            var coinsEl = document.getElementById("swmCoins");
            coinsEl.textContent = "+" + earned;
            coinsEl.style.color = winner.rarityColor;
            coinsEl.style.textShadow =
              "0 0 40px " + winner.glow + ", 2px 3px 0 rgba(0,0,0,.5)";
            var coinLabel = ov.querySelector(".swm-coin-label");
            if (coinLabel) {
              if (isPaidSpin) {
                const netGain = earned - SPIN_EXTRA_COST;
                const sign = netGain >= 0 ? "+" : "";
                coinLabel.textContent = `coins added to wallet (${sign}${netGain} net after ${SPIN_EXTRA_COST} spin fee)`;
              } else {
                coinLabel.textContent = wasSuperWheel
                  ? "5× Super Wheel Bonus coins added!"
                  : "coins added to your wallet";
              }
            }
            var badge = document.getElementById("swmBadge");
            badge.textContent =
              winner.rarity.toUpperCase() +
              (wasSuperWheel
                ? " · 5× SUPER BOOST"
                : mult > 1
                ? " · " + mult + "× BOOST"
                : "");
            badge.style.color = winner.rarityColor;
            badge.style.borderColor = winner.rarityColor;
            badge.style.background = winner.rarityColor + "18";
            ov.classList.add("show");
            spawnConfetti(winner.rarityColor);
          }

          checkSpinCooldown();
          drawWheel(wheelAngle);
        }

        window._pendingCardPack = null;
        window._cardPackOpeningInProgress = false;

        function triggerCardPackOpening() {
          if (!Array.isArray(SETS) || SETS.length === 0) {
            showToast("🎁 You won a Card Pack, but sets are not loaded!");
            return;
          }
          // Pick a random set from SETS
          var randSetIdx = Math.floor(Math.random() * SETS.length);
          var chosenSet = SETS[randSetIdx];
          window._pendingCardPack = {
            setIdx: randSetIdx,
            set: chosenSet,
          };
          window._cardPackOpeningInProgress = false;

          var packStage = document.getElementById("cpPackStage");
          var cardsStage = document.getElementById("cpCardsStage");
          var foilPack = document.getElementById("cpFoilPack");
          var overlay = document.getElementById("cardPackOverlay");

          if (packStage) packStage.style.display = "flex";
          if (cardsStage) cardsStage.style.display = "none";
          if (foilPack) foilPack.classList.remove("cp-pack-rip");

          buildSwmRays("cpwRays");

          if (overlay) {
            overlay.classList.add("show");
            SFX.win && SFX.win();
            spawnConfetti("#a855f7");
          }
        }

        window.openCardPackAction = function () {
          if (window._cardPackOpeningInProgress) return;
          if (!window._pendingCardPack) return;

          window._cardPackOpeningInProgress = true;
          var foilPack = document.getElementById("cpFoilPack");
          if (foilPack) foilPack.classList.add("cp-pack-rip");

          SFX.cardFound && SFX.cardFound();
          spawnConfetti("#e879f9");

          setTimeout(function () {
            var data = window._pendingCardPack;
            if (!data) return;

            var packStage = document.getElementById("cpPackStage");
            var cardsStage = document.getElementById("cpCardsStage");
            var setNameEl = document.getElementById("cpSetName");
            var grid = document.getElementById("cpCardsGrid");

            if (packStage) packStage.style.display = "none";
            if (cardsStage) cardsStage.style.display = "flex";
            if (setNameEl) setNameEl.textContent = data.set.name;

            if (grid) {
              grid.innerHTML = "";
              data.set.cards.forEach(function (card, cardIdx) {
                var awardType = "new";
                if (typeof window.awardCardOrDuplicate === "function") {
                  awardType = window.awardCardOrDuplicate(
                    data.setIdx,
                    cardIdx,
                  );
                }
                var starsStr = "★".repeat(card.stars || 1);
                var isDupe = awardType === "duplicate";

                var cardItem = document.createElement("div");
                cardItem.className =
                  "cp-card-item" + (isDupe ? " is-dupe" : " is-new");
                cardItem.innerHTML =
                  '<div class="cp-card-badge ' +
                  (isDupe ? "is-dupe" : "is-new") +
                  '">' +
                  (isDupe ? "+1 DUP" : "NEW!") +
                  "</div>" +
                  '<div class="cp-card-art ' +
                  (card.bg || "") +
                  '">' +
                  (card.img
                    ? '<img src="' +
                      card.img +
                      '" alt="' +
                      escHtml(card.name) +
                      '" class="cp-card-img" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';" /><span class="cp-card-emoji" style="display:none">' +
                      (card.emoji || "🃏") +
                      "</span>"
                    : '<span class="cp-card-emoji">' +
                      (card.emoji || "🃏") +
                      "</span>") +
                  "</div>" +
                  '<div class="cp-card-stars">' +
                  starsStr +
                  "</div>" +
                  '<div class="cp-card-name">' +
                  escHtml(card.name) +
                  "</div>";
                grid.appendChild(cardItem);
              });
            }

            saveProgress();
            updateHUD();
            if (
              typeof renderCollGrid === "function" &&
              typeof collSetIdx !== "undefined" &&
              collSetIdx === data.setIdx
            ) {
              renderCollGrid();
            }
            if (typeof updateCollStats === "function") {
              updateCollStats();
            }

            SFX.win && SFX.win();
            spawnConfetti("#ffd700");
          }, 650);
        };

        window.closeCardPackModal = function () {
          var overlay = document.getElementById("cardPackOverlay");
          if (overlay) overlay.classList.remove("show");
          window._pendingCardPack = null;
          window._cardPackOpeningInProgress = false;
          checkSpinCooldown();
        };

        function spawnConfetti(col) {
          var colors = [
            col,
            "#ffd700",
            "#ffffff",
            "#ff6b9d",
            "#00d4ff",
            "#c084fc",
            "#fb923c",
          ];
          for (var i = 0; i < 24; i++) {
            (function (i) {
              setTimeout(function () {
                var c = document.createElement("div");
                var cc = colors[Math.floor(Math.random() * colors.length)];
                var sz = 5 + Math.random() * 9;
                var isCircle = Math.random() > 0.4;
                c.style.cssText =
                  "position:fixed;top:30%;left:" +
                  (10 + Math.random() * 80) +
                  "%;" +
                  "width:" +
                  sz +
                  "px;height:" +
                  sz * (isCircle ? 1 : 0.3 + Math.random()) +
                  "px;" +
                  "background:" +
                  cc +
                  ";border-radius:" +
                  (isCircle ? "50%" : "2px") +
                  ";" +
                  "z-index:2100;pointer-events:none;opacity:1;will-change:transform,opacity;" +
                  "animation:confettiFall " +
                  (0.7 + Math.random() * 1.3) +
                  "s ease-out forwards;" +
                  "transform:translate3d(0,0,0) rotate(" +
                  Math.random() * 360 +
                  "deg)";
                document.body.appendChild(c);
                setTimeout(function () {
                  c.remove();
                }, 2500);
              }, i * 28);
            })(i);
          }
        }

        // ═══════════════════════════════════════════════════════════
        // PATTERN RECALL — solo memory mini-game (own universal card,
        // own 10-level ladder, non-cumulative rewards). Uses the site's
        // existing `coins` variable + logCoinTx/updateHUD/saveProgress
        // pipeline — no separate currency, no collectible-card data.
        // ═══════════════════════════════════════════════════════════

        // Exactly 10 levels — do not add a Level 0 or a Level 11.
        // Level 1 starts at 4 tiles to recall; each level adds 1 more.
        // Memory-reveal timer runs 3.0s (Level 1) down to 1.75s (Level 10).
        const PR_LEVELS = [
          {
            cols: 3,
            rows: 3,
            total: 9,
            reveal: 4,
            memMs: 3000,
            reward: 30,
          } /* Production reward: 30 coins */,
          {
            cols: 4,
            rows: 3,
            total: 12,
            reveal: 5,
            memMs: 2850,
            reward: 50,
          } /* Production reward: 50 coins */,
          {
            cols: 4,
            rows: 4,
            total: 16,
            reveal: 6,
            memMs: 2725,
            reward: 75,
          } /* Production reward: 75 coins */,
          {
            cols: 5,
            rows: 4,
            total: 20,
            reveal: 7,
            memMs: 2575,
            reward: 100,
          } /* Production reward: 100 coins */,
          {
            cols: 5,
            rows: 5,
            total: 25,
            reveal: 8,
            memMs: 2450,
            reward: 150,
          } /* Production reward: 150 coins */,
          {
            cols: 5,
            rows: 5,
            total: 25,
            reveal: 9,
            memMs: 2300,
            reward: 200,
          } /* Production reward: 200 coins */,
          {
            cols: 5,
            rows: 6,
            total: 30,
            reveal: 10,
            memMs: 2175,
            reward: 250,
          } /* Production reward: 250 coins */,
          {
            cols: 5,
            rows: 6,
            total: 30,
            reveal: 11,
            memMs: 2025,
            reward: 300,
          } /* Production reward: 300 coins */,
          {
            cols: 5,
            rows: 6,
            total: 30,
            reveal: 12,
            memMs: 1900,
            reward: 400,
          } /* Production reward: 400 coins */,
          {
            cols: 5,
            rows: 6,
            total: 30,
            reveal: 13,
            memMs: 1750,
            reward: 500,
          } /* Production reward: 500 coins */,
        ];

        // Every level gives the same 10s window to submit an answer once
        // recall starts, regardless of level difficulty.
        const PR_ANSWER_TIME_MS = 10000;

        let prState = {
          level: 0,
          targetPositions: [],
          selected: [],
          phase: "idle", // idle | memory | recall | checking | complete | gameover
          pendingReward: 0,
          sessionActive: false,
          rewardCollected: false,
          lastClearedReward: 0, // reward of the highest level cleared so far this run (for the fail consolation payout)
        };
        let prTimerHandle = null;
        let prCollecting = false; // guards double-click / duplicate reward claims

        function prClearTimer() {
          if (prTimerHandle) {
            clearInterval(prTimerHandle);
            prTimerHandle = null;
          }
        }

        // Called every time the Pattern Recall panel becomes active (via switchTab).
        // Always resets to the start screen — a half-finished run is never resumed,
        // which also means a stale run can never be used to claim a reward twice.
        function prOpen() {
          if (window.daPushRoomState) window.daPushRoomState("pr");
          document.body.classList.add("pr-room-active");
          /* PHASE 2 FIX: sync fullscreen Pattern Recall room height with visualViewport */
          applyViewportHeight(document.getElementById("panel-pr"));
          prClearTimer();
          const resultOv = document.getElementById("prResultOverlay");
          if (resultOv) resultOv.classList.remove("show");
          const gridEl = document.getElementById("prGrid");
          if (gridEl) gridEl.classList.remove("pr-shake");
          document.getElementById("prGameScreen").style.display = "none";
          document.getElementById("prStartScreen").style.display = "flex";
          prState = {
            level: 0,
            targetPositions: [],
            selected: [],
            phase: "idle",
            pendingReward: 0,
            sessionActive: false,
            rewardCollected: false,
            lastClearedReward: 0,
          };
          prCollecting = false;
          checkPrCooldown();
        }

        // Top-right ✕ Exit (or navigating away mid-run): always ends the run with
        // 0 coins, because a reward is only ever granted inside prCollectAndExit().
        function prExit() {
          if (window.daClearRoomState) window.daClearRoomState();
          /* PHASE 2 FIX: clear inline viewport height and offset transform */
          clearViewportHeight(document.getElementById("panel-pr"));
          document.body.classList.remove("pr-room-active");
          prClearTimer();
          const resultOv = document.getElementById("prResultOverlay");
          if (resultOv) resultOv.classList.remove("show");
          prState.sessionActive = false;
          switchTabNav("games", document.getElementById("bn-games"));
        }

        function prStartGame() {
          if (hasPlayedToday(CD_KEY_PR)) {
            showToast("⏳ You already played today! Come back tomorrow.");
            checkPrCooldown();
            return;
          }
          markPlayedToday(CD_KEY_PR);
          checkPrCooldown();
          SFX.click && SFX.click();
          prState = {
            level: 0,
            targetPositions: [],
            selected: [],
            phase: "idle",
            pendingReward: 0,
            sessionActive: true,
            rewardCollected: false,
            lastClearedReward: 0,
          };
          prCollecting = false;
          document.getElementById("prStartScreen").style.display = "none";
          document.getElementById("prGameScreen").style.display = "block";
          prStartLevel(1);
        }

        function prBuildGrid(cfg) {
          const grid = document.getElementById("prGrid");
          grid.classList.remove("pr-shake");
          grid.style.gridTemplateColumns = "repeat(" + cfg.cols + ", 1fr)";
          const parts = [];
          for (let i = 0; i < cfg.total; i++) {
            parts.push(
              '<div class="pr-tile locked" data-idx="' +
                i +
                '" onclick="prTileClick(' +
                i +
                ')">' +
                '<div class="pr-tile-face pr-tile-back">&#10068;</div>' +
                '<div class="pr-tile-face pr-tile-front">&#11088;</div>' +
                "</div>",
            );
          }
          grid.innerHTML = parts.join("");
        }

        function prStartLevel(n) {
          prState.level = n;
          prState.selected = [];
          prState.phase = "memory";
          const cfg = PR_LEVELS[n - 1];

          document.getElementById("prStatusLevel").textContent = "LEVEL " + n;
          document.getElementById("prStatusReward").textContent =
            "🪙 " + cfg.reward;
          document.getElementById("prInstruction").textContent =
            "Memorize the pattern…";
          const submitBtn = document.getElementById("prSubmitBtn");
          submitBtn.style.display = "none";
          submitBtn.disabled = true;

          prBuildGrid(cfg);

          // Fresh random pattern every level, every run — never a fixed layout.
          const indices = Array.from({ length: cfg.total }, (_, i) => i);
          shuffle(indices);
          prState.targetPositions = indices
            .slice(0, cfg.reveal)
            .sort((a, b) => a - b);

          // Stagger the reveal flips slightly so the animation reads clearly.
          prState.targetPositions.forEach((idx, i) => {
            setTimeout(() => {
              const tileEl = document.querySelector(
                '#prGrid .pr-tile[data-idx="' + idx + '"]',
              );
              if (tileEl) {
                tileEl.classList.add("flipped");
                SFX.flip && SFX.flip();
              }
            }, i * 55);
          });

          prRunMemoryTimer(cfg.memMs);
        }

        function prRunMemoryTimer(durationMs) {
          const timerWrap = document.getElementById("prTimerWrap");
          const barEl = document.getElementById("prTimerBar");
          const numEl = document.getElementById("prTimerNum");
          timerWrap.style.display = "flex";
          if (barEl) barEl.style.width = "100%";
          const start = Date.now();
          prClearTimer();
          prTimerHandle = setInterval(() => {
            const elapsed = Date.now() - start;
            const remaining = Math.max(0, durationMs - elapsed);
            const pct = (remaining / durationMs) * 100;
            if (barEl) barEl.style.width = pct.toFixed(1) + "%";
            if (numEl) numEl.textContent = (remaining / 1000).toFixed(1) + "s";
            if (remaining <= 0) {
              prClearTimer();
              timerWrap.style.display = "none";
              prEndMemoryPhase();
            }
          }, 50);
        }

        function prEndMemoryPhase() {
          if (prState.phase !== "memory") return; // guard: ignore if run already ended (e.g. exited mid-timer)
          document.querySelectorAll("#prGrid .pr-tile").forEach((t) => {
            t.classList.remove("flipped");
            t.classList.remove("locked");
            t.classList.add("selectable");
          });
          prState.phase = "recall";
          const cfg = PR_LEVELS[prState.level - 1];
          document.getElementById("prInstruction").textContent =
            "REMEMBER THE PATTERN — Select " + cfg.reveal + " tiles (10s!)";
          const submitBtn = document.getElementById("prSubmitBtn");
          submitBtn.style.display = "block";
          submitBtn.disabled = true;
          prRunAnswerTimer(PR_ANSWER_TIME_MS);
        }

        // 10-second countdown for the recall/answer phase — reuses the same
        // linear progress UI as the memory-phase timer. Auto-fails the level (via
        // prWrongAnswer) if the player hasn't submitted in time.
        function prRunAnswerTimer(durationMs) {
          const timerWrap = document.getElementById("prTimerWrap");
          const barEl = document.getElementById("prTimerBar");
          const numEl = document.getElementById("prTimerNum");
          timerWrap.style.display = "flex";
          if (barEl) barEl.style.width = "100%";
          const start = Date.now();
          prClearTimer();
          prTimerHandle = setInterval(() => {
            if (prState.phase !== "recall") {
              prClearTimer(); // guard: answer already submitted or run already ended
              return;
            }
            const elapsed = Date.now() - start;
            const remaining = Math.max(0, durationMs - elapsed);
            const pct = (remaining / durationMs) * 100;
            if (barEl) barEl.style.width = pct.toFixed(1) + "%";
            if (numEl) numEl.textContent = (remaining / 1000).toFixed(1) + "s";
            if (remaining <= 0) {
              prClearTimer();
              timerWrap.style.display = "none";
              prAnswerTimeUp();
            }
          }, 50);
        }

        function prAnswerTimeUp() {
          if (prState.phase !== "recall") return; // guard: already submitted/ended
          prState.phase = "checking";
          document
            .querySelectorAll("#prGrid .pr-tile")
            .forEach((t) => t.classList.add("locked"));
          const submitBtn = document.getElementById("prSubmitBtn");
          if (submitBtn) submitBtn.disabled = true;

          const targetSet = new Set(prState.targetPositions);
          const selectedSet = new Set(prState.selected);
          prWrongAnswer(targetSet, selectedSet, "⏰ TIME'S UP!");
        }

        function prTileClick(idx) {
          if (prState.phase !== "recall") return;
          const cfg = PR_LEVELS[prState.level - 1];
          const tileEl = document.querySelector(
            '#prGrid .pr-tile[data-idx="' + idx + '"]',
          );
          if (!tileEl) return;
          const pos = prState.selected.indexOf(idx);
          if (pos > -1) {
            prState.selected.splice(pos, 1);
            tileEl.classList.remove("selected");
          } else {
            if (prState.selected.length >= cfg.reveal) return; // already at the required count
            prState.selected.push(idx);
            tileEl.classList.add("selected");
            SFX.click && SFX.click();
          }
          document.getElementById("prSubmitBtn").disabled =
            prState.selected.length !== cfg.reveal;
        }

        function prSubmitAnswer() {
          if (prState.phase !== "recall") return;
          const cfg = PR_LEVELS[prState.level - 1];
          if (prState.selected.length !== cfg.reveal) return;
          prState.phase = "checking";
          prClearTimer(); // stop the answer countdown now that they've submitted
          const timerWrap = document.getElementById("prTimerWrap");
          if (timerWrap) timerWrap.style.display = "none";
          document
            .querySelectorAll("#prGrid .pr-tile")
            .forEach((t) => t.classList.add("locked"));
          document.getElementById("prSubmitBtn").disabled = true;

          const targetSet = new Set(prState.targetPositions);
          const selectedSet = new Set(prState.selected);
          const correct =
            prState.selected.length === prState.targetPositions.length &&
            prState.selected.every((i) => targetSet.has(i));

          if (correct) {
            prLevelComplete();
          } else {
            prWrongAnswer(targetSet, selectedSet);
          }
        }

        function prWrongAnswer(targetSet, selectedSet, message) {
          document.getElementById("prInstruction").textContent =
            message || "WRONG PATTERN!";
          const gridEl = document.getElementById("prGrid");
          gridEl.classList.add("pr-shake");
          SFX.bomb && SFX.bomb();
          document.querySelectorAll("#prGrid .pr-tile").forEach((t) => {
            const idx = parseInt(t.dataset.idx, 10);
            if (targetSet.has(idx)) {
              t.classList.add("flipped", "reveal-correct");
            } else if (selectedSet.has(idx)) {
              t.classList.add("reveal-missed");
            }
          });
          setTimeout(prGameOver, 1500);
        }

        function prLevelComplete() {
          const cfg = PR_LEVELS[prState.level - 1];
          prState.phase = "complete";
          prState.pendingReward = cfg.reward;
          // Remember this cleared level's reward — if the player fails a later
          // level in this same run, the consolation payout is half of this.
          prState.lastClearedReward = cfg.reward;
          const isFinal = prState.level === PR_LEVELS.length;
          SFX.win && SFX.win();
          spawnConfetti && spawnConfetti("#f0c030");

          document.getElementById("prResultIcon").textContent = isFinal
            ? "🧠"
            : "✅";
          document.getElementById("prResultTitle").textContent = isFinal
            ? "🧠 PATTERN MASTER! LEVEL " + PR_LEVELS.length + " COMPLETE"
            : "LEVEL " + prState.level + " COMPLETE!";
          document.getElementById("prResultSub").textContent = isFinal
            ? "FINAL REWARD"
            : "You found every tile!";
          document.getElementById("prResultReward").textContent =
            "🪙 " + cfg.reward + " COINS";

          const btns = document.getElementById("prResultBtns");
          btns.innerHTML = "";
          if (!isFinal) {
            const nextBtn = document.createElement("button");
            nextBtn.className = "btn btn-purple";
            nextBtn.style.cssText = "width:100%;font-size:1rem;padding:13px";
            nextBtn.textContent = "NEXT LEVEL →";
            nextBtn.onclick = prNextLevel;
            btns.appendChild(nextBtn);
          }
          const collectBtn = document.createElement("button");
          collectBtn.className = "btn btn-gold";
          collectBtn.style.cssText = "width:100%;font-size:1rem;padding:13px";
          collectBtn.textContent = "🪙 COLLECT " + cfg.reward + " COINS & EXIT";
          collectBtn.onclick = prCollectAndExit;
          btns.appendChild(collectBtn);

          document.getElementById("prResultOverlay").classList.add("show");
        }

        function prNextLevel() {
          document.getElementById("prResultOverlay").classList.remove("show");
          prStartLevel(prState.level + 1);
        }

        // Awards the CURRENT level's reward only (never cumulative), exactly once.
        // Guarded against double-click, repeated calls, and reopening this same
        // completion screen — once collected, buttons are wiped and the flag is
        // set before the coin write, so a second invocation is a no-op.
        function prCollectAndExit() {
          if (
            prCollecting ||
            prState.rewardCollected ||
            prState.phase !== "complete"
          )
            return;
          prCollecting = true;
          prState.rewardCollected = true;
          prState.phase = "collected";
          const amount = Math.max(
            0,
            Math.min(500, Math.round(Number(prState.pendingReward) || 0)),
          );
          coins += amount;
          logCoinTx(
            amount,
            "🧠 Pattern Recall — Level " + prState.level + " reward",
          );
          updateHUD();
          saveProgress();
          SFX.coin && SFX.coin();
          showToast("🪙 +" + amount + " coins collected!");
          document.getElementById("prResultBtns").innerHTML = ""; // wipe so this screen can't be reused to re-claim
          document.getElementById("prResultOverlay").classList.remove("show");
          prEndSession();
        }

        // Fail consolation: half the reward of the last level actually cleared
        // in this run (0 if the player fell on Level 1, since nothing was
        // cleared yet). E.g. failing on Level 5 pays half of Level 4's reward.
        // Credited immediately and guarded so it can never be paid twice.
        function prGameOver() {
          prState.phase = "gameover";
          SFX.gameOver && SFX.gameOver();

          const consolation = Math.max(
            0,
            Math.min(500, Math.round((prState.lastClearedReward || 0) / 2)),
          );
          if (consolation > 0 && !prCollecting && !prState.rewardCollected) {
            prCollecting = true;
            prState.rewardCollected = true;
            coins += consolation;
            logCoinTx(
              consolation,
              "🧠 Pattern Recall — Level " + prState.level + " fail (half of prior level)",
            );
            updateHUD();
            saveProgress();
            SFX.coin && SFX.coin();
            showToast("🪙 +" + consolation + " coins collected!");
          }

          document.getElementById("prResultIcon").textContent = "💀";
          document.getElementById("prResultTitle").textContent = "GAME OVER";
          document.getElementById("prResultSub").textContent =
            "You lost at Level " + prState.level + ".";
          document.getElementById("prResultReward").textContent =
            "🪙 " + consolation + " COINS";

          const btns = document.getElementById("prResultBtns");
          btns.innerHTML = "";
          const tryBtn = document.createElement("button");
          tryBtn.className = "btn btn-purple";
          tryBtn.style.cssText = "width:100%;font-size:1rem;padding:13px";
          tryBtn.textContent = "TRY AGAIN";
          tryBtn.onclick = prTryAgain;
          btns.appendChild(tryBtn);
          const exitBtn = document.createElement("button");
          exitBtn.className = "btn";
          exitBtn.style.cssText =
            "width:100%;font-size:1rem;padding:13px;background:rgba(255,255,255,.08);border:1px solid var(--line);color:#fff;";
          exitBtn.textContent = "EXIT";
          exitBtn.onclick = function () {
            document.getElementById("prResultOverlay").classList.remove("show");
            prExit();
          };
          btns.appendChild(exitBtn);

          document.getElementById("prResultOverlay").classList.add("show");
        }

        function prTryAgain() {
          document.getElementById("prResultOverlay").classList.remove("show");
          prStartGame();
        }

        // No reward is pending here in either path (a loss never had one; a
        // collect already granted its coins above), so this only tears the room
        // down and returns to the hub.
        function prEndSession() {
          prState.sessionActive = false;
          prClearTimer();
          setTimeout(() => {
            document.body.classList.remove("pr-room-active");
            switchTabNav("games", document.getElementById("bn-games"));
          }, 350);
        }

        // ═══════════════════════════════════════════════════════════
        // EVENT CONTROLS — admin-driven enable/disable for all events
        // ═══════════════════════════════════════════════════════════
        const EC_DEFAULTS = {
          hoc: { enabled: true, start: "", end: "" },
          spin: { enabled: true, start: "", end: "" },
          // jj / jp: admin enable/schedule removed — these events no longer support admin pausing
          cds: { enabled: true, start: "", end: "" },
          coll: { enabled: true, start: "", end: "" },
          shop: { enabled: true, start: "", end: "" },
          collDailyLimit: 15,
          multiplier: 1,
          announcement: "",
          maintenanceMode: false,
        };
        const EC_STORAGE_KEY = "da_ec_controls";
        let ecControls = JSON.parse(JSON.stringify(EC_DEFAULTS));
        try {
          const cachedEC = localStorage.getItem(EC_STORAGE_KEY);
          if (cachedEC) {
            const parsedEC = JSON.parse(cachedEC);
            if (parsedEC && typeof parsedEC === "object") {
              Object.assign(ecControls, parsedEC);
            }
          }
        } catch (e) {}

        // Expose helpers for Firebase module
        window._ecControls = () => ecControls;
        window._setEcControls = (obj) => {
          Object.assign(ecControls, obj);
          try {
            localStorage.setItem(EC_STORAGE_KEY, JSON.stringify(ecControls));
          } catch (e) {}
        };

        // Is an event currently active? (enabled + within optional schedule)
        function ecIsActive(key) {
          const ctrl = ecControls[key];
          if (!ctrl || !ctrl.enabled) return false;
          const now = Date.now();
          if (ctrl.start && new Date(ctrl.start).getTime() > now) return false;
          if (ctrl.end && new Date(ctrl.end).getTime() < now) return false;
          return true;
        }

        // Announcement banner is only allowed to show on the Events (landing), Mini
        // Games, CDS, and Collection tabs — never inside an event/minigame room or
        // the Admin panel.
        const ANNOUNCE_ALLOWED_PANELS = ["match", "games", "cds", "coll"];
        function announcementAllowedNow() {
          const activePanel = document.querySelector(".panel.active");
          const panelId = activePanel
            ? activePanel.id.replace(/^panel-/, "")
            : "";
          if (!ANNOUNCE_ALLOWED_PANELS.includes(panelId)) return false;
          // Fullscreen event/minigame rooms (Spin, Card Battle, JJ/JP) render on top
          // of panel-match/panel-games, so exclude those explicitly too.
          const body = document.body;
          if (body.classList.contains("spin-room-active")) return false;
          if (body.classList.contains("cb-room-active")) return false;
          if (body.classList.contains("jj-room-active")) return false;
          if (body.classList.contains("pr-room-active")) return false;
          return true;
        }

        // Apply all event controls to the player-facing UI (called after load & on live updates)
        window.applyEventControls = function () {
          // ── Announcement banner ──
          const ann = ecControls.announcement || "";
          const annBar = document.getElementById("globalAnnounceBanner");
          if (annBar) {
            if (ann.trim() && announcementAllowedNow()) {
              document.getElementById("globalAnnounceText").textContent = ann;
              annBar.classList.add("show");
            } else {
              annBar.classList.remove("show");
            }
          }

          // NOTE: "Grant Coins → All Players" no longer broadcasts via ecControls/localStorage.
          // It writes coins + a one-time pendingGrant directly onto each existing player's
          // Firestore document instead (see adminGrantCoinsAll in the module script + gcExecuteGrant).
          // That mechanism is device-independent (survives logout/browser switch) and never
          // touches players who register after the grant was sent — fixing the old bug where
          // localStorage-based claims reset on a new browser or after logging out and back in.

          // ── House of Cards ──
          const hocActive = ecIsActive("hoc");
          const hocLocked = document.getElementById("hocLockedBanner");
          const hintBtnEc = document.getElementById("hintBtn");
          if (hocLocked) hocLocked.classList.toggle("show", !hocActive);
          if (!hocActive) {
            if (hintBtnEc) {
              hintBtnEc.disabled = true;
              hintBtnEc.style.opacity = ".45";
            }
            if (gameActive) {
              gameActive = false;
            }
          } else if (!hasPlayedToday(CD_KEY_HOC)) {
            if (hintBtnEc) {
              hintBtnEc.disabled = false;
              hintBtnEc.style.opacity = "";
            }
          }

          // ── Spin & Win ──
          const spinActive = ecIsActive("spin");
          if (!spinActive) {
            const spinBtn = document.getElementById("spinBtn");
            if (spinBtn) {
              spinBtn.disabled = true;
              spinBtn.innerHTML = "🔒 Event Paused";
            }
            const spinCDMini = document.getElementById("spinCooldownMini");
            if (spinCDMini) spinCDMini.style.display = "none";
          } else {
            checkSpinCooldown();
          }

          // ── Events panel ──
          // NOTE: JJ / JP admin pausing removed completely — these events now use the
          // CB-style room/host model (see cbEntry below) and are never locked or
          // force-ended by the admin.

          const cbEntryEl = document.getElementById("cbEntry");
          const cbCtrl = (window._ecControls ? window._ecControls() : {}).cb;
          if (cbEntryEl && cbCtrl)
            cbEntryEl.classList.toggle("event-locked", !ecIsActive("cb"));

          // ── CDS — Card Distribution Hub ──
          const cdsActive = ecIsActive("cds");
          const cdsLocked = document.getElementById("cdsLockedBanner");
          const cdsStatsRow = document.getElementById("cdsStatsRow");
          const cdsSetTabsEl = document.getElementById("cdsSetTabs");
          const cdsGridEl = document.getElementById("cdsGrid");
          if (cdsLocked) cdsLocked.classList.toggle("show", !cdsActive);
          if (cdsStatsRow) cdsStatsRow.style.display = cdsActive ? "" : "none";
          if (cdsSetTabsEl)
            cdsSetTabsEl.style.display = cdsActive ? "" : "none";
          if (cdsGridEl) cdsGridEl.style.display = cdsActive ? "" : "none";
          const bnCds = document.getElementById("bn-cds");
          if (bnCds) bnCds.style.opacity = cdsActive ? "" : ".4";

          // ── My Collection — request button (paid + free re-requests) ──
          const collActive = ecIsActive("coll");
          const collLocked = document.getElementById("collLockedBanner");
          if (collLocked) collLocked.classList.toggle("show", !collActive);
          if (typeof updateCollStats === "function") updateCollStats();
          // Live-close the request modal if it's open when the admin pauses it mid-tap
          if (!collActive) {
            const cardActionOverlay =
              document.getElementById("overlayCardAction");
            if (
              cardActionOverlay &&
              cardActionOverlay.classList.contains("show")
            ) {
              showToast(
                "🔒 Collection requests were paused by your DA leader.",
              );
              closeOverlay("overlayCardAction");
            }
          }

          // ── Shop — coin-purchase items inside My Collection ──
          const shopActive = ecIsActive("shop");
          const shopLocked = document.getElementById("shopLockedBanner");
          const shopGridEl = document.getElementById("collShopGrid");
          if (shopLocked) shopLocked.classList.toggle("show", !shopActive);
          if (shopGridEl) shopGridEl.style.display = shopActive ? "" : "none";

          // ── Bottom nav opacity hints ──
          ["spin", "match"].forEach((id) => {
            const bn = document.getElementById("bn-" + id);
            if (!bn) return;
            let active = true;
            if (id === "spin") active = ecIsActive("spin");
            bn.style.opacity = active ? "" : ".4";
          });

          // ── Mini Games hub entry cards ──
          const hocGameEntryEl = document.getElementById("hocGameEntry");
          const spinGameEntryEl = document.getElementById("spinGameEntry");
          if (hocGameEntryEl)
            hocGameEntryEl.classList.toggle("event-locked", !ecIsActive("hoc"));
          if (spinGameEntryEl)
            spinGameEntryEl.classList.toggle(
              "event-locked",
              !ecIsActive("spin"),
            );
          const bnGames = document.getElementById("bn-games");
          if (bnGames)
            bnGames.style.opacity =
              ecIsActive("hoc") || ecIsActive("spin") ? "" : ".4";

          // ── Coin multiplier ──
          window._coinMultiplier = parseFloat(ecControls.multiplier) || 1;

          // ── Force refresh token ──
          const rk = _cdKey("ec_refresh_");
          try {
            const prev = localStorage.getItem(rk);
            const curr = String(ecControls._refreshToken || "");
            if (curr && prev !== curr) {
              localStorage.setItem(rk, curr);
              if (prev) {
                showToast("🔄 Game data refreshed by your DA leader!");
              }
            }
          } catch (e) {}
        };

        // ── Admin UI: toggle a single event ──────────────────────
        function ecToggleEvent(key) {
          const cb = document.getElementById("ecToggle-" + key);
          if (!cb) return;
          if (!ecControls[key])
            ecControls[key] = { enabled: true, start: "", end: "" };
          ecControls[key].enabled = cb.checked;
          ecRefreshCardUI(key);
        }

        function ecRefreshCardUI(key) {
          const ctrl = ecControls[key];
          const card = document.getElementById("ecCard-" + key);
          const label = document.getElementById("ecLabel-" + key);
          const dot = document.getElementById("ecDot-" + key);
          const cb = document.getElementById("ecToggle-" + key);
          if (!card) return;
          const on = ctrl ? ctrl.enabled : true;
          card.classList.toggle("enabled", on);
          card.classList.toggle("disabled", !on);
          if (label) {
            label.textContent = on ? "ON" : "OFF";
            label.className = "ec-toggle-label " + (on ? "on" : "off");
          }
          if (dot) dot.className = "ec-status-dot " + (on ? "on" : "off");
          if (cb) cb.checked = on;
        }

        function ecSaveOne(key) {
          if (!ecControls[key])
            ecControls[key] = { enabled: true, start: "", end: "" };
          const startEl = document.getElementById("ecStart-" + key);
          const endEl = document.getElementById("ecEnd-" + key);
          if (startEl) ecControls[key].start = startEl.value || "";
          if (endEl) ecControls[key].end = endEl.value || "";
          if (key === "coll") {
            const limitEl = document.getElementById("ecCollLimitInput");
            if (limitEl) {
              const v = parseInt(limitEl.value, 10);
              ecControls.collDailyLimit = Number.isFinite(v) && v > 0 ? v : 10;
            }
          }
          window.saveEventControls();
          window.applyEventControls();
          showToast("✅ " + key.toUpperCase() + " settings saved!");
        }

        // ── Admin UI: reset every player's Shop pricing tier back to base price ──
        function ecResetShopPricingAll() {
          if (
            !confirm(
              "Reset Shop prices back to base for ALL players? This clears everyone's purchase tier for every item — already-booked slots are not affected. This cannot be undone.",
            )
          )
            return;
          showToast("⏳ Resetting shop prices for all players…");
          _waitForMod("__mod_adminResetShopPricingAll", async () => {
            const count = await window.adminResetShopPricingAll();
            if (count < 0) {
              showToast("❌ Failed — check connection.");
              return;
            }
            showToast(
              count > 0
                ? `✅ Shop prices reset for ${count} player(s)!`
                : "✅ Nothing to reset — everyone is already at base price.",
            );
            if (typeof renderShopGrid === "function") renderShopGrid();
          });
        }

        let _ecMultiplier = 1;
        function ecSetMultiplier(val, btnEl) {
          _ecMultiplier = val;
          document
            .querySelectorAll(".ec-mult-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          document.getElementById("ecMultDisplay").textContent = val + "×";
        }

        function ecSaveMultiplier() {
          ecControls.multiplier = _ecMultiplier;
          window._coinMultiplier = _ecMultiplier;
          window.saveEventControls();
          showToast(
            "🪙 Multiplier set to " +
              _ecMultiplier +
              "×! All coin rewards now boosted.",
          );
        }

        function ecSaveAnnouncement() {
          const txt = (
            document.getElementById("ecAnnounceInput").value || ""
          ).trim();
          ecControls.announcement = txt;
          window.saveEventControls();
          window.applyEventControls();
          const st = document.getElementById("ecAnnounceStatus");
          if (st) {
            st.textContent = txt ? "✅ Announcement published!" : "✅ Cleared!";
            st.style.display = "block";
          }
          setTimeout(() => {
            const s = document.getElementById("ecAnnounceStatus");
            if (s) s.style.display = "none";
          }, 2500);
        }

        function ecClearAnnouncement() {
          const inp = document.getElementById("ecAnnounceInput");
          if (inp) inp.value = "";
          ecControls.announcement = "";
          window.saveEventControls();
          window.applyEventControls();
          showToast("✅ Announcement cleared!");
        }

        // Populate admin event controls UI from current ecControls data
        function ecPopulateAdminUI() {
          ["hoc", "spin", "cds", "coll", "shop"].forEach((key) => {
            if (!ecControls[key])
              ecControls[key] = { enabled: true, start: "", end: "" };
            ecRefreshCardUI(key);
            const startEl = document.getElementById("ecStart-" + key);
            const endEl = document.getElementById("ecEnd-" + key);
            if (startEl) startEl.value = ecControls[key].start || "";
            if (endEl) endEl.value = ecControls[key].end || "";
          });
          _ecMultiplier = parseFloat(ecControls.multiplier) || 1;
          const dispEl = document.getElementById("ecMultDisplay");
          if (dispEl) dispEl.textContent = _ecMultiplier + "×";
          document.querySelectorAll(".ec-mult-btn").forEach((btn) => {
            const v = parseFloat(btn.textContent);
            btn.classList.toggle("active", v === _ecMultiplier);
          });
          const annInput = document.getElementById("ecAnnounceInput");
          if (annInput) annInput.value = ecControls.announcement || "";
          const collLimitEl = document.getElementById("ecCollLimitInput");
          if (collLimitEl)
            collLimitEl.value = parseInt(ecControls.collDailyLimit, 10) || 15;
        }

        // ═══════════════════════════════════════════════════════════
        // GRANTS PORTAL (COINS & AURA) — admin tool
        // ═══════════════════════════════════════════════════════════
        let _gcCurrentChannel = "hub"; // 'hub' | 'coins' | 'aura'
        let _gcMode = "all"; // 'all' | 'one'
        let _gcAmount = 5000;
        let _gcAllGrants = []; // shared persistent grant history across all admins (last 50)
        let _gcHistoryLoading = false;
        let _gcHubHistoryTab = "all"; // 'all' | 'coins' | 'aura'
        let _gcLiveHistoryActive = false;
        let _gcPlayersList = []; // cached list of all players for the dropdown
        let _gcAuraAmount = 10;
        let _gcAuraDirection = "grant"; // 'grant' | 'deduct'
        let _gcAuraPlayersList = []; // cached list of all players for the dropdown

        function gcInitView() {
          // Whenever Grants tab is clicked, always start at the Hub Gateway
          gcOpenChannel("hub");
          gcLoadHistory();
          gcStartLiveHistoryListener();
          gcRenderAllHistories();
          gcUpdateHubSessionCount();
        }

        // Open specific grant channel or return to Hub
        function gcOpenChannel(channel) {
          _gcCurrentChannel = channel;
          const hubEl = document.getElementById("gcHubView");
          const coinsEl = document.getElementById("gcCoinsPanel");
          const auraEl = document.getElementById("gcAuraPanel");

          if (hubEl) hubEl.style.display = channel === "hub" ? "" : "none";
          if (coinsEl) coinsEl.style.display = channel === "coins" ? "" : "none";
          if (auraEl) auraEl.style.display = channel === "aura" ? "" : "none";

          if (channel === "hub") {
            gcRenderHubHistory();
            gcUpdateHubSessionCount();
          } else if (channel === "coins") {
            // Restore mode & load players if needed
            gcSetMode(_gcMode, document.getElementById(_gcMode === "all" ? "gcModeAll" : "gcModeOne"));
            gcRenderHistory();
            if (!_gcPlayersList || _gcPlayersList.length === 0) {
              gcLoadPlayerList();
            } else {
              gcRenderPlayerPickList();
            }
          } else if (channel === "aura") {
            gcAuraSetDirection(_gcAuraDirection, document.getElementById(_gcAuraDirection === "grant" ? "gcAuraDirGrant" : "gcAuraDirDeduct"));
            gcAuraRefreshResetInfo();
            gcAuraRenderHistory();
            if (!_gcAuraPlayersList || _gcAuraPlayersList.length === 0) {
              gcAuraLoadPlayerList();
            } else {
              gcAuraRenderPlayerPickList();
            }
          }
        }

        async function gcLoadHistory(forceRefresh) {
          if (_gcHistoryLoading) return;
          _gcHistoryLoading = true;
          _waitForMod("__mod_loadGrantHistory", async () => {
            try {
              if (typeof window.loadGrantHistory === "function") {
                const grants = await window.loadGrantHistory();
                if (Array.isArray(grants) && grants.length > 0) {
                  _gcAllGrants = grants.slice(0, 50);
                } else if (
                  (!grants || grants.length === 0) &&
                  _gcPlayersList &&
                  _gcPlayersList.length > 0 &&
                  typeof window.seedInitialGrantHistoryFromPlayers === "function"
                ) {
                  const seeded = await window.seedInitialGrantHistoryFromPlayers(
                    _gcPlayersList,
                  );
                  if (Array.isArray(seeded) && seeded.length > 0) {
                    _gcAllGrants = seeded.slice(0, 50);
                  }
                }
              }
            } catch (e) {
              console.warn("Could not load grant history:", e);
            } finally {
              _gcHistoryLoading = false;
              gcRenderAllHistories();
              gcUpdateHubSessionCount();
            }
          });
        }

        function gcStartLiveHistoryListener() {
          if (_gcLiveHistoryActive) return;
          _waitForMod("__mod_loadGrantHistory", () => {
            if (typeof window.startLiveGrantHistoryAdminListener === "function") {
              window.startLiveGrantHistoryAdminListener((grants) => {
                if (Array.isArray(grants)) {
                  _gcAllGrants = grants.slice(0, 50);
                  gcRenderAllHistories();
                  gcUpdateHubSessionCount();
                }
              });
              _gcLiveHistoryActive = true;
            }
          });
        }

        window.onGrantHistoryUpdated = function (grants) {
          if (Array.isArray(grants)) {
            _gcAllGrants = grants.slice(0, 50);
            gcRenderAllHistories();
            gcUpdateHubSessionCount();
          }
        };

        window._updateLocalGrantHistory = function (grants) {
          if (Array.isArray(grants)) {
            _gcAllGrants = grants.slice(0, 50);
            gcRenderAllHistories();
            gcUpdateHubSessionCount();
          }
        };

        window._prependLocalGrantEntry = function (entry) {
          if (!entry) return;
          const filtered = _gcAllGrants.filter((g) => g && g.id !== entry.id);
          _gcAllGrants = [entry, ...filtered].slice(0, 50);
          gcRenderAllHistories();
          gcUpdateHubSessionCount();
        };

        function gcRenderAllHistories() {
          gcRenderHubHistory();
          gcRenderHistory();
          gcAuraRenderHistory();
        }

        function gcSetHistoryTab(tab) {
          _gcHubHistoryTab = tab;
          document.querySelectorAll(".gc-history-tab").forEach((btn) => {
            btn.classList.remove("active");
          });
          const activeBtn = document.getElementById(
            tab === "coins"
              ? "gcHistTabCoins"
              : tab === "aura"
              ? "gcHistTabAura"
              : "gcHistTabAll",
          );
          if (activeBtn) activeBtn.classList.add("active");
          gcRenderHubHistory();
        }

        function gcReloadHistory(showToastMsg) {
          if (showToastMsg && typeof showToast === "function") {
            showToast("🔄 Refreshing grant history…");
          }
          const hubEl = document.getElementById("gcHubHistory");
          const coinsEl = document.getElementById("gcHistory");
          const auraEl = document.getElementById("gcAuraHistory");
          if (hubEl)
            hubEl.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.74rem;padding:12px">⚡ Refreshing…</div>';
          if (coinsEl)
            coinsEl.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.72rem;padding:8px">⚡ Refreshing…</div>';
          if (auraEl)
            auraEl.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.72rem;padding:8px">⚡ Refreshing…</div>';
          gcLoadHistory(true);
        }

        function formatGrantTime(dt) {
          if (!dt || isNaN(dt.getTime())) return "";
          const now = new Date();
          const isToday =
            dt.getDate() === now.getDate() &&
            dt.getMonth() === now.getMonth() &&
            dt.getFullYear() === now.getFullYear();
          const timeStr = dt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
          if (isToday) {
            return `Today, ${timeStr}`;
          }
          const dateStr = dt.toLocaleDateString([], {
            month: "short",
            day: "numeric",
          });
          return `${dateStr}, ${timeStr}`;
        }

        function gcUpdateHubSessionCount() {
          const el = document.getElementById("gcHubSessionCount");
          if (!el) return;
          const total = _gcAllGrants ? Math.min(50, _gcAllGrants.length) : 0;
          el.textContent = `${total} grant${total === 1 ? "" : "s"} logged (last 50)`;
        }

        function gcRenderHubHistory() {
          const el = document.getElementById("gcHubHistory");
          if (!el) return;

          let list = _gcAllGrants;
          if (_gcHubHistoryTab === "coins") {
            list = list.filter((g) => g.type === "coins");
          } else if (_gcHubHistoryTab === "aura") {
            list = list.filter((g) => g.type === "aura");
          }
          list = list.slice(0, 50);

          const allCount = _gcAllGrants.slice(0, 50).length;
          const coinsCount = _gcAllGrants
            .filter((g) => g.type === "coins")
            .slice(0, 50).length;
          const auraCount = _gcAllGrants
            .filter((g) => g.type === "aura")
            .slice(0, 50).length;

          const countAllEl = document.getElementById("gcHistCountAll");
          const countCoinsEl = document.getElementById("gcHistCountCoins");
          const countAuraEl = document.getElementById("gcHistCountAura");
          if (countAllEl) countAllEl.textContent = allCount;
          if (countCoinsEl) countCoinsEl.textContent = coinsCount;
          if (countAuraEl) countAuraEl.textContent = auraCount;

          if (list.length === 0) {
            el.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.74rem;padding:12px">No grants recorded yet</div>';
            return;
          }

          el.innerHTML = list
            .map((e) => {
              const isAura = e.type === "aura";
              const isCard = e.type === "card";
              const isDeduct =
                e.direction === "deduct" ||
                String(e.result || "").toLowerCase().includes("deduct") ||
                (typeof e.amount === "number" && e.amount < 0) ||
                (typeof e.delta === "number" && e.delta < 0);
              const dt = e.timestamp
                ? new Date(e.timestamp)
                : e.ts
                ? new Date(e.ts)
                : null;
              const timeStr = dt ? formatGrantTime(dt) : e.ts || "";
              const adminInfo = e.adminName
                ? ` · by ${escapeHtml(e.adminName.toLowerCase() === "leader" ? "Admin" : e.adminName)}`
                : "";
              const icon = isCard ? "🃏" : isAura ? "✨" : "🪙";
              const coinColor = isCard
                ? "#60a5fa"
                : isAura
                ? isDeduct
                  ? "#f59e0b"
                  : "#e5c8ff"
                : isDeduct
                ? "#f87171"
                : "#4ade80";
              const sign = isDeduct ? "−" : "+";
              const unit = isCard ? "Card" : isAura ? "✨" : "🪙";

              return `<div class="gc-history-row" style="flex-direction:column;align-items:flex-start;gap:3px;padding:6px 6px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;gap:6px;">
          <div style="display:flex;align-items:center;gap:5px;min-width:0;">
            <span style="font-size:.8rem;line-height:1;">${icon}</span>
            <span style="font-weight:700;color:rgba(255,255,255,.9);font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${escapeHtml(e.mode || e.targetName || "Player")}
            </span>
          </div>
          <span class="gc-history-coin${isDeduct ? " deduct" : ""}" style="color:${coinColor};font-size:.76rem;white-space:nowrap;">
            ${sign}${Math.abs(e.amount || 0).toLocaleString()} ${unit} · ${escapeHtml(e.result || (isDeduct ? "Deducted" : "Sent"))}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;font-size:.67rem;color:rgba(255,255,255,.4);">
          <span>🕒 ${timeStr}${adminInfo}</span>
        </div>
        ${e.note ? `<div style="font-size:.67rem;color:rgba(255,255,255,.45);font-style:italic;word-break:break-word;">📝 "${escapeHtml(e.note)}"</div>` : ""}
      </div>`;
            })
            .join("");
        }

        // Add or append quick reason tags to note input
        function gcAddReasonTag(tag, targetId) {
          const noteEl = document.getElementById(targetId);
          if (!noteEl) return;
          const current = (noteEl.value || "").trim();
          if (!current) {
            noteEl.value = tag;
          } else if (!current.includes(tag)) {
            noteEl.value = current + " · " + tag;
          }
          noteEl.focus();
        }

        // Show when Aura was last manually reset, in the admin panel
        function gcAuraRefreshResetInfo() {
          const el = document.getElementById("gcAuraResetLastInfo");
          if (!el) return;
          _waitForMod("__mod_getAuraResetInfo", async () => {
            const info = await window.getAuraResetInfo();
            if (!info || !info.lastResetAt) {
              el.textContent = "Last reset: never yet";
              return;
            }
            const dt = new Date(info.lastResetAt);
            el.textContent = `Last reset: ${dt.toLocaleString()}`;
          });
        }

        // Admin — manually reset Aura and cards sent to 0 for every player
        function gcAuraForceResetNow() {
          if (
            !confirm(
              "Reset ✨ Aura and 🎴 Cards Sent to 0 for EVERY player right now? This cannot be undone.",
            )
          )
            return;
          const statusEl = document.getElementById("gcAuraResetStatus");
          showToast("⏳ Resetting Aura & Cards Sent for everyone…");
          _waitForMod("__mod_adminForceAuraResetNow", async () => {
            const count = await window.adminForceAuraResetNow();
            if (count < 0) {
              showToast("❌ Failed — check connection.");
              return;
            }
            showToast(`✅ Aura & Cards Sent reset for ${count} player(s)!`);
            if (statusEl) {
              statusEl.textContent = `✅ Aura & Cards Sent reset for ${count} player(s)!`;
              statusEl.style.display = "block";
              setTimeout(() => {
                statusEl.style.display = "none";
              }, 3000);
            }
            gcAuraRefreshResetInfo();
            gcAuraLoadPlayerList(); // refresh aura totals shown in the player list
            if (typeof socialFetchAndRender === "function") socialFetchAndRender();
          });
        }

        function gcSetMode(mode, btnEl) {
          _gcMode = mode;
          document
            .querySelectorAll("#gcCoinsPanel .gc-mode-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          const oneSec = document.getElementById("gcOneSection");
          if (oneSec) oneSec.style.display = mode === "one" ? "" : "none";
          if (mode === "one" && (!_gcPlayersList || _gcPlayersList.length === 0)) {
            gcLoadPlayerList();
          }
        }

        function gcLoadPlayerList() {
          const listEl = document.getElementById("gcPlayerPickList");
          if (listEl)
            listEl.innerHTML =
              '<div class="ps-loading">⚡ Loading players…</div>';
          _waitForMod("__mod_adminLoadAllPlayers", async () => {
            const players = await window.adminLoadAllPlayers();
            _gcPlayersList = [...players].sort((a, b) => {
              const an = (a.profile?.name || a.username || "").toLowerCase();
              const bn = (b.profile?.name || b.username || "").toLowerCase();
              return an.localeCompare(bn);
            });
            gcRenderPlayerPickList();
            if (
              (!_gcAllGrants || _gcAllGrants.length === 0) &&
              typeof window.seedInitialGrantHistoryFromPlayers === "function"
            ) {
              window
                .seedInitialGrantHistoryFromPlayers(_gcPlayersList)
                .then((seeded) => {
                  if (Array.isArray(seeded) && seeded.length > 0) {
                    _gcAllGrants = seeded.slice(0, 50);
                    gcRenderAllHistories();
                    gcUpdateHubSessionCount();
                  }
                });
            }
          });
        }

        function gcRenderPlayerPickList() {
          const listEl = document.getElementById("gcPlayerPickList");
          const searchEl = document.getElementById("gcPlayerSearch");
          if (!listEl) return;
          const search = (searchEl ? searchEl.value : "").toLowerCase();

          const filtered = _gcPlayersList.filter((p) => {
            if (!search) return true;
            const name = (p.profile?.name || p.username || "").toLowerCase();
            const id = (p.playerId || p.id || "").toLowerCase();
            return name.includes(search) || id.includes(search);
          });

          if (filtered.length === 0) {
            listEl.innerHTML = `<div class="ps-empty">${search ? "No players match your search." : "No players found. Tap 🔄 to refresh."}</div>`;
            return;
          }

          const selectedPid = (
            document.getElementById("gcPlayerIdInput").value || ""
          )
            .trim()
            .toUpperCase();

          listEl.innerHTML = "";
          filtered.forEach((p) => {
            const name = p.profile?.name || p.username || "Unknown";
            const town = p.profile?.town || "";
            const avatar = p.profile?.avatar || p.avatar || "🧙";
            const photoURL = p.profile?.photoURL || "";
            const pid = p.playerId || p.id || "";
            const pCoins = typeof p.coins === "number" ? p.coins : 0;
            const isSelected = pid === selectedPid;

            const card = document.createElement("div");
            card.className =
              "ps-player-card gc-pick-card" + (isSelected ? " selected" : "");
            card.onclick = () => gcSelectPlayer(pid, name, p);
            card.innerHTML = `
      <span class="gc-pick-check">${isSelected ? "✅" : ""}</span>
      <div class="ps-player-top">
        <div class="ps-player-av">${avatarHTML(avatar, photoURL, pid, name)}</div>
        <div class="ps-player-info">
          <div class="ps-player-name">${name}</div>
          <div class="ps-player-meta">${pid}${town ? " · 🏘️ " + town : ""}</div>
        </div>
        <div class="ps-player-stats">
          <span class="ps-stat-chip coins">🪙 ${pCoins.toLocaleString()}</span>
        </div>
      </div>
    `;
            listEl.appendChild(card);
          });
        }

        function gcSelectPlayer(pid, name, playerObj) {
          const inp = document.getElementById("gcPlayerIdInput");
          if (inp) inp.value = pid;
          
          const p = playerObj || _gcPlayersList.find(x => (x.playerId || x.id) === pid);
          const previewCard = document.getElementById("gcSelectedPreview");
          if (previewCard && p) {
            const pName = p.profile?.name || p.username || name || "Unknown";
            const pTown = p.profile?.town || "";
            const pAv = p.profile?.avatar || p.avatar || "🧙";
            const pPhoto = p.profile?.photoURL || "";
            const pCoins = typeof p.coins === "number" ? p.coins : 0;

            const avEl = document.getElementById("gcPreviewAv");
            const nameEl = document.getElementById("gcPreviewName");
            const metaEl = document.getElementById("gcPreviewMeta");
            const balEl = document.getElementById("gcPreviewBalance");

            if (avEl) avEl.innerHTML = avatarHTML(pAv, pPhoto, pid, pName);
            if (nameEl) nameEl.textContent = pName;
            if (metaEl) metaEl.textContent = `${pid}${pTown ? " · 🏘️ " + pTown : ""}`;
            if (balEl) balEl.textContent = `🪙 ${pCoins.toLocaleString()}`;
            previewCard.classList.add("show");
          }

          gcRenderPlayerPickList();
        }

        function gcClearSelectedPlayer() {
          const inp = document.getElementById("gcPlayerIdInput");
          if (inp) inp.value = "";
          const previewCard = document.getElementById("gcSelectedPreview");
          if (previewCard) previewCard.classList.remove("show");
          const banner = document.getElementById("gcSelectedBanner");
          if (banner) banner.classList.remove("show");
          gcRenderPlayerPickList();
        }

        function gcManualIdChanged() {
          const previewCard = document.getElementById("gcSelectedPreview");
          if (previewCard) previewCard.classList.remove("show");
          gcRenderPlayerPickList();
        }

        // Quick Preset Chips for Coins
        function gcSelectPresetCoins(amount, btnEl) {
          _gcAmount = amount;
          document
            .querySelectorAll("#gcCoinsPresetRow .gc-preset-chip")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          const customInp = document.getElementById("gcCustomAmount");
          if (customInp) customInp.value = "";
          const exeBtn = document.getElementById("gcCoinsExecuteBtn");
          if (exeBtn) exeBtn.textContent = `✨ Grant ${amount.toLocaleString()} 🪙`;
        }

        function gcCustomChanged(inp) {
          const v = parseInt(inp.value, 10);
          if (v > 0) {
            _gcAmount = v;
            document
              .querySelectorAll("#gcCoinsPresetRow .gc-preset-chip")
              .forEach((b) => b.classList.remove("active"));
            const exeBtn = document.getElementById("gcCoinsExecuteBtn");
            if (exeBtn) exeBtn.textContent = `✨ Grant ${v.toLocaleString()} 🪙`;
          }
        }

        async function gcExecuteGrant() {
          if (!_gcAmount || _gcAmount <= 0) {
            showToast("Enter a valid coin amount!");
            return;
          }

          const statusEl = document.getElementById("gcStatus");
          if (statusEl) statusEl.style.display = "none";
          const noteInputEl = document.getElementById("gcNoteInput");
          const note = (noteInputEl ? noteInputEl.value : "").trim();

          if (_gcMode === "all") {
            if (
              !confirm(
                `Grant ${_gcAmount.toLocaleString()} 🪙 to ALL players? This cannot be undone.`,
              )
            )
              return;
            showToast("⏳ Granting coins to all players…");
            _waitForMod("__mod_adminGrantCoinsAll", async () => {
              const count = await window.adminGrantCoinsAll(_gcAmount, note);
              if (count < 0) {
                showToast("❌ Failed — check connection.");
                return;
              }

              gcRenderAllHistories();
              gcUpdateHubSessionCount();

              if (statusEl) {
                statusEl.textContent = `✅ ${_gcAmount.toLocaleString()} 🪙 sent to ${count} player(s)!`;
                statusEl.style.display = "block";
                setTimeout(() => {
                  statusEl.style.display = "none";
                }, 3000);
              }
              showToast(`🎁 ${_gcAmount.toLocaleString()} 🪙 granted to ${count} players!`);
              if (noteInputEl) noteInputEl.value = "";
            });
          } else {
            const pid = (document.getElementById("gcPlayerIdInput").value || "")
              .trim()
              .toUpperCase();
            if (!pid || !pid.startsWith("DA-") || pid.length !== 8) {
              showToast("Select or enter a valid Player ID (e.g. DA-ABCDE)");
              return;
            }
            if (!confirm(`Grant ${_gcAmount.toLocaleString()} 🪙 to player ${pid}?`)) return;
            showToast("⏳ Sending coins…");
            _waitForMod("__mod_adminGrantCoinsOne", async () => {
              const result = await window.adminGrantCoinsOne(
                pid,
                _gcAmount,
                note,
              );
              if (result === false) {
                showToast("❌ Failed — check connection.");
                return;
              }
              if (result === null) {
                showToast("❌ Player ID not found!");
                return;
              }

              // If granting to self (the admin)
              if (pid === window._currentPlayerId) {
                const adminName =
                  (typeof window._getAdminAttribution === "function" && window._getAdminAttribution().name) ||
                  profile.name ||
                  window._currentUsername ||
                  "Admin";
                coins += _gcAmount;
                if (typeof logCoinTx === "function") {
                  logCoinTx(
                    _gcAmount,
                    note
                      ? `🎁 Granted by ${adminName} — ${note}`
                      : `🎁 Granted by ${adminName}`,
                  );
                }
                updateHUD();
              }

              const name = typeof result === "string" ? result : pid;
              gcRenderAllHistories();
              gcUpdateHubSessionCount();

              if (statusEl) {
                statusEl.textContent = `✅ ${_gcAmount.toLocaleString()} 🪙 sent to ${name}!`;
                statusEl.style.display = "block";
                setTimeout(() => {
                  statusEl.style.display = "none";
                }, 3000);
              }
              showToast(`🎁 ${_gcAmount.toLocaleString()} 🪙 sent to ${name}!`);
              document.getElementById("gcPlayerIdInput").value = "";
              if (noteInputEl) noteInputEl.value = "";
              const previewCard = document.getElementById("gcSelectedPreview");
              if (previewCard) previewCard.classList.remove("show");
              gcLoadPlayerList(); // refresh coin totals shown in the player list
            });
          }
        }

        function gcRenderHistory() {
          const el = document.getElementById("gcHistory");
          if (!el) return;
          const coinGrants = _gcAllGrants
            .filter((g) => g.type === "coins")
            .slice(0, 50);
          if (coinGrants.length === 0) {
            el.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.72rem;padding:8px">No coin grants recorded yet</div>';
            return;
          }
          el.innerHTML = coinGrants
            .map((e) => {
              const isDeduct =
                e.direction === "deduct" ||
                String(e.result || "").toLowerCase().includes("deduct") ||
                (typeof e.amount === "number" && e.amount < 0) ||
                (typeof e.delta === "number" && e.delta < 0);
              const dt = e.timestamp
                ? new Date(e.timestamp)
                : e.ts
                ? new Date(e.ts)
                : null;
              const timeStr = dt ? formatGrantTime(dt) : e.ts || "";
              const adminInfo = e.adminName
                ? ` · by ${escapeHtml(e.adminName.toLowerCase() === "leader" ? "Admin" : e.adminName)}`
                : "";
              const sign = isDeduct ? "−" : "+";
              const coinColor = isDeduct ? "#f87171" : "#4ade80";
              const resultText = escapeHtml(
                e.result || (isDeduct ? "Deducted" : "Sent"),
              );
              return `<div class="gc-history-row" style="flex-direction:column;align-items:flex-start;gap:3px;padding:6px 4px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
          <span style="font-weight:600;color:rgba(255,255,255,.85);font-size:.74rem;">${escapeHtml(e.mode || e.targetName || "Player")}</span>
          <span class="gc-history-coin${isDeduct ? " deduct" : ""}" style="color:${coinColor};">${sign}${Math.abs(e.amount || 0).toLocaleString()} 🪙 · ${resultText}</span>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;font-size:.67rem;color:rgba(255,255,255,.4);">
          <span>🕒 ${timeStr}${adminInfo}</span>
        </div>
        ${e.note ? `<div style="font-size:.67rem;color:rgba(255,255,255,.45);font-style:italic;word-break:break-word;">📝 "${escapeHtml(e.note)}"</div>` : ""}
      </div>`;
            })
            .join("");
        }

        // ═══════════════════════════════════════════════════════════
        // GRANT AURA — admin tool
        // ═══════════════════════════════════════════════════════════
        function gcAuraSetDirection(dir, btnEl) {
          _gcAuraDirection = dir;
          document
            .querySelectorAll("#gcAuraDirectionRow .gc-mode-btn")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          const btn = document.getElementById("gcAuraExecuteBtn");
          if (btn) {
            btn.className = dir === "deduct" ? "btn btn-red" : "btn btn-green";
            btn.textContent =
              dir === "deduct" ? `➖ Deduct ${_gcAuraAmount} ✨ Aura` : `✨ Grant ${_gcAuraAmount} ✨ Aura`;
          }
        }

        function gcAuraLoadPlayerList() {
          const listEl = document.getElementById("gcAuraPlayerPickList");
          if (listEl)
            listEl.innerHTML =
              '<div class="ps-loading">⚡ Loading players…</div>';
          _waitForMod("__mod_adminLoadAllPlayers", async () => {
            const players = await window.adminLoadAllPlayers();
            _gcAuraPlayersList = [...players].sort((a, b) => {
              const an = (a.profile?.name || a.username || "").toLowerCase();
              const bn = (b.profile?.name || b.username || "").toLowerCase();
              return an.localeCompare(bn);
            });
            gcAuraRenderPlayerPickList();
            if (
              (!_gcAllGrants || _gcAllGrants.length === 0) &&
              typeof window.seedInitialGrantHistoryFromPlayers === "function"
            ) {
              window
                .seedInitialGrantHistoryFromPlayers(_gcAuraPlayersList)
                .then((seeded) => {
                  if (Array.isArray(seeded) && seeded.length > 0) {
                    _gcAllGrants = seeded.slice(0, 50);
                    gcRenderAllHistories();
                    gcUpdateHubSessionCount();
                  }
                });
            }
          });
        }

        function gcAuraRenderPlayerPickList() {
          const listEl = document.getElementById("gcAuraPlayerPickList");
          const searchEl = document.getElementById("gcAuraPlayerSearch");
          if (!listEl) return;
          const search = (searchEl ? searchEl.value : "").toLowerCase();

          const filtered = _gcAuraPlayersList.filter((p) => {
            if (!search) return true;
            const name = (p.profile?.name || p.username || "").toLowerCase();
            const id = (p.playerId || p.id || "").toLowerCase();
            return name.includes(search) || id.includes(search);
          });

          if (filtered.length === 0) {
            listEl.innerHTML = `<div class="ps-empty">${search ? "No players match your search." : "No players found. Tap 🔄 to refresh."}</div>`;
            return;
          }

          const selectedPid = (
            document.getElementById("gcAuraPlayerIdInput").value || ""
          )
            .trim()
            .toUpperCase();

          listEl.innerHTML = "";
          filtered.forEach((p) => {
            const name = p.profile?.name || p.username || "Unknown";
            const town = p.profile?.town || "";
            const avatar = p.profile?.avatar || p.avatar || "🧙";
            const photoURL = p.profile?.photoURL || "";
            const pid = p.playerId || p.id || "";
            const pAura = typeof p.aura === "number" ? p.aura : 0;
            const isSelected = pid === selectedPid;

            const card = document.createElement("div");
            card.className =
              "ps-player-card gc-pick-card" + (isSelected ? " selected" : "");
            card.onclick = () => gcAuraSelectPlayer(pid, name, p);
            card.innerHTML = `
      <span class="gc-pick-check">${isSelected ? "✅" : ""}</span>
      <div class="ps-player-top">
        <div class="ps-player-av">${avatarHTML(avatar, photoURL, pid, name)}</div>
        <div class="ps-player-info">
          <div class="ps-player-name">${name}</div>
          <div class="ps-player-meta">${pid}${town ? " · 🏘️ " + town : ""}</div>
        </div>
        <div class="ps-player-stats">
          <span class="ps-stat-chip aura">✨ ${pAura.toLocaleString()}</span>
        </div>
      </div>
    `;
            listEl.appendChild(card);
          });
        }

        function gcAuraSelectPlayer(pid, name, playerObj) {
          const inp = document.getElementById("gcAuraPlayerIdInput");
          if (inp) inp.value = pid;
          
          const p = playerObj || _gcAuraPlayersList.find(x => (x.playerId || x.id) === pid);
          const previewCard = document.getElementById("gcAuraSelectedPreview");
          if (previewCard && p) {
            const pName = p.profile?.name || p.username || name || "Unknown";
            const pTown = p.profile?.town || "";
            const pAv = p.profile?.avatar || p.avatar || "🧙";
            const pPhoto = p.profile?.photoURL || "";
            const pAura = typeof p.aura === "number" ? p.aura : 0;

            const avEl = document.getElementById("gcAuraPreviewAv");
            const nameEl = document.getElementById("gcAuraPreviewName");
            const metaEl = document.getElementById("gcAuraPreviewMeta");
            const balEl = document.getElementById("gcAuraPreviewBalance");

            if (avEl) avEl.innerHTML = avatarHTML(pAv, pPhoto, pid, pName);
            if (nameEl) nameEl.textContent = pName;
            if (metaEl) metaEl.textContent = `${pid}${pTown ? " · 🏘️ " + pTown : ""}`;
            if (balEl) balEl.textContent = `✨ ${pAura.toLocaleString()}`;
            previewCard.classList.add("show");
          }

          gcAuraRenderPlayerPickList();
        }

        function gcAuraClearSelectedPlayer() {
          const inp = document.getElementById("gcAuraPlayerIdInput");
          if (inp) inp.value = "";
          const previewCard = document.getElementById("gcAuraSelectedPreview");
          if (previewCard) previewCard.classList.remove("show");
          const banner = document.getElementById("gcAuraSelectedBanner");
          if (banner) banner.classList.remove("show");
          gcAuraRenderPlayerPickList();
        }

        function gcAuraManualIdChanged() {
          const previewCard = document.getElementById("gcAuraSelectedPreview");
          if (previewCard) previewCard.classList.remove("show");
          gcAuraRenderPlayerPickList();
        }

        // Quick Preset Chips for Aura
        function gcSelectPresetAura(amount, btnEl) {
          _gcAuraAmount = amount;
          document
            .querySelectorAll("#gcAuraPresetRow .gc-preset-chip")
            .forEach((b) => b.classList.remove("active"));
          if (btnEl) btnEl.classList.add("active");
          const customInp = document.getElementById("gcAuraCustomAmount");
          if (customInp) customInp.value = "";
          const exeBtn = document.getElementById("gcAuraExecuteBtn");
          if (exeBtn) {
            const isDeduct = _gcAuraDirection === "deduct";
            exeBtn.textContent = isDeduct ? `➖ Deduct ${amount} ✨ Aura` : `✨ Grant ${amount} ✨ Aura`;
          }
        }

        function gcAuraCustomChanged(inp) {
          const v = parseInt(inp.value, 10);
          if (v > 0) {
            _gcAuraAmount = v;
            document
              .querySelectorAll("#gcAuraPresetRow .gc-preset-chip")
              .forEach((b) => b.classList.remove("active"));
            const exeBtn = document.getElementById("gcAuraExecuteBtn");
            if (exeBtn) {
              const isDeduct = _gcAuraDirection === "deduct";
              exeBtn.textContent = isDeduct ? `➖ Deduct ${v} ✨ Aura` : `✨ Grant ${v} ✨ Aura`;
            }
          }
        }

        async function gcAuraExecuteGrant() {
          if (!_gcAuraAmount || _gcAuraAmount <= 0) {
            showToast("Enter a valid Aura amount!");
            return;
          }

          const statusEl = document.getElementById("gcAuraStatus");
          if (statusEl) statusEl.style.display = "none";
          const noteInputEl = document.getElementById("gcAuraNoteInput");
          const note = (noteInputEl ? noteInputEl.value : "").trim();

          const pid = (
            document.getElementById("gcAuraPlayerIdInput").value || ""
          )
            .trim()
            .toUpperCase();
          if (!pid || !pid.startsWith("DA-") || pid.length !== 8) {
            showToast("Select or enter a valid Player ID (e.g. DA-ABCDE)");
            return;
          }

          const isDeduct = _gcAuraDirection === "deduct";
          if (
            !confirm(
              `${isDeduct ? "Deduct" : "Grant"} ${_gcAuraAmount} ✨ Aura ${isDeduct ? "from" : "to"} player ${pid}?`,
            )
          )
            return;
          showToast(isDeduct ? "⏳ Deducting Aura…" : "⏳ Sending Aura…");
          _waitForMod(
            isDeduct ? "__mod_adminDeductAuraOne" : "__mod_adminGrantAuraOne",
            async () => {
              const result = isDeduct
                ? await window.adminDeductAuraOne(pid, _gcAuraAmount, note)
                : await window.adminGrantAuraOne(pid, _gcAuraAmount, note);
              if (result === false) {
                showToast("❌ Failed — check connection.");
                return;
              }
              if (result === null) {
                showToast("❌ Player ID not found!");
                return;
              }

              if (pid === window._currentPlayerId) {
                if (isDeduct) {
                  window.aura = Math.max(0, (window.aura || 0) - _gcAuraAmount);
                } else {
                  window.aura = (window.aura || 0) + _gcAuraAmount;
                }
                if (typeof updateHUD === "function") updateHUD();
              }

              const name = typeof result === "string" ? result : pid;
              gcRenderAllHistories();
              gcUpdateHubSessionCount();

              if (statusEl) {
                statusEl.textContent = isDeduct
                  ? `✅ ${_gcAuraAmount} ✨ deducted from ${name}!`
                  : `✅ ${_gcAuraAmount} ✨ sent to ${name}!`;
                statusEl.style.display = "block";
                setTimeout(() => {
                  statusEl.style.display = "none";
                }, 3000);
              }
              showToast(
                isDeduct
                  ? `➖ ${_gcAuraAmount} ✨ deducted from ${name}!`
                  : `🎁 ${_gcAuraAmount} ✨ sent to ${name}!`,
              );
              document.getElementById("gcAuraPlayerIdInput").value = "";
              if (noteInputEl) noteInputEl.value = "";
              const previewCard = document.getElementById("gcAuraSelectedPreview");
              if (previewCard) previewCard.classList.remove("show");
              gcAuraLoadPlayerList(); // refresh aura totals shown in the player list
            },
          );
        }

        function gcAuraRenderHistory() {
          const el = document.getElementById("gcAuraHistory");
          if (!el) return;
          const auraGrants = _gcAllGrants
            .filter((g) => g.type === "aura")
            .slice(0, 50);
          if (auraGrants.length === 0) {
            el.innerHTML =
              '<div style="text-align:center;color:rgba(255,255,255,.25);font-size:.72rem;padding:8px">No aura grants recorded yet</div>';
            return;
          }
          el.innerHTML = auraGrants
            .map((e) => {
              const isDeduct =
                e.direction === "deduct" ||
                String(e.result || "").toLowerCase().includes("deduct") ||
                (typeof e.amount === "number" && e.amount < 0) ||
                (typeof e.delta === "number" && e.delta < 0);
              const dt = e.timestamp
                ? new Date(e.timestamp)
                : e.ts
                ? new Date(e.ts)
                : null;
              const timeStr = dt ? formatGrantTime(dt) : e.ts || "";
              const adminInfo = e.adminName
                ? ` · by ${escapeHtml(e.adminName.toLowerCase() === "leader" ? "Admin" : e.adminName)}`
                : "";
              const sign = isDeduct ? "−" : "+";
              return `<div class="gc-history-row" style="flex-direction:column;align-items:flex-start;gap:3px;padding:6px 4px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
          <span style="font-weight:600;color:rgba(255,255,255,.85);font-size:.74rem;">${escapeHtml(e.mode || e.targetName || "Player")}</span>
          <span class="gc-history-coin${isDeduct ? " deduct" : ""}" style="color:${isDeduct ? "#f59e0b" : "#e5c8ff"}">${sign}${Math.abs(e.amount || 0).toLocaleString()} ✨ · ${escapeHtml(e.result || (isDeduct ? "Deducted" : "Sent"))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;font-size:.67rem;color:rgba(255,255,255,.4);">
          <span>🕒 ${timeStr}${adminInfo}</span>
        </div>
        ${e.note ? `<div style="font-size:.67rem;color:rgba(255,255,255,.45);font-style:italic;word-break:break-word;">📝 "${escapeHtml(e.note)}"</div>` : ""}
      </div>`;
            })
            .join("");
        }

        // ═══════════════════════════════════════════════════════════
        // PLAYER STATS — admin tool
        // ═══════════════════════════════════════════════════════════

        let _psPlayers = [];

        async function psLoadPlayers() {
          const listEl = document.getElementById("psPlayerList");
          if (!listEl) return;
          listEl.innerHTML =
            '<div class="ps-loading">⚡ Loading players…</div>';

          _waitForMod("__mod_adminLoadAllPlayers", async () => {
            _psPlayers = await window.adminLoadAllPlayers();

            // Update summary
            const totalCoins = _psPlayers.reduce(
              (a, p) => a + (p.coins || 0),
              0,
            );
            const totalCards = _psPlayers.reduce(
              (a, p) =>
                a +
                (typeof p.cardsWon === "number"
                  ? p.cardsWon
                  : Object.keys(p.ownedCards || {}).filter(
                      (k) => p.ownedCards[k] && p.ownedCards[k].owned,
                    ).length),
              0,
            );
            const tpEl = document.getElementById("psTotalPlayers");
            const tcEl = document.getElementById("psTotalCoins");
            const tdEl = document.getElementById("psTotalCards");
            if (tpEl) tpEl.textContent = _psPlayers.length;
            if (tcEl) tcEl.textContent = totalCoins.toLocaleString();
            if (tdEl) tdEl.textContent = totalCards.toLocaleString();

            psRenderList();
          });
        }

        function psRenderList() {
          const listEl = document.getElementById("psPlayerList");
          const searchEl = document.getElementById("psSearchInput");
          if (!listEl) return;
          const search = (searchEl ? searchEl.value : "").toLowerCase();

          const filtered = _psPlayers.filter((p) => {
            if (!search) return true;
            const name = (p.profile?.name || p.username || "").toLowerCase();
            const id = (p.playerId || "").toLowerCase();
            return name.includes(search) || id.includes(search);
          });

          // Sort by coins desc
          const sorted = [...filtered].sort(
            (a, b) => (b.coins || 0) - (a.coins || 0),
          );

          if (sorted.length === 0) {
            listEl.innerHTML =
              '<div class="ps-empty">' +
              (search
                ? "No players match your search."
                : "No players found. Tap Refresh.") +
              "</div>";
            return;
          }

          listEl.innerHTML = "";
          sorted.forEach((p, rank) => {
            const name = p.profile?.name || p.username || "Unknown";
            const town = p.profile?.town || "";
            const avatar = p.profile?.avatar || p.avatar || "🧙";
            const photoURL = p.profile?.photoURL || "";
            const pid = p.playerId || p.id || "";
            const pCoins = typeof p.coins === "number" ? p.coins : 0;
            const pCardsWon = typeof p.cardsWon === "number" ? p.cardsWon : 0;
            const pOwned = Object.keys(p.ownedCards || {}).filter(
              (k) => p.ownedCards[k] && p.ownedCards[k].owned,
            ).length;
            const joined = p.createdAt
              ? new Date(p.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—";
            const updated = p.updatedAt
              ? new Date(p.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "—";
            const nameEsc = name.replace(/'/g, "\\'");

            // Booked shop items — shown directly from the player's own doc so a
            // stuck/orphaned booking (no matching Shop Request row, e.g. from a
            // shared-doc write race) can still be found and fixed here.
            const bookedShopEntries = Object.entries(
              p.ownedShopItems || {},
            ).filter(([, e]) => e && e.count > 0);
            const shopSlotsHtml =
              bookedShopEntries.length > 0
                ? `
      <div style="margin-top:8px;padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px dashed rgba(240,192,48,.3)">
        <div style="font-size:.68rem;color:#c9b8ff;font-weight:700;margin-bottom:8px">🛍️ Booked Shop Items</div>
        ${bookedShopEntries
          .map(([itemId, e]) => {
            const item = SHOP_ITEMS.find((i) => i.id === itemId);
            const iname = item ? item.name : itemId;
            const iemoji = item ? item.emoji : "🛍️";
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:.75rem">
              <span>${iemoji} ${iname} — Booked ${e.count}</span>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn btn-green" style="font-size:.62rem;padding:5px 8px" onclick="psMarkShopSlotGiven('${pid}','${itemId}','${nameEsc}')">✅ Mark 1 Given</button>
                <button class="btn btn-red" style="font-size:.62rem;padding:5px 8px" onclick="psClearShopBooking('${pid}','${itemId}','${nameEsc}')">🗑️ Clear</button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`
                : "";

            const card = document.createElement("div");
            card.className = "ps-player-card";
            card.innerHTML = `
      <button class="ps-remove-btn" title="Remove player" onclick="psRemovePlayer('${pid}','${name}')">❌</button>
      <div class="ps-player-top">
        <div class="ps-player-av editable" title="Tap to set profile photo" onclick="psOpenPhotoModal('${pid}','${name.replace(/'/g, "\\'")}')">
          ${avatarHTML(avatar, photoURL, pid, name)}
          <div class="ps-av-edit-badge">📷</div>
        </div>
        <div class="ps-player-info">
          <div class="ps-player-name">${name} ${rank === 0 ? "👑" : ""}</div>
          <div class="ps-player-meta">${pid}${town ? " · 🏘️ " + town : ""} · Joined ${joined} · Active ${updated}</div>
        </div>
        <div class="ps-player-stats">
          <span class="ps-stat-chip coins">🪙 ${pCoins.toLocaleString()}</span>
          <span class="ps-stat-chip cards">🃏 ${pOwned}/150</span>
        </div>
      </div>
      <div class="ps-actions">
        <button class="ps-action-btn ps-btn-history" style="background:rgba(245,197,66,.15);border:1px solid rgba(245,197,66,.35);color:var(--gold)" onclick="psOpenPlayerCoinHistory('${pid}','${nameEsc}')">🪙 History</button>
        <button class="ps-action-btn ps-btn-deduct" onclick="psDeductCoins('${pid}','${name}')">➖ Deduct Coins</button>
        <button class="ps-action-btn ps-btn-pin"   onclick="adminResetPin('${pid}','${name}')">🔐 Reset PIN</button>
        <button class="ps-action-btn ps-btn-reset"  onclick="psResetPlayer('${pid}','${name}')">🗑️ Reset Progress</button>
      </div>
      ${shopSlotsHtml}
    `;
            listEl.appendChild(card);
          });
        }

        // ── PLAYER STATS: view a player's full coin transaction history ────
        async function psOpenPlayerCoinHistory(pid, name) {
          const target = _psPlayers.find((p) => (p.playerId || p.id) === pid);
          let history = target && Array.isArray(target.coinHistory) ? target.coinHistory : null;
          if (!history && window.adminLoadAllPlayers) {
            try {
              showToast("⏳ Loading coin history…");
              const all = await window.adminLoadAllPlayers();
              const refreshed = all.find((p) => (p.playerId || p.id) === pid);
              if (refreshed && Array.isArray(refreshed.coinHistory)) history = refreshed.coinHistory;
            } catch (e) {
              console.warn("Could not load player coin history:", e);
            }
          }
          history = history || [];
          renderCoinHistoryList(history);
          const modalTitle = document.querySelector("#coinHistoryOverlay .modal-title");
          if (modalTitle) modalTitle.textContent = `Coin History — ${name}`;
          const overlay = document.getElementById("coinHistoryOverlay");
          if (overlay) overlay.classList.add("show");
          if (window.daPushOverlayState) window.daPushOverlayState("coinHistoryOverlay");
        }
        window.psOpenPlayerCoinHistory = psOpenPlayerCoinHistory;

        // ── PLAYER STATS: fix a stuck/orphaned booked shop slot ────
        function psMarkShopSlotGiven(pid, itemId, name) {
          const item = SHOP_ITEMS.find((i) => i.id === itemId);
          const iname = item ? item.name : itemId;
          if (
            !confirm(
              `Mark 1 booked "${iname}" slot as delivered for ${name}? This removes 1 from their booked count.`,
            )
          )
            return;
          showToast("⏳ Updating…");
          _waitForMod("__mod_adminDeductShopItemFromPlayer", async () => {
            const result = await window.adminDeductShopItemFromPlayer(
              pid,
              itemId,
            );
            if (result === false) {
              showToast("❌ Could not update player — check connection.");
              return;
            }
            if (result === null) {
              showToast("⚠️ Player record not found.");
              return;
            }
            if (result.result === "not-owned")
              showToast(`⚠️ ${name} has no booked slots left for this item.`);
            else
              showToast(
                `✅ ${iname} delivered — ${name} now has ${result.newCount} booked.`,
              );
            psLoadPlayers();
          });
        }

        function psClearShopBooking(pid, itemId, name) {
          const item = SHOP_ITEMS.find((i) => i.id === itemId);
          const iname = item ? item.name : itemId;
          if (
            !confirm(
              `⚠️ Fully clear "${iname}" booking for ${name}?\nThis wipes their booked count AND resets pricing back to base for this item. Use this only to fix a stuck/orphaned booking that has no matching Shop Request row — it does NOT refund coins (grant coins separately if the player actually paid). This cannot be undone.`,
            )
          )
            return;
          showToast("⏳ Clearing…");
          _waitForMod("__mod_adminClearShopItemForPlayer", async () => {
            const ok = await window.adminClearShopItemForPlayer(pid, itemId);
            showToast(
              ok
                ? `✅ Cleared ${iname} booking for ${name}.`
                : "❌ Could not update player — check connection.",
            );
            psLoadPlayers();
          });
        }

        // ── PLAYER STATS: Set profile photo (admin, tap avatar) ────
        let _psPhotoTarget = null; // { pid, name, avatar, original }
        let _psPhotoDataURL = ""; // set when a file has been chosen + compressed
        let _psPhotoTouched = false; // true once the admin has actually changed something

        function psOpenPhotoModal(pid, name) {
          const player = _psPlayers.find((p) => (p.playerId || p.id) === pid);
          const avatar = player?.profile?.avatar || player?.avatar || "🧙";
          const photoURL = player?.profile?.photoURL || "";
          _psPhotoTarget = { pid, name, avatar, original: photoURL };
          _psPhotoDataURL = "";
          _psPhotoTouched = false;

          document.getElementById("psPhotoPlayerName").textContent = name;
          // Only put http(s) links in the text box — an existing uploaded photo is a
          // big data: URI and would make the box look broken, so just show it in
          // the preview instead and leave the box empty.
          document.getElementById("psPhotoUrlInput").value =
            photoURL.indexOf("http") === 0 ? photoURL : "";
          document.getElementById("psPhotoFileInput").value = "";
          document.getElementById("psPhotoFileStatus").style.display = "none";
          psRenderPhotoPreview(photoURL, avatar);
          showOverlay("overlayPsPhoto");
        }

        function psPhotoPreview() {
          _psPhotoDataURL = "";
          _psPhotoTouched = true;
          document.getElementById("psPhotoFileInput").value = "";
          document.getElementById("psPhotoFileStatus").style.display = "none";
          const url = document.getElementById("psPhotoUrlInput").value.trim();
          psRenderPhotoPreview(
            url,
            _psPhotoTarget ? _psPhotoTarget.avatar : "🧙",
          );
        }

        function psRenderPhotoPreview(url, avatar) {
          const icon = document.getElementById("psPhotoPreviewIcon");
          const img = document.getElementById("psPhotoPreviewImg");
          if (url) {
            img.src = url;
            img.style.display = "";
            icon.style.display = "none";
          } else {
            img.style.display = "none";
            icon.style.display = "";
            icon.textContent = avatar;
          }
        }

        // Reads the chosen file, crops it to a square, downsizes it, and re-encodes
        // as a compressed JPEG data: URI — small enough (usually 15–40KB) to store
        // directly on the player's own document without needing separate file
        // storage/hosting.
        function psPhotoFileSelected(input) {
          const file = input.files && input.files[0];
          if (!file) return;
          if (!file.type || file.type.indexOf("image/") !== 0) {
            showToast("Please choose an image file.");
            input.value = "";
            return;
          }
          const statusEl = document.getElementById("psPhotoFileStatus");
          statusEl.style.display = "block";
          statusEl.textContent = `⏳ Processing ${file.name}…`;

          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const SIZE = 320;
              const canvas = document.createElement("canvas");
              canvas.width = SIZE;
              canvas.height = SIZE;
              const ctx = canvas.getContext("2d");
              // Crop to a centered square first so every avatar ends up consistent,
              // then draw it down to SIZE×SIZE.
              const side = Math.min(img.width, img.height);
              const sx = (img.width - side) / 2;
              const sy = (img.height - side) / 2;
              ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
              const dataURL = canvas.toDataURL("image/jpeg", 0.78);

              _psPhotoDataURL = dataURL;
              _psPhotoTouched = true;
              document.getElementById("psPhotoUrlInput").value = "";
              const kb = Math.round((dataURL.length * 0.75) / 1024);
              statusEl.textContent = `📷 Selected: ${file.name} (~${kb}KB after resizing)`;
              psRenderPhotoPreview(
                dataURL,
                _psPhotoTarget ? _psPhotoTarget.avatar : "🧙",
              );
            };
            img.onerror = () => {
              showToast("❌ Could not read that image.");
              statusEl.style.display = "none";
            };
            img.src = e.target.result;
          };
          reader.onerror = () => {
            showToast("❌ Failed to read that file.");
            statusEl.style.display = "none";
          };
          reader.readAsDataURL(file);
        }

        function psConfirmSetPhoto() {
          if (!_psPhotoTarget) return;

          // Nothing changed — just close, no write needed.
          if (!_psPhotoDataURL && !_psPhotoTouched) {
            closeOverlay("overlayPsPhoto");
            return;
          }

          // Explicit removal (empty URL box after being touched, or the Remove button).
          if (
            !_psPhotoDataURL &&
            _psPhotoTouched &&
            !document.getElementById("psPhotoUrlInput").value.trim()
          ) {
            _waitForMod("__mod_adminRemovePlayerPhoto", async () => {
              const ok = await window.adminRemovePlayerPhoto(
                _psPhotoTarget.pid,
              );
              if (!ok) {
                showToast("❌ Failed to remove photo — check connection.");
                return;
              }
              showToast(`🗑️ Photo removed for ${_psPhotoTarget.name}.`);
              closeOverlay("overlayPsPhoto");
              psLoadPlayers();
            });
            return;
          }

          // An uploaded device photo — goes to Firebase Storage, then the resulting
          // download URL is saved to their profile.
          if (_psPhotoDataURL) {
            showToast("⏳ Uploading photo…");
            _waitForMod("__mod_adminUploadPlayerPhoto", async () => {
              const url = await window.adminUploadPlayerPhoto(
                _psPhotoTarget.pid,
                _psPhotoDataURL,
              );
              if (!url) {
                showToast("❌ Upload failed — check connection and try again.");
                return;
              }
              showToast(`📷 Photo updated for ${_psPhotoTarget.name}!`);
              closeOverlay("overlayPsPhoto");
              psLoadPlayers();
            });
            return;
          }

          // A pasted link.
          const url = document.getElementById("psPhotoUrlInput").value.trim();
          if (!/^https?:\/\/.+/i.test(url)) {
            showToast(
              "Enter a valid image URL (starting with http:// or https://)",
            );
            return;
          }
          _waitForMod("__mod_adminSetPlayerPhoto", async () => {
            const ok = await window.adminSetPlayerPhoto(
              _psPhotoTarget.pid,
              url,
            );
            if (!ok) {
              showToast("❌ Failed to set photo — check connection.");
              return;
            }
            showToast(`📷 Photo updated for ${_psPhotoTarget.name}!`);
            closeOverlay("overlayPsPhoto");
            psLoadPlayers();
          });
        }

        function psRemovePhoto() {
          if (!_psPhotoTarget) return;
          _psPhotoDataURL = "";
          _psPhotoTouched = true;
          document.getElementById("psPhotoUrlInput").value = "";
          document.getElementById("psPhotoFileInput").value = "";
          document.getElementById("psPhotoFileStatus").style.display = "none";
          psConfirmSetPhoto();
        }

        let _psDeductTarget = null;
        function psDeductCoins(pid, name) {
          _psDeductTarget = { pid, name };
          const descEl = document.getElementById("adminDeductDesc");
          if (descEl)
            descEl.innerHTML = `Deduct coins from <strong>${name}</strong> (<span style="color:var(--gold)">${pid}</span>).<br>How many coins to deduct?`;
          const inp = document.getElementById("adminDeductAmountInput");
          if (inp) inp.value = "50";
          showOverlay("overlayAdminDeductCoins");
          if (inp)
            setTimeout(() => {
              inp.focus();
              if (inp.select) inp.select();
            }, 120);
        }

        function psConfirmDeductCoins() {
          if (!_psDeductTarget) return;
          const { pid, name } = _psDeductTarget;
          const inp = document.getElementById("adminDeductAmountInput");
          const amt = parseInt(inp ? inp.value : "0", 10);
          if (!amt || amt <= 0) {
            showToast("Invalid amount.");
            return;
          }
          closeOverlay("overlayAdminDeductCoins");
          _waitForMod("__mod_adminDeductCoinsOne", async () => {
            const result = await window.adminDeductCoinsOne(pid, amt);
            if (result === false) {
              showToast("❌ Deduction failed.");
              return;
            }
            if (result === null) {
              showToast("❌ Player not found.");
              return;
            }
            if (pid === window._currentPlayerId) {
              const delta = result.newCoins - coins;
              coins = result.newCoins;
              logCoinTx(delta, "⚠️ Deducted by your DA leader");
              updateHUD();
            }
            showToast(
              `➖ ${amt} 🪙 deducted from ${name}! New balance: ${result.newCoins} 🪙`,
            );
            // Refresh the list so the updated coin count shows
            setTimeout(psLoadPlayers, 800);
          });
        }

        async function psResetPlayer(pid, name) {
          if (
            !confirm(
              `⚠️ Reset ALL progress for ${name} (${pid})?\nThis will wipe their coins, cards, and collection. This cannot be undone.`,
            )
          )
            return;
          _waitForMod("__mod_adminResetPlayerProgress", async () => {
            const ok = await window.adminResetPlayerProgress(pid);
            if (ok) {
              showToast(`🗑️ Progress reset for ${name}.`);
              setTimeout(psLoadPlayers, 800);
            } else {
              showToast("❌ Reset failed — check connection.");
            }
          });
        }

        async function psRemovePlayer(pid, name) {
          if (
            !confirm(
              `⚠️ PERMANENTLY REMOVE ${name} (${pid})?\nThis deletes their entire account — coins, cards, and login. They will need to register again from scratch. This cannot be undone.`,
            )
          )
            return;
          _waitForMod("__mod_adminDeletePlayer", async () => {
            const ok = await window.adminDeletePlayer(pid);
            if (ok) {
              showToast(`❌ ${name} has been removed.`);
              setTimeout(psLoadPlayers, 800);
            } else {
              showToast("❌ Removal failed — check connection.");
            }
          });
        }

        // ─── JUMBLED JACKPOT ─────────────────────────────────────
        const JJ_HINT_COST = 30;
        const JJ_SESSION_SIZE = 10;

        let jjActive = false;
        let jjQueue = [];
        let jjCurrent = null;
        let jjCorrectCount = 0;
        let jjWrongCount = 0;
        let jjStreak = 0;
        let jjQNum = 0;
        let jjHintUsed = false;
        let jjAnswered = false;
        let jjTotalCoinsWon = 0;
        let jjTotalAnswered = 0;
        let jjSessionStart = 0; // ms timestamp when round started
        let jjSelectedCards = []; // [{setIdx, cardIdx}] — Phase 2 card picks
        let jjRoundInProgress = false; // true from openJJ() through Phase1 (quiz) + Phase2 (card picking) until finalized/closed — used to detect an admin pause mid-round
        let jjAnswerLog = []; // [{cardName, emoji, typed, correct}] — per-question typed answers for this round, shown to admin in Event Logs

        // Build flat pool of ALL 150 cards — names come straight from SETS (single
        // source of truth shared by Collection, Shop, House of Cards, JJ, and JP).
        function jjAllCards() {
          const pool = [];
          SETS.forEach((set, si) => {
            set.cards.forEach((card, ci) => {
              pool.push({
                setIdx: si,
                cardIdx: ci,
                name: card.name,
                emoji: card.emoji,
                setName: set.name,
              });
            });
          });
          return pool;
        }

        /* Award a Cards Battle win to the real collection. CB deck cards only carry
         name/emoji/setName (no catalog indices), so map back through jjAllCards()
         — matching on real name, disambiguated by emoji + set name because a few
         real names repeat across sets. Exposed on window so the Cards Battle
         module (a separate <script type=module>) can call it. */
        window.cbAwardCardToCollection = function (name, emoji, setName) {
          try {
            if (!name) return false;
            const pool = jjAllCards();
            let m =
              pool.find(
                (c) =>
                  c.name === name && c.emoji === emoji && c.setName === setName,
              ) ||
              pool.find((c) => c.name === name && c.setName === setName) ||
              pool.find((c) => c.name === name);
            if (!m) return false;
            window.awardCardOrDuplicate(m.setIdx, m.cardIdx); // new card, or a sellable duplicate if already owned
            return true;
          } catch (e) {
            console.warn("cbAwardCardToCollection failed:", e);
            return false;
          }
        };

        function jjLoadStats() {
          try {
            const raw = localStorage.getItem("jj_stats_v1");
            if (raw) {
              const d = JSON.parse(raw);
              jjTotalCoinsWon = d.coins || 0;
              jjTotalAnswered = d.answered || 0;
              jjStreak = d.streak || 0;
            }
          } catch (e) {}
        }

        function jjSaveStats() {
          try {
            localStorage.setItem(
              "jj_stats_v1",
              JSON.stringify({
                coins: jjTotalCoinsWon,
                answered: jjTotalAnswered,
                streak: jjStreak,
              }),
            );
          } catch (e) {}
        }

        function jjUpdateEntryStats() {
          jjLoadStats();
          document.getElementById("jjStatScore").textContent = jjTotalCoinsWon;
          document.getElementById("jjStatStreak").textContent = jjStreak;
          document.getElementById("jjStatAnswered").textContent =
            jjTotalAnswered;
        }

        // jjEntryStub()/jpEntryStub() are no longer wired to anything — the CB-style
        // room entry (jjOpenLobby/jpOpenLobby, see the module script near the bottom
        // of the file) replaced them in step 2. Left defined (unused) in case any
        // other leftover onclick still points at them.
        function jjEntryStub() {
          showToast(
            "🚧 Jumbled Jackpot is being rebuilt as a room — coming soon!",
          );
        }
        function jpEntryStub() {
          showToast(
            "🚧 Jackpot Event is being rebuilt as a room — coming soon!",
          );
        }

        // ═══════════════════════════════════════════════════════════
        // JACKPOT EVENT — memorize a set, then request your top cards
        // (No coins are ever awarded for this event — submissions go
        //  straight to the Admin Dashboard's "Jackpot Entries" tab.)
        // ═══════════════════════════════════════════════════════════
        const JP_TIME_LIMIT = 180; // 3 minutes (default/fallback)

        let jpActive = false;
        let jpSetIdx = 0;
        let jpTimerInterval = null;
        let jpTimeLeft = JP_TIME_LIMIT;
        // Actual duration used for the current round — normally equals JP_TIME_LIMIT,
        // but a room host can override it via the lobby timer picker (see jpBeginLocalRound).
        let jpRoundDuration = JP_TIME_LIMIT;
        let jpSelectedCards = []; // [{setIdx, cardIdx}]
        let jpPhase1Result = null; // {correctCount, total, writtenAnswers}
        let jpSessionStart = 0; // ms timestamp when JP started
        let jpCardOrder = []; // shuffled real card-index for each displayed row, e.g. jpCardOrder[0] = real index shown on row 0
        window._jpCardOrder = jpCardOrder;

        function _normJpName(s) {
          return (s || "").trim().replace(/\s+/g, " ").toUpperCase();
        }
        window._normJpName = _normJpName;

        // Fisher–Yates shuffle — returns a randomized [0..n-1] index order so the
        // numbered rows (1..N) in Phase 1 don't always ask about cards in the same
        // fixed set.cards order.
        function jpShuffleOrder(n) {
          const arr = Array.from({ length: n }, (_, i) => i);
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          return arr;
        }

        // ── JP SESSION PERSISTENCE ───────────────────────────────
        // Saves the full in-progress JP game so a page refresh can resume it.
        function _jpSaveKey() {
          return _getCdPrefix() + "jp_session_v1";
        }

        function jpSaveSession() {
          if (!jpActive && !jpPhase1Result) return; // nothing worth saving
          const mode =
            window._jpCurrentMode ||
            (jpPhase1Result && jpPhase1Result.mode) ||
            (window._jpRoomSnap && window._jpRoomSnap.mode) ||
            "normal";
          const isHard = mode === "hard";

          // Capture current Phase 1 input values if we're still in Phase 1
          let writtenAnswers = jpPhase1Result
            ? jpPhase1Result.writtenAnswers
            : null;
          if (!jpPhase1Result && jpActive) {
            if (isHard) {
              const qLen = window._jpHardQuestions
                ? window._jpHardQuestions.length
                : 10;
              writtenAnswers = [];
              for (let i = 0; i < qLen; i++) {
                const el = document.getElementById("jpInput" + i);
                writtenAnswers.push(el ? el.value : "");
              }
            } else {
              const set = SETS[jpSetIdx];
              if (set) {
                writtenAnswers = set.cards.map((_, i) => {
                  const el =
                    document.getElementById("jpInput" + i) ||
                    document.querySelector('.jp-input[data-card-idx="' + i + '"]');
                  return el ? el.value : "";
                });
              }
            }
          }
          try {
            const currentOrder =
              window._jpCardOrder && window._jpCardOrder.length
                ? window._jpCardOrder
                : jpCardOrder;
            const snapshot = {
              jpActive,
              mode,
              hardQuestions: window._jpHardQuestions || null,
              jpSetIdx,
              jpCardOrder: currentOrder,
              jpTimeLeft: Math.max(0, jpTimeLeft),
              jpSelectedCards,
              jpPhase1Result,
              writtenAnswers, // live Phase 1 typing (may differ from jpPhase1Result)
              jpSessionStart,
              phase: jpPhase1Result
                ? document.getElementById("jpPhase3").style.display !== "none"
                  ? 3
                  : 2
                : 1,
              savedAt: Date.now(),
            };
            localStorage.setItem(_jpSaveKey(), JSON.stringify(snapshot));
          } catch (e) {}
        }

        function jpClearSession() {
          try {
            localStorage.removeItem(_jpSaveKey());
          } catch (e) {}
        }

        function jpLoadSession() {
          try {
            const raw = localStorage.getItem(_jpSaveKey());
            if (!raw) return null;
            const s = JSON.parse(raw);
            // Discard stale sessions older than 10 minutes (well past the 3-min timer)
            if (!s || Date.now() - s.savedAt > 10 * 60 * 1000) {
              jpClearSession();
              return null;
            }
            return s;
          } catch (e) {
            return null;
          }
        }

        function jpUpdateEntryStats() {
          const mine = jackpotEntries.filter(
            (e) => e.playerId === window._currentPlayerId,
          );
          document.getElementById("jpStatSubs").textContent = mine.length;
          const distinctSets = new Set(
            mine
              .map((e) => e.setIdx)
              .filter((s) => typeof s === "number" && s >= 0),
          ).size;
          document.getElementById("jpStatSets").textContent = distinctSets;
        }

        // openJP / closeJP / jpResumeUI / jpTryRestore (old solo entry, resume, and
        // restore-on-refresh logic) removed — new CB-style room entry lands in step 2.

        function jpStartTimer(resume) {
          // resume=true  → keep existing jpTimeLeft (restoring after a page refresh)
          // resume=false → reset to full jpRoundDuration (fresh game)
          jpClearTimer();
          if (!resume) jpTimeLeft = jpRoundDuration;
          jpRenderTimer();
          jpTimerInterval = setInterval(() => {
            jpTimeLeft--;
            jpRenderTimer();
            // Autosave every 5 seconds so a refresh loses at most 5s of typing
            if (jpTimeLeft % 5 === 0) jpSaveSession();
            if (jpTimeLeft <= 0) {
              jpClearTimer();
              if (jpActive) jpAutoFinish(); // time's up — submit whatever progress exists
            }
          }, 1000);
        }

        function jpClearTimer() {
          if (jpTimerInterval) {
            clearInterval(jpTimerInterval);
            jpTimerInterval = null;
          }
        }

        function jpRenderTimer() {
          const el = document.getElementById("jpTimerDisplay");
          if (!el) return;
          const t = Math.max(0, jpTimeLeft);
          const m = Math.floor(t / 60);
          const s = t % 60;
          el.textContent = m + ":" + (s < 10 ? "0" : "") + s;
          el.classList.toggle("warning", t <= 60 && t > 20);
          el.classList.toggle("danger", t <= 20);
        }

        function jpCapturePhase1Answers() {
          const mode =
            window._jpCurrentMode ||
            (window._jpRoomSnap && window._jpRoomSnap.mode) ||
            "normal";
          const isHard = mode === "hard";

          if (isHard) {
            const questions = window._jpHardQuestions || [];
            const writtenAnswers = [];
            let correctCount = 0;
            for (let i = 0; i < questions.length; i++) {
              const inputEl = document.getElementById("jpInput" + i);
              const val = inputEl ? inputEl.value.trim() : "";
              writtenAnswers.push(val);
              const targetName = questions[i] ? questions[i].name : "";
              const isMatch =
                !!(val && _normJpName(val) === _normJpName(targetName));
              if (isMatch) correctCount++;
              if (inputEl) inputEl.disabled = true;
            }
            jpPhase1Result = {
              mode: "hard",
              correctCount,
              total: questions.length,
              writtenAnswers,
              questions: questions.slice(),
            };
            return;
          }

          const set = SETS[jpSetIdx];
          const writtenAnswers = [];
          let correctCount = 0;

          // Check each card in 0..set.cards.length-1 order (Card 1 to 10 in normal sequence).
          // Input box for Card i is linked via id="jpInput" + i (or data-card-idx=i).
          // Player's answer for that card must match Card i's name specifically.
          for (let i = 0; i < set.cards.length; i++) {
            const inputEl =
              document.getElementById("jpInput" + i) ||
              document.querySelector('.jp-input[data-card-idx="' + i + '"]');
            const val = inputEl ? inputEl.value.trim() : "";
            writtenAnswers.push(val);

            const targetName = set.cards[i] ? set.cards[i].name : "";
            const isMatch =
              !!(val && _normJpName(val) === _normJpName(targetName));
            if (isMatch) {
              correctCount++;
            }
            // Intentionally NOT marking inputs as correct/wrong — only the admin
            // should ever see how many the player got right.
            if (inputEl) inputEl.disabled = true;
          }

          jpPhase1Result = {
            mode: "normal",
            correctCount,
            total: set.cards.length,
            writtenAnswers,
          };
        }

        function jpSubmitPhase1(auto) {
          if (!jpActive) return;
          // NOTE: timer keeps running — it also covers Phase 2 (card picking)
          jpCapturePhase1Answers();

          const fb = document.getElementById("jpFeedback1");
          fb.className = "jj-feedback correct";
          fb.innerHTML =
            (auto ? "⏰ Time's up! " : "✅ ") +
            "Answers locked in! Now pick the cards you need most…";
          fb.style.display = "";

          SFX.click && SFX.click();
          jpSaveSession(); // persist phase change so refresh lands in Phase 2

          setTimeout(jpGoToPhase2, 1400);
        }

        // Called when the timer hits 0, whether the player is still on Phase 1
        // (writing answers) or Phase 2 (picking cards). Whatever progress exists
        // gets sent to the admin automatically.
        // reason — optional; defaults to a plain timeout (only trigger left now that
        // admin pausing has been removed entirely).
        function jpAutoFinish(reason) {
          if (!jpActive) return;
          jpClearTimer();
          if (!jpPhase1Result) {
            jpCapturePhase1Answers(); // lock in whatever they'd typed so far
          }
          jpFinalizeSubmission(true, reason);
        }

        // jpForceEndByAdmin() removed — admin pausing no longer applies to JP.

        function jpGoToPhase2() {
          document.getElementById("jpPhase1").style.display = "none";
          document.getElementById("jpPhase2").style.display = "";
          jpRenderPickGrid();
          jpSaveSession(); // now in Phase 2
        }

        function jpRenderPickGrid() {
          const grid = document.getElementById("jpPickGrid");
          grid.innerHTML = "";
          SETS.forEach((set, si) => {
            const title = document.createElement("div");
            title.className = "jp-pick-set-title";
            title.textContent = set.name;
            grid.appendChild(title);
            set.cards.forEach((card, ci) => {
              const isSel = jpSelectedCards.some(
                (c) => c.setIdx === si && c.cardIdx === ci,
              );
              const isGold = !!card.gold;
              const div = document.createElement("div");
              div.className =
                "jp-pick-card" +
                (isGold ? " gold-slot" : "") +
                (isSel ? " selected" : "");
              div.innerHTML =
                (isSel ? '<span class="jp-pick-check">✅</span>' : "") +
                (isGold ? '<span class="jp-pick-gold-tag">🌟</span>' : "") +
                `<div class="jp-pick-emoji">${card.emoji}</div>` +
                `<div class="jp-pick-name">${card.name}</div>`;
              div.onclick = () => jpToggleCard(si, ci);
              grid.appendChild(div);
            });
          });
          const jpNormalCount = jpSelectedCards.filter(
            (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          const jpGoldCount = jpSelectedCards.filter(
            (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          document.getElementById("jpPickCount").textContent = jpNormalCount;
          const jpGoldCountEl = document.getElementById("jpPickCountGold");
          if (jpGoldCountEl) jpGoldCountEl.textContent = jpGoldCount;
        }

        function jpToggleCard(si, ci) {
          const idx = jpSelectedCards.findIndex(
            (c) => c.setIdx === si && c.cardIdx === ci,
          );
          if (idx !== -1) {
            jpSelectedCards.splice(idx, 1);
          } else {
            const isGold = !!SETS[si].cards[ci].gold;
            if (isGold) {
              const goldCount = jpSelectedCards.filter(
                (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (goldCount >= 2) {
                showToast("You can only pick 2 gold cards!");
                return;
              }
            } else {
              const normalCount = jpSelectedCards.filter(
                (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (normalCount >= 10) {
                showToast("You can only pick 10 normal cards!");
                return;
              }
            }
            jpSelectedCards.push({ setIdx: si, cardIdx: ci });
          }
          jpRenderPickGrid();
          jpSaveSession(); // persist card selection change
        }

        function jpSubmitEntry() {
          if (!profile.name || !profile.town) {
            showToast("⚡ Please set your profile name & town first!");
            setTimeout(
              () =>
                switchTab("profile", document.querySelectorAll(".tab-btn")[5]),
              600,
            );
            return;
          }
          if (jpSelectedCards.length === 0) {
            showToast("Please pick at least 1 card!");
            return;
          }
          jpClearTimer();
          jpFinalizeSubmission(false);
        }

        // Shared submission logic for both manual submit and auto-timeout.
        // auto=true means whatever progress exists (typed answers + selected cards,
        // even if none) is sent to the admin without the player tapping Submit.
        // reason distinguishes WHY auto submission happened: 'paused' means the
        // admin paused the event mid-round; anything else (or omitted) means the
        // countdown timer simply ran out.
        function jpFinalizeSubmission(auto, reason) {
          jpActive = false;
          jpClearTimer();
          jpClearSession(); // no longer need the saved session
          const isDemoRound = !!(window._jpRoomSnap && window._jpRoomSnap.demo);

          // Compute elapsed time up front so it can be stored on the round-log entry
          // itself (used to rank the admin's Event Logs leaderboard-style) as well as
          // submitted to the public leaderboard below.
          const jpElapsedSecs = Math.round(
            (Date.now() - (jpSessionStart || Date.now())) / 1000,
          );

          if (isDemoRound) {
            // Demo rounds are practice only — no admin entry, no leaderboard score.
            document.getElementById("jpPhase1").style.display = "none";
            document.getElementById("jpPhase2").style.display = "none";
            document.getElementById("jpPhase3").style.display = "";
            const timerElDemo = document.getElementById("jpTimerDisplay");
            if (timerElDemo) timerElDemo.style.display = "none";
            document.getElementById("jpDoneMsg").innerHTML =
              `🎓 Demo round complete!<br>You picked <strong>${jpSelectedCards.length}</strong> card(s) — this was practice only, so nothing was submitted or saved.`;
            const jpFullLb = document.getElementById("jpFullLeaderboard");
            if (jpFullLb) jpFullLb.style.display = "none";
            SFX.notify && SFX.notify();
            return;
          }

          const mode =
            window._jpCurrentMode ||
            (jpPhase1Result && jpPhase1Result.mode) ||
            (window._jpRoomSnap && window._jpRoomSnap.mode) ||
            "normal";
          const isHard = mode === "hard";
          const set = SETS[jpSetIdx];
          const hardQuestions =
            isHard
              ? window._jpHardQuestions ||
                (jpPhase1Result && jpPhase1Result.questions) ||
                []
              : null;
          const entry = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            playerName: profile.name || "Unknown",
            townName: profile.town || "",
            avatar: profile.avatar,
            photoURL: _lightPhoto(profile.photoURL),
            playerId: window._currentPlayerId || "",
            mode: isHard ? "hard" : "normal",
            hardQuestions,
            setIdx: isHard ? -1 : jpSetIdx,
            setName: isHard
              ? "🔥 Hard Mode (All Sets)"
              : set
                ? set.name
                : "Jackpot Set",
            totalCards: jpPhase1Result
              ? jpPhase1Result.total
              : isHard
                ? 10
                : set
                  ? set.cards.length
                  : 10,
            correctCount: jpPhase1Result ? jpPhase1Result.correctCount : 0,
            writtenAnswers: jpPhase1Result ? jpPhase1Result.writtenAnswers : [],
            cardOrder: isHard
              ? null
              : window._jpCardOrder && window._jpCardOrder.length
                ? window._jpCardOrder.slice()
                : jpCardOrder
                  ? jpCardOrder.slice()
                  : [],
            requiredCards: jpSelectedCards.map((c) => ({
              setIdx: c.setIdx,
              cardIdx: c.cardIdx,
              name: SETS[c.setIdx].cards[c.cardIdx].name,
              emoji: SETS[c.setIdx].cards[c.cardIdx].emoji,
            })),
            status: "new", // no coins are ever granted for this event
            timedOut: reason !== "paused" && !!auto,
            pausedByAdmin: reason === "paused",
            timeSecs: jpElapsedSecs,
            timestamp: new Date().toISOString(),
          };
          jackpotEntries.unshift(entry);
          window.saveJackpotEntries(entry);

          const newJpCardReqs = [];
          if (jpSelectedCards.length > 0) {
            jpSelectedCards.forEach((c, idx) => {
              const cardSet = SETS[c.setIdx];
              const cardObj = cardSet && cardSet.cards && cardSet.cards[c.cardIdx];
              const isGold = !!(cardObj && cardObj.gold);
              const cardReq = {
                id: `${entry.id}-c${idx}`,
                playerName: entry.playerName,
                townName: entry.townName,
                avatar: entry.avatar,
                photoURL: entry.photoURL,
                playerId: entry.playerId,
                setIdx: c.setIdx,
                cardIdx: c.cardIdx,
                note: `Won in Jackpot Event (${entry.setName})`,
                status: "pending",
                coinsSpent: 0,
                free: true,
                gold: isGold,
                source: "jackpot",
                roundId: entry.id,
                score: entry.correctCount,
                timeSecs: jpElapsedSecs,
                timestamp: entry.timestamp,
                _inFlight: true,
                _clientCreatedAt: Date.now(),
              };
              cardRequests.unshift(cardReq);
              if (window._cardReqKnownIds) window._cardReqKnownIds.add(cardReq.id);
              newJpCardReqs.push(cardReq);
            });
            saveProgress();
            if (typeof window.addMultipleSharedCardRequests === "function") {
              window.addMultipleSharedCardRequests(newJpCardReqs).then(() => {
                newJpCardReqs.forEach((r) => { r._inFlight = false; });
              });
            } else if (typeof window.saveSharedRequests === "function") {
              window.saveSharedRequests();
            }
          }

          SFX.notify && SFX.notify();

          document.getElementById("jpPhase1").style.display = "none";
          document.getElementById("jpPhase2").style.display = "none";
          document.getElementById("jpPhase3").style.display = "";
          const timerEl = document.getElementById("jpTimerDisplay");
          if (timerEl) timerEl.style.display = "none";

          let jpDoneHtml;
          if (reason === "paused") {
            jpDoneHtml = `🔒 This event was paused by your DA leader — your progress was sent automatically.<br>You requested <strong>${entry.requiredCards.length}</strong> card(s) from the <strong>${entry.setName}</strong> challenge.${entry.requiredCards.length === 0 ? '<br><small style="opacity:.7">You hadn\'t picked any cards yet — try again once the event resumes!</small>' : ""}`;
          } else if (auto) {
            jpDoneHtml = `⏰ Time's up! Your progress was sent to your DA leader automatically.<br>You requested <strong>${entry.requiredCards.length}</strong> card(s) from the <strong>${entry.setName}</strong> challenge.${entry.requiredCards.length === 0 ? '<br><small style="opacity:.7">You didn\'t get to pick any cards in time — try again tomorrow!</small>' : ""}`;
          } else {
            jpDoneHtml = `🎉 Submission sent to your DA leader!<br>You requested <strong>${entry.requiredCards.length}</strong> card(s) from the <strong>${entry.setName}</strong> challenge.`;
          }
          document.getElementById("jpDoneMsg").innerHTML =
            jpDoneHtml +
            `<br><small style="opacity:.75">📨 Your submission has been sent to your DA leader to deliver your cards!</small>`;

          jpUpdateEntryStats();
        }

        // Scramble a card name: shuffle letters within each word separately (words never mix)
        function scrambleName(name) {
          const words = name.split(" ");
          const scrambled = words.map((w) => {
            if (w.length < 2) return w;
            const letters = w.split("");
            let shuffled,
              attempts = 0;
            do {
              for (let i = letters.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [letters[i], letters[j]] = [letters[j], letters[i]];
              }
              shuffled = letters.join("");
              attempts++;
            } while (
              shuffled.toUpperCase() === w.toUpperCase() &&
              attempts < 20
            );
            return shuffled;
          });
          return scrambled.join(" ").toUpperCase();
        }

        // Pick one random "decoy" set name, different from the real one
        function jjDecoySetName(realSetIdx) {
          const otherIdxs = SETS.map((s, i) => i).filter(
            (i) => i !== realSetIdx,
          );
          const pick = otherIdxs[Math.floor(Math.random() * otherIdxs.length)];
          return SETS[pick].name;
        }

        // ── JJ SESSION PERSISTENCE ───────────────────────────────
        // Saves the full in-progress JJ round (quiz answers + card picks) so that
        // exiting by mistake (Back button) or a page refresh can resume it right
        // where the player left off. Mirrors jpSaveSession/jpLoadSession/jpTryRestore.
        function _jjSaveKey() {
          return _getCdPrefix() + "jj_session_v1";
        }

        function jjSaveSession() {
          if (!jjRoundInProgress) return; // nothing worth saving
          try {
            const p2visible =
              document.getElementById("jjPhase2") &&
              document.getElementById("jjPhase2").style.display !== "none";
            const snapshot = {
              mode: window._jjCurrentMode || "normal",
              jjQueue,
              jjQNum,
              jjCorrectCount,
              jjWrongCount,
              jjStreak,
              jjSelectedCards,
              jjAnswerLog,
              jjTimeLeft: Math.max(0, jjTimeLeft),
              jjSessionStart,
              phase: p2visible ? 2 : 1,
              savedAt: Date.now(),
            };
            localStorage.setItem(_jjSaveKey(), JSON.stringify(snapshot));
          } catch (e) {}
        }

        function jjClearSession() {
          try {
            localStorage.removeItem(_jjSaveKey());
          } catch (e) {}
        }

        // openJJ / closeJJ / jjResumeUI / jjTryRestore / jjLoadSession (old solo
        // entry, resume, and restore-on-refresh logic) removed — new CB-style room
        // entry lands in step 2 and doesn't read a saved session back in.

        function jjNextQuestion() {
          if (jjQNum >= jjQueue.length) {
            jjRoundEnd();
            return;
          }

          jjCurrent = jjQueue[jjQNum];
          jjHintUsed = false;
          jjAnswered = false;

          const mode =
            window._jjCurrentMode ||
            (window._jjRoomSnap && window._jjRoomSnap.mode) ||
            window._jjLobbySelectedMode ||
            "normal";
          const isHard = mode === "hard";

          // UI updates
          const emojiEl = document.getElementById("jjCardEmoji");
          if (emojiEl) {
            if (isHard) {
              emojiEl.style.display = "none";
              emojiEl.textContent = "";
            } else {
              emojiEl.style.display = "";
              emojiEl.textContent = jjCurrent.emoji;
            }
          }
          const puzzleTypeEl = document.getElementById("jjPuzzleType");
          if (puzzleTypeEl) {
            puzzleTypeEl.textContent = isHard
              ? "🔥 UNSCRAMBLE THE CARD NAME (HARD MODE)"
              : "🔀 UNSCRAMBLE THE CARD NAME";
          }
          document.getElementById("jjScrambledWord").textContent = scrambleName(
            jjCurrent.name,
          );
          document.getElementById("jjHintStrip").style.display = "none";
          document.getElementById("jjFeedback").style.display = "none";
          const inputEl = document.getElementById("jjAnswerInput");
          if (inputEl) {
            inputEl.value = "";
            inputEl.dataset.prev = "";
            inputEl.disabled = false;
            if (typeof window.jjAttachSuggestionBlocker === "function") {
              window.jjAttachSuggestionBlocker(inputEl);
            }
          }
          setTimeout(() => {
            const input = document.getElementById("jjAnswerInput");
            if (input) {
              input.focus({
                preventScroll: true,
              });
            }
          }, 250);

          // Two set names shown for reference — real + a random decoy, shuffled left/right
          const realSetName = jjCurrent.setName;
          const decoySetName = jjDecoySetName(jjCurrent.setIdx);
          const badgeA = document.getElementById("jjSetBadgeA");
          const badgeB = document.getElementById("jjSetBadgeB");
          if (Math.random() < 0.5) {
            badgeA.textContent = realSetName;
            badgeB.textContent = decoySetName;
          } else {
            badgeA.textContent = decoySetName;
            badgeB.textContent = realSetName;
          }

          // Progress
          const pct = (jjQNum / jjQueue.length) * 100;
          document.getElementById("jjProgressFill").style.width = pct + "%";
          document.getElementById("jjProgressLabel").textContent =
            `Question ${jjQNum + 1} / ${jjQueue.length}`;

          // Streak bar
          const streakBar = document.getElementById("jjStreakBar");
          if (jjStreak >= 2) {
            streakBar.style.display = "";
            document.getElementById("jjStreakCount").textContent = jjStreak;
          } else {
            streakBar.style.display = "none";
          }

          jjUpdateScoreboard();
        }

        function checkJJAnswer() {
          if (!jjActive || jjAnswered) return;
          const raw = document.getElementById("jjAnswerInput").value.trim();
          if (!raw) return;
          jjSubmitAnswer(raw);
        }

        function jjSkip() {
          if (!jjActive || jjAnswered) return;
          jjSubmitAnswer(null);
        }

        function jjSubmitAnswer(raw) {
          jjAnswered = true;
          jjQNum++;
          jjTotalAnswered++;

          document.getElementById("jjAnswerInput").disabled = true;

          const correct = jjCurrent.name;
          const isRight =
            raw !== null && raw.toUpperCase() === correct.toUpperCase();

          // Per-question outcome is intentionally never shown to the player —
          // no "Correct!"/"Wrong" reveal. Scoring still happens silently in the
          // background and the round proceeds straight to the next question.
          if (isRight) {
            jjStreak++;
            jjCorrectCount++;
          } else {
            jjStreak = 0;
            jjWrongCount++;
          }

          jjAnswerLog.push({
            cardName: correct,
            emoji: jjCurrent.emoji,
            typed: raw || "",
            correct: isRight,
          });

          jjUpdateScoreboard();
          jjSaveStats();
          jjSaveSession();
          updateHUD();

          setTimeout(() => {
            jjNextQuestion();
          }, 350);
        }

        function jjHint() {
          if (!jjActive || jjAnswered || jjHintUsed) return;
          const isDemoRound = window._jjRoomSnap && window._jjRoomSnap.demo;
          if (!isDemoRound) {
            if (coins < JJ_HINT_COST) {
              showToast(`Need ${JJ_HINT_COST} 🪙 for a hint!`);
              return;
            }
            coins -= JJ_HINT_COST;
            logCoinTx(-JJ_HINT_COST, "💡 Jumbled Jackpot hint");
          }
          jjHintUsed = true;
          updateHUD();
          const name = jjCurrent.name;
          const words = name.split(" ");
          document.getElementById("jjHintText").textContent =
            words
              .map((w) => w[0].toUpperCase() + "_".repeat(w.length - 1))
              .join(" ") + `  (${name.length} letters)`;
          document.getElementById("jjHintStrip").style.display = "";
          document.getElementById("jjCoinsDisplay").textContent =
            formatCoins(coins);
        }

        function jjUpdateScoreboard() {
          document.getElementById("jjCorrect").textContent = jjCorrectCount;
          document.getElementById("jjWrong").textContent = jjWrongCount;
          document.getElementById("jjCoinsDisplay").textContent =
            formatCoins(coins);
        }

        function jjRoundEnd() {
          jjActive = false;
          // NOTE: timer keeps running — it also covers Phase 2 (card picking)
          jjSaveStats();
          updateHUD();

          document.getElementById("jjStreakBar").style.display = "none";

          // Move to Phase 2: pick required cards (mirrors the Jackpot Event flow)
          const summaryEl = document.getElementById("jjPhase2Summary");
          if (summaryEl) {
            summaryEl.innerHTML =
              `🎉 Round complete!<br>` +
              `Now pick up to 10 cards from any set — these are the cards you'll ask your DA leader to give you in the real Township game!<br>` +
              `<span style="font-size:.78rem;color:rgba(255,100,100,.8);font-weight:700;">⏰ The clock is still running — if it hits 0, your current picks are sent automatically!</span>`;
          }
          document.getElementById("jjPhase1").style.display = "none";
          document.getElementById("jjPhase2").style.display = "";
          jjRenderPickGrid();
          jjSaveSession(); // now in Phase 2
        }

        function jjRenderPickGrid() {
          const grid = document.getElementById("jjPickGrid");
          grid.innerHTML = "";
          SETS.forEach((set, si) => {
            const title = document.createElement("div");
            title.className = "jp-pick-set-title";
            title.textContent = set.name;
            grid.appendChild(title);
            set.cards.forEach((card, ci) => {
              const isSel = jjSelectedCards.some(
                (c) => c.setIdx === si && c.cardIdx === ci,
              );
              const isGold = !!card.gold;
              const div = document.createElement("div");
              div.className =
                "jp-pick-card" +
                (isGold ? " gold-slot" : "") +
                (isSel ? " selected" : "");
              div.innerHTML =
                (isSel ? '<span class="jp-pick-check">✅</span>' : "") +
                (isGold ? '<span class="jp-pick-gold-tag">🌟</span>' : "") +
                `<div class="jp-pick-emoji">${card.emoji}</div>` +
                `<div class="jp-pick-name">${card.name}</div>`;
              div.onclick = () => jjToggleCard(si, ci);
              grid.appendChild(div);
            });
          });
          const jjNormalCount = jjSelectedCards.filter(
            (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          const jjGoldCount = jjSelectedCards.filter(
            (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
          ).length;
          document.getElementById("jjPickCount").textContent = jjNormalCount;
          const jjGoldCountEl = document.getElementById("jjPickCountGold");
          if (jjGoldCountEl) jjGoldCountEl.textContent = jjGoldCount;
        }

        function jjToggleCard(si, ci) {
          const idx = jjSelectedCards.findIndex(
            (c) => c.setIdx === si && c.cardIdx === ci,
          );
          if (idx !== -1) {
            jjSelectedCards.splice(idx, 1);
          } else {
            const isGold = !!SETS[si].cards[ci].gold;
            if (isGold) {
              const goldCount = jjSelectedCards.filter(
                (c) => SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (goldCount >= 2) {
                showToast("You can only pick 2 gold cards!");
                return;
              }
            } else {
              const normalCount = jjSelectedCards.filter(
                (c) => !SETS[c.setIdx].cards[c.cardIdx].gold,
              ).length;
              if (normalCount >= 10) {
                showToast("You can only pick 10 normal cards!");
                return;
              }
            }
            jjSelectedCards.push({ setIdx: si, cardIdx: ci });
          }
          jjRenderPickGrid();
          jjSaveSession(); // persist card selection change
        }

        function jjSubmitEntry() {
          if (!profile.name || !profile.town) {
            showToast("⚡ Please set your profile name & town first!");
            setTimeout(
              () =>
                switchTab("profile", document.querySelectorAll(".tab-btn")[5]),
              600,
            );
            return;
          }
          if (jjSelectedCards.length === 0) {
            showToast("Please pick at least 1 card!");
            return;
          }
          jjFinalizeSubmission();
        }

        // Logs the round + card picks for the admin's Event Logs view (mirrors Jackpot
        // Event entries) and submits the score to the leaderboard. No coins are ever
        // granted for this event — score is based on correct answers only.
        // auto   — true when this was NOT a manual "Submit" tap (e.g. force-ended)
        // reason — optional string describing why an auto submission happened;
        //          currently only 'paused' (admin paused the event mid-round) is used.
        function jjFinalizeSubmission(auto, reason) {
          jjRoundInProgress = false;
          jjClearTimer();
          jjHideTimer();
          jjClearSession(); // round is done — no longer need the saved session
          const jjElapsedSecs = Math.round(
            (Date.now() - (jjSessionStart || Date.now())) / 1000,
          );
          const isDemoRound = !!(window._jjRoomSnap && window._jjRoomSnap.demo);

          if (isDemoRound) {
            // Demo rounds are practice only — no admin entry, no leaderboard score,
            // no coins involved. Just show the picks and stop.
            document.getElementById("jjPhase1").style.display = "none";
            document.getElementById("jjPhase2").style.display = "none";
            document.getElementById("jjPhase3").style.display = "";
            document.getElementById("jjDoneMsg").innerHTML =
              `🎓 Demo round complete!<br>You picked <strong>${jjSelectedCards.length}</strong> card(s) — this was practice only, so nothing was submitted or saved.`;
            const jjFullLb = document.getElementById("jjFullLeaderboard");
            if (jjFullLb) jjFullLb.style.display = "none";
            SFX.notify && SFX.notify();
            return;
          }

          const mode =
            window._jjCurrentMode ||
            (window._jjRoomSnap && window._jjRoomSnap.mode) ||
            window._jjLobbySelectedMode ||
            "normal";
          const isHard = mode === "hard";
          const jjEntry = {
            id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
            playerName: profile.name || "Unknown",
            townName: profile.town || "",
            avatar: profile.avatar,
            photoURL: _lightPhoto(profile.photoURL),
            playerId: window._currentPlayerId || "",
            mode: isHard ? "hard" : "normal",
            correctCount: jjCorrectCount,
            wrongCount: jjWrongCount,
            streak: jjStreak,
            answers: jjAnswerLog,
            requiredCards: jjSelectedCards.map((c) => ({
              setIdx: c.setIdx,
              cardIdx: c.cardIdx,
              name: SETS[c.setIdx].cards[c.cardIdx].name,
              emoji: SETS[c.setIdx].cards[c.cardIdx].emoji,
            })),
            status: "new", // no coins are ever granted for this event
            pausedByAdmin: reason === "paused",
            timeSecs: jjElapsedSecs,
            timestamp: new Date().toISOString(),
          };
          jjEntries.unshift(jjEntry);
          window.saveJJEntries(jjEntry);

          const newJjCardReqs = [];
          if (jjSelectedCards.length > 0) {
            jjSelectedCards.forEach((c, idx) => {
              const cardSet = SETS[c.setIdx];
              const cardObj = cardSet && cardSet.cards && cardSet.cards[c.cardIdx];
              const isGold = !!(cardObj && cardObj.gold);
              const cardReq = {
                id: `${jjEntry.id}-c${idx}`,
                playerName: jjEntry.playerName,
                townName: jjEntry.townName,
                avatar: jjEntry.avatar,
                photoURL: jjEntry.photoURL,
                playerId: jjEntry.playerId,
                setIdx: c.setIdx,
                cardIdx: c.cardIdx,
                note: `Won in Jumbled Jackpot (${jjCorrectCount} correct)`,
                status: "pending",
                coinsSpent: 0,
                free: true,
                gold: isGold,
                source: "jumbled_jackpot",
                roundId: jjEntry.id,
                score: jjCorrectCount,
                timeSecs: jjElapsedSecs,
                timestamp: jjEntry.timestamp,
                _inFlight: true,
                _clientCreatedAt: Date.now(),
              };
              cardRequests.unshift(cardReq);
              if (window._cardReqKnownIds) window._cardReqKnownIds.add(cardReq.id);
              newJjCardReqs.push(cardReq);
            });
            saveProgress();
            if (typeof window.addMultipleSharedCardRequests === "function") {
              window.addMultipleSharedCardRequests(newJjCardReqs).then(() => {
                newJjCardReqs.forEach((r) => { r._inFlight = false; });
              });
            } else if (typeof window.saveSharedRequests === "function") {
              window.saveSharedRequests();
            }
          }

          SFX.notify && SFX.notify();

          // Force-hide Phase 1 too — a mid-quiz admin pause finalizes straight from
          // Phase 1, which the normal manual-submit flow never has to worry about.
          document.getElementById("jjPhase1").style.display = "none";
          document.getElementById("jjPhase2").style.display = "none";
          document.getElementById("jjPhase3").style.display = "";

          document.getElementById("jjDoneMsg").innerHTML =
            (reason === "paused"
              ? `🔒 This event was paused by your DA leader — your round was submitted automatically.<br>You requested <strong>${jjEntry.requiredCards.length}</strong> card(s) from your Jumbled Jackpot round.`
              : reason === "timeout"
                ? `⏰ Time's up! Your round was submitted automatically.<br>You requested <strong>${jjEntry.requiredCards.length}</strong> card(s) from your Jumbled Jackpot round.`
                : `🎉 Submission sent to your DA leader!<br>You requested <strong>${jjEntry.requiredCards.length}</strong> card(s) from your Jumbled Jackpot round.`) +
            `<br><small style="opacity:.75">📨 Your submission has been sent to your DA leader to deliver your cards!</small>`;
        }

        // Called when the round timer hits 0, whether the player is still on Phase 1
        // (answering the quiz) or Phase 2 (picking cards). Whatever progress exists
        // gets sent to the admin automatically — mirrors the Jackpot Event's jpAutoFinish.
        // reason — optional; defaults to a plain timeout (only trigger left now that
        // admin pausing has been removed entirely).
        function jjAutoFinish(reason) {
          if (!jjRoundInProgress) return;
          jjClearTimer();
          jjHideTimer();
          const streakBarEl = document.getElementById("jjStreakBar");
          if (streakBarEl) streakBarEl.style.display = "none";
          jjActive = false;
          jjSaveStats();
          updateHUD();
          jjFinalizeSubmission(true, reason || "timeout");
        }

        // jjForceEndByAdmin() removed — admin pausing no longer applies to JJ.

        // ─── JJ ROUND TIMER (spans Phase 1 quiz + Phase 2 card picking) ───────────
        const JJ_ROUND_TIME_LIMIT = 300; // 5 minutes total, covers BOTH phases (default/fallback)
        const TIMER_RADIUS = 22; // must match SVG r attribute
        const TIMER_CIRCUMF = 2 * Math.PI * TIMER_RADIUS; // ≈ 138.23

        let jjTimerInterval = null;
        let jjTimeLeft = JJ_ROUND_TIME_LIMIT;
        // Actual duration used for the current round — normally equals JJ_ROUND_TIME_LIMIT,
        // but a room host can override it via the lobby timer picker (see jjBeginLocalRound).
        let jjRoundDuration = JJ_ROUND_TIME_LIMIT;

        // Starts the single round-long countdown. Called once from openJJ() —
        // NOT restarted between questions or on the Phase 1 → Phase 2 transition,
        // so the same clock covers answering the quiz and picking cards.
        function jjStartTimer(resume) {
          // resume=true  → keep existing jjTimeLeft (restoring after exiting/refreshing)
          // resume=false → reset to full jjRoundDuration (fresh round)
          jjClearTimer();
          if (!resume) jjTimeLeft = jjRoundDuration;
          jjRenderTimer(jjTimeLeft);

          jjTimerInterval = setInterval(() => {
            jjTimeLeft--;
            jjRenderTimer(jjTimeLeft);
            // Autosave every 5 seconds so exiting/refreshing loses at most 5s of progress
            if (jjTimeLeft % 5 === 0) jjSaveSession();
            if (jjTimeLeft <= 0) {
              jjClearTimer();
              SFX.bomb && SFX.bomb();
              jjAutoFinish("timeout"); // time's up — submit whatever progress exists
            }
          }, 1000);
        }

        function jjClearTimer() {
          if (jjTimerInterval) {
            clearInterval(jjTimerInterval);
            jjTimerInterval = null;
          }
        }

        function jjRenderTimer(secs) {
          const arc = document.getElementById("jjTimerArc");
          const numEl = document.getElementById("jjTimerNum");
          const msgEl = document.getElementById("jjTimerMsg");
          if (!arc || !numEl) return;

          const t = Math.max(0, secs);
          const pct = Math.max(0, secs / jjRoundDuration);
          const offset = TIMER_CIRCUMF * (1 - pct);

          arc.style.strokeDashoffset = offset;
          const m = Math.floor(t / 60);
          const s = t % 60;
          numEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;

          // Colour states
          const isWarning = t <= 60 && t > 20;
          const isDanger = t <= 20;

          arc.classList.toggle("warning", isWarning);
          arc.classList.toggle("danger", isDanger);
          numEl.classList.toggle("warning", isWarning);
          numEl.classList.toggle("danger", isDanger);

          if (isDanger && msgEl) msgEl.textContent = "⚠️ Hurry up!";
          else if (isWarning && msgEl) msgEl.textContent = "⏳ Running low…";
          else if (msgEl) msgEl.textContent = "Time remaining";
        }

        function jjHideTimer() {
          const wrap = document.querySelector(".jj-timer-wrap");
          if (wrap) wrap.style.display = "none";
        }

        function jjShowTimer() {
          const wrap = document.querySelector(".jj-timer-wrap");
          if (wrap) wrap.style.display = "";
        }

        // Initialise entry stats on load
        jjUpdateEntryStats();
        jpUpdateEntryStats();

        // ═══════════════════════════════════════════════════════════
        // LEADERBOARD — render helpers & live listeners
        // ═══════════════════════════════════════════════════════════

        // Active live-listener unsubscribe functions
        let _jjLbUnsub = null;
        let _jpLbUnsub = null;

        // Format seconds as "1m 23s" or "45s"
        function _lbFmtTime(secs) {
          if (!secs || secs <= 0) return "—";
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return m > 0 ? `${m}m ${s}s` : `${s}s`;
        }

        // Build a rank medal string
        function _lbRankStr(rank) {
          if (rank === 1) return "🥇";
          if (rank === 2) return "🥈";
          if (rank === 3) return "🥉";
          return "#" + rank;
        }

        // Render leaderboard rows into a container element
        // entries: sorted array [{playerId, name, avatar, score, timeSecs}]
        // options: { scoreLabel, currentPid }
        function _lbRenderRows(containerEl, entries, options) {
          if (!containerEl) return;
          const { scoreLabel = "🪙 Coins", currentPid = "" } = options || {};
          if (!entries || entries.length === 0) {
            containerEl.innerHTML = `
      <div class="lb-empty">
        <span class="lb-e-icon">🔮</span>
        No entries yet — be the first to play!
      </div>`;
            return;
          }

          containerEl.innerHTML = "";

          // Detect ties: mark entries that share a score with the one above (same score, different time → tie on score)
          entries.forEach((entry, i) => {
            const rank = i + 1;
            const isMe = entry.playerId === currentPid;
            const isTie = i > 0 && entries[i - 1].score === entry.score;

            const row = document.createElement("div");
            let rowClass = "lb-row";
            if (rank === 1) rowClass += " lb-gold";
            else if (rank === 2) rowClass += " lb-silver";
            else if (rank === 3) rowClass += " lb-bronze";
            if (isMe) rowClass += " lb-me";
            row.className = rowClass;

            const rankClass =
              rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "rN";
            const tieBadge = isTie
              ? '<span class="lb-tie-badge">⚔️ TIE</span>'
              : "";

            row.innerHTML = `
      <div class="lb-rank ${rankClass}">${_lbRankStr(rank)}</div>
      <div class="lb-avatar">${avatarHTML(entry.avatar, entry.photoURL, entry.playerId, entry.name)}</div>
      <div class="lb-info">
        <div class="lb-name">${entry.name || "Unknown"}${isMe ? '<span class="lb-you-tag">YOU</span>' : ""}</div>
        <div class="lb-sub">${scoreLabel}</div>
      </div>
      ${tieBadge}
      <div class="lb-time-col">
        <div class="lb-time-val">${_lbFmtTime(entry.timeSecs)}</div>
        <div class="lb-time-lbl">time</div>
      </div>
      <div class="lb-score-col">
        <div class="lb-score-val">${entry.score}</div>
        <div class="lb-score-lbl">${rank <= 3 ? "⭐" : ""}</div>
      </div>
    `;
            containerEl.appendChild(row);
          });
        }

        // Wait for a window.__mod_ sentinel (same pattern as the bridge script)
        function _waitForMod(sentinel, fn, maxMs) {
          if (window[sentinel]) {
            fn();
            return;
          }
          const deadline = Date.now() + (maxMs || 5000);
          const t = setInterval(() => {
            if (window[sentinel]) {
              clearInterval(t);
              fn();
              return;
            }
            if (Date.now() > deadline) {
              clearInterval(t);
            }
          }, 80);
        }

        // Obsolete leaderboard functions replaced with safe no-ops
        function jjLoadInlineLeaderboard() {}
        function jpLoadInlineLeaderboard() {}
        function jjRefreshLeaderboard() {}
        function jpRefreshLeaderboard() {}
        function stopLbListeners() {}
        window.stopLbListeners = stopLbListeners;
        function startLbListeners() {}
        window.startLbListeners = startLbListeners;

// ═══════════════════════════════════════════════════════════
// ROR UI HANDLERS
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// ROR UI HANDLERS (Cumulative Multi-Image Picker up to 10 images)
// ═══════════════════════════════════════════════════════════
let rorSelectedFiles = [];
window.rorSelectedFiles = rorSelectedFiles;

window.handleRorFilesSelected = function(input) {
  const alertEl = document.getElementById('rorImageAlertMsg');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }

  if (!input || !input.files || input.files.length === 0) return;

  const incomingFiles = Array.from(input.files);
  // Clear input value so same files can be re-selected if removed
  input.value = '';

  const MAX_IMAGES = 10;
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  let rejectedOversized = [];
  let rejectedLimitCount = 0;
  let addedCount = 0;

  for (const file of incomingFiles) {
    if (file.size > MAX_FILE_SIZE) {
      rejectedOversized.push(file.name);
      continue;
    }
    if (rorSelectedFiles.length >= MAX_IMAGES) {
      rejectedLimitCount++;
      continue;
    }
    try {
      file._previewUrl = URL.createObjectURL(file);
    } catch(e) {}
    rorSelectedFiles.push(file);
    addedCount++;
  }

  const alertMsgs = [];
  if (rejectedOversized.length > 0) {
    alertMsgs.push(`⚠️ ${rejectedOversized.length} image(s) exceeded the 5 MB limit and were skipped: ${rejectedOversized.join(', ')}`);
  }
  if (rejectedLimitCount > 0) {
    alertMsgs.push(`⚠️ Maximum limit is 10 images. ${rejectedLimitCount} additional image(s) could not be added.`);
  }

  if (alertEl && alertMsgs.length > 0) {
    alertEl.style.display = 'block';
    alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
    alertEl.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    alertEl.style.color = '#fca5a5';
    alertEl.innerHTML = alertMsgs.join('<br>');
  }

  renderRorThumbnails();
};

window.previewRorImage = window.handleRorFilesSelected;

window.removeRorSelectedFile = function(index) {
  if (index >= 0 && index < rorSelectedFiles.length) {
    const removed = rorSelectedFiles.splice(index, 1)[0];
    if (removed && removed._previewUrl) {
      try { URL.revokeObjectURL(removed._previewUrl); } catch(e) {}
    }
  }
  const alertEl = document.getElementById('rorImageAlertMsg');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }
  renderRorThumbnails();
};

window.clearRorImage = function(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  rorSelectedFiles.forEach((f) => {
    if (f && f._previewUrl) {
      try { URL.revokeObjectURL(f._previewUrl); } catch(err) {}
    }
  });
  rorSelectedFiles = [];
  window.rorSelectedFiles = rorSelectedFiles;
  const input = document.getElementById('rorFileInput');
  if (input) input.value = '';
  const alertEl = document.getElementById('rorImageAlertMsg');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }
  renderRorThumbnails();
};

function renderRorThumbnails() {
  const container = document.getElementById('rorThumbnailsGrid');
  const countBadge = document.getElementById('rorImageCountBadge');
  const addBtn = document.getElementById('rorAddImageBtn');
  const addBtnText = document.getElementById('rorAddImageBtnText');

  if (!container) return;

  const count = rorSelectedFiles.length;

  if (countBadge) {
    countBadge.textContent = count === 0 ? 'Optional · 0/10' : `${count}/10 images`;
    countBadge.style.color = count >= 10 ? 'var(--gold)' : 'var(--text-muted)';
  }

  if (count === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    if (addBtn) {
      addBtn.style.display = 'flex';
      addBtn.style.opacity = '1';
      addBtn.style.pointerEvents = 'auto';
    }
    if (addBtnText) addBtnText.textContent = '+ Add Proof Image (Optional, max 10)';
    return;
  }

  container.style.display = 'grid';
  container.innerHTML = '';

  rorSelectedFiles.forEach((file, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'ror-thumbnail-item';
    thumb.style.position = 'relative';
    thumb.style.width = '100%';
    thumb.style.aspectRatio = '1';
    thumb.style.borderRadius = 'var(--radius-md, 8px)';
    thumb.style.overflow = 'hidden';
    thumb.style.border = '1px solid var(--border-card, rgba(255,255,255,0.12))';
    thumb.style.background = 'rgba(0,0,0,0.5)';

    if (!file._previewUrl) {
      try {
        file._previewUrl = URL.createObjectURL(file);
      } catch(e) {}
    }

    const img = document.createElement('img');
    if (file._previewUrl) img.src = file._previewUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    img.onerror = () => {
      img.style.display = 'none';
      const fallback = document.createElement('div');
      fallback.style.cssText = 'width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.7rem; color:var(--gold); text-align:center; padding:4px;';
      const cleanName = (file.name || 'Image').slice(0, 12);
      fallback.innerHTML = `📸<span style="font-size:0.65rem; color:#fff; margin-top:2px; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(cleanName)}</span>`;
      thumb.insertBefore(fallback, removeBtn);
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '✕';
    removeBtn.title = `Remove ${file.name}`;
    removeBtn.setAttribute('aria-label', `Remove image ${idx + 1}`);
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '3px';
    removeBtn.style.right = '3px';
    removeBtn.style.width = '24px';
    removeBtn.style.height = '24px';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.background = 'rgba(220, 38, 38, 0.9)';
    removeBtn.style.color = '#fff';
    removeBtn.style.border = '1px solid rgba(255,255,255,0.7)';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.lineHeight = '1';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.zIndex = '5';
    removeBtn.style.padding = '0';
    removeBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeRorSelectedFile(idx);
    };

    thumb.appendChild(img);
    thumb.appendChild(removeBtn);
    container.appendChild(thumb);
  });

  if (addBtn) {
    if (count >= 10) {
      addBtn.style.display = 'none';
    } else {
      addBtn.style.display = 'flex';
      addBtn.style.opacity = '1';
      addBtn.style.pointerEvents = 'auto';
      if (addBtnText) addBtnText.textContent = `+ Add More Images (${10 - count} remaining)`;
    }
  }
}

window.submitRorUI = async function() {
  const coinsInput = document.getElementById('rorCoinsInput');
  const descInput = document.getElementById('rorDescInput');
  const btn = document.getElementById('rorSubmitBtn');
  const msg = document.getElementById('rorStatusMsg');
  
  if (!msg || !coinsInput || !descInput || !btn) return;

  const requestedCoins = parseInt(coinsInput.value, 10);
  if (!requestedCoins || requestedCoins <= 0) {
    msg.style.display = 'block';
    msg.style.color = '#ef4444';
    msg.textContent = 'Please enter a valid positive amount of coins.';
    return;
  }

  const identity = (typeof window.getRorPlayerIdentity === "function") 
    ? window.getRorPlayerIdentity() 
    : { playerId: window._currentPlayerId || "", username: window._currentUsername || "" };

  if (!identity.playerId) {
    msg.style.display = 'block';
    msg.style.color = '#ef4444';
    msg.innerHTML = '⚠️ You must be logged in to submit a request. <button type="button" class="btn" style="margin-top:8px; padding:6px 14px; font-size:0.85rem; background:var(--gold); color:#07041a; font-weight:700; border-radius:999px; cursor:pointer;" onclick="if(window.showLobby) window.showLobby(); if(window.toggleLobbyTab) window.toggleLobbyTab(\'login\');">Log In to Account</button>';
    return;
  }
  
  // Guard hard file size limit
  for (let i = 0; i < rorSelectedFiles.length; i++) {
    if (rorSelectedFiles[i].size > 5 * 1024 * 1024) {
      msg.style.display = 'block';
      msg.style.color = '#ef4444';
      msg.textContent = `File "${rorSelectedFiles[i].name}" exceeds the 5 MB limit. Please remove it.`;
      return;
    }
  }
  
  btn.disabled = true;
  const initialHtml = btn.innerHTML;
  btn.textContent = '⏳ Preparing request…';
  msg.style.display = 'none';
  
  try {
    if (typeof window.submitRorRequest === "function") {
      await window.submitRorRequest(
        requestedCoins, 
        descInput.value, 
        rorSelectedFiles,
        (current, total, step) => {
          if (step === 'uploading') {
            btn.textContent = `⏳ Uploading proof (${current}/${total})…`;
          } else if (step === 'saving') {
            btn.textContent = '⏳ Saving request…';
          }
        }
      );
      msg.style.display = 'block';
      msg.style.color = '#2dd4bf';
      msg.textContent = '✨ Request submitted successfully! It is now pending admin approval.';
      
      // Reset form
      coinsInput.value = '';
      descInput.value = '';
      window.clearRorImage();
    } else {
      throw new Error("Service is initializing. Please wait a few seconds and try again.");
    }
  } catch(e) {
    console.error("submitRorUI error:", e);
    msg.style.display = 'block';
    msg.style.color = '#ef4444';
    msg.textContent = 'Error: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = initialHtml || '✨ Submit Request';
  }
};

// ═══════════════════════════════════════════════════════════
// ADMIN ROR HANDLERS
// ═══════════════════════════════════════════════════════════
window.renderAdminRorRequests = function(requests) {
  const container = document.getElementById('adminRorList');
  if (!container) return;
  
  if (!requests || requests.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:40px 20px; background: var(--surface-card); border-radius: var(--radius-lg); border: 1px solid var(--border-card); font-family: var(--font-body);">No pending ROR requests.</div>';
    return;
  }
  
  let html = '';
  requests.forEach(req => {
    const hasImages = Array.isArray(req.imageUrls) && req.imageUrls.length > 0;
    html += `
      <div class="admin-ror-card" style="background: var(--surface-card); border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: 16px; box-shadow: 0 8px 24px -4px rgba(7, 4, 26, 0.6); position: relative;">
        <div style="display:flex; justify-content: space-between; align-items:flex-start; margin-bottom: 12px; gap: 8px;">
          <div>
            <div style="font-weight:700; font-family: var(--font-display); font-size:1.1rem; color:var(--text-primary);">${escapeHtml(req.username || req.playerId || 'Unknown')}</div>
            <div style="color:var(--text-muted); font-size:0.8rem; margin-top: 2px;">${new Date(req.timestamp || Date.now()).toLocaleString()}</div>
          </div>
          <div style="background: rgba(245, 197, 66, 0.15); border: 1px solid var(--border-gold); padding: 4px 10px; border-radius: var(--radius-sm); font-family: var(--font-display); font-size: 0.85rem; font-weight: 700; color: var(--gold); white-space: nowrap;">
            ${req.requestedCoins} 🪙
          </div>
        </div>
        ${req.description ? `<div style="background: var(--surface-input); padding: 12px; border-radius: var(--radius-md); font-size:0.9rem; font-family: var(--font-body); margin-bottom:12px; color:var(--text-secondary); line-height: 1.5; border: 1px solid rgba(255,255,255,0.05);">${escapeHtml(req.description)}</div>` : ''}
        
        ${hasImages ? `
          <div style="margin-bottom: 14px;">
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">Proof Screenshots (${req.imageUrls.length}):</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 8px;">
              ${req.imageUrls.map((url, i) => `
                <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: block; aspect-ratio: 1; border-radius: var(--radius-md, 8px); overflow: hidden; border: 1px solid var(--border-card); background: #000; position: relative;" title="Click to view full image #${i+1}">
                  <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; display: block;" loading="lazy" alt="Proof #${i+1}" />
                </a>
              `).join('')}
            </div>
          </div>
        ` : `<div style="margin-bottom: 12px; font-size: 0.8rem; color: var(--text-muted); font-style: italic;">No proof screenshots attached.</div>`}
        
        <div style="display:flex; gap: 8px; align-items: flex-end; margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px; flex-wrap: wrap;">
          <div style="display: flex; flex-direction: column; flex: 1; min-width: 100px;">
            <label style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; font-family: var(--font-display); font-weight: 600;">Grant Amount</label>
            <input type="number" id="ror_amount_${req.id}" value="${req.requestedCoins}" min="1" style="width: 100%; padding: 10px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.15); background: var(--surface-input); color: var(--gold); font-weight: bold; font-family: var(--font-display); outline: none;" />
          </div>
          <div style="display: flex; gap: 8px; flex: 1.5; min-width: 160px;">
            <button class="btn" style="flex: 1; padding: 10px; border-radius: var(--radius-pill); font-family: var(--font-display); font-weight: 700; background: var(--green); color: #07041a; box-shadow: 0 0 16px rgba(52, 211, 153, 0.3); height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="handleAdminRor('${req.id}', 'granted')">Approve</button>
            <button class="btn" style="flex: 1; padding: 10px; border-radius: var(--radius-pill); font-family: var(--font-display); font-weight: 700; background: transparent; border: 1px solid var(--red); color: var(--red); height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="handleAdminRor('${req.id}', 'declined')">Decline</button>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
};

window.handleAdminRor = async function(reqId, action) {
  const amountInput = document.getElementById(`ror_amount_${reqId}`);
  let finalAmount = parseInt(amountInput ? amountInput.value : '0', 10);
  
  if (action === 'granted' && (!finalAmount || finalAmount <= 0)) {
    alert("Please enter a valid positive amount of coins.");
    return;
  }
  
  if (!confirm(`Are you sure you want to ${action} this request?`)) return;
  
  const cardEl = amountInput ? amountInput.closest('.admin-ror-card') : null;
  const btns = cardEl ? cardEl.querySelectorAll('button') : [];
  if (amountInput) amountInput.disabled = true;
  btns.forEach(b => { b.disabled = true; b.textContent = "⏳..."; });
  
  try {
    await window.adminUpdateRorRequest(reqId, action, finalAmount);
  } catch(e) {
    console.error(e);
    alert("Error updating request: " + (e.message || e));
    if (amountInput) amountInput.disabled = false;
    btns.forEach(b => {
      b.disabled = false;
      b.textContent = b.classList.contains('btn-red') || b.textContent.includes('Decline') ? 'Decline' : 'Approve';
    });
  }
};
