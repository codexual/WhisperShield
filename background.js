// WhisperShield background.js v0.0.1
// PATCH: Immediate blacklist enforcement on raid inference (per user request).
// Added block in processNavigation() after raid_session_started to instantly
// close a tab if the destination streamer is blacklisted (even before category detection).

const LOCAL_VERSION = "0.0.1";
const UPDATE_URL = "https://raw.githubusercontent.com/codexual/WhisperShield/refs/heads/main/update.txt";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PAUSE_KEY = "wsPaused";
const PAUSE_TIMER_KEY = "wsPauseTimer";

const DEFAULT_SETTINGS = {
  safeCategories: ["ASMR"],
  whitelist: [],
  greylistStreamers: [],
  blacklistStreamers: [],
  blacklistCategories: [],
  redirectBehavior: "close",
  customRedirectUrl: "",
  debugLogging: false,
  graceWindowMs: 8000,
  strictImmediateBlock: false,
  inferRaidFromUrl: true,
  raidPollMs: 1500,
  autoGreylist: true,
  remoteLists: {
    enableWhitelist: false,
    enableGreylist: false,
    enableBlacklist: false,
    whitelistUrl: "https://raw.githubusercontent.com/codexual/WhisperShield/refs/heads/main/streamers/remote_whitelist.txt",
    greylistUrl: "https://raw.githubusercontent.com/codexual/WhisperShield/refs/heads/main/streamers/remote_greylist.txt",
    blacklistUrl: "https://raw.githubusercontent.com/codexual/WhisperShield/refs/heads/main/streamers/remote_blacklist.txt",
    ttlMinutes: 30,
    lastFetched: 0,
    cache: { whitelist: [], greylist: [], blacklist: [] }
  },
  oauth: {
    clientId: "",
    clientSecret: "",
    mode: "app",
    accessToken: "",
    accessTokenExp: 0,
    tokenType: ""
  }
};

let raidSessions = {};
let logs = [];
let blockedCountCache = 0;

const STATE_KEY = "wsRaidState_v2";
const LOG_CAP = 1000;
const CATEGORY_CACHE_TTL_MS = 60000;

// Performance optimization: Set-based classification with precedence
const STATE = {
  lists: null,
  sets: null,
  sweepLock: false,
  pendingSweepReason: null
};

// Debug flags
const DEBUG_ALWAYS = false; // Always-on flag for forced debug logging
const DEBUG_PER_ANCHOR = false; // Enable classify logging
const RAID_EXPIRY_MS = 120000;

let raidPending = null;
const raidPendingByTab = {};
const lastChannelByTab = {};
const lastCategoryByChannel = {};
const categoryCache = {};
const actedTabs = new Set();

let stateLoaded = false;
let stateLoadPromise = null;
let stateDirty = false;
let flushTimer = null;
let sessionId = Math.random().toString(36).slice(2);
let tokenRefreshTimer = null;

// ---------- Logging / Badge ----------
function appendLog(event, details) {
  chrome.storage.sync.get({ settings: DEFAULT_SETTINGS }, r => {
    const dbg = !!r.settings?.debugLogging;
    // Honor DEBUG_ALWAYS flag - difference between user logging toggle and developer forced debug
    if (event.startsWith("debug") && !dbg && !DEBUG_ALWAYS) return;
    logs.unshift({ time: new Date().toISOString(), event, details });
    if (logs.length > LOG_CAP) logs.length = LOG_CAP;
    chrome.storage.local.set({ wsLogs: logs });
  });
}
function incrementBlocked(meta) {
  blockedCountCache += 1;
  chrome.storage.local.set({ wsBlockedCount: blockedCountCache });
  updateBadge();
  appendLog("blocked_count_increment", meta || {});
}
function updateBadge() {
  chrome.action.setBadgeBackgroundColor({ color: "#6c63ff" });
  const t = blockedCountCache > 999 ? "999+" : (blockedCountCache ? String(blockedCountCache) : "");
  chrome.action.setBadgeText({ text: t });
}
function resetBlockedCount() {
  blockedCountCache = 0;
  chrome.storage.local.set({ wsBlockedCount: 0 });
  updateBadge();
  appendLog("blocked_count_reset", {});
}

// ---------- Settings ----------
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ settings: DEFAULT_SETTINGS }, r => {
      const s = r.settings || DEFAULT_SETTINGS;
      if (!Array.isArray(s.greylistStreamers)) s.greylistStreamers = [];
      if (!s.remoteLists) s.remoteLists = DEFAULT_SETTINGS.remoteLists;
      if (s.raidPollMs == null) s.raidPollMs = DEFAULT_SETTINGS.raidPollMs;
      if (s.autoGreylist == null) s.autoGreylist = DEFAULT_SETTINGS.autoGreylist;
      if (!s.oauth) s.oauth = DEFAULT_SETTINGS.oauth;
      resolve(s);
    });
  });
}
function setSettings(s) { return chrome.storage.sync.set({ settings: s }); }

