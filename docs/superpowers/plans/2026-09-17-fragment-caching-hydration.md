# Client-Side Fragment Caching with Dynamic "Hole" Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate DOM thrashing, image re-decoding, and per-card listener creation by caching static card fragments and selectively hydrating personalized dynamic regions ("holes").

**Architecture:** Pre-render and cache static HTML fragments for card sets in memory; mount or retain existing DOM nodes in the grid; selectively patch only dynamic personalized holes (owned status, dupe count, request status) with event delegation on the parent container.

**Tech Stack:** Vanilla JavaScript, DOM API, Node.js unit tests.

---

### Task 1: Write Unit Test for Fragment Caching & Selective Hydration

**Files:**
- Test: `tests/test_fragment_caching.js`

- [ ] **Step 1: Write unit test harness**

Test static fragment creation, dynamic hole hydration, class toggling, and delegated click routing.

- [ ] **Step 2: Run test to verify it executes cleanly**

Run: `node tests/test_fragment_caching.js`

---

### Task 2: Implement Fragment Caching & Delegated Hydration in `renderCollGrid`

**Files:**
- Modify: `index.html:18295-18350`

- [ ] **Step 1: Implement `_collFragmentCache` and delegated event listener for `#collGrid`**
- [ ] **Step 2: Implement `renderCollGrid` with fast static template reuse and `hydrateCollGridHoles`**
- [ ] **Step 3: Run `python clean_check.py` to verify syntax**

---

### Task 3: Implement Fragment Caching & Delegated Hydration in `renderCdsGrid`

**Files:**
- Modify: `index.html:18655-18705`

- [ ] **Step 1: Implement `_cdsFragmentCache` and delegated event listener for `#cdsGrid`**
- [ ] **Step 2: Implement `renderCdsGrid` with fast static template reuse and `hydrateCdsGridHoles`**
- [ ] **Step 3: Run `python clean_check.py` to verify syntax**

---

### Task 4: Master Verification & Integration Test

**Files:**
- Test: `tests/run_all_tests.js`

- [ ] **Step 1: Update `tests/run_all_tests.js` to include `test_fragment_caching.js`**
- [ ] **Step 2: Run `node tests/run_all_tests.js`**
- [ ] **Step 3: Run `python clean_check.py`**
