// WhisperShield popup.js v0.0.1 (unchanged)
const qs = sel => document.querySelector(sel);

function sendMessage(type, payload){
  return new Promise(resolve=>{
    try{
      chrome.runtime.sendMessage({type, ...payload}, resp=>resolve(resp||{}));
    }catch{
      resolve({});
    }
  });
}

let pauseState={paused:false,resumeAt:0};
let pauseInterval=null;

async function load(){
  const blockResp = await sendMessage("GET_BLOCK_COUNT");
  qs("#blockedCount").textContent = blockResp?.count ?? 0;

  const upd = await sendMessage("GET_UPDATE_STATUS");
  updateUpdateBanner(upd.update);
  chrome.storage.local.get({ wsUpdate:null }, r=>{
    if(r.wsUpdate) updateUpdateBanner(r.wsUpdate);
  });

  await refreshPauseState();
}

function updateUpdateBanner(info){
  const banner = qs("#updateBanner");
  if(!info) return;
  if(info.needsUpdate){
    banner.style.display="block";
    banner.querySelector(".remoteVersion").textContent=info.remote;
    banner.querySelector(".localVersion").textContent=info.local;
  } else {
    banner.style.display="none";
  }
}

async function refreshPauseState(){
  const resp=await sendMessage("GET_PAUSE_STATE");
  pauseState=resp||{paused:false,resumeAt:0};
  updatePauseUI();
  if(pauseInterval) clearInterval(pauseInterval);
  pauseInterval=setInterval(updatePauseUI,30*1000);
}
function minsRemaining(ms){ return Math.max(0,Math.ceil(ms/60000)); }
function updatePauseUI(){
  const btn=qs("#pauseBtn"), sel=qs("#pauseTimerSelect"), info=qs("#pauseTimerInfo"), custom=qs("#pauseCustomMins");
  if(!btn||!sel||!info||!custom) return;
  if(pauseState.paused){
    btn.textContent="Resume Protection";
    sel.disabled=true;
    custom.style.display="none";
    if(pauseState.resumeAt && pauseState.resumeAt>Date.now()){
      const m=minsRemaining(pauseState.resumeAt-Date.now());
      info.textContent=`Auto-resume in ${m}m (${new Date(pauseState.resumeAt).toLocaleTimeString()})`;
    } else {
      info.textContent="Paused indefinitely.";
    }
  } else {
    btn.textContent="Pause Protection";
    sel.disabled=false;
    info.textContent="";
    custom.style.display = sel.value==="custom" ? "" : "none";
  }
}
async function setPauseState(paused){
  let mins=0;
  const sel=qs("#pauseTimerSelect"), custom=qs("#pauseCustomMins");
  if(paused){
    if(sel.value==="custom"){
      const v=parseInt(custom.value,10);
      if(!isNaN(v)&&v>0) mins=v;
    } else {
      mins=parseInt(sel.value,10)||0;
    }
  }
  let resumeAt=0;
  if(paused && mins>0) resumeAt=Date.now()+mins*60000;
  await sendMessage("SET_PAUSE_STATE",{paused,resumeAt});
  pauseState={paused,resumeAt};
  updatePauseUI();
}

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==="UPDATE_AVAILABLE") updateUpdateBanner(msg.info);
  if(msg?.type==="PAUSE_STATE_UPDATED"){
    pauseState={paused:msg.paused,resumeAt:msg.resumeAt};
    updatePauseUI();
  }
});

document.addEventListener("DOMContentLoaded", ()=>{
  load();
  qs("#refreshBtn").addEventListener("click", ()=>load());
  qs("#openOptions").addEventListener("click", ()=>chrome.runtime.openOptionsPage());
  qs("#viewRepo").addEventListener("click", ()=>chrome.tabs.create({url:"https://github.com/codexual/WhisperShield"}));
  qs("#viewRepo2")?.addEventListener("click", ()=>chrome.tabs.create({url:"https://github.com/codexual/WhisperShield"}));
  qs("#ignoreUpdate").addEventListener("click", ()=>{ const b=qs("#updateBanner"); if(b) b.style.display="none"; });
  qs("#pauseBtn").addEventListener("click", ()=>setPauseState(!pauseState.paused));
  qs("#pauseTimerSelect").addEventListener("change", e=>{
    const custom=qs("#pauseCustomMins");
    custom.style.display = (e.target.value==="custom" && !pauseState.paused) ? "" : "none";
    updatePauseUI();
  });
});
