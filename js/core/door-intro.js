(function () {
  var CH_KEY = "da_chamber_opened_v1";
  var intro = document.getElementById("magicDoorIntro");
  var audio = document.getElementById("mdAudio");
  var bdayAudio = document.getElementById("bdayAudio");

  // Track birthday playback state globally
  window._bdaySongPlaying = false;
  if (bdayAudio) {
    bdayAudio.addEventListener("ended", function () {
      window._bdaySongPlaying = false;
    });
  }

  // ── Helper: Date of Birth formatting & Birthday check ──────
  function isTodayBirthday(dobStr) {
    if (!dobStr || typeof dobStr !== "string") return false;
    var parts = dobStr.split("-");
    var month, day;
    if (parts.length === 3) {
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else {
      return false;
    }
    if (isNaN(month) || isNaN(day)) return false;
    var now = new Date();
    var curMonth = now.getMonth() + 1;
    var curDay = now.getDate();
    if (curMonth === month && curDay === day) return true;
    if (month === 2 && day === 29 && curMonth === 2 && curDay === 28) {
      var isLeap = function (y) {
        return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      };
      if (!isLeap(now.getFullYear())) return true;
    }
    return false;
  }
  window.isTodayBirthday = window.isTodayBirthday || isTodayBirthday;

  function checkIsUserBirthdayToday() {
    if (window._isUserBirthdayToday === true) return true;

    // Check window.profile if available
    try {
      if (window.profile && window.profile.dob && isTodayBirthday(window.profile.dob)) {
        window._isUserBirthdayToday = true;
        return true;
      }
    } catch (e) {}

    // Check localStorage active session
    var sessionPid = "";
    try {
      var rawSess = localStorage.getItem("da_session");
      if (rawSess) {
        var sess = JSON.parse(rawSess);
        sessionPid = sess && (sess.playerId || sess.pid || sess.id);
      }
    } catch (e) {}

    // Check cached DOB by player ID
    if (sessionPid) {
      try {
        var cachedDob = localStorage.getItem("da_user_dob_" + sessionPid);
        if (cachedDob && isTodayBirthday(cachedDob)) {
          window._isUserBirthdayToday = true;
          return true;
        }
      } catch (e) {}
    }

    // Check global cached active DOB
    try {
      var globalDob = localStorage.getItem("da_active_dob");
      if (globalDob && isTodayBirthday(globalDob)) {
        window._isUserBirthdayToday = true;
        return true;
      }
    } catch (e) {}

    // Check saved accounts on this device (da_saved_accounts)
    try {
      var rawSaved = localStorage.getItem("da_saved_accounts");
      if (rawSaved) {
        var savedList = JSON.parse(rawSaved);
        if (Array.isArray(savedList) && savedList.length > 0) {
          if (sessionPid) {
            var match = savedList.find(function (a) {
              return a && (a.playerId === sessionPid || a.pid === sessionPid);
            });
            if (match && match.dob && isTodayBirthday(match.dob)) {
              window._isUserBirthdayToday = true;
              return true;
            }
          } else if (savedList.length === 1 && savedList[0] && savedList[0].dob) {
            if (isTodayBirthday(savedList[0].dob)) {
              window._isUserBirthdayToday = true;
              return true;
            }
          }
        }
      }
    } catch (e) {}

    return false;
  }
  window.checkIsUserBirthdayToday = checkIsUserBirthdayToday;

  // Background pre-fetch of DOB if device is logged in but DOB is not yet cached in localStorage
  window._dobFetchPromise = null;
  try {
    var rawSess = localStorage.getItem("da_session");
    if (rawSess) {
      var sessObj = JSON.parse(rawSess);
      var sPid = sessObj && (sessObj.playerId || sessObj.pid || sessObj.id);
      if (sPid && !localStorage.getItem("da_user_dob_" + sPid)) {
        window._dobFetchPromise = fetch(
          "https://firestore.googleapis.com/v1/projects/dacds-aae0c/databases/(default)/documents/da_users/" + sPid
        )
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var dProfile =
              data &&
              data.fields &&
              data.fields.profile &&
              data.fields.profile.mapValue &&
              data.fields.profile.mapValue.fields;
            var dDob = dProfile && dProfile.dob && dProfile.dob.stringValue;
            if (dDob) {
              try {
                localStorage.setItem("da_user_dob_" + sPid, dDob);
                localStorage.setItem("da_active_dob", dDob);
              } catch (e) {}
              if (isTodayBirthday(dDob)) {
                window._isUserBirthdayToday = true;
                if (bdayAudio) {
                  try { bdayAudio.load(); } catch (e) {}
                }
              }
            }
          })
          .catch(function () {});
      }
    }
  } catch (e) {}

  // Already opened this session? Skip before first paint (no flash of the door).
  if (intro && sessionStorage.getItem(CH_KEY)) {
    intro.classList.add("ch-gone");
    // Reveal app + fire post-login welcome once the main script is parsed.
    window.addEventListener("DOMContentLoaded", function () {
      window._doorOpened = true;
      if (window._tryShowPostLogin) window._tryShowPostLogin();
    });
  } else {
    // Pre-warm appropriate audio buffer ahead of user interaction
    try {
      if (checkIsUserBirthdayToday() && bdayAudio) {
        bdayAudio.load();
      } else if (audio) {
        audio.load();
      }
    } catch (e) {}
  }

  var __chOpened = false;
  window.openChamber = function () {
    if (__chOpened || !intro) return;
    __chOpened = true;
    try {
      sessionStorage.setItem(CH_KEY, "1");
    } catch (e) {}

    // If pre-fetch is still active and birthday not yet verified, allow up to 180ms race
    if (window._dobFetchPromise && !checkIsUserBirthdayToday()) {
      var raceTimeout = new Promise(function (res) { setTimeout(res, 180); });
      Promise.race([window._dobFetchPromise, raceTimeout])
        .then(executeChamberOpen)
        .catch(executeChamberOpen);
    } else {
      executeChamberOpen();
    }
  };

  function executeChamberOpen() {
    var reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    var started = false;
    function startAnimation() {
      if (started) return;
      started = true;

      // Trigger GPU-accelerated parting of the gates & light flare
      intro.classList.add("is-opening");

      // Smoothly reveal website content and trigger welcome modal
      var revealDelay = reduce ? 300 : 1000;
      setTimeout(function () {
        window._doorOpened = true;
        if (window._tryShowPostLogin) window._tryShowPostLogin();
        intro.classList.add("is-hidden");

        setTimeout(function () {
          intro.style.display = "none";
        }, 500);
      }, revealDelay);
    }

    var isBdayToday = checkIsUserBirthdayToday();
    if (isBdayToday && bdayAudio) {
      // 🎂 BIRTHDAY OPENING SONG:
      // Play Birthday_song.mp3 instead of the old door opening audio!
      try {
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
        bdayAudio.volume = 0.75;
        bdayAudio.currentTime = 0;
        window._bdaySongPlaying = true;
        var p = bdayAudio.play();
        if (p && typeof p.then === "function") {
          p.then(startAnimation).catch(startAnimation);
        } else {
          startAnimation();
        }
      } catch (e) {
        startAnimation();
      }
      setTimeout(startAnimation, 50);
    } else if (audio) {
      // REGULAR OPENING AUDIO:
      // After birthday ends (or for players not having birthday today), play regular door opening audio
      try {
        if (bdayAudio) {
          bdayAudio.pause();
          bdayAudio.currentTime = 0;
        }
        audio.volume = 0.35;
        audio.currentTime = 0;
        var p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(startAnimation).catch(startAnimation);
        } else {
          startAnimation();
        }
      } catch (e) {
        startAnimation();
      }
      setTimeout(startAnimation, 50);
    } else {
      startAnimation();
    }
  }
})();
