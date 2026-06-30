import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
// --- Configuration ---
const WS_PORT = parseInt(process.env.MCP_WS_PORT || "9223", 10);
const USE_EXTENSION = process.env.MCP_USE_EXTENSION === "true";
// --- State ---
let browser = null;
let context = null;
let page = null;
let extWs = null;
let extTabId = null;
let cmdCallbacks = new Map();
let cmdCounter = 0;
// Helper to convert zod schemas to JSON schema for MCP tool definitions
function toJsonSchema(schema) {
    return zodToJsonSchema(schema);
}
// --- WebSocket server for Chrome Extension bridge ---
function startWebSocketServer() {
    const wss = new WebSocketServer({ port: WS_PORT });
    console.error("[MCP] Extension bridge WebSocket server listening on port", WS_PORT);
    wss.on("connection", (ws) => {
        console.error("[MCP] Extension connected!");
        extWs = ws;
        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                handleExtensionMessage(msg);
            }
            catch (err) {
                console.error("[MCP] Failed to parse extension message:", err);
            }
        });
        ws.on("close", () => {
            console.error("[MCP] Extension disconnected");
            extWs = null;
            extTabId = null;
        });
        ws.on("error", (err) => {
            console.error("[MCP] Extension WebSocket error:", err);
        });
    });
}
function handleExtensionMessage(msg) {
    switch (msg.type) {
        case "pong":
            break;
        case "tab_attached":
            extTabId = msg.tabId;
            console.error("[MCP] Extension attached to tab:", msg.url);
            break;
        case "tab_detached":
            extTabId = null;
            console.error("[MCP] Extension detached from tab");
            break;
        case "tab_list":
            console.error("[MCP] Available tabs:", msg.tabs?.length);
            break;
        case "command_result":
            if (msg.id && cmdCallbacks.has(msg.id)) {
                const cb = cmdCallbacks.get(msg.id);
                cmdCallbacks.delete(msg.id);
                cb(msg);
            }
            break;
        case "debugger_event":
            break;
        default:
            console.error("[MCP] Unknown extension message:", msg.type);
    }
}
function sendToExtension(data) {
    return new Promise((resolve, reject) => {
        if (!extWs || extWs.readyState !== WebSocket.OPEN) {
            reject(new Error("Extension not connected"));
            return;
        }
        const id = "cmd_" + (cmdCounter++);
        data.id = id;
        cmdCallbacks.set(id, resolve);
        extWs.send(JSON.stringify(data));
        setTimeout(() => {
            if (cmdCallbacks.has(id)) {
                cmdCallbacks.delete(id);
                reject(new Error("Command timed out"));
            }
        }, 30000);
    });
}
// --- Zod schemas ---
const NavigateArgs = z.object({ url: z.string().describe("URL to navigate to") });
const ScreenshotArgs = z.object({ path: z.string().optional().describe("File path"), fullPage: z.boolean().optional() });
const ClickArgs = z.object({ selector: z.string().describe("CSS selector") });
const TypeArgs = z.object({ selector: z.string(), text: z.string(), delay: z.number().optional() });
const EvaluateArgs = z.object({ script: z.string() });
const GetTextArgs = z.object({ selector: z.string() });
const GetAttributeArgs = z.object({ selector: z.string(), name: z.string() });
const SelectArgs = z.object({ selector: z.string(), value: z.string() });
const HoverArgs = z.object({ selector: z.string() });
const WaitForSelectorArgs = z.object({ selector: z.string(), timeout: z.number().optional(), state: z.enum(["attached", "detached", "visible", "hidden"]).optional() });
const PressKeyArgs = z.object({ key: z.string() });
const GetUrlArgs = z.object({});
const GetTitleArgs = z.object({});
const GoBackArgs = z.object({});
const GoForwardArgs = z.object({});
const ReloadArgs = z.object({});
const SetViewportArgs = z.object({ width: z.number(), height: z.number() });
const ScrollArgs = z.object({ x: z.number().optional(), y: z.number().optional() });
const GetHtmlArgs = z.object({ selector: z.string().optional() });
const FillArgs = z.object({ selector: z.string(), value: z.string() });
const CheckArgs = z.object({ selector: z.string() });
const UncheckArgs = z.object({ selector: z.string() });
const NewPageArgs = z.object({});
const ClosePageArgs = z.object({});
const ListPagesArgs = z.object({});
const ExtensionConnectArgs = z.object({ timeout: z.number().optional().describe("Seconds to wait for extension") });
const ExtensionEvalArgs = z.object({ expression: z.string().describe("JavaScript expression to evaluate") });
const ExtensionScreenshotArgs = z.object({});
const ExtensionGetTabsArgs = z.object({});
const ExtensionAttachTabArgs = z.object({ tabId: z.number().optional().describe("Tab ID to attach to") });
// --- Playwright browser management ---
async function ensureBrowser() {
    if (USE_EXTENSION) {
        throw new Error("Use extension tools when MCP_USE_EXTENSION=true");
    }
    if (!browser || !context || !page) {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        page = await context.newPage();
    }
    return { browser, context, page };
}
function textContent(text) {
    return { content: [{ type: "text", text }] };
}
// --- Tool handlers ---
async function handleToolCall(name, args) {
    // Extension-bridge tools
    if (name === "extension_connect") {
        const { timeout = 30 } = ExtensionConnectArgs.parse(args);
        if (!extWs) {
            return textContent("Waiting for extension to connect on ws://localhost:" + WS_PORT + "...");
        }
        return textContent("Extension connected! Tab ID: " + (extTabId || "not attached"));
    }
    if (name === "extension_evaluate") {
        const { expression } = ExtensionEvalArgs.parse(args);
        const result = await sendToExtension({ type: "evaluate", expression });
        if (result.error)
            return textContent("Error: " + result.error);
        const value = result.result?.result?.value;
        return textContent(value !== undefined ? String(value) : JSON.stringify(result.result));
    }
    if (name === "extension_screenshot") {
        const result = await sendToExtension({ type: "screenshot" });
        if (result.error)
            return textContent("Error: " + result.error);
        const data = result.result?.result?.data;
        if (data) {
            const buf = Buffer.from(data, "base64");
            const filePath = "extension_screenshot.png";
            fs.writeFileSync(filePath, buf);
            return textContent("Screenshot saved to " + filePath + " (" + buf.length + " bytes)");
        }
        return textContent("No screenshot data received");
    }
    if (name === "extension_get_tabs") {
        const result = await sendToExtension({ type: "get_tabs" });
        if (result.tabs) {
            const list = result.tabs.map((t) => "[" + t.id + "] " + (t.title || "untitled") + " - " + (t.url || "about:blank") + (t.active ? " [ACTIVE]" : ""));
            return textContent(list.join("\n") || "No tabs found");
        }
        return textContent("No tabs data");
    }
    if (name === "extension_attach_tab") {
        const { tabId } = ExtensionAttachTabArgs.parse(args);
        await sendToExtension({ type: "attach", tabId });
        return textContent("Attached to tab" + (tabId ? " " + tabId : ""));
    }
    if (name === "extension_navigate") {
        const { url } = NavigateArgs.parse(args);
        const result = await sendToExtension({ type: "navigate", url });
        if (result.error)
            return textContent("Error: " + result.error);
        return textContent("Navigated to " + url);
    }
    if (name === "extension_click") {
        const { selector } = ClickArgs.parse(args);
        const docResult = await sendToExtension({ type: "command", method: "DOM.getDocument", params: {} });
        if (docResult.error)
            return textContent("Error: " + docResult.error);
        const rootNodeId = docResult.result?.result?.root?.nodeId;
        if (!rootNodeId)
            return textContent("Could not get document root");
        const queryResult = await sendToExtension({
            type: "command",
            method: "DOM.querySelector",
            params: { nodeId: rootNodeId, selector }
        });
        if (queryResult.error)
            return textContent("Error: " + queryResult.error);
        const nodeId = queryResult.result?.result?.nodeId;
        if (!nodeId)
            return textContent("Element not found: " + selector);
        await sendToExtension({ type: "click", nodeId });
        return textContent("Clicked: " + selector);
    }
    // Playwright headless tools
    const { page: p } = await ensureBrowser();
    switch (name) {
        case "browser_navigate": {
            const { url } = NavigateArgs.parse(args);
            await p.goto(url, { waitUntil: "networkidle" });
            return textContent("Navigated to " + url);
        }
        case "browser_screenshot": {
            const { path: filePath = "screenshot.png", fullPage = false } = ScreenshotArgs.parse(args);
            await p.screenshot({ path: filePath, fullPage });
            return textContent("Screenshot saved to " + filePath);
        }
        case "browser_click": {
            const { selector } = ClickArgs.parse(args);
            await p.click(selector);
            return textContent("Clicked: " + selector);
        }
        case "browser_type": {
            const { selector, text, delay } = TypeArgs.parse(args);
            await p.fill(selector, "");
            await p.type(selector, text, { delay });
            return textContent("Typed into " + selector);
        }
        case "browser_evaluate": {
            const { script } = EvaluateArgs.parse(args);
            const result = await p.evaluate(script);
            return textContent(JSON.stringify(result, null, 2));
        }
        case "browser_get_text": {
            const { selector } = GetTextArgs.parse(args);
            const text = await p.textContent(selector);
            return textContent(text || "");
        }
        case "browser_get_attribute": {
            const { selector, name } = GetAttributeArgs.parse(args);
            const value = await p.getAttribute(selector, name);
            return textContent(value || "");
        }
        case "browser_select": {
            const { selector, value } = SelectArgs.parse(args);
            await p.selectOption(selector, value);
            return textContent("Selected " + value);
        }
        case "browser_hover": {
            const { selector } = HoverArgs.parse(args);
            await p.hover(selector);
            return textContent("Hovered: " + selector);
        }
        case "browser_wait_for_selector": {
            const { selector, timeout = 30000, state } = WaitForSelectorArgs.parse(args);
            await p.waitForSelector(selector, { timeout, state });
            return textContent("Selector visible: " + selector);
        }
        case "browser_press_key": {
            const { key } = PressKeyArgs.parse(args);
            await p.keyboard.press(key);
            return textContent("Pressed: " + key);
        }
        case "browser_get_url": {
            return textContent(p.url());
        }
        case "browser_get_title": {
            const title = await p.title();
            return textContent(title);
        }
        case "browser_go_back": {
            await p.goBack({ waitUntil: "networkidle" });
            return textContent("Navigated back");
        }
        case "browser_go_forward": {
            await p.goForward({ waitUntil: "networkidle" });
            return textContent("Navigated forward");
        }
        case "browser_reload": {
            await p.reload({ waitUntil: "networkidle" });
            return textContent("Page reloaded");
        }
        case "browser_set_viewport": {
            const { width, height } = SetViewportArgs.parse(args);
            await p.setViewportSize({ width, height });
            return textContent("Viewport: " + width + "x" + height);
        }
        case "browser_scroll": {
            const { x = 0, y = 0 } = ScrollArgs.parse(args);
            await p.evaluate("window.scrollTo(" + x + "," + y + ")");
            return textContent("Scrolled to " + x + "," + y);
        }
        case "browser_get_html": {
            const { selector } = GetHtmlArgs.parse(args);
            if (selector) {
                const el = await p.$(selector);
                const html = el ? await el.innerHTML() : "";
                return textContent(html);
            }
            const html = await p.content();
            return textContent(html);
        }
        case "browser_fill": {
            const { selector, value } = FillArgs.parse(args);
            await p.fill(selector, value);
            return textContent("Filled " + selector);
        }
        case "browser_check": {
            const { selector } = CheckArgs.parse(args);
            await p.check(selector);
            return textContent("Checked " + selector);
        }
        case "browser_uncheck": {
            const { selector } = UncheckArgs.parse(args);
            await p.uncheck(selector);
            return textContent("Unchecked " + selector);
        }
        case "browser_new_page": {
            const newPage = await context.newPage();
            page = newPage;
            return textContent("New page created");
        }
        case "browser_close_page": {
            await p.close();
            const pages = context.pages();
            page = pages.length > 0 ? pages[pages.length - 1] : null;
            return textContent("Page closed");
        }
        case "browser_list_pages": {
            const pages = context.pages();
            const urls = pages.map((pg, i) => "[" + i + "] " + pg.url());
            return textContent(urls.join("\n") || "No pages");
        }
        default:
            throw new Error("Unknown tool: " + name);
    }
}
// --- Tool definitions ---
const toolDefinitions = [
    { name: "extension_connect", description: "Check if Chrome extension is connected", inputSchema: toJsonSchema(ExtensionConnectArgs) },
    { name: "extension_evaluate", description: "Execute JavaScript in the connected browser tab", inputSchema: toJsonSchema(ExtensionEvalArgs) },
    { name: "extension_screenshot", description: "Take a screenshot of the connected tab", inputSchema: toJsonSchema(ExtensionScreenshotArgs) },
    { name: "extension_get_tabs", description: "List all open tabs in the browser", inputSchema: toJsonSchema(ExtensionGetTabsArgs) },
    { name: "extension_attach_tab", description: "Attach to a specific tab by ID", inputSchema: toJsonSchema(ExtensionAttachTabArgs) },
    { name: "extension_navigate", description: "Navigate the connected tab to a URL", inputSchema: toJsonSchema(NavigateArgs) },
    { name: "extension_click", description: "Click an element in the connected tab by CSS selector", inputSchema: toJsonSchema(ClickArgs) },
    { name: "browser_navigate", description: "Navigate to a URL (headless)", inputSchema: toJsonSchema(NavigateArgs) },
    { name: "browser_screenshot", description: "Take a screenshot (headless)", inputSchema: toJsonSchema(ScreenshotArgs) },
    { name: "browser_click", description: "Click an element (headless)", inputSchema: toJsonSchema(ClickArgs) },
    { name: "browser_type", description: "Type text into an input (headless)", inputSchema: toJsonSchema(TypeArgs) },
    { name: "browser_evaluate", description: "Execute JavaScript (headless)", inputSchema: toJsonSchema(EvaluateArgs) },
    { name: "browser_get_text", description: "Get element text (headless)", inputSchema: toJsonSchema(GetTextArgs) },
    { name: "browser_get_attribute", description: "Get element attribute (headless)", inputSchema: toJsonSchema(GetAttributeArgs) },
    { name: "browser_select", description: "Select option (headless)", inputSchema: toJsonSchema(SelectArgs) },
    { name: "browser_hover", description: "Hover over element (headless)", inputSchema: toJsonSchema(HoverArgs) },
    { name: "browser_wait_for_selector", description: "Wait for element (headless)", inputSchema: toJsonSchema(WaitForSelectorArgs) },
    { name: "browser_press_key", description: "Press a key (headless)", inputSchema: toJsonSchema(PressKeyArgs) },
    { name: "browser_get_url", description: "Get current URL (headless)", inputSchema: toJsonSchema(GetUrlArgs) },
    { name: "browser_get_title", description: "Get page title (headless)", inputSchema: toJsonSchema(GetTitleArgs) },
    { name: "browser_go_back", description: "Go back (headless)", inputSchema: toJsonSchema(GoBackArgs) },
    { name: "browser_go_forward", description: "Go forward (headless)", inputSchema: toJsonSchema(GoForwardArgs) },
    { name: "browser_reload", description: "Reload page (headless)", inputSchema: toJsonSchema(ReloadArgs) },
    { name: "browser_set_viewport", description: "Set viewport size (headless)", inputSchema: toJsonSchema(SetViewportArgs) },
    { name: "browser_scroll", description: "Scroll page (headless)", inputSchema: toJsonSchema(ScrollArgs) },
    { name: "browser_get_html", description: "Get page HTML (headless)", inputSchema: toJsonSchema(GetHtmlArgs) },
    { name: "browser_fill", description: "Fill input field (headless)", inputSchema: toJsonSchema(FillArgs) },
    { name: "browser_check", description: "Check checkbox (headless)", inputSchema: toJsonSchema(CheckArgs) },
    { name: "browser_uncheck", description: "Uncheck checkbox (headless)", inputSchema: toJsonSchema(UncheckArgs) },
    { name: "browser_new_page", description: "Create new tab (headless)", inputSchema: toJsonSchema(NewPageArgs) },
    { name: "browser_close_page", description: "Close current page (headless)", inputSchema: toJsonSchema(ClosePageArgs) },
    { name: "browser_list_pages", description: "List open pages (headless)", inputSchema: toJsonSchema(ListPagesArgs) },
];
// --- Server setup ---
const server = new Server({ name: "playwright-mcp-server", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        return await handleToolCall(request.params.name, request.params.arguments ?? {});
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: "Error: " + message }], isError: true };
    }
});
// --- Start ---
async function main() {
    startWebSocketServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Playwright MCP server running on stdio");
    console.error("Extension bridge listening on ws://localhost:" + WS_PORT);
    console.error("Set MCP_USE_EXTENSION=true to use extension mode");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
process.on("SIGINT", async () => { if (browser)
    await browser.close(); process.exit(0); });
process.on("SIGTERM", async () => { if (browser)
    await browser.close(); process.exit(0); });
//# sourceMappingURL=index.js.map