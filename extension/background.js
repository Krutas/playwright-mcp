// Playwright MCP Bridge - Background Service Worker

let ws = null;
let connected = false;
let activeTabId = null;
let reconnectTimer = null;
let pendingCommands = new Map();
let cmdId = 0;

const DEFAULT_WS_URL = "ws://localhost:9223";

// Load saved settings
chrome.storage.local.get(["wsUrl", "autoConnect"], (data) => {
  if (data.autoConnect) {
    connect(data.wsUrl || DEFAULT_WS_URL);
  }
});

function connect(url) {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  try {
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      connected = true;
      notifyClients({ type: "connection", status: "connected", url });
      console.log("[MCP Bridge] Connected to MCP server at", url);
      // Auto-attach to active tab
      attachToActiveTab();
    };
    
    ws.onclose = () => {
      connected = false;
      notifyClients({ type: "connection", status: "disconnected" });
      console.log("[MCP Bridge] Disconnected");
      // Auto-reconnect after 3s
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(url), 3000);
    };
    
    ws.onerror = (err) => {
      console.error("[MCP Bridge] WebSocket error:", err);
      notifyClients({ type: "error", message: "WebSocket error" });
    };
    
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleServerMessage(msg);
      } catch (err) {
        console.error("[MCP Bridge] Failed to parse message:", err);
      }
    };
  } catch (err) {
    console.error("[MCP Bridge] Connection failed:", err);
    notifyClients({ type: "error", message: err.message });
  }
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeTabId) {
    chrome.debugger.detach(activeTabId, () => {
      activeTabId = null;
    });
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
  notifyClients({ type: "connection", status: "disconnected" });
}

async function attachToActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      console.log("[MCP Bridge] No active tab found");
      return;
    }
    const tab = tabs[0];
    await attachToTab(tab.id);
  } catch (err) {
    console.error("[MCP Bridge] Failed to attach to tab:", err);
  }
}

async function attachToTab(tabId) {
  try {
    // Detach from previous tab if any
    if (activeTabId && activeTabId !== tabId) {
      await chrome.debugger.detach(activeTabId);
    }
    
    await chrome.debugger.attach({ tabId }, "1.3");
    activeTabId = tabId;
    
    // Enable necessary CDP domains
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    await chrome.debugger.sendCommand({ tabId }, "DOM.enable);
    await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    
    // Listen for debugger events
    chrome.debugger.onEvent.addListener(handleDebuggerEvent);
    chrome.debugger.onDetach.addListener(handleDetach);
    
    const tab = await chrome.tabs.get(tabId);
    notifyClients({ type: "tab", status: "attached", tabId, url: tab.url, title: tab.title });
    console.log("[MCP Bridge] Attached to tab:", tabId, tab.url);
    
    // Send attached notification to server
    sendToServer({
      type: "tab_attached",
      tabId,
      url: tab.url,
      title: tab.title
    });
  } catch (err) {
    console.error("[MCP Bridge] Attach failed:", err);
    notifyClients({ type: "error", message: "Failed to attach: " + err.message });
  }
}

function handleDebuggerEvent(source, method, params) {
  // Forward relevant events to the MCP server
  if (method.startsWith("Page.") || method.startsWith("DOM.") || method.startsWith("Runtime.")) {
    sendToServer({ type: "debugger_event", method, params });
  }
}

function handleDetach(source, reason) {
  console.log("[MCP Bridge] Detached from tab:", source.tabId, "reason:", reason);
  if (source.tabId === activeTabId) {
    activeTabId = null;
    notifyClients({ type: "tab", status: "detached" });
    sendToServer({ type: "tab_detached" });
  }
}

async function handleServerMessage(msg) {
  switch (msg.type) {
    case "ping":
      sendToServer({ type: "pong" });
      break;
    
    case "attach":
      if (msg.tabId) {
        await attachToTab(msg.tabId);
      } else {
        await attachToActiveTab();
      }
      break;
    
    case "detach":
      if (activeTabId) {
        await chrome.debugger.detach(activeTabId);
        activeTabId = null;
        notifyClients({ type: "tab", status: "detached" });
      }
      break;
    
    case "command":
      await executeCDPCommand(msg);
      break;
    
    case "navigate":
      if (activeTabId) {
        const result = await chrome.debugger.sendCommand(
          { tabId: activeTabId },
          "Page.navigate",
          { url: msg.url }
        );
        sendToServer({ type: "command_result", id: msg.id, result });
      }
      break;
    
    case "evaluate":
      if (activeTabId) {
        const result = await chrome.debugger.sendCommand(
          { tabId: activeTabId },
          "Runtime.evaluate",
          { expression: msg.expression, returnByValue: true }
        );
        sendToServer({ type: "command_result", id: msg.id, result });
      }
      break;
    
    case "screenshot":
      if (activeTabId) {
        const result = await chrome.debugger.sendCommand(
          { tabId: activeTabId },
          "Page.captureScreenshot",
          { format: "png" }
        );
        sendToServer({ type: "command_result", id: msg.id, result });
      }
      break;
    
    case "click":
      if (activeTabId) {
        // First get the element position, then click
        const boxResult = await chrome.debugger.sendCommand(
          { tabId: activeTabId },
          "DOM.getContentQuads",
          { nodeId: msg.nodeId }
        );
        if (boxResult && boxResult.quads && boxResult.quads.length > 0) {
          const quad = boxResult.quads[0];
          const x = (quad[0] + quad[2]) / 2;
          const y = (quad[1] + quad[5]) / 2;
          await chrome.debugger.sendCommand(
            { tabId: activeTabId },
            "Input.dispatchMouseEvent",
            { type: "mousePressed", x, y, button: "left", clickCount: 1 }
          );
          await chrome.debugger.sendCommand(
            { tabId: activeTabId },
            "Input.dispatchMouseEvent",
            { type: "mouseReleased", x, y, button: "left", clickCount: 1 }
          );
        }
        sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
      }
      break;
    
    case "get_tabs":
      const tabs = await chrome.tabs.query({});
      const tabList = tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
      sendToServer({ type: "tab_list", tabs: tabList });
      break;
    
    default:
      console.log("[MCP Bridge] Unknown message type:", msg.type);
  }
}

async function executeCDPCommand(msg) {
  if (!activeTabId) {
    sendToServer({ type: "command_result", id: msg.id, error: "No tab attached" });
    return;
  }
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: activeTabId },
      msg.method,
      msg.params
    );
    sendToServer({ type: "command_result", id: msg.id, result });
  } catch (err) {
    sendToServer({ type: "command_result", id: msg.id, error: err.message });
  }
}

function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function notifyClients(data) {
  chrome.runtime.sendMessage(data).catch(() => {});
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "connect":
      connect(msg.url || DEFAULT_WS_URL);
      sendResponse({ success: true });
      break;
    case "disconnect":
      disconnect();
      sendResponse({ success: true });
      break;
    case "getStatus":
      sendResponse({ connected, activeTabId });
      break;
    case "attach":
      attachToActiveTab();
      sendResponse({ success: true });
      break;
    case "getTabs":
      chrome.tabs.query({}).then(tabs => sendResponse(tabs));
      return true;
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (connected) {
    await attachToTab(activeInfo.tabId);
  }
});

console.log("[MCP Bridge] Background service worker loaded");