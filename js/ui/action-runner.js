      // ── OPTIMISTIC ACTION RUNNER ───────────────────────────────
      // Standardized optimistic execution: immediately updates the UI, runs
      // the server write in the background, reconciles on success, or rolls
      // back cleanly with a visible warning toast on error.
      async function runOptimisticAction({
        apply,
        commit,
        reconcile,
        rollback,
        successMsg,
        rollbackMsg,
      }) {
        try {
          apply();
          if (successMsg && typeof showToast === "function")
            showToast(successMsg);
        } catch (err) {
          console.error("Optimistic apply failed:", err);
          return false;
        }

        try {
          const result = await commit();
          if (result === false || result === null) {
            throw new Error("Server returned failure or null");
          }
          if (reconcile && result) reconcile(result);
          return true;
        } catch (err) {
          console.warn("Optimistic action failed, rolling back:", err);
          try {
            rollback();
          } catch (rbErr) {
            console.error("Rollback failed:", rbErr);
          }
          if (rollbackMsg && typeof showToast === "function")
            showToast(rollbackMsg);
          return false;
        }
      }
      window.runOptimisticAction = runOptimisticAction;

      function openSuggestionsPage() {
        document.getElementById("suggestionsPage").classList.add("show");
        if (window.loadSuggestions)
          window.loadSuggestions().then((list) => renderSuggestionsFeed(list));
        if (window.daPushOverlayState)
          window.daPushOverlayState("suggestionsPage");
      }
      function closeSuggestionsPage(fromPopstate) {
        document.getElementById("suggestionsPage").classList.remove("show");
        if (
          !fromPopstate &&
          history.state &&
          history.state.daScreen === "overlay" &&
          history.state.overlayId === "suggestionsPage"
        ) {
          window._daSuppressNextPop = true;
          history.back();
        }
      }

      // ── SUGGESTION POST ──────────────────────────────────────
      // Optimistic UI: clears input and appends the card to the feed instantly.
      // If the background Firebase write fails, the post is removed, the draft
      // is restored back into the input, and a visible rollback toast alerts the user.
      async function postSuggestion() {
        const input = document.getElementById("suggestInput");
        const text = ((input && input.value) || "").trim();
        if (!text) {
          showToast("✏️ Write something first!");
          return;
        }
        const entry = {
          id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          playerName: profile.name || "Unknown",
          townName: profile.town || "",
          avatar: profile.avatar,
          photoURL: _lightPhoto(profile.photoURL),
          playerId: window._currentPlayerId || "",
          text: text,
          votes: {},
          comments: [],
          timestamp: new Date().toISOString(),
        };

        await runOptimisticAction({
          apply: () => {
            if (input) input.value = "";
            window._setSuggestions([...window._suggestions(), entry]);
            renderSuggestionsFeed();
          },
          commit: async () => {
            return window.submitSuggestion
              ? await window.submitSuggestion(entry)
              : false;
          },
          rollback: () => {
            window._setSuggestions(
              window._suggestions().filter((s) => s.id !== entry.id),
            );
            if (input) input.value = text;
            renderSuggestionsFeed();
          },
          successMsg: "📬 Suggestion posted!",
          rollbackMsg:
            "⚠️ Could not post suggestion — your draft was restored!",
        });
      }

      // ── VOTING ────────────────────────────────────────────────
      // Optimistic UI: the tap updates the score/highlight instantly, then the
      // Firestore transaction runs in the background. The in-flight guard below
      // blocks a second tap on the same post from firing a second transaction
      // while the first is still saving.
      //
      // Speed note: this used to call the full renderSuggestionsFeed() on every
      // tap, which rebuilds the *entire* feed — every post, every comment
      // thread, every avatar — from scratch. That's cheap with a couple posts
      // but scales badly once threads have comments, and it's what made votes
      // feel laggy. patchSgVoteUI() below instead touches only the DOM nodes
      // for the one post that changed (score text + button highlight), so a tap
      // is a couple of property writes instead of a full re-render. We only
      // fall back to a full render if the post isn't in the DOM yet (e.g. the
      // feed hasn't been painted) or the vote had to be reverted after a failed
      // write, since a revert can change which "who voted" icon should show.
      const sgVoteInFlight = {};

      function patchSgVoteUI(id) {
        try {
          const post = window._suggestions().find((s) => s.id === id);
          if (!post) return false;

          // Look the post's DOM node up by comparing dataset.postId directly
          // instead of building a dynamic CSS selector with CSS.escape() — some
          // WebViews this app runs inside don't implement CSS.escape, and a
          // throw here used to happen *before* the vote was ever sent to
          // Firestore, silently swallowing the tap. A plain loop can't throw.
          let postEl = null;
          const candidates = document.querySelectorAll(".sg-post");
          for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].dataset.postId === id) {
              postEl = candidates[i];
              break;
            }
          }
          if (!postEl) return false;

          const myId = window._currentPlayerId || "";
          const myVoteObj = (post.votes || {})[myId];
          const myVote = myVoteObj ? myVoteObj.dir : 0;
          const score = sgScore(post);
          const voterCount = Object.keys(post.votes || {}).length;

          const scoreEl = postEl.querySelector(".sg-vote-score");
          if (scoreEl) scoreEl.textContent = score;
          const upBtn = postEl.querySelector(".sg-vote-btn.up");
          if (upBtn) upBtn.classList.toggle("active", myVote === 1);
          const downBtn = postEl.querySelector(".sg-vote-btn.down");
          if (downBtn) downBtn.classList.toggle("active", myVote === -1);

          const votesRow = postEl.querySelector(".sg-post-votes");
          const votersBtn = postEl.querySelector(".sg-voters-btn");
          if (voterCount > 0 && !votersBtn && votesRow) {
            const btn = document.createElement("button");
            btn.className = "sg-voters-btn";
            btn.title = "See who voted";
            btn.textContent = "👥";
            btn.onclick = () => showSuggestionVoters(id);
            votesRow.appendChild(btn);
          } else if (voterCount === 0 && votersBtn) {
            votersBtn.remove();
          }
          return true;
        } catch (e) {
          // Never let a DOM-patching quirk block the vote — the caller falls
          // back to a full re-render when this returns false.
          console.warn("patchSgVoteUI failed, falling back to full render:", e);
          return false;
        }
      }

      async function voteOnSuggestion(id, dir) {
        const myId = window._currentPlayerId || "";
        if (!myId) {
          showToast("⚠️ Log in to vote!");
          return;
        }
        if (sgVoteInFlight[id]) return; // previous vote on this post is still saving — ignore rapid re-taps
        const post = window._suggestions().find((s) => s.id === id);
        if (!post) return;

        const prevVotes = post.votes || {};
        const currentVote = prevVotes[myId];
        const current = currentVote ? currentVote.dir : 0;
        const nextDir = current === dir ? 0 : dir; // tapping the same button again removes your vote
        const voterInfo = { name: profile.name || "Unknown" };

        // Apply the vote locally right away and patch just this post's DOM —
        // this is what makes the tap feel instant. Wrapped so that even if the
        // DOM patch/fallback render throws for some reason, the write to
        // Firestore below still always fires — a rendering hiccup should never
        // be able to eat the tap itself.
        const optimisticVotes = Object.assign({}, prevVotes);
        if (nextDir === 0) {
          delete optimisticVotes[myId];
        } else {
          optimisticVotes[myId] = { dir: nextDir, name: voterInfo.name };
        }
        post.votes = optimisticVotes;
        try {
          if (!patchSgVoteUI(id)) renderSuggestionsFeed();
        } catch (e) {
          console.warn("vote render failed:", e);
        }

        sgVoteInFlight[id] = true;
        const updated = window.voteSuggestion
          ? await window.voteSuggestion(id, myId, nextDir, voterInfo)
          : null;
        delete sgVoteInFlight[id];

        if (updated) {
          window._setSuggestions(updated);
          try {
            if (!patchSgVoteUI(id)) renderSuggestionsFeed();
          } catch (e) {
            console.warn("vote render failed:", e);
          }
        } else {
          post.votes = prevVotes; // revert the optimistic change if the write failed
          showToast("⚠️ Could not save vote — vote reverted!");
          try {
            if (!patchSgVoteUI(id)) renderSuggestionsFeed();
          } catch (e) {
            console.warn("vote render failed:", e);
          }
        }
      }

      function sgScore(post) {
        const votes = post.votes || {};
        let score = 0;
        for (const k in votes) score += (votes[k] && votes[k].dir) || 0;
        return score;
      }

      function showSuggestionVoters(id) {
        const post = window._suggestions().find((s) => s.id === id);
        if (!post) return;
        const votes = post.votes || {};
        const upvoters = [];
        const downvoters = [];
        Object.keys(votes).forEach((pid) => {
          const v = votes[pid];
          if (!v) return;
          const name = v.name || "Unknown";
          if (v.dir === 1) upvoters.push(name);
          else if (v.dir === -1) downvoters.push(name);
        });
        const body = document.getElementById("sgVotersBody");
        if (!body) return;
        body.innerHTML = `
      <div class="sg-voters-section">
        <div class="sg-voters-heading up">👍 Upvoted by (${upvoters.length})</div>
        ${upvoters.length ? upvoters.map((n) => `<div class="sg-voter-row">${escapeHtml(n)}</div>`).join("") : '<div class="sg-voter-empty">No upvotes yet</div>'}
      </div>
      <div class="sg-voters-section">
        <div class="sg-voters-heading down">👎 Downvoted by (${downvoters.length})</div>
        ${downvoters.length ? downvoters.map((n) => `<div class="sg-voter-row">${escapeHtml(n)}</div>`).join("") : '<div class="sg-voter-empty">No downvotes yet</div>'}
      </div>
    `;
        document.getElementById("sgVotersOverlay").classList.add("show");
        if (window.daPushOverlayState)
          window.daPushOverlayState("sgVotersOverlay");
      }
      function closeSgVoters(fromPopstate) {
        if (window.daDismissOverlay)
          window.daDismissOverlay("sgVotersOverlay", fromPopstate);
        else
          document.getElementById("sgVotersOverlay").classList.remove("show");
      }

      let sgEditingId = null;
      let sgExpandedId = null; // id of the post whose comment thread is currently open

      // ── COMMENT THREADS ────────────────────────────────────────
      function toggleSgThread(id) {
        sgExpandedId = sgExpandedId === id ? null : id;
        renderSuggestionsFeed();
        if (sgExpandedId === id) {
          setTimeout(() => {
            const el = document.getElementById("sgThread_" + id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 60);
        }
      }

      const sgCommentInFlight = {};

      async function postComment(postId) {
        const myId = window._currentPlayerId || "";
        if (!myId) {
          showToast("⚠️ Log in to comment!");
          return;
        }
        if (sgCommentInFlight[postId]) return; // previous comment on this post is still saving
        const input = document.getElementById("sgCommentInput_" + postId);
        const text = ((input && input.value) || "").trim();
        if (!text) {
          showToast("✏️ Write something first!");
          return;
        }
        const post = window._suggestions().find((s) => s.id === postId);
        if (!post) return;

        const comment = {
          id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          playerName: profile.name || "Unknown",
          avatar: profile.avatar,
          photoURL: _lightPhoto(profile.photoURL),
          playerId: myId,
          text: text,
          timestamp: new Date().toISOString(),
        };

        sgCommentInFlight[postId] = true;

        await runOptimisticAction({
          apply: () => {
            if (input) input.value = "";
            const comments = Array.isArray(post.comments)
              ? post.comments.slice()
              : [];
            comments.push(comment);
            post.comments = comments;
            sgExpandedId = postId;
            renderSuggestionsFeed();
          },
          commit: async () => {
            return window.submitComment
              ? await window.submitComment(postId, comment)
              : null;
          },
          reconcile: (updated) => {
            window._setSuggestions(updated);
            renderSuggestionsFeed();
          },
          rollback: () => {
            if (Array.isArray(post.comments)) {
              post.comments = post.comments.filter((c) => c.id !== comment.id);
            }
            const restoredInput = document.getElementById(
              "sgCommentInput_" + postId,
            );
            if (restoredInput) restoredInput.value = text;
            renderSuggestionsFeed();
          },
          successMsg: "💬 Comment posted!",
          rollbackMsg: "⚠️ Could not post comment — draft restored!",
        });

        delete sgCommentInFlight[postId];
      }

      async function deleteCommentUI(postId, commentId) {
        if (!confirm("Delete this comment? This cannot be undone.")) return;
        const myId = window._currentPlayerId || "";
        const post = window._suggestions().find((s) => s.id === postId);
        if (!post || !Array.isArray(post.comments)) return;
        const idx = post.comments.findIndex((c) => c.id === commentId);
        if (idx === -1) return;
        const deletedComment = post.comments[idx];

        await runOptimisticAction({
          apply: () => {
            post.comments.splice(idx, 1);
            renderSuggestionsFeed();
          },
          commit: async () => {
            return window.deleteComment
              ? await window.deleteComment(postId, commentId, myId)
              : null;
          },
          reconcile: (updated) => {
            window._setSuggestions(updated);
            renderSuggestionsFeed();
          },
          rollback: () => {
            post.comments.splice(idx, 0, deletedComment);
            renderSuggestionsFeed();
          },
          successMsg: "🗑️ Comment deleted!",
          rollbackMsg: "⚠️ Could not delete comment — comment restored!",
        });
      }

      function startEditSuggestion(id) {
        sgEditingId = id;
        renderSuggestionsFeed();
      }
      function cancelEditSuggestion() {
        sgEditingId = null;
        renderSuggestionsFeed();
      }
      async function saveEditSuggestion(id) {
        const ta = document.getElementById("sgEditInput_" + id);
        const newText = ((ta && ta.value) || "").trim();
        if (!newText) {
          showToast("✏️ Suggestion can't be empty!");
          return;
        }
        const myId = window._currentPlayerId || "";
        const post = window._suggestions().find((s) => s.id === id);
        if (!post) return;

        const prevText = post.text;
        const prevEditedAt = post.editedAt;

        await runOptimisticAction({
          apply: () => {
            post.text = newText;
            post.editedAt = new Date().toISOString();
            sgEditingId = null;
            renderSuggestionsFeed();
          },
          commit: async () => {
            return window.editSuggestion
              ? await window.editSuggestion(id, myId, newText)
              : null;
          },
          reconcile: (updated) => {
            window._setSuggestions(updated);
            renderSuggestionsFeed();
          },
          rollback: () => {
            post.text = prevText;
            post.editedAt = prevEditedAt;
            renderSuggestionsFeed();
          },
          successMsg: "✅ Suggestion updated!",
          rollbackMsg: "⚠️ Could not save edit — changes reverted!",
        });
      }

      async function deleteSuggestionUI(id) {
        if (!confirm("Delete this suggestion? This cannot be undone.")) return;
        const myId = window._currentPlayerId || "";
        const list = window._suggestions();
        const idx = list.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const deletedPost = list[idx];

        await runOptimisticAction({
          apply: () => {
            const next = list.slice();
            next.splice(idx, 1);
            window._setSuggestions(next);
            if (sgEditingId === id) sgEditingId = null;
            renderSuggestionsFeed();
          },
          commit: async () => {
            return window.deleteSuggestion
              ? await window.deleteSuggestion(id, myId)
              : null;
          },
          reconcile: (updated) => {
            window._setSuggestions(updated);
            renderSuggestionsFeed();
          },
          rollback: () => {
            const current = window._suggestions().slice();
            current.splice(idx, 0, deletedPost);
            window._setSuggestions(current);
            renderSuggestionsFeed();
          },
          successMsg: "🗑️ Suggestion deleted!",
          rollbackMsg: "⚠️ Could not delete suggestion — post restored!",
        });
      }

      function renderSuggestionsFeed(list) {
        if (Array.isArray(list)) {
          // If a vote on some post is still mid-flight (optimistic update
          // applied locally, transaction not yet confirmed), keep showing that
          // local vote instead of letting an incoming snapshot — which may
          // predate our transaction — flicker it back to the old state.
          const inFlightIds = Object.keys(sgVoteInFlight);
          if (inFlightIds.length) {
            const prevById = {};
            window._suggestions().forEach((p) => {
              prevById[p.id] = p;
            });
            list = list.map((p) =>
              sgVoteInFlight[p.id] && prevById[p.id]
                ? Object.assign({}, p, { votes: prevById[p.id].votes })
                : p,
            );
          }
          window._setSuggestions(list);
        }
        const feedEl = document.getElementById("suggestFeed");
        if (!feedEl) return;

        // Preserve any in-progress comment draft across a re-render (e.g.
        // triggered by a live snapshot update while the user is mid-type).
        const commentDrafts = {};
        feedEl.querySelectorAll('[id^="sgCommentInput_"]').forEach((ta) => {
          commentDrafts[ta.id.slice("sgCommentInput_".length)] = ta.value;
        });

        const myId = window._currentPlayerId || "";
        const posts = window
          ._suggestions()
          .slice()
          .sort((a, b) => {
            const diff = sgScore(b) - sgScore(a);
            if (diff !== 0) return diff;
            return new Date(b.timestamp) - new Date(a.timestamp);
          });

        if (posts.length === 0) {
          feedEl.innerHTML = `
        <div class="req-empty">
          <div class="re-icon">📬</div>
          <h3>No Suggestions Yet</h3>
          <p>Be the first to share an idea!</p>
        </div>`;
          return;
        }

        feedEl.innerHTML = "";
        posts.forEach((post) => {
          const myVoteObj = (post.votes || {})[myId];
          const myVote = myVoteObj ? myVoteObj.dir : 0;
          const score = sgScore(post);
          const voterCount = Object.keys(post.votes || {}).length;
          const ts = new Date(post.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isMine = !!post.playerId && post.playerId === myId;
          const editedTag = post.editedAt
            ? '<span class="sg-post-edited">(edited)</span>'
            : "";
          const el = document.createElement("div");
          el.className = "sg-post";
          el.dataset.postId = post.id;

          const bodyHtml =
            sgEditingId === post.id
              ? `
          <textarea class="gc-note-input" id="sgEditInput_${post.id}" rows="3" style="text-align:left;margin-bottom:8px;">${escapeHtml(post.text)}</textarea>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-gold" style="flex:1;padding:8px;font-size:.8rem" onclick="saveEditSuggestion('${post.id}')">Save</button>
            <button class="btn" style="flex:1;padding:8px;font-size:.8rem;background:rgba(255,255,255,.1);color:#fff" onclick="cancelEditSuggestion()">Cancel</button>
          </div>`
              : `<div class="sg-post-text">${escapeHtml(post.text)}</div>`;

          // ── Comment thread — collapsed by default, expands on tap like a
          // Reddit "N comments" link. Sorted oldest-first so a reply chain
          // reads top-to-bottom like a conversation.
          const comments = Array.isArray(post.comments) ? post.comments : [];
          const commentCount = comments.length;
          const isExpanded = sgExpandedId === post.id;
          const threadHtml = isExpanded
            ? `
        <div class="sg-thread" id="sgThread_${post.id}">
          ${
            commentCount === 0
              ? '<div class="sg-thread-empty">No comments yet — start the discussion!</div>'
              : comments
                  .slice()
                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                  .map((c) => {
                    const cIsMine = !!c.playerId && c.playerId === myId;
                    const cts = new Date(c.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return `
                  <div class="sg-comment">
                    <div class="sg-comment-av">${avatarHTML(c.avatar, c.photoURL, c.playerId, c.playerName)}</div>
                    <div class="sg-comment-body">
                      <div class="sg-comment-head">
                        <span class="sg-comment-name">${escapeHtml(c.playerName) || "Unknown"}</span>
                        <span class="sg-comment-ts">${cts}</span>
                        ${cIsMine ? `<button class="sg-edit-btn" onclick="deleteCommentUI('${post.id}','${c.id}')" title="Delete">🗑️</button>` : ""}
                      </div>
                      <div class="sg-comment-text">${escapeHtml(c.text)}</div>
                    </div>
                  </div>`;
                  })
                  .join("")
          }
          <div class="sg-comment-compose">
            <textarea class="gc-note-input" id="sgCommentInput_${post.id}" rows="2" placeholder="Add a comment…" style="text-align:left;margin-bottom:6px;">${escapeHtml(commentDrafts[post.id] || "")}</textarea>
            <button class="btn btn-gold" id="sgCommentSendBtn_${post.id}" style="width:100%;padding:8px;font-size:.8rem" onclick="postComment('${post.id}')">Reply</button>
          </div>
        </div>
      `
            : "";

          el.innerHTML = `
        <div class="sg-post-votes">
          <button class="sg-vote-btn up${myVote === 1 ? " active" : ""}" onclick="voteOnSuggestion('${post.id}',1)">👍</button>
          <span class="sg-vote-score">${score}</span>
          <button class="sg-vote-btn down${myVote === -1 ? " active" : ""}" onclick="voteOnSuggestion('${post.id}',-1)">👎</button>
          ${voterCount > 0 ? `<button class="sg-voters-btn" onclick="showSuggestionVoters('${post.id}')" title="See who voted">👥</button>` : ""}
        </div>
        <div class="sg-post-body">
          <div class="sg-post-head">
            <div class="sg-post-av">${avatarHTML(post.avatar, post.photoURL, post.playerId, post.playerName)}</div>
            <span class="sg-post-name">${escapeHtml(post.playerName) || "Unknown"}</span>
            <span class="sg-post-ts">${ts} ${editedTag}</span>
            ${isMine && sgEditingId !== post.id ? `<button class="sg-edit-btn" onclick="startEditSuggestion('${post.id}')" title="Edit">✏️</button>` : ""}
            ${isMine && sgEditingId !== post.id ? `<button class="sg-edit-btn" onclick="deleteSuggestionUI('${post.id}')" title="Delete">🗑️</button>` : ""}
          </div>
          ${bodyHtml}
          <button class="sg-comment-btn" onclick="toggleSgThread('${post.id}')">💬 ${commentCount} ${commentCount === 1 ? "Comment" : "Comments"}${isExpanded ? " ▲" : " ▼"}</button>
          ${threadHtml}
        </div>
      `;
          feedEl.appendChild(el);
        });
      }
      window.renderSuggestionsFeed = renderSuggestionsFeed;


      // Opens the leaderboard popup, mirroring the inline Top 10 list of the
      // given event ('jj' or 'jp'). Read-only: does not touch game logic.
      function openLbView(which) {
        var src = document.getElementById(which + "LbInlineList");
        var body = document.getElementById("lbViewBody");
        var html = src ? src.innerHTML.trim() : "";
        body.innerHTML =
          html ||
          '<div class="lb-empty"><span class="lb-e-icon">🏆</span>No scores yet today — be the first to play!</div>';
        document.getElementById("lbViewOverlay").classList.add("show");
        if (window.daPushOverlayState)
          window.daPushOverlayState("lbViewOverlay");
      }
      function closeLbView(fromPopstate) {
        if (window.daDismissOverlay)
          window.daDismissOverlay("lbViewOverlay", fromPopstate);
        else document.getElementById("lbViewOverlay").classList.remove("show");
      }

      // ── COIN HISTORY MODAL ──────────────────────────────────
      // Opens on tap of the coin chip in the topbar. Shows a live-fetched list
      // (up to 100 entries) of every coin credit/debit for the current player.
      function renderCoinHistoryList(entries) {
        const listEl = document.getElementById("coinHistoryList");
        if (!listEl) return;
        if (!entries || !entries.length) {
          listEl.innerHTML = `
        <div class="ch-empty" style="text-align:center;padding:24px 12px;color:rgba(255,255,255,.6);">
          <div style="font-size:2.2rem;margin-bottom:8px;">🪙</div>
          <div style="font-weight:700;margin-bottom:4px;color:#fff;">No coin activity yet!</div>
          <div style="font-size:.82rem;margin-bottom:14px;color:rgba(255,255,255,.5);">Play games or spin the wheel to earn your first coins.</div>
          <button class="btn btn-gold" style="font-size:.85rem;padding:8px 18px;" onclick="closeOverlay('coinHistoryOverlay');switchTabNav('games',document.getElementById('bn-games'))">🎮 Go to Games</button>
        </div>`;
          return;
        }
        listEl.innerHTML = entries
          .slice(0, 100)
          .map(function (e) {
            const delta = Number(e.delta) || 0;
            const isCredit = delta >= 0;
            const amtStr =
              (isCredit ? "+" : "−") + Math.abs(delta).toLocaleString() + " 🪙";
            let timeStr = "";
            try {
              timeStr = e.ts
                ? new Date(e.ts).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
            } catch (err) {
              timeStr = "";
            }
            const reason = (e.reason || "Coins updated")
              .toString()
              .replace(/[&<>"']/g, function (c) {
                return {
                  "&": "&amp;",
                  "<": "&lt;",
                  ">": "&gt;",
                  '"': "&quot;",
                  "'": "&#39;",
                }[c];
              });
            const bal =
              e.balance != null && !isNaN(e.balance)
                ? '<span class="ch-balance">Balance: ' +
                  Number(e.balance).toLocaleString() +
                  " 🪙</span>"
                : "";
            return (
              '<div class="ch-row">' +
              '<div class="ch-row-main">' +
              '<span class="ch-reason">' +
              reason +
              "</span>" +
              '<span class="ch-time">' +
              timeStr +
              "</span>" +
              bal +
              "</div>" +
              '<span class="ch-amt ' +
              (isCredit ? "credit" : "debit") +
              '">' +
              amtStr +
              "</span>" +
              "</div>"
            );
          })
          .join("");
      }

      function openCoinHistoryModal() {
        const modalTitle = document.querySelector("#coinHistoryOverlay .modal-title");
        if (modalTitle) modalTitle.textContent = "Coin History";
        const listEl = document.getElementById("coinHistoryList");
        if (listEl)
          listEl.innerHTML = '<div class="ch-loading">⏳ Loading…</div>';
        document.getElementById("coinHistoryOverlay").classList.add("show");
        if (window.daPushOverlayState)
          window.daPushOverlayState("coinHistoryOverlay");
        if (window.clearCoinDot) window.clearCoinDot();
        // Fetch the freshest copy from Firestore — picks up admin grants/deductions
        // even if this device hasn't reloaded since they happened.
        if (window.fetchCoinHistory) {
          window
            .fetchCoinHistory()
            .then(renderCoinHistoryList)
            .catch(function () {
              renderCoinHistoryList(
                window._getCoinHistory ? window._getCoinHistory() : [],
              );
            });
        } else {
          renderCoinHistoryList(
            window._getCoinHistory ? window._getCoinHistory() : [],
          );
        }
      }

      function closeCoinHistoryModal(fromPopstate) {
        const modalTitle = document.querySelector("#coinHistoryOverlay .modal-title");
        if (modalTitle) modalTitle.textContent = "Coin History";
        if (window.daDismissOverlay)
          window.daDismissOverlay("coinHistoryOverlay", fromPopstate);
        else
          document
            .getElementById("coinHistoryOverlay")
            .classList.remove("show");
      }

      // ---- Dark / Light theme toggle (new) ----
      // Applies the saved theme and swaps the toggle chip's icon/label.
      function applyTheme(t) {
        document.body.classList.toggle("dark-mode", t === "dark");
        var ic = document.getElementById("themeToggleIcon");
        var lb = document.getElementById("themeToggleLabel");
        if (ic) ic.textContent = t === "light" ? "☀️" : "🌙";
        if (lb) lb.textContent = t === "light" ? "LIGHT" : "DARK";
      }
      function toggleTheme() {
        var t = document.body.classList.contains("dark-mode")
          ? "light"
          : "dark";
        try {
          localStorage.setItem("da_theme", t);
        } catch (e) {}
        applyTheme(t);
      }
      (function initTheme() {
        function setup() {
          // Light and dark mode button removed from topbar per request
          var existingBtn = document.getElementById("themeToggle");
          if (existingBtn) existingBtn.remove();
          var saved = "dark";
          try {
            saved = localStorage.getItem("da_theme") || "dark";
          } catch (e) {}
          applyTheme(saved);
        }
        if (document.readyState === "loading")
          document.addEventListener("DOMContentLoaded", setup);
        else setup();
      })();
