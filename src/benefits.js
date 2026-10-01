// Hearing-benefits routing logic for the CHC "Hearing Benefits Checker"
// ChatGPT app.
//
// Input: plain-language answers about the user's age, coverage type, doctor
// referral, known hearing benefit, HSA/FSA, and what they're looking for.
// Output: one routing outcome per coverage type, in plain language.
//
// THIS IS GENERAL INFORMATION ONLY. It never promises coverage, never quotes
// a benefit amount, and never tells anyone their plan covers something. Every
// outcome ends with the mandated closing sentence directing the user to a
// benefit check at California Hearing Center, where staff verify the specific
// plan before anything costs the patient a cent.
//
// IMPORTANT: outcome copy must be reviewed by a licensed Au.D. / the practice
// before public patient use or App Directory submission (flagged as
// clinicalReviewRequired on every result).

export const COVERAGE_TYPES = [
  "medicare-original",
  "medicare-advantage",
  "private",
  "employer",
  "va",
  "medicaid",
  "none",
];
export const COVERAGE_LABELS = {
  "medicare-original": "Traditional Medicare (Parts A & B)",
  "medicare-advantage": "Medicare Advantage (Part C)",
  private: "Private / commercial insurance",
  employer: "Employer-provided plan",
  va: "VA health care",
  medicaid: "Medicaid (Medi-Cal in California)",
  none: "No insurance / self-pay",
};

export const BENEFIT_CHECKED_LEVELS = ["yes", "no", "not-sure"];
export const HSA_FSA_LEVELS = ["yes", "no", "not-sure"];
export const LOOKING_FOR_LEVELS = ["aids", "exam", "both"];
export const LOOKING_FOR_LABELS = {
  aids: "Hearing aids",
  exam: "A hearing evaluation",
  both: "Both hearing aids and an evaluation",
};

export const CLOSING =
  "This is general information, not a coverage decision — book a benefit check " +
  "and we'll verify your specific plan before anything costs you a cent.";

export const DISCLAIMER =
  "General information only. Insurance rules change often and every plan is " +
  "different. Only a direct check of your specific plan — with the plan itself — " +
  "can say what is covered for you.";

/**
 * Validate the raw answers; throw on anything out of range.
 * @param {object} input
 * @returns {object} the normalized input
 */
export function validateBenefitsAnswers(input) {
  const fail = (msg) => {
    throw new Error(`Invalid benefits check input: ${msg}`);
  };
  if (!input || typeof input !== "object") fail("expected an object");
  const { age65plus, coverageType, referral, benefitChecked, hsaFsa, lookingFor } = input;
  for (const [name, value] of [
    ["age65plus", age65plus],
    ["referral", referral],
  ]) {
    if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  }
  if (!COVERAGE_TYPES.includes(coverageType)) {
    fail(`coverageType must be one of ${COVERAGE_TYPES.join(", ")}`);
  }
  if (!BENEFIT_CHECKED_LEVELS.includes(benefitChecked)) {
    fail(`benefitChecked must be one of ${BENEFIT_CHECKED_LEVELS.join(", ")}`);
  }
  if (!HSA_FSA_LEVELS.includes(hsaFsa)) {
    fail(`hsaFsa must be one of ${HSA_FSA_LEVELS.join(", ")}`);
  }
  if (!LOOKING_FOR_LEVELS.includes(lookingFor)) {
    fail(`lookingFor must be one of ${LOOKING_FOR_LEVELS.join(", ")}`);
  }
  return { age65plus, coverageType, referral, benefitChecked, hsaFsa, lookingFor };
}

const HSA_FSA_NOTE =
  "If you have an HSA or FSA, that money can usually be used for hearing " +
  "evaluations and hearing aids — worth asking about at your benefit check.";

/**
 * Route validated answers to an outcome. Routing is by coverage type; notes
 * layer on age, doctor referral, and HSA/FSA answers.
 *
 * @param {object} input — raw answers (validated first)
 * @returns {object} outcome payload for tools/widget
 */
