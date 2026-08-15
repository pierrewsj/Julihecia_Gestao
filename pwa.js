(() => {
  'use strict';

  let deferredPrompt = null;
  let registration = null;
  let reloading = false;
  let installedThisSession = false;
  let resolvePromptReady = null;
  let promptReady = new Promise(resolve => { resolvePromptReady = resolve; });

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    installedThisSession;

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const isAndroid = () => /android/i.test(navigator.userAgent || '');
  const appName = () => document.querySelector('meta[name="application-name"]')?.content || document.title || 'Julih & Cia';
  const buttons = () => [...document.querySelectorAll('[data-pwa-install]')];

  function updateButtons() {
    const installed = isStandalone();
    buttons().forEach(btn => {
      btn.hidden = installed;
      btn.setAttribute('aria-hidden', installed ? 'true' : 'false');
      btn.dataset.installState = deferredPrompt ? 'ready' : 'waiting';
      btn.title = installed ? 'Aplicativo instalado' : (deferredPrompt ? 'Instalar aplicativo' : 'Instalar aplicativo');
    });
  }

  function closeHelp() {
    document.querySelector('.install-help-backdrop')?.remove();
  }

  function showInstallHelp(kind = 'android') {
    closeHelp();
    const ios = kind === 'ios';
    const android = kind === 'android';
    const el = document.createElement('div');
    el.className = 'install-help-backdrop';
    el.innerHTML = `<section class="install-help" role="dialog" aria-modal="true" aria-label="Instalar aplicativo">
      <button class="install-help-close" data-pwa-close aria-label="Fechar">×</button>
      <div class="install-help-icon">${ios ? '⌁' : '↓'}</div>
      <span class="install-help-kicker">INSTALAÇÃO DO APLICATIVO</span>
      <h2>${appName()}</h2>
      <p>${ios
        ? 'No iPhone e iPad, o iOS faz a instalação pelo menu de compartilhamento do Safari.'
        : android
          ? 'O Chrome ainda não liberou a janela nativa de instalação para esta página. Aguarde alguns segundos e tente novamente. Se necessário, use o menu do Chrome e escolha “Instalar app”.'
          : 'Seu navegador ainda não liberou a janela nativa de instalação. Tente novamente em um navegador compatível com PWA.'}</p>
      <div class="install-steps">
        ${ios
          ? '<b>1.</b><span>Abra este endereço no <strong>Safari</strong>.</span><b>2.</b><span>Toque em <strong>Compartilhar</strong>.</span><b>3.</b><span>Escolha <strong>Adicionar à Tela de Início</strong>.</span>'
          : android
            ? '<b>1.</b><span>Use o <strong>Google Chrome</strong>.</span><b>2.</b><span>Confira se a página terminou de carregar.</span><b>3.</b><span>Toque novamente em <strong>Instalar</strong> ou use <strong>⋮ → Instalar app</strong>.</span>'
            : '<b>1.</b><span>Abra em um navegador compatível.</span><b>2.</b><span>Recarregue a página.</span><b>3.</b><span>Toque novamente em <strong>Instalar</strong>.</span>'}
      </div>
      <button class="btn btn-primary install-help-ok" data-pwa-close>Fechar</button>
    </section>`;
    document.body.appendChild(el);
  }

  async function waitForNativePrompt(timeout = 4500) {
    if (deferredPrompt) return deferredPrompt;
    return Promise.race([
      promptReady,
      new Promise(resolve => setTimeout(() => resolve(null), timeout))
    ]);
  }

  async function installNative() {
    if (isStandalone()) return;

    if (isIOS()) {
      showInstallHelp('ios');
      return;
    }

    let prompt = deferredPrompt;
    if (!prompt) {
      buttons().forEach(btn => btn.classList.add('install-waiting'));
      prompt = await waitForNativePrompt();
      buttons().forEach(btn => btn.classList.remove('install-waiting'));
    }

    if (!prompt) {
      showInstallHelp(isAndroid() ? 'android' : 'other');
      return;
    }

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      deferredPrompt = null;
      promptReady = new Promise(resolve => { resolvePromptReady = resolve; });
      updateButtons();
      if (choice?.outcome === 'accepted') {
        installedThisSession = true;
      }
      updateButtons();
    } catch (error) {
      console.warn('Falha ao abrir instalador PWA', error);
      showInstallHelp(isAndroid() ? 'android' : 'other');
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    if (resolvePromptReady) resolvePromptReady(event);
    updateButtons();
  });

  window.addEventListener('appinstalled', () => {
    installedThisSession = true;
    deferredPrompt = null;
    closeHelp();
    updateButtons();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateButtons);

  document.addEventListener('click', event => {
    if (event.target.closest('[data-pwa-install]')) {
      event.preventDefault();
      installNative();
      return;
    }
    if (event.target.closest('[data-pwa-close]') || event.target.classList.contains('install-help-backdrop')) {
      closeHelp();
      return;
    }
    if (event.target.closest('[data-pwa-update]') && registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    if (event.target.closest('[data-pwa-later]')) {
      document.querySelector('#pwa-update-banner')?.classList.add('hidden');
    }
  });

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    try {
      registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      await navigator.serviceWorker.ready;

      const showUpdate = () => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          document.querySelector('#pwa-update-banner')?.classList.remove('hidden');
        }
      };

      showUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (worker) {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') showUpdate();
          });
        }
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) {
          reloading = true;
          location.reload();
        }
      });

      setTimeout(() => registration.update().catch(() => {}), 2000);
      setInterval(() => registration.update().catch(() => {}), 15 * 60 * 1000);
    } catch (error) {
      console.warn('Service worker não registrado', error);
    }
  }

  new MutationObserver(updateButtons).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    updateButtons();
    registerServiceWorker();
  });
})();
