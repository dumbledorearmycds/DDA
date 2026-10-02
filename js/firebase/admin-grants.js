(function () {
  function isRtdbReady() {
    return !!(
      window._presenceRdb &&
      window._rtdbRef &&
      window._rtdbSet &&
      window._rtdbGet &&
      window._rtdbOnValue
    );
  }

  function getAdminActor() {
    const pid =
      window._currentPlayerId ||
      (window.profile && window.profile.playerId) ||
      "";
    const name =
      (window.profile && window.profile.name) ||
      window._currentUsername ||
      (typeof window.username === "string" ? window.username : "") ||
      "DA Leader";
    return { pid, name };
  }

  function makeGrantId() {
    return "grant_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  async function writeAdminGrantLog(event) {
    if (!event || !isRtdbReady()) return false;
    const payload = {
      id: event.id || makeGrantId(),
      type: event.type || "grant",
      actorId: event.actorId || "",
      actorName: event.actorName || "DA Leader",
      playerId: event.playerId || "",
      playerName: event.playerName || "",
      amount: Number(event.amount) || 0,
      note: event.note || "",
      reason: event.reason || "",
      scope: event.scope || "single",
      ts: Number(event.ts) || Date.now(),
      timestamp: event.timestamp || new Date().toISOString(),
      metadata: event.metadata || {},
    };

    try {
      const grantsRef = window._rtdbRef(window._presenceRdb, "adminGrants");
      const entryRef = window._rtdbRef(grantsRef, payload.id);
      await window._rtdbSet(entryRef, payload);
      return true;
    } catch (e) {
      console.warn("admin grant log write failed:", e);
      return false;
    }
  }

  async function loadRecentAdminGrants(limitN = 50) {
    if (!isRtdbReady()) return [];
    try {
      const grantsRef = window._rtdbRef(window._presenceRdb, "adminGrants");
      const snap = await window._rtdbGet(grantsRef);
      const obj = snap && snap.exists ? snap.val() || {} : {};
      return Object.values(obj)
        .filter(Boolean)
        .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
        .slice(0, Math.max(1, Number(limitN) || 50));
    } catch (e) {
      console.warn("loadRecentAdminGrants failed:", e);
      return [];
    }
  }

  function startLiveAdminGrantsListener(onUpdate) {
    if (!isRtdbReady()) return null;
    if (window.__adminGrantsLiveUnsub) return window.__adminGrantsLiveUnsub;

    const grantsRef = window._rtdbRef(window._presenceRdb, "adminGrants");
    window.__adminGrantsLiveUnsub = window._rtdbOnValue(
      grantsRef,
      (snap) => {
        const obj = snap && snap.exists ? snap.val() || {} : {};
        const list = Object.values(obj)
          .filter(Boolean)
          .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
          .slice(0, 50);
        if (typeof onUpdate === "function") onUpdate(list);
        if (typeof window.renderRecentAdminGrantHistory === "function") {
          window.renderRecentAdminGrantHistory(list);
        }
      },
      (err) => {
        console.warn("admin grant history listener error:", err);
      },
    );

    return window.__adminGrantsLiveUnsub;
  }

  function wrapAdminGrant(name, buildEvent) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = async function (...args) {
      const result = await original.apply(this, args);
      if (
        result === false ||
        result === null ||
        result === 0 ||
        result === -1 ||
        result === undefined
      ) {
        return result;
      }

      try {
        const event = buildEvent(args, result);
        if (event) await writeAdminGrantLog(event);
      } catch (e) {
        console.warn("admin grant wrapper failed:", e);
      }
      return result;
    };
  }

  wrapAdminGrant("adminGrantCoinsAll", (args, result) => {
    const [amount, note] = args;
    const actor = getAdminActor();
    return {
      type: "coins_all",
      actorId: actor.pid,
      actorName: actor.name,
      playerId: "ALL",
      playerName: "All players",
      amount: Number(amount) || 0,
      note: note || "",
      reason: "Grant coins to all players",
      scope: "all",
      metadata: { playerCount: Number(result) || 0 },
    };
  });

  wrapAdminGrant("adminGrantCoinsOne", (args, result) => {
    const [playerId, amount, note] = args;
    const actor = getAdminActor();
    const name = typeof result === "string" ? result : playerId;
    return {
      type: "coins",
      actorId: actor.pid,
      actorName: actor.name,
      playerId: playerId || "",
      playerName: name || "",
      amount: Number(amount) || 0,
      note: note || "",
      reason: "Grant coins",
      scope: "single",
    };
  });

  wrapAdminGrant("adminGrantAuraOne", (args, result) => {
    const [playerId, amount, note] = args;
    const actor = getAdminActor();
    const name = typeof result === "string" ? result : playerId;
    return {
      type: "aura",
      actorId: actor.pid,
      actorName: actor.name,
      playerId: playerId || "",
      playerName: name || "",
      amount: Number(amount) || 0,
      note: note || "",
      reason: "Grant aura",
      scope: "single",
    };
  });

  wrapAdminGrant("adminGrantCardOne", (args, result) => {
    const [playerId, setIdx, cardIdx, isDupe, note] = args;
    const actor = getAdminActor();
    const obj = result && typeof result === "object" ? result : null;
    return {
      type: "card",
      actorId: actor.pid,
      actorName: actor.name,
      playerId: playerId || "",
      playerName: obj && obj.name ? obj.name : playerId || "",
      amount: 1,
      note: note || "",
      reason: "Grant card",
      scope: "single",
      metadata: {
        setIdx: Number(setIdx) || 0,
        cardIdx: Number(cardIdx) || 0,
        isDupe: !!isDupe,
      },
    };
  });

  window.writeAdminGrantLog = writeAdminGrantLog;
  window.loadRecentAdminGrants = loadRecentAdminGrants;
  window.startLiveAdminGrantsListener = startLiveAdminGrantsListener;
})();