export function assessHearingBenefits(input) {
  const a = validateBenefitsAnswers(input);
  const notes = [];

  let copy;
  switch (a.coverageType) {
    case "medicare-original":
      copy = {
        outcome: "medicare-original",
        outcomeLabel: "Traditional Medicare — what usually applies",
        headline: "Traditional Medicare usually doesn't cover hearing aids — but it may cover your exam.",
        bullets: [
          "Original Medicare generally does NOT pay for hearing aids or routine hearing exams.",
          "It DOES generally cover a diagnostic hearing exam when a doctor orders it because of a suspected problem — that means a doctor's referral matters.",
          "If you're having hearing trouble, your doctor can refer you for a diagnostic exam, which is often a covered path to answers even when hearing aids themselves aren't.",
        ],
        recommendedNextStep:
          "Book a benefit check. If your doctor has ordered a diagnostic exam, bring the referral — we'll verify your exact coverage before anything costs you a cent. " +
          "We'll also walk through hearing-aid costs and payment options with you.",
      };
      if (a.referral) {
        notes.push(
          "You said you have a doctor's referral — good. A referral is exactly what a diagnostic hearing exam usually needs to be billable under Original Medicare. We'll verify it during your benefit check."
        );
      } else {
        notes.push(
          "You don't have a doctor's referral yet. If a diagnostic exam is what you need, your doctor's office can issue one — we're happy to explain what's typically required at your benefit check."
        );
      }
      break;

    case "medicare-advantage":
      copy = {
        outcome: "medicare-advantage",
        outcomeLabel: "Medicare Advantage — what usually applies",
        headline: "Many Medicare Advantage plans include a hearing benefit — yours needs checking.",
        bullets: [
          "Medicare Advantage plans often include a hearing benefit — frequently a routine hearing exam plus an allowance or set copay toward hearing aids.",
          "But it varies widely: some plans are generous, some cover almost nothing, and benefits reset and change every plan year.",
          "Many Advantage plans steer you to a specific network of providers, so where you go can matter as much as what's covered.",
          "The only way to know yours: the plan's Evidence of Coverage, or a call to the member-services number on your card.",
        ],
        recommendedNextStep:
          "Book a benefit check. We check Advantage plans for patients all the time — we'll call your plan with you and get the real numbers before you commit to anything.",
      };
      if (a.benefitChecked === "yes") {
        notes.push(
          "You said your plan documents mention a hearing benefit — promising. Bring the plan card or the documents to your benefit check and we'll pull the actual details together."
        );
      } else if (a.benefitChecked === "no") {
        notes.push(
          "You haven't seen a hearing benefit mentioned. That doesn't necessarily mean there isn't one — hearing benefits are sometimes buried under wellness extras. We'll look together at your benefit check."
        );
      } else {
        notes.push(
          "You're not sure whether your plan includes a hearing benefit — that's the most common answer, and exactly why the benefit check exists."
        );
      }
      break;

    case "private":
      copy = {
        outcome: "private",
        outcomeLabel: "Private insurance — what usually applies",
        headline: "Private plans vary a lot — your plan needs a real check.",
        bullets: [
          "Some private plans cover diagnostic hearing exams; far fewer cover hearing aids in full.",
          "Hearing-aid coverage, where it exists, often comes as a fixed allowance per ear, per a set number of years — and deductibles and in-network rules can change the math.",
          "A common pattern: the exam is covered but the devices aren't, or vice versa — almost never guessable from the plan name alone.",
        ],
        recommendedNextStep:
          "Book a benefit check. We'll verify your plan's hearing coverage — exams, hearing aids, allowances, and any network rules — before you pay for anything.",
      };
      break;

    case "employer":
      copy = {
        outcome: "employer",
        outcomeLabel: "Employer plan — what usually applies",
        headline: "Many employer plans include hearing coverage — check yours.",
        bullets: [
          "Many employer plans include some hearing coverage — a hearing exam, a hearing-aid allowance, or both — but it differs by employer and carrier.",
          "Your benefits portal or HR department is usually the fastest source of truth; some employers use a separate hearing-benefits administrator.",
          "If you've recently changed jobs or your plan renewed, the details may have changed — worth a fresh check.",
        ],
        recommendedNextStep:
          "Book a benefit check. We'll verify your employer's plan — what's covered, what the allowance looks like, and any network rules — before anything costs you a cent.",
      };
      break;

    case "va":
      copy = {
        outcome: "va",
        outcomeLabel: "VA health care — what usually applies",
        headline: "Eligible veterans often get hearing care covered by the VA.",
        bullets: [
          "The VA generally provides hearing aids and audiology care for eligible veterans — commonly at no cost, including follow-up care, batteries, and repairs.",
          "Eligibility depends on enrollment and service-connected factors; if you're not sure you're eligible, the VA can confirm it for you.",
          "Getting care at the VA doesn't stop you from being seen privately, too — some veterans use both.",
        ],
        recommendedNextStep:
          "Book a benefit check. We'll talk through your situation — including VA options and what private care costs look like — so you can choose what's best for you.",
      };
      break;

    case "medicaid":
      copy = {
        outcome: "medicaid",
        outcomeLabel: "Medicaid — what usually applies",
        headline: "Many Medicaid programs include hearing benefits — check your state's.",
        bullets: [
          "Many state Medicaid programs include hearing coverage — often including hearing aids for eligible beneficiaries — but the details differ by state.",
          "In California, Medi-Cal generally covers audiology services; some services may need authorization from your plan first.",
          "Your member handbook or member-services number can confirm the current rules for your plan.",
        ],
        recommendedNextStep:
          "Book a benefit check. We'll verify your plan's hearing coverage and any authorization requirements before anything costs you a cent.",
      };
      break;

    default:
      // "none"
      copy = {
        outcome: "none",
        outcomeLabel: "Self-pay — what usually applies",
        headline: "No insurance doesn't mean no options.",
        bullets: [
          "Many people pay for hearing care directly — and it's always worth getting a clear, itemized quote first.",
          "HSA or FSA funds can usually be used for hearing evaluations and hearing aids — that's real money you may already have set aside.",
          "Ask about payment plans and what's included in the price (follow-up care, adjustments, warranties) — the total cost of care matters more than the device price.",
        ],
        recommendedNextStep:
          "Book a benefit check anyway. It's free, we'll give you a clear written picture of the costs, and you'll know exactly what you'd pay before anything happens.",
      };
  }

  // HSA/FSA note — layered on every outcome where it's relevant.
  if (a.hsaFsa === "yes") {
    notes.push(HSA_FSA_NOTE);
  } else if (a.hsaFsa === "not-sure") {
    notes.push(
      "Not sure about an HSA or FSA? Check with your employer or bank — that money " +
        "can usually go toward hearing evaluations and hearing aids, and it's use-it-or-lose-it " +
        "on some plans."
    );
  }

  // Age note.
  if (a.age65plus) {
    notes.push(
      "Since you're 65 or older, make sure any Medicare information you have is current — plan benefits and costs are re-set every year."
    );
  }

  const summary =
    `Age 65+: ${a.age65plus ? "yes" : "no"}, ` +
    `coverage: ${COVERAGE_LABELS[a.coverageType]}, ` +
    `doctor referral: ${a.referral ? "yes" : "no"}, ` +
    `hearing benefit confirmed: ${a.benefitChecked}, ` +
    `HSA/FSA: ${a.hsaFsa}, ` +
    `looking for: ${LOOKING_FOR_LABELS[a.lookingFor].toLowerCase()}.`;

  return {
    outcome: copy.outcome,
    outcomeLabel: copy.outcomeLabel,
    headline: copy.headline,
    bullets: copy.bullets,
    recommendedNextStep: copy.recommendedNextStep,
    closing: CLOSING,
    notes,
    summary,
    answers: a,
    disclaimer: DISCLAIMER,
    clinicalReviewRequired:
      "Outcome copy above must be reviewed and approved by the practice (Au.D. / clinic director) before public patient use or App Directory submission.",
  };
}
