# Playwright MCP Server

Browser automation via the Model Context Protocol. Supports **headless Playwright**, **Chrome Extension bridge**, and **Firefox Extension bridge** for controlling existing browser tabs.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run build
node dist/index.js
```

## Extension Bridges

Link the MCP agent to your existing browser tabs. Two extensions are provided:

### Chrome Extension (`extension/`)

Uses `chrome.debugger` API (CDP) for full browser control.

1. Go to `chrome://extensions` → Load unpacked → select `extension/`
2. Start the MCP server: `node dist/index.js`
3. Click the extension icon → **Connect**
4. Use `extension_*` tools

### Firefox Extension (`extension-firefox/`)

Uses WebExtensions API with content scripts (no CDP dependency).

1. Go to `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `extension-firefox/manifest.json`
2. Start the MCP server: `node dist/index.js`
3. Click the extension icon → **Connect**
4. Use `firefox_*` tools

## Extension Tools

### Shared (Chrome + Firefox)

| Tool | Description |
|------|-------------|
| `extension_connect` | Check extension connection status |
| `extension_evaluate` | Execute JavaScript in the tab |
| `extension_screenshot` | Capture a screenshot of the tab |
| `extension_get_tabs` | List all open browser tabs |
| `extension_attach_tab` | Attach to a specific tab by ID |

### Chrome CDP Tools

| Tool | Description |
|------|-------------|
| `extension_navigate` | Navigate the connected tab to a URL |
| `extension_click` | Click an element by CSS selector |

### Firefox Content Script Tools

| Tool | Description |
|------|-------------|
| `firefox_navigate` | Navigate the connected tab to a URL |
| `firefox_click` | Click an element by CSS selector |
| `firefox_type` | Type text into an input field |
| `firefox_fill` | Fill an input field with a value |
| `firefox_get_text` | Get text content of an element |
| `firefox_get_html` | Get HTML content of page or element |
| `firefox_hover` | Hover over an element |
| `firefox_select` | Select an option in a select element |
| `firefox_check` | Check a checkbox |
| `firefox_uncheck` | Uncheck a checkbox |
| `firefox_get_attribute` | Get an attribute value from an element |
| `firefox_get_url` | Get the current page URL |
| `firefox_get_title` | Get the current page title |
| `firefox_go_back` | Navigate back in history |
| `firefox_go_forward` | Navigate forward in history |
| `firefox_reload` | Reload the current page |
| `firefox_scroll` | Scroll the page |
| `firefox_screenshot` | Take a screenshot of the connected tab |
| `firefox_evaluate` | Execute JavaScript in the connected tab |

## Headless Mode (Default)

25+ `browser_*` tools for headless Chromium via Playwright.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `MCP_WS_PORT` | `9223` | WebSocket port for extension bridge |
| `MCP_USE_EXTENSION` | `false` | Set to `true` to require extension mode |
