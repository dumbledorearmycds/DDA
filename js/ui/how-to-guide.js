      // ── HOW-TO-USE GUIDE CONTENT ──────────────────────────────
      // Plain-language explainer for every menu/mini-game. Keyed by the id
      // passed to showHowTo(key). Pure UI helper — no game logic, no
      // Firestore/RTDB reads or writes.
      var HOW_TO_GUIDE = {
        gamesHub: {
          icon: "🎮",
          title: "Mini Games",
          html: `<p>This is your hub for solo mini-games — pick one to start earning coins.</p>
        <div class="howto-sec-title">🏠 House of Cards</div>
        <p>Flip cards to hunt for hidden DA cards. Trigger too many Dark Arts traps and you risk losing what you found this round.</p>
        <div class="howto-sec-title">🎰 Spin & Win</div>
        <p>Spin the wheel for a chance at coin prizes — everyone gets a few free spins per day.</p>
        <div class="howto-sec-title">🧠 Pattern Recall</div>
        <p>Memorize a flashed pattern of tiles, then pick them from memory across 10 increasingly tricky levels.</p>
        <p>Tap "Play Now" on any card to jump straight in.</p>`,
        },
        cds: {
          icon: "📋",
          title: "CDS — Card Distribution Hub",
          html: `<p>Browse all 150 cards and request any of them for free, no coins needed.</p>
        <ul>
          <li>You get a limited number of <strong>free requests per day</strong> — shown at the top of the screen.</li>
          <li><strong>Gold cards</strong> have their own smaller daily limit.</li>
          <li>Tap a card, then <strong>Request</strong> to send it to your DA leader.</li>
          <li>Check <strong>📬 My CDS Requests</strong> to see status, edit a note, or cancel a pending request.</li>
        </ul>`,
        },
        hoc: {
          icon: "🏠",
          title: "House of Cards",
          html: `<p>Flip face-down cards to reveal DA cards hiding underneath. You get <strong>3 lives (❤️)</strong> per round.</p>
        <ul>
          <li>Pick a <strong>Set</strong> from the dropdown before you start flipping.</li>
          <li>Flipping a card can reveal a real card (added to your finds) or a <strong>Dark Arts trap</strong> 💣.</li>
          <li>Hit <strong>3 traps</strong> in one round and you'll be offered a choice: pay to keep going (4th life costs 400 coins, 5th life costs 800 coins — 2 continues max), or walk away and forfeit everything found that round.</li>
          <li>Trigger all <strong>5 traps</strong> in a round and you conquer the House, winning <strong>all 10 DA cards</strong> as a reward!</li>
          <li><strong>💡 Hint</strong> costs coins but narrows down where a card might be.</li>
          <li><strong>💼 Collect & Leave</strong> locks in everything you've found so far and ends your round safely.</li>
          <li>You get one round per day — a cooldown timer shows when the next one unlocks.</li>
        </ul>`,
        },
        spin: {
          icon: "🎰",
          title: "Spin & Win",
          html: `<p>Spin the magic wheel for a chance to win coins.</p>
        <ul>
          <li>You get a set number of <strong>free spins per day</strong> — the coin counter and cooldown timer are at the top.</li>
          <li>Tap <strong>⚡ SPIN THE WHEEL!</strong> and watch where the pointer lands.</li>
          <li>Every spin — yours and everyone else's — adds to the shared <strong>lottery counter</strong>. Whoever lands the <strong>100th spin</strong> wins a big bonus for themself.</li>
          <li>Check <strong>📋 Spin History</strong> to see recent results from across the DA.</li>
        </ul>`,
        },
        pr: {
          icon: "🧠",
          title: "Pattern Recall",
          html: `<p>A memory game — 10 levels, each harder than the last.</p>
        <ul>
          <li>At the start of a level, a few tiles flip open to reveal the Pattern Recall card. <strong>Memorize their positions</strong> before time runs out — the memorize window shrinks every level, from <strong>3 seconds</strong> at Level 1 down to <strong>1.75 seconds</strong> at Level 10.</li>
          <li>All tiles flip back down — tap the ones you remember, then hit <strong>SUBMIT ANSWER</strong> within <strong>10 seconds</strong>.</li>
          <li>Get it exactly right to complete the level. Then choose <strong>NEXT LEVEL</strong> to push your luck for a bigger prize, or <strong>🪙 COLLECT & EXIT</strong> to lock in that level's reward.</li>
          <li>Rewards by level (non-cumulative): <strong>L1:</strong> 30 🪙 · <strong>L2:</strong> 50 🪙 · <strong>L3:</strong> 75 🪙 · <strong>L4:</strong> 100 🪙 · <strong>L5:</strong> 150 🪙 · <strong>L6:</strong> 200 🪙 · <strong>L7:</strong> 250 🪙 · <strong>L8:</strong> 300 🪙 · <strong>L9:</strong> 400 🪙 · <strong>L10:</strong> 500 🪙.</li>
          <li>Get it wrong — or run out of time — and the run ends there. You're paid <strong>half the reward of the last level you cleared</strong> (e.g. failing on Level 5 pays half of Level 4's reward — 50 🪙). Fail on Level 1 with nothing cleared yet and you get 0 coins.</li>
          <li>Clear all 10 levels for the maximum <strong>500 coins</strong>.</li>
          <li>You get <strong>one run per day</strong> — starting a game uses up today's attempt, win or lose.</li>
        </ul>`,
        },
        events: {
          icon: "🎪",
          title: "Events",
          html: `<p>Limited-time challenges where you can win big coins. Tap a banner to join.</p>
        <div class="howto-sec-title">⚔️ Cards Battle</div>
        <p>Live multiplayer — join or create a room, then race other players to guess the card name first.</p>
        <div class="howto-sec-title">🔀 Jumbled Jackpot</div>
        <p>Unscramble card names against the clock, then pick your required cards at the end.</p>
        <div class="howto-sec-title">🎯 Jackpot Event</div>
        <p>Write out every card name in a set from memory, then pick your required cards.</p>
        <p>All three use a room system — one player hosts and starts the game once everyone's in. Look for the <strong>🎓 Demo Room</strong> option to practice without it counting toward your real stats. Tap <strong>🏆 View Leaderboard</strong> on a banner to see today's top scores.</p>`,
        },
        cb: {
          icon: "⚔️",
          title: "Cards Battle",
          html: `<p>A live multiplayer guessing duel.</p>
        <ul>
          <li>Join an open game from the lobby, or tap <strong>＋ Create game</strong> to host your own (the host picks difficulty & timer).</li>
          <li>Or try <strong>🎓 Demo Room</strong> to practice — nothing is saved or counted.</li>
          <li>Once the host starts, a card is announced — type its name in the box and hit <strong>⚔️ Guess</strong> as fast as you can.</li>
          <li>First correct guess each round scores the point. Use the same box to chat with other players.</li>
          <li>The host can end the room early with <strong>🛑 End</strong>; anyone can leave with <strong>✖ Exit</strong>.</li>
        </ul>`,
        },
        jj: {
          icon: "🔀",
          title: "Jumbled Jackpot",
          html: `<p>Unscramble card names against the clock.</p>
        <ul>
          <li>Join an open room or create one — the host sets the round timer and game mode.</li>
          <li><strong>🎯 Normal Mode</strong>: shows the card emoji and two set reference hints to help you unscramble the card name.</li>
          <li><strong>🔥 Hard Mode</strong>: emoji reference is removed (pure scrambled letters + sets reference) with keyboard suggestions strictly blocked!</li>
          <li>Try <strong>🎓 Demo Room</strong> first to practice in either Normal or Hard mode — it leaves no trace on your real stats.</li>
          <li>Once the host starts, everyone gets their own random 10-question round at the same time.</li>
          <li>Each question shows a scrambled card name — type the real name and hit <strong>✅ Submit</strong>.</li>
          <li><strong>💡 Hint</strong> costs coins; <strong>⏭ Skip</strong> moves on without one.</li>
          <li>Answer questions fast for a streak bonus. When your round ends (or the host stops the room), pick your required cards, then check the leaderboard.</li>
        </ul>`,
        },
        jp: {
          icon: "🎯",
          title: "Jackpot Event",
          html: `<p>Write card names from memory against the clock.</p>
        <ul>
          <li>Join an open room or create one — the host sets the round timer and game mode.</li>
          <li><strong>🎯 Normal Mode</strong>: test your memory on a single random set with cards presented in shuffled numerical order.</li>
          <li><strong>🔥 Hard Mode</strong>: ultimate challenge across ALL sets in the game — each card asks for <em>Set X - Card Y</em> with the input box below.</li>
          <li>Try <strong>🎓 Demo Room</strong> first to practice in either Normal or Hard mode — practice rounds leave no trace on your real stats.</li>
          <li>Keyboard suggestions and autocorrect are blocked — you must type every letter yourself!</li>
          <li>Hit <strong>✅ Submit Answers</strong> before the timer runs out — if it hits 0, whatever you've entered is locked in automatically.</li>
          <li>Afterward, pick your requested cards, then check the leaderboard.</li>
        </ul>`,
        },
        social: {
          icon: "🏆",
          title: "Leaderboard",
          html: `<p>See every DA member and how the alliance ranks up.</p>
        <ul>
          <li>Members are ranked by <strong>✨ Aura</strong>, earned through play across the app.</li>
          <li>The top bar shows total members and how many are online right now.</li>
          <li>Use the search box to quickly find a specific member.</li>
        </ul>`,
        },
        coll: {
          icon: "📚",
          title: "My Collection",
          html: `<p>Every card you've collected so far, organized by set.</p>
        <ul>
          <li>Browse <strong>🃏 My Cards</strong> by set using the tabs.</li>
          <li>You get a limited number of <strong>card requests per day</strong> — tap a card, then Request to ask your DA leader for it in the real Township game.</li>
          <li>Check <strong>📬 My Requests</strong> to see status, edit, or cancel a pending request.</li>
          <li>Tap <strong>🛍️ Shop</strong> to spend coins on special items.</li>
        </ul>`,
        },
        shop: {
          icon: "🛍️",
          title: "Card Shop",
          html: `<p>Spend the coins you've earned on special items.</p>
        <ul>
          <li>Tap an item to purchase it with coins — the purchase shows up in <strong>📬 My Requests</strong> as a Shop Purchase.</li>
          <li>While a purchase is still <strong>pending</strong>, you can cancel it from My Requests for a full coin refund.</li>
          <li>Once your DA leader marks it as <strong>given</strong>, it's been handed over in-game and can no longer be cancelled or refunded.</li>
        </ul>`,
        },
        profile: {
          icon: "⚡",
          title: "My Profile",
          html: `<p>Your Dumbledore's Army identity.</p>
        <ul>
          <li>Set your <strong>Name</strong>, <strong>Town Name</strong>, and pick an <strong>Avatar</strong> — tap <strong>💾 Save Profile</strong> when done.</li>
          <li>Your <strong>Player ID</strong> is unique to you — tap <strong>📋 Copy ID</strong> to share it with your DA leader if they ever need it.</li>
          <li><strong>📊 My Stats</strong> shows your current coins, cards collected, and requests made at a glance.</li>
          <li><strong>🚪 Log Out</strong> in the Danger Zone signs you out of this device.</li>
        </ul>`,
        },
      };

      function showHowTo(key) {
        var g = HOW_TO_GUIDE[key];
        if (!g) return;
        document.getElementById("howToIcon").textContent = g.icon || "❓";
        document.getElementById("howToTitle").textContent =
          g.title || "How To Use";
        document.getElementById("howToBody").innerHTML = g.html || "";
        document.getElementById("howToOverlay").classList.add("show");
        if (window.daPushOverlayState)
          window.daPushOverlayState("howToOverlay");
      }
      function closeHowTo(fromPopstate) {
        if (window.daDismissOverlay)
          window.daDismissOverlay("howToOverlay", fromPopstate);
        else document.getElementById("howToOverlay").classList.remove("show");
      }
