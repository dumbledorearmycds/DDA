(function () {
  var CH_KEY = "da_chamber_opened_v1";
  var intro = document.getElementById("magicDoorIntro");

  // Already opened this session? Skip before first paint (no flash of the door).
  if (intro && sessionStorage.getItem(CH_KEY)) {
    intro.classList.add("ch-gone");
    // Reveal app + fire post-login welcome once the main script is parsed.
    window.addEventListener("DOMContentLoaded", function () {
      window._doorOpened = true;
      if (window._tryShowPostLogin) window._tryShowPostLogin();
    });
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

    var audio = document.getElementById("mdAudio");
    if (audio) {
      try {
        audio.volume = 0.35;
        audio.play().catch(function () {});
      } catch (e) {}
    }

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
  };
})();
