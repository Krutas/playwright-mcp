// Playwright MCP Bridge - Firefox Popup Script

const statusEl = document.getElementById("status");
const dotEl = document.getElementById("dot");
const statusText = document.getElementById("statusText");
const tabInfo = document.getElementById("tabInfo");
const tabUrl = document.getElementById("tabUrl");
const wsUrlInput = document.getElementById("wsUrl");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const attachBtn = document.getElementById("attachBtn");

function updateUI(state) {
  const connected = state.connected;
  const tabId = state.activeTabId;

  dotEl.className = "dot " + (connected ? "connected" : "disconnected");
  statusText.textContent = connected ? "Connected" : "Disconnected";

  connectBtn.style.display = connected ? "none" : "block";
  disconnectBtn.style.display = connected ? "block" : "none";
  wsUrlInput.disabled = connected;

  if (tabId) {
    tabInfo.style.display = "block";
    tabUrl.textContent = "Tab ID: " + tabId;
    // Try to get tab title/url
    browser.tabs.get(tabId).then(tab => {
      tabUrl.textContent = (tab.title || "untitled") + " - " + (tab.url || "about:blank");
    }).catch(() => {});
  } else {
    tabInfo.style.display = "none";
  }
}

async function refreshStatus() {
  try {
    const response = await browser.runtime.sendMessage({ type: "getStatus" });
    updateUI(response);
  } catch (err) {
    // Popup just opened
  }
}

connectBtn.addEventListener("click", () => {
  const url = wsUrlInput.value.trim() || "ws://localhost:9223";
  browser.runtime.sendMessage({ type: "connect", url });
  setTimeout(refreshStatus, 500);
});

disconnectBtn.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "disconnect" });
  setTimeout(refreshStatus, 500);
});

attachBtn.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "attach" });
  setTimeout(refreshStatus, 500);
});

// Listen for status updates from background
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "connection" || msg.type === "tab") {
    refreshStatus();
  }
});

// Initial status check
refreshStatus();
