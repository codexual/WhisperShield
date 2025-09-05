// WhisperShield overlay_panel.js v0.0.1
// On-page overlay filter panel for Twitch ASMR stream filtering
(function() {
  // Guard against double injection
  if (window.tfFilterPanelInjected) return;
  window.tfFilterPanelInjected = true;

  const LOCAL_VERSION = "0.0.1";
  
  // Check if we're on the ASMR directory page
  if (!window.location.href.includes('/directory/category/asmr')) return;

  // Panel state - sync with existing extension toggles (KEY_TOGGLES)
  let toggleState = {
    whitelist: true,
    greylist: true, 
    blacklist: true,
    unknown: false
  };

  // Create and inject the overlay panel
  function createOverlayPanel() {
    const panel = document.createElement('div');
    panel.id = 'tfFilterPanel';
    panel.innerHTML = `
      <div class="tf-panel-header">
        <span class="tf-panel-title">WhisperShield Filter</span>
        <button class="tf-panel-minimize" title="Minimize">−</button>
      </div>
      <div class="tf-panel-content">
        <div class="tf-category-toggles">
          <label class="tf-toggle">
            <input type="checkbox" data-category="whitelist" checked>
            <span class="tf-toggle-label">Whitelist</span>
          </label>
          <label class="tf-toggle">
            <input type="checkbox" data-category="greylist" checked>
            <span class="tf-toggle-label">Greylist</span>
          </label>
            <label class="tf-toggle">
            <input type="checkbox" data-category="blacklist" checked>
            <span class="tf-toggle-label">Blacklist</span>
          </label>
          <label class="tf-toggle">
            <input type="checkbox" data-category="unknown">
            <span class="tf-toggle-label">Unknown</span>
          </label>
        </div>
        <div class="tf-bulk-actions">
          <button class="tf-bulk-btn" data-action="all-on">All On</button>
          <button class="tf-bulk-btn" data-action="all-off">All Off</button>
          <button class="tf-bulk-btn" data-action="invert">Invert</button>
        </div>
        <div class="tf-panel-actions">
          <button class="tf-action-btn tf-save" data-action="save">Save</button>
          <button class="tf-action-btn tf-save-reload" data-action="save-reload">Save+Reload</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  // Load CSS styles
  function loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('overlay_panel.css');
    document.head.appendChild(link);
  }

  // Send message to background script
  function sendMessage(type, data = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type, ...data }, response => {
          resolve(response || {});
        });
      } catch (e) {
        console.error('WhisperShield: Failed to send message', e);
        resolve({});
      }
    });
  }

  // Load current toggle state from storage
  async function loadToggleState() {
    try {
      const result = await sendMessage('GET_SETTINGS');
      if (result && result.settings) {
        // Map settings to our toggle state if available
        // For now, use defaults since the current system may not have these toggles
        updatePanelFromState();
      }
    } catch (e) {
      console.error('WhisperShield: Failed to load toggle state', e);
    }
  }

  // Update panel checkboxes from current state
  function updatePanelFromState() {
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;

    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      const category = checkbox.dataset.category;
      if (category in toggleState) {
        checkbox.checked = toggleState[category];
      }
    });
  }

  // Update state from panel checkboxes
  function updateStateFromPanel() {
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;

    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      const category = checkbox.dataset.category;
      if (category in toggleState) {
        toggleState[category] = checkbox.checked;
      }
    });
  }

  // Apply toggle changes by sending TF_SET_TOGGLES message
  async function applyToggles() {
    updateStateFromPanel();
    
    try {
      await sendMessage('TF_SET_TOGGLES', { toggles: toggleState });
      await sendMessage('TF_REFRESH_VIEW');
    } catch (e) {
      console.error('WhisperShield: Failed to apply toggles', e);
    }
  }

  // Handle bulk actions
  function handleBulkAction(action) {
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;

    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    
    switch (action) {
      case 'all-on':
        checkboxes.forEach(cb => cb.checked = true);
        break;
      case 'all-off':
        checkboxes.forEach(cb => cb.checked = false);
        break;
      case 'invert':
        checkboxes.forEach(cb => cb.checked = !cb.checked);
        break;
    }
    applyToggles();
  }

  // Handle save actions
  async function handleSaveAction(action) {
    await applyToggles();
    if (action === 'save-reload') window.location.reload();
  }

  function setupEventListeners(panel) {
    panel.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') applyToggles();
    });
    panel.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (e.target.classList.contains('tf-bulk-btn')) {
        handleBulkAction(action);
      } else if (e.target.classList.contains('tf-action-btn')) {
        handleSaveAction(action);
      } else if (e.target.classList.contains('tf-panel-minimize')) {
        togglePanelMinimize();
      }
    });
  }

  function togglePanelMinimize() {
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;
    const content = panel.querySelector('.tf-panel-content');
    const minimizeBtn = panel.querySelector('.tf-panel-minimize');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      minimizeBtn.textContent = '−';
      minimizeBtn.title = 'Minimize';
    } else {
      content.style.display = 'none';
      minimizeBtn.textContent = '+';
      minimizeBtn.title = 'Expand';
    }
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    loadStyles();
    setTimeout(() => {
      const panel = createOverlayPanel();
      setupEventListeners(panel);
      loadToggleState();
      console.log('WhisperShield: Overlay panel initialized v' + LOCAL_VERSION);
    }, 100);
  }
  init();
})();

// === WhisperShield Additions v0.3.2 (non-destructive enhancement block) ===
(function(){
  if (window.__WS_OVERLAY_ENHANCED__) return;
  window.__WS_OVERLAY_ENHANCED__ = true;
  if (!window.location.href.includes('/directory/category/asmr')) return;

  const STORAGE_KEY_POS = "wsOverlayPanelPos_v1";
  const STORAGE_KEY_TOGGLES = "wsOverlayPanelToggles_v1";
  const CLASS_ATTR = "data-ws-classification";
  const APPLY_DEBOUNCE_MS = 150;
  let applyTimer = null;
  let lastClassMap = {};
  let observerConnected = false;

  let localToggleState = {
    whitelist: true,
    greylist: true,
    blacklist: true,
    unknown: false
  };

  function loadPersistedToggles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TOGGLES);
      if (raw) {
        const parsed = JSON.parse(raw);
        ["whitelist","greylist","blacklist","unknown"].forEach(k=>{
          if (typeof parsed[k] === "boolean") localToggleState[k] = parsed[k];
        });
      }
    } catch {}
  }
  loadPersistedToggles();
  function persistToggles(){ try { localStorage.setItem(STORAGE_KEY_TOGGLES, JSON.stringify(localToggleState)); } catch {} }
  function getToggleState(){ return { ...localToggleState }; }
  function setToggleState(category, value){
    if (category in localToggleState){
      localToggleState[category] = value;
      persistToggles();
      scheduleApplyFilters();
    }
  }

  function enableDrag() {
    const panel = document.getElementById("tfFilterPanel");
    if (!panel) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_POS) || "{}");
      if (typeof saved.x === "number" && typeof saved.y === "number") {
        panel.style.position = "fixed";
        panel.style.left = saved.x + "px";
        panel.style.top = saved.y + "px";
        panel.style.right = "auto";
      } else {
        panel.style.position = "fixed";
      }
    } catch {}
    const header = panel.querySelector(".tf-panel-header");
    if (!header) return;
    header.style.cursor = "move";

    let dragging = false;
    let startX=0, startY=0, origX=0, origY=0;

    function onMouseDown(e){
      if (e.button !== 0) return;
      dragging = true;
      panel.setAttribute("data-ws-dragging","1");
      const rect = panel.getBoundingClientRect();
      if (panel.style.right && !panel.style.left) {
        panel.style.left = rect.left + "px";
        panel.style.right = "auto";
      }
      startX = e.clientX;
      startY = e.clientY;
      origX = rect.left;
      origY = rect.top;
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mouseup", onMouseUp, true);
      e.preventDefault();
    }
    function onMouseMove(e){
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newX = origX + dx;
      let newY = origY + dy;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      newX = Math.max(0, Math.min(newX, window.innerWidth - pw));
      newY = Math.max(0, Math.min(newY, window.innerHeight - ph));
      panel.style.left = newX + "px";
      panel.style.top = newY + "px";
    }
    function onMouseUp(){
      if (!dragging) return;
      dragging = false;
      panel.removeAttribute("data-ws-dragging");
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({x:rect.left,y:rect.top}));
      } catch {}
    }
    header.addEventListener("mousedown", onMouseDown);
  }

  async function classifyChannelsBatch(channels){
    return new Promise(resolve=>{
      try {
        chrome.runtime.sendMessage(
          { type:"wsGetClassification", channels },
          resp => {
            if (!resp || !resp.ok) { resolve({}); return; }
            resolve(resp.result || {});
          }
        );
      } catch {
        resolve({});
      }
    });
  }

  function collectChannelCards(){
    const anchors = document.querySelectorAll('a[href^="/"][data-test-selector="PreviewCard-link"], a[data-a-target="preview-card-image-link"]');
    const map = new Map();
    anchors.forEach(a=>{
      try {
        const href = a.getAttribute("href");
        if (!href) return;
        const pure = href.split("?")[0];
        const parts = pure.split("/").filter(Boolean);
        if (parts.length !== 1) return;
        const login = parts[0].toLowerCase();
        let card = a.closest('[data-target="directory-page__card"]') ||
                   a.closest('[data-target="browse-page__card"]') ||
                   a.closest("article") ||
                   a.parentElement;
        if (!card) card = a;
        if (!map.has(login)) map.set(login, []);
        map.get(login).push(card);
      } catch {}
    });
    return map;
  }

  function scheduleApplyFilters(){
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(applyFilters, APPLY_DEBOUNCE_MS);
  }

  async function applyFilters(){
    applyTimer = null;
    const toggles = getToggleState();
    const channelMap = collectChannelCards();
    const logins = Array.from(channelMap.keys());
    const need = logins.filter(l => !(l in lastClassMap));
    if (need.length){
      const CHUNK = 40;
      for (let i=0;i<need.length;i+=CHUNK){
        const slice = need.slice(i,i+CHUNK);
        const res = await classifyChannelsBatch(slice);
        Object.assign(lastClassMap, res);
      }
    }
    channelMap.forEach((cards, login)=>{
      const status = lastClassMap[login] || "unknown";
      cards.forEach(card=>{
        card.setAttribute(CLASS_ATTR, status);
        card.style.display = toggles[status] ? "" : "none";
      });
    });
  }

  function installObserver(){
    if (observerConnected) return;
    const container = document.querySelector('[data-target="directory-container"]') ||
                      document.querySelector('[role="main"]') ||
                      document.body;
    if (!container) return;
    const mo = new MutationObserver(muts=>{
      for (const m of muts){
        if (m.addedNodes && m.addedNodes.length){
          scheduleApplyFilters();
          break;
        }
      }
    });
    mo.observe(container,{childList:true,subtree:true});
    observerConnected = true;
  }

  function hookPanelCheckboxes(){
    const panel = document.getElementById("tfFilterPanel");
    if (!panel) return;
    const t = getToggleState();
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat = cb.getAttribute("data-category");
      if (cat in t) cb.checked = t[cat];
    });
    panel.addEventListener("change", e=>{
      const target = e.target;
      if (target && target.matches('input[type="checkbox"][data-category]')) {
        const cat = target.getAttribute("data-category");
        setToggleState(cat, target.checked);
      }
    });
  }

  function initEnhancement(){
    const panel = document.getElementById("tfFilterPanel");
    if (!panel) {
      setTimeout(initEnhancement, 400);
      return;
    }
    hookPanelCheckboxes();
    enableDrag();
    installObserver();
    scheduleApplyFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEnhancement);
  } else {
    initEnhancement();
  }

  window.__WS_forceFilterReapply = () => { lastClassMap = {}; scheduleApplyFilters(); };
})();

// === APPENDED BLOCK (ADD ONLY): Panel hide-all streams toggle ===
(function(){
  if (window.__WS_HIDE_ALL_APPEND__) return;
  window.__WS_HIDE_ALL_APPEND__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  function injectHideButton() {
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) {
      setTimeout(injectHideButton, 400);
      return;
    }
    const actions = panel.querySelector('.tf-panel-actions');
    if (!actions) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Hide All';
    btn.className = 'tf-action-btn';
    btn.style.background = '#ff5c5c';
    btn.style.color = '#fff';
    btn.style.fontWeight = '600';
    btn.style.flex = '1';
    btn.dataset.wsHideAllBtn = '1';
    btn.setAttribute('data-ws-hide-all-btn','1');

    btn.addEventListener('click', () => {
      window.wsHideAPI && window.wsHideAPI.toggle();
      syncButton();
    });

    actions.appendChild(btn);
    syncButton();
  }

  function syncButton(){
    // NOTE: Original invalid selector kept (not removed) caused errors; hotfix added later.
    const hideBtn = document.querySelector('#tfFilterPanel button[data-ws-hide-all-btn]') ||
      document.querySelector('#tfFilterPanel button[data.wsHideAllBtn]') ||
      document.querySelector('#tfFilterPanel button[data-ws-hide-all-btn="1"]') ||
      document.querySelector('#tfFilterPanel button[data-ws-hide-all-btn]');
    const active = document.body.classList.contains('ws-hide-all');
    if (hideBtn){
      hideBtn.textContent = active ? 'Show All' : 'Hide All';
      hideBtn.classList.toggle('ws-hide-toggle-active', active);
    }
  }

  window.wsHideAPI = window.wsHideAPI || (function(){
    const BODY_CLASS = 'ws-hide-all';
    const STYLE_ID  = 'ws-hide-all-style';
    function ensureStyle(){
      if (document.getElementById(STYLE_ID)) return;
      const css = `
        body.${BODY_CLASS} article[data-a-target^="card-"] { display: none !important; }
      `;
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = css;
      document.head.appendChild(st);
    }
    return {
      enable(){ ensureStyle(); document.body.classList.add(BODY_CLASS); },
      disable(){ document.body.classList.remove(BODY_CLASS); },
      toggle(){ ensureStyle(); document.body.classList.toggle(BODY_CLASS); },
      isActive(){ return document.body.classList.contains(BODY_CLASS); }
    };
  })();

  document.addEventListener('visibilitychange', () => { /* placeholder */ });
  injectHideButton();
})();

/* === APPENDED BLOCK (ADD ONLY) – WhisperShield Filter Patch v0.3.3 === */
(function(){
  if (window.__WS_OVERLAY_FILTER_PATCH_V033__) return;
  window.__WS_OVERLAY_FILTER_PATCH_V033__ = true;
  if (window.__WS_DISABLE_FILTER_PATCH__) return;
  if (!location.href.includes('/directory/category/asmr')) return;

  const STORAGE_KEY = 'WS_FILTER_PATCH_TOGGLES_V1';
  const CLASS_ATTR  = 'data-ws-classification';
  const APPLY_DEBOUNCE_MS = 140;
  const RETURN_ALL_WHEN_NONE = false;
  const DEBUG = false;

  let lastClassMap = {};
  let applyTimer   = null;
  let moConnected  = false;
  let pendingClassify = new Set();
  const toggles = { whitelist:true, greylist:true, blacklist:true, unknown:false };

  (function loadPersisted(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw){
        const saved = JSON.parse(raw);
        ['whitelist','greylist','blacklist','unknown'].forEach(k=>{
          if (typeof saved[k] === 'boolean') toggles[k] = saved[k];
        });
      }
    } catch {}
  })();

  function persistToggles(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles)); } catch {}
  }

  function readPanelCheckboxes(){
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat = cb.getAttribute('data-category');
      if (cat in toggles) toggles[cat] = cb.checked;
    });
    persistToggles();
  }
  function applyTogglesToPanel(){
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat = cb.getAttribute('data-category');
      if (cat in toggles) cb.checked = toggles[cat];
    });
  }

  (function waitPanel(){
    const panel = document.getElementById('tfFilterPanel');
    if (!panel){ setTimeout(waitPanel, 250); return; }
    applyTogglesToPanel();
    panel.addEventListener('change', e=>{
      if (e.target && e.target.matches('input[type="checkbox"][data-category]')){
        readPanelCheckboxes();
        scheduleApply();
      }
    });
  })();

  function collectCards(){
    const anchors = document.querySelectorAll('a[href^="/"][data-test-selector="PreviewCard-link"], a[data-a-target="preview-card-image-link"]');
    const map = [];
    anchors.forEach(a=>{
      let href = a.getAttribute('href');
      if (!href) return;
      href = href.split('?')[0];
      const parts = href.split('/').filter(Boolean);
      if (parts.length !== 1) return;
      const login = parts[0].toLowerCase();
      let card = a.closest('[data-target="directory-page__card"]') ||
                 a.closest('[data-target="browse-page__card"]') ||
                 a.closest('article') ||
                 a.parentElement;
      if (!card) card = a;
      map.push({login, node:card, anchor:a});
    });
    return map;
  }

  function gatherLoginsNeedingClassification(cards){
    const need = [];
    for (const c of cards){
      if (c.node.getAttribute(CLASS_ATTR)) continue;
      if (c.anchor.getAttribute(CLASS_ATTR)) continue;
      if (lastClassMap[c.login]) {
        c.node.setAttribute(CLASS_ATTR, lastClassMap[c.login]);
        continue;
      }
      if (!pendingClassify.has(c.login)){
        pendingClassify.add(c.login);
        need.push(c.login);
      }
    }
    return need;
  }

  function batchClassify(logins){
    if (window.__WS_classifyChannels) {
      return window.__WS_classifyChannels(logins); // redirected (throttle) if available
    }
    return new Promise(resolve=>{
      if (!logins.length){ resolve({}); return; }
      try {
        chrome.runtime.sendMessage({ type:'wsGetClassification', channels: logins }, resp=>{
          if (!resp || !resp.ok){ resolve({}); return; }
          resolve(resp.result || {});
        });
      } catch { resolve({}); }
    });
  }

  function scheduleApply(){
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(applyFilters, APPLY_DEBOUNCE_MS);
  }

  async function applyFilters(){
    applyTimer = null;
    const cards = collectCards();
    const need = gatherLoginsNeedingClassification(cards);

    if (need.length){
      const classifications = await batchClassify(need);
      Object.assign(lastClassMap, classifications);
      cards.forEach(c=>{
        const cls = classifications[c.login];
        if (cls){
          c.node.setAttribute(CLASS_ATTR, cls);
          c.anchor.setAttribute(CLASS_ATTR, cls);
        }
      });
      pendingClassify.clear();
    }

    const activeCats = Object.entries(toggles).filter(([k,v])=>v).map(([k])=>k);
    const showAllBecauseNone = activeCats.length === 0 && RETURN_ALL_WHEN_NONE;
    let visible=0, hidden=0;

    cards.forEach(c=>{
      let cls = c.node.getAttribute(CLASS_ATTR) ||
                c.anchor.getAttribute(CLASS_ATTR) ||
                lastClassMap[c.login] || 'unknown';
      cls = cls.toLowerCase();
      if (!lastClassMap[c.login]) lastClassMap[c.login] = cls;
      const shouldShow = document.body.classList.contains('ws-hide-all')
        ? false
        : (showAllBecauseNone ? true : !!toggles[cls]);
      if (shouldShow){
        if (c.node.__wsOriginalDisplay !== undefined){
          c.node.style.display = c.node.__wsOriginalDisplay;
        } else c.node.style.display = '';
        visible++;
      } else {
        if (c.node.__wsOriginalDisplay === undefined){
          c.node.__wsOriginalDisplay = c.node.style.display || '';
        }
        c.node.style.display = 'none';
        hidden++;
      }
    });
    if (DEBUG) console.debug('[WS Patch] Filter applied',{visible,hidden,total:cards.length});
  }

  function installMutationObserver(){
    if (moConnected) return;
    const root = document.querySelector('[data-target="directory-container"]') ||
                 document.querySelector('[role="main"]') ||
                 document.body;
    if (!root) { setTimeout(installMutationObserver, 400); return; }
    const mo = new MutationObserver(muts=>{
      for (const m of muts){
        if (m.addedNodes && m.addedNodes.length){ scheduleApply(); break; }
      }
    });
    mo.observe(root,{childList:true,subtree:true});
    moConnected = true;
  }

  const hideAllPoll = setInterval(()=>{ scheduleApply(); }, 5000);

  function bootstrap(){
    installMutationObserver();
    scheduleApply();
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else bootstrap();

  window.__WS_FILTER_PATCH_FORCE = function(){
    lastClassMap = {};
    document.querySelectorAll('['+CLASS_ATTR+']').forEach(el=>el.removeAttribute(CLASS_ATTR));
    scheduleApply();
  };
})();

/* === APPENDED BLOCK (ADD ONLY) – FIX for invalid selector in syncButton (v0.3.4 hotfix) === */
(function(){
  if (window.__WS_HIDE_ALL_SELECTOR_HOTFIX__) return;
  window.__WS_HIDE_ALL_SELECTOR_HOTFIX__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;
  const MALFORMED_FRAGMENT = '[data.wsHideAllBtn]';
  try {
    const OrigQS = Document.prototype.querySelector;
    Document.prototype.querySelector = function(sel){
      if (typeof sel === 'string' && sel.includes(MALFORMED_FRAGMENT)) return null;
      try { return OrigQS.call(this, sel); }
      catch(e){
        if (typeof sel === 'string' && sel.includes(MALFORMED_FRAGMENT)) return null;
        throw e;
      }
    };
  } catch(e){
    console.debug('[WS hotfix] Unable to wrap querySelector:', e);
  }
  function safeSync(){
    const btn = document.querySelector('#tfFilterPanel button[data-ws-hide-all-btn], #tfFilterPanel button[data-ws-hide-all-btn="1"]');
    if(!btn) return;
    const active = document.body.classList.contains('ws-hide-all');
    btn.textContent = active ? 'Show All' : 'Hide All';
    btn.classList.toggle('ws-hide-toggle-active', active);
  }
  function ensureAttr(){
    const btn = document.querySelector('#tfFilterPanel button[data-ws-hide-all-btn], #tfFilterPanel button[data-ws-hide-all-btn="1"]');
    if (btn && !btn.hasAttribute('data-ws-hide-all-btn')) btn.setAttribute('data-ws-hide-all-btn','1');
  }
  function init(){
    ensureAttr(); safeSync();
    setInterval(()=>{ ensureAttr(); safeSync(); }, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  console.debug('[WhisperShield hotfix] Hide-All selector patch active.');
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.5: Safe messaging + batch throttle === */
(function(){
  if (window.__WS_MSG_SAFEGUARD__) return;
  window.__WS_MSG_SAFEGUARD__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  window.__WS_rawSendMessage = window.__WS_rawSendMessage || chrome.runtime?.sendMessage;
  function wsSafeSend(message){
    return new Promise(resolve=>{
      let responded = false;
      try {
        chrome.runtime.sendMessage(message, resp=>{
          responded = true;
            resolve(resp || {});
        });
      } catch(e){
        resolve({});
      }
      setTimeout(()=>{ if(!responded) resolve({}); }, 1500);
    });
  }
  window.__WS_safeSend = wsSafeSend;

  const MERGE_WINDOW_MS = 60;
  const MAX_OUTSTANDING = 3;
  let pendingLogins = new Set();
  let inflight = 0;
  let mergeTimer = null;
  let resolvers = [];

  function flushBatch(){
    if (!pendingLogins.size) return;
    const slice = Array.from(pendingLogins);
    pendingLogins.clear();
    inflight++;
    wsSafeSend({ type: 'wsGetClassification', channels: slice }).then(resp=>{
      const result = resp?.result || {};
      resolvers.forEach(r=>{ try { r(result); } catch{} });
      resolvers = [];
    }).finally(()=>{
      inflight--;
      if(pendingLogins.size) scheduleFlush();
    });
  }
  function scheduleFlush(){
    if (mergeTimer) return;
    mergeTimer = setTimeout(()=>{ mergeTimer=null; flushBatch(); }, MERGE_WINDOW_MS);
  }

  if (!window.__WS_originalClassifyBatch){
    window.__WS_requestClassifications = function(logins){
      return new Promise(res=>{
        logins.forEach(l=>pendingLogins.add(l));
        resolvers.push(res);
        if (inflight >= MAX_OUTSTANDING) return;
        scheduleFlush();
      });
    };
  }

  console.debug('[WhisperShield] Safe messaging & batch throttle patch active.');
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.5: batchClassify override if throttler present === */
(function(){
  if (!location.href.includes('/directory/category/asmr')) return;
  if (window.__WS_BATCH_OVERRIDE__) return;
  window.__WS_BATCH_OVERRIDE__ = true;
  try {
    if (window.__WS_requestClassifications){
      window.__WS_filter_patch_classify = function(logins){
        return window.__WS_requestClassifications(logins);
      };
      console.debug('[WhisperShield] Batch classify override installed (throttled).');
    }
  } catch(e){
    console.debug('[WhisperShield] Batch override failed:', e.message);
  }
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.5: redirect existing filter patch to throttled classify === */
(function(){
  if (!location.href.includes('/directory/category/asmr')) return;
  if (window.__WS_CLASSIFY_REDIRECT__) return;
  window.__WS_CLASSIFY_REDIRECT__ = true;
  if (window.__WS_filter_patch_forceThrottleApplied) return;
  window.__WS_filter_patch_forceThrottleApplied = true;
  window.__WS_classifyChannels = async function(logins){
    if (window.__WS_filter_patch_classify) {
      return await window.__WS_filter_patch_classify(logins);
    }
    if (window.__WS_safeSend){
      const resp = await window.__WS_safeSend({ type:'wsGetClassification', channels: logins });
      return resp?.result || {};
    }
    return {};
  };
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.5: Heartbeat pinger === */
(function(){
  if (window.__WS_OVERLAY_HEARTBEAT__) return;
  window.__WS_OVERLAY_HEARTBEAT__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  function ping(){
    if (!window.__WS_safeSend){
      try { chrome.runtime.sendMessage({type:'WS_HEARTBEAT_PING'}); } catch {}
      return;
    }
    window.__WS_safeSend({type:'WS_HEARTBEAT_PING'});
  }
  setInterval(ping, 25000);
  setTimeout(ping, 4000);
  console.debug('[WhisperShield] Overlay heartbeat active.');
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.6: Authoritative local filter engine using full lists ===
   Implements requested behavior:
   - Only enabled categories are shown.
   - "Whitelist" alone => only whitelisted.
   - "Greylist"+"Whitelist" => only those classifications.
   - "Blacklist" alone => only blacklisted, hides others.
   - "Unknown" alone => only uncategorized (not in any list).
   Uses remote+local merged lists (fetched via new wsGetAllLists).
*/
(function(){
  if (window.__WS_LOCAL_FILTER_ENGINE_V036__) return;
  window.__WS_LOCAL_FILTER_ENGINE_V036__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  const CLASS_ATTR = 'data-ws-classification';
  const APPLY_DEBOUNCE_MS = 160;
  let lists = { whitelist:[], greylist:[], blacklist:[] };
  let sets  = { whitelist:new Set(), greylist:new Set(), blacklist:new Set() };
  let applyTimer = null;
  let panelReady = false;

  function logDebug(...a){
    // Uncomment to debug
    // console.debug('[WS v0.3.6]', ...a);
  }

  function fetchLists(){
    try {
      chrome.runtime.sendMessage({type:'wsGetAllLists'}, resp=>{
        if (!resp || !resp.ok || !resp.lists) return;
        lists = resp.lists;
        sets.whitelist = new Set(lists.whitelist.map(x=>x.toLowerCase()));
        sets.greylist  = new Set(lists.greylist.map(x=>x.toLowerCase()));
        sets.blacklist = new Set(lists.blacklist.map(x=>x.toLowerCase()));
        scheduleApply();
      });
    } catch {}
  }

  function currentToggles(){
    const panel = document.getElementById('tfFilterPanel');
    const out={whitelist:false,greylist:false,blacklist:false,unknown:false};
    if(!panel) return out;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat=cb.getAttribute('data-category');
      if (cat in out) out[cat]=cb.checked;
    });
    return out;
  }

  function classify(login){
    const lower = login.toLowerCase();
    if (sets.blacklist.has(lower)) return 'blacklist';
    if (sets.whitelist.has(lower)) return 'whitelist';
    if (sets.greylist.has(lower))  return 'greylist';
    return 'unknown';
  }

  function collectCards(){
    const anchors = document.querySelectorAll('a[href^="/"][data-test-selector="PreviewCard-link"], a[data-a-target="preview-card-image-link"]');
    const items=[];
    anchors.forEach(a=>{
      let href=a.getAttribute('href');
      if(!href) return;
      href=href.split('?')[0];
      const parts=href.split('/').filter(Boolean);
      if(parts.length!==1) return;
      const login=parts[0].toLowerCase();
      let card = a.closest('[data-target="directory-page__card"]') ||
                 a.closest('[data-target="browse-page__card"]') ||
                 a.closest('article') || a.parentElement || a;
      items.push({login, anchor:a, card});
    });
    return items;
  }

  function apply(){
    const toggles=currentToggles();
    const items=collectCards();
    const enabledCats = Object.entries(toggles).filter(([k,v])=>v).map(([k])=>k);
    const activeSet = new Set(enabledCats);
    const hideAllMode = document.body.classList.contains('ws-hide-all');

    items.forEach(it=>{
      const cls = classify(it.login);
      it.card.setAttribute(CLASS_ATTR, cls);
      it.anchor.setAttribute(CLASS_ATTR, cls);
      let show = !hideAllMode && activeSet.has(cls);
      if (enabledCats.length===0){
        // If user disabled all toggles, hide everything (explicit)
        show = false;
      }
      if (show){
        if (it.card.__wsOrigDisplay !== undefined){
          it.card.style.display = it.card.__wsOrigDisplay;
        } else {
          it.card.style.display = '';
        }
      } else {
        if (it.card.__wsOrigDisplay === undefined){
          it.card.__wsOrigDisplay = it.card.style.display || '';
        }
        it.card.style.display='none';
      }
    });
  }

  function scheduleApply(){
    if(applyTimer) clearTimeout(applyTimer);
    applyTimer=setTimeout(apply, APPLY_DEBOUNCE_MS);
  }

  function observe(){
    const root=document.querySelector('[data-target="directory-container"]') ||
                 document.querySelector('[role="main"]') ||
                 document.body;
    if(!root) { setTimeout(observe,500); return; }
    const mo=new MutationObserver(muts=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){ scheduleApply(); break; }
      }
    });
    mo.observe(root,{childList:true,subtree:true});
  }

  function waitPanel(){
    if(document.getElementById('tfFilterPanel')){
      panelReady=true;
      scheduleApply();
    } else {
      setTimeout(waitPanel,400);
    }
  }

  // React to panel checkbox changes (already existing listeners will also run)
  document.addEventListener('change', e=>{
    if(e.target && e.target.matches('#tfFilterPanel input[type="checkbox"][data-category]')){
      scheduleApply();
    }
  });

  // React to settings updates (lists changed)
  try {
    chrome.runtime.onMessage.addListener((msg)=>{
      if(msg?.type==="SETTINGS_UPDATED"){
        fetchLists();
      }
    });
  } catch {}

  // Periodic sanity re-application
  setInterval(()=>scheduleApply(), 6000);
  // Hide-all button effect sync
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) scheduleApply(); });

  fetchLists();
  waitPanel();
  observe();
  scheduleApply();

  window.__WS_FORCE_LOCAL_FILTER_REFRESH = ()=>{
    fetchLists();
    scheduleApply();
  };

  logDebug('Local filter engine v0.3.6 active.');
})();

/* =========================================================================================
   === APPENDED BLOCK (ADD ONLY) v0.3.7: EXTREME OVERLAY DEBUG LOGGER + UI + HIDE BTN FIX ===
   =========================================================================================
   Requirements:
   - DO NOT REMOVE OR MODIFY EXISTING CODE (add-only).
   - Adds a debug toggle & tools section to the filter overlay panel.
   - When enabled, logs every relevant panel interaction (checkbox change, bulk action,
     save, save+reload, hide-all toggle, mutation-driven re-apply guess, snapshot requests).
   - Captures current toggle states, counts & lists of visible/hidden channels (bounded),
     classification distribution, timestamp, and reason.
   - Persists debug enabled flag & log to localStorage.
   - Provides buttons: Snapshot, Download Log (.txt), Clear Log.
   - Attempts minimal intrusion; no refactors.
   - Fixes UI overlap of red Hide All button by flex wrapping & forcing full-width row.
*/
(function(){
  if (window.__WS_OVERLAY_DEBUG_V037__) return;
  window.__WS_OVERLAY_DEBUG_V037__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  const DEBUG_FLAG_KEY = 'WS_OVERLAY_DEBUG_ENABLED_V1';
  const DEBUG_LOG_KEY  = 'WS_OVERLAY_DEBUG_LOG_V1';
  const MAX_LOG_ENTRIES = 5000;
  const MAX_LIST_SAMPLE = 120; // limit visible/hidden sample to keep file reasonable
  const CLASS_ATTR = 'data-ws-classification';

  let debugEnabled = false;
  let pendingInitialSnapshot = false;
  let lastSnapshotHash = '';

  // Load persisted state
  try {
    debugEnabled = localStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {}

  function loadLog(){
    try {
      const raw = localStorage.getItem(DEBUG_LOG_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveLog(arr){
    try {
      localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(arr.slice(-MAX_LOG_ENTRIES)));
    } catch {}
  }
  let debugLog = loadLog();

  function nowIso(){ return new Date().toISOString(); }

  function hashSnapshot(obj){
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify({
        vc: obj.visibleCount,
        hc: obj.hiddenCount,
        dist: obj.classCounts,
        toggles: obj.toggles
      })))).slice(0,40);
    } catch { return Math.random().toString(36).slice(2); }
  }

  function collectToggles(){
    const out={whitelist:false,greylist:false,blacklist:false,unknown:false};
    const panel=document.getElementById('tfFilterPanel');
    if(!panel) return out;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat=cb.getAttribute('data-category');
      if(cat in out) out[cat]=cb.checked;
    });
    return out;
  }

  function collectCards(){
    const set = new Set();
    const cards = [];
    document.querySelectorAll('['+CLASS_ATTR+']').forEach(el=>{
      // Avoid duplicates for nested anchor/card combos
      if (el instanceof HTMLElement){
        const key = el.outerHTML.length + ':' + (el.getAttribute(CLASS_ATTR)||'') + ':' + (el.dataset?.aTarget||'') + ':' + (el.tagName||'');
        if (!set.has(key)){
          set.add(key);
          cards.push(el);
        }
      }
    });
    // Fallback if no classification attribute yet:
    if (!cards.length){
      document.querySelectorAll('article, a[data-test-selector="PreviewCard-link"]').forEach(el=>{
        if (el instanceof HTMLElement) cards.push(el);
      });
    }
    return cards;
  }

  function deriveLoginFromCard(el){
    try {
      let anchor = el.querySelector('a[href^="/"][data-test-selector="PreviewCard-link"]') ||
                   el.querySelector('a[data-a-target="preview-card-image-link"]') ||
                   el.closest('a[data-test-selector="PreviewCard-link"]') ||
                   el.closest('a[data-a-target="preview-card-image-link"]');
      if (!anchor) {
        if (el.tagName === 'A' && el.getAttribute('href')?.startsWith('/')) anchor = el;
      }
      if (!anchor) return null;
      let href = anchor.getAttribute('href') || '';
      href = href.split('?')[0];
      const parts = href.split('/').filter(Boolean);
      if (parts.length === 1) return parts[0].toLowerCase();
      return null;
    } catch { return null; }
  }

  function snapshot(reason){
    const toggles = collectToggles();
    const cards = collectCards();
    const classCounts = {whitelist:0,greylist:0,blacklist:0,unknown:0,unclassified:0};
    const visible = [];
    const hidden  = [];
    let visibleCount=0, hiddenCount=0;

    cards.forEach(el=>{
      const cls = (el.getAttribute(CLASS_ATTR)||'unclassified').toLowerCase();
      if (classCounts[cls] == null) classCounts[cls]=0;
      classCounts[cls]++;
      const styleDisplay = (el.style && el.style.display) || '';
      const isHidden = styleDisplay === 'none' || el.closest('body.ws-hide-all');
      const login = deriveLoginFromCard(el) || '(?)';
      if (!isHidden){
        visibleCount++;
        if (visible.length < MAX_LIST_SAMPLE) visible.push({login, cls});
      } else {
        hiddenCount++;
        if (hidden.length < MAX_LIST_SAMPLE) hidden.push({login, cls});
      }
    });

    const snap = {
      time: nowIso(),
      event: reason,
      toggles,
      visibleCount,
      hiddenCount,
      classCounts,
      sampleVisible: visible,
      sampleHidden: hidden
    };
    return snap;
  }

  function logEvent(eventType, extra={}){
    if(!debugEnabled) return;
    let snap = snapshot(eventType);
    Object.assign(snap, {extra});
    const h = hashSnapshot(snap);
    snap.snapshotHash = h;
    // Avoid spamming identical consecutive snapshots for passive events:
    if (h === lastSnapshotHash && /^mutation|autoPoll$/.test(eventType)) return;
    lastSnapshotHash = h;
    debugLog.push(snap);
    if (debugLog.length > MAX_LOG_ENTRIES) debugLog = debugLog.slice(-MAX_LOG_ENTRIES);
    saveLog(debugLog);
    // Also output to console for immediate inspection
    try { console.debug('[WS Overlay DEBUG]', eventType, snap); } catch {}
  }

  function ensureUI(){
    const panel = document.getElementById('tfFilterPanel');
    if (!panel){
      setTimeout(ensureUI, 350);
      return;
    }
    let tools = panel.querySelector('.ws-debug-tools');
    if (tools) {
      // Rewire existing if needed
      wireUIElements(tools);
      finalizeHideAllLayoutFix();
      return;
    }
    const content = panel.querySelector('.tf-panel-content');
    if (!content) {
      setTimeout(ensureUI, 400);
      return;
    }
    tools = document.createElement('div');
    tools.className = 'ws-debug-tools';
    tools.innerHTML = `
      <div class="ws-debug-row">
        <label class="ws-debug-flag">
          <input type="checkbox" id="wsDebugToggle">
          <span>Debug</span>
        </label>
        <button type="button" id="wsDebugSnapshot" class="ws-debug-btn">Snapshot</button>
        <button type="button" id="wsDebugDownload" class="ws-debug-btn">Download</button>
        <button type="button" id="wsDebugClear" class="ws-debug-btn danger">Clear</button>
      </div>
      <div class="ws-debug-status" id="wsDebugStatus">Debug ${debugEnabled?'ENABLED':'disabled'}.</div>
    `;
    content.appendChild(tools);
    wireUIElements(tools);
    finalizeHideAllLayoutFix();
  }

  function wireUIElements(root){
    const ck = root.querySelector('#wsDebugToggle');
    if (ck){
      ck.checked = debugEnabled;
      ck.addEventListener('change',()=>{
        debugEnabled = ck.checked;
        try { localStorage.setItem(DEBUG_FLAG_KEY, debugEnabled?'1':'0'); } catch {}
        updateStatus(`Debug ${debugEnabled?'ENABLED':'disabled'}.`);
        logEvent('debug-toggle',{enabled:debugEnabled});
        if (debugEnabled && pendingInitialSnapshot){
          pendingInitialSnapshot=false;
          logEvent('initial-snapshot');
        }
      });
    }
    const snapBtn = root.querySelector('#wsDebugSnapshot');
    if (snapBtn){
      snapBtn.addEventListener('click',()=>{
        logEvent('manual-snapshot');
        updateStatus('Snapshot captured.');
      });
    }
    const dlBtn = root.querySelector('#wsDebugDownload');
    if (dlBtn){
      dlBtn.addEventListener('click', downloadLog);
    }
    const clrBtn = root.querySelector('#wsDebugClear');
    if (clrBtn){
      clrBtn.addEventListener('click',()=>{
        debugLog = [];
        saveLog(debugLog);
        updateStatus('Debug log cleared.');
        logEvent('clear-log');
      });
    }
    // Capture clicks in panel for richer logging (category toggles, bulk actions, etc.)
    const panel = document.getElementById('tfFilterPanel');
    if (panel && !panel.__wsDebugClickHooked){
      panel.__wsDebugClickHooked = true;
      panel.addEventListener('click', e=>{
        const t = e.target;
        if (!debugEnabled) return;
        const action = t?.getAttribute('data-action') || '';
        const isHideAll = t && t.hasAttribute('data-ws-hide-all-btn');
        const label = (t && (t.textContent||'').trim().slice(0,40)) || t?.tagName;
        logEvent('panel-click',{action,label,isHideAll});
      }, true); // capture phase to log even if reload
    }
    // Hook for change events (checkbox toggles)
    document.addEventListener('change', e=>{
      if(!debugEnabled) return;
      if (e.target && e.target.matches('#tfFilterPanel input[type="checkbox"][data-category]')){
        logEvent('category-toggle-change',{category:e.target.getAttribute('data-category'),checked:e.target.checked});
      }
    }, true);
  }

  function updateStatus(msg){
    const st = document.getElementById('wsDebugStatus');
    if (st){
      st.textContent = msg;
    }
  }

  function downloadLog(){
    try {
      const blob = new Blob([formatLogForDownload()], {type:'text/plain'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whispershield_overlay_debug_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        URL.revokeObjectURL(url);
        a.remove();
      },1500);
      updateStatus('Log downloaded.');
      logEvent('download-log');
    } catch(e){
      updateStatus('Download failed: '+e.message);
    }
  }

  function formatLogForDownload(){
    const lines = [];
    lines.push('=== WhisperShield Overlay Extreme Debug Log v0.3.7 ===');
    lines.push('Generated: '+nowIso());
    lines.push('Entries: '+debugLog.length);
    lines.push('');
    debugLog.forEach((entry,i)=>{
      lines.push(`#${i+1} @${entry.time} :: ${entry.event}`);
      try {
        lines.push(JSON.stringify(entry, null, 2));
      } catch {
        lines.push(String(entry));
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  // Passive observer to log possible re-filter events (mutation)
  const MUTATION_DEBOUNCE_MS = 400;
  let mutationTimer = null;
  function installMutationTap(){
    const root = document.querySelector('[data-target="directory-container"]') ||
                 document.querySelector('[role="main"]') ||
                 document.body;
    if(!root) { setTimeout(installMutationTap, 800); return; }
    const mo = new MutationObserver(muts=>{
      let added = 0, removed = 0;
      muts.forEach(m=>{
        added += m.addedNodes?.length||0;
        removed += m.removedNodes?.length||0;
      });
      if (added || removed){
        if (mutationTimer) clearTimeout(mutationTimer);
        mutationTimer = setTimeout(()=>{
          if(debugEnabled) logEvent('mutation-activity',{added,removed});
        }, MUTATION_DEBOUNCE_MS);
      }
    });
    mo.observe(root,{childList:true,subtree:true});
  }

  // Periodically capture to catch state drift
  setInterval(()=>{
    if(debugEnabled) logEvent('autoPoll');
  }, 30000);

  // Ensure UI is created
  ensureUI();
  installMutationTap();

  // If debug was already enabled on load, capture initial
  if(debugEnabled){
    logEvent('initial-snapshot');
  } else {
    pendingInitialSnapshot = true;
  }

  // Intercept save & save-reload buttons to ensure log before reload
  document.addEventListener('click', e=>{
    if(!debugEnabled) return;
    const t = e.target;
    if(!t) return;
    if(t.matches('#tfFilterPanel .tf-action-btn[data-action="save"]')){
      logEvent('save-click');
    } else if (t.matches('#tfFilterPanel .tf-action-btn[data-action="save-reload"]')){
      logEvent('save-reload-click');
    } else if (t.hasAttribute('data-ws-hide-all-btn')){
      const state = document.body.classList.contains('ws-hide-all') ? 'will-show-all' : 'will-hide-all';
      logEvent('hide-all-toggle-click',{nextState:state});
    }
  }, true);

  // Layout fix for red Hide All button overlap:
  function finalizeHideAllLayoutFix(){
    try {
      const panel = document.getElementById('tfFilterPanel');
      if(!panel) return;
      const actions = panel.querySelector('.tf-panel-actions');
      if(actions && !actions.classList.contains('ws-actions-flexwrap')){
        actions.classList.add('ws-actions-flexwrap');
        // Force wrap
        actions.style.flexWrap = 'wrap';
      }
      const hideBtn = panel.querySelector('button[data-ws-hide-all-btn]');
      if (hideBtn){
        hideBtn.classList.add('ws-hide-all-fullwidth');
        hideBtn.style.flex = '1 1 100%';
        hideBtn.style.marginTop = '4px';
      }
    } catch {}
  }
  // Attempt second pass after delay to catch late injection
  setTimeout(finalizeHideAllLayoutFix, 1500);

  console.debug('[WhisperShield] Overlay extreme debug logger v0.3.7 active.');
})();

/* === APPENDED BLOCK (ADD ONLY) v0.3.7 CSS INJECTION (scoped via JS if stylesheet not yet updated) === */
(function(){
  if (window.__WS_OVERLAY_DEBUG_STYLE_PATCH__) return;
  window.__WS_OVERLAY_DEBUG_STYLE_PATCH__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;
  const css = `
    #tfFilterPanel .ws-debug-tools {
      margin-top:8px;
      border-top:1px solid #2f2f34;
      padding-top:6px;
      font-size:11px;
    }
    #tfFilterPanel .ws-debug-row {
      display:flex;
      flex-wrap:wrap;
      gap:4px;
      align-items:center;
    }
    #tfFilterPanel .ws-debug-row label.ws-debug-flag {
      display:flex;
      align-items:center;
      gap:4px;
      padding:2px 6px;
      background:#2a2a2f;
      border:1px solid #3a3a42;
      border-radius:4px;
      cursor:pointer;
      font-weight:600;
      font-size:11px;
    }
    #tfFilterPanel .ws-debug-row label.ws-debug-flag input {
      margin:0;
    }
    #tfFilterPanel .ws-debug-btn {
      background:#464649;
      border:1px solid #5a5a63;
      color:#efeff1;
      font-size:11px;
      padding:4px 6px;
      border-radius:4px;
      cursor:pointer;
      flex:0 0 auto;
      transition:background .15s,border-color .15s;
    }
    #tfFilterPanel .ws-debug-btn:hover {
      background:#52525b;
      border-color:#6c6c77;
    }
    #tfFilterPanel .ws-debug-btn.danger {
      background:#7d1f1f;
      border-color:#a43737;
    }
    #tfFilterPanel .ws-debug-btn.danger:hover {
      background:#9a2626;
      border-color:#c64949;
    }
    #tfFilterPanel .ws-debug-status {
      margin-top:4px;
      font-size:10px;
      opacity:.75;
      line-height:1.3;
      word-break:break-word;
    }
    #tfFilterPanel .ws-actions-flexwrap {
      flex-wrap:wrap !important;
    }
    #tfFilterPanel button.ws-hide-all-fullwidth {
      width:100%;
      order:3;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

/* =========================================================================================
   === APPENDED BLOCK (ADD ONLY) v0.3.8 ADVANCED DIAGNOSTICS & ENHANCED SNAPSHOT ENGINE  ===
   =========================================================================================
   Adds:
   - True effective visibility detection (computed style + offset dimensions + ancestor chain).
   - De-duplication by login (prefers highest card ancestor).
   - Post-toggle delayed snapshot (pre & post apply).
   - Force Reapply + Adv Snapshot button.
   - Adv Snapshot button separate from legacy snapshot.
   - Mutation attribute observer for classification changes (records apply cycles).
   - Mismatch detector (items visible while their category disabled).
   - Separate advanced log (localStorage) plus optional console output.
   - Does NOT modify or remove prior code (add-only).
*/
(function(){
  if (window.__WS_OVERLAY_ADV_DIAG_V038__) return;
  window.__WS_OVERLAY_ADV_DIAG_V038__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  const ADV_FLAG_PROXY = 'WS_OVERLAY_DEBUG_ENABLED_V1'; // reuse existing toggle
  const ADV_LOG_KEY    = 'WS_OVERLAY_ADV_DEBUG_LOG_V1';
  const ADV_MAX_LOG    = 8000;
  const ADV_SAMPLE_MAX = 150;
  const CLASS_ATTR     = 'data-ws-classification';
  const APPLY_DEBOUNCE_AFTER_TOGGLE_MS = 420;
  const APPLY_DETECT_SETTLE_MS = 300;

  let advLog = loadAdvLog();
  let lastAdvHash = '';
  let classificationMutationCount = 0;
  let classificationMutationBatch = 0;
  let classificationMutationTimer = null;
  let advInitialPending = true;

  function advNow(){ return new Date().toISOString(); }

  function advDebugEnabled(){
    try { return localStorage.getItem(ADV_FLAG_PROXY)==='1'; } catch { return false; }
  }

  function loadAdvLog(){
    try {
      const raw = localStorage.getItem(ADV_LOG_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr)?arr:[];
    } catch { return []; }
  }
  function saveAdvLog(){
    try {
      localStorage.setItem(ADV_LOG_KEY, JSON.stringify(advLog.slice(-ADV_MAX_LOG)));
    } catch {}
  }

  function advHash(obj){
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify({
        v:obj.visibleCount,
        h:obj.hiddenCount,
        mm:obj.mismatches?.length||0,
        d:obj.classCounts,
        t:obj.toggles
      })))).slice(0,44);
    } catch { return Math.random().toString(36).slice(2); }
  }

  function getPanelToggles(){
    const out={whitelist:false,greylist:false,blacklist:false,unknown:false};
    const panel=document.getElementById('tfFilterPanel');
    if(!panel) return out;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat = cb.getAttribute('data-category');
      if(cat in out) out[cat]=cb.checked;
    });
    return out;
  }

  function findCardForAnchor(anchor){
    return anchor.closest('[data-target="directory-page__card"]') ||
           anchor.closest('[data-target="browse-page__card"]') ||
           anchor.closest('article') ||
           anchor;
  }

  function extractLoginFromHref(href){
    if(!href) return null;
    href = href.split('?')[0];
    const parts = href.split('/').filter(Boolean);
    if (parts.length===1) return parts[0].toLowerCase();
    return null;
  }

  function enumerateBaseEntries(){
    const anchors=document.querySelectorAll('a[href^="/"][data-test-selector="PreviewCard-link"], a[data-a-target="preview-card-image-link"]');
    const map=new Map(); // login -> {card, login}
    anchors.forEach(a=>{
      const login=extractLoginFromHref(a.getAttribute('href'));
      if(!login) return;
      const card=findCardForAnchor(a);
      if(!map.has(login)){
        map.set(login,{login, card});
      } else {
        // prefer higher ancestor (fewer ancestors up to body)
        const cur=map.get(login).card;
        if(cur && card){
          const depthA = depth(card);
          const depthB = depth(cur);
          if (depthA < depthB) map.set(login,{login,card});
        }
      }
    });
    return Array.from(map.values());
  }

  function depth(node){
    let d=0; let p=node;
    while(p && p!==document.body){ d++; p=p.parentElement; }
    return d;
  }

  function effectiveVisibility(node){
    if(!node || !node.isConnected) return false;
    let el=node;
    while(el && el!==document){
      const cs = window.getComputedStyle(el);
      if(cs.display==='none' || cs.visibility==='hidden' || cs.opacity==='0') return false;
      el = el.parentElement;
    }
    // offset check
    if(node.offsetWidth<=0 && node.offsetHeight<=0){
      // Might still be visible if using transforms, but treat as hidden.
      if(!node.getClientRects().length) return false;
    }
    return true;
  }

  function classifyOfCard(card){
    return (card.getAttribute(CLASS_ATTR) || 'unknown').toLowerCase();
  }

  function advSnapshot(reason){
    const toggles = getPanelToggles();
    const entries = enumerateBaseEntries();
    const dist = {whitelist:0,greylist:0,blacklist:0,unknown:0,unclassified:0};
    const mismatches=[];
    const visibleList=[];
    const hiddenList=[];
    let visibleCount=0, hiddenCount=0;

    entries.forEach(ent=>{
      const cls = classifyOfCard(ent.card);
      const category = dist[cls] !== undefined ? cls : 'unclassified';
      dist[category] = (dist[category]||0)+1;
      const vis = effectiveVisibility(ent.card);
      const shouldBeVisible = toggles[cls]===true;
      if(vis){
        visibleCount++;
        if(visibleList.length < ADV_SAMPLE_MAX) visibleList.push({login:ent.login, cls});
        if(!shouldBeVisible){
          mismatches.push({login:ent.login, cls, vis, reason:'category-disabled-still-visible'});
        }
      } else {
        hiddenCount++;
        if(hiddenList.length < ADV_SAMPLE_MAX) hiddenList.push({login:ent.login, cls});
        if(shouldBeVisible){
          mismatches.push({login:ent.login, cls, vis, reason:'category-enabled-hidden'});
        }
      }
    });

    // Detect duplicates by counting same login appearing multiple times in DOM (anchor/copies)
    const rawDupCounts = {};
    document.querySelectorAll('['+CLASS_ATTR+']').forEach(el=>{
      const login = extractLoginFromHref(el.getAttribute('href')||'') ||
        extractLoginFromHref(el.querySelector('a[href^="/"]')?.getAttribute('href')||'') || null;
      if(login){
        rawDupCounts[login]=(rawDupCounts[login]||0)+1;
      }
    });
    const duplicates = Object.entries(rawDupCounts).filter(([,c])=>c>1).map(([login,c])=>({login,count:c}));

    const snap = {
      time: advNow(),
      adv: true,
      reason,
      toggles,
      visibleCount,
      hiddenCount,
      classCounts: dist,
      mismatches,
      duplicates: duplicates.slice(0,50),
      sampleVisible: visibleList,
      sampleHidden: hiddenList,
      classificationMutations: classificationMutationBatch,
      totalClassificationMutations: classificationMutationCount
    };
    return snap;
  }

  function advLogEvent(reason, force=false){
    if(!advDebugEnabled()) return;
    const snap = advSnapshot(reason);
    const h = advHash(snap);
    snap.hash = h;
    // For passive reasons, skip if identical & no mismatches
    if(!force && snap.mismatches.length===0 && h===lastAdvHash && /post-apply|mutation|interval/.test(reason)){
      return;
    }
    lastAdvHash = h;
    advLog.push(snap);
    if(advLog.length>ADV_MAX_LOG) advLog = advLog.slice(-ADV_MAX_LOG);
    saveAdvLog();
    try {
      console.debug('[WS ADV]', reason, snap);
    } catch {}
  }

  // Post toggle delayed snapshot (pre & post)
  function installToggleHooks(){
    document.addEventListener('change', e=>{
      if(!advDebugEnabled()) return;
      if(e.target && e.target.matches('#tfFilterPanel input[type="checkbox"][data-category]')){
        advLogEvent('toggle-immediate-'+e.target.getAttribute('data-category'), true);
        setTimeout(()=>advLogEvent('toggle-post-apply', false), APPLY_DEBOUNCE_AFTER_TOGGLE_MS);
      }
    }, true);
  }

  // Save / Save+Reload pre snapshot
  function installSaveHooks(){
    document.addEventListener('click', e=>{
      if(!advDebugEnabled()) return;
      const t=e.target;
      if(!t) return;
      if(t.matches('#tfFilterPanel .tf-action-btn[data-action="save"]')){
        advLogEvent('save-click-pre', true);
        setTimeout(()=>advLogEvent('save-click-post', false), 500);
      } else if(t.matches('#tfFilterPanel .tf-action-btn[data-action="save-reload"]')){
        advLogEvent('save-reload-click-pre', true);
        // after reload a fresh initial will happen anyway
      }
    }, true);
  }

  // Mutation observer for classification attribute changes to approximate apply cycles
  function installClassificationObserver(){
    const root = document.body;
    if(!root) return;
    const mo = new MutationObserver(muts=>{
      let attrChanges=0;
      muts.forEach(m=>{
        if(m.type==='attributes' && m.attributeName===CLASS_ATTR) attrChanges++;
      });
      if(attrChanges){
        classificationMutationCount += attrChanges;
        classificationMutationBatch += attrChanges;
        if(classificationMutationTimer) clearTimeout(classificationMutationTimer);
        classificationMutationTimer = setTimeout(()=>{
          if(advDebugEnabled()){
            advLogEvent('mutation-classification', false);
          }
          classificationMutationBatch=0;
        }, APPLY_DETECT_SETTLE_MS);
      }
    });
    mo.observe(root,{subtree:true, attributes:true, attributeFilter:[CLASS_ATTR]});
  }

  // Force Reapply + Adv Snapshot button & Adv Snapshot button
  function addAdvButtons(){
    const panel = document.getElementById('tfFilterPanel');
    if(!panel){
      setTimeout(addAdvButtons,600);
      return;
    }
    let tools = panel.querySelector('.ws-debug-tools');
    if(!tools){
      setTimeout(addAdvButtons,600);
      return;
    }
    if(tools.querySelector('[data-ws-adv-btn]')) return;

    const row = document.createElement('div');
    row.className='ws-debug-row ws-adv-row';
    row.innerHTML = `
      <button type="button" class="ws-debug-btn" data-ws-adv-btn="adv-snapshot">Adv Snapshot</button>
      <button type="button" class="ws-debug-btn" data-ws-adv-btn="force-reapply">Force Reapply+Snap</button>
      <button type="button" class="ws-debug-btn" data-ws-adv-btn="adv-download">Adv Download</button>
      <button type="button" class="ws-debug-btn danger" data-ws-adv-btn="adv-clear">Adv Clear</button>
    `;
    tools.appendChild(row);

    row.addEventListener('click', e=>{
      const btn=e.target.closest('[data-ws-adv-btn]');
      if(!btn) return;
      const action=btn.getAttribute('data-ws-adv-btn');
      if(action==='adv-snapshot'){
        advLogEvent('manual-adv-snapshot', true);
        updateAdvStatus('Advanced snapshot captured.');
      } else if(action==='force-reapply'){
        try {
          if(window.__WS_FORCE_LOCAL_FILTER_REFRESH) window.__WS_FORCE_LOCAL_FILTER_REFRESH();
          else if(window.__WS_forceFilterReapply) window.__WS_forceFilterReapply();
        } catch {}
        setTimeout(()=>advLogEvent('force-reapply-post', true), 550);
        updateAdvStatus('Force reapply issued.');
      } else if(action==='adv-download'){
        advDownload();
      } else if(action==='adv-clear'){
        advLog = [];
        saveAdvLog();
        updateAdvStatus('Advanced log cleared.');
        advLogEvent('adv-clear', true);
      }
    });
  }

  function updateAdvStatus(msg){
    const status = document.getElementById('wsDebugStatus');
    if(status){
      status.textContent = (status.textContent||'').split(' | ')[0] + ' | ' + msg;
    }
  }

  function advDownload(){
    try {
      const blob = new Blob([formatAdvLog()],{type:'text/plain'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download='whispershield_overlay_adv_debug_'+Date.now()+'.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        URL.revokeObjectURL(url);
        a.remove();
      },1500);
      updateAdvStatus('Advanced log downloaded.');
      advLogEvent('adv-download', true);
    } catch(e){
      updateAdvStatus('Adv download failed: '+e.message);
    }
  }

  function formatAdvLog(){
    const lines=[];
    lines.push('=== WhisperShield Overlay Advanced Debug Log v0.3.8 ===');
    lines.push('Generated: '+advNow());
    lines.push('Entries: '+advLog.length);
    lines.push('');
    advLog.forEach((e,i)=>{
      lines.push(`#${i+1} @${e.time} :: ${e.reason}`);
      lines.push(JSON.stringify(e,null,2));
      lines.push('');
    });
    return lines.join('\n');
  }

  // Interval monitor to record state drift every 45s
  setInterval(()=>{
    if(advDebugEnabled()) advLogEvent('interval-drift-check');
  }, 45000);

  // Initial
  function initAdv(){
    installToggleHooks();
    installSaveHooks();
    installClassificationObserver();
    addAdvButtons();
    if(advDebugEnabled()){
      advLogEvent('adv-initial', true);
      advInitialPending=false;
    } else {
      // will snapshot once debug is enabled
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initAdv);
  else initAdv();

  // When user toggles main debug to enabled, also produce advanced snapshot
  const watchDebugToggle = setInterval(()=>{
    if(!advInitialPending) return;
    if(advDebugEnabled()){
      advLogEvent('adv-initial-enabled', true);
      advInitialPending=false;
    }
  }, 1000);

  // CSS injection (added buttons)
  (function addAdvCss(){
    if(document.getElementById('wsAdvDiagStyle')) return;
    const css=`
      #tfFilterPanel .ws-adv-row {
        margin-top:4px;
        border-top:1px dashed #3a3a40;
        padding-top:4px;
      }
      #tfFilterPanel .ws-adv-row .ws-debug-btn {
        flex:1 1 calc(50% - 6px);
        min-width:90px;
      }
      #tfFilterPanel .ws-adv-row .ws-debug-btn.danger {
        flex:1 1 100%;
      }
      @media (max-width: 360px){
        #tfFilterPanel .ws-adv-row .ws-debug-btn {
          flex:1 1 100%;
        }
      }
    `;
    const st=document.createElement('style');
    st.id='wsAdvDiagStyle';
    st.textContent=css;
    document.head.appendChild(st);
  })();

  console.debug('[WhisperShield] Advanced diagnostics v0.3.8 active.');
})();

