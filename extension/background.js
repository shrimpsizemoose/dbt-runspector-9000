const DEFAULT_SERVER_URL = "http://localhost:8765";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "inspect-dbt-run",
    title: "Inspect dbt run",
    contexts: ["selection"],
  });
});

async function getServerUrl() {
  const result = await chrome.storage.sync.get(["serverUrl"]);
  return result.serverUrl || DEFAULT_SERVER_URL;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "inspect-dbt-run") return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  const gsMatch = selectedText.match(/gs:\/\/[^\s"'<>]+/);
  if (!gsMatch) {
    console.error("No gs:// URL found in selection:", selectedText);
    return;
  }

  const gsUrl = gsMatch[0];

  try {
    const serverUrl = await getServerUrl();

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: gsUrl }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Server returned ${response.status}`);
    }

    const html = await response.text();
    const blob = new Blob([html], { type: "text/html" });
    chrome.tabs.create({ url: URL.createObjectURL(blob) });
  } catch (error) {
    console.error("Failed to fetch visualization:", error);
  }
});
