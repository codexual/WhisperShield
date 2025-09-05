// WhisperShield options.js v0.0.1 (unchanged)
const $ = sel => document.querySelector(sel);

function setTheme(t){ document.body.setAttribute("data-theme",t); localStorage.setItem("ws-theme",t); }
function getTheme(){ const s=localStorage.getItem("ws-theme"); return (s==="light"||s==="dark")?s:"dark"; }
function linesToArray(text){ return (text||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
function arrayToText(arr){ return (arr||[]).join("\n"); }

const FIRE_AND_FORGET_SET=new Set(["SAVE_SETTINGS","CLEAR_LOGS","RESET_BLOCK_COUNT","TEST_LOG_REQUEST"]);

function sendMessageAsync(message,{timeoutMs=8000,retry=true}={}){
  if(FIRE_AND_FORGET_SET.has(message.type)){
    try{chrome.runtime.sendMessage(message);}catch{}
    return Promise.resolve({ok:true,fireAndForget:true});
  }
  return new Promise((resolve,reject)=>{
    let finished=false;
    const timer=setTimeout(()=>{ if(finished)return; finished=true; reject(new Error("Message timeout ("+(message?.type||"UNKNOWN")+")"));},timeoutMs);
    const attempt=(isRetry=false)=>{
      try{
        chrome.runtime.sendMessage(message,response=>{
          if(finished) return;
          const err=chrome.runtime.lastError;
          if(err){
            const msg=err.message||"";
            if(/message port closed|no response|receiving end does not exist/i.test(msg) && retry && !isRetry){
              return setTimeout(()=>attempt(true),250);
            }
            clearTimeout(timer); finished=true; return reject(new Error(msg));
          }
          clearTimeout(timer); finished=true; resolve(response);
        });
      }catch(e){
        if(finished)return;
        clearTimeout(timer); finished=true; reject(e);
      }
    };
    attempt(false);
  });
}
function sendFF(type,payload={}){ return sendMessageAsync({type,...payload},{timeoutMs:0,retry:false}); }

async function fetchSettings(){
  for(let i=0;i<2;i++){
    try{
      const r=await sendMessageAsync({type:"GET_SETTINGS"});
      if(r && r.settings) return r.settings;
    }catch(e){
      if(i===1) throw e;
      await new Promise(r=>setTimeout(r,150));
    }
  }
  throw new Error("Failed to retrieve settings after retry.");
}

function flash(sel,msg,error=false,timeout=3500){
  const el=typeof sel==="string"?$(sel):sel;
  if(!el) return;
  el.textContent=msg;
  el.classList.toggle("error",!!error);
  if(timeout) setTimeout(()=>{ if(el.textContent===msg){ el.textContent=""; el.classList.remove("error");}},timeout);
}

let cachedLogs=[];
let lastGreylistSnapshot=new Set();
let pauseState={paused:false,resumeAt:0};
let pauseInterval=null;

async function getPauseState(){
  const resp=await sendMessageAsync({type:"GET_PAUSE_STATE"});
  pauseState=resp||{paused:false,resumeAt:0};
  updatePauseUI();
  if(pauseInterval) clearInterval(pauseInterval);
  pauseInterval=setInterval(updatePauseUI,30*1000);
}
async function setPauseState(paused){
  let mins=0;
  const sel=$("#pauseTimerSelect"), custom=$("#pauseCustomMins");
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
  await sendMessageAsync({type:"SET_PAUSE_STATE",paused,resumeAt});
  pauseState={paused,resumeAt};
  updatePauseUI();
}
function minsRemaining(ms){ return Math.max(0,Math.ceil(ms/60000)); }
function updatePauseUI(){
  const btn=$("#pauseBtn"), sel=$("#pauseTimerSelect"), info=$("#pauseTimerInfo"), custom=$("#pauseCustomMins");
  if(!btn||!sel||!info||!custom) return;
  if(pauseState.paused){
    btn.textContent="Resume Protection";
    sel.disabled=true;
    custom.style.display="none";
    if(pauseState.resumeAt && pauseState.resumeAt>Date.now()){
      const m=minsRemaining(pauseState.resumeAt-Date.now());
      info.textContent=`Auto-resume in ${m} min (${new Date(pauseState.resumeAt).toLocaleTimeString()})`;
    } else info.textContent="Protection paused indefinitely.";
  } else {
    btn.textContent="Pause Protection";
    sel.disabled=false;
    info.textContent="";
    custom.style.display = sel.value==="custom" ? "" : "none";
  }
}

async function load(){
  setTheme(getTheme());
  const s=await fetchSettings();
  populateSettingsUI(s);
  updateAuthStatus(s.oauth);
  snapshotGreylist(s.greylistStreamers);
  await loadLogs(false);
  await refreshUpdateStatus();
  await getPauseState();
  flash("#saveStatus","Settings loaded.",false,1800);
}

function populateSettingsUI(s){
  $("#safeCategories").value=arrayToText(s.safeCategories);
  $("#whitelist").value=arrayToText(s.whitelist);
  $("#greylistStreamers").value=arrayToText(s.greylistStreamers);
  $("#blacklistStreamers").value=arrayToText(s.blacklistStreamers);
  $("#blacklistCategories").value=arrayToText(s.blacklistCategories);
  $("#redirectBehavior").value=s.redirectBehavior||"close";
  $("#customRedirectUrl").value=s.customRedirectUrl||"";
  $("#graceWindowMs").value=s.graceWindowMs!=null?s.graceWindowMs:8000;
  $("#strictImmediateBlock").checked=!!s.strictImmediateBlock;
  $("#inferRaidFromUrl").checked=s.inferRaidFromUrl!==false;
  $("#raidPollMs").value=s.raidPollMs!=null?s.raidPollMs:1500;
  $("#autoGreylist").checked=s.autoGreylist!==false;

  $("#clientId").value=s.oauth?.clientId||"";
  ensureAuthModeRadios(s.oauth?.mode||"implicit");
  $("#clientSecret").value=s.oauth?.clientSecret||"";
  toggleSecretRow();
  $("#debugToggle").checked=!!s.debugLogging;

  const rl=s.remoteLists||{};
  $("#enableRemoteWhitelist").checked=!!rl.enableWhitelist;
  $("#enableRemoteGreylist").checked=!!rl.enableGreylist;
  $("#enableRemoteBlacklist").checked=!!rl.enableBlacklist;
  $("#remoteWhitelistUrl").value=rl.whitelistUrl||"";
  $("#remoteGreylistUrl").value=rl.greylistUrl||"";
  $("#remoteBlacklistUrl").value=rl.blacklistUrl||"";
  $("#remoteTtlMinutes").value=rl.ttlMinutes!=null?rl.ttlMinutes:30;
  updateRemoteCounts(rl);
  updateRemoteLastFetched(rl.lastFetched);
}

function snapshotGreylist(arr){ lastGreylistSnapshot=new Set((arr||[]).map(x=>x.toLowerCase())); }
function updateRemoteCounts(rl){
  $("#remoteWhitelistCount").textContent=rl.cache?.whitelist?.length?`Fetched: ${rl.cache.whitelist.length}`:"";
  $("#remoteGreylistCount").textContent=rl.cache?.greylist?.length?`Fetched: ${rl.cache.greylist.length}`:"";
  $("#remoteBlacklistCount").textContent=rl.cache?.blacklist?.length?`Fetched: ${rl.cache.blacklist.length}`:"";
}
function updateRemoteLastFetched(ts){
  $("#remoteLastFetched").textContent=ts?("Last fetched: "+new Date(ts).toLocaleString()):"Remote lists not fetched yet.";
}
function fmtRemain(secs){
  if(secs<0){
    const a=Math.abs(secs),m=Math.floor(a/60),s=a%60;
    return `expired ${m?m+"m ":""}${s}s ago`;
  }
  const m=Math.floor(secs/60),s=secs%60;
  return `${m?m+"m ":""}${s}s`;
}

function ensureAuthModeRadios(mode){ document.querySelectorAll('input[name="authMode"]').forEach(r=>{ r.checked=(r.value===mode); }); }
function getSelectedAuthMode(){ const r=document.querySelector('input[name="authMode"]:checked'); return r?r.value:"implicit"; }
function toggleSecretRow(){ $("#clientSecretRow").style.display=getSelectedAuthMode()==="app"?"":"none"; }

async function saveAll(){
  const s=await fetchSettings();
  const merged={
    ...s,
    safeCategories:linesToArray($("#safeCategories").value),
    whitelist:linesToArray($("#whitelist").value),
    greylistStreamers:linesToArray($("#greylistStreamers").value),
    blacklistStreamers:linesToArray($("#blacklistStreamers").value),
    blacklistCategories:linesToArray($("#blacklistCategories").value),
    redirectBehavior:$("#redirectBehavior").value,
    customRedirectUrl:$("#customRedirectUrl").value.trim(),
    debugLogging:$("#debugToggle").checked,
    graceWindowMs:parseInt($("#graceWindowMs").value,10)||0,
    strictImmediateBlock:$("#strictImmediateBlock").checked,
    inferRaidFromUrl:$("#inferRaidFromUrl").checked,
    raidPollMs:Math.max(300,parseInt($("#raidPollMs").value,10)||1500),
    autoGreylist:$("#autoGreylist").checked,
    oauth:{
      ...s.oauth,
      clientId:$("#clientId").value.trim(),
      clientSecret:$("#clientSecret").value.trim(),
      mode:getSelectedAuthMode(),
      accessToken:s.oauth.accessToken,
      accessTokenExp:s.oauth.accessTokenExp,
      tokenType:s.oauth.tokenType
    },
    remoteLists:{
      ...(s.remoteLists||{}),
      enableWhitelist:$("#enableRemoteWhitelist").checked,
      enableGreylist:$("#enableRemoteGreylist").checked,
      enableBlacklist:$("#enableRemoteBlacklist").checked,
      whitelistUrl:$("#remoteWhitelistUrl").value.trim(),
      greylistUrl:$("#remoteGreylistUrl").value.trim(),
      blacklistUrl:$("#remoteBlacklistUrl").value.trim(),
      ttlMinutes:parseInt($("#remoteTtlMinutes").value,10)||30,
      cache:s.remoteLists?.cache||{whitelist:[],greylist:[],blacklist:[]},
      lastFetched:s.remoteLists?.lastFetched||0
    }
  };
  if(s.oauth.mode!==merged.oauth.mode){
    if(merged.oauth.mode==="none"||merged.oauth.mode==="app"){
      if(!(merged.oauth.mode==="app" && merged.oauth.clientSecret)){
        merged.oauth.accessToken="";
        merged.oauth.accessTokenExp=0;
        merged.oauth.tokenType="";
      }
    }
  }
  await sendFF("SAVE_SETTINGS",{settings:merged});
  const fresh=await fetchSettings();
  populateSettingsUI(fresh);
  updateAuthStatus(fresh.oauth);
  snapshotGreylist(fresh.greylistStreamers);
  await refreshUpdateStatus();
}

async function saveSection(scope){
  const target="#saveResult-"+scope;
  try{
    await saveAll();
    flash(target,"Saved",false,2000);
  }catch(e){
    flash(target,"Error: "+e.message,true,6000);
  }
}

async function loadLogs(showFlash=true){
  const resp=await sendMessageAsync({type:"GET_LOGS"});
  cachedLogs=resp?.logs||([]);
  applyLogFilter();
  if(showFlash) flash("#saveStatus","Logs refreshed.",false,1500);
}
function applyLogFilter(){
  const f=($("#logFilter").value||"").toLowerCase();
  const list=f?cachedLogs.filter(e=> e.event?.toLowerCase().includes(f) || JSON.stringify(e.details||{}).toLowerCase().includes(f) ):cachedLogs;
  $("#logsOut").textContent=list.slice(0,400).map(e=>`[${e.time}] ${e.event}: ${JSON.stringify(e.details)}`).join("\n");
}
function downloadLogs(){
  sendMessageAsync({type:"GET_LOGS"}).then(resp=>{
    const logs=resp?.logs||[];
    const blob=new Blob([logs.map(e=>`[${e.time}] ${e.event}: ${JSON.stringify(e.details)}`).join("\n")],{type:"text/plain"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="whispershield_logs.txt";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }).catch(e=>flash("#saveStatus","Download error: "+e.message,true,5000));
}

function updateAuthStatus(oauth){
  const el=$("#authStatus");
  const clientId=$("#clientId").value.trim();
  const mode=oauth?.mode||getSelectedAuthMode();
  const token=oauth?.accessToken||"";
  const exp=oauth?.accessTokenExp||0;
  if(mode==="none"){
    el.textContent=clientId?"Auth mode: None (DOM parsing only).":"Auth mode: None. No Client ID.";
    el.className="muted small"; return;
  }
  if(!clientId){
    el.textContent="No Client ID. Enter one and Save.";
    el.className="muted small"; return;
  }
  if(mode==="app"){
    if(!$("#clientSecret").value.trim()){
      el.textContent="App mode: missing Client Secret.";
      el.className="status error small"; return;
    }
    if(!token){
      el.textContent="App token not yet fetched.";
      el.className="muted small"; return;
    }
    if(exp){
      const now=Math.floor(Date.now()/1000);
      const remain=exp-now;
      if(remain<=0){
        el.textContent="App token expired.";
        el.className="status error small"; return;
      }
      el.textContent=`App token active (${fmtRemain(remain)} left).`;
      el.className=remain<=600?"status small error":"status small"; return;
    }
    el.textContent="App token present.";
    el.className="status small"; return;
  }
  if(mode==="implicit"){
    if(!token){
      el.textContent="User mode: Not signed in.";
      el.className="muted small"; return;
    }
    if(exp){
      const now=Math.floor(Date.now()/1000);
      const remain=exp-now;
      if(remain<=0){
        el.textContent="User token expired.";
        el.className="status error small"; return;
      }
      el.textContent=`User token active (${fmtRemain(remain)} left).`;
      el.className=remain<=120?"status small error":"status small"; return;
    }
    el.textContent="User token present.";
    el.className="status small";
  }
}

async function refreshUpdateStatus(){
  const resp=await sendMessageAsync({type:"GET_UPDATE_STATUS"});
  const info=resp?.update;
  const el=$("#updateStatus");
  if(!el||!info) return;
  if(info.needsUpdate){
    el.innerHTML=`Update available: <strong>${info.local}</strong> → <strong>${info.remote}</strong> <a href="https://github.com/codexual/WhisperShield" target="_blank">Get it</a>`;
    el.className="status small";
  } else {
    el.textContent=`Current version: ${info.local}`;
    el.className="muted small";
  }
}

async function clearLogs(){ await sendFF("CLEAR_LOGS"); await loadLogs(false); flash("#saveStatus","Logs cleared."); }
function emitTestLog(){ sendFF("TEST_LOG_REQUEST"); setTimeout(()=>loadLogs(false),250); }
async function refreshRemoteLists(){
  try{
    const res=await sendMessageAsync({type:"REFRESH_REMOTE_LISTS"});
    if(res?.ok){
      flash("#saveStatus","Remote lists refreshed.");
      const fresh=await fetchSettings();
      populateSettingsUI(fresh);
      snapshotGreylist(fresh.greylistStreamers);
    } else flash("#saveStatus","Remote refresh failed.",true,6000);
  }catch(e){
    flash("#saveStatus","Remote refresh error: "+e.message,true,6000);
  }
}
async function exportSettings(){
  try{
    const s=await fetchSettings();
    const blob=new Blob([JSON.stringify(s,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="whispershield_settings.json";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
    flash("#saveStatus","Settings exported.");
  }catch(e){
    flash("#saveStatus","Export failed: "+e.message,true,6000);
  }
}
async function importSettings(file){
  try{
    const text=await file.text();
    const inc=JSON.parse(text);
    const cur=await fetchSettings();
    function mergeArray(a,b){return Array.from(new Set([...(a||[]),...(Array.isArray(b)?b:[])].map(x=>String(x).trim()).filter(Boolean))); }
    const merged={
      ...cur,
      safeCategories:mergeArray(cur.safeCategories,inc.safeCategories),
      whitelist:mergeArray(cur.whitelist,inc.whitelist),
      greylistStreamers:mergeArray(cur.greylistStreamers,inc.greylistStreamers),
      blacklistStreamers:mergeArray(cur.blacklistStreamers,inc.blacklistStreamers),
      blacklistCategories:mergeArray(cur.blacklistCategories,inc.blacklistCategories),
      redirectBehavior:inc.redirectBehavior||cur.redirectBehavior,
      customRedirectUrl:inc.customRedirectUrl||cur.customRedirectUrl,
      debugLogging:inc.debugLogging!=null?inc.debugLogging:cur.debugLogging,
      graceWindowMs:inc.graceWindowMs!=null?inc.graceWindowMs:cur.graceWindowMs,
      strictImmediateBlock:inc.strictImmediateBlock!=null?inc.strictImmediateBlock:cur.strictImmediateBlock,
      inferRaidFromUrl:inc.inferRaidFromUrl!=null?inc.inferRaidFromUrl:cur.inferRaidFromUrl,
      raidPollMs:inc.raidPollMs!=null?inc.raidPollMs:cur.raidPollMs,
      autoGreylist:inc.autoGreylist!=null?inc.autoGreylist:cur.autoGreylist,
      oauth:{
        ...cur.oauth,
        clientId:inc.oauth?.clientId||cur.oauth?.clientId||"",
        clientSecret:inc.oauth?.clientSecret||cur.oauth?.clientSecret||"",
        mode:inc.oauth?.mode||cur.oauth?.mode||"implicit",
        accessToken:cur.oauth?.accessToken||"",
        accessTokenExp:cur.oauth?.accessTokenExp||0,
        tokenType:cur.oauth?.tokenType||""
      },
      remoteLists:{
        ...(cur.remoteLists||{}),
        ...(inc.remoteLists||{}),
        cache:cur.remoteLists?.cache||{whitelist:[],greylist:[],blacklist:[]}
      }
    };
    await sendFF("SAVE_SETTINGS",{settings:merged});
    flash("#saveStatus","Settings imported.");
    populateSettingsUI(merged);
    updateAuthStatus(merged.oauth);
    snapshotGreylist(merged.greylistStreamers);
    await loadLogs(false);
    await refreshUpdateStatus();
  }catch(e){
    flash("#saveStatus","Import failed: "+e.message,true,6000);
  }
}
async function resetBlocked(){
  try{ await sendFF("RESET_BLOCK_COUNT"); flash("#saveStatus","Blocked count reset."); }
  catch(e){ flash("#saveStatus","Reset failed: "+e.message,true,5000); }
}

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==="SETTINGS_UPDATED" && msg.settings){
    const s=msg.settings;
    const newGrey=(s.greylistStreamers||[]).map(x=>x.toLowerCase()).filter(x=>!lastGreylistSnapshot.has(x));
    if(newGrey.length){
      flash("#saveStatus","Greylist +"+newGrey.length+": "+newGrey.join(", "),false,5000);
    }
    populateSettingsUI(s);
    updateAuthStatus(s.oauth||{});
    snapshotGreylist(s.greylistStreamers||[]);
  } else if(msg?.type==="UPDATE_AVAILABLE"){
    refreshUpdateStatus();
  } else if(msg?.type==="PAUSE_STATE_UPDATED"){
    pauseState={paused:msg.paused,resumeAt:msg.resumeAt};
    updatePauseUI();
  }
});

document.addEventListener("DOMContentLoaded",()=>{
  load().catch(e=>flash("#saveStatus","Load failed: "+e.message,true,6000));

  $("#saveAll").addEventListener("click",async()=>{
    try{ await saveAll(); flash("#saveStatus","All saved.",false,2000); }
    catch(e){ flash("#saveStatus","Save error: "+e.message,true,6000); }
  });
  $("#reloadSettings").addEventListener("click",()=>load().catch(e=>flash("#saveStatus","Reload failed: "+e.message,true,6000)));
  $("#toggleTheme").addEventListener("click",()=>setTheme(getTheme()==="dark"?"light":"dark"));

  document.querySelectorAll(".sectionSaveBtn").forEach(btn=>{
    btn.addEventListener("click",()=>saveSection(btn.getAttribute("data-save-scope")));
  });

  $("#loginTwitch").addEventListener("click",async()=>{
    try{
      await saveAll();
      const s=await fetchSettings();
      if(s.oauth.mode!=="implicit"){ flash("#saveResult-auth","Switch to User Login mode first.",true,4000); return; }
      const res=await sendMessageAsync({type:"LOGIN_TWITCH"});
      if(res?.ok) flash("#saveResult-auth","Auth OK.",false,3000);
      else flash("#saveResult-auth","Auth failed.",true,5000);
      const fresh=await fetchSettings();
      updateAuthStatus(fresh.oauth);
    }catch(e){
      flash("#saveResult-auth","Auth error: "+e.message,true,6000);
    }
  });
  $("#clearToken").addEventListener("click",async()=>{
    try{
      const s=await fetchSettings();
      s.oauth.accessToken=""; s.oauth.accessTokenExp=0; s.oauth.tokenType="";
      await sendFF("SAVE_SETTINGS",{settings:s});
      updateAuthStatus(s.oauth);
      flash("#saveResult-auth","Token cleared.",false,2500);
    }catch(e){
      flash("#saveResult-auth","Clear error: "+e.message,true,6000);
    }
  });

  $("#debugToggle").addEventListener("change",()=>saveSection("debug"));
  $("#refreshLogs").addEventListener("click",()=>loadLogs().catch(e=>flash("#saveResult-logs","Logs error: "+e.message,true,6000)));
  $("#downloadLogs").addEventListener("click",downloadLogs);
  $("#clearLogs").addEventListener("click",()=>clearLogs().catch(e=>flash("#saveResult-logs","Clear error: "+e.message,true,6000)));
  $("#emitTestLog").addEventListener("click",emitTestLog);
  $("#logFilter").addEventListener("input",applyLogFilter);

  $("#refreshRemote").addEventListener("click",refreshRemoteLists);
  $("#exportSettings").addEventListener("click",exportSettings);
  $("#importSettingsFile").addEventListener("change",e=>{
    const f=e.target.files?.[0];
    if(f) importSettings(f);
    e.target.value="";
  });
  $("#resetBlockedCount").addEventListener("click",resetBlocked);

  document.querySelectorAll('input[name="authMode"]').forEach(r=>{
    r.addEventListener("change",()=>{
      toggleSecretRow();
      saveSection("auth");
    });
  });
  $("#clientSecret").addEventListener("change",()=>saveSection("auth"));

  $("#pauseBtn").addEventListener("click",()=>setPauseState(!pauseState.paused));
  $("#pauseTimerSelect").addEventListener("change",e=>{
    const custom=$("#pauseCustomMins");
    custom.style.display = (e.target.value==="custom" && !pauseState.paused) ? "" : "none";
    updatePauseUI();
  });
});

// === APPENDED BLOCK (ADD ONLY) ===
// Future options enhancements placeholder.