/* === END OF APPENDED ADVANCED DIAGNOSTICS v0.3.8 (ADD ONLY) === */

/* =================================================================================================
   === APPENDED BLOCK (ADD ONLY) v0.0.1 STRICT CATEGORY UNION ENFORCER (NO VERSION BUMP REQUESTED) ===
   -------------------------------------------------------------------------------------------------
   User requirement restated (strict union logic):
     - If ONLY whitelist is toggled => show only whitelist.
     - If whitelist + greylist toggled => show only whitelist ∪ greylist (NOT blacklist, NOT unknown).
     - If ONLY unknown toggled => show only uncategorized (unknown) channels.
     - If ONLY blacklist toggled => show only blacklist.
     - Any combination => show exactly the union of the enabled category sets.
     - Unknown = streamers not in any list (classification 'unknown'); they are only shown when Unknown
       toggle is ON, and hidden otherwise.
   NOTES:
     * Previous appended engines already try to do this, but multiple overlapping
       blocks could race; this unified enforcement pass runs AFTER all others.
     * DOES NOT REMOVE OR MODIFY existing code; purely additive. Safe re‑entrant.
     * Respects Hide-All (ws-hide-all) body class.
   Implementation:
     1. Reads the checkbox states directly from #tfFilterPanel.
     2. Gathers all visible candidate cards (anchors/articles).
     3. For each card, obtains existing data-ws-classification (else treats as 'unknown').
     4. Applies union rule strictly: display only if classification in enabled set.
     5. If zero toggles are enabled => hide all (explicit).
     6. Periodically enforces to override earlier conflicting style changes.
   ================================================================================================= */
