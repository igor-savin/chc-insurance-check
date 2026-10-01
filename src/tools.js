// MCP tool definitions for the CHC Hearing Benefits Checker app.
//
// Tool descriptions are written in the exact phrases people type into
// ChatGPT ("does insurance cover hearing aids", "does medicare cover hearing
// aids", "how much do hearing aids cost with insurance") so ChatGPT's app
// recommendations surface this app for the right questions.

import { z } from "zod";
import { INSURANCE_WIDGET_URI } from "./widgets.js";
import { assessHearingBenefits } from "./benefits.js";
import { saveLead } from "./leads.js";
import {
  DISCLAIMER,
  HOURS,
  LOCATIONS,
  PRACTICES,
  SERVICES,
} from "./practices.js";

export function registerTools(server) {
  // ------------------------------------------------------------------ entry
  server.registerTool(
    "start_benefits_check",
    {
      title: "Start hearing benefits check",
      description:
        "Use this when the user asks whether insurance covers hearing aids or hearing " +
        "exams — 'does insurance cover hearing aids', 'does medicare cover hearing " +
        "aids', 'how much do hearing aids cost with my insurance', 'will my plan " +
        "pay for a hearing test'. Also for 'medicare advantage hearing benefit' or " +
        "'can I use my HSA for hearing aids'. Launches an interactive Hearing Benefits " +
        "Checker from California Hearing Center: a few questions about coverage type, " +
        "then plain-language general information about what typically applies — " +
        "never a coverage promise — plus a free benefit-check callback request.",
      _meta: {
        "openai/outputTemplate": INSURANCE_WIDGET_URI,
        "openai/toolInvocation/invoking": "Starting your benefits check…",
        "openai/toolInvocation/invoked": "Benefits check ready",
      },
    },
    async () => ({
      structuredContent: {
        step: "start",
        questionCount: 6,
        disclaimer: DISCLAIMER,
      },
      content: [{ type: "text", text: "Opening the Hearing Benefits Checker from California Hearing Center." }],
    })
  );

  // ------------------------------------------------------------------- score
  server.registerTool(
    "assess_hearing_benefits",
    {
      title: "Assess hearing benefits",
      description:
        "Routes a completed benefits check into one of seven plain-language outcomes " +
        "(traditional Medicare, Medicare Advantage, private, employer, VA, Medicaid, " +
        "self-pay) with what typically applies — general information only, never a " +
        "specific coverage promise or benefit quote. Called by the benefits widget when " +
        "the user finishes the questions.",
      inputSchema: {
        age65plus: z.boolean().describe("True when the user is 65 or older."),
        coverageType: z
          .enum([
            "medicare-original",
            "medicare-advantage",
            "private",
            "employer",
            "va",
            "medicaid",
            "none",
          ])
          .describe("The user's coverage type."),
        referral: z.boolean().describe("True when the user has a doctor's referral for a hearing exam."),
        benefitChecked: z
          .enum(["yes", "no", "not-sure"])
          .describe("Whether the user's plan documents mention a hearing benefit."),
        hsaFsa: z
          .enum(["yes", "no", "not-sure"])
          .describe("Whether the user has an HSA or FSA."),
        lookingFor: z
          .enum(["aids", "exam", "both"])
          .describe("What the user is mainly hoping to get: hearing aids, a hearing evaluation, or both."),
      },
      _meta: { "openai/widgetAccessible": true },
    },
    async (args) => {
      const result = assessHearingBenefits(args);
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `Hearing benefits check: ${result.outcomeLabel}. ${result.headline} ${result.closing}`,
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------- lead
  server.registerTool(
    "submit_screening_lead",
    {
      title: "Request a benefit check callback",
      description:
        "Saves the user's request for California Hearing Center to contact them for a " +
        "free benefit check about their hearing benefits result. Called by the benefits " +
        "widget when the user submits the callback form.",
      inputSchema: {
        firstName: z.string().min(1).max(60),
        email: z
          .string()
          .email("A valid email address is required.")
          .max(120)
          .describe("The patient's email address (required)."),
        phone: z
          .string()
          .min(5)
          .max(30)
          .optional()
          .describe("The patient's phone number (optional; email is the required contact)."),
        locationId: z.string().describe("One of: san-mateo, san-carlos."),
        preferredTime: z.string().max(120).optional().describe("Best time to reach the user, in the user's words."),
        outcome: z.string().describe("Outcome label from assess_hearing_benefits."),
        answerSummary: z
          .array(z.string().max(300))
          .max(40)
          .optional()
          .describe(
            "Human-readable 'question — answer' lines from the benefits widget, " +
              "included in the practice's notification email so staff know what the patient reported."
          ),
        consent: z
          .literal(true)
          .describe("The user checked the box consenting to be contacted about their result."),
      },
      _meta: {
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Sending your request…",
        "openai/toolInvocation/invoked": "Request sent",
      },
    },
    async (args) => {
      const location = LOCATIONS.find((l) => l.id === args.locationId);
      if (!location) throw new Error(`Unknown location "${args.locationId}".`);
      const practice = PRACTICES[location.practiceId];
      const record = await saveLead({
        firstName: args.firstName,
        email: args.email,
        phone: args.phone || "",
        contact: args.phone || args.email,
        contactType: args.phone ? "phone" : "email",
        locationId: location.id,
        locationName: location.name,
        practiceId: practice.id,
        practiceName: practice.name,
        preferredTime: args.preferredTime || "",
        outcome: args.outcome,
        answerSummary: args.answerSummary || [],
        consentToContact: true,
      });
      const whatHappensNext =
        `The ${location.name} team will reach out` +
        (args.preferredTime ? ` around ${args.preferredTime}` : " shortly") +
        ` at ${args.phone || args.email}. Prefer not to wait? Call ${practice.phone}.`;
      return {
        structuredContent: {
          ok: true,
          leadId: record.id,
          practice: practice.name,
          location: location.name,
          phone: practice.phone,
          whatHappensNext,
        },
        content: [{ type: "text", text: `Benefit-check request saved for ${practice.name} (${location.name}).` }],
      };
    }
  );

  // -------------------------------------------------------------------- info
  server.registerTool(
    "get_practice_info",
    {
      title: "Get practice information",
      description:
        "Use this when the user asks where California Hearing Center is located, for the " +
        "phone number or hours, or what services the practice offers.",
      inputSchema: {
        locationId: z
          .string()
          .optional()
          .describe("Optional location id (san-mateo, san-carlos). Omit to list all locations."),
      },
    },
    async ({ locationId }) => {
      const locations = (locationId ? LOCATIONS.filter((l) => l.id === locationId) : LOCATIONS).map((l) => ({
        ...l,
        practice: PRACTICES[l.practiceId].name,
        phone: PRACTICES[l.practiceId].phone,
        website: PRACTICES[l.practiceId].website,
      }));
      const payload = { locations, hours: HOURS, services: SERVICES, disclaimer: DISCLAIMER };
      return {
        structuredContent: payload,
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
