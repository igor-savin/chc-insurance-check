// HTTP entrypoint: serves the MCP server over Streamable HTTP at POST /mcp.
//
// ChatGPT connects to the public HTTPS URL of this endpoint (e.g.
// https://<your-host>/mcp) as a connector (dev mode) or a submitted app.
//
// Session model: the MCP spec is stateful — each client (each ChatGPT chat
// using the app) gets its own session, tracked by the Mcp-Session-Id header.
// This server keeps one transport + one McpServer per session in a map.
// (In this SDK version a stateless transport instance is single-use, so the
// per-session map is the correct pattern for a long-running server.)

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerWidgets } from "./widgets.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT || 8787);
// ChatGPT must be allowed to call the endpoint from the browser.
const ALLOWED_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com"];

/** Build a fresh McpServer (tools + widget) for a new session. */
async function createSessionServer() {
  const server = new McpServer(
    { name: "chc-insurance-check", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } }
  );
  await registerWidgets(server);
  registerTools(server);
  return server;
}

/** sessionId -> transport */
const transports = new Map();

function isInitializeRequest(body) {
  if (!body) return false;
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some((m) => m?.method === "initialize");
}

const httpServer = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "chc-insurance-check", sessions: transports.size }));
    return;
  }

  if (req.url !== "/mcp") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy(); // sanity cap
  });
  req.on("end", async () => {
    try {
      const parsed = body ? JSON.parse(body) : undefined;
      const sessionId = req.headers["mcp-session-id"];

      let transport;
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if ((req.method === "POST" || req.method === "GET") && isInitializeRequest(parsed)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => transports.set(sid, transport),
          onsessionclosed: (sid) => transports.delete(sid),
        });
        // Never swallow transport errors: log them so failures are diagnosable.
        transport.onerror = (err) => console.error("[mcp transport error]", err?.stack || err);
        const server = await createSessionServer();
        await server.connect(transport);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: missing or unknown Mcp-Session-Id" },
            id: null,
          })
        );
        return;
      }

      await transport.handleRequest(req, res, parsed);
    } catch (err) {
      console.error("[mcp request error]", err?.stack || err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`chc-insurance-check MCP server listening on :${PORT} (POST /mcp)`);
});
