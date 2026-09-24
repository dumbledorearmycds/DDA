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


