// WhisperShield overlay_panel.js v0.3.1
// On-page overlay filter panel for Twitch ASMR stream filtering
(function() {
  // Guard against double injection
  if (window.tfFilterPanelInjected) return;
  window.tfFilterPanelInjected = true;

  const LOCAL_VERSION = "0.3.1";
  
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
      // Send the toggle state update - this leverages existing messaging
      await sendMessage('TF_SET_TOGGLES', { toggles: toggleState });
      
      // Trigger a visual update by sending a refresh message
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
    
    // Apply changes immediately
    applyToggles();
  }

  // Handle save actions
  async function handleSaveAction(action) {
    await applyToggles();
    
    if (action === 'save-reload') {
      // Force a page refresh to reload filtered content
      window.location.reload();
    }
  }

  // Setup event listeners
  function setupEventListeners(panel) {
    // Category toggle changes
    panel.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        applyToggles();
      }
    });

    // Bulk action buttons
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

  // Toggle panel minimize state
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

  // Initialize the overlay panel
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Load styles first
    loadStyles();

    // Small delay to ensure styles are loaded
    setTimeout(() => {
      const panel = createOverlayPanel();
      setupEventListeners(panel);
      loadToggleState();
      
      console.log('WhisperShield: Overlay panel initialized v' + LOCAL_VERSION);
    }, 100);
  }

  // Start initialization
  init();
})();