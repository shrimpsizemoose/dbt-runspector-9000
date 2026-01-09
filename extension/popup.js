const DEFAULT_SERVER_URL = "http://localhost:8765";

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function loadViews() {
  const content = document.getElementById("content");

  try {
    const result = await chrome.storage.sync.get(["serverUrl"]);
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

    const response = await fetch(`${serverUrl}/views`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);

    const { views } = await response.json();

    if (views.length === 0) {
      content.innerHTML = '<div class="empty">No visualizations yet.<br>Select a gs:// URL and right-click → "Inspect dbt run"</div>';
      return;
    }

    const list = document.createElement("ul");
    list.className = "view-list";

    for (const view of views) {
      const item = document.createElement("li");
      item.className = "view-item";

      const created = new Date(view.created * 1000);
      const timeStr = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const dateStr = created.toLocaleDateString([], { month: "short", day: "numeric" });

      const expiresMin = Math.floor(view.expires_in / 60);

      // Shorten the source URL for display
      const shortSource = view.source.length > 60
        ? view.source.substring(0, 57) + "..."
        : view.source;

      item.innerHTML = `
        <div class="view-source" title="${view.source}">${shortSource}</div>
        <div class="view-meta">
          <span class="view-time">${dateStr} ${timeStr}</span>
          <span class="view-expires">expires in ${expiresMin}m</span>
        </div>
      `;

      item.addEventListener("click", () => {
        chrome.tabs.create({ url: `${serverUrl}/view/${view.id}` });
      });

      list.appendChild(item);
    }

    content.innerHTML = "";
    content.appendChild(list);
  } catch (e) {
    content.innerHTML = `<div class="error">Cannot connect to server<br><small>${e.message}</small></div>`;
  }
}

loadViews();