(function(){
  if (window.__WS_STRICT_UNION_ENFORCER__) return;
  window.__WS_STRICT_UNION_ENFORCER__ = true;
  if (!location.href.includes('/directory/category/asmr')) return;

  const CLASS_ATTR = 'data-ws-classification';
  const ENFORCE_INTERVAL_MS = 5000;
  const DEBOUNCE_MS = 120;
  let enforceTimer = null;
  let scheduled = false;

  function logDebug(){ /* silent; can enable if needed */ }

  function getToggles(){
    const out = {whitelist:false, greylist:false, blacklist:false, unknown:false};
    const panel = document.getElementById('tfFilterPanel');
    if (!panel) return out;
    panel.querySelectorAll('input[type="checkbox"][data-category]').forEach(cb=>{
      const cat = cb.getAttribute('data-category');
      if (cat in out) out[cat] = !!cb.checked;
    });
    return out;
  }

  function collectCardsStrict(){
    const anchors = document.querySelectorAll(
      'a[href^="/"][data-test-selector="PreviewCard-link"], a[data-a-target="preview-card-image-link"]'
    );
    const map = new Map();
    anchors.forEach(a=>{
      try{
        let href = a.getAttribute('href');
        if(!href) return;
        href = href.split('?')[0];
        const parts = href.split('/').filter(Boolean);
        if (parts.length !== 1) return;
        const login = parts[0].toLowerCase();
        let card = a.closest('[data-target="directory-page__card"]') ||
                   a.closest('[data-target="browse-page__card"]') ||
                   a.closest('article') || a;
        if(!map.has(login)) map.set(login, []);
        map.get(login).push(card);
      }catch{}
    });
    return map;
  }

  function classifyFromAttr(el){
    return (el.getAttribute(CLASS_ATTR) || 'unknown').toLowerCase();
  }

  function scheduleEnforce(){
    if(scheduled) return;
    scheduled = true;
    clearTimeout(enforceTimer);
    enforceTimer = setTimeout(()=>{
      scheduled = false;
      try { enforceOnce('debounced'); } catch {}
    }, DEBOUNCE_MS);
  }

  function enforceOnce(reason){
    const toggles = getToggles();
    const enabled = Object.entries(toggles).filter(([k,v])=>v).map(([k])=>k);
    const enabledSet = new Set(enabled);
    const zeroEnabled = enabled.length === 0;
    const hideAllMode = document.body.classList.contains('ws-hide-all');
    const cardMap = collectCardsStrict();

    cardMap.forEach(cards=>{
      cards.forEach(card=>{
        const cls = classifyFromAttr(card);
        // Unknown classification counts only if 'unknown' toggle is on.
        let show = !hideAllMode && !zeroEnabled && enabledSet.has(cls);
        if (zeroEnabled) show = false;
        // Apply display logic
        if (show){
          if (card.__wsStrictOrigDisplay !== undefined){
            card.style.display = card.__wsStrictOrigDisplay;
          } else {
            card.style.display = '';
          }
        } else {
          if (card.__wsStrictOrigDisplay === undefined){
            card.__wsStrictOrigDisplay = card.style.display || '';
          }
          card.style.display = 'none';
        }
      });
    });
    logDebug('[StrictUnionEnforcer] Applied', {reason, enabled});
  }

  // Mutation observer to re‑enforce after dynamic Twitch changes
  function installObserver(){
    const root = document.querySelector('[data-target="directory-container"]') ||
                 document.querySelector('[role="main"]') ||
                 document.body;
    if(!root) { setTimeout(installObserver, 600); return; }
    const mo = new MutationObserver(muts=>{
      let relevant = false;
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){ relevant = true; break; }
        if(m.removedNodes && m.removedNodes.length){ relevant = true; break; }
      }
      if(relevant) scheduleEnforce();
    });
    mo.observe(root, {childList:true, subtree:true});
  }

  // Re‑enforce when toggles change
  document.addEventListener('change', e=>{
    if(e.target && e.target.matches('#tfFilterPanel input[type="checkbox"][data-category]')){
      scheduleEnforce();
    }
  }, true);

  // Hide-All state changes
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden) scheduleEnforce();
  });

  // Periodic safety enforcement
  setInterval(()=>{ try { enforceOnce('interval'); } catch {} }, ENFORCE_INTERVAL_MS);

  function init(){
    installObserver();
    enforceOnce('init');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Public hook (optional)
  window.__WS_STRICT_UNION_ENFORCE_NOW = ()=>enforceOnce('manual');

  console.debug('[WhisperShield] Strict category union enforcement active (add-only, project version 0.0.1).');
})();

/* === END STRICT CATEGORY UNION ENFORCER (ADD ONLY) === */