// ---------- Remote lists ----------
function scheduleRemoteFetch(reason) {
  getSettings().then(s => {
    const rl = s.remoteLists;
    if (!rl) return;
    const ttlMs = (rl.ttlMinutes || 30) * 60000;
    if (Date.now() - (rl.lastFetched || 0) > ttlMs) {
      fetchRemoteLists(s, reason).catch(e => appendLog("remote_fetch_error", { error: e.message }));
    }
  });
}
async function fetchRemoteLists(current, reason="manual") {
  const s = current || await getSettings();
  const rl = s.remoteLists;
  if (!rl) return;
  async function pull(url, enabled, label) {
    if (!enabled) return [];
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) {
        appendLog("remote_fetch_fail", { list: label, status: resp.status });
        return [];
      }
      return parseList(await resp.text());
    } catch(e) {
      appendLog("remote_fetch_fail",{list:label,error:e.message});
      return [];
    }
  }
  const [wh, gr, bl] = await Promise.all([
    pull(rl.whitelistUrl, rl.enableWhitelist, "whitelist"),
    pull(rl.greylistUrl, rl.enableGreylist, "greylist"),
    pull(rl.blacklistUrl, rl.enableBlacklist, "blacklist")
  ]);
  rl.cache = { whitelist: wh, greylist: gr, blacklist: bl };
  rl.lastFetched = Date.now();
  await setSettings(s);
  appendLog("remote_lists_fetched",{reason,counts:{whitelist:wh.length,greylist:gr.length,blacklist:bl.length}});
  
  // Rebuild Set cache after list changes
  STATE.lists = getEffectiveLists(s);
  buildSetCache();
  
  recheckOpenTabs(s, "remote_fetch");
}
function parseList(text){
  return (text||"").split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>l.toLowerCase());
}
function combineUnique(...arrs){
  const set=new Set();
  arrs.forEach(a=>(a||[]).forEach(x=>set.add(x.toLowerCase())));
  return Array.from(set);
}
function getEffectiveLists(s){
  const rl=s.remoteLists||DEFAULT_SETTINGS.remoteLists;
  // Note: During list merge, duplicates are not removed from arrays to maintain precedence.
  // Classification order: blacklist > whitelist > greylist > unknown ensures proper precedence.
  return {
    whitelist: combineUnique(s.whitelist, rl.enableWhitelist?rl.cache.whitelist:[]),
    greylist:  combineUnique(s.greylistStreamers, rl.enableGreylist?rl.cache.greylist:[]),
    blacklist: combineUnique(s.blacklistStreamers, rl.enableBlacklist?rl.cache.blacklist:[])
  };
}

// Performance optimization: Build Set cache for O(1) list membership checks
function buildSetCache() {
  if (!STATE.lists) return;
  
  STATE.sets = {
    whitelist: new Set(STATE.lists.whitelist),
    greylist: new Set(STATE.lists.greylist), 
    blacklist: new Set(STATE.lists.blacklist)
  };
  
  if (DEBUG_ALWAYS) {
    appendLog("debug_set_cache_built", {
      whitelist: STATE.sets.whitelist.size,
      greylist: STATE.sets.greylist.size,
      blacklist: STATE.sets.blacklist.size
    });
  }
}

// Ensure lists and sets are available
async function ensureData() {
  if (!STATE.lists) {
    const settings = await getSettings();
    STATE.lists = getEffectiveLists(settings);
    buildSetCache();
  }
}

// New classify function with precedence: blacklist > whitelist > greylist > unknown
function classify(login) {
  if (!STATE.sets) return "unknown";
  
  const lower = (login || "").toLowerCase();
  
  if (STATE.sets.blacklist.has(lower)) {
    if (DEBUG_PER_ANCHOR) {
      appendLog("Classify", { login: lower, result: "blacklist" });
    }
    return "blacklist";
  }
  if (STATE.sets.whitelist.has(lower)) {
    if (DEBUG_PER_ANCHOR) {
      appendLog("Classify", { login: lower, result: "whitelist" });
    }
    return "whitelist";
  }
  if (STATE.sets.greylist.has(lower)) {
    if (DEBUG_PER_ANCHOR) {
      appendLog("Classify", { login: lower, result: "greylist" });
    }
    return "greylist";
  }
  
  if (DEBUG_PER_ANCHOR) {
    appendLog("Classify", { login: lower, result: "unknown" });
  }
  return "unknown";
}

// Concurrency guard/debounce for sweeps to reduce redundant overlapping operations
async function performSweep(reason) {
  if (STATE.sweepLock) {
    // Store the latest reason for a pending sweep
    STATE.pendingSweepReason = reason;
    appendLog("SweepCoalesced", { reason });
    return;
  }
  
  STATE.sweepLock = true;
  
  try {
    // Ensure data is available before sweep
    await ensureData();
    
    // Perform the actual sweep operation (refresh views, recheck tabs, etc.)
    appendLog("SweepStarted", { reason });
    
    // For now, this triggers the existing recheck functionality
    const settings = await getSettings();
    recheckOpenTabs(settings, reason);
    
    appendLog("SweepCompleted", { reason });
  } catch (e) {
    appendLog("SweepError", { reason, error: e.message });
  } finally {
    STATE.sweepLock = false;
    
    // If there's a pending sweep, run it immediately
    if (STATE.pendingSweepReason) {
      const pendingReason = STATE.pendingSweepReason;
      STATE.pendingSweepReason = null;
      // Run the pending sweep asynchronously
      setTimeout(() => performSweep(pendingReason), 0);
    }
  }
}

