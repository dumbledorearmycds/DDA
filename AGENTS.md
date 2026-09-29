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

## Card Requests Are First Priority — NEVER LIMIT (ABSOLUTE MANDATE)
- **Card requests (`da_card_requests`) are the website's #1 core feature and highest priority.**
- **NEVER put a query limit (`limit(...)`) on card requests queries or listeners for admins.**
- Admins MUST see 100% of all player card requests across the entire community (all active, pending, and unfulfilled cards).
- Bounding with `limit(...)` on card requests is STRICTLY FORBIDDEN because it cuts off older active player requests from being fulfilled by the leader.
- Quota optimization must focus on eliminating redundant read cycles, deduplicating listeners, in-memory caching for leaderboards, and preventing listener churn on visibility change—**NEVER by truncating or limiting player card requests**.

## Senior Backend Developer & Firebase Quota Audit Discipline (MANDATORY)
- **Always act as a Senior Backend Developer**:
  - Whenever reviewing, authoring, or refactoring code interacting with Firebase (Cloud Firestore, Realtime Database, Cloud Storage):
    1. **Strictly Audit Against Quota & Limit Explosions**:
       - Bound queries with `limit(...)` and appropriate ordering **EXCEPT for Admin Card Requests (`da_card_requests`), which must NEVER be limited**.
       - Prevent snapshot listener leaks or duplicate registrations with strict deduplication guards and trackable unsubscriptions.
       - Eliminate redundant read cycles (e.g. avoid calling `getDoc` immediately before registering an `onSnapshot` listener on the same doc).
       - Batch writes and approvals to prevent cascade snapshot storms across online clients.
       - Use client-side in-memory caching with TTL for frequently read shared or public documents.
       - Protect mobile background transitions: apply an inactivity grace period on visibility changes to avoid listener churn on rapid app switches.
    2. **Guarantee Safe Read Buffers**: Maintain a large daily safety buffer (>90% headroom) under the Firebase free quota tier for all daily operations.

## 🚨 Mandatory Responsive UI Testing — Chrome DevTools MCP

### Core Rule
- This project has access to the Chrome DevTools MCP server.
- For EVERY task that adds, removes, modifies, or visually changes UI, responsive behavior must be considered part of the task.
- The actual rendered website must be tested using Chrome DevTools MCP when the change can affect layout, sizing, positioning, spacing, typography, navigation, or responsiveness.
- Do NOT rely only on reading HTML/CSS/JS.
- Do NOT assume that a layout is responsive simply because the CSS looks responsive.

### Responsive Testing Strategy
Do NOT unnecessarily test every viewport for every tiny change. Use the following testing levels:

#### LEVEL 1 — Normal UI Changes
For small UI changes that are unlikely to affect layout (colors, icons, borders, shadows, minor typography, text/content changes, small visual adjustments), test at these three representative mobile viewports:
- **320 × 800** — narrow phone
- **390 × 844** — common phone
- **430 × 932** — large phone

#### LEVEL 2 — Layout / Responsive Changes
If the task modifies anything that can affect layout or responsive behavior (Header/topbar, navigation, card/grid, flexbox/grid, container width, padding/margin, font-size affecting layout, new components, fixed/absolute positioning, modals, responsive breakpoints, page structure), test ALL of the following:
- **320 × 800**
- **360 × 800**
- **375 × 812**
- **390 × 844**
- **393 × 873**
- **412 × 915**
- **430 × 932**

#### LEVEL 3 — Responsive Bug Fixes
When fixing an existing responsive bug:
1. Test the viewport where the bug was discovered.
2. Test **320 × 800**.
3. Test **390 × 844**.
4. Test **430 × 932**.
5. Test any nearby breakpoint where the bug could occur.
6. If the fix involves a breakpoint or major layout change, run the full Level 2 viewport matrix.
*A fix that works on one phone but breaks another viewport is NOT considered complete.*

### Tablet / Desktop Testing
When a change affects larger layouts, also test:
- **768 × 1024**
- **1280 × 720**
*Do not allow a mobile fix to break tablet or desktop layouts.*

### Chrome DevTools MCP Requirement
When responsive testing is required, use Chrome DevTools MCP to:
1. Open/navigate to the affected page.
2. Set the required viewport dimensions.
3. Inspect the rendered page.
4. Check the affected component visually.
5. Check for horizontal overflow.
6. Inspect DOM/computed styles when necessary.
7. Identify the actual element causing a problem.
8. Fix the underlying issue.
9. Re-test after the fix.
*Use screenshots when useful for visual verification.*

### Horizontal Overflow Policy
At every required mobile viewport, check whether the document is wider than the viewport:
`document.documentElement.scrollWidth > viewport width`
If horizontal overflow exists:
1. Identify the element responsible.
2. Determine the underlying CSS/layout cause.
3. Fix the responsible component.
4. Re-test the required viewports.
*DO NOT blindly fix responsive problems using `overflow-x: hidden;`. Only use overflow clipping when it is intentionally required by the design.*

### Responsive Visual Checklist
At every required viewport check:
- **Header / Topbar**: No clipping, no horizontal overflow, no overlapping controls, logo remains usable, profile/user area adapts, long usernames truncate correctly, icons remain visible, notification badges remain correctly positioned.
- **Main Content**: Cards fit the viewport, grids adapt correctly, images maintain correct aspect ratio, text does not overflow, buttons remain usable, sections do not overlap.
- **Navigation**: Bottom navigation fits inside viewport, icons and labels remain aligned, active state remains visible, touch targets remain usable.
- **Modals / Dialogs**: Fit inside viewport, no horizontal overflow, close button remains accessible, content can scroll vertically when necessary.
- **Fixed / Sticky Elements**: Correct position, no clipping, no overlap with other UI or important content, safe-area spacing respected where necessary.

### Long Content Testing
When the changed component contains text, test realistic long content (very long usernames, long card titles, long button labels, long notifications, multiple badges, empty states, error messages). Do not test only with short, ideal content. Long content must not cause layout breakage.

### Responsive Implementation Rule
Prefer one fluid responsive layout instead of device-specific hacks (use Flexbox, CSS Grid, `flex-shrink`, `min-width: 0`, `max-width`, `clamp()`, percentages, intrinsic sizing, responsive spacing, appropriate text wrapping). Avoid unnecessary device-specific breakpoints. Viewport sizes are TESTING TARGETS, not separate designs.

### Do NOT Fix Only the Symptom
If something overflows at 360px:
- DO NOT simply hide it.
- DO NOT arbitrarily shrink the entire UI.
- DO NOT randomly reduce font size.
- DO NOT add a one-off breakpoint without understanding the cause.
*Identify the actual cause (fixed widths, min-width, padding, gaps, positioning, flex/grid behavior, text constraints), fix the underlying layout, and re-test.*

### Regression Testing
Whenever an existing component is modified, verify that the change did not introduce a responsive regression elsewhere (e.g., header change -> test entire page; card change -> test surrounding layout & nav; bottom nav change -> test full page height & content; typography change -> test long/short content).

### Definition of Done for UI Tasks
A UI-related task is NOT complete until:
- The implementation works at the appropriate mobile viewports.
- No unexpected horizontal overflow exists.
- No important content is clipped.
- No UI elements overlap.
- Navigation remains usable.
- Fixed/sticky elements remain correctly positioned.
- Long content is handled correctly.
- No responsive regression was introduced.
- The appropriate Chrome DevTools MCP validation has been performed.




