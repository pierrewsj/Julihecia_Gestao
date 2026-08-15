(() => {
  'use strict';
  let deferredPrompt = null;
  let registration = null;
  let reloading = false;

  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const buttons = () => [...document.querySelectorAll('[data-pwa-install]')];
  const refreshButtons = () => {
    const hide = standalone();
    buttons().forEach(btn => { btn.hidden = hide; btn.setAttribute('aria-hidden', hide ? 'true' : 'false'); });
  };

  function closeHelp(){ document.querySelector('.install-help-backdrop')?.remove(); }
  function showHelp(){
    closeHelp();
    const ios=isIOS();
    const el=document.createElement('div');
    el.className='install-help-backdrop';
    el.innerHTML=`<section class="install-help" role="dialog" aria-modal="true" aria-label="Instalar aplicativo">
      <button class="install-help-close" data-pwa-close aria-label="Fechar">×</button>
      <div class="install-help-icon">${ios?'⌁':'↓'}</div>
      <span class="install-help-kicker">INSTALAR NO CELULAR</span>
      <h2>Julih & Cia como aplicativo</h2>
      <p>${ios?'No iPhone/iPad, a instalação é feita pelo menu de compartilhamento do Safari.':'No Android, o Chrome pode mostrar a instalação automaticamente. Se não aparecer, use o menu do navegador.'}</p>
      <div class="install-steps">
        ${ios?'<b>1.</b><span>Toque no ícone <strong>Compartilhar</strong>.</span><b>2.</b><span>Escolha <strong>Adicionar à Tela de Início</strong>.</span><b>3.</b><span>Confirme em <strong>Adicionar</strong>.</span>':'<b>1.</b><span>Toque no menu <strong>⋮</strong> do Chrome.</span><b>2.</b><span>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</span><b>3.</b><span>Confirme a instalação.</span>'}
      </div>
      <button class="btn btn-primary install-help-ok" data-pwa-close>Entendi</button>
    </section>`;
    document.body.appendChild(el);
  }

  async function install(){
    if(standalone()) return;
    if(deferredPrompt){
      const prompt=deferredPrompt;
      await prompt.prompt();
      await prompt.userChoice.catch(()=>null);
      deferredPrompt=null;
      refreshButtons();
      return;
    }
    showHelp();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt=event;
    refreshButtons();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt=null; refreshButtons(); closeHelp(); });
  document.addEventListener('click', event => {
    if(event.target.closest('[data-pwa-install]')) install();
    if(event.target.closest('[data-pwa-close]') || (event.target.classList.contains('install-help-backdrop'))) closeHelp();
    if(event.target.closest('[data-pwa-update]') && registration?.waiting) registration.waiting.postMessage({type:'SKIP_WAITING'});
    if(event.target.closest('[data-pwa-later]')) document.querySelector('#pwa-update-banner')?.classList.add('hidden');
  });

  async function register(){
    if(!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    try{
      registration=await navigator.serviceWorker.register('./service-worker.js');
      const showUpdate=()=>{ if(registration?.waiting && navigator.serviceWorker.controller) document.querySelector('#pwa-update-banner')?.classList.remove('hidden'); };
      showUpdate();
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        if(worker) worker.addEventListener('statechange',()=>{ if(worker.state==='installed') showUpdate(); });
      });
      navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!reloading){ reloading=true; location.reload(); } });
      setTimeout(()=>registration.update().catch(()=>{}),1800);
      setInterval(()=>registration.update().catch(()=>{}),15*60*1000);
    }catch(err){ console.warn('PWA não registrado',err); }
  }
  window.addEventListener('load',()=>{ refreshButtons(); register(); });
  new MutationObserver(refreshButtons).observe(document.documentElement,{childList:true,subtree:true});
})();