// ---------- Auth ----------
async function ensureToken() {
  const s = await getSettings();
  const o = s.oauth || {};
  if (!o.clientId) return "";
  if (o.mode === "none") return "";
  if (o.mode === "app") return ensureAppToken(s);
  return ensureImplicitUserToken(s);
}
function scheduleAppTokenRefresh(settings) {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  const exp = settings.oauth?.accessTokenExp || 0;
  const now = Math.floor(Date.now()/1000);
  if (!exp) return;
  const lead = 600;
  let delay = (exp - now - lead) * 1000;
  if (delay < 0) delay = 5000;
  tokenRefreshTimer = setTimeout(()=>{
    ensureAppToken().catch(e=>appendLog("debug_app_token_refresh_error",{error:e.message}));
  }, delay);
}
async function ensureAppToken(passedSettings) {
  const s = passedSettings || await getSettings();
  const o = s.oauth || {};
  const now = Math.floor(Date.now()/1000);
  // TODO: Externalize or prompt user for credentials before public distribution
  // Client secrets should not be hardcoded or stored in plain text for security
  if (!o.clientId || !o.clientSecret) {
    appendLog("debug_app_token_missing_secret",{haveId:!!o.clientId});
    return "";
  }
  if (o.accessToken && o.tokenType==="app" && o.accessTokenExp > now + 120) return o.accessToken;
  try {
    const body = new URLSearchParams({
      client_id: o.clientId,
      client_secret: o.clientSecret,
      grant_type: "client_credentials"
    });
    const resp = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type":"application/x-www-form-urlencoded" },
      body
    });
    if (!resp.ok) {
      appendLog("debug_app_token_fetch_fail",{status:resp.status});
      return "";
    }
    const data = await resp.json();
    const token = data.access_token;
    const expires = parseInt(data.expires_in || "0",10);
    if (token && expires) {
      const s2 = await getSettings();
      s2.oauth.accessToken = token;
      s2.oauth.accessTokenExp = Math.floor(Date.now()/1000) + expires;
      s2.oauth.tokenType = "app";
      await setSettings(s2);
      appendLog("app_token_obtained",{exp:s2.oauth.accessTokenExp,mode:s2.oauth.mode});
      scheduleAppTokenRefresh(s2);
      return token;
    }
  } catch(e){
    appendLog("debug_app_token_error",{error:e.message});
  }
  return "";
}
async function ensureImplicitUserToken(passedSettings) {
  const s = passedSettings || await getSettings();
  const o = s.oauth || {};
  const now = Math.floor(Date.now()/1000);
  if (o.accessToken && o.tokenType==="user" && o.accessTokenExp > now + 60) return o.accessToken;
  const redirectUri = chrome.identity.getRedirectURL("twitch");
  const state = crypto.getRandomValues(new Uint32Array(2)).join("-");
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", o.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "");
  url.searchParams.set("state", state);
  const final = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  const frag = (final.split("#")[1] || "");
  const params = new URLSearchParams(frag);
  const token = params.get("access_token");
  const expIn = parseInt(params.get("expires_in") || "3600", 10);
  if (!token) return "";
  const s2 = await getSettings();
  s2.oauth.accessToken = token;
  s2.oauth.accessTokenExp = Math.floor(Date.now()/1000) + expIn;
  s2.oauth.tokenType = "user";
  await setSettings(s2);
  appendLog("oauth_token_obtained",{exp:s2.oauth.accessTokenExp,mode:s2.oauth.mode});
  return token;
}

