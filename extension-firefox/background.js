// Playwright MCP Bridge - Firefox Background Script
// Uses WebExtensions API (browser.*) with content script bridge

let ws = null;
let connected = false;
let activeTabId = null;
let reconnectTimer = null;
let cmdId = 0;
let pendingCommands = new Map();

const DEFAULT_WS_URL = "ws://localhost:9223";

// Load saved settings
browser.storage.local.get(["wsUrl", "autoConnect"]).then((data) => {
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
      console.log("[MCP Bridge] Connected to MCP server at", url);
      notifyClients({ type: "connection", status: "connected", url });
      attachToActiveTab();
    };

    ws.onclose = () => {
      connected = false;
      console.log("[MCP Bridge] Disconnected");
      notifyClients({ type: "connection", status: "disconnected" });
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
  activeTabId = null;
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
  notifyClients({ type: "connection", status: "disconnected" });
}

async function attachToActiveTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    const tab = tabs[0];
    activeTabId = tab.id;
    console.log("[MCP Bridge] Attached to tab:", tab.id, tab.url);
    notifyClients({ type: "tab", status: "attached", tabId: tab.id, url: tab.url, title: tab.title });
    sendToServer({ type: "tab_attached", tabId: tab.id, url: tab.url, title: tab.title });
  } catch (err) {
    console.error("[MCP Bridge] Attach failed:", err);
  }
}

async function handleServerMessage(msg) {
  switch (msg.type) {
    case "ping":
      sendToServer({ type: "pong" });
      break;

    case "attach":
      if (msg.tabId) {
        activeTabId = msg.tabId;
      } else {
        await attachToActiveTab();
      }
      sendToServer({ type: "tab_attached", tabId: activeTabId });
      break;

    case "detach":
      activeTabId = null;
      notifyClients({ type: "tab", status: "detached" });
      break;

    case "navigate":
      if (activeTabId) {
        await browser.tabs.update(activeTabId, { url: msg.url });
        sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
      }
      break;

    case "evaluate":
      if (activeTabId) {
        try {
          const result = await browser.tabs.executeScript(activeTabId, {
            code: msg.expression,
          });
          sendToServer({ type: "command_result", id: msg.id, result: { value: result[0] } });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "screenshot":
      try {
        const dataUrl = await browser.tabs.captureVisibleTab(null, { format: "png" });
        sendToServer({ type: "command_result", id: msg.id, result: { data: dataUrl.split(",")[1] || dataUrl } });
      } catch (err) {
        sendToServer({ type: "command_result", id: msg.id, error: err.message });
      }
      break;

    case "click":
      if (activeTabId) {
        try {
          await browser.tabs.sendMessage(activeTabId, {
            type: "mcp_click",
            selector: msg.selector,
            requestId: msg.id,
          });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "type":
      if (activeTabId) {
        try {
          await browser.tabs.sendMessage(activeTabId, {
            type: "mcp_type",
            selector: msg.selector,
            text: msg.text,
            requestId: msg.id,
          });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "get_text":
      if (activeTabId) {
        try {
          await browser.tabs.sendMessage(activeTabId, {
            type: "mcp_get_text",
            selector: msg.selector,
            requestId: msg.id,
          });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "get_html":
      if (activeTabId) {
        try {
          await browser.tabs.sendMessage(activeTabId, {
            type: "mcp_get_html",
            selector: msg.selector,
            requestId: msg.id,
          });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "fill":
      if (activeTabId) {
        try {
          await browser.tabs.sendMessage(activeTabId, {
            type: "mcp_fill",
            selector: msg.selector,
            value: msg.value,
            requestId: msg.id,
          });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "get_tabs":
      const tabs = await browser.tabs.query({});
      const tabList = tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active }));
      sendToServer({ type: "tab_list", tabs: tabList });
      break;

    case "get_title":
      if (activeTabId) {
        const tab = await browser.tabs.get(activeTabId);
        sendToServer({ type: "command_result", id: msg.id, result: { value: tab.title } });
      }
      break;

    case "get_url":
      if (activeTabId) {
        const tab = await browser.tabs.get(activeTabId);
        sendToServer({ type: "command_result", id: msg.id, result: { value: tab.url } });
      }
      break;

    case "go_back":
      if (activeTabId) {
        await browser.tabs.goBack(activeTabId);
        sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
      }
      break;

    case "go_forward":
      if (activeTabId) {
        await browser.tabs.goForward(activeTabId);
        sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
      }
      break;

    case "reload":
      if (activeTabId) {
        await browser.tabs.reload(activeTabId);
        sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
      }
      break;

    case "scroll":
      if (activeTabId) {
        try {
          await browser.tabs.executeScript(activeTabId, {
            code: `window.scrollTo(${msg.x || 0}, ${msg.y || 0});`,
          });
          sendToServer({ type: "command_result", id: msg.id, result: { success: true } });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    case "command":
      if (activeTabId) {
        try {
          const result = await browser.tabs.executeScript(activeTabId, {
            code: msg.code,
          });
          sendToServer({ type: "command_result", id: msg.id, result: { value: result[0] } });
        } catch (err) {
          sendToServer({ type: "command_result", id: msg.id, error: err.message });
        }
      }
      break;

    default:
      console.log("[MCP Bridge] Unknown message type:", msg.type);
  }
}

function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function notifyClients(data) {
  browser.runtime.sendMessage(data).catch(() => {});
}

// Listen for messages from content script responses
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.source === "mcp_content_script" && msg.requestId) {
    // Forward content script response back to MCP server
    if (msg.error) {
      sendToServer({ type: "command_result", id: msg.requestId, error: msg.error });
    } else {
      sendToServer({ type: "command_result", id: msg.requestId, result: msg.result });
    }
  }

  // Handle popup messages
  if (msg.type === "connect") {
    connect(msg.url || DEFAULT_WS_URL);
    return Promise.resolve({ success: true });
  }
  if (msg.type === "disconnect") {
    disconnect();
    return Promise.resolve({ success: true });
  }
  if (msg.type === "getStatus") {
    return Promise.resolve({ connected, activeTabId });
  }
  if (msg.type === "attach") {
    attachToActiveTab();
    return Promise.resolve({ success: true });
  }
  if (msg.type === "getTabs") {
    return browser.tabs.query({}).then(tabs => tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })));
  }
});

// Listen for tab activation
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (connected) {
    const tab = await browser.tabs.get(activeInfo.tabId);
    activeTabId = activeInfo.tabId;
    console.log("[MCP Bridge] Switched to tab:", tab.id, tab.url);
    notifyClients({ type: "tab", status: "attached", tabId: tab.id, url: tab.url, title: tab.title });
    sendToServer({ type: "tab_attached", tabId: tab.id, url: tab.url, title: tab.title });
  }
});

console.log("[MCP Bridge] Firefox background script loaded");
