const DEFAULT_SERVER_URL = "http://localhost:8765";

const serverUrlInput = document.getElementById("serverUrl");
const status = document.getElementById("status");
const serverInfo = document.getElementById("serverInfo");

async function checkServer(url) {
  serverInfo.className = "server-info";
  serverInfo.textContent = "Checking server...";

  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    serverInfo.className = "server-info connected";
    serverInfo.innerHTML = `
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">Connected</span></div>
      <div class="info-row"><span class="info-label">Version</span><span class="info-value">${data.version}</span></div>
      <div class="info-row"><span class="info-label">SHA</span><span class="info-value">${data.git_sha.substring(0, 7)}</span></div>
    `;
  } catch (e) {
    serverInfo.className = "server-info error";
    serverInfo.textContent = `Cannot connect: ${e.message}`;
  }
}

chrome.storage.sync.get(["serverUrl"], (result) => {
  const url = result.serverUrl || DEFAULT_SERVER_URL;
  serverUrlInput.value = url;
  checkServer(url);
});

let debounceTimer;
serverUrlInput.addEventListener("input", () => {
  const value = serverUrlInput.value.trim() || DEFAULT_SERVER_URL;
  chrome.storage.sync.set({ serverUrl: value }, () => {
    status.classList.add("show");
    setTimeout(() => status.classList.remove("show"), 1500);
  });

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => checkServer(value), 500);
});
