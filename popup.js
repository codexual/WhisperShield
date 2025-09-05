// WhisperShield popup.js v0.0.1
// Reconstructed / extended because "v8 is incomplete compared to v7".
// This version aims to be feature‑complete:
// - Blocked count fetch + manual refresh
// - Pause / resume with selectable (or custom) duration
// - Reflect auto‑resume countdown
// - Update banner (when UPDATE_AVAILABLE broadcast or fetched manually)
// - Open options & repo links
// - Graceful messaging with timeouts + retry
// - Live reaction to background PAUSE_STATE_UPDATED & UPDATE_AVAILABLE
//
// If any behaviors from your prior v7 are still missing, list them and we can iterate.

// ---------------- Utility Messaging ----------------
const FIRE_AND_FORGET = new Set([
  "SET_PAUSE_STATE"
]);

function sendMessage(type, payload = {}, { timeoutMs = 5000, retry = true } = {}) {
  if (FIRE_AND_FORGET.has(type)) {
    try { chrome.runtime.sendMessage({ type, ...payload }); } catch {}
    return Promise.resolve({ ok: true, fireAndForget: true });
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const msg = { type, ...payload };
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error(`Message ${type} timeout`));
    }, timeoutMs);

    const attempt = (isRetry = false) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (finished) return;
            const err = chrome.runtime.lastError;
          if (err) {
            if (!isRetry && retry && /Receiving end does not exist|closed/.test(err.message||"")) {
              return setTimeout(()=>attempt(true), 200);
            }
            clearTimeout(timer);
            finished = true;
            return reject(new Error(err.message || "Unknown sendMessage error"));
          }
          clearTimeout(timer);
          finished = true;
          resolve(resp || {});
        });
      } catch (e) {
        if (finished) return;
        clearTimeout(timer);
        finished = true;
        reject(e);
      }
    };
    attempt(false);
  });
}

// ---------------- DOM Helpers ----------------
const qs  = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

// ---------------- State ----------------
let pauseState = { paused: false, resumeAt: 0 };
let pauseTickTimer = null;
let autoRefreshTimer = null;

// ---------------- Pause Helpers ----------------
function msToHuman(ms) {
  if (ms <= 0) return "0m";
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function updatePauseUI() {
  const btn = qs('#pauseBtn');
  const sel = qs('#pauseTimerSelect');
  const info = qs('#pauseTimerInfo');
  const custom = qs('#pauseCustomMins');
  if (!btn || !sel || !info) return;

  if (pauseState.paused) {
    btn.textContent = 'Resume Protection';
    sel.disabled = true;
    custom.style.display = 'none';
    if (pauseState.resumeAt && pauseState.resumeAt > Date.now()) {
      const remain = pauseState.resumeAt - Date.now();
      info.textContent = `Auto-resume in ${msToHuman(remain)} (${new Date(pauseState.resumeAt).toLocaleTimeString()})`;
    } else {
      info.textContent = 'Paused indefinitely.';
    }
  } else {
    btn.textContent = 'Pause Protection';
    sel.disabled = false;
    info.textContent = '';
    custom.style.display = sel.value === 'custom' ? '' : 'none';
  }
}
function schedulePauseTicker() {
  if (pauseTickTimer) clearInterval(pauseTickTimer);
  pauseTickTimer = setInterval(() => {
    if (!pauseState.paused) return;
    updatePauseUI();
  }, 30 * 1000);
}
async function fetchPauseState() {
  try {
    const resp = await sendMessage('GET_PAUSE_STATE');
    pauseState = resp || { paused: false, resumeAt: 0 };
    updatePauseUI();
    schedulePauseTicker();
  } catch {
    // Silent
  }
}
async function togglePause() {
  if (!pauseState.paused) {
    // Pausing
    const sel = qs('#pauseTimerSelect');
    const custom = qs('#pauseCustomMins');
    let mins = 0;
    if (sel.value === 'custom') {
      const v = parseInt(custom.value, 10);
      if (!isNaN(v) && v > 0) mins = v;
    } else {
      mins = parseInt(sel.value, 10) || 0;
    }
    const resumeAt = mins > 0 ? Date.now() + mins * 60000 : 0;
    chrome.runtime.sendMessage({ type: 'SET_PAUSE_STATE', paused: true, resumeAt });
  } else {
    // Resuming
    chrome.runtime.sendMessage({ type: 'SET_PAUSE_STATE', paused: false, resumeAt: 0 });
  }
}

// ---------------- Blocked Count ----------------
async function refreshBlockedCount() {
  try {
    const resp = await sendMessage('GET_BLOCK_COUNT');
    const n = resp?.count ?? 0;
    const el = qs('#blockedCount');
    if (el) el.textContent = n;
  } catch {
    // ignore
  }
}

// ---------------- Update Banner ----------------
function showUpdateBanner(info) {
  const banner = qs('#updateBanner');
  if (!banner || !info) return;
  banner.style.display = info.needsUpdate ? '' : 'none';
  banner.querySelector('.localVersion').textContent = info.local;
  banner.querySelector('.remoteVersion').textContent = info.remote;
}
async function refreshUpdateStatus() {
  try {
    const resp = await sendMessage('GET_UPDATE_STATUS');
    showUpdateBanner(resp?.update);
  } catch {
    // ignore
  }
}

// ---------------- Auto Refresh (lightweight) ----------------
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    refreshBlockedCount();
    fetchPauseState();
  }, 25 * 1000);
}

// ---------------- Init ----------------
async function init() {
  // Event listeners
  qs('#refreshBtn')?.addEventListener('click', () => {
    refreshBlockedCount();
    fetchPauseState();
    refreshUpdateStatus();
  });
  qs('#openOptions')?.addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); } catch {}
  });
  const repoUrl = "https://github.com/codexual/WhisperShield";
  qs('#viewRepo')?.addEventListener('click', () => { openRepo(repoUrl); });
  qs('#viewRepo2')?.addEventListener('click', () => { openRepo(repoUrl); });
  qs('#ignoreUpdate')?.addEventListener('click', () => {
    const banner = qs('#updateBanner');
    if (banner) banner.style.display = 'none';
    // Could persist a "dismissed for version" if needed
  });

  qs('#pauseBtn')?.addEventListener('click', togglePause);
  qs('#pauseTimerSelect')?.addEventListener('change', (e) => {
    const custom = qs('#pauseCustomMins');
    if (custom) custom.style.display = e.target.value === 'custom' && !pauseState.paused ? '' : 'none';
    updatePauseUI();
  });

  await Promise.all([
    refreshBlockedCount(),
    fetchPauseState(),
    refreshUpdateStatus()
  ]);
  startAutoRefresh();
}

// ---------------- External open helper ----------------
function openRepo(url) {
  try {
    chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank');
  }
}

// ---------------- Runtime Message Reactions ----------------
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'PAUSE_STATE_UPDATED':
        pauseState = { paused: msg.paused, resumeAt: msg.resumeAt };
        updatePauseUI();
        break;
      case 'UPDATE_AVAILABLE':
        // msg.info contains update structure
        showUpdateBanner(msg.info);
        break;
      default:
        break;
    }
  });
} catch { /* ignore */ }

// ---------------- Boot ----------------
document.addEventListener('DOMContentLoaded', init);
