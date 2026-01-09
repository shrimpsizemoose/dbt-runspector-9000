const DEFAULTS = {
  serverUrl: "http://localhost:8765",
  timeout: 30,
  openBehavior: "newTab",
  copyUrl: false,
  theme: "system"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "inspect-dbt-run",
    title: "Inspect dbt run",
    contexts: ["selection"],
  });
});

async function getSettings() {
  const result = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...result };
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function clearBadge(delay = 2000) {
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), delay);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "inspect-dbt-run") return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  const gsMatch = selectedText.match(/gs:\/\/[^\s"'<>]+/);
  if (!gsMatch) {
    setBadge("!", "#e74c3c");
    clearBadge(3000);
    console.error("No gs:// URL found in selection:", selectedText);
    return;
  }

  const gsUrl = gsMatch[0];
  setBadge("...", "#3498db");

  try {
    const settings = await getSettings();

    // Copy URL to clipboard if enabled
    if (settings.copyUrl) {
      await chrome.tabs.sendMessage(tab.id, { action: "copyToClipboard", text: gsUrl }).catch(() => {
        // Content script might not be available, ignore
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000);

    const response = await fetch(settings.serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: gsUrl }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Server returned ${response.status}`);
    }

    const { id } = await response.json();
    const viewUrl = `${settings.serverUrl}/view/${id}?theme=${settings.theme}`;

    // Open based on behavior setting
    switch (settings.openBehavior) {
      case "sameTab":
        chrome.tabs.update(tab.id, { url: viewUrl });
        break;
      case "newWindow":
        chrome.windows.create({ url: viewUrl });
        break;
      default:
        chrome.tabs.create({ url: viewUrl });
    }

    setBadge("OK", "#27ae60");
    clearBadge();
  } catch (error) {
    if (error.name === "AbortError") {
      setBadge("T/O", "#e74c3c");
      console.error("Request timed out");
    } else {
      setBadge("ERR", "#e74c3c");
      console.error("Failed to fetch visualization:", error);
    }
    clearBadge(3000);
  }
});
