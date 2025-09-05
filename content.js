// WhisperShield content.js v0.0.1 (unchanged)
(function(){
  const LOCAL_VERSION="0.0.1";
  let lastUrl=location.href;
  let lastCategorySent="";

  function extractChannel(u){
    try{
      const url=new URL(u);
      if(!/twitch\.tv$/i.test(url.hostname)) return null;
      const m=url.pathname.match(/^\/([^\/?#]+)/);
      return m?m[1].toLowerCase():null;
    }catch{return null;}
  }
  function send(type,data={}){ try{ chrome.runtime.sendMessage({type,...data}); }catch{} }
  function emitNavigation(){
    const url=location.href;
    if(url===lastUrl) return;
    send("TWITCH_NAVIGATED",{url,prevUrl:lastUrl});
    lastUrl=url;
  }
  function findCategory(){
    const selectors=[
      'a[data-test="stream-info-card-component__game_link"]',
      'a[href*="/directory/category/"]',
      'span[data-a-target="stream-game-link"]',
      'p[data-a-target="stream-game-link"]'
    ];
    for(const sel of selectors){
      const el=document.querySelector(sel);
      if(el && el.textContent.trim()) return el.textContent.trim();
    }
    const meta=document.querySelector('meta[property="og:video:tag"]');
    if(meta?.content) return meta.content.trim();
    return "";
  }
  function checkCategory(){
    const channel=extractChannel(location.href);
    if(!channel) return;
    const cat=findCategory();
    if(!cat) return;
    if(cat!==lastCategorySent){
      lastCategorySent=cat;
      send("CATEGORY_DETECTED",{login:channel,category:cat});
    }
  }
  function detectRaidBanner(muts){
    for(const m of muts){
      if(m.addedNodes){
        for(const n of m.addedNodes){
          if(!(n instanceof HTMLElement)) continue;
            if(/has raided|is raiding|incoming raid/i.test(n.textContent||"")){
            send("RAID_DETECTED",{fromStreamer:"",fromCategory:""});
          }
        }
      }
    }
  }
  function installObservers(){
    const obs=new MutationObserver(detectRaidBanner);
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }
  setInterval(()=>{ emitNavigation(); checkCategory(); },1200);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ emitNavigation(); checkCategory(); }});
  installObservers();
  emitNavigation();
  checkCategory();
  send("DEBUG_LOG",{version:LOCAL_VERSION});
})();

// === APPENDED BLOCK (ADD ONLY) ===
// Reserved for future DOM classification hints (currently no-op).
(function(){
  if (window.__WS_CONTENT_APPEND__) return;
  window.__WS_CONTENT_APPEND__ = true;
  // Placeholder: could emit periodic hints or prefetch categories.
})();
