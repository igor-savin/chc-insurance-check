// Practice + location configuration for the CHC Hearing Benefits Checker
// ChatGPT app. Values baked in from the practices' own websites (verified
// 2026-10-01). Nothing here is sent to OpenAI except what the tools return
// in chat.

export const PRACTICES = {
  chc: {
    id: "chc",
    name: "California Hearing Center",
    website: "https://calhearing.com",
    phone: "(650) 342-9449",
    note: "5.0 rating · 189 Google reviews · 33 years serving the Peninsula",
  },
};

export const LOCATIONS = [
  {
    id: "san-mateo",
    practiceId: "chc",
    name: "San Mateo",
    address: "88 N. San Mateo Drive, San Mateo, CA 94401",
  },
  {
    id: "san-carlos",
    practiceId: "chc",
    name: "San Carlos",
    address: "1008 Laurel Street, San Carlos, CA 94070",
  },
];

export const HOURS =
  "San Mateo: Mon–Thu 9am–5pm, Fri 9am–3pm. " +
  "San Carlos: Mon–Wed 9am–1pm & 2–5pm, Thu 9am–12pm & 1–5pm, Fri 9am–12pm & 12:30–3pm.";

export const SERVICES = [
  "Comprehensive hearing evaluations",
  "Tinnitus evaluation and treatment",
  "Lenire bimodal neuromodulation therapy (for qualifying candidates)",
  "Hearing aids (all major manufacturers)",
  "Lyric invisible, extended-wear hearing aids",
  "Cochlear implant candidacy evaluations and programming",
  "Earwax removal",
  "Custom hearing protection",
  "Free benefit checks — we'll verify your insurance coverage",
  "Free second opinions",
];

export const DISCLAIMER =
  "General information only. Insurance rules change often and every plan is " +
  "different. Only a direct check of your specific plan — with the plan itself — " +
  "can say what is covered for you.";

// Every benefits outcome ends with this exact sentence.
export const BENEFITS_CLOSING =
  "This is general information, not a coverage decision — book a benefit check " +
  "and we'll verify your specific plan before anything costs you a cent.";