// ---------- Category ----------
async function getCategoryForChannel(login,s) {
  if(!login) return "";
  const lower=login.toLowerCase();
  const cached=categoryCache[lower];
  if(cached && Date.now()-cached.time < CATEGORY_CACHE_TTL_MS){
    appendLog("debug_category_cache_hit",{login:lower,category:cached.category});
    return cached.category;
  }
  const settings = s || await getSettings();
  const o = settings.oauth || {};
  let token = "";
  if (o.mode !== "none" && o.clientId) {
    if (o.mode === "app") token = await ensureAppToken(settings);
    else if (o.mode === "implicit" && o.accessToken && o.accessTokenExp > Math.floor(Date.now()/1000)+30) token = o.accessToken;
  }
  try {
    const headers = { "Client-ID": settings.oauth.clientId };
    if (token) headers.Authorization = "Bearer " + token;
    const res=await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(lower)}`,{headers});
    if(res.status===401){
      appendLog("debug_api_unauthorized",{login:lower,tokenType:settings.oauth.tokenType});
      const ns=await getSettings();
      ns.oauth.accessToken=""; ns.oauth.accessTokenExp=0; ns.oauth.tokenType="";
      await setSettings(ns);
      return "";
    }
    if(!res.ok){
      appendLog("debug_api_error_status",{login:lower,status:res.status});
      return "";
    }
    const data=await res.json();
    const category=data?.data?.[0]?.game_name||"";
    if(category){
      categoryCache[lower]={category,time:Date.now()};
      lastCategoryByChannel[lower]=category;
      appendLog("debug_category_fetched",{login:lower,category});
    }
    return category;
  } catch(e){
    appendLog("debug_api_error",{login:lower,error:e.message});
    return "";
  }
}

// ---------- Helpers ----------
function isBlacklisted(login, category, s, lists){
  const l=(login||"").toLowerCase();
  const c=(category||"").toLowerCase();
  if (lists.blacklist.includes(l)) return true;
  if (s.blacklistCategories.map(x=>x.toLowerCase()).includes(c)) return true;
  return false;
}
function isWhitelisted(login, lists){
  return !!login && lists.whitelist.includes((login||"").toLowerCase());
}
function urlIndicatesRaid(url){ try { return new URL(url).searchParams.get("referrer")==="raid"; } catch { return false; } }
async function addToGreylist(streamer){
  if(!streamer) return;
  const s=await getSettings();
  if(!s.autoGreylist) return;
  const lower=streamer.toLowerCase();
  const lists=getEffectiveLists(s);
  if (lists.blacklist.includes(lower)||lists.whitelist.includes(lower)||s.greylistStreamers.map(x=>x.toLowerCase()).includes(lower)) return;
  s.greylistStreamers.push(streamer);
  await setSettings(s);
  appendLog("greylist_auto_added",{streamer:lower});
}

// ---------- Persistence ----------
function markStateDirty(){
  stateDirty=true;
  if(!flushTimer) flushTimer=setTimeout(flushState,50);
}
function flushState(){
  flushTimer=null;
  if(!stateDirty) return;
  stateDirty=false;
  const serializable={};
  const now=Date.now();
  for (const [tabId,s] of Object.entries(raidSessions)){
    if (s.blocked || s.finalized) continue;
    if (now - s.started > RAID_EXPIRY_MS) continue;
    const {fromStreamer,fromCategory,started,finalized,blocked,provisionalLogged}=s;
    serializable[tabId]={fromStreamer,fromCategory,started,finalized,blocked,provisionalLogged};
  }
  chrome.storage.local.set({[STATE_KEY]:{sessions:serializable,sessionId}},()=>{
    appendLog("debug_state_flushed",{tabs:Object.keys(serializable).length});
  });
}
async function ensureStateLoaded(){
  if(stateLoaded) return;
  if(stateLoadPromise) return stateLoadPromise;
  stateLoadPromise=new Promise(resolve=>{
    chrome.storage.local.get({[STATE_KEY]:null, wsLogs:[], wsBlockedCount:0, wsUpdate:null}, r=>{
      logs=r.wsLogs||[];
      blockedCountCache=r.wsBlockedCount||0;
      updateBadge();
      const saved=r[STATE_KEY];
      if(saved?.sessions){
        const now=Date.now();
        raidSessions={};
        for(const [tabId,s] of Object.entries(saved.sessions)){
          if(now - s.started > RAID_EXPIRY_MS) continue;
            raidSessions[tabId]={...s,graceTimerId:null};
            rearmGraceTimer(parseInt(tabId,10));
        }
        appendLog("background_state_restored",{version:LOCAL_VERSION,restoredTabs:Object.keys(raidSessions).length,prevSession:saved.sessionId||null,newSession:sessionId});
      } else {
        appendLog("background_state_restored",{version:LOCAL_VERSION,restoredTabs:0,prevSession:null,newSession:sessionId});
      }
      stateLoaded=true;
      resolve();
    });
  });
  return stateLoadPromise;
}

// ---------- Raid session ----------
function startRaidSession(tabId, fromStreamer, fromCategory, via="unknown"){
  const info={
    fromStreamer:(fromStreamer||"unknown").toLowerCase(),
    fromCategory:fromCategory||"",
    started:Date.now(),
    finalized:false,
    blocked:false,
    provisionalLogged:false,
    graceTimerId:null
  };
  raidSessions[tabId]=info;
  raidPendingByTab[tabId]=info;
  raidPending=info;
  appendLog("raid_session_started",{tabId,fromStreamer:info.fromStreamer,fromCategory:info.fromCategory,via});
  rearmGraceTimer(tabId);
  markStateDirty();
}
function rearmGraceTimer(tabId){
  const sess=raidSessions[tabId];
  if(!sess) return;
  if(sess.graceTimerId) clearTimeout(sess.graceTimerId);
  getSettings().then(s=>{
    const grace=typeof s.graceWindowMs==="number"?s.graceWindowMs:8000;
    const elapsed=Date.now()-sess.started;
    const remain=grace - elapsed;
    if(remain<=0) finalizeRaidIfStillSafe(tabId);
    else sess.graceTimerId=setTimeout(()=>finalizeRaidIfStillSafe(tabId),remain);
  });
}
function clearRaidState(tabId){
  const sess=raidSessions[tabId];
  if(sess?.graceTimerId) clearTimeout(sess.graceTimerId);
  delete raidSessions[tabId];
  delete raidPendingByTab[tabId];
  raidPending=null;
  markStateDirty();
}
async function finalizeRaidIfStillSafe(tabId){
  const sess=raidSessions[tabId];
  if(!sess || sess.finalized || sess.blocked) return;
  sess.finalized=true;
  appendLog("raid_safe_finalized",{tabId,from:sess.fromStreamer,fromCategory:sess.fromCategory});
  clearRaidState(tabId);
}

// ---------- Pause / resume ----------
function getPausedState(){
  return new Promise(resolve=>{
    chrome.storage.local.get({[PAUSE_KEY]:false,[PAUSE_TIMER_KEY]:0}, r=>{
      resolve({paused:!!r[PAUSE_KEY],resumeAt:r[PAUSE_TIMER_KEY]||0});
    });
  });
}
function setPausedState(paused,resumeAt=0){
  chrome.storage.local.set({[PAUSE_KEY]:!!paused,[PAUSE_TIMER_KEY]:resumeAt});
  chrome.runtime.sendMessage({type:"PAUSE_STATE_UPDATED",paused:!!paused,resumeAt}).catch(()=>{});
  if(paused && resumeAt>Date.now()) schedulePauseTimer();
}
function schedulePauseTimer(){
  getPausedState().then(({paused,resumeAt})=>{
    if(paused && resumeAt>Date.now()){
      const delay=resumeAt-Date.now();
      setTimeout(()=>{
        getPausedState().then(cur=>{
          if(cur.paused && cur.resumeAt===resumeAt){
            setPausedState(false,0);
            appendLog("pause_auto_resume",{at:Date.now()});
          }
        });
      },delay);
    }
  });
}
async function isProtectionPaused(){
  const {paused}=await getPausedState();
  return paused;
}

// ---------- Evaluation ----------
async function evaluateRaidCategory(tabId, login, category){
  if(await isProtectionPaused()){
    appendLog("pause_skip_evaluateRaidCategory",{tabId,login,category});
    return;
  }
  const sess=raidSessions[tabId];
  if(!sess || sess.finalized || sess.blocked) return;
  const settings=await getSettings();
  const lists=getEffectiveLists(settings);
  const lowerLogin=(login||"").toLowerCase();

  if(isWhitelisted(lowerLogin, lists)){
    sess.finalized=true;
    appendLog("raid_whitelist_allowed",{tabId,to:lowerLogin,category,from:sess.fromStreamer});
    clearRaidState(tabId);
    return;
  }
  if(lists.blacklist.includes(lowerLogin)){
    sess.blocked=true;
    appendLog("raid_blocked_blacklist",{tabId,to:lowerLogin,category,from:sess.fromStreamer});
    incrementBlocked({from:sess.fromStreamer,to:lowerLogin,category,reason:"raid_blocked_blacklist"});
    await addToGreylist(sess.fromStreamer);
    await handleProtection(tabId, login, category, settings, "blacklist");
    clearRaidState(tabId);
    return;
  }
  const safeSet=settings.safeCategories.map(x=>x.toLowerCase());
  if(!category) return;
  const safe=safeSet.includes(category.toLowerCase());
  if(safe){
    if(!sess.provisionalLogged){
      sess.provisionalLogged=true;
      appendLog("raid_safe_provisional",{tabId,to:lowerLogin,category,from:sess.fromStreamer,graceMs:settings.graceWindowMs});
      markStateDirty();
    }
    return;
  }
  sess.blocked=true;
  appendLog("raid_blocked_unsafe",{tabId,to:lowerLogin,category,from:sess.fromStreamer});
  incrementBlocked({from:sess.fromStreamer,to:lowerLogin,category,reason:"raid_blocked_unsafe"});
  await addToGreylist(sess.fromStreamer);
  await handleProtection(tabId, login, category, settings, "raid");
  clearRaidState(tabId);
}

async function retroChangeCheck(tabId, login, category){
  if(await isProtectionPaused()){
    appendLog("pause_skip_retroChangeCheck",{tabId,login,category});
    return;
  }
  const sess=raidSessions[tabId];
  if(!sess || sess.finalized || sess.blocked) return;
  const settings=await getSettings();
  const lists=getEffectiveLists(settings);
  const lowerLogin=(login||"").toLowerCase();

  if(isWhitelisted(lowerLogin, lists)){
    sess.finalized=true;
    appendLog("raid_whitelist_allowed",{tabId,to:lowerLogin,category,from:sess.fromStreamer,phase:"retro"});
    clearRaidState(tabId);
    return;
  }
  if(lists.blacklist.includes(lowerLogin)){
    sess.blocked=true;
    appendLog("raid_blocked_blacklist",{tabId,to:lowerLogin,category,from:sess.fromStreamer,phase:"retro"});
    incrementBlocked({from:sess.fromStreamer,to:lowerLogin,category,reason:"raid_blocked_blacklist"});
    await addToGreylist(sess.fromStreamer);
    await handleProtection(tabId, login, category, settings, "blacklist");
    clearRaidState(tabId);
    return;
  }
  const safeSet=settings.safeCategories.map(x=>x.toLowerCase());
  const safe=category && safeSet.includes(category.toLowerCase());
  if(!safe){
    sess.blocked=true;
    appendLog("raid_retro_blocked_change",{tabId,to:lowerLogin,newCategory:category,from:sess.fromStreamer});
    incrementBlocked({from:sess.fromStreamer,to:lowerLogin,category,reason:"raid_retro_blocked_change"});
    await addToGreylist(sess.fromStreamer);
    await handleProtection(tabId, login, category, settings, "raid");
    clearRaidState(tabId);
  }
}

async function evaluateNonRaidNavigation(tabId, login, category, phase){
  if(await isProtectionPaused()){
    appendLog("pause_skip_evaluateNonRaidNavigation",{tabId,login,category,phase});
    return;
  }
  const settings=await getSettings();
  const lists=getEffectiveLists(settings);
  if(actedTabs.has(tabId)) return;
  if(isWhitelisted(login, lists)){
    appendLog("debug_navigation_whitelist_allowed",{login,category,phase});
    return;
  }
  if(isBlacklisted(login, category, settings, lists)){
    appendLog("blocked_blacklist",{streamer:login,category,phase});
    incrementBlocked({streamer:login,category,reason:"blacklist"});
    await handleProtection(tabId, login, category, settings, "blacklist");
    actedTabs.add(tabId);
    return;
  }
  appendLog("debug_navigation_allowed",{login,category,phase});
}

// ---------- Protection actions ----------
async function handleProtection(tabId, login, category, settings, reason){
  if(await isProtectionPaused()){
    appendLog("blocked_skipped_paused",{tabId,reason,login,category});
    return;
  }
  const lists=getEffectiveLists(settings);

  if(isWhitelisted(login, lists)){
    appendLog("protection_whitelist_skip",{tabId,login,reason,category});
    return;
  }

  if(reason==="blacklist"){
    try{
      await chrome.tabs.remove(tabId);
      appendLog("blacklist_forced_close",{streamer:login,category});
    }catch(e){
      appendLog("debug_tab_remove_error",{error:e.message,reason:"blacklist_close"});
    }
    return;
  }

  let acted=false;

  if(reason==="raid" && settings.redirectBehavior==="whitelist"){
    const wl = lists.whitelist || [];
    if(wl.length){
      const target=await findLiveWhitelistTarget(wl, settings);
      if(target){
        try{
          await chrome.tabs.update(tabId,{url:`https://www.twitch.tv/${target.login}`,active:true});
          appendLog("raid_redirect_whitelist",{from:login,to:target.login});
          acted=true;
        }catch(e){appendLog("debug_tab_update_error",{error:e.message});}
      } else {
        const fallback = wl[0];
        try{
          await chrome.tabs.update(tabId,{url:`https://www.twitch.tv/${fallback}`,active:true});
          appendLog("raid_redirect_whitelist_fallback",{from:login,to:fallback});
          acted=true;
        }catch(e){appendLog("debug_tab_update_error",{error:e.message,fallback});}
      }
    }
    if(!acted){
      try{
        await chrome.tabs.remove(tabId);
        appendLog("raid_whitelist_fallback_close",{streamer:login,category});
        acted=true;
      }catch(e){appendLog("debug_tab_remove_error",{error:e.message,reason:"whitelist_mode_close_fallback"});}
    }
  }

  if(!acted && settings.redirectBehavior==="close"){
    try{
      await chrome.tabs.remove(tabId);
      appendLog(reason+"_closed",{streamer:login,category});
      acted=true;
    }catch(e){appendLog("debug_tab_remove_error",{error:e.message});}
  }

  if(!acted && settings.redirectBehavior==="redirectCustom" && settings.customRedirectUrl){
    try{
      await chrome.tabs.update(tabId,{url:settings.customRedirectUrl,active:true});
      appendLog(reason+"_redirect_custom",{from:login,to:settings.customRedirectUrl});
      acted=true;
    }catch(e){appendLog("debug_tab_update_error",{error:e.message});}
  }

  if(!acted) appendLog(reason+"_no_action",{streamer:login,category});
}

