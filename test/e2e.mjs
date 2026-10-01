// End-to-end smoke test: stateful MCP client (session ID header) against the local server.
import assert from "node:assert/strict";

const BASE = process.env.MCP_URL || "http://127.0.0.1:8787";
// ^ set MCP_URL to point at a running server, e.g. MCP_URL=http://127.0.0.1:8787 npm run test:e2e
let id = 0;
let sessionId = null;

async function rpc(method, params) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  const dataLines = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6).trim())
    .filter((d) => d && d !== "[DONE]");
  assert.ok(dataLines.length > 0, `no SSE data for ${method}: HTTP ${res.status} :: ${text.slice(0, 200)}`);
  const msg = JSON.parse(dataLines[dataLines.length - 1]);
  if (msg.error) throw new Error(`${method} failed: ${JSON.stringify(msg.error)}`);
  return msg.result;
}

async function notify(method) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
}

const ANSWERS_ORIGINAL_MEDICARE = {
  age65plus: true, coverageType: "medicare-original", referral: true,
  benefitChecked: "no", hsaFsa: "yes", lookingFor: "aids",
};
const ANSWERS_ADVANTAGE = {
  age65plus: true, coverageType: "medicare-advantage", referral: false,
  benefitChecked: "not-sure", hsaFsa: "not-sure", lookingFor: "both",
};

// 1. initialize
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0" },
});
console.log("✓ initialize — server:", init.serverInfo.name, init.serverInfo.version);
assert.ok(sessionId, "server issued a session id");
await notify("notifications/initialized");

// 2. tools/list
const tools = await rpc("tools/list", {});
const names = tools.tools.map((t) => t.name);
console.log("✓ tools/list —", names.join(", "));
assert.deepEqual(
  names.sort(),
  ["assess_hearing_benefits", "get_practice_info", "start_benefits_check", "submit_screening_lead"].sort()
);
const startTool = tools.tools.find((t) => t.name === "start_benefits_check");
assert.equal(startTool._meta["openai/outputTemplate"], "ui://widget/insurance-checker.html");
console.log("✓ start_benefits_check points at the widget via openai/outputTemplate");

// 3. resources/list + resources/read — the widget
const resList = await rpc("resources/list", {});
console.log("✓ resources/list —", resList.resources.map((r) => r.uri).join(", "));
const widget = await rpc("resources/read", { uri: "ui://widget/insurance-checker.html" });
const content = widget.contents[0];
assert.equal(content.mimeType, "text/html+skybridge");
assert.ok(content.text.includes("Hearing Benefits Checker"), "widget HTML contains title");
assert.ok(content.text.includes("California Hearing Center"), "widget is CHC-branded");
assert.ok(content.text.includes("window.openai"), "widget uses the openai bridge");
assert.ok(content.text.includes('type="email"'), "callback form has an email field");
assert.ok(content.text.includes('id="f-email"'), "email field has id f-email");
assert.ok(content.text.includes("#155f6b"), "widget uses the CHC deep-teal theme");
console.log(`✓ widget resource — ${content.mimeType}, ${content.text.length} bytes HTML, email field present`);

// 4. start_benefits_check (the model's entry point)
const started = await rpc("tools/call", { name: "start_benefits_check", arguments: {} });
assert.match(started.structuredContent.disclaimer, /general information/i);
assert.equal(started.structuredContent.questionCount, 6);
console.log("✓ start_benefits_check — disclaimer present in structuredContent");

