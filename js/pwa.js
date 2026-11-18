/* Offline copy + install button + "new version" notice. Does nothing on file:// (service workers need http/https). */
CS.pwa = (function () {
  const { icon } = CS.ui;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let promptEvt = null, updating = false;

  /* ---------- install ---------- */
  function drawInstall() {
    const slot = document.getElementById('installSlot');
    if (!slot) return;
    if (standalone() || (!promptEvt && !isIOS)) { slot.innerHTML = ''; return; }
    slot.innerHTML = promptEvt
      ? `<button class="install" data-install>${icon('download')}<span><b>Add BoothPay to this phone</b><span class="sub">Opens from the home screen, even with no internet</span></span></button>`
      : `<p class="install">${icon('phone')}<span><b>Add BoothPay to this iPhone</b><span class="sub">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</span></span></p>`;
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvt = e; drawInstall(); });
  window.addEventListener('appinstalled', () => { promptEvt = null; drawInstall(); CS.ui.toast('BoothPay is on your home screen.'); });
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-install]') || !promptEvt) return;
    promptEvt.prompt();
    await promptEvt.userChoice;
    promptEvt = null; drawInstall();
  });

  /* ---------- offline copy + updates ---------- */
  function showUpdate(reg) {
    if (document.getElementById('updateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'updateBar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `${icon('sync')}<span>New version of BoothPay</span><button class="btn sm primary">Update</button>`;
    bar.querySelector('button').addEventListener('click', () => {
      updating = true;
      if (reg.waiting) reg.waiting.postMessage('update-now');
    });
    document.body.appendChild(bar);
  }

  function register() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          // "installed" while an old copy is in charge = an update is ready (first install needs no notice)
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
        });
      });
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => { /* private mode or blocked: the app still works online */ });
  }

  register();
  drawInstall();
  return { standalone };
})();
