// Playwright MCP Bridge - Firefox Content Script
// Handles DOM operations requested by the background script

console.log("[MCP Bridge] Content script loaded");

// Listen for messages from the background script
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.type || !msg.type.startsWith("mcp_")) return;

  switch (msg.type) {
    case "mcp_click": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        el.click();
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_type": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) {
          el.focus();
          el.value = "";
          el.value = msg.text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("Element is not an input: " + msg.selector);
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_get_text": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        const text = el.textContent || el.innerText || "";
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { value: text.trim() }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_get_html": {
      try {
        let html;
        if (msg.selector) {
          const el = document.querySelector(msg.selector);
          if (!el) throw new Error("Element not found: " + msg.selector);
          html = el.innerHTML;
        } else {
          html = document.documentElement.outerHTML;
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { value: html }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_fill": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) {
          el.focus();
          el.value = msg.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("Element is not an input: " + msg.selector);
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_hover": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_select": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        if (el.tagName === "SELECT") {
          el.value = msg.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("Element is not a SELECT: " + msg.selector);
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_check": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        if (el.type === "checkbox" || el.type === "radio") {
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("Element is not a checkbox/radio: " + msg.selector);
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_uncheck": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        if (el.type === "checkbox") {
          el.checked = false;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("Element is not a checkbox: " + msg.selector);
        }
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_get_attribute": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        const value = el.getAttribute(msg.name);
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { value: value || "" }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    case "mcp_scroll_into_view": {
      try {
        const el = document.querySelector(msg.selector);
        if (!el) throw new Error("Element not found: " + msg.selector);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          result: { success: true }
        });
      } catch (err) {
        browser.runtime.sendMessage({
          source: "mcp_content_script",
          requestId: msg.requestId,
          error: err.message
        });
      }
      break;
    }

    default:
      browser.runtime.sendMessage({
        source: "mcp_content_script",
        requestId: msg.requestId,
        error: "Unknown content script action: " + msg.type
      });
  }
});
