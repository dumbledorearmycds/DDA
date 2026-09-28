# AGENTS.md — Workspace Rules

## Browser Testing
- **DO NOT use Playwright / `browser_subagent`** for browser testing.
- **ALWAYS use `chrome-devtools-mcp`** (via `call_mcp_tool` with `ServerName: "chrome-devtools-mcp"`) for all browser navigation, testing, UI inspection, script evaluation, and screenshot capture.

## Repository Cleanliness & GitHub Upload Discipline
- **ONLY upload the necessary files which are required to run the website and app.**
- **NEVER upload irrelevant files to GitHub**: test scripts (`tests/`), specs and plan documentation (`docs/`), scratch/debug scripts (`*.py`, `_temp*`), internal audit reports, or design documents.
- Keep `.gitignore` updated to prevent accidental commits of non-production assets.

## Game Design Rules & Mechanics
- **Card Request & Collection Removal on Fulfillment (INTENTIONAL FEATURE)**:
  - Requesting an **unowned card** costs coins (`100 🪙` standard / `200 🪙` gold).
  - Requesting an **already owned card** costs **`0 coins`** (player trades their website card inventory for in-game Township delivery).
  - When the admin fulfills the request ("Done") in Township:
    - If the player has duplicate copies (`dupes > 0`), 1 duplicate is removed from their collection (`dupes -= 1`).
    - If the player has only 1 copy (`dupes == 0`), that card is **completely removed** from their collection (`delete owned[key]`), and the player must earn/win that card again on the website.
    - If reverted to Pending, the removed card/duplicate is restored (`adminRestoreCardToPlayer`).

## Synchronized Web & App (PWA) Updates (MANDATORY)
- **WHENEVER YOU MAKE CHANGES IN THE WEBSITE (`index.html`), ALWAYS UPDATE THE APP ALSO (`sw.js`)**:
  - Always bump the Service Worker cache version in `sw.js` (e.g. `const CACHE_NAME = 'dda-hub-v10'` -> `v11`, etc.).
  - Mobile devices, installed homescreen apps (PWAs), and browsers rely on `sw.js` changes to detect updates. If `sw.js` is not updated, installed apps and mobile users will remain stuck on obsolete/cached code and exhaust quotas.
  - Both `index.html` and `sw.js` must ALWAYS be deployed together.

## Senior Backend Developer & Firebase Quota Audit Discipline (MANDATORY)
- **Always act as a Senior Backend Developer**:
  - Whenever reviewing, authoring, or refactoring code interacting with Firebase (Cloud Firestore, Realtime Database, Cloud Storage):
    1. **Strictly Audit Against Quota & Limit Explosions**:
       - Never write unbounded queries (`getDocs(collection)`); always bound with `limit(...)` and appropriate ordering.
       - Prevent snapshot listener leaks or duplicate registrations with strict deduplication guards and trackable unsubscriptions.
       - Eliminate redundant read cycles (e.g. avoid calling `getDoc` immediately before registering an `onSnapshot` listener on the same doc).
       - Batch writes and approvals to prevent cascade snapshot storms across online clients.
       - Use client-side in-memory caching with TTL for frequently read shared or public documents.
       - Protect mobile background transitions: apply an inactivity grace period on visibility changes to avoid listener churn on rapid app switches.
    2. **Guarantee Safe Read Buffers**: Maintain a large daily safety buffer (>90% headroom) under the Firebase free quota tier for all daily operations.



