# Playwright MCP Server

Browser automation via the Model Context Protocol. Supports **headless Playwright** and **Chrome Extension bridge** for controlling existing browser tabs.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run build
node dist/index.js
```

## Chrome Extension Bridge

Link the MCP agent to your existing browser tabs:

1. Load the `extension/` folder as an unpacked extension in Chrome
2. Start the MCP server: `node dist/index.js`
3. Click **Connect** in the extension popup
4. Use `extension_*` tools to control your real browser tabs

### Extension Tools

| Tool | Description |
|------|-------------|
| `extension_connect` | Check extension connection status |
| `extension_navigate` | Navigate the connected tab to a URL |
| `extension_evaluate` | Execute JavaScript in the tab |
| `extension_screenshot` | Capture a screenshot of the tab |
| `extension_get_tabs` | List all open browser tabs |
| `extension_attach_tab` | Attach to a specific tab by ID |
| `extension_click` | Click an element by CSS selector |

## Headless Mode (Default)

25+ browser automation tools for headless Chromium via Playwright.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `MCP_WS_PORT` | `9223` | WebSocket port for extension bridge |
| `MCP_USE_EXTENSION` | `false` | Set to `true` to require extension mode |
