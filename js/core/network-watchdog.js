// ══ DDA HUB — 100% ONLINE MANDATE & NETWORK WATCHDOG ══
// Enforces 100% online operation. Offline use and offline gameplay are strictly prohibited.
// Automatically detects network disconnection, prompts the player with a friendly retry screen,
// provides in-flight loading indicators, guarantees up to 3 automatic retries on network jitter,
// and ensures NO action ever fails silently without clear user notification.

(function () {
  'use strict';

  var overlay = null;
  var card = null;
  var statusBox = null;
  var statusText = null;
  var retryBtn = null;
  var isChecking = false;
  var wasOffline = false;

  // In-flight Action Indicator & Error Modal elements
  var actionIndicator = null;
  var actionText = null;
  var actionBadge = null;
  var actionErrorModal = null;
  var actionErrorTitle = null;
  var actionErrorDesc = null;
  var _activeActionRetryCallback = null;
  var _hideIndicatorTimer = null;

  function initElements() {
    if (!overlay) overlay = document.getElementById('noInternetOverlay');
    if (!card) card = document.getElementById('noInternetCard');
    if (!statusBox) statusBox = document.getElementById('noInternetStatus');
    if (!statusText) statusText = document.getElementById('noInternetStatusText');
    if (!retryBtn) retryBtn = document.getElementById('noInternetRetryBtn');
  }

  function initActionElements() {
    if (!actionIndicator) actionIndicator = document.getElementById('networkActionIndicator');
    if (!actionText) actionText = document.getElementById('networkActionText');
    if (!actionBadge) actionBadge = document.getElementById('networkActionBadge');
    if (!actionErrorModal) actionErrorModal = document.getElementById('networkActionErrorModal');
    if (!actionErrorTitle) actionErrorTitle = document.getElementById('naeTitle');
    if (!actionErrorDesc) actionErrorDesc = document.getElementById('naeDesc');
  }

  function showNoInternetModal(customMsg) {
    initElements();
    wasOffline = true;
    if (statusBox) {
      statusBox.className = 'nio-status';
    }
    if (statusText) {
      statusText.textContent = customMsg || 'Offline — No connection';
    }
    if (overlay) {
      overlay.classList.add('show');
    }
  }

  function hideNoInternetModal() {
    initElements();
    if (overlay) {
      overlay.classList.remove('show');
    }
  }

  async function checkInternetConnection(isUserInitiated) {
    initElements();
    if (isChecking) return false;
    isChecking = true;

    if (retryBtn) {
      retryBtn.disabled = true;
      var btnIcon = retryBtn.querySelector('.nio-btn-icon');
      var btnText = retryBtn.querySelector('.nio-btn-text');
      if (btnIcon) btnIcon.textContent = '⏳';
      if (btnText) btnText.textContent = 'Checking connection…';
    }
    if (statusBox) {
      statusBox.className = 'nio-status checking';
    }
    if (statusText) {
      statusText.textContent = 'Testing connection…';
    }

    var isOnline = false;

    if (navigator.onLine) {
      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 3500);
        // Ping icon.svg or manifest.json with cache buster
        var probeUrl = './icon.svg?probe=' + Date.now();
        var response = await fetch(probeUrl, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        isOnline = response && (response.ok || response.status === 304 || response.type === 'opaque');
      } catch (e) {
        // Fallback test: lightweight GET on manifest.json
        try {
          var res2 = await fetch('./manifest.json?probe=' + Date.now(), { method: 'GET', cache: 'no-store' });
          isOnline = res2 && res2.ok;
        } catch (e2) {
          isOnline = false;
        }
      }
    }

    isChecking = false;

    if (isOnline) {
      if (statusBox) {
        statusBox.className = 'nio-status connected';
      }
      if (statusText) {
        statusText.textContent = 'Connected! Resuming…';
      }
      if (retryBtn) {
        var btnIcon = retryBtn.querySelector('.nio-btn-icon');
        var btnText = retryBtn.querySelector('.nio-btn-text');
        if (btnIcon) btnIcon.textContent = '✅';
        if (btnText) btnText.textContent = 'Connected!';
      }
      setTimeout(function () {
        hideNoInternetModal();
        if (retryBtn) {
          retryBtn.disabled = false;
          var btnIcon = retryBtn.querySelector('.nio-btn-icon');
          var btnText = retryBtn.querySelector('.nio-btn-text');
          if (btnIcon) btnIcon.textContent = '🔄';
          if (btnText) btnText.textContent = 'Check Connection & Try Again';
        }
        if (wasOffline) {
          wasOffline = false;
          if (typeof showToast === 'function') {
            showToast('🟢 Internet connection restored!');
          }
          // Re-enable Firestore / RTDB network connection if supported
          if (window.enableFirebaseNetwork && typeof window.enableFirebaseNetwork === 'function') {
            try { window.enableFirebaseNetwork(); } catch (e) {}
          }
          // Trigger retry of pending save if any
          if (typeof window.flushPendingSave === 'function') {
            try { window.flushPendingSave(); } catch (e) {}
          }
        }
      }, 350);
      return true;
    } else {
      if (statusBox) {
        statusBox.className = 'nio-status';
      }
      if (statusText) {
        statusText.textContent = 'Still offline. Check connection.';
      }
      if (card && isUserInitiated) {
        card.classList.remove('nio-shake');
        void card.offsetWidth; // trigger reflow
        card.classList.add('nio-shake');
      }
      if (retryBtn) {
        retryBtn.disabled = false;
        var btnIcon = retryBtn.querySelector('.nio-btn-icon');
        var btnText = retryBtn.querySelector('.nio-btn-text');
        if (btnIcon) btnIcon.textContent = '🔄';
        if (btnText) btnText.textContent = 'Check Connection & Try Again';
      }
      if (isUserInitiated && typeof showToast === 'function') {
        showToast('⚠️ No active internet connection. Please check your Wi-Fi or mobile data.');
      }
      return false;
    }
  }

  // ── IN-FLIGHT ACTION LOADING INDICATOR ──
  function showActionLoading(text, attempt, maxAttempts) {
    initActionElements();
    if (_hideIndicatorTimer) {
      clearTimeout(_hideIndicatorTimer);
      _hideIndicatorTimer = null;
    }
    if (actionIndicator) {
      actionIndicator.classList.remove('success');
      actionIndicator.classList.add('show');
    }
    if (actionText) {
      actionText.textContent = text || 'Processing action…';
    }
    if (actionBadge) {
      if (typeof attempt === 'number' && attempt > 1) {
        actionBadge.textContent = 'Attempt ' + attempt + '/' + (maxAttempts || 3);
        actionBadge.style.display = 'inline-flex';
      } else {
        actionBadge.style.display = 'none';
      }
    }
  }

  function hideActionLoading(successText) {
    initActionElements();
    if (!actionIndicator) return;
    if (_hideIndicatorTimer) clearTimeout(_hideIndicatorTimer);

    if (successText) {
      actionIndicator.classList.add('success');
      if (actionText) actionText.textContent = successText;
      if (actionBadge) actionBadge.style.display = 'none';
      _hideIndicatorTimer = setTimeout(function () {
        if (actionIndicator) actionIndicator.classList.remove('show', 'success');
        _hideIndicatorTimer = null;
      }, 750);
    } else {
      actionIndicator.classList.remove('show', 'success');
    }
  }

  // ── NETWORK ACTION ERROR MODAL (NO SILENT FAILURES) ──
  function showNetworkActionError(title, desc, onRetry) {
    initActionElements();
    _activeActionRetryCallback = typeof onRetry === 'function' ? onRetry : null;
    if (actionErrorTitle) actionErrorTitle.textContent = title || 'Action Could Not Complete';
    if (actionErrorDesc) actionErrorDesc.textContent = desc || 'A network issue occurred. Your account and coins are safe.';
    if (actionErrorModal) {
      actionErrorModal.classList.add('show');
    }
    if (typeof showToast === 'function') {
      showToast('⚠️ ' + (title || 'Network Issue') + ': ' + (desc || 'Action failed'));
    }
  }

  function dismissNetworkActionError() {
    initActionElements();
    if (actionErrorModal) {
      actionErrorModal.classList.remove('show');
    }
    _activeActionRetryCallback = null;
  }

  function retryFailedNetworkAction() {
    var cb = _activeActionRetryCallback;
    dismissNetworkActionError();
    if (typeof cb === 'function') {
      cb();
    }
  }

  // ── RESILIENT NETWORK ACTION EXECUTOR ──
  // Guarantees up to 3 automatic retries on network jitter, prevents duplicates with idempotency,
  // provides loading feedback, and ensures NO action ever fails silently.
  async function executeNetworkAction(actionFn, options) {
    options = options || {};
    var name = options.name || 'action';
    var maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : 3;
    var timeoutMs = options.timeoutMs || 9000;
    var idempotencyKey = options.idempotencyKey || ('op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    var showIndicator = options.showIndicator !== false;

    if (showIndicator) {
      showActionLoading('Processing ' + name + '…', 1, maxRetries);
    }

    var lastError = null;
    var attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      if (attempt > 1) {
        if (showIndicator) {
          showActionLoading('Network jitter. Retrying ' + name + '…', attempt, maxRetries);
        }
        var backoffMs = Math.min(3000, 600 * Math.pow(2, attempt - 2) + Math.random() * 200);
        await new Promise(function (res) { setTimeout(res, backoffMs); });
      }

      // Check live connection before dispatching attempt
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (typeof window.showNoInternetModal === 'function') {
          window.showNoInternetModal('Offline while ' + name + '. Please check connection.');
        }
        if (showIndicator) hideActionLoading();
        var offErr = new Error('Network offline while ' + name);
        offErr.isOffline = true;
        throw offErr;
      }

      var actionTimerId = null;
      try {
        var actionPromise = actionFn(attempt, idempotencyKey);
        var timeoutPromise = new Promise(function (_, reject) {
          actionTimerId = setTimeout(function () {
            reject(new Error('Timeout: ' + name + ' took longer than ' + timeoutMs + 'ms'));
          }, timeoutMs);
        });

        var result;
        try {
          result = await Promise.race([actionPromise, timeoutPromise]);
        } finally {
          if (actionTimerId) {
            clearTimeout(actionTimerId);
            actionTimerId = null;
          }
        }

        if (result === false || result === null) {
          throw new Error(name + ' returned failure');
        }

        if (showIndicator) {
          hideActionLoading(options.successMsg || 'Done!');
        }
        return result;
      } catch (err) {
        lastError = err;
        console.warn('[executeNetworkAction] Attempt ' + attempt + '/' + maxRetries + ' for "' + name + '" failed:', err);

        var errMsg = (err && (err.message || String(err))) || '';
        var isNonRetryable =
          errMsg.includes('permission') ||
          errMsg.includes('PERMISSION_DENIED') ||
          errMsg.includes('Not enough coins') ||
          errMsg.includes('limit reached') ||
          errMsg.includes('User not found') ||
          errMsg.includes('frozen');

        if (isNonRetryable) {
          break;
        }
      }
    }

    // All retries failed — NEVER FAIL SILENTLY!
    if (showIndicator) hideActionLoading();
    console.error('[executeNetworkAction] "' + name + '" failed permanently after ' + attempt + ' attempts:', lastError);

    var friendlyErr = (lastError && (lastError.message || lastError.code)) || 'Network connection timed out';
    var failTitle = options.failTitle || 'Action Could Not Complete';
    var failDesc = options.failMsg || ('A network issue occurred while ' + name + ': ' + friendlyErr + '. Tap Try Again to resubmit safely without duplicate charges.');

    var retryActionFn = function () {
      return executeNetworkAction(actionFn, options);
    };

    showNetworkActionError(failTitle, failDesc, retryActionFn);

    var finalError = lastError || new Error('Network action "' + name + '" failed');
    finalError.failedAfterRetries = true;
    finalError.idempotencyKey = idempotencyKey;
    throw finalError;
  }

  // Network state event listeners
  window.addEventListener('offline', function () {
    console.warn('[NetworkWatchdog] Device went offline.');
    showNoInternetModal('Internet connection lost');
    if (typeof showToast === 'function') {
      showToast('⚠️ Internet connection lost. Please check connection.');
    }
  });

  window.addEventListener('online', function () {
    console.log('[NetworkWatchdog] Device reported online signal. Verifying...');
    checkInternetConnection(false);
  });

  // Export functions to global scope
  window.showNoInternetModal = showNoInternetModal;
  window.hideNoInternetModal = hideNoInternetModal;
  window.checkInternetConnection = checkInternetConnection;
  window.showActionLoading = showActionLoading;
  window.hideActionLoading = hideActionLoading;
  window.showNetworkActionError = showNetworkActionError;
  window.dismissNetworkActionError = dismissNetworkActionError;
  window.retryFailedNetworkAction = retryFailedNetworkAction;
  window.executeNetworkAction = executeNetworkAction;

  // Immediate check on initial execution
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        showNoInternetModal('No internet connection on launch');
      });
    } else {
      showNoInternetModal('No internet connection on launch');
    }
  }
})();
