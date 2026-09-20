# AGENTS.md — Workspace Rules

## Browser Testing
- **DO NOT use Playwright / `browser_subagent`** for browser testing.
- **ALWAYS use `chrome-devtools-mcp`** (via `call_mcp_tool` with `ServerName: "chrome-devtools-mcp"`) for all browser navigation, testing, UI inspection, script evaluation, and screenshot capture.

## Repository Cleanliness & GitHub Upload Discipline
- **ONLY upload the necessary files which are required to run the website and app.**
- **NEVER upload irrelevant files to GitHub**: test scripts (`tests/`), specs and plan documentation (`docs/`), scratch/debug scripts (`*.py`, `_temp*`), internal audit reports, or design documents.
- Keep `.gitignore` updated to prevent accidental commits of non-production assets.

