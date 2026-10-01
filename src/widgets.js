// Widget (Apps SDK UI) registration.
// Widgets are MCP resources with the special `text/html+skybridge` MIME type.
// Tools point at them via `_meta["openai/outputTemplate"]`, and the widget
// talks back to the server through the `window.openai` bridge.

import { readFile } from "node:fs/promises";

export const INSURANCE_WIDGET_URI = "ui://widget/insurance-checker.html";

export async function registerWidgets(server) {
  const html = await readFile(new URL("./widgets/insurance.html", import.meta.url), "utf8");

  server.registerResource(
    "insurance-checker",
    INSURANCE_WIDGET_URI,
    { description: "Interactive hearing benefits checker widget (questions, outcome, benefit-check callback form)" },
    async () => ({
      contents: [
        {
          uri: INSURANCE_WIDGET_URI,
          mimeType: "text/html+skybridge",
          text: html,
          _meta: {
            "openai/widgetDescription":
              "Hearing Benefits Checker from California Hearing Center: answer a few questions about your coverage and see what typically applies to your plan, ending with a plain-language explanation and a free benefit-check callback request form.",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": {
              // Domains the widget may link/redirect the user to.
              redirect_domains: ["https://calhearing.com"],
            },
          },
        },
      ],
    })
  );
}
