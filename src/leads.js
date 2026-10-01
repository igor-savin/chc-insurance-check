// Lead capture: append every benefit-check request to a local JSONL log,
// optionally POST it to LEAD_WEBHOOK_URL (CRM / Zapier / Make), and
// optionally email it to the practice inbox via the Resend API.
// Webhook and email are fire-and-forget and never throw — a failed
// notification must not break the chat.
//
// Email setup (all env vars set in the Render dashboard):
//   RESEND_API_KEY    API key from https://resend.com (the practice's existing key)
//   LEAD_NOTIFY_EMAIL inbox that receives new-lead emails, e.g.
//                     infoCHC@hearing-care.org (comma-separated = several)
//   LEAD_FROM_EMAIL   optional sender, defaults to onboarding@resend.dev
//                     (verify your own domain in Resend to send from it)
//   APP_LABEL         optional short label for this app, used in the
//                     email subject, e.g. "Hearing Benefits Checker"

import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DATA_DIR = new URL("../data/", import.meta.url);
const LEAD_FILE = new URL("../data/leads.jsonl", import.meta.url);

export async function saveLead(lead) {
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: "chatgpt-app",
    ...lead,
  };
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(LEAD_FILE, JSON.stringify(record) + "\n", "utf8");
  // Fire-and-forget: don't let a slow/dead webhook or email hang the tool call.
  fireWebhook(record).catch(() => {});
  notifyEmail(record).catch(() => {});
  return record;
}

async function fireWebhook(record) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function leadEmailBody(record) {
  const appLabel = process.env.APP_LABEL || "ChatGPT app";
  const lines = [
    `${appLabel} — new benefit-check request`,
    "",
    `Name: ${record.firstName || "-"}`,
    `Email: ${record.email || "-"}`,
    `Phone: ${record.phone || "-"}`,
    `Office: ${record.locationName || "-"} (${record.practiceName || "-"})`,
    `Preferred time: ${record.preferredTime || "-"}`,
  ];
  if (record.band) {
    lines.push(
      `Quiz result: ${record.band}` +
        (record.score != null ? ` (score ${record.score})` : "")
    );
  }
  if (record.urgency) lines.push(`Urgency: ${record.urgency}`);
  if (record.outcome) lines.push(`Outcome: ${record.outcome}`);
  if (record.answerSummary && record.answerSummary.length) {
    lines.push("", "Their answers:");
    for (const a of record.answerSummary) lines.push(`- ${a}`);
  }
  lines.push(
    "",
    `Reference: ${String(record.id).slice(0, 8).toUpperCase()}`,
    `Received: ${record.createdAt}`
  );
  return lines.join("\n");
}

async function notifyEmail(record) {
  const apiKey = process.env.RESEND_API_KEY;
  const toRaw = process.env.LEAD_NOTIFY_EMAIL;
  if (!apiKey || !toRaw) return;
  const to = toRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return;
  const from = process.env.LEAD_FROM_EMAIL || "Hearing App <onboarding@resend.dev>";
  const appLabel = process.env.APP_LABEL || "ChatGPT app";
  const subject =
    `New callback request (${appLabel}): ${record.firstName || "no name"}` +
    (record.locationName ? ` — ${record.locationName}` : "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: leadEmailBody(record),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Exported for unit tests (email body composition incl. required email).
export { leadEmailBody };
