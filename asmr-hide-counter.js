// === asmr-hide-counter.js (ADD ONLY) ==================================
// Optional badge showing how many cards are hidden. Works with wsHideAPI.

(function(){
  if (window.__ASMR_HIDE_COUNTER__) return;
  window.__ASMR_HIDE_COUNTER__ = true;

  function createBadge(){
    if (document.getElementById('ws-hide-counter')) return;
    const d = document.createElement('div');
    d.id = 'ws-hide-counter';
    d.style.cssText = [
      'position:fixed',
      'bottom:8px',
      'left:8px',
      'z-index:2147483647',
      'background:#111c',
      'color:#eee',
      'font:11px/1.3 monospace',
      'padding:4px 7px',
      'border:1px solid #444',
      'border-radius:4px',
      'box-shadow:0 2px 6px #000a',
      'pointer-events:none',
      'opacity:.85'
    ].join(';');
    d.textContent = 'Hidden: 0';
    document.body.appendChild(d);
  }

  function update(){
    const badge = document.getElementById('ws-hide-counter');
    if (!badge) return;
    if (!window.wsHideAPI || !window.wsHideAPI.isActive()){
      badge.textContent = 'Hidden: 0';
      return;
    }
    const count = document.querySelectorAll('body.ws-hide-all article[data-a-target^="card-"]').length;
    badge.textContent = 'Hidden: ' + count;
  }

  createBadge();
  setInterval(update, 3000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) update(); });

  console.debug('[asmr-hide-counter] initialized (add-only).');
})();
