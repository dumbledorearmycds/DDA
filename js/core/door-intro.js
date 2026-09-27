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
        } else if (intro) {
          // Spawn floating dust motes for the idle scene.
          try {
            var dust = document.getElementById("chDust"),
              i,
              m;
            for (i = 0; i < 10; i++) {
              m = document.createElement("span");
              m.className = "ch-mote";
              m.style.left = (Math.random() * 100).toFixed(1) + "%";
              m.style.setProperty(
                "--s",
                (2 + Math.random() * 4).toFixed(1) + "px",
              );
              m.style.setProperty(
                "--d",
                (7 + Math.random() * 7).toFixed(1) + "s",
              );
              m.style.setProperty(
                "--delay",
                (-Math.random() * 9).toFixed(1) + "s",
              );
              m.style.setProperty(
                "--drift",
                (Math.random() * 40 - 20).toFixed(0) + "px",
              );
              dust.appendChild(m);
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

          var reduce = false;
          try {
            reduce = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
          } catch (e) {}

          var audio = document.getElementById("mdAudio");
          if (audio) {
            try {
              audio.volume = 0.3;
              audio.play().catch(function () {});
            } catch (e) {}
          }

          intro.classList.add("is-opening");

          // Green particle burst as the doors part.
          if (!reduce) {
            try {
              var sparks = document.getElementById("chSparks"),
                n = 18,
                k,
                sp,
                ang,
                dist;
              for (k = 0; k < n; k++) {
                sp = document.createElement("span");
                sp.className = "ch-spark";
                ang = Math.PI * 2 * (k / n) + Math.random() * 0.5;
                dist = 90 + Math.random() * 150;
                sp.style.setProperty(
                  "--tx",
                  (Math.cos(ang) * dist).toFixed(0) + "px",
                );
                sp.style.setProperty(
                  "--ty",
                  (Math.sin(ang) * dist - 40).toFixed(0) + "px",
                );
                sp.style.setProperty(
                  "--sd",
                  (1.1 + Math.random() * 0.8).toFixed(2) + "s",
                );
                sparks.appendChild(sp);
              }
            } catch (e) {}
          }

          // Reveal the website: crossfade the chamber out + trigger the welcome sequence.
          var revealDelay = reduce ? 500 : 1950;
          setTimeout(function () {
            window._doorOpened = true;
            if (window._tryShowPostLogin) window._tryShowPostLogin();
            intro.classList.add("is-hidden");
            setTimeout(function () {
              intro.style.display = "none";
            }, 950);
          }, revealDelay);
        };
      })();