// 5. assess_hearing_benefits — traditional Medicare → medicare-original + referral note
const orig = await rpc("tools/call", { name: "assess_hearing_benefits", arguments: ANSWERS_ORIGINAL_MEDICARE });
const so = orig.structuredContent;
assert.equal(so.outcome, "medicare-original");
assert.ok(so.notes.some((n) => /doctor's referral/i.test(n)), "referral note present");
assert.ok(so.notes.some((n) => /HSA or FSA/i.test(n)), "HSA note present");
assert.match(so.closing, /not a coverage decision/);
assert.match(so.clinicalReviewRequired, /reviewed and approved/);
console.log(`✓ assess_hearing_benefits — original Medicare → outcome=${so.outcome}, closing present`);

// 6. assess_hearing_benefits — Medicare Advantage → medicare-advantage
const adv = await rpc("tools/call", { name: "assess_hearing_benefits", arguments: ANSWERS_ADVANTAGE });
const sa = adv.structuredContent;
assert.equal(sa.outcome, "medicare-advantage");
assert.match(sa.closing, /before anything costs you a cent/);
console.log(`✓ assess_hearing_benefits — Medicare Advantage → outcome=${sa.outcome}`);

// 7. assess_hearing_benefits — invalid input rejected
const badAssess = await rpc("tools/call", {
  name: "assess_hearing_benefits",
  arguments: { ...ANSWERS_ORIGINAL_MEDICARE, coverageType: "gold-plan" },
});
assert.equal(badAssess.isError, true);
assert.match(badAssess.content[0].text, /coverageType/, "rejection message names coverageType");
console.log("✓ assess_hearing_benefits rejects an invalid coverageType");

// 8. get_practice_info — CHC only, 2 locations
const info = await rpc("tools/call", { name: "get_practice_info", arguments: {} });
assert.equal(info.structuredContent.locations.length, 2);
assert.ok(info.structuredContent.locations.every((l) => !/NY|New York/i.test(l.name)));
assert.ok(info.structuredContent.locations.some((l) => /88 N\. San Mateo Drive/.test(l.address)), "San Mateo address baked in");
console.log("✓ get_practice_info — 2 CHC locations returned with real addresses");

// 9. submit_screening_lead (TEST record with required email)
const lead = await rpc("tools/call", {
  name: "submit_screening_lead",
  arguments: {
    firstName: "TESTLEAD",
    email: "testlead@example.com",
    phone: "555-0100",
    locationId: "san-mateo",
    preferredTime: "weekday mornings",
    outcome: "Medicare Advantage — what usually applies",
    answerSummary: [
      "Are you 65 or older? — Yes, I'm 65 or older",
      "What kind of health coverage do you have? — Medicare Advantage (Part C)",
    ],
    consent: true,
  },
});
assert.equal(lead.structuredContent.ok, true);
assert.ok(lead.structuredContent.leadId);
console.log("✓ submit_screening_lead — leadId", lead.structuredContent.leadId);
console.log("  whatHappensNext:", lead.structuredContent.whatHappensNext);

// 10. validation: unknown location rejected
const badLead = await rpc("tools/call", {
  name: "submit_screening_lead",
  arguments: {
    firstName: "X", email: "x@example.com", locationId: "harrison",
    outcome: "none", consent: true,
  },
});
assert.equal(badLead.isError, true);
assert.match(badLead.content[0].text, /Unknown location/);
console.log("✓ submit_screening_lead rejects unknown location (harrison is not a CHC office)");

// 11. validation: invalid email rejected
const badEmail = await rpc("tools/call", {
  name: "submit_screening_lead",
  arguments: {
    firstName: "X", email: "not-an-email", locationId: "san-mateo",
    outcome: "none", consent: true,
  },
});
assert.equal(badEmail.isError, true);
console.log("✓ submit_screening_lead rejects an invalid email address");

// 12. validation: missing email rejected
const noEmail = await rpc("tools/call", {
  name: "submit_screening_lead",
  arguments: {
    firstName: "X", locationId: "san-mateo", outcome: "none", consent: true,
  },
});
assert.equal(noEmail.isError, true);
console.log("✓ submit_screening_lead rejects a missing email (field is required)");

// 13. health endpoint
const health = await (await fetch(`${BASE}/health`)).json();
assert.equal(health.service, "chc-insurance-check");
assert.equal(health.ok, true);
console.log("✓ GET /health — service:", health.service);

console.log("\nALL E2E CHECKS PASSED");
