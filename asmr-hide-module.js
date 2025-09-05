// === asmr-hide-module.js (ADD ONLY) ==================================
// Generic hide-all stream cards module. Independent from overlay panel,
// but cooperative with wsHideAPI in overlay_panel.js if present.
// Safe to load multiple times (idempotent).

(function(){
  if (window.__ASMR_HIDE_CORE__) return;
  window.__ASMR_HIDE_CORE__ = true;

  const BODY_CLASS = 'ws-hide-all';
  const STYLE_ID = 'asmr-hide-style-core';

  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      /* asmr-hide-module (add-only) */
      body.${BODY_CLASS} article[data-a-target^="card-"] { display:none !important; }
      body.${BODY_CLASS} a[data-test-selector="PreviewCard-link"],
      body.${BODY_CLASS} a[data-a-target="preview-card-image-link"] { display:none !important; }
    `;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  const api = {
    enable(){ injectStyle(); document.body.classList.add(BODY_CLASS); },
    disable(){ document.body.classList.remove(BODY_CLASS); },
    toggle(){ injectStyle(); document.body.classList.toggle(BODY_CLASS); },
    isActive(){ return document.body.classList.contains(BODY_CLASS); }
  };

  window.wsHideAPI = window.wsHideAPI || api;

  // Reinforce if Twitch re-renders body
  setInterval(()=>{
    if (window.wsHideAPI && window.wsHideAPI.isActive()){
      injectStyle();
      if (!document.body.classList.contains(BODY_CLASS)){
        document.body.classList.add(BODY_CLASS);
      }
    }
  }, 4000);

  console.debug('[asmr-hide-module] initialized (add-only).');
})();
