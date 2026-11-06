(() => {
  const STORAGE_KEY = "soundscout_install_prompt_dismissed_at";
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const isPhone = window.matchMedia("(max-width: 768px)").matches;
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (!isPhone || isInstalled) return;

  let deferredPrompt = null;
  let promptShown = false;
  let dismissedAt = 0;
  try { dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || 0); } catch (_) {}
  if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;

  const mount = () => {
    if (document.getElementById("soundscout-install-prompt")) return;
    const overlay = document.createElement("div");
    overlay.id = "soundscout-install-prompt";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ss-install-title");
    overlay.innerHTML = `
      <section class="ss-install-card">
        <button class="ss-install-close" type="button" aria-label="Close">×</button>
        <div class="ss-install-mark" aria-hidden="true">⌁</div>
        <h2 id="ss-install-title">Take SoundScout with you.</h2>
        <p>Install the SoundScout web app on your phone for an app-like experience. No APK download or app-store update needed.</p>
        <button class="ss-install-primary" type="button">Install SoundScout</button>
        <div class="ss-install-help" role="status"></div>
        <button class="ss-install-secondary" type="button">Maybe later</button>
      </section>`;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.classList.remove("is-visible");
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_) {}
    };
    overlay.querySelector(".ss-install-close").addEventListener("click", close);
    overlay.querySelector(".ss-install-secondary").addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.querySelector(".ss-install-primary").addEventListener("click", async () => {
      const help = overlay.querySelector(".ss-install-help");
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice && choice.outcome === "accepted") {
          try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_) {}
          overlay.classList.remove("is-visible");
        } else {
          help.textContent = "No problem. You can install SoundScout later from your browser menu.";
          help.classList.add("is-visible");
        }
        return;
      }
      const ua = navigator.userAgent || "";
      if (/iphone|ipad|ipod/i.test(ua)) {
        help.textContent = "In Safari, tap Share, then choose “Add to Home Screen”.";
      } else {
        help.textContent = "In Chrome, open the ⋮ menu and choose “Install app” or “Add to Home screen”.";
      }
      help.classList.add("is-visible");
    });
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    promptShown = true;
  };

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_) {}
    document.getElementById("soundscout-install-prompt")?.classList.remove("is-visible");
  });
  window.addEventListener("load", () => window.setTimeout(mount, 1100), { once: true });
})();