async function findLiveWhitelistTarget(list, settings){
  for(const login of list){
    const cat=await getCategoryForChannel(login, settings);
    if(cat) return {login,category:cat};
  }
  return null;
}

// ---------- Navigation ----------
async function processNavigation(tabId, newUrl, prevUrl){
  await ensureStateLoaded();
  const channel=extractChannel(newUrl);
  if(!channel){
    clearRaidState(tabId);
    return;
  }
  const settings=await getSettings();
  const lists=getEffectiveLists(settings);

  if(settings.inferRaidFromUrl && urlIndicatesRaid(newUrl) && !raidSessions[tabId]){
    const fromChannel=extractChannel(prevUrl)||lastChannelByTab[tabId]||"unknown";
    const fromCategory=lastCategoryByChannel[fromChannel?.toLowerCase()]||"";
    startRaidSession(tabId, fromChannel, fromCategory, "url_infer");
    appendLog("raid_inferred_from_url",{fromStreamer:fromChannel,fromCategory,to:channel,tabId});

    // PATCH: Immediate blacklist enforcement for destination streamer
    if (lists.blacklist.includes(channel.toLowerCase())) {
      const sess = raidSessions[tabId];
      if (sess && !sess.blocked && !sess.finalized) {
        sess.blocked = true;
        appendLog("raid_blocked_blacklist_immediate",{tabId,to:channel,from:sess.fromStreamer});
        incrementBlocked({from:sess.fromStreamer,to:channel,category:"",reason:"raid_blocked_blacklist_immediate"});
        await addToGreylist(sess.fromStreamer);
        await handleProtection(tabId, channel, "", settings, "blacklist");
        clearRaidState(tabId);
        lastChannelByTab[tabId]=channel;
        return;
      }
    }
  }

  if(!raidSessions[tabId]){
    if(isWhitelisted(channel, lists)){
      appendLog("debug_navigation_whitelist_allowed",{login:channel,category:"",phase:"pre_category"});
    } else if(isBlacklisted(channel,"",settings,lists)){
      if(!(await isProtectionPaused())){
        appendLog("blocked_blacklist",{streamer:channel,category:"",phase:"pre_category"});
        incrementBlocked({streamer:channel,category:"",reason:"blacklist_pre_category"});
        await handleProtection(tabId, channel, "", settings, "blacklist");
        actedTabs.add(tabId);
        clearRaidState(tabId);
        lastChannelByTab[tabId]=channel;
        return;
      } else {
        appendLog("pause_skip_pre_category_block",{channel});
      }
    }
  }
  lastChannelByTab[tabId]=channel;
}
function extractChannel(u){
  try{
    const url=new URL(u);
    if(!/twitch\.tv$/i.test(url.hostname)) return null;
    const m=url.pathname.match(/^\/([^\/?#]+)/);
    return m?m[1].toLowerCase():null;
  }catch{return null;}
}

// ---------- Recheck tabs ----------
function recheckOpenTabs(settings, reason){
  isProtectionPaused().then(paused=>{
    if(paused){
      appendLog("pause_skip_recheckOpenTabs",{reason});
      return;
    }
    const lists=getEffectiveLists(settings);
    chrome.tabs.query({ url: "*://*.twitch.tv/*" }, tabs=>{
      tabs.forEach(async tab=>{
        if(!tab.id || !tab.url) return;
        if(actedTabs.has(tab.id)) return;
        const ch=extractChannel(tab.url);
        if(!ch) return;
        const lower=ch.toLowerCase();
        if(isWhitelisted(lower, lists)){
          appendLog("debug_remote_whitelist_present",{login:lower,reason});
          return;
        }
        if(lists.blacklist.includes(lower)){
          appendLog("remote_blacklist_recheck",{streamer:lower,reason});
            incrementBlocked({streamer:lower,category:"",reason:"remote_blacklist_recheck"});
          const fresh=await getSettings();
          await handleProtection(tab.id, lower, "", fresh, "blacklist");
          actedTabs.add(tab.id);
        }
      });
    });
  });
}

// ---------- Update ----------
async function checkForUpdate(trigger="interval"){
  try{
    const resp=await fetch(UPDATE_URL,{cache:"no-store"});
    if(!resp.ok){
      appendLog("debug_update_check_fail",{status:resp.status});
      return;
    }
    const raw=(await resp.text()).trim();
    let remoteVersion=raw.replace(/[^0-9a-zA-Z._-]/g,"");
    const normRemote=remoteVersion.replace(/^v/i,"");
    const normLocal=LOCAL_VERSION.replace(/^v/i,"");
    const needsUpdate = normRemote && normRemote !== normLocal;
    const info={local:LOCAL_VERSION,remote:remoteVersion,needsUpdate,checkedAt:Date.now()};
    chrome.storage.local.set({wsUpdate:info},()=>{
      appendLog("debug_update_checked",{trigger,remote:remoteVersion,needsUpdate});
      if(needsUpdate){
        chrome.runtime.sendMessage({type:"UPDATE_AVAILABLE",info}).catch(()=>{});
      }
    });
  }catch(e){
    appendLog("debug_update_check_error",{error:e.message});
  }
}
setInterval(()=>checkForUpdate("interval"), UPDATE_CHECK_INTERVAL_MS);

// ---------- Pending raid re-eval ----------
async function reEvaluatePendingRaids() {
  const settings = await getSettings();
  const lists = getEffectiveLists(settings);
  for (const [tabId, sess] of Object.entries(raidSessions)) {
    if (!sess || sess.blocked || sess.finalized) continue;
    const tabIdNum = parseInt(tabId,10);
    const tabChannel = lastChannelByTab[tabIdNum];
    if (tabChannel && isWhitelisted(tabChannel, lists)) {
      sess.finalized = true;
      appendLog("raid_whitelist_allowed_recheck",{tabId:tabIdNum,to:tabChannel});
      clearRaidState(tabIdNum);
    }
  }
}

// ---------- Messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  const type=msg?.type;
  const NEEDS_RESPONSE=new Set([
    "GET_SETTINGS","GET_LOGS","LOGIN_TWITCH","REFRESH_REMOTE_LISTS",
    "GET_BLOCK_COUNT","GET_UPDATE_STATUS","GET_PAUSE_STATE","SET_PAUSE_STATE"
  ]);
  const willRespond=NEEDS_RESPONSE.has(type);
  try{ appendLog("debug_message_received",{msgType:type}); }catch{}

  const respondOk=p=>{try{sendResponse(p);}catch{}};
  const respondErr=e=>{try{sendResponse({ok:false,error:(e&&e.message)||String(e)})}catch{}};

  const run=async()=>{
    try{
      await ensureStateLoaded();
      switch(type){
        case "GET_SETTINGS": {
          const s=await getSettings(); respondOk({settings:s}); break;
        }
        case "GET_LOGS": {
          chrome.storage.local.get({wsLogs:[]}, r=>respondOk({logs:r.wsLogs})); break;
        }
        case "GET_UPDATE_STATUS": {
          chrome.storage.local.get({wsUpdate:null}, r=>{
            respondOk({update:r.wsUpdate||{local:LOCAL_VERSION,remote:LOCAL_VERSION,needsUpdate:false}});
          }); break;
        }
        case "LOGIN_TWITCH": {
          try{
            const s=await getSettings();
            if(s.oauth.mode!=="implicit"){ respondOk({ok:false,error:"Not in implicit mode."}); break; }
            await ensureImplicitUserToken(s);
            respondOk({ok:true});
          }catch(e){respondErr(e);}
          break;
        }
        case "REFRESH_REMOTE_LISTS": {
          try{ await fetchRemoteLists(null,"manual"); respondOk({ok:true}); }
          catch(e){ respondErr(e); }
          break;
        }
        case "GET_BLOCK_COUNT": {
          respondOk({count:blockedCountCache}); break;
        }
        case "SAVE_SETTINGS": {
          if(msg.settings){
            await setSettings(msg.settings);
            appendLog("settings_saved",{settings:msg.settings});
            
            // Rebuild Set cache after settings changes
            STATE.lists = getEffectiveLists(msg.settings);
            buildSetCache();
            
            chrome.tabs.query({}, tabs=>{
              for(const t of tabs){
                if(t.id) chrome.tabs.sendMessage(t.id,{type:"SETTINGS_UPDATED",settings:msg.settings}).catch(()=>{});
              }
            });
            recheckOpenTabs(msg.settings,"settings_save");
            await reEvaluatePendingRaids();
            if(msg.settings.oauth?.mode==="app" && msg.settings.oauth.clientId && msg.settings.oauth.clientSecret){
              scheduleAppTokenRefresh(msg.settings);
            } else if(tokenRefreshTimer){
              clearTimeout(tokenRefreshTimer); tokenRefreshTimer=null;
            }
          }
          break;
        }
        case "CLEAR_LOGS": {
          logs=[]; chrome.storage.local.set({wsLogs:logs}); appendLog("logs_cleared",{}); break;
        }
        case "RESET_BLOCK_COUNT": {
          resetBlockedCount(); break;
        }
        case "TEST_LOG_REQUEST": {
          appendLog("test_log",{source:"options"}); break;
        }
        case "TWITCH_NAVIGATED": {
          if(sender.tab?.id && msg.url){
            processNavigation(sender.tab.id, msg.url, msg.prevUrl||"");
            const ch=extractChannel(msg.url);
            if(ch && raidSessions[sender.tab.id]){
              const cached=categoryCache[ch]?.category;
              if(cached) evaluateRaidCategory(sender.tab.id, ch, cached);
            }
          }
          break;
        }
        case "RAID_DETECTED": {
          const tabId=sender.tab?.id;
          if(tabId!=null && !raidSessions[tabId]){
            startRaidSession(tabId,(msg.fromStreamer||"unknown").toLowerCase(),msg.fromCategory||"","content_banner");
          }
          appendLog("raid_detected",{from:msg.fromStreamer||"unknown",category:msg.fromCategory||"",tabId});
          break;
        }
        case "CATEGORY_DETECTED": {
          const tabId=sender.tab?.id;
            if(tabId!=null && msg.login){
            const login=msg.login.toLowerCase();
            const cat=msg.category||"";
            categoryCache[login]={category:cat,time:Date.now()};
            lastCategoryByChannel[login]=cat;
            if(!raidSessions[tabId] && sender.tab?.url && urlIndicatesRaid(sender.tab.url)){
              const fromChannel=lastChannelByTab[tabId] && lastChannelByTab[tabId]!==login? lastChannelByTab[tabId]:"unknown";
              const fromCategory=fromChannel!=="unknown" ? (lastCategoryByChannel[fromChannel]||""):"";
              startRaidSession(tabId, fromChannel, fromCategory, "late_fallback");
            }
            if(raidSessions[tabId]){
              const sess=raidSessions[tabId];
              if(!sess.blocked && !sess.finalized){
                if(!sess.provisionalLogged) await evaluateRaidCategory(tabId, login, cat);
                else await retroChangeCheck(tabId, login, cat);
              }
            } else {
              await evaluateNonRaidNavigation(tabId, login, cat, "dom_category");
            }
          }
          break;
        }
        case "GET_PAUSE_STATE": {
          getPausedState().then(state=>respondOk(state)); break;
        }
        case "SET_PAUSE_STATE": {
          setPausedState(msg.paused, msg.resumeAt||0);
          schedulePauseTimer();
          respondOk({ok:true});
          break;
        }
        case "TF_SET_TOGGLES": {
          // Handle category toggle updates from overlay panel
          if (msg.toggles) {
            // For now, just log the toggle state change
            // In a full implementation, this could update filtering preferences
            appendLog("overlay_toggles_updated", { toggles: msg.toggles });
            
            // Trigger visual update by performing a sweep
            performSweep("toggle_update");
          }
          break;
        }
        case "TF_REFRESH_VIEW": {
          // Force refresh of current view with updated filters
          performSweep("manual_refresh");
          break;
        }
        case "TF_FORCE_SWEEP": {
          // Force sweep after list refetch or other operations
          performSweep(msg.reason || "force_sweep");
          break;
        }
        default: break;
      }
    }catch(e){
      appendLog("debug_handler_error",{type,error:e.message});
      if(willRespond) respondErr(e);
    }
  };
  run();
  return willRespond;
});

// ---------- Lifecycle ----------
function initLifecycle(reason){
  ensureStateLoaded().then(async ()=>{
    const s=await getSettings();
    appendLog("background_version",{version:LOCAL_VERSION,reason,sessionId});
    
    // Initialize Set cache with current settings
    STATE.lists = getEffectiveLists(s);
    buildSetCache();
    
    scheduleRemoteFetch(reason);
    if(s.oauth.mode==="app" && s.oauth.clientId && s.oauth.clientSecret){
      scheduleAppTokenRefresh(s);
    }
    schedulePauseTimer();
    checkForUpdate(reason);
  });
}
chrome.runtime.onStartup.addListener(()=>initLifecycle("startup"));
chrome.runtime.onInstalled.addListener(()=>initLifecycle("install"));
chrome.tabs.onRemoved.addListener(tabId=>{
  clearRaidState(tabId);
  delete lastChannelByTab[tabId];
});
setInterval(()=>scheduleRemoteFetch("interval"),10*60*1000);
