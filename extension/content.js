chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "copyToClipboard") {
    navigator.clipboard.writeText(message.text).catch(console.error);
  }
});
