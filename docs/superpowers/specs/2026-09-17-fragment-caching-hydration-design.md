# Client-Side Fragment Caching with Dynamic "Hole" Hydration Design Specification

**Date**: 2026-09-17  
**Status**: Approved  
**Target Codebase**: `index.html` (Single-file PWA, Vanilla JS)  
**Target Components**: Collection Grid (`renderCollGrid`), CDS Browse Grid (`renderCdsGrid`), Shop Grid (`renderShopGrid`)  

---

## 1. Problem Statement

In `DA Hub`, card catalog data (`SETS`) contains 150+ cards spanning multiple sets. Currently, whenever a player switches between set tabs, opens CDS, or receives a card update:
1. The container element (`#collGrid` or `#cdsGrid`) has its inner HTML wiped clean (`grid.innerHTML = ''`).
2. DOM card elements are re-created from scratch in a loop.
3. Static artwork (`cardArtHTML`), image tags, fallback emoji containers, card names, and numbers are repeatedly re-parsed and reconstructed.
4. Independent event listeners are repeatedly attached to every single card DOM node.

This causes continuous layout thrashing, DOM node garbage collection, image re-decoding, and visible frame drops on mobile devices.

---

## 2. Architecture & Design

### 2.1 Delegated Event Handling
Instead of attaching separate event listeners to every card DOM node:
- `#collGrid` uses a single delegated `click` listener checking `e.target.closest('.coll-card[data-ci]')` and calling `openCardActionModal(collSetIdx, Number(card.dataset.ci))`.
- `#cdsGrid` uses a single delegated `click` listener checking `e.target.closest('.coll-card[data-ci]')` and calling `cdsToggleRequest(cdsSetIdx, Number(card.dataset.ci))`.

### 2.2 Fragment Cache (`_collFragmentCache` & `_cdsFragmentCache`)
A memory cache stores pre-rendered static HTML card shells for each set:
- Card base container: `<div class="coll-card" data-ci="${ci}">`
- Static art: `cardArtHTML(card, 'coll-card-art-img', 'coll-card-emoji')`
- Static text: `<div class="coll-card-name">${card.name}</div><div class="coll-card-number">${ci + 1}</div>`
- Dynamic "Hole" placeholders:
  - `<div class="card-badge-hole"></div>` (for Gold, New, and Duplicates badges)
  - `<div class="card-req-hole"></div>` (for Requested ticks and labels)

### 2.3 Selective Hole Hydration
When rendering a set:
1. If the grid's current dataset set index matches `collSetIdx`, **the DOM is not touched or re-injected**.
2. If changing sets, the cached template HTML is injected in a single atomic `innerHTML` write (0ms).
3. `hydrateCollGridHoles(grid, setIdx)` iterates only the child cards and selectively updates:
   - Dynamic CSS classes: `.classList.toggle('unlocked', isOwned)`, `.classList.toggle('locked', !isOwned)`, `.classList.toggle('requested', alreadyRequested)`, `.classList.toggle('has-dupes', dupes > 0)`, `.classList.toggle('is-new', isNew)`.
   - Content of `.card-badge-hole`.
   - Content of `.card-req-hole`.
   - Element `.title`.

### 2.4 Invalidation
- Static fragments are generated once on demand per set.
- Dynamic hole hydration is executed whenever player progress changes (`notifyNewCard`, `cdsToggleRequest`, `saveProgress`), taking <1ms without any DOM re-creation.

---

## 3. Verification Plan
- Unit tests verifying fragment generation, cache hits, hole hydration, and delegated event handling.
- Syntax verification via `python clean_check.py` ensuring all 11 scripts validate clean.
