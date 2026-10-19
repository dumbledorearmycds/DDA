(function () {
  var CH_KEY = "da_chamber_opened_v1";
  var intro = document.getElementById("magicDoorIntro");
  var audio = document.getElementById("mdAudio");

  // Already opened this session? Skip before first paint (no flash of the door).
  if (intro && sessionStorage.getItem(CH_KEY)) {
    intro.classList.add("ch-gone");
    // Reveal app + fire post-login welcome once the main script is parsed.
    window.addEventListener("DOMContentLoaded", function () {
      window._doorOpened = true;
      if (window._tryShowPostLogin) window._tryShowPostLogin();
    });
  } else if (audio) {
    // Pre-warm audio buffer ahead of user interaction
    try {
      audio.load();
    } catch (e) {}
  }

  var __chOpened = false;
  window.openChamber = function () {
    if (__chOpened || !intro) return;
    __chOpened = true;
    try {
      sessionStorage.setItem(CH_KEY, "1");
    } catch (e) {}

    var reduce = false;
    try {
      reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
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

    if (audio) {
      try {
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
      // Failsafe: start animation within 50ms regardless of audio autoplay state
      setTimeout(startAnimation, 50);
    } else {
      startAnimation();
    }
  };
})();
