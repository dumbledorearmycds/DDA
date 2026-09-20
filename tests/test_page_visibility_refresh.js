const assert = require('assert');

// Test suite for Page Visibility Auto-Refresh logic
console.log('Running Page Visibility Auto-Refresh Tests...');

function createVisibilityManager(options = {}) {
  const {
    minBackgroundTimeMs = 10000,
    reloadCooldownMs = 30000,
    storageKey = 'dda_last_visibility_reload'
  } = options;

  let wasHidden = false;
  let hiddenAt = 0;
  let lastInputAt = 0;
  let reloadCalled = 0;
  let serviceWorkerUpdated = false;

  const mockSessionStorage = new Map();
  const mockElements = [];
  let activeElement = null;
  let currentTime = 1000000;

  function getTime() {
    return currentTime;
  }

  function setTime(t) {
    currentTime = t;
  }

  function advanceTime(ms) {
    currentTime += ms;
  }

  function recordInput() {
    lastInputAt = getTime();
  }

  function setActiveElement(el) {
    activeElement = el;
  }

  function addElement(el) {
    mockElements.push(el);
  }

  function hasActiveInputOrUnsavedChanges() {
    // 1. User typed within the last 5 seconds
    if (getTime() - lastInputAt < 5000) {
      return true;
    }

    // 2. Focused element is an editable input/textarea
    if (activeElement) {
      const tag = (activeElement.tagName || '').toLowerCase();
      if (tag === 'textarea' || activeElement.isContentEditable) {
        return true;
      }
      if (tag === 'input') {
        const type = (activeElement.type || 'text').toLowerCase();
        const nonTextTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'range', 'color'];
        if (!nonTextTypes.includes(type)) {
          return true;
        }
      }
    }

    // 3. Any text input or textarea contains unsaved user input
    for (const el of mockElements) {
      const tag = (el.tagName || '').toLowerCase();
      const type = (el.type || 'text').toLowerCase();

      if (tag === 'textarea') {
        if (el.value !== el.defaultValue && (el.value || '').trim().length > 0) {
          return true;
        }
      } else if (tag === 'input') {
        const isTextual = ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(type);
        if (isTextual && el.value !== el.defaultValue && (el.value || '').trim().length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  function handleVisibilityChange(visibilityState) {
    if (visibilityState === 'hidden') {
      wasHidden = true;
      hiddenAt = getTime();
    } else if (visibilityState === 'visible') {
      if (!wasHidden) return false;
      const timeInBackground = getTime() - hiddenAt;
      wasHidden = false;

      if (timeInBackground < minBackgroundTimeMs) {
        return false;
      }

      let lastReload = 0;
      try {
        lastReload = parseInt(mockSessionStorage.get(storageKey) || '0', 10);
      } catch (e) {}

      if (getTime() - lastReload < reloadCooldownMs) {
        return false;
      }

      if (hasActiveInputOrUnsavedChanges()) {
        return false;
      }

      try {
        mockSessionStorage.set(storageKey, getTime().toString());
      } catch (e) {}

      serviceWorkerUpdated = true;
      reloadCalled++;
      return true;
    }
    return false;
  }

  return {
    getTime,
    setTime,
    advanceTime,
    recordInput,
    setActiveElement,
    addElement,
    hasActiveInputOrUnsavedChanges,
    handleVisibilityChange,
    getReloadCount: () => reloadCalled,
    isServiceWorkerUpdated: () => serviceWorkerUpdated,
    getSessionStorage: () => mockSessionStorage
  };
}

// Test 1: Initial page load / visible event without being hidden first
{
  const mgr = createVisibilityManager();
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should not reload if tab was never hidden');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 1 Passed: No reload on initial tab load/visible event');
}

// Test 2: Brief background state (< 10 seconds)
{
  const mgr = createVisibilityManager();
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(3000); // 3 seconds in background
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should not reload if hidden for less than 10 seconds');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 2 Passed: Brief background switch (< 10s) does not trigger reload');
}

// Test 3: Tab left in background (> 10 seconds) with no active input -> triggers reload
{
  const mgr = createVisibilityManager();
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(15000); // 15 seconds in background
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, true, 'Should reload if tab was in background for >10s');
  assert.strictEqual(mgr.getReloadCount(), 1);
  assert.strictEqual(mgr.isServiceWorkerUpdated(), true);
  console.log('✅ Test 3 Passed: Tab in background > 10s triggers clean reload and SW update');
}

// Test 4: Prevent reload loops via cooldown
{
  const mgr = createVisibilityManager({ reloadCooldownMs: 30000 });
  // First reload
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(15000);
  assert.strictEqual(mgr.handleVisibilityChange('visible'), true);
  assert.strictEqual(mgr.getReloadCount(), 1);

  // Tab hidden again and visible after 12s, but only 12s since last reload (< 30s cooldown)
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(12000);
  assert.strictEqual(mgr.handleVisibilityChange('visible'), false, 'Cooldown should prevent immediate second reload');
  assert.strictEqual(mgr.getReloadCount(), 1);

  // Once cooldown passes (> 30s total)
  mgr.advanceTime(20000);
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(15000);
  assert.strictEqual(mgr.handleVisibilityChange('visible'), true, 'Should reload once cooldown has elapsed');
  assert.strictEqual(mgr.getReloadCount(), 2);
  console.log('✅ Test 4 Passed: Cooldown stops rapid/infinite reload loops');
}

// Test 5: Safeguard against active input focus
{
  const mgr = createVisibilityManager();
  mgr.setActiveElement({ tagName: 'INPUT', type: 'text' });
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(20000);
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should skip reload when input is focused');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 5 Passed: Active input focus prevents reload');
}

// Test 6: Safeguard against active textarea focus
{
  const mgr = createVisibilityManager();
  mgr.setActiveElement({ tagName: 'TEXTAREA' });
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(20000);
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should skip reload when textarea is focused');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 6 Passed: Active textarea focus prevents reload');
}

// Test 7: Safeguard against unsaved form input (dirty text)
{
  const mgr = createVisibilityManager();
  mgr.addElement({
    tagName: 'INPUT',
    type: 'text',
    defaultValue: '',
    value: 'User typed comments here'
  });
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(20000);
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should skip reload when unsaved text exists in input');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 7 Passed: Unsaved form input prevents reload');
}

// Test 8: Safeguard against recent user typing
{
  const mgr = createVisibilityManager();
  mgr.handleVisibilityChange('hidden');
  mgr.advanceTime(20000);
  // User typed 2 seconds ago
  mgr.recordInput();
  mgr.advanceTime(2000);
  const reloaded = mgr.handleVisibilityChange('visible');
  assert.strictEqual(reloaded, false, 'Should skip reload when user recently typed');
  assert.strictEqual(mgr.getReloadCount(), 0);
  console.log('✅ Test 8 Passed: Recent typing activity within 5s prevents reload');
}

console.log('\n🎉 ALL PAGE VISIBILITY AUTO-REFRESH TESTS PASSED SUCCESSFULLY!');
