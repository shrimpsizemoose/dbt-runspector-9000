const DEFAULTS = {
  serverUrl: "http://localhost:8765",
  timeout: 30,
  openBehavior: "newTab",
  copyUrl: false,
  theme: "system"
};

const elements = {
  serverUrl: document.getElementById("serverUrl"),
  timeout: document.getElementById("timeout"),
  openBehavior: document.getElementById("openBehavior"),
  copyUrl: document.getElementById("copyUrl"),
  theme: document.getElementById("theme"),
  status: document.getElementById("status"),
  serverInfo: document.getElementById("serverInfo")
};

async function checkServer(url) {
  elements.serverInfo.className = "server-info";
  elements.serverInfo.textContent = "Checking server...";

  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    elements.serverInfo.className = "server-info connected";
    elements.serverInfo.innerHTML = `
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">Connected</span></div>
      <div class="info-row"><span class="info-label">Version</span><span class="info-value">${data.version}</span></div>
      <div class="info-row"><span class="info-label">SHA</span><span class="info-value">${data.git_sha.substring(0, 7)}</span></div>
    `;
  } catch (e) {
    elements.serverInfo.className = "server-info error";
    elements.serverInfo.textContent = `Cannot connect: ${e.message}`;
  }
}

function showSaved() {
  elements.status.classList.add("show");
  setTimeout(() => elements.status.classList.remove("show"), 1500);
}

function saveSettings() {
  const settings = {
    serverUrl: elements.serverUrl.value.trim() || DEFAULTS.serverUrl,
    timeout: parseInt(elements.timeout.value) || DEFAULTS.timeout,
    openBehavior: elements.openBehavior.value,
    copyUrl: elements.copyUrl.checked,
    theme: elements.theme.value
  };
  chrome.storage.sync.set(settings, showSaved);
  return settings;
}

// Load settings
chrome.storage.sync.get(Object.keys(DEFAULTS), (result) => {
  const settings = { ...DEFAULTS, ...result };

  elements.serverUrl.value = settings.serverUrl;
  elements.timeout.value = settings.timeout;
  elements.openBehavior.value = settings.openBehavior;
  elements.copyUrl.checked = settings.copyUrl;
  elements.theme.value = settings.theme;

  checkServer(settings.serverUrl);
});

// Server URL with debounced health check
let debounceTimer;
elements.serverUrl.addEventListener("input", () => {
  const settings = saveSettings();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => checkServer(settings.serverUrl), 500);
});

// Other inputs save immediately
elements.timeout.addEventListener("change", saveSettings);
elements.openBehavior.addEventListener("change", saveSettings);
elements.copyUrl.addEventListener("change", saveSettings);
elements.theme.addEventListener("change", saveSettings);
