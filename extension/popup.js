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
  } else {
    tabInfo.style.display = "none";
  }
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getStatus" });
    updateUI(response);
  } catch (err) {
    // Popup just opened, background might not be ready
  }
}

connectBtn.addEventListener("click", () => {
  const url = wsUrlInput.value.trim() || "ws://localhost:9223";
  chrome.runtime.sendMessage({ type: "connect", url });
  setTimeout(refreshStatus, 500);
});

disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "disconnect" });
  setTimeout(refreshStatus, 500);
});

attachBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "attach" });
  setTimeout(refreshStatus, 500);
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "connection") {
    refreshStatus();
  }
  if (msg.type === "tab") {
    refreshStatus();
  }
});

// Initial status check
refreshStatus();